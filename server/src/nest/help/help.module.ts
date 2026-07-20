import { HelpController } from './help.controller';
import { Module } from '@nestjs/common';

/** /api/help — the bundled `wiki/` directory, read via wikiService. */
@Module({
  controllers: [HelpController],
})
export class HelpModule {}
