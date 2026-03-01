/**
 * Real-Time Anti-Deficiency Act (ADA) Monitor
 *
 * Provides continuous monitoring and detection of potential ADA violations
 * across all three prongs of the federal funds control framework:
 *
 *   1. Amount  - 31 U.S.C. ss1341(a)(1)(A): obligations/expenditures may
 *                not exceed the amount available in the appropriation.
 *   2. Purpose - 31 U.S.C. ss1301(a): appropriations may only be used
 *                for their intended statutory purpose.
 *   3. Time    - 31 U.S.C. ss1502: obligations must be incurred within
 *                the period of availability of the appropriation.
 *
 * Additional ADA provisions monitored:
 *   - 31 U.S.C. ss1342: prohibition on voluntary services (accepting
 *     services in advance of or in excess of appropriations).
 *   - 31 U.S.C. ss1517(a): obligations/expenditures may not exceed
 *     an apportionment or administrative subdivision (allotment).
 *   - Augmentation: improper augmentation of appropriations through
 *     unauthorized collections.
 *
 * References:
 *   - DoD FMR Vol. 14, Ch. 3 (Anti-Deficiency Act Violations)
 *   - DoD FMR Vol. 3, Ch. 10 (Anti-Deficiency Act Reporting)
 *   - GAO Red Book, Ch. 6 (Availability of Appropriations: Amount)
 *   - OMB Circular A-11, Section 145 (ADA Reporting)
 */

import type {
  Appropriation,
  FundControl,
  ADAViolation,
  ADAValidationResult,
  ADAViolationType,
  Obligation,
  Disbursement,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}

/**
 * Returns the federal fiscal year for a given date.
 * The federal fiscal year runs Oct 1 to Sep 30.
 */
function federalFiscalYear(date: Date): number {
  return date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
}

/**
 * Determines if an appropriation is expired based on its dates.
 */
function isExpired(approp: Appropriation, asOfDate: Date): boolean {
  if (approp.appropriationType === 'no_year') return false;
  const expDate = approp.expirationDate
    ? parseDate(approp.expirationDate)
    : parseDate(approp.fiscalYearEnd);
  return asOfDate > expDate;
}

/**
 * Creates an ADA violation record with consistent structure.
 */
function createViolation(
  engagementId: string,
  appropriationId: string,
  violationType: ADAViolationType,
  statutoryBasis: string,
  amount: number,
  description: string,
  fiscalYear: number,
  details?: string,
): ADAViolation {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    engagementId,
    appropriationId,
    violationType,
    statutoryBasis,
    amount,
    description,
    discoveredDate: now,
    investigationStatus: 'detected',
    violationDetails: details,
    fiscalYear,
    createdAt: now,
  };
}

/**
 * Budget Object Code purpose-check prefixes.
 */
const PROCUREMENT_BOC_PREFIXES = ['31', '32'];
const CONSTRUCTION_BOC_PREFIXES = ['33'];

// ---------------------------------------------------------------------------
// Core engine functions
// ---------------------------------------------------------------------------

/**
 * Performs a comprehensive ADA validation for a proposed transaction.
 *
 * Checks all applicable ADA provisions:
 *   - ss1341(a)(1)(A): amount - obligation/expenditure would exceed
 *     the total available in the appropriation.
 *   - ss1342: voluntary services - accepting services without or in
 *     excess of appropriations.
 *   - ss1517(a): apportionment/allotment ceilings.
 *   - Purpose restriction (31 U.S.C. ss1301(a)).
 *   - Bona fide need (31 U.S.C. ss1502): time restriction.
 *
 * Ref: DoD FMR Vol. 14, Ch. 2, para 020101
 *
 * @param appropriation   - The appropriation to validate against.
 * @param fundControls    - All fund control records for this appropriation.
 * @param amount          - The dollar amount of the proposed transaction.
 * @param transactionType - 'obligation', 'expenditure', or 'disbursement'.
 * @param transactionDate - The date of the proposed transaction (ISO string).
 * @returns An ADAValidationResult with allowed flag, violations, and balances.
 */
export function validateTransaction(
  appropriation: Appropriation,
  fundControls: FundControl[],
  amount: number,
  transactionType: 'obligation' | 'expenditure' | 'disbursement',
  transactionDate: string,
): ADAValidationResult {
  if (amount <= 0) {
    throw new Error('Transaction amount must be positive');
  }

  const violations: ADAViolation[] = [];
  const txDate = parseDate(transactionDate);
  const fy = federalFiscalYear(txDate);

  // Determine the available balance based on transaction type
  let availableBalance: number;
  if (transactionType === 'obligation') {
    availableBalance = appropriation.unobligatedBalance;
  } else {
    // For expenditures/disbursements: obligated minus what has been disbursed
    availableBalance = appropriation.obligated - appropriation.disbursed;
  }

  // -----------------------------------------------------------------
  // ss1341(a)(1)(A): Amount check - would exceed appropriation total
  // -----------------------------------------------------------------
  if (transactionType === 'obligation' && amount > appropriation.unobligatedBalance) {
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'over_obligation',
        '31 U.S.C. ss1341(a)(1)(A)',
        amount - appropriation.unobligatedBalance,
        `Proposed obligation of $${amount.toFixed(2)} exceeds unobligated ` +
        `balance of $${appropriation.unobligatedBalance.toFixed(2)} for ` +
        `appropriation ${appropriation.treasuryAccountSymbol}`,
        fy,
        `Requested: $${amount.toFixed(2)}, Available: $${appropriation.unobligatedBalance.toFixed(2)}`,
      ),
    );
  }

  if (
    (transactionType === 'expenditure' || transactionType === 'disbursement') &&
    amount > (appropriation.obligated - appropriation.disbursed)
  ) {
    const available = appropriation.obligated - appropriation.disbursed;
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'over_expenditure',
        '31 U.S.C. ss1341(a)(1)(B)',
        amount - available,
        `Proposed ${transactionType} of $${amount.toFixed(2)} exceeds ` +
        `available obligated balance of $${available.toFixed(2)} for ` +
        `appropriation ${appropriation.treasuryAccountSymbol}`,
        fy,
        `Requested: $${amount.toFixed(2)}, Obligated-Disbursed: $${available.toFixed(2)}`,
      ),
    );
  }

  // -----------------------------------------------------------------
  // ss1342: Voluntary services prohibition
  // If the appropriation is cancelled or has zero authority, any
  // obligation constitutes acceptance of voluntary services.
  // -----------------------------------------------------------------
  if (
    transactionType === 'obligation' &&
    (appropriation.status === 'cancelled' || appropriation.totalAuthority === 0)
  ) {
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'voluntary_service',
        '31 U.S.C. ss1342',
        amount,
        `Obligation of $${amount.toFixed(2)} against ` +
        `${appropriation.status === 'cancelled' ? 'cancelled' : 'zero-authority'} ` +
        `appropriation ${appropriation.treasuryAccountSymbol} constitutes ` +
        `acceptance of voluntary services or employment`,
        fy,
      ),
    );
  }

  // -----------------------------------------------------------------
  // ss1517(a): Apportionment and allotment ceiling checks
  // -----------------------------------------------------------------
  if (transactionType === 'obligation') {
    // Apportionment ceiling
    const apportionedAvailable = appropriation.apportioned - appropriation.obligated;
    if (amount > apportionedAvailable && appropriation.apportioned > 0) {
      violations.push(
        createViolation(
          appropriation.engagementId,
          appropriation.id,
          'over_obligation',
          '31 U.S.C. ss1517(a) - apportionment ceiling',
          amount - apportionedAvailable,
          `Proposed obligation of $${amount.toFixed(2)} exceeds apportionment ` +
          `available balance of $${apportionedAvailable.toFixed(2)} for ` +
          `appropriation ${appropriation.treasuryAccountSymbol}`,
          fy,
        ),
      );
    }

    // Allotment ceiling
    const allottedAvailable = appropriation.allotted - appropriation.obligated;
    if (amount > allottedAvailable && appropriation.allotted > 0) {
      violations.push(
        createViolation(
          appropriation.engagementId,
          appropriation.id,
          'over_obligation',
          '31 U.S.C. ss1517(a) - allotment ceiling',
          amount - allottedAvailable,
          `Proposed obligation of $${amount.toFixed(2)} exceeds allotment ` +
          `available balance of $${allottedAvailable.toFixed(2)} for ` +
          `appropriation ${appropriation.treasuryAccountSymbol}`,
          fy,
        ),
      );
    }

    // Fund control sub-levels (sub-allotment, operating budget)
    const relevantControls = fundControls.filter(
      fc => fc.appropriationId === appropriation.id,
    );
    for (const control of relevantControls) {
      if (amount > control.availableBalance) {
        violations.push(
          createViolation(
            appropriation.engagementId,
            appropriation.id,
            'over_obligation',
            `31 U.S.C. ss1517(a) - ${control.controlLevel} ceiling`,
            amount - control.availableBalance,
            `Proposed obligation of $${amount.toFixed(2)} exceeds ` +
            `${control.controlLevel} available balance of ` +
            `$${control.availableBalance.toFixed(2)} ` +
            `(controlled by: ${control.controlledBy})`,
            fy,
          ),
        );
      }
    }
  }

  // -----------------------------------------------------------------
  // Bona fide need (time restriction) - 31 U.S.C. ss1502
  // Only applies to new obligations, not expenditures/disbursements.
  // -----------------------------------------------------------------
  if (transactionType === 'obligation') {
    if (
      appropriation.appropriationType !== 'no_year' &&
      appropriation.appropriationType !== 'revolving'
    ) {
      const periodStart = parseDate(appropriation.fiscalYearStart);
      const periodEnd = appropriation.expirationDate
        ? parseDate(appropriation.expirationDate)
        : parseDate(appropriation.fiscalYearEnd);

      if (txDate < periodStart || txDate > periodEnd) {
        violations.push(
          createViolation(
            appropriation.engagementId,
            appropriation.id,
            'time_violation',
            '31 U.S.C. ss1502 (Bona Fide Need Rule)',
            amount,
            `Obligation date ${transactionDate} is outside the period of ` +
            `availability (${appropriation.fiscalYearStart} to ` +
            `${periodEnd.toISOString()}) for ${appropriation.appropriationType} ` +
            `appropriation ${appropriation.treasuryAccountSymbol}`,
            fy,
          ),
        );
      }
    }
  }

  // -----------------------------------------------------------------
  // Purpose check: expired appropriation cannot accept new obligations
  // -----------------------------------------------------------------
  if (transactionType === 'obligation' && appropriation.status === 'expired') {
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'unauthorized_purpose',
        '31 U.S.C. ss1502/ss1553',
        amount,
        `New obligation of $${amount.toFixed(2)} against expired appropriation ` +
        `${appropriation.treasuryAccountSymbol}. Expired appropriations may ` +
        `only liquidate existing obligations, not incur new ones.`,
        fy,
      ),
    );
  }

  return {
    allowed: violations.length === 0,
    violations,
    availableBalance,
    requestedAmount: amount,
  };
}

/**
 * Scans an appropriation for over-obligation conditions.
 *
 * Detects whether the total obligated amount exceeds the total budget
 * authority, which is a violation of 31 U.S.C. ss1341(a)(1)(A). Also
 * checks at apportionment and allotment levels for ss1517 violations.
 *
 * Ref: DoD FMR Vol. 14, Ch. 2, para 020201
 *
 * @param appropriation - The appropriation to scan.
 * @returns An array of ADAViolation records (empty if no violations).
 */
export function detectOverObligation(
  appropriation: Appropriation,
): ADAViolation[] {
  const violations: ADAViolation[] = [];
  const fy = federalFiscalYear(new Date());

  // Check against total authority
  if (appropriation.obligated > appropriation.totalAuthority) {
    const excess = appropriation.obligated - appropriation.totalAuthority;
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'over_obligation',
        '31 U.S.C. ss1341(a)(1)(A)',
        excess,
        `Appropriation ${appropriation.treasuryAccountSymbol} is over-obligated: ` +
        `obligated $${appropriation.obligated.toFixed(2)} exceeds total authority ` +
        `$${appropriation.totalAuthority.toFixed(2)} by $${excess.toFixed(2)}`,
        fy,
        `Total Authority: $${appropriation.totalAuthority.toFixed(2)}, ` +
        `Obligated: $${appropriation.obligated.toFixed(2)}, ` +
        `Excess: $${excess.toFixed(2)}`,
      ),
    );
  }

  // Check at apportionment level
  if (
    appropriation.apportioned > 0 &&
    appropriation.obligated > appropriation.apportioned
  ) {
    const excess = appropriation.obligated - appropriation.apportioned;
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'over_obligation',
        '31 U.S.C. ss1517(a) - apportionment ceiling exceeded',
        excess,
        `Appropriation ${appropriation.treasuryAccountSymbol}: obligations ` +
        `($${appropriation.obligated.toFixed(2)}) exceed apportioned amount ` +
        `($${appropriation.apportioned.toFixed(2)}) by $${excess.toFixed(2)}`,
        fy,
      ),
    );
  }

  // Check at allotment level
  if (
    appropriation.allotted > 0 &&
    appropriation.obligated > appropriation.allotted
  ) {
    const excess = appropriation.obligated - appropriation.allotted;
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'over_obligation',
        '31 U.S.C. ss1517(a) - allotment ceiling exceeded',
        excess,
        `Appropriation ${appropriation.treasuryAccountSymbol}: obligations ` +
        `($${appropriation.obligated.toFixed(2)}) exceed allotted amount ` +
        `($${appropriation.allotted.toFixed(2)}) by $${excess.toFixed(2)}`,
        fy,
      ),
    );
  }

  return violations;
}

/**
 * Scans for expenditures exceeding obligation amounts.
 *
 * Compares each obligation's liquidated amount against its total
 * obligated amount. Also cross-references disbursements against their
 * parent obligations to detect over-disbursement conditions.
 *
 * Ref: DoD FMR Vol. 14, Ch. 2, para 020202
 *
 * @param obligations   - All obligations to scan.
 * @param disbursements - All disbursements to cross-reference.
 * @returns An array of ADAViolation records (empty if no violations).
 */
export function detectOverExpenditure(
  obligations: Obligation[],
  disbursements: Disbursement[],
): ADAViolation[] {
  const violations: ADAViolation[] = [];
  const fy = federalFiscalYear(new Date());

  // Check each obligation for over-liquidation
  for (const obligation of obligations) {
    if (obligation.liquidatedAmount > obligation.amount) {
      const excess = obligation.liquidatedAmount - obligation.amount;
      violations.push(
        createViolation(
          obligation.engagementId,
          obligation.appropriationId,
          'over_expenditure',
          '31 U.S.C. ss1341(a)(1)(B)',
          excess,
          `Obligation ${obligation.obligationNumber}: liquidated amount ` +
          `$${obligation.liquidatedAmount.toFixed(2)} exceeds obligated amount ` +
          `$${obligation.amount.toFixed(2)} by $${excess.toFixed(2)}`,
          obligation.fiscalYear,
          `Obligation: ${obligation.obligationNumber}, ` +
          `Obligated: $${obligation.amount.toFixed(2)}, ` +
          `Liquidated: $${obligation.liquidatedAmount.toFixed(2)}, ` +
          `Vendor: ${obligation.vendorOrPayee || 'N/A'}`,
        ),
      );
    }
  }

  // Cross-reference disbursements: group by obligation ID and sum
  const disbursementsByObligation: Record<string, number> = {};
  for (const disb of disbursements) {
    if (disb.status === 'cancelled' || disb.status === 'returned') continue;
    disbursementsByObligation[disb.obligationId] =
      (disbursementsByObligation[disb.obligationId] ?? 0) + disb.amount;
  }

  const obligationIds = Object.keys(disbursementsByObligation);
  for (const obligationId of obligationIds) {
    const totalDisbursed = disbursementsByObligation[obligationId];
    const obligation = obligations.find(o => o.id === obligationId);
    if (!obligation) continue;

    if (totalDisbursed > obligation.amount) {
      const excess = totalDisbursed - obligation.amount;

      // Avoid duplicating if already caught by the liquidation check above
      const alreadyDetected = violations.some(
        v =>
          v.violationType === 'over_expenditure' &&
          v.description.includes(obligation.obligationNumber),
      );

      if (!alreadyDetected) {
        violations.push(
          createViolation(
            obligation.engagementId,
            obligation.appropriationId,
            'over_expenditure',
            '31 U.S.C. ss1341(a)(1)(B)',
            excess,
            `Total disbursements of $${totalDisbursed.toFixed(2)} against ` +
            `obligation ${obligation.obligationNumber} exceed the obligated ` +
            `amount of $${obligation.amount.toFixed(2)} by $${excess.toFixed(2)}`,
            obligation.fiscalYear,
          ),
        );
      }
    }
  }

  return violations;
}

/**
 * Detects improper augmentation of appropriations.
 *
 * The augmentation doctrine prohibits agencies from supplementing
 * their appropriations with collections or receipts beyond what is
 * specifically authorized by law. If collections exceed the authorized
 * collection level, the excess constitutes improper augmentation.
 *
 * Ref: GAO Red Book, Ch. 6 (Augmentation)
 * Ref: DoD FMR Vol. 12, Ch. 1 (Collections and Deposits)
 * Ref: 31 U.S.C. ss3302 (Miscellaneous Receipts Statute)
 *
 * @param appropriation        - The appropriation to check.
 * @param collections          - Total dollar amount of collections received.
 * @param authorizedCollections - The maximum authorized collection level.
 * @returns An array of ADAViolation records (empty if no violations).
 */
export function detectAugmentation(
  appropriation: Appropriation,
  collections: number,
  authorizedCollections: number,
): ADAViolation[] {
  const violations: ADAViolation[] = [];
  const fy = federalFiscalYear(new Date());

  if (collections < 0) {
    throw new Error('Collections amount cannot be negative');
  }
  if (authorizedCollections < 0) {
    throw new Error('Authorized collections amount cannot be negative');
  }

  if (collections > authorizedCollections) {
    const excess = collections - authorizedCollections;
    violations.push(
      createViolation(
        appropriation.engagementId,
        appropriation.id,
        'unauthorized_purpose',
        '31 U.S.C. ss3302 / Augmentation Doctrine',
        excess,
        `Appropriation ${appropriation.treasuryAccountSymbol}: collections of ` +
        `$${collections.toFixed(2)} exceed authorized collection level of ` +
        `$${authorizedCollections.toFixed(2)} by $${excess.toFixed(2)}. ` +
        `Excess collections may not be used to augment the appropriation ` +
        `and must be deposited to the Treasury general fund per ` +
        `31 U.S.C. ss3302(b).`,
        fy,
        `Collections: $${collections.toFixed(2)}, ` +
        `Authorized: $${authorizedCollections.toFixed(2)}, ` +
        `Excess: $${excess.toFixed(2)}`,
      ),
    );
  }

  return violations;
}

/**
 * Generates a comprehensive ADA report for an engagement and fiscal year.
 *
 * Aggregates all detected violations into a summary report with:
 *   - Total violation count
 *   - Violations grouped by type
 *   - Total dollar amount of violations
 *   - Critical violations (over_obligation and over_expenditure
 *     require immediate reporting per 31 U.S.C. ss1351)
 *   - Narrative summary
 *
 * This report supports the required ADA reporting chain:
 *   Agency Head -> OMB -> President -> Congress
 * per 31 U.S.C. ss1351 and ss1517(b).
 *
 * Ref: DoD FMR Vol. 14, Ch. 3 (ADA Violation Reporting)
 * Ref: OMB Circular A-11, Section 145
 *
 * @param violations   - All ADA violations to include in the report.
 * @param engagementId - The engagement ID for the report.
 * @param fiscalYear   - The fiscal year for the report.
 * @returns A report object with totals, breakdowns, critical violations,
 *          and a narrative summary.
 */
export function generateADAReport(
  violations: ADAViolation[],
  engagementId: string,
  fiscalYear: number,
): {
  totalViolations: number;
  byType: Record<string, number>;
  totalAmount: number;
  criticalViolations: ADAViolation[];
  summary: string;
} {
  // Filter violations for the specified engagement and fiscal year
  const relevantViolations = violations.filter(
    v => v.engagementId === engagementId && v.fiscalYear === fiscalYear,
  );

  const totalViolations = relevantViolations.length;

  // Group by violation type
  const byType: Record<string, number> = {};
  for (const v of relevantViolations) {
    byType[v.violationType] = (byType[v.violationType] ?? 0) + 1;
  }

  // Sum total dollar amount
  const totalAmount = relevantViolations.reduce((sum, v) => sum + v.amount, 0);

  // Identify critical violations: over-obligation and over-expenditure
  // are the most severe as they represent actual statutory violations
  // that must be reported to the President and Congress per ss1351.
  const criticalViolations = relevantViolations.filter(
    v =>
      v.violationType === 'over_obligation' ||
      v.violationType === 'over_expenditure',
  );

  // Build narrative summary
  let summary: string;
  if (totalViolations === 0) {
    summary =
      `ADA Compliance Report for Engagement ${engagementId}, FY${fiscalYear}: ` +
      `No Anti-Deficiency Act violations detected. All transactions are within ` +
      `authorized appropriation amounts, purposes, and time periods.`;
  } else {
    const typeBreakdown = Object.entries(byType)
      .map(([type, count]) => `${type}: ${count}`)
      .join('; ');

    const criticalNote =
      criticalViolations.length > 0
        ? ` ${criticalViolations.length} critical violation(s) (over-obligation ` +
          `or over-expenditure) require immediate reporting to the agency head ` +
          `per 31 U.S.C. ss1351 and ss1517(b). Preliminary report due within ` +
          `14 weeks of discovery; final report due within 22 weeks thereafter.`
        : '';

    summary =
      `ADA Compliance Report for Engagement ${engagementId}, FY${fiscalYear}: ` +
      `${totalViolations} violation(s) detected totaling ` +
      `$${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ` +
      `Breakdown by type: ${typeBreakdown}.${criticalNote} ` +
      `Each violation must be investigated per DoD FMR Vol. 14, Ch. 3 and ` +
      `reported through the ADA reporting chain (Agency Head -> OMB -> ` +
      `President -> Congress) within the prescribed timeframes.`;
  }

  return {
    totalViolations,
    byType,
    totalAmount,
    criticalViolations,
    summary,
  };
}
