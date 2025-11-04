import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getSupabaseClient } from './config/supabase.config';
import { RegistrationType, Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateToken(
    accessToken: string,
    registrationType?: RegistrationType,
  ) {
    const { data, error } = await getSupabaseClient().auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid Supabase Token');
    }

    const supabaseUser = data.user;

    const isBlocked = await this.isUserBlocked(data.user.email!);
    if (isBlocked) {
      throw new UnauthorizedException(
        'Your account has been blocked. Please contact support.',
      );
    }

    let user = await this.prisma.user.findUnique({
      where: { email: supabaseUser.email },
      include: { profile: true },
    });

    if (!user) {
      const role = this.determineRole(registrationType);

      user = await this.prisma.user.create({
        data: {
          email: supabaseUser.email!,
          name:
            (supabaseUser.user_metadata.full_name as string) ||
            (supabaseUser.user_metadata?.name as string),
          role: role,
          registrationType: registrationType || null,
        },
        include: { profile: true },
      });
    } else {
      if (user.profile && registrationType) {
        throw new BadRequestException(
          'you have already registered. cannot register again',
        );
      }

      if (registrationType && !user.registrationType) {
        user = await this.prisma.user.update({
          where: { userId: user.userId },
          data: {
            registrationType,
          },
          include: { profile: true },
        });
      }
    }

    const token = this.jwtService.sign({
      sub: user.userId,
      email: user.email,
      role: user.role,
    });

    return { user, token };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('your account has been blocked.');
    }

    return user;
  }

  async getUserInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    return {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      registrationType: user.registrationType,
      isBlocked: user.isBlocked,
      profile: user.profile
        ? {
            id: user.profile.id,
            contact: user.profile.contact,
            collegeName: user.profile.collegeName,
            status: user.profile.status,
            createdAt: user.profile.createdAt,
          }
        : null,
    };
  }

  private determineRole(registrationType?: RegistrationType): Role {
    if (!registrationType) return Role.CL;

    switch (registrationType) {
      case RegistrationType.PRINCIPAL:
        return Role.PRNC;
      case RegistrationType.CONTINGENT:
        return Role.CL;
      default:
        return Role.CL;
    }
  }

  async canAccessDashboard(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { profile: true },
    });

    if (!user) return false;
    if (user.role === Role.ADMIN) return true;
    if (!user.profile) return false;

    return user.profile.status === 'APPROVED';
  }

  async blockUser(userId: string) {
    return this.prisma.user.update({
      where: { userId },
      data: { isBlocked: true },
    });
  }

  async unblockUser(userId: string) {
    return this.prisma.user.update({
      where: { userId },
      data: { isBlocked: false },
    });
  }

  async isUserBlocked(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { isBlocked: true },
    });

    return user?.isBlocked ?? false;
  }
}
