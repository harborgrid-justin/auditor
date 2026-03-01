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

export const dodFmrRules: AuditRule[] = [
  ...generalFinancialManagementRules,
  ...budgetFormulationRules,
  ...budgetExecutionRules,
  ...accountingPolicyRules,
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
];
