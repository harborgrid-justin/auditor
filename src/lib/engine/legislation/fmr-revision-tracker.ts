/**
 * FMR Revision Tracker
 *
 * Tracks DoD FMR chapter revision dates and maps revised chapters
 * to affected audit rules. Generates alerts when rules may be outdated
 * relative to FMR updates published by the Comptroller.
 *
 * The DoD Comptroller periodically revises individual FMR chapters.
 * This tracker stores revision history and allows the system to warn
 * when a rule's last-verified revision date is older than the latest
 * chapter revision.
 *
 * References:
 *   - DoD 7000.14-R: Department of Defense Financial Management Regulation
 *   - https://comptroller.defense.gov/FMR/
 */

import type { FMRRevision } from '@/types/tax-compliance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FMRRevisionAlert {
  volumeNumber: number;
  chapterNumber: number;
  revisionDate: string;
  changeDescription: string;
  affectedRuleIds: string[];
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface FMRRevisionStatus {
  totalRevisions: number;
  latestRevisionDate: string;
  alerts: FMRRevisionAlert[];
  revisionsByVolume: Record<number, FMRRevision[]>;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const revisions: FMRRevision[] = [
  // Volume 1 — General Financial Management Information
  { volumeNumber: 1, chapterNumber: 1, revisionDate: '2024-10-01', changeDescription: 'Updated financial improvement requirements', affectedRuleIds: ['DOD-FMR-V01-001'] },

  // Volume 2 — Budget Formulation
  { volumeNumber: 2, chapterNumber: 1, revisionDate: '2024-08-15', changeDescription: 'Updated budget submission timeline per OMB A-11 FY2025', affectedRuleIds: ['DOD-FMR-V02-001', 'DOD-FMR-V02-002'] },

  // Volume 3 — Budget Execution
  { volumeNumber: 3, chapterNumber: 8, revisionDate: '2024-06-01', changeDescription: 'Revised obligation review thresholds and ULO aging requirements', affectedRuleIds: ['DOD-FMR-V03-007', 'DOD-FMR-V03-008'] },
  { volumeNumber: 3, chapterNumber: 14, revisionDate: '2024-09-01', changeDescription: 'Updated continuing resolution execution guidance', affectedRuleIds: ['DOD-FMR-V03-006'] },

  // Volume 4 — Accounting Policy
  { volumeNumber: 4, chapterNumber: 5, revisionDate: '2024-07-01', changeDescription: 'Updated FBWT reconciliation procedures', affectedRuleIds: ['DOD-FMR-V04-001'] },
  { volumeNumber: 4, chapterNumber: 6, revisionDate: '2025-01-15', changeDescription: 'Updated PP&E capitalization guidance and SFFAS 54 preparation', affectedRuleIds: ['DOD-FMR-V04-LEASE-001', 'DOD-FMR-V04-LEASE-002'] },
  { volumeNumber: 4, chapterNumber: 13, revisionDate: '2024-11-01', changeDescription: 'Revised environmental liability estimation methodology', affectedRuleIds: [] },

  // Volume 5 — Disbursing Policy
  { volumeNumber: 5, chapterNumber: 9, revisionDate: '2024-05-15', changeDescription: 'Updated Prompt Payment Act interest rate calculations', affectedRuleIds: ['DOD-DISB-001', 'DOD-DISB-002'] },

  // Volume 6 — Reporting
  { volumeNumber: 6, chapterNumber: 4, revisionDate: '2024-12-01', changeDescription: 'Updated financial statement presentation per OMB A-136 FY2025', affectedRuleIds: ['DOD-FMR-V06-001', 'DOD-FMR-V06-006'] },

  // Volume 7 — Military Pay
  { volumeNumber: 7, chapterNumber: 3, revisionDate: '2025-01-01', changeDescription: 'Updated military pay tables per NDAA FY2025 (4.5% increase)', affectedRuleIds: ['DOD-MILPAY-001'] },

  // Volume 10 — Contract Payment
  { volumeNumber: 10, chapterNumber: 1, revisionDate: '2024-10-01', changeDescription: 'Updated acquisition thresholds per FAR/DFARS', affectedRuleIds: ['DOD-FMR-V10-001'] },

  // Volume 14 — ADA
  { volumeNumber: 14, chapterNumber: 3, revisionDate: '2024-08-01', changeDescription: 'Updated ADA violation reporting procedures', affectedRuleIds: ['DOD-FMR-V14-001'] },

  // Volume 16 — Debt Management
  { volumeNumber: 16, chapterNumber: 1, revisionDate: '2025-02-01', changeDescription: 'Updated debt referral thresholds and Treasury coordination requirements', affectedRuleIds: ['DOD-FMR-V16-001', 'DOD-FMR-V16-003'] },
  { volumeNumber: 16, chapterNumber: 3, revisionDate: '2025-02-01', changeDescription: 'Updated compromise authority delegation and DOJ referral procedures', affectedRuleIds: ['DOD-FMR-V16-005'] },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all tracked FMR revisions.
 */
export function getAllRevisions(): FMRRevision[] {
  return [...revisions];
}

/**
 * Get revisions for a specific volume.
 */
export function getRevisionsByVolume(volumeNumber: number): FMRRevision[] {
  return revisions.filter(r => r.volumeNumber === volumeNumber);
}

/**
 * Get revisions since a given date (for detecting changes since last review).
 */
export function getRevisionsSince(sinceDate: string): FMRRevision[] {
  const since = new Date(sinceDate);
  return revisions.filter(r => new Date(r.revisionDate) > since);
}

/**
 * Generate alerts for rules that may be affected by recent FMR revisions.
 *
 * @param ruleLastVerifiedDate - When the rules were last verified against the FMR
 * @returns Alerts for any revisions newer than the verification date
 */
export function generateRevisionAlerts(ruleLastVerifiedDate: string): FMRRevisionAlert[] {
  const recentRevisions = getRevisionsSince(ruleLastVerifiedDate);
  return recentRevisions.map(rev => ({
    volumeNumber: rev.volumeNumber,
    chapterNumber: rev.chapterNumber,
    revisionDate: rev.revisionDate,
    changeDescription: rev.changeDescription,
    affectedRuleIds: rev.affectedRuleIds,
    severity: rev.affectedRuleIds.length > 2 ? 'high' : rev.affectedRuleIds.length > 0 ? 'medium' : 'low',
    message: `DoD FMR Vol ${rev.volumeNumber}, Ch ${rev.chapterNumber} revised on ${rev.revisionDate}: ` +
      `${rev.changeDescription}. ${rev.affectedRuleIds.length} rule(s) may need review: ` +
      `${rev.affectedRuleIds.join(', ') || 'none directly mapped'}.`,
  }));
}

/**
 * Get full revision status summary.
 */
export function getRevisionStatus(): FMRRevisionStatus {
  const sorted = [...revisions].sort(
    (a, b) => new Date(b.revisionDate).getTime() - new Date(a.revisionDate).getTime()
  );

  const revisionsByVolume: Record<number, FMRRevision[]> = {};
  for (const rev of revisions) {
    if (!revisionsByVolume[rev.volumeNumber]) {
      revisionsByVolume[rev.volumeNumber] = [];
    }
    revisionsByVolume[rev.volumeNumber].push(rev);
  }

  return {
    totalRevisions: revisions.length,
    latestRevisionDate: sorted[0]?.revisionDate ?? '',
    alerts: [],
    revisionsByVolume,
  };
}

/**
 * Register a new FMR revision (e.g., when the Comptroller publishes an update).
 */
export function registerRevision(revision: FMRRevision): void {
  revisions.push(revision);
}
