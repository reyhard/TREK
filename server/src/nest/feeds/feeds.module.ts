import { FeedsPublicController, TripFeedTokenController, UserFeedTokenController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [FeedsPublicController, TripFeedTokenController, UserFeedTokenController],
  providers: [FeedsService],
})
export class FeedsModule {}
