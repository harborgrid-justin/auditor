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
import { nolRules } from './net-operating-loss';
import { corporateAmtRules } from './corporate-amt';
import { bonusDepreciationRules } from './bonus-depreciation';
import { rdAmortizationRules } from './rd-amortization';
import { qbiDeductionRules } from './qbi-deduction';
import { estimatedTaxRules } from './estimated-taxes';
import { charitableContributionRules } from './charitable-contributions';
import { likeKindExchangeRules } from './like-kind-exchanges';
import { excessBusinessLossRules } from './excess-business-loss';
import { penaltiesInterestRules } from './penalties-interest';
import { installmentSaleRules } from './installment-sales';
import { passiveActivityRules } from './passive-activity';

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
  ...nolRules,
  ...corporateAmtRules,
  ...bonusDepreciationRules,
  ...rdAmortizationRules,
  ...qbiDeductionRules,
  ...estimatedTaxRules,
  ...charitableContributionRules,
  ...likeKindExchangeRules,
  ...excessBusinessLossRules,
  ...penaltiesInterestRules,
  ...installmentSaleRules,
  ...passiveActivityRules,
];
