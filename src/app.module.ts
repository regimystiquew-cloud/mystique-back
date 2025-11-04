import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ProfileService } from './profile/profile.service';
import { ProfileModule } from './profile/profile.module';
import { PrismaService } from './auth/prisma.service';
import { EventsService } from './events/events.service';
import { EventsController } from './events/events.controller';
import { EventsModule } from './events/events.module';
import { ParticipantsModule } from './participants/participants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
    ProfileModule,
    EventsModule,
    ParticipantsModule
  ],
  controllers: [AppController, EventsController],
  providers: [AppService, ProfileService, PrismaService, EventsService],
})
export class AppModule {}
