import { RateLimitService } from '../auth/rate-limit.service';
import { TripInviteLinkController, TripInviteController } from './trip-invite.controller';
import { TripInviteService } from './trip-invite.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TripInviteLinkController, TripInviteController],
  providers: [TripInviteService, RateLimitService],
})
export class TripInviteModule {}
