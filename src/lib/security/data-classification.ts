/**
 * Data Classification System (CUI/FOUO)
 *
 * Implements Controlled Unclassified Information (CUI) marking and
 * access enforcement for DoD financial data. All DoD financial records
 * containing PII, proprietary acquisition data, or budget deliberation
 * information must be marked and protected as CUI.
 *
 * Classification levels:
 *   - Unclassified: No special handling required
 *   - CUI: Controlled Unclassified Information (32 CFR Part 2002)
 *   - CUI Specified: CUI with specific handling requirements
 *   - FOUO: For Official Use Only (legacy marking, being phased to CUI)
 *
 * References:
 *   - 32 CFR Part 2002: Controlled Unclassified Information
 *   - DoDI 5200.48: CUI
 *   - NIST SP 800-171: Protecting CUI in Nonfederal Systems
 *   - DoD FMR Vol. 1, Ch. 1: Financial Management Policy
 */

import type { DataClassification } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassificationPolicy {
  dataType: string;
  defaultClassification: DataClassification;
  reason: string;
  handlingCaveats?: string[];
}

export interface ClassificationResult {
  classification: DataClassification;
  reasons: string[];
  handlingInstructions: string[];
  bannerText: string;
  disseminationControl: string;
}

// ---------------------------------------------------------------------------
// Classification policies
// ---------------------------------------------------------------------------

const CLASSIFICATION_POLICIES: ClassificationPolicy[] = [
  {
    dataType: 'ada_violation',
    defaultClassification: 'cui',
    reason: 'ADA violation data contains budget deliberation information (CUI category: BUDGT)',
    handlingCaveats: ['NOFORN'],
  },
  {
    dataType: 'military_pay',
    defaultClassification: 'cui',
    reason: 'Military pay records contain PII (CUI category: PRVCY)',
    handlingCaveats: ['NOFORN', 'Privacy Act protected'],
  },
  {
    dataType: 'civilian_pay',
    defaultClassification: 'cui',
    reason: 'Civilian pay records contain PII (CUI category: PRVCY)',
    handlingCaveats: ['NOFORN', 'Privacy Act protected'],
  },
  {
    dataType: 'contract',
    defaultClassification: 'cui',
    reason: 'Contract data may contain source selection or proprietary information (CUI category: PROPIN)',
  },
  {
    dataType: 'debt_record',
    defaultClassification: 'cui',
    reason: 'Debt records contain PII and financial information (CUI category: PRVCY)',
    handlingCaveats: ['Privacy Act protected'],
  },
  {
    dataType: 'travel_order',
    defaultClassification: 'cui',
    reason: 'Travel orders may contain PII and operational details (CUI category: PRVCY)',
  },
  {
    dataType: 'appropriation',
    defaultClassification: 'cui',
    reason: 'Appropriation details are pre-decisional budget data (CUI category: BUDGT)',
  },
  {
    dataType: 'disbursement',
    defaultClassification: 'cui',
    reason: 'Disbursement records contain payee financial information (CUI category: PRVCY)',
  },
  {
    dataType: 'finding',
    defaultClassification: 'cui',
    reason: 'Audit findings contain pre-decisional and law enforcement sensitive data',
  },
  {
    dataType: 'engagement',
    defaultClassification: 'cui',
    reason: 'Engagement data contains financial audit information (CUI category: AUDFI)',
  },
  {
    dataType: 'report',
    defaultClassification: 'cui',
    reason: 'Audit reports are pre-decisional until published',
  },
  {
    dataType: 'security_assistance',
    defaultClassification: 'cui_specified',
    reason: 'FMS data requires specific handling per ITAR/EAR (CUI Specified: EXPT)',
    handlingCaveats: ['NOFORN', 'ITAR controlled'],
  },
  {
    dataType: 'ussgl_account',
    defaultClassification: 'unclassified',
    reason: 'Standard chart of accounts structure is public information',
  },
  {
    dataType: 'budget_object_code',
    defaultClassification: 'unclassified',
    reason: 'BOC structure is public information',
  },
];

const policyMap = new Map(CLASSIFICATION_POLICIES.map(p => [p.dataType, p]));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a data record based on its type.
 *
 * Per 32 CFR Part 2002 and DoDI 5200.48: All DoD information must be
 * reviewed for CUI marking requirements. Financial data containing PII,
 * proprietary information, or pre-decisional budget data requires CUI
 * marking.
 *
 * @param dataType - The type of data being classified
 * @param containsPII - Whether the record contains personally identifiable information
 * @param containsProprietaryData - Whether the record contains proprietary data
 * @returns Classification result with handling instructions
 */
export function classifyRecord(
  dataType: string,
  containsPII: boolean = false,
  containsProprietaryData: boolean = false,
): ClassificationResult {
  const policy = policyMap.get(dataType);
  const reasons: string[] = [];
  const handlingInstructions: string[] = [];
  let classification: DataClassification = 'unclassified';

  if (policy) {
    classification = policy.defaultClassification;
    reasons.push(policy.reason);
    if (policy.handlingCaveats) {
      handlingInstructions.push(...policy.handlingCaveats);
    }
  }

  // Elevate classification based on content analysis
  if (containsPII && classification === 'unclassified') {
    classification = 'cui';
    reasons.push('Contains Personally Identifiable Information (PII)');
    handlingInstructions.push('Privacy Act protected');
  }

  if (containsProprietaryData && classification === 'unclassified') {
    classification = 'cui';
    reasons.push('Contains proprietary or source selection information');
    handlingInstructions.push('Protect from unauthorized disclosure');
  }

  // Add standard handling instructions based on classification
  if (classification === 'cui' || classification === 'cui_specified') {
    handlingInstructions.push(
      'Safeguard per 32 CFR Part 2002',
      'Destroy by shredding or degaussing when no longer needed',
      'Transmit via encrypted channels only',
    );
  }

  return {
    classification,
    reasons,
    handlingInstructions,
    bannerText: getClassificationBanner(classification),
    disseminationControl: getDisseminationControl(classification),
  };
}

/**
 * Get the classification banner text for display.
 *
 * Per DoDI 5200.48: All CUI documents and displays must bear the
 * appropriate CUI banner marking.
 *
 * @param classification - The data classification level
 * @returns Banner text string
 */
export function getClassificationBanner(classification: DataClassification): string {
  switch (classification) {
    case 'cui_specified':
      return 'CUI//SP-EXPT';
    case 'cui':
      return 'CUI';
    case 'fouo':
      return 'FOR OFFICIAL USE ONLY';
    case 'unclassified':
    default:
      return 'UNCLASSIFIED';
  }
}

/**
 * Get dissemination control marking.
 */
function getDisseminationControl(classification: DataClassification): string {
  switch (classification) {
    case 'cui_specified':
      return 'Distribution authorized to U.S. Government agencies only; ' +
             'specific handling required per DoDI 5200.48.';
    case 'cui':
      return 'Distribution authorized to U.S. Government agencies and their contractors.';
    case 'fouo':
      return 'Distribution authorized to DoD and DoD contractors only.';
    default:
      return 'No dissemination restrictions.';
  }
}

/**
 * Enforce classification-based access control.
 *
 * Validates that a user's clearance level and need-to-know are
 * sufficient for accessing data at the given classification level.
 *
 * @param userRole - The user's role
 * @param classification - The data's classification
 * @param isEngagementMember - Whether the user is a member of the engagement
 * @returns Whether access is permitted
 */
export function enforceClassificationAccess(
  userRole: string,
  classification: DataClassification,
  isEngagementMember: boolean,
): { allowed: boolean; reason: string } {
  // Unclassified data: accessible to all authenticated users
  if (classification === 'unclassified') {
    return { allowed: true, reason: 'Unclassified data accessible to authenticated users.' };
  }

  // CUI data: requires engagement membership (need-to-know)
  if (classification === 'cui' || classification === 'fouo') {
    if (!isEngagementMember && userRole !== 'admin') {
      return {
        allowed: false,
        reason: 'CUI access requires need-to-know (engagement membership). ' +
                'Ref: 32 CFR Part 2002.',
      };
    }
    return { allowed: true, reason: 'CUI access granted based on engagement membership.' };
  }

  // CUI Specified: requires admin role or specific authorization
  if (classification === 'cui_specified') {
    if (userRole !== 'admin') {
      return {
        allowed: false,
        reason: 'CUI Specified access requires explicit authorization. ' +
                'Contact system administrator. Ref: DoDI 5200.48.',
      };
    }
    return { allowed: true, reason: 'CUI Specified access granted to admin role.' };
  }

  return { allowed: false, reason: 'Unknown classification level.' };
}

/**
 * Get all classification policies.
 * Used by the admin UI to display classification rules.
 */
export function getClassificationPolicies(): ClassificationPolicy[] {
  return [...CLASSIFICATION_POLICIES];
}
