import { HelpController } from './help.controller';
import { Module } from '@nestjs/common';

/** /api/help — embedded GitHub wiki (fetched + cached in wikiService). */
@Module({
  controllers: [HelpController],
})
export class HelpModule {}
