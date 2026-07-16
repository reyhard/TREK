import { PluginsModule } from '../plugins/plugins.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [PluginsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
