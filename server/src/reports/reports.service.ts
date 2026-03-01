import { Injectable, Logger } from '@nestjs/common';

/**
 * Reports Service
 *
 * Wraps the shared federal report generators and provides them as NestJS
 * injectable services. Reuses existing report logic without duplication.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  /**
   * Generate SF-133 Report on Budget Execution and Budgetary Resources.
   */
  async generateSF133(params: {
    appropriations: any[];
    obligations: any[];
    disbursements: any[];
    fiscalYear: number;
    period: string;
  }) {
    const { generateSF133Report } = await import('@shared/lib/reports/federal/sf133-report');
    this.logger.log(`Generating SF-133 for FY${params.fiscalYear} period ${params.period}`);
    return generateSF133Report(params.appropriations, params.obligations, params.disbursements);
  }

  /**
   * Generate GTAS (Governmentwide Treasury Account Symbol) Report.
   */
  async generateGTAS(params: {
    ussglAccounts: any[];
    appropriations: any[];
    fiscalYear: number;
    period: string;
  }) {
    const { generateGTASReport } = await import('@shared/lib/reports/federal/gtas-report');
    this.logger.log(`Generating GTAS for FY${params.fiscalYear} period ${params.period}`);
    return generateGTASReport(params.ussglAccounts, params.appropriations, params.fiscalYear, params.period);
  }

  /**
   * Generate Federal Financial Statements (Balance Sheet, Statement of Net Cost,
   * Statement of Changes in Net Position, Statement of Budgetary Resources).
   */
  async generateFederalFinancialStatements(dodData: any) {
    const { generateFederalFinancialStatements } = await import('@shared/lib/reports/federal/federal-financial-statements');
    this.logger.log('Generating Federal Financial Statements');
    return generateFederalFinancialStatements(dodData);
  }

  /**
   * Generate Federal Audit Opinion with ADA compliance statement.
   */
  async generateFederalAuditOpinion(opinionData: any) {
    const { generateFederalAuditOpinion } = await import('@shared/lib/reports/federal/federal-audit-opinion');
    this.logger.log('Generating Federal Audit Opinion');
    return generateFederalAuditOpinion(opinionData);
  }
}
