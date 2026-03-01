import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { DodAnalysisProcessor } from './processors/dod-analysis.processor';
import { LegislationSyncProcessor } from './processors/legislation-sync.processor';

@Module({
  controllers: [JobsController],
  providers: [JobsService, DodAnalysisProcessor, LegislationSyncProcessor],
  exports: [JobsService],
})
export class JobsModule {}
