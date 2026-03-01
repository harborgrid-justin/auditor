/**
 * DoD FMR (7000.14-R) Rules Index
 *
 * Aggregates all DoD Financial Management Regulation audit rules
 * organized by volume. This is the 5th framework alongside
 * GAAP, IRS, SOX, and PCAOB.
 */

import type { AuditRule } from '@/types/findings';
import { generalFinancialManagementRules } from './vol01-general-financial-management';
import { budgetFormulationRules } from './vol02-budget-formulation';
import { budgetExecutionRules } from './vol03-budget-execution';
import { accountingPolicyRules } from './vol04-accounting-policy';
import { federalLeaseRules } from './vol04-federal-leases';
import { disbursingPolicyRules } from './vol05-disbursing-policy';
import { reportingPolicyRules } from './vol06-reporting-policy';
import { militaryPayRules } from './vol07-military-pay';
import { civilianPayRules } from './vol08-civilian-pay';
import { travelRules } from './vol09-travel';
import { contractPaymentRules } from './vol10-contract-payment';
import { reimbursableOperationsRules } from './vol11-reimbursable-operations';
import { specialAccountsRules } from './vol12-special-accounts';
import { nonappropriatedFundsRules } from './vol13-nonappropriated-funds';
import { antiDeficiencyActRules } from './vol14-anti-deficiency-act';
import { securityAssistanceRules } from './vol15-security-assistance';
import { debtManagementRules } from './vol16-debt-management';

export const dodFmrRules: AuditRule[] = [
  ...generalFinancialManagementRules,
  ...budgetFormulationRules,
  ...budgetExecutionRules,
  ...accountingPolicyRules,
  ...federalLeaseRules,
  ...disbursingPolicyRules,
  ...reportingPolicyRules,
  ...militaryPayRules,
  ...civilianPayRules,
  ...travelRules,
  ...contractPaymentRules,
  ...reimbursableOperationsRules,
  ...specialAccountsRules,
  ...nonappropriatedFundsRules,
  ...antiDeficiencyActRules,
  ...securityAssistanceRules,
  ...debtManagementRules,
];

/**
 * Returns DoD FMR rules filtered by fiscal year.
 *
 * Rules with an effectiveDate after the fiscal year end are excluded.
 * Rules with a sunsetDate before the fiscal year start are excluded.
 * This enables automatic activation/deactivation of rules based on
 * FASAB standard effective dates and legislative sunset provisions.
 *
 * @param fiscalYear - The fiscal year (e.g., 2027)
 */
export function getDodFmrRulesForFiscalYear(fiscalYear: number): AuditRule[] {
  const fyStart = new Date(`${fiscalYear - 1}-10-01`); // Federal FY starts Oct 1 of prior CY
  const fyEnd = new Date(`${fiscalYear}-09-30`);

  return dodFmrRules.filter(rule => {
    // If rule has an effectiveDate, it must be on or before the FY end
    if (rule.effectiveDate) {
      const effective = new Date(rule.effectiveDate);
      if (effective > fyEnd) return false;
    }

    // If rule has a sunsetDate, it must be on or after the FY start
    if (rule.sunsetDate) {
      const sunset = new Date(rule.sunsetDate);
      if (sunset < fyStart) return false;
    }

    return true;
  });
}
