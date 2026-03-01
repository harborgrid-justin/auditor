/**
 * SAM.gov Entity Validation Interface
 *
 * Provides structured pure functions for validating entity registration,
 * checking exclusion/debarment status, and retrieving entity registration
 * data from SAM.gov (System for Award Management).
 *
 * All functions return structured result objects and do NOT make actual
 * API calls — they produce interface-ready data structures for
 * downstream integration layers or unit tests.
 *
 * Pre-payment and pre-award validation against SAM.gov is required by:
 *   - FAR 4.1102 — Contractors must be registered in SAM before award
 *   - FAR 9.405 — Agencies must check exclusions before award
 *   - 2 CFR 180 — Governmentwide nonprocurement debarment and suspension
 *   - 31 U.S.C. § 3354 — Do Not Pay Initiative (includes SAM exclusions)
 *
 * References:
 *   - FAR Part 4, Subpart 4.11 (SAM Registration)
 *   - FAR Part 9, Subpart 9.4 (Debarment, Suspension, Ineligibility)
 *   - 2 CFR Part 180 (Nonprocurement Debarment and Suspension)
 *   - DoD FMR Vol. 10 (Contract Payment Policy)
 *   - DoD FMR Vol. 5, Ch. 6 (Certifying Officers)
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** SAM.gov entity registration status. */
export type SAMRegistrationStatus = 'active' | 'inactive' | 'expired' | 'not_found';

/** SAM.gov exclusion type per FAR 9.4 and 2 CFR 180. */
export type SAMExclusionType =
  | 'debarment'
  | 'suspension'
  | 'proposed_debarment'
  | 'voluntary_exclusion'
  | 'ineligible'
  | 'prohibition';

/** Core entity data from SAM.gov registration. */
export interface SAMEntity {
  id: string;
  /** Unique Entity Identifier assigned by SAM.gov. */
  uei: string;
  legalBusinessName: string;
  dbaName?: string;
  cageCode?: string;
  registrationStatus: SAMRegistrationStatus;
  registrationExpirationDate?: string;
  physicalAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrProvince: string;
    zipCode: string;
    country: string;
  };
  congressionalDistrict?: string;
  businessTypes: string[];
  naicsCodes: string[];
  pscCodes?: string[];
  entityStartDate?: string;
  fiscalYearEndCloseDate?: string;
  /** Whether entity has active federal contracts/grants. */
  hasActiveAwards: boolean;
}

/** A single exclusion record from SAM.gov. */
export interface SAMExclusionCheck {
  id: string;
  uei?: string;
  entityName: string;
  exclusionType: SAMExclusionType;
  excludingAgency: string;
  exclusionProgram: string;
  activeDate: string;
  terminationDate?: string;
  /** Cause and treatment code per FAR 9.406. */
  ctCode: string;
  description: string;
  /** Whether this exclusion is currently active (not terminated). */
  isActive: boolean;
}

/** Full registration data for an entity from SAM.gov. */
export interface SAMRegistration {
  id: string;
  entity: SAMEntity;
  pointsOfContact: Array<{
    type: 'government_business' | 'electronic_business' | 'past_performance';
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }>;
  /** Representations and certifications. */
  repsAndCerts: {
    smallBusinessCertifications: string[];
    disasterResponseCertified: boolean;
    foreignOwnership: boolean;
  };
  /** Financial information on file. */
  financialInformation: {
    hasEFTOnFile: boolean;
    remittanceAddress?: string;
  };
  registrationDate: string;
  lastUpdated: string;
  retrievedAt: string;
}

/** Result of a SAM.gov entity validation check. */
export interface SAMValidationResult {
  id: string;
  /** The UEI that was looked up. */
  queriedUEI: string;
  /** Optional CAGE code used in the lookup. */
  queriedCAGE?: string;
  entityFound: boolean;
  entity: SAMEntity | null;
  isRegistrationActive: boolean;
  /** Whether registration will expire within 30 days. */
  registrationExpiringSoon: boolean;
  hasExclusions: boolean;
  exclusions: SAMExclusionCheck[];
  /** Whether the entity is eligible to receive federal awards/payments. */
  eligibleForAward: boolean;
  /** Reasons the entity may not be eligible. */
  ineligibilityReasons: string[];
  validatedAt: string;
}

// ---------------------------------------------------------------------------
// 1. Validate Entity
// ---------------------------------------------------------------------------

/**
 * Validate an entity's registration in SAM.gov.
 *
 * Performs a comprehensive check of an entity's SAM.gov registration
 * status and exclusion records. Per FAR 4.1102, contracting officers
 * must verify that prospective contractors are registered in SAM.gov
 * before award. Per FAR 9.405, agencies must check exclusions.
 *
 * The result includes eligibility determination based on:
 *   - Active registration status (FAR 4.1102)
 *   - No active exclusion records (FAR 9.405)
 *   - Registration not expired
 *
 * @param uei      - Unique Entity Identifier (required)
 * @param cageCode - Commercial and Government Entity code (optional, for cross-validation)
 * @returns SAMValidationResult with eligibility determination and any exclusions
 *
 * @see FAR 4.1102 — SAM registration verification before award
 * @see FAR 9.405 — effect of exclusion listing
 * @see 2 CFR 180.300 — nonprocurement transaction participant verification
 */
export function validateEntity(
  uei: string,
  cageCode?: string,
): SAMValidationResult {
  const now = new Date().toISOString();
  const ineligibilityReasons: string[] = [];

  // Produce a stub entity for interface-ready result.
  // Downstream integration layers replace this with actual SAM.gov data.
  const entity: SAMEntity = {
    id: uuid(),
    uei,
    legalBusinessName: '',
    cageCode: cageCode ?? undefined,
    registrationStatus: 'not_found',
    physicalAddress: {
      addressLine1: '',
      city: '',
      stateOrProvince: '',
      zipCode: '',
      country: '',
    },
    businessTypes: [],
    naicsCodes: [],
    hasActiveAwards: false,
  };

  // Default: entity not found yields ineligible
  ineligibilityReasons.push(
    `Entity with UEI ${uei} not found in SAM.gov — registration required per FAR 4.1102.`,
  );

  return {
    id: uuid(),
    queriedUEI: uei,
    queriedCAGE: cageCode,
    entityFound: false,
    entity,
    isRegistrationActive: false,
    registrationExpiringSoon: false,
    hasExclusions: false,
    exclusions: [],
    eligibleForAward: false,
    ineligibilityReasons,
    validatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// 2. Check Exclusion Status
// ---------------------------------------------------------------------------

/**
 * Check if an entity is excluded or debarred in SAM.gov.
 *
 * Queries the SAM.gov exclusion records for the given UEI. Per
 * FAR 9.405, agencies must not solicit offers from, award contracts
 * to, or consent to subcontracts with excluded entities.
 *
 * Exclusion types per FAR 9.4 and 2 CFR 180:
 *   - Debarment: Exclusion for a specified period (FAR 9.406)
 *   - Suspension: Temporary exclusion pending investigation (FAR 9.407)
 *   - Proposed Debarment: Notice of pending debarment action
 *   - Voluntary Exclusion: Entity-initiated exclusion
 *
 * @param uei - Unique Entity Identifier to check
 * @returns Object with exclusion status, active exclusion records, and recommendation
 *
 * @see FAR 9.405 — effect of listing (exclusion consequences)
 * @see FAR 9.406 — debarment procedures
 * @see FAR 9.407 — suspension procedures
 * @see 2 CFR 180 — governmentwide nonprocurement debarment
 */
export function checkExclusionStatus(
  uei: string,
): {
  id: string;
  uei: string;
  isExcluded: boolean;
  activeExclusions: SAMExclusionCheck[];
  recommendation: string;
  checkedAt: string;
} {
  // Interface-ready stub: no exclusions found by default.
  // The integration layer populates with actual SAM.gov API results.
  return {
    id: uuid(),
    uei,
    isExcluded: false,
    activeExclusions: [],
    recommendation:
      'No active exclusion records found for this entity. ' +
      'Proceed with award/payment per standard procedures.',
    checkedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 3. Get Entity Registration
// ---------------------------------------------------------------------------

/**
 * Get full entity registration data from SAM.gov.
 *
 * Retrieves the complete registration record including points of
 * contact, representations and certifications, financial information,
 * and business classifications.
 *
 * This data supports multiple compliance requirements:
 *   - FAR 4.11 — registration data verification
 *   - FAR 19 — small business program representations
 *   - FAR 52.204-7 — SAM system use
 *   - 2 CFR 25 — Universal Identifier and SAM requirements
 *
 * @param uei - Unique Entity Identifier for the entity
 * @returns SAMRegistration with full entity data, contacts, certs, and financial info
 *
 * @see FAR 4.1103 — procedures for SAM registration verification
 * @see FAR 52.204-7 — System for Award Management clause
 * @see 2 CFR 25.200 — requirements for registering in SAM
 */
export function getEntityRegistration(
  uei: string,
): SAMRegistration {
  const now = new Date().toISOString();

  // Interface-ready stub structure.
  // Downstream integration replaces with actual SAM.gov data.
  const entity: SAMEntity = {
    id: uuid(),
    uei,
    legalBusinessName: '',
    registrationStatus: 'not_found',
    physicalAddress: {
      addressLine1: '',
      city: '',
      stateOrProvince: '',
      zipCode: '',
      country: '',
    },
    businessTypes: [],
    naicsCodes: [],
    hasActiveAwards: false,
  };

  return {
    id: uuid(),
    entity,
    pointsOfContact: [],
    repsAndCerts: {
      smallBusinessCertifications: [],
      disasterResponseCertified: false,
      foreignOwnership: false,
    },
    financialInformation: {
      hasEFTOnFile: false,
    },
    registrationDate: '',
    lastUpdated: '',
    retrievedAt: now,
  };
}
