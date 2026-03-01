/**
 * Data Retention & Archival Policy Engine
 *
 * Implements federal records retention requirements for DoD financial data.
 * NARA (National Archives and Records Administration) requires minimum
 * 6-year retention for financial records, with certain categories requiring
 * longer retention.
 *
 * References:
 *   - NARA GRS 1.1: Financial Management and Reporting Records
 *   - DoD Manual 4140.25: DoD Management of Energy Commodities
 *   - 44 U.S.C. Ch 33: Disposal of Records
 *   - DoD Directive 5015.02: DoD Records Management Program
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecordCategory =
  | 'financial_statement'
  | 'audit_workpaper'
  | 'appropriation_record'
  | 'obligation_record'
  | 'disbursement_record'
  | 'ada_violation'
  | 'payroll_record'
  | 'travel_record'
  | 'contract_record'
  | 'debt_record'
  | 'property_record'
  | 'consolidation_record'
  | 'correspondence'
  | 'general';

export interface RetentionRule {
  category: RecordCategory;
  retentionYears: number;
  naraSchedule: string;
  description: string;
  allowDestruction: boolean;
  requiresApproval: boolean;
}

export interface RetentionScheduleEntry {
  recordId: string;
  category: RecordCategory;
  createdAt: string;
  fiscalYear: number;
  retentionUntil: string;
  status: 'active' | 'archived' | 'pending_destruction' | 'legal_hold' | 'destroyed';
  legalHoldReason?: string;
  archivedAt?: string;
  destroyedAt?: string;
}

export interface RetentionActionResult {
  processed: number;
  archived: number;
  flaggedForDestruction: number;
  skippedLegalHold: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Retention Rules per NARA General Records Schedule
// ---------------------------------------------------------------------------

const RETENTION_RULES: RetentionRule[] = [
  {
    category: 'financial_statement',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/010',
    description: 'Financial statements and supporting documentation',
    allowDestruction: true,
    requiresApproval: true,
  },
  {
    category: 'audit_workpaper',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/011',
    description: 'Audit workpapers, findings, and corrective action plans',
    allowDestruction: true,
    requiresApproval: true,
  },
  {
    category: 'appropriation_record',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/020',
    description: 'Appropriation warrants, apportionments, allotments',
    allowDestruction: true,
    requiresApproval: true,
  },
  {
    category: 'obligation_record',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/030',
    description: 'Obligation documents and supporting records',
    allowDestruction: true,
    requiresApproval: false,
  },
  {
    category: 'disbursement_record',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/040',
    description: 'Disbursement vouchers and payment records',
    allowDestruction: true,
    requiresApproval: false,
  },
  {
    category: 'ada_violation',
    retentionYears: 10,
    naraSchedule: 'GRS 1.1/021',
    description: 'Anti-Deficiency Act violation records — extended retention',
    allowDestruction: true,
    requiresApproval: true,
  },
  {
    category: 'payroll_record',
    retentionYears: 6,
    naraSchedule: 'GRS 2.4/050',
    description: 'Military and civilian payroll records',
    allowDestruction: true,
    requiresApproval: false,
  },
  {
    category: 'travel_record',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/050',
    description: 'Travel authorizations, vouchers, and settlements',
    allowDestruction: true,
    requiresApproval: false,
  },
  {
    category: 'contract_record',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/060',
    description: 'Contract files, modifications, and payment records',
    allowDestruction: true,
    requiresApproval: true,
  },
  {
    category: 'debt_record',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/070',
    description: 'Debt collection and write-off records',
    allowDestruction: true,
    requiresApproval: true,
  },
  {
    category: 'property_record',
    retentionYears: 6,
    naraSchedule: 'GRS 5.4/010',
    description: 'Property accountability and disposal records',
    allowDestruction: true,
    requiresApproval: true,
  },
  {
    category: 'consolidation_record',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/012',
    description: 'Consolidation elimination entries and IGT reconciliation',
    allowDestruction: true,
    requiresApproval: false,
  },
  {
    category: 'correspondence',
    retentionYears: 3,
    naraSchedule: 'GRS 5.1/010',
    description: 'General administrative correspondence',
    allowDestruction: true,
    requiresApproval: false,
  },
  {
    category: 'general',
    retentionYears: 6,
    naraSchedule: 'GRS 1.1/001',
    description: 'General financial records not elsewhere classified',
    allowDestruction: true,
    requiresApproval: false,
  },
];

// ---------------------------------------------------------------------------
// In-Memory State (production: use DB tables)
// ---------------------------------------------------------------------------

const retentionEntries = new Map<string, RetentionScheduleEntry>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the retention rule for a record category.
 */
export function getRetentionRule(category: RecordCategory): RetentionRule {
  return RETENTION_RULES.find(r => r.category === category) ?? RETENTION_RULES[RETENTION_RULES.length - 1];
}

/**
 * Get the full retention schedule (all rules).
 */
export function getRetentionSchedule(): RetentionRule[] {
  return [...RETENTION_RULES];
}

/**
 * Calculate the retention-until date for a record.
 */
export function calculateRetentionDate(
  category: RecordCategory,
  fiscalYear: number,
): string {
  const rule = getRetentionRule(category);
  // Retention measured from end of fiscal year (Sept 30)
  const fyEnd = new Date(`${fiscalYear}-09-30`);
  fyEnd.setFullYear(fyEnd.getFullYear() + rule.retentionYears);
  return fyEnd.toISOString().split('T')[0];
}

/**
 * Register a record for retention tracking.
 */
export function registerRecord(params: {
  recordId: string;
  category: RecordCategory;
  fiscalYear: number;
  createdAt?: string;
}): RetentionScheduleEntry {
  const entry: RetentionScheduleEntry = {
    recordId: params.recordId,
    category: params.category,
    createdAt: params.createdAt ?? new Date().toISOString(),
    fiscalYear: params.fiscalYear,
    retentionUntil: calculateRetentionDate(params.category, params.fiscalYear),
    status: 'active',
  };

  retentionEntries.set(params.recordId, entry);
  return entry;
}

/**
 * Place a record on legal hold (prevents destruction).
 */
export function placeLegalHold(recordId: string, reason: string): RetentionScheduleEntry {
  const entry = retentionEntries.get(recordId);
  if (!entry) throw new Error(`Record not found: ${recordId}`);

  entry.status = 'legal_hold';
  entry.legalHoldReason = reason;
  retentionEntries.set(recordId, entry);
  return entry;
}

/**
 * Release a legal hold on a record.
 */
export function releaseLegalHold(recordId: string): RetentionScheduleEntry {
  const entry = retentionEntries.get(recordId);
  if (!entry) throw new Error(`Record not found: ${recordId}`);
  if (entry.status !== 'legal_hold') throw new Error(`Record is not on legal hold`);

  // Return to active or check if past retention
  const now = new Date();
  entry.status = new Date(entry.retentionUntil) < now ? 'pending_destruction' : 'active';
  entry.legalHoldReason = undefined;
  retentionEntries.set(recordId, entry);
  return entry;
}

/**
 * Archive an engagement and all its records.
 */
export function archiveEngagement(
  engagementId: string,
  recordIds: string[],
): { archived: number; skipped: number } {
  let archived = 0;
  let skipped = 0;

  for (const id of recordIds) {
    const entry = retentionEntries.get(id);
    if (!entry) {
      skipped++;
      continue;
    }

    if (entry.status === 'legal_hold') {
      skipped++;
      continue;
    }

    entry.status = 'archived';
    entry.archivedAt = new Date().toISOString();
    retentionEntries.set(id, entry);
    archived++;
  }

  return { archived, skipped };
}

/**
 * Apply retention policy — flag records past their retention date
 * for destruction (respecting legal holds).
 */
export function applyRetentionPolicy(): RetentionActionResult {
  const now = new Date();
  const result: RetentionActionResult = {
    processed: 0,
    archived: 0,
    flaggedForDestruction: 0,
    skippedLegalHold: 0,
    errors: [],
  };

  for (const [id, entry] of Array.from(retentionEntries.entries())) {
    result.processed++;

    if (entry.status === 'destroyed') continue;

    if (entry.status === 'legal_hold') {
      result.skippedLegalHold++;
      continue;
    }

    const retentionDate = new Date(entry.retentionUntil);
    if (retentionDate < now) {
      const rule = getRetentionRule(entry.category);
      if (rule.allowDestruction) {
        entry.status = 'pending_destruction';
        retentionEntries.set(id, entry);
        result.flaggedForDestruction++;
      }
    }
  }

  return result;
}

/**
 * Purge records that have been flagged for destruction.
 * Returns IDs of destroyed records.
 */
export function purgeExpiredRecords(
  requireApproval = true,
): { destroyed: string[]; requiresApproval: string[] } {
  const destroyed: string[] = [];
  const requiresApprovalList: string[] = [];

  for (const [id, entry] of Array.from(retentionEntries.entries())) {
    if (entry.status !== 'pending_destruction') continue;

    const rule = getRetentionRule(entry.category);
    if (requireApproval && rule.requiresApproval) {
      requiresApprovalList.push(id);
      continue;
    }

    entry.status = 'destroyed';
    entry.destroyedAt = new Date().toISOString();
    retentionEntries.set(id, entry);
    destroyed.push(id);
  }

  return { destroyed, requiresApproval: requiresApprovalList };
}
