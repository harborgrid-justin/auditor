import type { AuditRule } from '@/types/findings';
import { fraudRiskRules } from './fraud-risk';
import { icfrRules } from './icfr';
import { materialityRules } from './materiality';
import { relatedPartyRules } from './related-party';

export const pcaobRules: AuditRule[] = [
  ...fraudRiskRules,
  ...icfrRules,
  ...materialityRules,
  ...relatedPartyRules,
];
