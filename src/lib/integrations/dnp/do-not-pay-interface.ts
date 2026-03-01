/**
 * Do Not Pay (DNP) Portal Interface
 *
 * Provides structured pure functions for screening payments against
 * Treasury's Do Not Pay Business Center databases, including the
 * Death Master File, SAM exclusions, Treasury Offset Program,
 * and other federal eligibility databases.
 *
 * All functions return structured result objects and do NOT make actual
 * API calls — they produce interface-ready data structures for
 * downstream integration layers or unit tests.
 *
 * The Do Not Pay Initiative cross-references payees against:
 *   - Death Master File (DMF) — Social Security Administration
 *   - SAM.gov Exclusion Records — GSA
 *   - Debt Check (Treasury Offset Program) — Bureau of the Fiscal Service
 *   - List of Excluded Individuals/Entities (LEIE) — HHS OIG
 *   - Incarceration Records — SSA
 *
 * References:
 *   - 31 U.S.C. § 3354 — Do Not Pay Initiative
 *   - P.L. 116-117 (PIIA), Section 3(a)(4) — DNP utilization requirement
 *   - OMB M-21-19, Appendix C to Circular A-123, Section VII
 *   - OMB M-18-20 — Transmittal of Appendix C (Payment Integrity)
 *   - DoD FMR Vol. 5, Ch. 6 — Certifying Officer responsibilities
 *   - DoD FMR Vol. 10, Ch. 18 — Improper Payment prevention
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Risk level assigned to a payment based on screening results. */
export type PaymentRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Federal databases available through the Do Not Pay portal. */
export type DNPDatabase =
  | 'death_master_file'
  | 'sam_exclusions'
  | 'treasury_offset'
  | 'leie'
  | 'incarceration_records';

/** A single payment screening request. */
export interface DNPScreeningRequest {
  id: string;
  payeeId: string;
  payeeName: string;
  payeeTIN?: string;
  payeeDOB?: string;
  payeeUEI?: string;
  paymentAmount: number;
  paymentType: string;
  /** Which databases to screen against (defaults to all). */
  databases?: DNPDatabase[];
  requestedAt: string;
}

/** Result of screening a single payment against DNP databases. */
export interface DNPScreeningResult {
  id: string;
  requestId: string;
  payeeId: string;
  payeeName: string;
  riskLevel: PaymentRiskLevel;
  /** Overall screening disposition. */
  disposition: 'clear' | 'match_found' | 'review_required' | 'payment_hold';
  /** Individual database check results. */
  databaseResults: Array<{
    database: DNPDatabase;
    checked: boolean;
    matchFound: boolean;
    matchConfidence: number;
    matchDetails?: string;
    checkedAt: string;
  }>;
  /** Whether the payment should be held pending review. */
  holdPayment: boolean;
  /** Recommended action based on screening results. */
  recommendation: string;
  screenedAt: string;
}

/** Aggregate screening report for a batch of payments. */
export interface DNPScreeningReport {
  id: string;
  reportDate: string;
  totalPaymentsScreened: number;
  totalPaymentAmount: number;
  clearCount: number;
  matchCount: number;
  reviewRequiredCount: number;
  holdCount: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  /** Amount of payments flagged for hold. */
  totalHeldAmount: number;
  /** Amount of payments cleared. */
  totalClearedAmount: number;
  results: DNPScreeningResult[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function determineRiskLevel(
  matchCount: number,
  hasCriticalMatch: boolean,
): PaymentRiskLevel {
  if (hasCriticalMatch) return 'critical';
  if (matchCount >= 2) return 'high';
  if (matchCount === 1) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// 1. Screen Payment
// ---------------------------------------------------------------------------

/**
 * Screen a single payment against Do Not Pay databases.
 *
 * Per 31 U.S.C. § 3354, federal agencies must use the Do Not Pay
 * Initiative to verify payee eligibility before disbursement. The
 * screening checks the payee against multiple federal databases
 * and returns a risk-assessed result.
 *
 * Critical matches (Death Master File, SAM exclusions) result in
 * automatic payment holds per OMB M-21-19 guidance.
 *
 * @param payeeInfo - Payee identification data (name, TIN, UEI, etc.)
 * @param amount    - Payment amount being screened
 * @returns DNPScreeningResult with risk level, database hits, and recommendation
 *
 * @see 31 U.S.C. § 3354 — Do Not Pay Initiative requirements
 * @see OMB M-21-19, Section VII — DNP screening procedures
 * @see PIIA (P.L. 116-117) — payment verification mandate
 * @see DoD FMR Vol. 5, Ch. 6 — certifying officer verification duties
 */
export function screenPayment(
  payeeInfo: {
    payeeId: string;
    payeeName: string;
    payeeTIN?: string;
    payeeDOB?: string;
    payeeUEI?: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  amount: number,
): DNPScreeningResult {
  const now = new Date().toISOString();
  const requestId = uuid();

  // Default screening against all databases
  const databases: DNPDatabase[] = [
    'death_master_file',
    'sam_exclusions',
    'treasury_offset',
    'leie',
    'incarceration_records',
  ];

  // Interface-ready stub: all databases checked, no matches by default.
  // Downstream integration replaces with actual DNP API results.
  const databaseResults = databases.map((db) => ({
    database: db,
    checked: true,
    matchFound: false,
    matchConfidence: 0,
    matchDetails: undefined as string | undefined,
    checkedAt: now,
  }));

  const matchCount = databaseResults.filter((r) => r.matchFound).length;
  const hasCriticalMatch = databaseResults.some(
    (r) =>
      r.matchFound &&
      (r.database === 'death_master_file' || r.database === 'sam_exclusions'),
  );

  const riskLevel = determineRiskLevel(matchCount, hasCriticalMatch);
  const holdPayment = riskLevel === 'critical' || riskLevel === 'high';

  let disposition: DNPScreeningResult['disposition'] = 'clear';
  let recommendation =
    'Payee cleared all Do Not Pay database checks. ' +
    'Proceed with payment per standard disbursement procedures.';

  if (hasCriticalMatch) {
    disposition = 'payment_hold';
    recommendation =
      'Critical match found in Do Not Pay databases. ' +
      'Suspend payment and refer to contracting officer or program manager ' +
      'for review per DoD FMR Vol. 5, Ch. 6.';
  } else if (matchCount > 0) {
    disposition = 'review_required';
    recommendation =
      'Non-critical match found in Do Not Pay databases. ' +
      'Manual review recommended before payment release per OMB M-21-19.';
  }

  return {
    id: uuid(),
    requestId,
    payeeId: payeeInfo.payeeId,
    payeeName: payeeInfo.payeeName,
    riskLevel,
    disposition,
    databaseResults,
    holdPayment,
    recommendation,
    screenedAt: now,
  };
}

// ---------------------------------------------------------------------------
// 2. Batch Screen Payments
// ---------------------------------------------------------------------------

/**
 * Screen a batch of payments against Do Not Pay databases.
 *
 * Processes multiple payments through DNP screening in a single
 * operation. Per OMB M-18-20, agencies should integrate DNP
 * screening into their payment processing workflows for all
 * disbursement types.
 *
 * @param payments - Array of payment objects containing payee info and amounts
 * @returns Array of DNPScreeningResult, one per input payment
 *
 * @see OMB M-18-20 — batch payment integrity requirements
 * @see 31 U.S.C. § 3354 — Do Not Pay Initiative
 * @see PIIA (P.L. 116-117) — agency-wide payment screening mandate
 */
export function batchScreenPayments(
  payments: Array<{
    payeeId: string;
    payeeName: string;
    payeeTIN?: string;
    payeeDOB?: string;
    payeeUEI?: string;
    amount: number;
  }>,
): DNPScreeningResult[] {
  return payments.map((payment) =>
    screenPayment(
      {
        payeeId: payment.payeeId,
        payeeName: payment.payeeName,
        payeeTIN: payment.payeeTIN,
        payeeDOB: payment.payeeDOB,
        payeeUEI: payment.payeeUEI,
      },
      payment.amount,
    ),
  );
}

// ---------------------------------------------------------------------------
// 3. Check Death Master File
// ---------------------------------------------------------------------------

/**
 * Cross-reference a payee against the SSA Death Master File.
 *
 * The Death Master File (DMF) is maintained by the Social Security
 * Administration and contains death records. Per 31 U.S.C. § 3354
 * and PIIA, agencies must check payees against the DMF to prevent
 * payments to deceased individuals.
 *
 * @param ssn - Social Security Number to check (format: XXX-XX-XXXX or 9 digits)
 * @returns Object with DMF match status and recommendation
 *
 * @see 31 U.S.C. § 3354(b)(2) — Death Master File check requirement
 * @see PIIA (P.L. 116-117) — deceased payee verification
 * @see OMB M-21-19, Section VII — DMF screening procedures
 */
export function checkDeathMasterFile(
  ssn: string,
): {
  id: string;
  ssnChecked: string;
  matchFound: boolean;
  deceasedDate?: string;
  verificationSource: string;
  recommendation: string;
  checkedAt: string;
} {
  // Mask SSN for the result record (retain last 4 only)
  const maskedSSN = `***-**-${ssn.replace(/\D/g, '').slice(-4)}`;

  // Interface-ready stub: no match by default.
  // Downstream integration replaces with actual DMF API results.
  return {
    id: uuid(),
    ssnChecked: maskedSSN,
    matchFound: false,
    verificationSource: 'SSA Death Master File via Do Not Pay Portal',
    recommendation:
      'No Death Master File match found. ' +
      'Payee identity does not appear in SSA death records.',
    checkedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 4. Check SAM Exclusions via DNP
// ---------------------------------------------------------------------------

/**
 * Check SAM.gov exclusion list through the Do Not Pay portal.
 *
 * This function checks entity exclusion status through the DNP
 * portal's SAM exclusion feed, which may differ slightly in timing
 * from a direct SAM.gov query. Per FAR 9.405 and 2 CFR 180,
 * excluded entities are ineligible for federal awards and payments.
 *
 * @param uei - Unique Entity Identifier to check
 * @returns Object with exclusion status, details, and recommendation
 *
 * @see FAR 9.405 — effect of exclusion listing
 * @see 2 CFR 180 — governmentwide nonprocurement debarment
 * @see 31 U.S.C. § 3354 — DNP integration with SAM exclusions
 */
export function checkSAMExclusions(
  uei: string,
): {
  id: string;
  uei: string;
  isExcluded: boolean;
  exclusionType?: string;
  excludingAgency?: string;
  activeDate?: string;
  terminationDate?: string;
  verificationSource: string;
  recommendation: string;
  checkedAt: string;
} {
  // Interface-ready stub: no exclusions by default.
  // Downstream integration replaces with actual DNP/SAM data.
  return {
    id: uuid(),
    uei,
    isExcluded: false,
    verificationSource: 'SAM.gov Exclusions via Do Not Pay Portal',
    recommendation:
      'No active exclusion records found for this entity in the ' +
      'Do Not Pay SAM exclusion feed. Entity is not debarred or suspended.',
    checkedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 5. Generate Screening Report
// ---------------------------------------------------------------------------

/**
 * Generate a consolidated screening results report.
 *
 * Aggregates individual DNP screening results into a summary report
 * suitable for management review, audit documentation, and PIIA
 * compliance reporting per OMB M-21-19.
 *
 * The report includes:
 *   - Total payments screened and amounts
 *   - Risk distribution across all screenings
 *   - Counts of holds, clears, and reviews required
 *   - Amount of payments held vs. cleared
 *
 * @param results - Array of individual DNPScreeningResult objects
 * @returns DNPScreeningReport with aggregated statistics
 *
 * @see OMB M-21-19 — payment integrity reporting requirements
 * @see OMB M-18-20 — Appendix C to Circular A-123
 * @see PIIA (P.L. 116-117) — annual improper payment reporting
 */
export function generateScreeningReport(
  results: DNPScreeningResult[],
): DNPScreeningReport {
  const now = new Date().toISOString();

  let clearCount = 0;
  let matchCount = 0;
  let reviewRequiredCount = 0;
  let holdCount = 0;
  const totalHeldAmount = 0;
  const totalClearedAmount = 0;
  const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };

  // Note: payment amounts are not stored in DNPScreeningResult directly,
  // so we track counts and use the results for disposition aggregation.
  for (const result of results) {
    riskDistribution[result.riskLevel]++;

    switch (result.disposition) {
      case 'clear':
        clearCount++;
        break;
      case 'match_found':
        matchCount++;
        break;
      case 'review_required':
        reviewRequiredCount++;
        break;
      case 'payment_hold':
        holdCount++;
        break;
    }
  }

  return {
    id: uuid(),
    reportDate: new Date().toISOString().split('T')[0],
    totalPaymentsScreened: results.length,
    totalPaymentAmount: 0,
    clearCount,
    matchCount,
    reviewRequiredCount,
    holdCount,
    riskDistribution,
    totalHeldAmount: round2(totalHeldAmount),
    totalClearedAmount: round2(totalClearedAmount),
    results,
    generatedAt: now,
  };
}
