import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Param,
  Patch,
  ParseIntPipe,
  Delete,
  Put,
} from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-roles.guard';
import { CurrentUser } from '../auth/decorators/user.decorator';
import {
  CreateParticipantDto,
  RejectParticipantDto,
  UpdateParticipantDto,
} from './dto/participants.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Status } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('participants')
@UseGuards(JwtAuthGuard)
export class ParticipantsController {
  constructor(private readonly participantService: ParticipantsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CL)
  async createParticipant(
    @CurrentUser() user: any,
    @Body() body: CreateParticipantDto,
  ) {
    return this.participantService.createParticipant(
      user.userId as string,
      body,
    );
  }

  //getting participants
  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.CL)
  async getMyParticipants(@CurrentUser() user: any) {
    return this.participantService.getMyParticipants(user.userId as string);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAllParticipants(
    @Query('status') status?: Status,
    @Query('eventId') eventId?: string,
    @Query('search') search?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    return this.participantService.getAllParticipantsPaginated({
      status,
      eventId,
      search,
      page: +page,
      limit: +limit,
    });
  }

  @Get('event/:eventId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getParticipantsByEvent(@Param('eventId') eventId: string) {
    return this.participantService.getParticipantsByEvent(eventId);
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async approveParticipant(@Param('id', ParseIntPipe) id: number) {
    return this.participantService.approveParticipant(id);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async rejectParticipant(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectParticipantDto,
  ) {
    return this.participantService.rejectParticipant(id, body.rejectionReason);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CL)
  async deleteParticipant(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.participantService.deleteParticipant(id, user.userId as string);
    return { message: 'Participant deleted successfully' };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CL)
  async updateParticipant(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() data: UpdateParticipantDto,
  ) {
    return this.participantService.updateParticipant(
      id,
      user.userId as string,
      data,
    );
  }
}
