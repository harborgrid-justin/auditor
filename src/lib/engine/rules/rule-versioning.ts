/**
 * Immutable Rule Version History
 *
 * Provides version tracking for audit rules, maintaining an immutable
 * history of every rule change. When a rule is modified (e.g., due to
 * new legislation or regulatory guidance), the old version is preserved
 * and a new version is created.
 *
 * This enables:
 *   - Point-in-time rule retrieval (what was the rule on date X?)
 *   - Audit trail for rule changes (who changed what and why?)
 *   - Legislative traceability (which law triggered this change?)
 *   - Rule comparison across versions (diff between versions)
 *
 * References:
 *   - DoD FMR Vol. 1, Ch. 1: Financial Management Regulation Updates
 *   - GAO Yellow Book: Quality Control for Audit Standards
 *   - FASAB Technical Guidance: Standard Adoption Timelines
 */

import type { AuditRule } from '@/types/findings';
import type { RuleVersion } from '@/types/dod-fmr';
// Simple ID generator (avoids uuid dependency issues)
function generateVersionId(): string {
  return `rv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Internal state — version history
// ---------------------------------------------------------------------------

const versionHistory: RuleVersion[] = [];

// Index: ruleId -> versions (sorted by version number descending)
const versionIndex = new Map<string, RuleVersion[]>();

function rebuildIndex(): void {
  versionIndex.clear();
  for (const version of versionHistory) {
    if (!versionIndex.has(version.ruleId)) {
      versionIndex.set(version.ruleId, []);
    }
    versionIndex.get(version.ruleId)!.push(version);
  }
  // Sort each rule's versions descending by version number
  for (const versions of Array.from(versionIndex.values())) {
    versions.sort((a: RuleVersion, b: RuleVersion) => b.version - a.version);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new version of a rule, preserving the previous version.
 *
 * @param rule - The updated rule content
 * @param changedBy - User who made the change
 * @param changeReason - Why the rule was changed
 * @param legislationId - Optional: the legislation that triggered the change
 * @returns The created RuleVersion
 */
export function createRuleVersion(
  rule: AuditRule,
  changedBy: string,
  changeReason: string,
  legislationId?: string,
): RuleVersion {
  const existingVersions = versionIndex.get(rule.id) || [];
  const latestVersion = existingVersions.length > 0 ? existingVersions[0].version : 0;

  const version: RuleVersion = {
    id: generateVersionId(),
    ruleId: rule.id,
    version: latestVersion + 1,
    contentJson: JSON.stringify(rule),
    effectiveDate: rule.effectiveDate || new Date().toISOString(),
    sunsetDate: rule.sunsetDate,
    changedBy,
    changeReason,
    legislationId,
    createdAt: new Date().toISOString(),
  };

  versionHistory.push(version);
  rebuildIndex();

  return version;
}

/**
 * Get the version of a rule that was effective on a specific date.
 *
 * Returns the rule version whose effectiveDate is on or before the
 * target date and whose sunsetDate (if any) is on or after the date.
 *
 * @param ruleId - The rule identifier
 * @param date - The target date (ISO string)
 * @returns The rule content as it was on that date, or null
 */
export function getRuleAtDate(
  ruleId: string,
  date: string,
): AuditRule | null {
  const versions = versionIndex.get(ruleId);
  if (!versions || versions.length === 0) return null;

  const targetDate = new Date(date);

  for (const version of versions) {
    const effective = new Date(version.effectiveDate);
    if (effective > targetDate) continue;

    if (version.sunsetDate) {
      const sunset = new Date(version.sunsetDate);
      if (sunset < targetDate) continue;
    }

    try {
      return JSON.parse(version.contentJson) as AuditRule;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get the full version history for a rule.
 *
 * @param ruleId - The rule identifier
 * @returns Array of RuleVersion records, newest first
 */
export function getRuleHistory(ruleId: string): RuleVersion[] {
  return versionIndex.get(ruleId) || [];
}

/**
 * Compute a diff between two versions of a rule.
 *
 * Returns a list of fields that changed between the two versions,
 * with their old and new values.
 *
 * @param ruleId - The rule identifier
 * @param fromVersion - The older version number
 * @param toVersion - The newer version number
 * @returns Array of field-level changes
 */
export function diffRuleVersions(
  ruleId: string,
  fromVersion: number,
  toVersion: number,
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const versions = versionIndex.get(ruleId) || [];
  const from = versions.find(v => v.version === fromVersion);
  const to = versions.find(v => v.version === toVersion);

  if (!from || !to) return [];

  let oldRule: Record<string, unknown>;
  let newRule: Record<string, unknown>;

  try {
    oldRule = JSON.parse(from.contentJson);
    newRule = JSON.parse(to.contentJson);
  } catch {
    return [];
  }

  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  const allKeys = new Set([...Object.keys(oldRule), ...Object.keys(newRule)]);

  for (const key of Array.from(allKeys)) {
    const oldVal = oldRule[key];
    const newVal = newRule[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal });
    }
  }

  return changes;
}

/**
 * Get the latest version of a rule.
 *
 * @param ruleId - The rule identifier
 * @returns The latest RuleVersion, or null
 */
export function getLatestVersion(ruleId: string): RuleVersion | null {
  const versions = versionIndex.get(ruleId);
  return versions && versions.length > 0 ? versions[0] : null;
}

/**
 * Seed version history from existing rules.
 * Call once on initialization to create v1 entries for all current rules.
 *
 * @param rules - Current audit rules to version
 * @param seedUser - User ID for the seed operation
 */
export function seedVersionHistory(
  rules: AuditRule[],
  seedUser: string = 'system',
): number {
  let created = 0;
  for (const rule of rules) {
    const existing = versionIndex.get(rule.id);
    if (!existing || existing.length === 0) {
      createRuleVersion(rule, seedUser, 'Initial version (system seed)');
      created++;
    }
  }
  return created;
}
