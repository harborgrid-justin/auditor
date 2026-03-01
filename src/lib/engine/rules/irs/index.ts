import type { AuditRule } from '@/types/findings';
import { incomeMatchingRules } from './income-matching';
import { deductionLimitRules } from './deduction-limits';
import { depreciationRules } from './depreciation';
import { scheduleMRules } from './schedule-m';
import { relatedPartyRules } from './related-party';
import { rdCreditRules } from './r-and-d-credit';
import { transferPricingRules } from './transfer-pricing';
import { internationalTaxRules } from './international-tax';
import { stateLocalTaxRules } from './state-local';

export const irsRules: AuditRule[] = [
  ...incomeMatchingRules,
  ...deductionLimitRules,
  ...depreciationRules,
  ...scheduleMRules,
  ...relatedPartyRules,
  ...rdCreditRules,
  ...transferPricingRules,
  ...internationalTaxRules,
  ...stateLocalTaxRules,
];
