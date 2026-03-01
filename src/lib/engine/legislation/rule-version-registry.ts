/**
 * Rule Version Registry
 *
 * Database-backed rule version store that supports time-aware rule resolution.
 * Every audit rule, parameter, and compliance check can have multiple versions
 * with explicit effective and sunset dates, enabling the system to automatically
 * apply the correct rule version for any point in time.
 *
 * Key capabilities:
 *   - `getActiveRule(ruleId, asOfDate)` — resolves the correct version for any date
 *   - `getUpcomingChanges(ruleId)` — shows scheduled future versions
 *   - Rule conflict detection when overlapping effective dates exist
 *   - Full audit trail of all rule changes with legislation linkage
 *
 * This is the foundation for the dynamic legislative change engine. All other
 * modules (pay tables, thresholds, compliance checks) depend on this registry
 * to resolve the correct rule version based on fiscal year and legislation.
 *
 * References:
 *   - DoD 7000.14-R (Financial Management Regulation)
 *   - National Defense Authorization Act (annual)
 *   - FASAB Statement of Federal Financial Accounting Standards
 *   - OMB Circulars A-11, A-123, A-136
 */

import type { RuleVersion, FMRRevision } from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for registering a new rule version */
export interface RuleVersionInput {
  ruleId: string;
  version: number;
  contentJson: string;
  effectiveDate: string;
  sunsetDate?: string;
  changedBy: string;
  changeReason: string;
  legislationId?: string;
}

/** Result of a conflict check */
export interface RuleConflict {
  ruleId: string;
  existingVersion: RuleVersion;
  newVersion: RuleVersionInput;
  overlapStart: string;
  overlapEnd: string;
  message: string;
}

/** Summary of rule version history for a single rule */
export interface RuleVersionHistory {
  ruleId: string;
  totalVersions: number;
  activeVersion: RuleVersion | null;
  upcomingVersions: RuleVersion[];
  expiredVersions: RuleVersion[];
  hasConflicts: boolean;
  conflicts: RuleConflict[];
}

/** Registry-wide statistics */
export interface RegistryStats {
  totalRules: number;
  totalVersions: number;
  activeVersions: number;
  upcomingVersions: number;
  expiredVersions: number;
  conflictCount: number;
  legislationIds: string[];
}

/** Upcoming change alert */
export interface UpcomingChangeAlert {
  ruleId: string;
  currentVersion: RuleVersion | null;
  upcomingVersion: RuleVersion;
  effectiveDate: string;
  daysUntilEffective: number;
  legislationId?: string;
  changeReason: string;
}

// ---------------------------------------------------------------------------
// In-memory store (production would use DB via Drizzle ORM)
// ---------------------------------------------------------------------------

const ruleVersionStore: RuleVersion[] = [];

// ---------------------------------------------------------------------------
// Core Registry Functions
// ---------------------------------------------------------------------------

/**
 * Register a new rule version in the registry.
 *
 * Validates that the version does not conflict with existing versions
 * (overlapping effective date ranges for the same rule). If a conflict
 * is detected, returns the conflict details without registering.
 *
 * @param input - The rule version to register
 * @returns The registered RuleVersion, or null if conflicts exist
 */
export function registerRuleVersion(
  input: RuleVersionInput
): { version: RuleVersion | null; conflicts: RuleConflict[] } {
  const conflicts = detectConflicts(input);

  if (conflicts.length > 0) {
    return { version: null, conflicts };
  }

  const ruleVersion: RuleVersion = {
    id: uuid(),
    ruleId: input.ruleId,
    version: input.version,
    contentJson: input.contentJson,
    effectiveDate: input.effectiveDate,
    sunsetDate: input.sunsetDate,
    changedBy: input.changedBy,
    changeReason: input.changeReason,
    legislationId: input.legislationId,
    createdAt: new Date().toISOString(),
  };

  ruleVersionStore.push(ruleVersion);
  return { version: ruleVersion, conflicts: [] };
}

/**
 * Resolve the active rule version for a given rule ID and date.
 *
 * Finds the version whose effective date is on or before `asOfDate`
 * and whose sunset date (if any) is after `asOfDate`. If multiple
 * versions match, returns the one with the latest effective date.
 *
 * @param ruleId - The rule identifier
 * @param asOfDate - The point-in-time to resolve for (ISO date string)
 * @returns The active RuleVersion, or null if none found
 */
export function getActiveRule(ruleId: string, asOfDate: string): RuleVersion | null {
  const asOf = new Date(asOfDate);

  const candidates = ruleVersionStore.filter((rv) => {
    if (rv.ruleId !== ruleId) return false;
    const effective = new Date(rv.effectiveDate);
    if (effective > asOf) return false;
    if (rv.sunsetDate) {
      const sunset = new Date(rv.sunsetDate);
      if (sunset <= asOf) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  // Return the version with the latest effective date
  candidates.sort(
    (a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
  );

  return candidates[0];
}

/**
 * Get all upcoming (future) versions for a rule that haven't taken effect yet.
 *
 * @param ruleId - The rule identifier
 * @param asOfDate - Optional reference date (defaults to now)
 * @returns Array of upcoming RuleVersions sorted by effective date
 */
export function getUpcomingChanges(ruleId: string, asOfDate?: string): RuleVersion[] {
  const asOf = new Date(asOfDate || new Date().toISOString());

  return ruleVersionStore
    .filter((rv) => rv.ruleId === ruleId && new Date(rv.effectiveDate) > asOf)
    .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());
}

/**
 * Get the complete version history for a rule.
 *
 * @param ruleId - The rule identifier
 * @param asOfDate - Optional reference date for determining active/upcoming/expired
 * @returns Full version history with conflict analysis
 */
export function getRuleVersionHistory(ruleId: string, asOfDate?: string): RuleVersionHistory {
  const asOf = asOfDate || new Date().toISOString();
  const asOfDt = new Date(asOf);
  const versions = ruleVersionStore.filter((rv) => rv.ruleId === ruleId);

  const activeVersion = getActiveRule(ruleId, asOf);
  const upcomingVersions = getUpcomingChanges(ruleId, asOf);
  const expiredVersions = versions.filter((rv) => {
    if (rv.sunsetDate && new Date(rv.sunsetDate) <= asOfDt) return true;
    return false;
  });

  // Check for conflicts among all versions
  const conflicts: RuleConflict[] = [];
  for (let i = 0; i < versions.length; i++) {
    for (let j = i + 1; j < versions.length; j++) {
      const conflict = checkOverlap(versions[i], versions[j]);
      if (conflict) conflicts.push(conflict);
    }
  }

  return {
    ruleId,
    totalVersions: versions.length,
    activeVersion,
    upcomingVersions,
    expiredVersions,
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Get all rule IDs registered in the store.
 */
export function getAllRuleIds(): string[] {
  const ids = new Set(ruleVersionStore.map((rv) => rv.ruleId));
  return Array.from(ids);
}

/**
 * Get all versions for a given rule.
 */
export function getAllVersionsForRule(ruleId: string): RuleVersion[] {
  return ruleVersionStore
    .filter((rv) => rv.ruleId === ruleId)
    .sort((a, b) => a.version - b.version);
}

/**
 * Generate upcoming change alerts for all rules within a given horizon.
 *
 * @param daysAhead - How many days ahead to look for upcoming changes
 * @param asOfDate - Optional reference date (defaults to now)
 * @returns Array of alerts for rules with upcoming version changes
 */
export function generateUpcomingChangeAlerts(
  daysAhead: number = 90,
  asOfDate?: string
): UpcomingChangeAlert[] {
  const asOf = new Date(asOfDate || new Date().toISOString());
  const horizon = new Date(asOf.getTime() + daysAhead * 86_400_000);
  const alerts: UpcomingChangeAlert[] = [];

  const ruleIds = getAllRuleIds();
  for (const ruleId of ruleIds) {
    const upcoming = ruleVersionStore.filter((rv) => {
      if (rv.ruleId !== ruleId) return false;
      const effective = new Date(rv.effectiveDate);
      return effective > asOf && effective <= horizon;
    });

    for (const upcomingVersion of upcoming) {
      const currentVersion = getActiveRule(ruleId, asOfDate || asOf.toISOString());
      const effectiveDt = new Date(upcomingVersion.effectiveDate);
      const daysUntil = Math.ceil(
        (effectiveDt.getTime() - asOf.getTime()) / 86_400_000
      );

      alerts.push({
        ruleId,
        currentVersion,
        upcomingVersion,
        effectiveDate: upcomingVersion.effectiveDate,
        daysUntilEffective: daysUntil,
        legislationId: upcomingVersion.legislationId,
        changeReason: upcomingVersion.changeReason,
      });
    }
  }

  return alerts.sort((a, b) => a.daysUntilEffective - b.daysUntilEffective);
}

/**
 * Get registry-wide statistics.
 */
export function getRegistryStats(asOfDate?: string): RegistryStats {
  const asOf = asOfDate || new Date().toISOString();
  const asOfDt = new Date(asOf);
  const ruleIds = getAllRuleIds();

  let activeCount = 0;
  let upcomingCount = 0;
  let expiredCount = 0;
  let conflictCount = 0;
  const legislationIds = new Set<string>();

  for (const rv of ruleVersionStore) {
    if (rv.legislationId) legislationIds.add(rv.legislationId);

    const effective = new Date(rv.effectiveDate);
    const sunset = rv.sunsetDate ? new Date(rv.sunsetDate) : null;

    if (effective > asOfDt) {
      upcomingCount++;
    } else if (sunset && sunset <= asOfDt) {
      expiredCount++;
    } else {
      activeCount++;
    }
  }

  for (const ruleId of ruleIds) {
    const history = getRuleVersionHistory(ruleId, asOf);
    conflictCount += history.conflicts.length;
  }

  return {
    totalRules: ruleIds.length,
    totalVersions: ruleVersionStore.length,
    activeVersions: activeCount,
    upcomingVersions: upcomingCount,
    expiredVersions: expiredCount,
    conflictCount,
    legislationIds: Array.from(legislationIds),
  };
}

/**
 * Sunset a rule version by setting its sunset date.
 *
 * @param ruleVersionId - The ID of the rule version to sunset
 * @param sunsetDate - The date the version should cease to be active
 * @returns true if the version was found and updated
 */
export function sunsetRuleVersion(ruleVersionId: string, sunsetDate: string): boolean {
  const rv = ruleVersionStore.find((r) => r.id === ruleVersionId);
  if (!rv) return false;
  rv.sunsetDate = sunsetDate;
  return true;
}

/**
 * Bulk register rule versions from an FMR revision.
 *
 * When the DoD Comptroller publishes a revised FMR chapter, this function
 * creates new rule versions for all affected rules referenced in the revision.
 *
 * @param revision - The FMR revision record
 * @param contentUpdates - Map of ruleId -> updated content JSON
 * @param changedBy - User or system that ingested the revision
 * @returns Results for each rule version registration
 */
export function registerVersionsFromRevision(
  revision: FMRRevision,
  contentUpdates: Record<string, string>,
  changedBy: string
): Array<{ ruleId: string; version: RuleVersion | null; conflicts: RuleConflict[] }> {
  const results: Array<{ ruleId: string; version: RuleVersion | null; conflicts: RuleConflict[] }> = [];

  for (const ruleId of revision.affectedRuleIds) {
    const existingVersions = getAllVersionsForRule(ruleId);
    const nextVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map((v) => v.version)) + 1
      : 1;

    const content = contentUpdates[ruleId] || '{}';

    // Sunset the currently active version at the revision date
    const currentActive = getActiveRule(ruleId, revision.revisionDate);
    if (currentActive && !currentActive.sunsetDate) {
      sunsetRuleVersion(currentActive.id, revision.revisionDate);
    }

    const result = registerRuleVersion({
      ruleId,
      version: nextVersion,
      contentJson: content,
      effectiveDate: revision.revisionDate,
      changedBy,
      changeReason: `FMR Vol ${revision.volumeNumber}, Ch ${revision.chapterNumber} revision: ${revision.changeDescription}`,
      legislationId: `FMR_V${revision.volumeNumber}_CH${revision.chapterNumber}_${revision.revisionDate}`,
    });

    results.push({ ruleId, ...result });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

/**
 * Detect conflicts between a new rule version input and existing versions.
 */
function detectConflicts(input: RuleVersionInput): RuleConflict[] {
  const existing = ruleVersionStore.filter((rv) => rv.ruleId === input.ruleId);
  const conflicts: RuleConflict[] = [];

  for (const rv of existing) {
    const conflict = checkOverlapWithInput(rv, input);
    if (conflict) conflicts.push(conflict);
  }

  return conflicts;
}

/**
 * Check if two registered rule versions have overlapping effective periods.
 */
function checkOverlap(a: RuleVersion, b: RuleVersion): RuleConflict | null {
  if (a.ruleId !== b.ruleId) return null;

  const aStart = new Date(a.effectiveDate);
  const aEnd = a.sunsetDate ? new Date(a.sunsetDate) : new Date('9999-12-31');
  const bStart = new Date(b.effectiveDate);
  const bEnd = b.sunsetDate ? new Date(b.sunsetDate) : new Date('9999-12-31');

  // Overlap exists if aStart < bEnd AND bStart < aEnd
  if (aStart < bEnd && bStart < aEnd) {
    const overlapStart = aStart > bStart ? a.effectiveDate : b.effectiveDate;
    const overlapEnd = aEnd < bEnd ? (a.sunsetDate || '9999-12-31') : (b.sunsetDate || '9999-12-31');

    return {
      ruleId: a.ruleId,
      existingVersion: a,
      newVersion: {
        ruleId: b.ruleId,
        version: b.version,
        contentJson: b.contentJson,
        effectiveDate: b.effectiveDate,
        sunsetDate: b.sunsetDate,
        changedBy: b.changedBy,
        changeReason: b.changeReason,
        legislationId: b.legislationId,
      },
      overlapStart,
      overlapEnd,
      message: `Rule ${a.ruleId} versions ${a.version} and ${b.version} overlap from ${overlapStart} to ${overlapEnd}`,
    };
  }

  return null;
}

/**
 * Check if a new input would overlap with an existing version.
 */
function checkOverlapWithInput(existing: RuleVersion, input: RuleVersionInput): RuleConflict | null {
  const aStart = new Date(existing.effectiveDate);
  const aEnd = existing.sunsetDate ? new Date(existing.sunsetDate) : new Date('9999-12-31');
  const bStart = new Date(input.effectiveDate);
  const bEnd = input.sunsetDate ? new Date(input.sunsetDate) : new Date('9999-12-31');

  if (aStart < bEnd && bStart < aEnd) {
    const overlapStart = aStart > bStart ? existing.effectiveDate : input.effectiveDate;
    const overlapEnd = aEnd < bEnd ? (existing.sunsetDate || '9999-12-31') : (input.sunsetDate || '9999-12-31');

    return {
      ruleId: existing.ruleId,
      existingVersion: existing,
      newVersion: input,
      overlapStart,
      overlapEnd,
      message: `New version ${input.version} for rule ${input.ruleId} would overlap with existing version ${existing.version} from ${overlapStart} to ${overlapEnd}`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Store Management (for testing and initialization)
// ---------------------------------------------------------------------------

/**
 * Clear all rule versions from the store.
 * Used primarily for testing.
 */
export function clearRegistry(): void {
  ruleVersionStore.length = 0;
}

/**
 * Get the total count of registered versions.
 */
export function getVersionCount(): number {
  return ruleVersionStore.length;
}

/**
 * Bulk load rule versions (for initialization from DB).
 */
export function bulkLoadVersions(versions: RuleVersion[]): void {
  ruleVersionStore.push(...versions);
}
