/**
 * NDAA & FMR Change Ingestion Pipeline
 *
 * Processes National Defense Authorization Act (NDAA) changes and maps them
 * to affected DoD FMR volumes, chapters, and audit rules. Automatically
 * generates parameter updates (pay raise %, thresholds, rates) and
 * FMRRevision records for each affected chapter.
 *
 * The NDAA is enacted annually and contains provisions that affect:
 *   - Military pay rates (typically Section 601)
 *   - Acquisition thresholds (various sections)
 *   - Benefits and allowances (Sections 601-670)
 *   - Force structure and personnel levels
 *   - Security cooperation authorities (Title XII)
 *   - Debt management thresholds
 *
 * This processor provides structured ingestion of these changes so that
 * the system automatically updates parameters and rules without manual
 * intervention for each fiscal year.
 *
 * References:
 *   - National Defense Authorization Act (annual)
 *   - DoD 7000.14-R (FMR) all volumes
 *   - 10 U.S.C. (Armed Forces)
 *   - 37 U.S.C. (Pay and Allowances of the Uniformed Services)
 */

import type { FMRRevision } from '@/types/dod-fmr';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { TaxParameter } from '@/types/tax-compliance';
import { v4 as uuid } from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { registerRuleVersion, getActiveRule, getAllVersionsForRule } from './rule-version-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An NDAA legislative change record */
export interface NDAASectionChange {
  id: string;
  ndaaFiscalYear: number;
  publicLawNumber: string;
  sectionNumber: string;
  sectionTitle: string;
  description: string;
  affectedFMRVolumes: number[];
  affectedFMRChapters: Array<{ volume: number; chapter: number }>;
  affectedParameterCodes: string[];
  affectedRuleIds: string[];
  parameterUpdates: NDAASectionParameterUpdate[];
  effectiveDate: string;
  ingestedAt?: string;
  ingestedBy?: string;
}

/** A parameter update derived from an NDAA section */
export interface NDAASectionParameterUpdate {
  parameterCode: string;
  previousValue: number;
  newValue: number;
  changeType: 'absolute' | 'percentage' | 'index_linked';
  changeAmount: number;
  authority: string;
}

/** Result of processing a full NDAA */
export interface NDAAProcessingResult {
  ndaaFiscalYear: number;
  publicLawNumber: string;
  totalSectionsProcessed: number;
  parameterUpdatesGenerated: number;
  ruleVersionsCreated: number;
  fmrRevisionsGenerated: number;
  revisions: FMRRevision[];
  parameterUpdates: GeneratedParameterUpdate[];
  errors: string[];
  processedAt: string;
  processedBy: string;
}

/** A generated parameter update ready for insertion */
export interface GeneratedParameterUpdate {
  code: string;
  fiscalYear: number;
  value: number;
  previousValue: number;
  changeReason: string;
  legislationId: string;
  authority: string;
}

/** Complete NDAA change package */
export interface NDAAChangePackage {
  fiscalYear: number;
  publicLawNumber: string;
  enactmentDate: string;
  sections: NDAASectionChange[];
}

// ---------------------------------------------------------------------------
// NDAA-to-FMR Volume Mapping
// ---------------------------------------------------------------------------

/**
 * Maps NDAA title/section ranges to affected FMR volumes.
 *
 * NDAA titles map roughly to DoD FMR volumes:
 *   Title I (Procurement) -> Vol 10 (Contracts)
 *   Title V (Military Personnel) -> Vol 7 (Military Pay)
 *   Title VI (Compensation & Benefits) -> Vol 7, Vol 8
 *   Title XII (Security Cooperation) -> Vol 15
 *   Title XIV (Other Authorizations) -> Vol 3, Vol 14
 */
const NDAA_TITLE_TO_FMR: Record<string, number[]> = {
  'Title I': [10],           // Procurement
  'Title II': [3, 10],       // Research, Development, Test & Eval
  'Title III': [3, 10],      // Operation & Maintenance
  'Title IV': [3],           // Military Construction
  'Title V': [7],            // Military Personnel Policy
  'Title VI': [7, 8],        // Compensation & Benefits
  'Title VII': [8],          // Civilian Personnel
  'Title VIII': [10],        // Acquisition Policy
  'Title IX': [1],           // DoD Organization & Management
  'Title X': [1, 3],         // General Provisions
  'Title XI': [8],           // Civilian Personnel
  'Title XII': [15],         // Security Cooperation
  'Title XIII': [1],         // Cooperative Threat Reduction
  'Title XIV': [3, 14],      // Other Authorizations & ADA
};

/**
 * Maps parameter codes to the NDAA section ranges that typically affect them.
 */
const PARAMETER_NDAA_MAPPING: Record<string, string[]> = {
  'DOD_MILPAY_RAISE_PCT': ['601', '602'],
  'DOD_BAS_ENLISTED': ['601', '603'],
  'DOD_BAS_OFFICER': ['601', '603'],
  'DOD_TSP_ELECTIVE_LIMIT': ['601'],
  'DOD_CONUS_PERDIEM_STD': ['601', '631'],
  'DOD_CONUS_LODGING_STD': ['601', '631'],
  'DOD_CONUS_MIE_STD': ['601', '631'],
  'DOD_MICRO_PURCHASE_THRESHOLD': ['801', '802'],
  'DOD_SIMPLIFIED_ACQ_THRESHOLD': ['801', '802'],
  'DOD_TINA_THRESHOLD': ['801', '802'],
  'DOD_CAS_THRESHOLD': ['801'],
  'DOD_PREMIUM_PAY_CAP': ['701', '1101'],
  'DOD_DEBT_REFERRAL_THRESHOLD': ['1001'],
  'DOD_DEBT_COMPROMISE_AGENCY_LIMIT': ['1001'],
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const processedPackages: NDAAProcessingResult[] = [];

// ---------------------------------------------------------------------------
// Core Processing Functions
// ---------------------------------------------------------------------------

/**
 * Process a complete NDAA change package.
 *
 * Ingests all sections from an NDAA, generates parameter updates,
 * creates FMR revision records, and registers new rule versions.
 *
 * @param changePackage - The complete NDAA change package
 * @param processedBy - User or system processing the changes
 * @returns Processing result with all generated updates
 */
export function processNDAAChangePackage(
  changePackage: NDAAChangePackage,
  processedBy: string
): NDAAProcessingResult {
  const result: NDAAProcessingResult = {
    ndaaFiscalYear: changePackage.fiscalYear,
    publicLawNumber: changePackage.publicLawNumber,
    totalSectionsProcessed: 0,
    parameterUpdatesGenerated: 0,
    ruleVersionsCreated: 0,
    fmrRevisionsGenerated: 0,
    revisions: [],
    parameterUpdates: [],
    errors: [],
    processedAt: new Date().toISOString(),
    processedBy,
  };

  for (const section of changePackage.sections) {
    try {
      processSingleSection(section, changePackage, result);
      result.totalSectionsProcessed++;
    } catch (error) {
      result.errors.push(
        `Error processing section ${section.sectionNumber}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  processedPackages.push(result);
  return result;
}

/**
 * Process a single NDAA section change.
 */
function processSingleSection(
  section: NDAASectionChange,
  pkg: NDAAChangePackage,
  result: NDAAProcessingResult
): void {
  section.ingestedAt = new Date().toISOString();
  section.ingestedBy = result.processedBy;

  // Generate parameter updates from section
  for (const paramUpdate of section.parameterUpdates) {
    const generated: GeneratedParameterUpdate = {
      code: paramUpdate.parameterCode,
      fiscalYear: pkg.fiscalYear,
      value: paramUpdate.newValue,
      previousValue: paramUpdate.previousValue,
      changeReason: `${pkg.publicLawNumber}, Section ${section.sectionNumber}: ${section.sectionTitle}`,
      legislationId: `NDAA_FY${pkg.fiscalYear}`,
      authority: paramUpdate.authority,
    };
    result.parameterUpdates.push(generated);
    result.parameterUpdatesGenerated++;
  }

  // Generate FMR revisions for affected chapters
  for (const ch of section.affectedFMRChapters) {
    const revision: FMRRevision = {
      volumeNumber: ch.volume,
      chapterNumber: ch.chapter,
      revisionDate: section.effectiveDate,
      previousRevisionDate: undefined,
      changeDescription: `${pkg.publicLawNumber} Section ${section.sectionNumber}: ${section.description}`,
      affectedRuleIds: section.affectedRuleIds,
    };
    result.revisions.push(revision);
    result.fmrRevisionsGenerated++;
  }

  // Register new rule versions for affected rules
  for (const ruleId of section.affectedRuleIds) {
    const existing = getAllVersionsForRule(ruleId);
    const nextVersion = existing.length > 0
      ? Math.max(...existing.map((v) => v.version)) + 1
      : 1;

    const regResult = registerRuleVersion({
      ruleId,
      version: nextVersion,
      contentJson: JSON.stringify({
        ndaaFiscalYear: pkg.fiscalYear,
        sectionNumber: section.sectionNumber,
        description: section.description,
        parameterUpdates: section.parameterUpdates,
      }),
      effectiveDate: section.effectiveDate,
      changedBy: result.processedBy,
      changeReason: `${pkg.publicLawNumber} Section ${section.sectionNumber}: ${section.sectionTitle}`,
      legislationId: `NDAA_FY${pkg.fiscalYear}`,
    });

    if (regResult.version) {
      result.ruleVersionsCreated++;
    }
    if (regResult.conflicts.length > 0) {
      result.errors.push(
        `Conflict registering rule ${ruleId} v${nextVersion}: ${regResult.conflicts[0].message}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// NDAA Section Builder Utilities
// ---------------------------------------------------------------------------

/**
 * Create a military pay raise section change.
 *
 * The NDAA typically authorizes an annual military pay raise in Section 601.
 * This helper builds the structured change record.
 *
 * @param fiscalYear - The fiscal year of the NDAA
 * @param raisePct - The pay raise percentage (e.g., 0.045 for 4.5%)
 * @param previousPct - The previous year's raise percentage
 * @param publicLawNumber - The public law number
 */
export function createMilitaryPayRaiseChange(
  fiscalYear: number,
  raisePct: number,
  previousPct: number,
  publicLawNumber: string
): NDAASectionChange {
  return {
    id: uuid(),
    ndaaFiscalYear: fiscalYear,
    publicLawNumber,
    sectionNumber: '601',
    sectionTitle: 'Military Pay Raise',
    description: `Authorizes ${(raisePct * 100).toFixed(1)}% increase in basic pay for members of the uniformed services effective January 1, ${fiscalYear}`,
    affectedFMRVolumes: [7],
    affectedFMRChapters: [{ volume: 7, chapter: 3 }],
    affectedParameterCodes: ['DOD_MILPAY_RAISE_PCT'],
    affectedRuleIds: ['DOD-MILPAY-001'],
    parameterUpdates: [{
      parameterCode: 'DOD_MILPAY_RAISE_PCT',
      previousValue: previousPct,
      newValue: raisePct,
      changeType: 'absolute',
      changeAmount: raisePct - previousPct,
      authority: `${publicLawNumber}, Section 601; 37 U.S.C. §1009`,
    }],
    effectiveDate: `${fiscalYear}-01-01`,
  };
}

/**
 * Create a BAS rate update section change.
 *
 * Basic Allowance for Subsistence (BAS) is typically adjusted annually
 * based on the USDA food cost index.
 *
 * @param fiscalYear - The fiscal year
 * @param enlistedRate - New enlisted BAS monthly rate
 * @param officerRate - New officer BAS monthly rate
 * @param prevEnlisted - Previous enlisted rate
 * @param prevOfficer - Previous officer rate
 * @param publicLawNumber - The public law number
 */
export function createBASUpdateChange(
  fiscalYear: number,
  enlistedRate: number,
  officerRate: number,
  prevEnlisted: number,
  prevOfficer: number,
  publicLawNumber: string
): NDAASectionChange {
  return {
    id: uuid(),
    ndaaFiscalYear: fiscalYear,
    publicLawNumber,
    sectionNumber: '603',
    sectionTitle: 'Basic Allowance for Subsistence',
    description: `Updates BAS rates: Enlisted $${enlistedRate.toFixed(2)}/mo, Officer $${officerRate.toFixed(2)}/mo`,
    affectedFMRVolumes: [7],
    affectedFMRChapters: [{ volume: 7, chapter: 25 }],
    affectedParameterCodes: ['DOD_BAS_ENLISTED', 'DOD_BAS_OFFICER'],
    affectedRuleIds: ['DOD-MILPAY-001'],
    parameterUpdates: [
      {
        parameterCode: 'DOD_BAS_ENLISTED',
        previousValue: prevEnlisted,
        newValue: enlistedRate,
        changeType: 'absolute',
        changeAmount: enlistedRate - prevEnlisted,
        authority: `${publicLawNumber}, Section 603; 37 U.S.C. §402`,
      },
      {
        parameterCode: 'DOD_BAS_OFFICER',
        previousValue: prevOfficer,
        newValue: officerRate,
        changeType: 'absolute',
        changeAmount: officerRate - prevOfficer,
        authority: `${publicLawNumber}, Section 603; 37 U.S.C. §402`,
      },
    ],
    effectiveDate: `${fiscalYear - 1}-10-01`,
  };
}

/**
 * Create an acquisition threshold update section change.
 *
 * FAR/DFARS thresholds are adjusted periodically per 41 U.S.C. §1908.
 *
 * @param fiscalYear - The fiscal year
 * @param thresholdCode - The parameter code being updated
 * @param newValue - The new threshold value
 * @param previousValue - The previous value
 * @param publicLawNumber - The public law number
 */
export function createAcquisitionThresholdChange(
  fiscalYear: number,
  thresholdCode: string,
  newValue: number,
  previousValue: number,
  publicLawNumber: string
): NDAASectionChange {
  return {
    id: uuid(),
    ndaaFiscalYear: fiscalYear,
    publicLawNumber,
    sectionNumber: '802',
    sectionTitle: 'Acquisition Threshold Adjustment',
    description: `Adjusts ${thresholdCode} from $${previousValue.toLocaleString()} to $${newValue.toLocaleString()}`,
    affectedFMRVolumes: [10],
    affectedFMRChapters: [{ volume: 10, chapter: 1 }],
    affectedParameterCodes: [thresholdCode],
    affectedRuleIds: ['DOD-FMR-V10-001'],
    parameterUpdates: [{
      parameterCode: thresholdCode,
      previousValue,
      newValue,
      changeType: 'absolute',
      changeAmount: newValue - previousValue,
      authority: `${publicLawNumber}, Section 802; 41 U.S.C. §1908`,
    }],
    effectiveDate: `${fiscalYear - 1}-10-01`,
  };
}

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

/**
 * Get all processed NDAA packages.
 */
export function getProcessedPackages(): NDAAProcessingResult[] {
  return [...processedPackages];
}

/**
 * Get processing result for a specific fiscal year.
 */
export function getProcessingResultForFY(fiscalYear: number): NDAAProcessingResult | null {
  return processedPackages.find((p) => p.ndaaFiscalYear === fiscalYear) || null;
}

/**
 * Find which NDAA sections affect a given parameter code.
 */
export function findSectionsAffectingParameter(
  parameterCode: string
): string[] {
  return PARAMETER_NDAA_MAPPING[parameterCode] || [];
}

/**
 * Find which FMR volumes are affected by an NDAA title.
 */
export function findAffectedFMRVolumes(ndaaTitle: string): number[] {
  return NDAA_TITLE_TO_FMR[ndaaTitle] || [];
}

/**
 * Clear processing history (for testing).
 */
export function clearProcessingHistory(): void {
  processedPackages.length = 0;
}
