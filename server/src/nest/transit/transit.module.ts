import { TransitController } from './transit.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TransitController],
  providers: [],
})
export class TransitModule {}
