import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-roles.guard';
import { CurrentUser } from './decorators/user.decorator';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ValidateTokenDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('validate')
  async validateToken(@Body() body: ValidateTokenDto, @Res() res: Response) {
    try {
      const { user, token } = await this.authService.validateToken(
        body.access_token,
        body.registration_type,
      );

      res.cookie('access_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        partitioned: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.status(HttpStatus.OK).json({
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name,
          role: user.role,
          registrationType: user.registrationType,
          profile: user.profile
            ? {
                status: user.profile.status,
                collegeName: user.profile.collegeName,
              }
            : null,
        },
      });
    } catch (error) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        message: `you are unauthorized: ${error}`,
      });
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: User) {
    return this.authService.getUserInfo(user.userId);
  }

  @Get('can-access-dashboard')
  @UseGuards(JwtAuthGuard)
  async canAccessDashboard(@CurrentUser() user: User) {
    const canAccess = await this.authService.canAccessDashboard(user.userId);

    return { canAccess };
  }

  //clearing auth cookie
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      path: '/',
    });

    return {
      message: 'Logged out successfully',
    };
  }

  //admin blocking user access
  @Post('block-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async blockUser(@Body('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    await this.authService.blockUser(userId);
    return { message: 'User blocked successfully' };
  }

  //unblocking access
  @Post('unblock-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async unblockUser(@Body('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    await this.authService.unblockUser(userId);
    return { message: 'User unblocked successfully' };
  }
}
