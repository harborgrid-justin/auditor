import { Module } from '@nestjs/common';
import { LegislationController } from './legislation.controller';
import { LegislationService } from './legislation.service';

@Module({
  controllers: [LegislationController],
  providers: [LegislationService],
  exports: [LegislationService],
})
export class LegislationModule {}
