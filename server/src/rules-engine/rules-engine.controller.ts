import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RulesEngineService } from './rules-engine.service';

@ApiTags('analysis')
@ApiBearerAuth()
@Controller('api/analyze')
export class RulesEngineController {
  constructor(private readonly rulesEngineService: RulesEngineService) {}

  @Post('dod-fmr')
  @ApiOperation({ summary: 'Run DoD FMR compliance analysis on engagement data' })
  async analyzeDoDFmr(@Body() body: { engagementId: string }) {
    // In production, this would load engagement data from the database.
    // For now, the body should contain the full engagement data structure.
    return this.rulesEngineService.runDoDFmrRules(body);
  }

  @Post('all')
  @ApiOperation({ summary: 'Run all framework analyses (GAAP, IRS, SOX, PCAOB, DoD FMR)' })
  async analyzeAll(@Body() body: { engagementId: string }) {
    return this.rulesEngineService.runAllRules(body);
  }
}
