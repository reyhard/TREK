import { CollectionsAddonGuard } from './collections-addon.guard';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService, CollectionsAddonGuard],
})
export class CollectionsModule {}
