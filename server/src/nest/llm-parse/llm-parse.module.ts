import { LlmLocalController } from './llm-local.controller';
import { LlmLocalService } from './llm-local.service';
import { LlmParseService } from './llm-parse.service';
import { Module } from '@nestjs/common';

/** Provides the LLM booking-import fallback; imported by BookingImportModule. */
@Module({
  controllers: [LlmLocalController],
  providers: [LlmParseService, LlmLocalService],
  exports: [LlmParseService],
})
export class LlmParseModule {}
