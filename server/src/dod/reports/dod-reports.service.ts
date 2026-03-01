import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module';

@Injectable()
export class DodReportsService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async generateSf133(engagementId: string, fiscalYear: number, period?: string) {
    const { appropriations, dodObligations, dodDisbursements } = await import('@shared/lib/db/pg-schema');

    // Fetch all appropriations for this engagement
    const allAppropriations = await this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.engagementId, engagementId));

    // Fetch obligations for this engagement and fiscal year
    const obligations = await this.db
      .select()
      .from(dodObligations)
      .where(
        and(
          eq(dodObligations.engagementId, engagementId),
          eq(dodObligations.fiscalYear, fiscalYear),
        ),
      );

    // Fetch disbursements for this engagement
    const disbursements = await this.db
      .select()
      .from(dodDisbursements)
      .where(eq(dodDisbursements.engagementId, engagementId));

    // Attempt to use the shared SF-133 report generator
    try {
      const sf133Report = await import('@shared/lib/reports/federal/sf133-report');
      if (sf133Report && typeof sf133Report.generateSf133 === 'function') {
        return sf133Report.generateSf133({
          engagementId,
          fiscalYear,
          period: period || 'annual',
          appropriations: allAppropriations,
          obligations,
          disbursements,
        });
      }
    } catch {
      // SF-133 report generator not available; fall back to manual calculation
    }

    // SF-133 Section 1: Budgetary Resources
    const totalBudgetaryResources = allAppropriations.reduce(
      (sum: number, a: any) => sum + a.totalAuthority, 0,
    );
    const totalApportioned = allAppropriations.reduce(
      (sum: number, a: any) => sum + a.apportioned, 0,
    );

    // SF-133 Section 2: Status of Budgetary Resources
    const totalObligationsIncurred = obligations.reduce(
      (sum: number, o: any) => sum + o.amount, 0,
    );
    const totalUnobligatedBalance = allAppropriations.reduce(
      (sum: number, a: any) => sum + a.unobligatedBalance, 0,
    );
    const totalApportionedUnobligated = allAppropriations.reduce(
      (sum: number, a: any) => sum + (a.apportioned - a.obligated), 0,
    );

    // SF-133 Section 3: Outlays
    const totalDisbursementsAmount = disbursements.reduce(
      (sum: number, d: any) => sum + d.amount, 0,
    );
    const totalCollections = 0;
    const netOutlays = totalDisbursementsAmount - totalCollections;

    // Build per-appropriation detail lines
    const lineItems = allAppropriations.map((approp: any) => {
      const appropObligations = obligations.filter((o: any) => o.appropriationId === approp.id);
      const obligationTotal = appropObligations.reduce((sum: number, o: any) => sum + o.amount, 0);

      return {
        treasuryAccountSymbol: approp.treasuryAccountSymbol,
        appropriationTitle: approp.appropriationTitle,
        budgetCategory: approp.budgetCategory,
        totalAuthority: approp.totalAuthority,
        apportioned: approp.apportioned,
        allotted: approp.allotted,
        obligationsIncurred: obligationTotal,
        unobligatedBalance: approp.unobligatedBalance,
        disbursed: approp.disbursed,
        status: approp.status,
      };
    });

    return {
      report: 'SF-133',
      title: 'Report on Budget Execution and Budgetary Resources',
      engagementId,
      fiscalYear,
      period: period || 'annual',
      generatedAt: new Date().toISOString(),
      section1_budgetaryResources: {
        totalBudgetaryResources,
        appropriationsReceived: totalBudgetaryResources,
        apportioned: totalApportioned,
      },
      section2_statusOfBudgetaryResources: {
        obligationsIncurred: totalObligationsIncurred,
        unobligatedBalance: {
          apportioned: totalApportionedUnobligated,
          unapportioned: totalUnobligatedBalance - totalApportionedUnobligated,
          total: totalUnobligatedBalance,
        },
        totalStatus: totalObligationsIncurred + totalUnobligatedBalance,
      },
      section3_outlays: {
        grossDisbursements: totalDisbursementsAmount,
        offsettingCollections: totalCollections,
        netOutlays,
      },
      lineItems,
    };
  }

  async generateGtas(engagementId: string, fiscalYear: number, period?: string) {
    const { appropriations, dodObligations, dodDisbursements, ussglAccounts } =
      await import('@shared/lib/db/pg-schema');

    // Fetch USSGL accounts for trial balance data
    const accounts = await this.db
      .select()
      .from(ussglAccounts)
      .where(
        and(
          eq(ussglAccounts.engagementId, engagementId),
          eq(ussglAccounts.fiscalYear, fiscalYear),
        ),
      );

    // Fetch appropriations
    const allAppropriations = await this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.engagementId, engagementId));

    // Fetch obligations
    const obligations = await this.db
      .select()
      .from(dodObligations)
      .where(
        and(
          eq(dodObligations.engagementId, engagementId),
          eq(dodObligations.fiscalYear, fiscalYear),
        ),
      );

    // Fetch disbursements
    const disbursements = await this.db
      .select()
      .from(dodDisbursements)
      .where(eq(dodDisbursements.engagementId, engagementId));

    // Attempt to use the shared GTAS report generator
    try {
      const gtasReport = await import('@shared/lib/reports/federal/gtas-report');
      if (gtasReport && typeof gtasReport.generateGtas === 'function') {
        return gtasReport.generateGtas({
          engagementId,
          fiscalYear,
          period: period || 'annual',
          appropriations: allAppropriations,
          obligations,
          disbursements,
          ussglAccounts: accounts,
        });
      }
    } catch {
      // GTAS report generator not available; fall back to manual calculation
    }

    // Compute trial balance from USSGL accounts
    let totalDebits = 0;
    let totalCredits = 0;
    const budgetaryAccounts: any[] = [];
    const proprietaryAccounts: any[] = [];

    for (const account of accounts) {
      if (account.normalBalance === 'debit') {
        totalDebits += account.endBalance;
      } else {
        totalCredits += account.endBalance;
      }

      if (account.accountType === 'budgetary') {
        budgetaryAccounts.push(account);
      } else {
        proprietaryAccounts.push(account);
      }
    }

    const totalBudgetaryResources = allAppropriations.reduce(
      (sum: number, a: any) => sum + a.totalAuthority, 0,
    );
    const totalObligationsIncurred = obligations.reduce(
      (sum: number, o: any) => sum + o.amount, 0,
    );
    const totalDisbursementsAmount = disbursements.reduce(
      (sum: number, d: any) => sum + d.amount, 0,
    );

    return {
      report: 'GTAS',
      title: 'Governmentwide Treasury Account Symbol Adjusted Trial Balance System',
      engagementId,
      fiscalYear,
      period: period || 'annual',
      generatedAt: new Date().toISOString(),
      trialBalance: {
        totalDebits,
        totalCredits,
        difference: totalDebits - totalCredits,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      },
      budgetaryAccounts: {
        accounts: budgetaryAccounts,
        count: budgetaryAccounts.length,
      },
      proprietaryAccounts: {
        accounts: proprietaryAccounts,
        count: proprietaryAccounts.length,
      },
      summaryTotals: {
        totalBudgetaryResources,
        obligationsIncurred: totalObligationsIncurred,
        grossOutlays: totalDisbursementsAmount,
        netOutlays: totalDisbursementsAmount,
      },
      treasuryAccountSymbols: allAppropriations.map((a: any) => ({
        symbol: a.treasuryAccountSymbol,
        title: a.appropriationTitle,
        totalAuthority: a.totalAuthority,
        obligated: a.obligated,
        disbursed: a.disbursed,
      })),
    };
  }
}
