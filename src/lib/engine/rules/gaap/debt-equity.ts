import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const debtEquityRules: AuditRule[] = [
  {
    id: 'GAAP-DE-001',
    name: 'High Debt-to-Equity Ratio',
    framework: 'GAAP',
    category: 'Debt and Equity (ASC 470/480)',
    description: 'Identifies entities with debt-to-equity ratios exceeding 3.0, which may indicate financial distress and going concern risk',
    citation: 'ASC 470-10-45: Debt classification and presentation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const debtAccounts = data.accounts.filter(a =>
        a.subType === 'short_term_debt' || a.subType === 'long_term_debt'
      );
      const equityAccounts = data.accounts.filter(a => a.accountType === 'equity');

      const totalDebt = debtAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalEquity = equityAccounts.reduce((sum, a) => sum + a.endingBalance, 0);

      if (totalEquity > 0 && totalDebt > 0) {
        const debtToEquityRatio = totalDebt / totalEquity;

        if (debtToEquityRatio > 3.0) {
          // Assess additional risk factors
          const riskFactors: string[] = [];

          // Check interest coverage
          const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
          if (incomeStatement) {
            const fsData = incomeStatement.data;
            const operatingIncome = fsData.operatingIncome ?? fsData.operating_income ?? 0;
            const interestExpense = fsData.interestExpense ?? fsData.interest_expense ?? 0;
            if (interestExpense > 0) {
              const interestCoverage = operatingIncome / interestExpense;
              if (interestCoverage < 2.0) {
                riskFactors.push(`Interest coverage ratio is only ${interestCoverage.toFixed(1)}x, below the typical 2.0x minimum covenant threshold`);
              }
            }
          }

          // Check current portion vs cash
          const currentDebt = data.accounts
            .filter(a => a.subType === 'short_term_debt')
            .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
          const cash = data.accounts
            .filter(a => a.subType === 'cash')
            .reduce((sum, a) => sum + a.endingBalance, 0);
          if (currentDebt > cash) {
            riskFactors.push(`Current debt maturities ($${(currentDebt / 1000000).toFixed(1)}M) exceed available cash ($${(cash / 1000000).toFixed(1)}M)`);
          }

          // Check if equity is negative
          if (totalEquity < 0) {
            riskFactors.push('Stockholders\' equity is negative, which is a strong indicator of financial distress');
          }

          findings.push(createFinding(
            data.engagementId,
            'GAAP-DE-001',
            'GAAP',
            'high',
            'Debt-to-Equity Ratio Exceeds 3.0x Threshold',
            `The debt-to-equity ratio is ${debtToEquityRatio.toFixed(2)}x (total debt of $${(totalDebt / 1000000).toFixed(2)}M against equity of $${(totalEquity / 1000000).toFixed(2)}M), exceeding the 3.0x threshold. High leverage significantly increases financial risk and may trigger debt covenant violations. ${riskFactors.length > 0 ? 'Additional risk factors identified: ' + riskFactors.join('. ') + '.' : ''} The auditor should evaluate going concern implications under ASC 205-40.`,
            'ASC 470-10-45-1: Debt shall be classified as current or noncurrent. ASC 205-40-50: Going concern evaluation requirements.',
            'Obtain and review all debt agreements and covenant compliance certificates. Verify debt classification as current vs. noncurrent. Assess the entity\'s ability to refinance or repay maturing obligations. Evaluate whether going concern disclosures are warranted under ASC 205-40. Consider whether any debt should be reclassified to current due to covenant violations.',
            totalDebt,
            debtAccounts.map(a => a.accountNumber)
          ));
        }
      } else if (totalEquity <= 0 && totalDebt > 0) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-DE-001',
          'GAAP',
          'critical',
          'Negative Stockholders\' Equity with Outstanding Debt',
          `The entity has negative stockholders' equity of $${(totalEquity / 1000000).toFixed(2)}M while carrying total debt of $${(totalDebt / 1000000).toFixed(2)}M. This indicates the entity's liabilities exceed its assets, creating a technically insolvent position. This is a significant going concern indicator requiring careful evaluation of management's plans and disclosure under ASC 205-40.`,
          'ASC 205-40-50-1: Going concern evaluation and disclosure requirements.',
          'Evaluate management\'s plans for addressing the capital deficiency. Assess the entity\'s ability to continue as a going concern for at least 12 months. Review debt agreements for default triggers. Consider the need for a going concern paragraph in the audit report.',
          Math.abs(totalEquity),
          [...debtAccounts, ...equityAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-DE-002',
    name: 'Debt Covenant Violation Risk Indicators',
    framework: 'GAAP',
    category: 'Debt and Equity (ASC 470/480)',
    description: 'Identifies common financial ratio thresholds that often appear in debt covenants and may indicate violation risk',
    citation: 'ASC 470-10-45-11: Subjective acceleration clauses and covenant violations',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const violationIndicators: string[] = [];

      // Calculate common covenant ratios
      const currentAssets = data.accounts
        .filter(a => a.accountType === 'asset' && ['cash', 'accounts_receivable', 'inventory', 'prepaid'].includes(a.subType || ''))
        .reduce((sum, a) => sum + a.endingBalance, 0);
      const currentLiabilities = data.accounts
        .filter(a => a.accountType === 'liability' && ['accounts_payable', 'accrued_liabilities', 'short_term_debt', 'deferred_revenue'].includes(a.subType || ''))
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // 1) Current ratio < 1.0
      if (currentLiabilities > 0) {
        const currentRatio = currentAssets / currentLiabilities;
        if (currentRatio < 1.0) {
          violationIndicators.push(`Current ratio of ${currentRatio.toFixed(2)}x is below 1.0 (current assets $${(currentAssets / 1000000).toFixed(1)}M vs. current liabilities $${(currentLiabilities / 1000000).toFixed(1)}M)`);
        }
      }

      // 2) Interest coverage ratio < 2.0
      const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
      const cashFlowStatement = data.financialStatements.find(fs => fs.statementType === 'CF');

      if (incomeStatement) {
        const fsData = incomeStatement.data;
        const operatingIncome = fsData.operatingIncome ?? fsData.operating_income ?? 0;
        const interestExpense = fsData.interestExpense ?? fsData.interest_expense ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const depreciation = fsData.depreciation ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const amortization = fsData.amortization ?? 0;

        if (interestExpense > 0) {
          const interestCoverage = operatingIncome / interestExpense;
          if (interestCoverage < 2.0) {
            violationIndicators.push(`Interest coverage ratio of ${interestCoverage.toFixed(2)}x is below the common 2.0x covenant minimum`);
          }
        }

        // 3) Fixed charge coverage
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const totalDebt = data.accounts
          .filter(a => a.subType === 'short_term_debt' || a.subType === 'long_term_debt')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const totalEquity = data.accounts
          .filter(a => a.accountType === 'equity')
          .reduce((sum, a) => sum + a.endingBalance, 0);

        // 4) Minimum net worth / tangible net worth
        const intangibles = data.accounts
          .filter(a => a.subType === 'intangible')
          .reduce((sum, a) => sum + a.endingBalance, 0);
        const tangibleNetWorth = totalEquity - intangibles;

        if (tangibleNetWorth < 0) {
          violationIndicators.push(`Tangible net worth is negative ($${(tangibleNetWorth / 1000000).toFixed(2)}M) after excluding intangible assets of $${(intangibles / 1000000).toFixed(1)}M from equity of $${(totalEquity / 1000000).toFixed(1)}M`);
        }
      }

      // 5) Debt service coverage from cash flows
      if (cashFlowStatement) {
        const cfData = cashFlowStatement.data;
        const operatingCF = cfData.operatingCashFlow ?? cfData.operating_cash_flow ?? 0;
        const debtRepayment = Math.abs(cfData.debtRepayment ?? cfData.debt_repayment ?? 0);
        const interestPaid = data.accounts
          .filter(a => a.subType === 'interest_expense')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

        if (debtRepayment + interestPaid > 0) {
          const dscr = operatingCF / (debtRepayment + interestPaid);
          if (dscr < 1.2) {
            violationIndicators.push(`Debt service coverage ratio of ${dscr.toFixed(2)}x is below the common 1.2x covenant minimum (operating cash flow $${(operatingCF / 1000000).toFixed(1)}M vs. debt service $${((debtRepayment + interestPaid) / 1000000).toFixed(1)}M)`);
          }
        }
      }

      if (violationIndicators.length >= 2) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-DE-002',
          'GAAP',
          'high',
          'Multiple Debt Covenant Violation Risk Indicators Detected',
          `${violationIndicators.length} common financial covenant thresholds are in potential violation: ${violationIndicators.join('; ')}. Multiple covenant breaches significantly increase the risk that lenders may accelerate repayment or impose restrictive amendments. Under ASC 470-10-45-11, if a covenant violation exists at the balance sheet date, the debt may need to be reclassified as current unless a waiver has been obtained.`,
          'ASC 470-10-45-11: Debt shall be classified as current if a covenant violation exists at the balance sheet date and the debt is callable within one year.',
          'Obtain all debt agreements and identify applicable financial covenants. Calculate actual ratios per the covenant definitions (which may differ from GAAP). Determine if waivers have been obtained. If violations exist, assess whether long-term debt must be reclassified as current and evaluate going concern implications.',
          null,
          data.accounts.filter(a => a.subType === 'short_term_debt' || a.subType === 'long_term_debt').map(a => a.accountNumber)
        ));
      } else if (violationIndicators.length === 1) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-DE-002',
          'GAAP',
          'medium',
          'Potential Debt Covenant Violation Risk',
          `A common financial covenant threshold appears to be at risk: ${violationIndicators[0]}. While a single indicator may not constitute a violation, it warrants review of actual debt covenants to assess compliance and determine whether disclosure is needed.`,
          'ASC 470-10-45-11: Debt classification requirements related to covenant compliance.',
          'Review the specific covenant terms in the debt agreement. Calculate the actual ratio using the covenant-defined methodology. If the entity is in violation, determine whether a waiver has been obtained and evaluate the impact on debt classification.',
          null,
          data.accounts.filter(a => a.subType === 'short_term_debt' || a.subType === 'long_term_debt').map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
