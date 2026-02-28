import type { AuditRule } from '@/types/findings';
import { segregationOfDutiesRules } from './segregation-of-duties';
import { journalEntryControlRules } from './journal-entry-controls';
import { financialCloseRules } from './financial-close';
import { itgcRules } from './itgc';
import { managementReviewRules } from './management-review';

export const soxRules: AuditRule[] = [
  ...segregationOfDutiesRules,
  ...journalEntryControlRules,
  ...financialCloseRules,
  ...itgcRules,
  ...managementReviewRules,
];
