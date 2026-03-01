import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const pensionRules: AuditRule[] = [
  {
    id: 'GAAP-PEN-001',
    name: 'Pension Liability Unusual Balance',
    framework: 'GAAP',
    category: 'Pension and Retirement Benefits (ASC 715)',
    description: 'Identifies pension and retirement liability accounts with unusual or unexpected balances relative to company size and prior periods',
    citation: 'ASC 715-30-25-1: Recognition of net periodic pension cost and funded status',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const pensionKeywords = ['pension', 'retirement', 'defined benefit', 'post-retirement', 'postretirement', 'retiree'];

      // Find pension/retirement liability accounts
      const pensionLiabilityAccounts = data.accounts.filter(a =>
        a.accountType === 'liability' &&
        pensionKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      if (pensionLiabilityAccounts.length === 0) return findings;

      const totalPensionLiability = pensionLiabilityAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalPensionLiabilityBeginning = pensionLiabilityAccounts.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);

      // Get total assets for context
      const totalAssets = data.accounts
        .filter(a => a.accountType === 'asset')
        .reduce((sum, a) => sum + a.endingBalance, 0);

      // Check 1: Large change in pension liability (>20% change)
      if (totalPensionLiabilityBeginning > 0) {
        const changePct = (totalPensionLiability - totalPensionLiabilityBeginning) / totalPensionLiabilityBeginning;

        if (Math.abs(changePct) > 0.20 && Math.abs(totalPensionLiability - totalPensionLiabilityBeginning) > data.materialityThreshold * 0.25) {
          const direction = changePct > 0 ? 'increased' : 'decreased';
          const changeAmount = Math.abs(totalPensionLiability - totalPensionLiabilityBeginning);

          findings.push(createFinding(
            data.engagementId,
            'GAAP-PEN-001',
            'GAAP',
            'medium',
            `Significant ${changePct > 0 ? 'Increase' : 'Decrease'} in Pension Obligation`,
            `Pension/retirement liabilities ${direction} by ${(Math.abs(changePct) * 100).toFixed(1)}% ($${(changeAmount / 1000000).toFixed(2)}M) from $${(totalPensionLiabilityBeginning / 1000000).toFixed(2)}M to $${(totalPensionLiability / 1000000).toFixed(2)}M. ${changePct > 0 ? 'An increase may result from changes in discount rate assumptions, plan amendments, or actuarial losses. ' : 'A decrease may result from favorable actuarial experience, plan curtailments, settlements, or increased discount rates. '}Under ASC 715, the funded status of defined benefit plans must be recognized on the balance sheet, and significant changes require evaluation of the underlying actuarial assumptions and plan events.`,
            'ASC 715-30-25-1: An employer shall recognize the funded status of a benefit plan - measured as the difference between plan assets at fair value and the benefit obligation - in its statement of financial position.',
            'Obtain the actuarial valuation report and reconcile the change in pension obligation. Verify: (1) the discount rate and expected return on plan assets assumptions are reasonable, (2) any plan amendments or curtailments are properly reflected, (3) actuarial gains and losses are correctly recorded in other comprehensive income, (4) the components of net periodic pension cost are properly calculated and classified. Consider the need for an auditor\'s specialist.',
            changeAmount,
            pensionLiabilityAccounts.map(a => a.accountNumber)
          ));
        }
      }

      // Check 2: Pension liability is unusually large relative to total assets (>25%)
      if (totalAssets > 0 && totalPensionLiability / totalAssets > 0.25) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-PEN-001',
          'GAAP',
          'high',
          'Pension Obligation Represents Significant Portion of Total Assets',
          `Pension/retirement liabilities of $${(totalPensionLiability / 1000000).toFixed(2)}M represent ${((totalPensionLiability / totalAssets) * 100).toFixed(1)}% of total assets ($${(totalAssets / 1000000).toFixed(2)}M). A pension obligation of this magnitude creates significant financial risk and requires heightened audit attention to the actuarial assumptions, plan asset valuations, and funded status calculations. Small changes in discount rates or mortality assumptions could have a material impact on the financial statements.`,
          'ASC 715-30-35-36: The assumed discount rate shall reflect the rates at which the pension benefits could be effectively settled.',
          'Perform detailed testing of the pension obligation including: (1) evaluation of the actuary\'s qualifications and independence, (2) testing the census data provided to the actuary, (3) assessing the reasonableness of each significant assumption (discount rate, compensation increase rate, mortality table, expected return on plan assets), (4) verifying plan asset fair values with custodian statements. Consider engaging an auditor\'s specialist for assumption review.',
          totalPensionLiability,
          pensionLiabilityAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-PEN-002',
    name: 'Pension Expense Reasonableness',
    framework: 'GAAP',
    category: 'Pension and Retirement Benefits (ASC 715)',
    description: 'Evaluates whether pension expense appears reasonable in relation to the pension liability balance and general expectations',
    citation: 'ASC 715-30-35-4: Components of net periodic pension cost',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const pensionKeywords = ['pension', 'retirement', 'defined benefit', 'post-retirement', 'postretirement'];

      // Find pension expense accounts
      const pensionExpenseAccounts = data.accounts.filter(a =>
        a.accountType === 'expense' &&
        pensionKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      // Find pension liability accounts
      const pensionLiabilityAccounts = data.accounts.filter(a =>
        a.accountType === 'liability' &&
        pensionKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      const totalPensionExpense = pensionExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalPensionLiability = pensionLiabilityAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalPensionLiability > 0 && totalPensionExpense > 0) {
        const expenseToLiabilityRatio = totalPensionExpense / totalPensionLiability;

        // Net periodic pension cost typically ranges from 3-15% of the obligation
        // A ratio outside this range warrants investigation
        if (expenseToLiabilityRatio < 0.02 && totalPensionLiability > data.materialityThreshold) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-PEN-002',
            'GAAP',
            'medium',
            'Pension Expense Appears Low Relative to Obligation',
            `Pension expense of $${(totalPensionExpense / 1000).toFixed(0)}K represents only ${(expenseToLiabilityRatio * 100).toFixed(2)}% of the pension obligation of $${(totalPensionLiability / 1000000).toFixed(2)}M. This ratio is below the typical range of 3-15% for net periodic pension cost relative to the benefit obligation. A low ratio may indicate: (1) an unusually high expected return on plan assets offsetting service and interest cost, (2) incomplete recording of pension expense components, (3) a plan freeze reducing service cost to zero without adequate documentation, or (4) errors in the actuarial computation.`,
            'ASC 715-30-35-4: Net periodic pension cost shall include: service cost, interest cost, expected return on plan assets, amortization of prior service cost, and recognized actuarial gains or losses.',
            'Reconcile the components of net periodic pension cost with the actuarial report. Verify that all six components required by ASC 715-30-35-4 are included: (1) service cost, (2) interest cost, (3) expected return on plan assets, (4) amortization of prior service cost/credit, (5) amortization of net actuarial loss/gain, and (6) amortization of any transition obligation. Investigate why the total expense is low relative to the obligation.',
            null,
            [...pensionExpenseAccounts, ...pensionLiabilityAccounts].map(a => a.accountNumber)
          ));
        }

        if (expenseToLiabilityRatio > 0.20) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-PEN-002',
            'GAAP',
            'medium',
            'Pension Expense Appears High Relative to Obligation',
            `Pension expense of $${(totalPensionExpense / 1000).toFixed(0)}K represents ${(expenseToLiabilityRatio * 100).toFixed(1)}% of the pension obligation of $${(totalPensionLiability / 1000000).toFixed(2)}M, exceeding the typical range of 3-15%. An unusually high ratio may indicate: (1) significant actuarial losses being amortized from the corridor, (2) plan amendments resulting in large prior service cost amortization, (3) settlement or curtailment charges recognized during the period, (4) low or negative expected return on plan assets, or (5) a classification or calculation error.`,
            'ASC 715-30-35-4: Net periodic pension cost components must be properly measured and classified.',
            'Obtain a detailed breakdown of all net periodic pension cost components from the actuarial report. Verify the mathematical accuracy of each component. If settlement or curtailment charges are included, verify the triggering events and proper measurement. Assess whether the corridor approach for actuarial gain/loss amortization is being properly applied.',
            totalPensionExpense,
            [...pensionExpenseAccounts, ...pensionLiabilityAccounts].map(a => a.accountNumber)
          ));
        }
      }

      // Also check: pension liability exists but no pension expense recorded
      if (totalPensionLiability > data.materialityThreshold && totalPensionExpense === 0) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-PEN-002',
          'GAAP',
          'high',
          'Pension Liability Without Corresponding Expense',
          `A pension/retirement liability of $${(totalPensionLiability / 1000000).toFixed(2)}M is recorded but no pension expense has been recognized during the period. Under ASC 715, an entity with a defined benefit plan obligation must recognize net periodic pension cost in the income statement. The absence of pension expense may indicate: (1) the expense has been misclassified to another account, (2) pension cost was not recorded, or (3) the entity inappropriately netted pension income against the liability.`,
          'ASC 715-30-35-4: The following components of net periodic pension cost shall be included as a minimum: service cost, interest cost, expected return on plan assets, amortization of prior service cost, and recognized gains and losses.',
          'Investigate why no pension expense has been recorded. Obtain the actuarial report and verify that net periodic pension cost has been calculated and recorded. Check whether pension costs may have been classified under a different account name (e.g., employee benefits, compensation). If the plan is frozen, verify that interest cost and amortization components are still being recognized.',
          totalPensionLiability,
          pensionLiabilityAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
