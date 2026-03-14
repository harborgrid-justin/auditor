import { Injectable, Logger } from '@nestjs/common';

/**
 * Legislation Ingestion Processor
 *
 * Handles automated scanning of configured parameter ingestion sources
 * for legislative and regulatory changes. Runs periodic checks across
 * all configured sources (Federal Register, Treasury, GSA, OPM, IRS)
 * and reports detected parameter changes for review and activation.
 *
 * In production with BullMQ:
 * @Processor('legislation-ingestion')
 */
@Injectable()
export class LegislationIngestionProcessor {
  private readonly logger = new Logger(LegislationIngestionProcessor.name);

  /**
   * Run ingestion checks across all configured parameter sources.
   *
   * Iterates through each configured ParameterIngestionSource, checks
   * whether a scan is due based on the source's check frequency, and
   * runs the ingestion check for due sources. Returns a summary of
   * all checks performed and any parameter changes detected.
   */
  async process(): Promise<{
    status: 'completed' | 'failed';
    sourcesChecked: number;
    totalSources: number;
    changesDetected: number;
    validationErrors: number;
    results: Array<{
      sourceName: string;
      sourceType: string;
      checkedAt: string;
      changesDetected: boolean;
      newParameterCount: number;
      validationErrorCount: number;
    }>;
    executionTimeMs: number;
  }> {
    this.logger.log('Starting legislation ingestion scan across all configured sources');
    const startTime = Date.now();

    try {
      const {
        INGESTION_SOURCES,
        runIngestionCheck,
        getIngestionSchedule,
      } = await import('@shared/lib/engine/legislation/parameter-ingestion');

      const schedule = getIngestionSchedule();
      const results: Array<{
        sourceName: string;
        sourceType: string;
        checkedAt: string;
        changesDetected: boolean;
        newParameterCount: number;
        validationErrorCount: number;
      }> = [];

      let totalChanges = 0;
      let totalValidationErrors = 0;
      let sourcesChecked = 0;

      for (const entry of schedule) {
        const now = new Date();
        const nextCheck = new Date(entry.nextCheck);

        // Only check sources that are due
        if (entry.lastChecked && now < nextCheck) {
          this.logger.debug(
            `Skipping '${entry.source.name}' — next check at ${entry.nextCheck}`,
          );
          continue;
        }

        this.logger.log(`Checking source: ${entry.source.name} (${entry.source.sourceType})`);

        try {
          const result = runIngestionCheck(entry.source);
          sourcesChecked++;

          if (result.changesDetected) {
            totalChanges += result.newParameters.length;
            this.logger.warn(
              `Changes detected from '${entry.source.name}': ` +
              `${result.newParameters.length} parameter(s) need attention`,
            );
          }

          if (result.validationErrors.length > 0) {
            totalValidationErrors += result.validationErrors.length;
            this.logger.warn(
              `Validation warnings from '${entry.source.name}': ` +
              result.validationErrors.join('; '),
            );
          }

          results.push({
            sourceName: entry.source.name,
            sourceType: entry.source.sourceType,
            checkedAt: result.checkedAt,
            changesDetected: result.changesDetected,
            newParameterCount: result.newParameters.length,
            validationErrorCount: result.validationErrors.length,
          });
        } catch (sourceError: any) {
          this.logger.error(
            `Failed to check source '${entry.source.name}': ${sourceError.message}`,
          );
          results.push({
            sourceName: entry.source.name,
            sourceType: entry.source.sourceType,
            checkedAt: new Date().toISOString(),
            changesDetected: false,
            newParameterCount: 0,
            validationErrorCount: 1,
          });
          totalValidationErrors++;
        }
      }

      const executionTimeMs = Date.now() - startTime;

      this.logger.log(
        `Legislation ingestion scan complete: ${sourcesChecked}/${INGESTION_SOURCES.length} sources checked, ` +
        `${totalChanges} changes detected, ${totalValidationErrors} validation issues`,
      );

      return {
        status: 'completed',
        sourcesChecked,
        totalSources: INGESTION_SOURCES.length,
        changesDetected: totalChanges,
        validationErrors: totalValidationErrors,
        results,
        executionTimeMs,
      };
    } catch (error: any) {
      this.logger.error(`Legislation ingestion scan failed: ${error.message}`);
      return {
        status: 'failed',
        sourcesChecked: 0,
        totalSources: 0,
        changesDetected: 0,
        validationErrors: 1,
        results: [],
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}
