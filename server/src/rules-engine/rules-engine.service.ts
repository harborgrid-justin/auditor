import { Injectable, Logger } from '@nestjs/common';

/**
 * Rules Engine Service
 *
 * Wraps the existing shared rule runner from src/lib/engine/rule-runner.ts
 * and provides it as a NestJS injectable service. Supports running rules
 * for specific frameworks or all frameworks at once.
 */
@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);

  /**
   * Run all DoD FMR rules against engagement data.
   * Imports the shared rule engine to avoid code duplication.
   */
  async runDoDFmrRules(engagementData: any) {
    const { runDoDFmrAnalysis } = await import('@shared/lib/engine/rule-runner');
    this.logger.log(`Running DoD FMR analysis for engagement ${engagementData.engagementId}`);
    const startTime = Date.now();
    const result = runDoDFmrAnalysis(engagementData);
    this.logger.log(`DoD FMR analysis completed in ${Date.now() - startTime}ms: ${result.totalFindings} findings`);
    return result;
  }

  /**
   * Run all framework rules (GAAP, IRS, SOX, PCAOB, DOD_FMR).
   */
  async runAllRules(engagementData: any) {
    const { runAllAnalyses } = await import('@shared/lib/engine/rule-runner');
    this.logger.log(`Running all analyses for engagement ${engagementData.engagementId}`);
    const startTime = Date.now();
    const results = runAllAnalyses(engagementData);
    this.logger.log(`All analyses completed in ${Date.now() - startTime}ms`);
    return results;
  }
}
