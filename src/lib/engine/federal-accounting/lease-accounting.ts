/**
 * SFFAS 54 Lease Accounting Engine
 *
 * Implements the accounting model for federal leases under SFFAS 54 "Leases"
 * (effective for reporting periods beginning after September 30, 2026). This
 * engine provides pure-function utilities for lease classification, present
 * value measurement, amortization scheduling, modification remeasurement,
 * USSGL journal entry generation, and OMB A-136 note disclosure assembly.
 *
 * Key accounting treatments:
 *   - Lessees recognize a right-of-use lease asset and a corresponding lease
 *     liability at the commencement date for all leases except short-term
 *     (<=24 months) and certain intragovernmental leases.
 *   - Lease assets are amortized on a straight-line basis over the shorter
 *     of the lease term or the asset's useful life.
 *   - Lease liabilities are reduced using the effective-interest method.
 *   - Modifications that change the term, payment amounts, or index/rate
 *     trigger a full remeasurement of the liability.
 *
 * References:
 *   - SFFAS 54 (Leases)
 *   - SFFAS 62 (Amendments to Leases)
 *   - DoD FMR Vol. 4, Ch. 26 (Lease Accounting)
 *   - OMB Circular A-136, Section II.3.2 (Note Disclosures for Leases)
 *   - USSGL TFM Supplement, Section V (Lease Accounts 1750xx / 2940xx)
 */

import type { LeaseRecord } from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaseType = 'operating' | 'capital' | 'intragovernmental' | 'short_term_exempt';

export interface LeaseClassificationResult {
  leaseId: string;
  classification: LeaseType;
  reason: string;
  isExemptFromCapitalization: boolean;
  pvOfPayments: number;
  capitalizationThreshold: number;
  termThresholdMonths: number;
}

export interface PresentValueResult {
  success: boolean;
  pvOfPayments: number;
  discountRate: number;
  discountRateSource: 'implicit' | 'incremental_borrowing';
  totalUndiscountedPayments: number;
  numberOfPeriods: number;
  error?: string;
}

export interface LeaseAssetMeasurement {
  leaseId: string;
  leaseLiability: number;
  prepaidAmounts: number;
  initialDirectCosts: number;
  totalLeaseAsset: number;
}

export interface AmortizationPeriod {
  periodNumber: number;
  periodStartDate: string;
  periodEndDate: string;
  beginningAssetBalance: number;
  assetAmortization: number;
  endingAssetBalance: number;
  beginningLiabilityBalance: number;
  payment: number;
  interestExpense: number;
  principalReduction: number;
  endingLiabilityBalance: number;
}

export interface AmortizationScheduleResult {
  success: boolean;
  leaseId: string;
  schedule: AmortizationPeriod[];
  totalInterest: number;
  totalPrincipal: number;
  totalAssetAmortization: number;
  error?: string;
}

export type ModificationTrigger = 'term_change' | 'payment_change' | 'index_rate_change';

export interface LeaseModificationInput {
  leaseId: string;
  trigger: ModificationTrigger;
  effectiveDate: string;
  newLeaseTermMonths?: number;
  newAnnualPayment?: number;
  newDiscountRate?: number;
  remainingLiabilityBalance: number;
  remainingAssetBalance: number;
}

export interface LeaseModificationResult {
  success: boolean;
  leaseId: string;
  trigger: ModificationTrigger;
  priorLiabilityBalance: number;
  remeasuredLiability: number;
  liabilityAdjustment: number;
  priorAssetBalance: number;
  remeasuredAsset: number;
  assetAdjustment: number;
  error?: string;
}

export interface USSGLEntry {
  id: string;
  leaseId: string;
  entryType: 'initial_recognition' | 'periodic_amortization' | 'payment' | 'modification';
  debitAccount: string;
  debitAccountName: string;
  debitAmount: number;
  creditAccount: string;
  creditAccountName: string;
  creditAmount: number;
  memo: string;
  effectiveDate: string;
  fiscalYear: number;
}

export interface LeaseDisclosureData {
  fiscalYear: number;
  totalLeaseAssets: number;
  totalLeaseLiabilities: number;
  totalLeaseExpenseOperating: number;
  totalLeaseExpenseCapital: number;
  futurePaymentSchedule: FuturePaymentBucket[];
  leaseCountByClassification: Record<LeaseType, number>;
  significantAssumptions: string[];
  intragovernmentalLeaseCount: number;
  intragovernmentalLeaseTotal: number;
}

export interface FuturePaymentBucket {
  period: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default capitalization threshold when parameter lookup is unavailable. */
const DEFAULT_CAPITALIZATION_THRESHOLD = 100_000;

/** Default short-term lease term threshold in months per SFFAS 54. */
const DEFAULT_TERM_THRESHOLD_MONTHS = 24;

/** Number of months per year for annuity calculations. */
const MONTHS_PER_YEAR = 12;

// ---------------------------------------------------------------------------
// 1. Lease Classification
// ---------------------------------------------------------------------------

/**
 * Classify a lease under the SFFAS 54 framework.
 *
 * Classification hierarchy (evaluated in order):
 *   1. **Short-term exemption** -- lease term <= 24 months (per
 *      `DOD_LEASE_TERM_THRESHOLD_MONTHS`). These leases are expensed on a
 *      straight-line basis and do not require asset/liability recognition.
 *      Ref: SFFAS 54 para 28.
 *   2. **Intragovernmental** -- both lessee and lessor are federal entities.
 *      These follow the intragovernmental lease guidance in SFFAS 54 para 67
 *      and require elimination entries at the government-wide level.
 *   3. **Capital** -- present value of lease payments exceeds the
 *      capitalization threshold AND the lease term exceeds the term threshold.
 *      Ref: SFFAS 54 paras 18-26; DoD FMR Vol. 4, Ch. 26.
 *   4. **Operating** -- all remaining leases.
 *
 * @param lease      - The lease record to classify.
 * @param fiscalYear - The fiscal year for parameter lookups.
 * @returns A result object containing the classification and supporting data.
 */
export function classifyLease(
  lease: LeaseRecord,
  fiscalYear: number,
): LeaseClassificationResult {
  const termThreshold = getParameter(
    'DOD_LEASE_TERM_THRESHOLD_MONTHS',
    fiscalYear,
    undefined,
    DEFAULT_TERM_THRESHOLD_MONTHS,
  );
  const capThreshold = getParameter(
    'DOD_LEASE_CAPITALIZATION_THRESHOLD',
    fiscalYear,
    undefined,
    DEFAULT_CAPITALIZATION_THRESHOLD,
  );

  const pvResult = calculateLeasePresntValue(
    lease.annualPayment,
    lease.leaseTermMonths,
    lease.discountRate,
  );
  const pvOfPayments = pvResult.success ? pvResult.pvOfPayments : 0;

  // 1. Short-term exemption (SFFAS 54 para 28)
  if (lease.leaseTermMonths <= termThreshold) {
    return {
      leaseId: lease.id,
      classification: 'short_term_exempt',
      reason:
        `Lease term of ${lease.leaseTermMonths} months does not exceed the ` +
        `${termThreshold}-month threshold. Short-term lease exemption applies ` +
        `per SFFAS 54 para 28; no asset/liability recognition required.`,
      isExemptFromCapitalization: true,
      pvOfPayments,
      capitalizationThreshold: capThreshold,
      termThresholdMonths: termThreshold,
    };
  }

  // 2. Intragovernmental (SFFAS 54 para 67)
  if (lease.isIntragovernmental) {
    return {
      leaseId: lease.id,
      classification: 'intragovernmental',
      reason:
        `Lease between federal entities (lessee: ${lease.lesseeComponent}, ` +
        `lessor: ${lease.lessorEntity}). Intragovernmental lease guidance ` +
        `per SFFAS 54 para 67 applies. Elimination entries required at ` +
        `government-wide consolidation.`,
      isExemptFromCapitalization: false,
      pvOfPayments,
      capitalizationThreshold: capThreshold,
      termThresholdMonths: termThreshold,
    };
  }

  // 3. Capital lease (SFFAS 54 paras 18-26)
  if (pvOfPayments > capThreshold && lease.leaseTermMonths > termThreshold) {
    return {
      leaseId: lease.id,
      classification: 'capital',
      reason:
        `PV of lease payments ($${pvOfPayments.toLocaleString()}) exceeds the ` +
        `capitalization threshold ($${capThreshold.toLocaleString()}) and lease ` +
        `term (${lease.leaseTermMonths} months) exceeds ${termThreshold} months. ` +
        `Capital lease recognition required per SFFAS 54 paras 18-26; ` +
        `DoD FMR Vol. 4, Ch. 26.`,
      isExemptFromCapitalization: false,
      pvOfPayments,
      capitalizationThreshold: capThreshold,
      termThresholdMonths: termThreshold,
    };
  }

  // 4. Operating lease (default)
  return {
    leaseId: lease.id,
    classification: 'operating',
    reason:
      `Lease does not meet capital lease criteria. PV of payments ` +
      `($${pvOfPayments.toLocaleString()}) vs. threshold ` +
      `($${capThreshold.toLocaleString()}); term ${lease.leaseTermMonths} months ` +
      `vs. threshold ${termThreshold} months. Classified as operating lease ` +
      `per SFFAS 54. Expense recognized on a straight-line basis.`,
    isExemptFromCapitalization: true,
    pvOfPayments,
    capitalizationThreshold: capThreshold,
    termThresholdMonths: termThreshold,
  };
}

// ---------------------------------------------------------------------------
// 2. Present Value Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the present value of lease payments.
 *
 * Uses the standard ordinary annuity formula:
 *   PV = PMT x [(1 - (1 + r)^-n) / r]
 *
 * where PMT is the periodic payment (monthly), r is the monthly discount
 * rate, and n is the total number of periods.
 *
 * Discount rate selection per SFFAS 54 para 42:
 *   - If the rate implicit in the lease is readily determinable, use it.
 *   - Otherwise, use the lessee's estimated incremental borrowing rate
 *     (typically the Treasury borrowing rate of comparable maturity).
 *
 * @param annualPayment  - Total annual lease payment amount.
 * @param leaseTermMonths - Lease term in months.
 * @param discountRate    - Annual discount rate (decimal, e.g. 0.04 for 4%).
 *                          If 0 or undefined, the rate implicit in the lease
 *                          is not determinable and a default incremental
 *                          borrowing rate is used.
 * @param rateImplicitInLease - Optional rate implicit in the lease (decimal).
 * @returns A result object with PV and calculation details, or an error.
 */
export function calculateLeasePresntValue(
  annualPayment: number,
  leaseTermMonths: number,
  discountRate: number,
  rateImplicitInLease?: number,
): PresentValueResult {
  if (annualPayment <= 0) {
    return {
      success: false,
      pvOfPayments: 0,
      discountRate: 0,
      discountRateSource: 'incremental_borrowing',
      totalUndiscountedPayments: 0,
      numberOfPeriods: 0,
      error: 'Annual payment must be greater than zero.',
    };
  }

  if (leaseTermMonths <= 0) {
    return {
      success: false,
      pvOfPayments: 0,
      discountRate: 0,
      discountRateSource: 'incremental_borrowing',
      totalUndiscountedPayments: 0,
      numberOfPeriods: 0,
      error: 'Lease term must be greater than zero months.',
    };
  }

  // Select discount rate per SFFAS 54 para 42
  let selectedRate: number;
  let rateSource: 'implicit' | 'incremental_borrowing';

  if (rateImplicitInLease !== undefined && rateImplicitInLease > 0) {
    selectedRate = rateImplicitInLease;
    rateSource = 'implicit';
  } else if (discountRate > 0) {
    selectedRate = discountRate;
    rateSource = 'incremental_borrowing';
  } else {
    // Fallback to Treasury incremental borrowing rate
    selectedRate = 0.04;
    rateSource = 'incremental_borrowing';
  }

  const monthlyPayment = annualPayment / MONTHS_PER_YEAR;
  const monthlyRate = selectedRate / MONTHS_PER_YEAR;
  const n = leaseTermMonths;
  const totalUndiscounted = monthlyPayment * n;

  // Standard ordinary annuity PV formula
  // When monthly rate is effectively zero, PV equals undiscounted total
  let pvOfPayments: number;
  if (monthlyRate < 1e-10) {
    pvOfPayments = totalUndiscounted;
  } else {
    pvOfPayments = monthlyPayment * ((1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate);
  }

  return {
    success: true,
    pvOfPayments: Math.round(pvOfPayments * 100) / 100,
    discountRate: selectedRate,
    discountRateSource: rateSource,
    totalUndiscountedPayments: Math.round(totalUndiscounted * 100) / 100,
    numberOfPeriods: n,
  };
}

// ---------------------------------------------------------------------------
// 3. Lease Asset Initial Measurement
// ---------------------------------------------------------------------------

/**
 * Measure the initial value of a lease asset at the commencement date.
 *
 * Per SFFAS 54 paras 18-22, the lease asset is initially measured as the
 * sum of:
 *   1. The lease liability (PV of future lease payments)
 *   2. Lease payments made to the lessor at or before commencement
 *      (prepayments), less any lease incentives received
 *   3. Initial direct costs incurred by the lessee
 *
 * @param leaseId          - Identifier for the lease.
 * @param leaseLiability   - The initial lease liability (PV of payments).
 * @param prepaidAmounts   - Payments made at or before commencement.
 * @param initialDirectCosts - Costs directly attributable to lease negotiation.
 * @returns The initial measurement of the lease asset.
 */
export function measureLeaseAsset(
  leaseId: string,
  leaseLiability: number,
  prepaidAmounts: number,
  initialDirectCosts: number,
): LeaseAssetMeasurement {
  const prepaid = Math.max(prepaidAmounts, 0);
  const directCosts = Math.max(initialDirectCosts, 0);
  const liability = Math.max(leaseLiability, 0);

  return {
    leaseId,
    leaseLiability: liability,
    prepaidAmounts: prepaid,
    initialDirectCosts: directCosts,
    totalLeaseAsset: Math.round((liability + prepaid + directCosts) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// 4. Amortization Schedule Generation
// ---------------------------------------------------------------------------

/**
 * Generate a full amortization schedule for a lease.
 *
 * The schedule produces two parallel tracks:
 *   - **Asset amortization**: straight-line over the lease term, reducing
 *     the lease asset balance evenly each period. Ref: SFFAS 54 para 23.
 *   - **Liability amortization**: effective-interest method. Each period,
 *     interest expense = beginning liability balance x monthly rate. The
 *     principal reduction = payment - interest. Ref: SFFAS 54 para 25.
 *
 * Periods are monthly. The schedule begins on the commencement date and
 * runs for the full lease term.
 *
 * @param leaseId           - Identifier for the lease.
 * @param initialAssetValue - The initial lease asset value (from measureLeaseAsset).
 * @param initialLiability  - The initial lease liability (PV of payments).
 * @param annualPayment     - Total annual lease payment.
 * @param discountRate      - Annual discount rate (decimal).
 * @param leaseTermMonths   - Lease term in months.
 * @param commencementDate  - The lease commencement date (ISO string).
 * @returns A result object with the full schedule array and totals.
 */
export function generateAmortizationSchedule(
  leaseId: string,
  initialAssetValue: number,
  initialLiability: number,
  annualPayment: number,
  discountRate: number,
  leaseTermMonths: number,
  commencementDate: string,
): AmortizationScheduleResult {
  if (leaseTermMonths <= 0) {
    return {
      success: false,
      leaseId,
      schedule: [],
      totalInterest: 0,
      totalPrincipal: 0,
      totalAssetAmortization: 0,
      error: 'Lease term must be greater than zero months.',
    };
  }

  if (annualPayment <= 0) {
    return {
      success: false,
      leaseId,
      schedule: [],
      totalInterest: 0,
      totalPrincipal: 0,
      totalAssetAmortization: 0,
      error: 'Annual payment must be greater than zero.',
    };
  }

  const monthlyPayment = annualPayment / MONTHS_PER_YEAR;
  const monthlyRate = discountRate / MONTHS_PER_YEAR;
  const straightLineAmortization = initialAssetValue / leaseTermMonths;

  const schedule: AmortizationPeriod[] = [];
  let assetBalance = initialAssetValue;
  let liabilityBalance = initialLiability;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalAssetAmort = 0;

  const startDate = new Date(commencementDate);

  for (let i = 0; i < leaseTermMonths; i++) {
    const periodStart = new Date(startDate);
    periodStart.setMonth(periodStart.getMonth() + i);

    const periodEnd = new Date(startDate);
    periodEnd.setMonth(periodEnd.getMonth() + i + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);

    // Asset: straight-line amortization (SFFAS 54 para 23)
    const beginAsset = assetBalance;
    const assetAmort = i === leaseTermMonths - 1
      ? assetBalance  // Final period: amortize remaining balance to zero
      : Math.round(straightLineAmortization * 100) / 100;
    const endAsset = Math.max(Math.round((beginAsset - assetAmort) * 100) / 100, 0);

    // Liability: effective-interest method (SFFAS 54 para 25)
    const beginLiability = liabilityBalance;
    const interest = Math.round(beginLiability * monthlyRate * 100) / 100;
    const principal = Math.round((monthlyPayment - interest) * 100) / 100;
    const endLiability = i === leaseTermMonths - 1
      ? 0  // Final period: zero out any rounding remainder
      : Math.max(Math.round((beginLiability - principal) * 100) / 100, 0);

    schedule.push({
      periodNumber: i + 1,
      periodStartDate: periodStart.toISOString().slice(0, 10),
      periodEndDate: periodEnd.toISOString().slice(0, 10),
      beginningAssetBalance: Math.round(beginAsset * 100) / 100,
      assetAmortization: assetAmort,
      endingAssetBalance: endAsset,
      beginningLiabilityBalance: Math.round(beginLiability * 100) / 100,
      payment: Math.round(monthlyPayment * 100) / 100,
      interestExpense: interest,
      principalReduction: principal,
      endingLiabilityBalance: endLiability,
    });

    assetBalance = endAsset;
    liabilityBalance = endLiability;
    totalInterest += interest;
    totalPrincipal += principal;
    totalAssetAmort += assetAmort;
  }

  return {
    success: true,
    leaseId,
    schedule,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPrincipal: Math.round(totalPrincipal * 100) / 100,
    totalAssetAmortization: Math.round(totalAssetAmort * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// 5. Lease Modification / Remeasurement
// ---------------------------------------------------------------------------

/**
 * Process a lease modification that triggers remeasurement of the lease
 * liability and a corresponding adjustment to the lease asset.
 *
 * Per SFFAS 54 para 48 (as amended by SFFAS 62), a remeasurement is
 * required when any of the following occur after commencement:
 *   - **Term change**: extension or termination of the lease term
 *   - **Payment change**: change in fixed or variable payment amounts
 *   - **Index/rate change**: adjustment to payments tied to an index or rate
 *
 * The remeasured liability is computed as the PV of remaining payments
 * under the modified terms, using the discount rate applicable at the
 * modification date. The difference between the prior and remeasured
 * liability is recognized as an adjustment to the lease asset.
 *
 * Ref: SFFAS 54 paras 48-52; SFFAS 62; DoD FMR Vol. 4, Ch. 26
 *
 * @param input - The modification input parameters.
 * @returns A result object with the remeasured balances and adjustments.
 */
export function processLeaseModification(
  input: LeaseModificationInput,
): LeaseModificationResult {
  const {
    leaseId,
    trigger,
    remainingLiabilityBalance,
    remainingAssetBalance,
    newLeaseTermMonths,
    newAnnualPayment,
    newDiscountRate,
  } = input;

  // Determine the parameters for remeasurement
  const termMonths = newLeaseTermMonths ?? 0;
  const annualPayment = newAnnualPayment ?? 0;
  const rate = newDiscountRate ?? 0.04;

  if (termMonths <= 0 || annualPayment <= 0) {
    return {
      success: false,
      leaseId,
      trigger,
      priorLiabilityBalance: remainingLiabilityBalance,
      remeasuredLiability: remainingLiabilityBalance,
      liabilityAdjustment: 0,
      priorAssetBalance: remainingAssetBalance,
      remeasuredAsset: remainingAssetBalance,
      assetAdjustment: 0,
      error:
        'Remeasurement requires a positive remaining lease term and ' +
        'annual payment amount.',
    };
  }

  // Remeasure the liability at modified terms
  const pvResult = calculateLeasePresntValue(annualPayment, termMonths, rate);

  if (!pvResult.success) {
    return {
      success: false,
      leaseId,
      trigger,
      priorLiabilityBalance: remainingLiabilityBalance,
      remeasuredLiability: remainingLiabilityBalance,
      liabilityAdjustment: 0,
      priorAssetBalance: remainingAssetBalance,
      remeasuredAsset: remainingAssetBalance,
      assetAdjustment: 0,
      error: pvResult.error ?? 'Present value calculation failed during remeasurement.',
    };
  }

  const remeasuredLiability = pvResult.pvOfPayments;
  const liabilityAdjustment = Math.round(
    (remeasuredLiability - remainingLiabilityBalance) * 100,
  ) / 100;

  // Adjust asset by the same amount as the liability change (SFFAS 54 para 50)
  const remeasuredAsset = Math.round(
    (remainingAssetBalance + liabilityAdjustment) * 100,
  ) / 100;
  const assetAdjustment = liabilityAdjustment;

  return {
    success: true,
    leaseId,
    trigger,
    priorLiabilityBalance: remainingLiabilityBalance,
    remeasuredLiability,
    liabilityAdjustment,
    priorAssetBalance: remainingAssetBalance,
    remeasuredAsset,
    assetAdjustment,
  };
}

// ---------------------------------------------------------------------------
// 6. USSGL Posting Entries
// ---------------------------------------------------------------------------

/**
 * Generate USSGL journal entries for lease transactions.
 *
 * Produces the following entry sets based on the transaction type:
 *
 * **Initial Recognition** (at commencement):
 *   - DR 175000 Capital Lease Assets / CR 294000 Capital Lease Liabilities
 *     Ref: USSGL TFM Supplement; SFFAS 54 paras 18-19
 *
 * **Periodic Amortization** (each period):
 *   - DR 671000 Depreciation, Amortization, and Depletion /
 *     CR 175900 Accum Amortization - Lease Assets
 *     (straight-line asset amortization)
 *   - DR 671500 Interest Expense - Lease Liabilities /
 *     CR 294000 Capital Lease Liabilities
 *     (interest accrual on liability)
 *   - DR 294000 Capital Lease Liabilities / CR 101000 Fund Balance with Treasury
 *     (lease payment reducing liability)
 *
 * @param leaseId       - Identifier for the lease.
 * @param assetValue    - The initial or current lease asset value.
 * @param liability     - The initial or current lease liability.
 * @param amortPeriod   - An optional amortization period for periodic entries.
 * @param effectiveDate - The date for the journal entries (ISO string).
 * @param fiscalYear    - The fiscal year.
 * @returns An array of USSGL journal entries.
 */
export function generateLeaseUSSGLEntries(
  leaseId: string,
  assetValue: number,
  liability: number,
  amortPeriod: AmortizationPeriod | null,
  effectiveDate: string,
  fiscalYear: number,
): USSGLEntry[] {
  const entries: USSGLEntry[] = [];

  if (!amortPeriod) {
    // Initial recognition entries (SFFAS 54 paras 18-19)
    entries.push({
      id: uuid(),
      leaseId,
      entryType: 'initial_recognition',
      debitAccount: '175000',
      debitAccountName: 'Capital Lease Assets',
      debitAmount: Math.round(assetValue * 100) / 100,
      creditAccount: '294000',
      creditAccountName: 'Capital Lease Liabilities',
      creditAmount: Math.round(liability * 100) / 100,
      memo:
        `Initial recognition of lease asset and liability per SFFAS 54. ` +
        `Lease asset: $${assetValue.toLocaleString()}, ` +
        `Liability: $${liability.toLocaleString()}.`,
      effectiveDate,
      fiscalYear,
    });

    // If asset differs from liability (prepayments/initial direct costs),
    // record the difference against Fund Balance with Treasury
    const difference = Math.round((assetValue - liability) * 100) / 100;
    if (difference > 0) {
      entries.push({
        id: uuid(),
        leaseId,
        entryType: 'initial_recognition',
        debitAccount: '175000',
        debitAccountName: 'Capital Lease Assets (Prepayments/IDC)',
        debitAmount: difference,
        creditAccount: '101000',
        creditAccountName: 'Fund Balance with Treasury',
        creditAmount: difference,
        memo:
          `Prepaid amounts and initial direct costs capitalized to lease asset ` +
          `per SFFAS 54 paras 20-22. Amount: $${difference.toLocaleString()}.`,
        effectiveDate,
        fiscalYear,
      });
    }

    return entries;
  }

  // Periodic amortization entries

  // 1. Asset amortization -- straight-line (SFFAS 54 para 23)
  entries.push({
    id: uuid(),
    leaseId,
    entryType: 'periodic_amortization',
    debitAccount: '671000',
    debitAccountName: 'Depreciation, Amortization, and Depletion',
    debitAmount: amortPeriod.assetAmortization,
    creditAccount: '175900',
    creditAccountName: 'Accumulated Amortization - Lease Assets',
    creditAmount: amortPeriod.assetAmortization,
    memo:
      `Period ${amortPeriod.periodNumber} straight-line amortization of lease ` +
      `asset per SFFAS 54 para 23.`,
    effectiveDate: amortPeriod.periodEndDate,
    fiscalYear,
  });

  // 2. Interest expense on liability (SFFAS 54 para 25)
  if (amortPeriod.interestExpense > 0) {
    entries.push({
      id: uuid(),
      leaseId,
      entryType: 'periodic_amortization',
      debitAccount: '671500',
      debitAccountName: 'Interest Expense - Capital Lease Liabilities',
      debitAmount: amortPeriod.interestExpense,
      creditAccount: '294000',
      creditAccountName: 'Capital Lease Liabilities',
      creditAmount: amortPeriod.interestExpense,
      memo:
        `Period ${amortPeriod.periodNumber} interest accrual on lease liability ` +
        `per SFFAS 54 para 25. Rate applied to beginning balance ` +
        `$${amortPeriod.beginningLiabilityBalance.toLocaleString()}.`,
      effectiveDate: amortPeriod.periodEndDate,
      fiscalYear,
    });
  }

  // 3. Lease payment -- principal reduction (SFFAS 54 para 25)
  entries.push({
    id: uuid(),
    leaseId,
    entryType: 'payment',
    debitAccount: '294000',
    debitAccountName: 'Capital Lease Liabilities',
    debitAmount: amortPeriod.payment,
    creditAccount: '101000',
    creditAccountName: 'Fund Balance with Treasury',
    creditAmount: amortPeriod.payment,
    memo:
      `Period ${amortPeriod.periodNumber} lease payment. Principal reduction: ` +
      `$${amortPeriod.principalReduction.toLocaleString()}, Interest: ` +
      `$${amortPeriod.interestExpense.toLocaleString()}.`,
    effectiveDate: amortPeriod.periodEndDate,
    fiscalYear,
  });

  return entries;
}

// ---------------------------------------------------------------------------
// 7. Note Disclosure Data
// ---------------------------------------------------------------------------

/**
 * Assemble lease disclosure data for financial statement notes per
 * OMB Circular A-136 Section II.3.2.
 *
 * The disclosure includes:
 *   - Aggregate lease asset and liability balances
 *   - Lease expense by classification (operating vs. capital)
 *   - Future minimum lease payment schedule (current year through 5+ years)
 *   - Lease counts by classification type
 *   - Intragovernmental lease summary
 *   - Significant assumptions (discount rates, renewal options)
 *
 * Ref: OMB A-136 Section II.3.2; SFFAS 54 paras 55-60; DoD FMR Vol. 4, Ch. 26
 *
 * @param leases     - Array of lease records for the reporting entity.
 * @param fiscalYear - The fiscal year for the disclosure.
 * @returns Structured disclosure data suitable for note assembly.
 */
export function generateLeaseDisclosure(
  leases: LeaseRecord[],
  fiscalYear: number,
): LeaseDisclosureData {
  let totalLeaseAssets = 0;
  let totalLeaseLiabilities = 0;
  let totalLeaseExpenseOperating = 0;
  let totalLeaseExpenseCapital = 0;
  let intragovernmentalLeaseCount = 0;
  let intragovernmentalLeaseTotal = 0;

  const classificationCounts: Record<LeaseType, number> = {
    operating: 0,
    capital: 0,
    intragovernmental: 0,
    short_term_exempt: 0,
  };

  // Future payment buckets: FY+1 through FY+5 and thereafter
  const bucketLabels = [
    `FY${fiscalYear + 1}`,
    `FY${fiscalYear + 2}`,
    `FY${fiscalYear + 3}`,
    `FY${fiscalYear + 4}`,
    `FY${fiscalYear + 5}`,
    'Thereafter',
  ];
  const bucketAmounts = new Array(6).fill(0);

  for (const lease of leases) {
    totalLeaseAssets += lease.leaseAssetValue;
    totalLeaseLiabilities += lease.leaseLiabilityBalance;

    // Classify for disclosure counts
    const classification = classifyLease(lease, fiscalYear);

    if (classification.classification === 'short_term_exempt') {
      classificationCounts.short_term_exempt += 1;
    } else if (classification.classification === 'intragovernmental') {
      classificationCounts.intragovernmental += 1;
    } else if (classification.classification === 'capital') {
      classificationCounts.capital += 1;
    } else {
      classificationCounts.operating += 1;
    }

    // Accumulate expense by type
    if (
      classification.classification === 'operating' ||
      classification.classification === 'short_term_exempt'
    ) {
      totalLeaseExpenseOperating += lease.annualPayment;
    } else {
      totalLeaseExpenseCapital += lease.annualPayment;
    }

    // Intragovernmental summary
    if (lease.isIntragovernmental) {
      intragovernmentalLeaseCount += 1;
      intragovernmentalLeaseTotal += lease.totalLeasePayments;
    }

    // Future payment allocation based on remaining term
    const terminationDate = new Date(lease.terminationDate);
    const fiscalYearEndMonth = 9; // September (0-indexed)
    const fyEndBase = new Date(fiscalYear, fiscalYearEndMonth, 30);

    for (let bucket = 0; bucket < 6; bucket++) {
      const bucketStart = new Date(fyEndBase);
      bucketStart.setFullYear(bucketStart.getFullYear() + bucket);

      const bucketEnd = new Date(fyEndBase);
      bucketEnd.setFullYear(bucketEnd.getFullYear() + bucket + 1);

      if (bucket === 5) {
        // "Thereafter" bucket: all remaining after FY+5
        if (terminationDate > bucketStart) {
          const remainingMonths = Math.max(
            0,
            (terminationDate.getFullYear() - bucketStart.getFullYear()) * 12 +
              (terminationDate.getMonth() - bucketStart.getMonth()),
          );
          bucketAmounts[bucket] += (lease.annualPayment / MONTHS_PER_YEAR) * remainingMonths;
        }
      } else {
        // Standard year buckets
        if (terminationDate > bucketStart) {
          const monthsInBucket = Math.min(
            12,
            Math.max(
              0,
              (Math.min(terminationDate.getTime(), bucketEnd.getTime()) -
                bucketStart.getTime()) /
                (1000 * 60 * 60 * 24 * 30),
            ),
          );
          bucketAmounts[bucket] += (lease.annualPayment / MONTHS_PER_YEAR) * monthsInBucket;
        }
      }
    }
  }

  const futurePaymentSchedule: FuturePaymentBucket[] = bucketLabels.map(
    (label, idx) => ({
      period: label,
      amount: Math.round(bucketAmounts[idx] * 100) / 100,
    }),
  );

  const significantAssumptions: string[] = [];

  // Collect unique discount rates for assumption disclosure
  const uniqueRates = leases
    .map((l) => l.discountRate)
    .filter((r, i, arr) => r > 0 && arr.indexOf(r) === i);
  if (uniqueRates.length > 0) {
    significantAssumptions.push(
      `Discount rates applied: ${uniqueRates
        .map((r) => `${(r * 100).toFixed(2)}%`)
        .join(', ')}. Rates selected per SFFAS 54 para 42 using the ` +
        `incremental borrowing rate or rate implicit in the lease.`,
    );
  }

  significantAssumptions.push(
    `Short-term lease threshold: ${DEFAULT_TERM_THRESHOLD_MONTHS} months ` +
      `per SFFAS 54 para 28 and DOD_LEASE_TERM_THRESHOLD_MONTHS parameter.`,
  );

  significantAssumptions.push(
    `Lease assets amortized on a straight-line basis over the lease term ` +
      `per SFFAS 54 para 23. Lease liabilities reduced using the ` +
      `effective-interest method per SFFAS 54 para 25.`,
  );

  return {
    fiscalYear,
    totalLeaseAssets: Math.round(totalLeaseAssets * 100) / 100,
    totalLeaseLiabilities: Math.round(totalLeaseLiabilities * 100) / 100,
    totalLeaseExpenseOperating: Math.round(totalLeaseExpenseOperating * 100) / 100,
    totalLeaseExpenseCapital: Math.round(totalLeaseExpenseCapital * 100) / 100,
    futurePaymentSchedule,
    leaseCountByClassification: classificationCounts,
    significantAssumptions,
    intragovernmentalLeaseCount,
    intragovernmentalLeaseTotal: Math.round(intragovernmentalLeaseTotal * 100) / 100,
  };
}
