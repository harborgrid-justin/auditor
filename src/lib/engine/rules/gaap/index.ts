import type { AuditRule } from '@/types/findings';
import { revenueRecognitionRules } from './revenue-recognition';
import { leaseAccountingRules } from './lease-accounting';
import { inventoryRules } from './inventory';
import { fairValueRules } from './fair-value';
import { impairmentRules } from './impairment';
import { incomeTaxProvisionRules } from './income-tax-provision';
import { financialStatementCheckRules } from './financial-statement-checks';
import { debtEquityRules } from './debt-equity';
import { contingencyRules } from './contingencies';
import { stockCompensationRules } from './stock-compensation';
import { businessCombinationsRules } from './business-combinations';
import { consolidationRules } from './consolidation';
import { pensionRules } from './pension';
import { segmentReportingRules } from './segment-reporting';
import { subsequentEventsRules } from './subsequent-events';

export const gaapRules: AuditRule[] = [
  ...revenueRecognitionRules,
  ...leaseAccountingRules,
  ...inventoryRules,
  ...fairValueRules,
  ...impairmentRules,
  ...incomeTaxProvisionRules,
  ...financialStatementCheckRules,
  ...debtEquityRules,
  ...contingencyRules,
  ...stockCompensationRules,
  ...businessCombinationsRules,
  ...consolidationRules,
  ...pensionRules,
  ...segmentReportingRules,
  ...subsequentEventsRules,
];
