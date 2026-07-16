import { LlmParseModule } from '../llm-parse/llm-parse.module';
import { BookingImportController } from './booking-import.controller';
import { BookingImportService } from './booking-import.service';
import { FeaturesController } from './features.controller';
import { ImportJobsService } from './import-jobs.service';
import { KitineraryExtractorService } from './kitinerary-extractor.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [LlmParseModule],
  controllers: [BookingImportController, FeaturesController],
  providers: [BookingImportService, KitineraryExtractorService, ImportJobsService],
})
export class BookingImportModule {}
