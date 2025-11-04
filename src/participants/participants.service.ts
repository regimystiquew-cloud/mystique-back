import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../auth/prisma.service';
import {
  CreateParticipantDto,
  UpdateParticipantDto,
} from './dto/participants.dto';
import { Status } from '@prisma/client';

@Injectable()
export class ParticipantsService {
  constructor(private readonly prisma: PrismaService) {}

  async createParticipant(clId: string, data: CreateParticipantDto) {
    const event = await this.prisma.event.findUnique({
      where: { eventId: data.eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!event.isActive || event.isLocked) {
      throw new BadRequestException('Event is not accepting registrations');
    }

    const existingParticipant = await this.prisma.participant.findUnique({
      where: {
        email_eventId: {
          email: data.email,
          eventId: data.eventId,
        },
      },
    });

    if (existingParticipant) {
      throw new BadRequestException(
        'This email is already registered for this event',
      );
    }

    return this.prisma.participant.create({
      data: {
        ...data,
        clId,
        status: Status.PENDING,
      },
      include: {
        cl: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
        event: {
          select: {
            eventId: true,
            name: true,
            category: true,
          },
        },
      },
    });
  }

  //participants for that particular CL
  async getMyParticipants(clId: string) {
    return this.prisma.participant.findMany({
      where: { clId },
      include: {
        event: {
          select: {
            eventId: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  //for admin
  async getParticipantsByEvent(eventId: string) {
    return this.prisma.participant.findMany({
      where: { eventId },
      include: {
        cl: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  //for admin
  async getAllParticipants(filters?: {
    status?: Status;
    eventId?: string;
    search?: string;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.eventId) {
      where.eventId = filters.eventId;
    }

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { contact: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.participant.findMany({
      where,
      include: {
        cl: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
        event: {
          select: {
            eventId: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  //for admin with pagination
  async getAllParticipantsPaginated(filters: {
    status?: Status;
    eventId?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const { page, limit, ...otherFilters } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (otherFilters?.status) {
      where.status = otherFilters.status;
    }

    if (otherFilters?.eventId) {
      where.eventId = otherFilters.eventId;
    }

    if (otherFilters?.search) {
      where.OR = [
        { name: { contains: otherFilters.search, mode: 'insensitive' } },
        { email: { contains: otherFilters.search, mode: 'insensitive' } },
        { contact: { contains: otherFilters.search, mode: 'insensitive' } },
      ];
    }

    const [participants, total] = await Promise.all([
      this.prisma.participant.findMany({
        where,
        include: {
          cl: {
            select: {
              userId: true,
              name: true,
              email: true,
            },
          },
          event: {
            select: {
              eventId: true,
              name: true,
              category: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.participant.count({ where }),
    ]);

    return {
      data: participants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approveParticipant(id: number) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.status === Status.APPROVED) {
      throw new BadRequestException('Participant already approved');
    }

    if (participant.event.filledSlots >= participant.event.maxSlots) {
      throw new BadRequestException('Event is full');
    }

    //here transaction added -> to approve participant and also update filled slots
    await this.prisma.$transaction([
      this.prisma.participant.update({
        where: { id },
        data: {
          status: Status.APPROVED,
          submittedAt: new Date(),
        },
      }),
      this.prisma.event.update({
        where: { eventId: participant.eventId },
        data: {
          filledSlots: { increment: 1 },
        },
      }),
    ]);

    return { message: 'Participant approved successfully' };
  }

  async rejectParticipant(id: number, rejectionReason?: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    // if was approved -> decrement by 1 to reject a approved one

    if (participant.status === Status.APPROVED) {
      await this.prisma.$transaction([
        this.prisma.event.update({
          where: { eventId: participant.eventId },
          data: {
            filledSlots: { decrement: 1 },
          },
        }),

        this.prisma.participant.update({
          where: { id },
          data: {
            status: Status.REJECTED,
            rejectionReason: rejectionReason || null,
          },
        }),
      ]);
    } else {
      await this.prisma.participant.update({
        where: { id },
        data: {
          status: Status.REJECTED,
          rejectionReason: rejectionReason || null,
        },
      });
    }

    return { message: 'Participant rejected', reason: rejectionReason };
  }

  async updateParticipant(
    id: number,
    clId: string,
    data: UpdateParticipantDto,
  ) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    //ownership check
    if (participant.clId !== clId) {
      throw new ForbiddenException('You can only update your own participants');
    }

    if (participant.status === Status.APPROVED) {
      return await this.prisma
        .$transaction([
          this.prisma.event.update({
            where: { eventId: participant.eventId },
            data: {
              filledSlots: { decrement: 1 },
            },
          }),

          this.prisma.participant.update({
            where: { id },
            data: {
              ...data,
              status: Status.PENDING,
            },
          }),
        ])
        .then((results) => results[1]);
    }

    return this.prisma.participant.update({
      where: { id },
      data,
    });
  }

  async deleteParticipant(id: number, clId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.clId !== clId) {
      throw new ForbiddenException('You can only delete your own participants');
    }

    if (participant.status !== Status.PENDING) {
      throw new BadRequestException('Cannot delete approved participants');
    }

    return this.prisma.participant.delete({
      where: { id },
    });
  }
}
