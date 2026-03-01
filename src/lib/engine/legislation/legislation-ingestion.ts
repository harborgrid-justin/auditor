/**
 * Legislation Change Ingestion Pipeline
 *
 * Provides a data-driven mechanism for ingesting new legislation (NDAA,
 * FASAB standards, OMB circulars, executive orders) without requiring
 * code changes. Supports multiple ingestion sources:
 *
 *   1. Manual admin entry (structured schema)
 *   2. Congress.gov API adapter (for enacted public laws)
 *   3. Federal Register API adapter (for final rules and notices)
 *   4. Webhook receiver (for real-time legislative alerts)
 *
 * Ingestion workflow:
 *   1. Parse incoming legislation data into canonical format
 *   2. Identify affected rules and parameters via keyword matching
 *   3. Generate impact preview (dry-run) before activation
 *   4. Activate legislation, updating tracker and parameter registry
 *
 * References:
 *   - DoD FMR Vol. 1, Ch. 1: Financial Management Policy Updates
 *   - FASAB Handbook: Standard Adoption Process
 *   - OMB Circular A-11: Budget Formulation and Execution
 */

import type {
  Legislation,
  LegislationRuleLink,
} from '@/types/tax-compliance';
import { registerLegislation } from './tracker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegislationIngestionRequest {
  /** Source of the legislation data */
  source: 'manual' | 'congress_gov' | 'federal_register' | 'webhook';
  /** The legislation data to ingest */
  legislation: {
    name: string;
    shortName: string;
    publicLaw?: string;
    enactedDate: string;
    effectiveDate: string;
    sunsetDate?: string;
    summary: string;
    affectedSections: string[];
    category: 'ndaa' | 'fasab' | 'omb_circular' | 'executive_order' | 'public_law' | 'other';
  };
  /** Rule impacts identified */
  ruleLinks?: Array<{
    ruleId: string;
    parameterCode?: string;
    impactDescription: string;
  }>;
  /** Whether to activate immediately or stage for review */
  activateImmediately?: boolean;
}

export interface LegislationIngestionResult {
  success: boolean;
  legislationId: string;
  status: 'staged' | 'activated' | 'failed';
  ruleLinksCreated: number;
  parametersAffected: string[];
  warnings: string[];
  errors: string[];
  ingestedAt: string;
}

export interface StagedLegislation {
  id: string;
  request: LegislationIngestionRequest;
  stagedAt: string;
  stagedBy: string;
  reviewStatus: 'pending_review' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

// ---------------------------------------------------------------------------
// Internal state — staged legislation awaiting review
// ---------------------------------------------------------------------------

const stagedLegislation: StagedLegislation[] = [];
let nextId = 1;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateLegislationId(request: LegislationIngestionRequest): string {
  const prefix = request.legislation.category.toUpperCase().replace(/_/g, '');
  return `${prefix}-${Date.now()}-${nextId++}`;
}

/**
 * Identify potentially affected rules based on keyword matching.
 * This provides suggestions when explicit rule links are not provided.
 */
export function identifyAffectedRules(
  sections: string[],
  summary: string,
): string[] {
  const affectedRuleIds: string[] = [];
  const summaryLower = summary.toLowerCase();

  // DoD FMR volume keyword mapping
  const keywordToRule: Record<string, string[]> = {
    'appropriation': ['DOD_FMR_VOL3_BUDGET_EXECUTION', 'DOD_FMR_VOL14_ADA'],
    'apportionment': ['DOD_FMR_VOL3_BUDGET_EXECUTION'],
    'anti-deficiency': ['DOD_FMR_VOL14_ADA_VIOLATION_REPORTING'],
    'ada': ['DOD_FMR_VOL14_ADA_VIOLATION_REPORTING'],
    'military pay': ['DOD_FMR_VOL7_MILITARY_PAY'],
    'basic pay': ['DOD_FMR_VOL7_MILITARY_PAY'],
    'bah': ['DOD_FMR_VOL7_MILITARY_PAY'],
    'civilian pay': ['DOD_FMR_VOL8_CIVILIAN_PAY'],
    'gs pay': ['DOD_FMR_VOL8_CIVILIAN_PAY'],
    'travel': ['DOD_FMR_VOL9_TRAVEL'],
    'per diem': ['DOD_FMR_VOL9_TRAVEL'],
    'contract': ['DOD_FMR_VOL10_CONTRACT_PAYMENT'],
    'acquisition': ['DOD_FMR_VOL10_CONTRACT_PAYMENT'],
    'procurement': ['DOD_FMR_VOL10_CONTRACT_PAYMENT', 'DOD_FMR_VOL3_BUDGET_EXECUTION'],
    'reimbursable': ['DOD_FMR_VOL11_REIMBURSABLE'],
    'disburs': ['DOD_FMR_VOL5_DISBURSING'],
    'reporting': ['DOD_FMR_VOL6_REPORTING'],
    'financial statement': ['DOD_FMR_VOL6_REPORTING'],
    'debt': ['DOD_FMR_VOL16_DEBT_MANAGEMENT'],
    'collection': ['DOD_FMR_VOL16_DEBT_MANAGEMENT'],
    'security assistance': ['DOD_FMR_VOL15_SECURITY_ASSISTANCE'],
    'fms': ['DOD_FMR_VOL15_SECURITY_ASSISTANCE'],
    'naf': ['DOD_FMR_VOL13_NAF'],
    'nonappropriated': ['DOD_FMR_VOL13_NAF'],
    'lease': ['DOD_FMR_VOL4_FEDERAL_LEASES'],
    'sffas 54': ['DOD_FMR_VOL4_FEDERAL_LEASES'],
    'accounting policy': ['DOD_FMR_VOL4_ACCOUNTING_POLICY'],
    'ussgl': ['DOD_FMR_VOL4_ACCOUNTING_POLICY'],
  };

  for (const [keyword, ruleIds] of Object.entries(keywordToRule)) {
    if (summaryLower.includes(keyword) ||
        sections.some(s => s.toLowerCase().includes(keyword))) {
      for (const ruleId of ruleIds) {
        if (!affectedRuleIds.includes(ruleId)) {
          affectedRuleIds.push(ruleId);
        }
      }
    }
  }

  return affectedRuleIds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ingest new legislation into the system.
 *
 * If activateImmediately is false (default), the legislation is staged
 * for admin review before being registered in the tracker.
 *
 * @param request - The ingestion request with legislation data
 * @param userId - The user performing the ingestion
 * @returns Ingestion result
 */
export function ingestLegislation(
  request: LegislationIngestionRequest,
  userId: string,
): LegislationIngestionResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const legislationId = generateLegislationId(request);

  // Validate required fields
  if (!request.legislation.name) {
    errors.push('Legislation name is required');
  }
  if (!request.legislation.effectiveDate) {
    errors.push('Effective date is required');
  }
  if (!request.legislation.enactedDate) {
    errors.push('Enacted date is required');
  }

  if (errors.length > 0) {
    return {
      success: false,
      legislationId,
      status: 'failed',
      ruleLinksCreated: 0,
      parametersAffected: [],
      warnings,
      errors,
      ingestedAt: new Date().toISOString(),
    };
  }

  // Auto-identify affected rules if not provided
  let ruleLinks = request.ruleLinks || [];
  if (ruleLinks.length === 0) {
    const autoDetected = identifyAffectedRules(
      request.legislation.affectedSections,
      request.legislation.summary,
    );
    if (autoDetected.length > 0) {
      ruleLinks = autoDetected.map(ruleId => ({
        ruleId,
        impactDescription: `Auto-detected impact from ${request.legislation.shortName}`,
      }));
      warnings.push(
        `Auto-detected ${autoDetected.length} potentially affected rules. ` +
        `Review and adjust before activation.`,
      );
    }
  }

  const parametersAffected = ruleLinks
    .filter(l => l.parameterCode)
    .map(l => l.parameterCode!);

  if (request.activateImmediately) {
    // Directly register in the tracker
    const legislation: Legislation = {
      id: legislationId,
      name: request.legislation.name,
      shortName: request.legislation.shortName,
      publicLaw: request.legislation.publicLaw,
      enactedDate: request.legislation.enactedDate,
      effectiveDate: request.legislation.effectiveDate,
      sunsetDate: request.legislation.sunsetDate,
      status: 'active',
      affectedSections: request.legislation.affectedSections,
      summary: request.legislation.summary,
    };

    const links: LegislationRuleLink[] = ruleLinks.map((l, i) => ({
      id: `${legislationId}-link-${i}`,
      legislationId,
      ruleId: l.ruleId,
      parameterCode: l.parameterCode,
      impactDescription: l.impactDescription,
    }));

    registerLegislation(legislation, links);

    return {
      success: true,
      legislationId,
      status: 'activated',
      ruleLinksCreated: links.length,
      parametersAffected,
      warnings,
      errors,
      ingestedAt: new Date().toISOString(),
    };
  }

  // Stage for review
  stagedLegislation.push({
    id: legislationId,
    request,
    stagedAt: new Date().toISOString(),
    stagedBy: userId,
    reviewStatus: 'pending_review',
  });

  return {
    success: true,
    legislationId,
    status: 'staged',
    ruleLinksCreated: ruleLinks.length,
    parametersAffected,
    warnings,
    errors,
    ingestedAt: new Date().toISOString(),
  };
}

/**
 * Get all staged legislation pending review.
 */
export function getStagedLegislation(): StagedLegislation[] {
  return stagedLegislation.filter(s => s.reviewStatus === 'pending_review');
}

/**
 * Activate a staged legislation after review.
 *
 * @param stagedId - The ID of the staged legislation
 * @param reviewedBy - The reviewer's user ID
 * @param approved - Whether the legislation is approved
 * @param notes - Review notes
 */
export function activateStagedLegislation(
  stagedId: string,
  reviewedBy: string,
  approved: boolean,
  notes?: string,
): LegislationIngestionResult {
  const staged = stagedLegislation.find(s => s.id === stagedId);
  if (!staged) {
    return {
      success: false,
      legislationId: stagedId,
      status: 'failed',
      ruleLinksCreated: 0,
      parametersAffected: [],
      warnings: [],
      errors: [`Staged legislation ${stagedId} not found`],
      ingestedAt: new Date().toISOString(),
    };
  }

  staged.reviewedBy = reviewedBy;
  staged.reviewedAt = new Date().toISOString();
  staged.reviewNotes = notes;

  if (!approved) {
    staged.reviewStatus = 'rejected';
    return {
      success: true,
      legislationId: stagedId,
      status: 'failed',
      ruleLinksCreated: 0,
      parametersAffected: [],
      warnings: [],
      errors: ['Legislation rejected during review'],
      ingestedAt: new Date().toISOString(),
    };
  }

  staged.reviewStatus = 'approved';

  // Activate by re-ingesting with immediate activation
  return ingestLegislation(
    { ...staged.request, activateImmediately: true },
    reviewedBy,
  );
}
