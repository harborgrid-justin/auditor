/**
 * Travel Compliance Engine
 *
 * Implements DoD FMR Volume 9 (Travel Policy) compliance checks for per diem,
 * lodging, meals & incidental expenses (MIE), TDY entitlements, travel card
 * compliance, and split disbursement calculations.
 *
 * References:
 *   - DoD 7000.14-R, Volume 9: Travel Policy
 *   - Joint Travel Regulations (JTR), Chapters 2-5
 *   - OMB Circular A-123, Appendix B (Government Charge Card)
 *   - 5 USC §5702: Per Diem Allowance
 *   - 41 CFR Chapters 300-304: Federal Travel Regulation (FTR)
 */

import type { TravelOrder, TravelVoucher, TravelCardTransaction } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Per Diem and Lodging Rate Data
//
// Per JTR and the GSA per diem rate tables, rates vary by location and season.
// The tables below are simplified CONUS/OCONUS defaults with overrides for
// selected high-cost locations.
// ---------------------------------------------------------------------------

const DEFAULT_CONUS_MIE_RATE = 59;
const DEFAULT_CONUS_LODGING_RATE = 107;
const DEFAULT_OCONUS_MIE_RATE = 74;
const DEFAULT_OCONUS_LODGING_RATE = 150;

/**
 * Per diem rates for selected high-cost CONUS locations.
 * Per JTR Appendix A / GSA CONUS per diem tables.
 */
const LOCATION_RATES: Record<string, { mie: number; lodging: number }> = {
  'WASHINGTON_DC':    { mie: 79, lodging: 258 },
  'NEW_YORK_CITY':    { mie: 79, lodging: 282 },
  'SAN_FRANCISCO':    { mie: 79, lodging: 311 },
  'LOS_ANGELES':      { mie: 74, lodging: 204 },
  'CHICAGO':          { mie: 74, lodging: 227 },
  'BOSTON':            { mie: 74, lodging: 259 },
  'SEATTLE':          { mie: 74, lodging: 232 },
  'SAN_DIEGO':        { mie: 74, lodging: 194 },
  'MIAMI':            { mie: 74, lodging: 196 },
  'DENVER':           { mie: 69, lodging: 195 },
  'HONOLULU':         { mie: 79, lodging: 275 },
  'ANCHORAGE':        { mie: 69, lodging: 162 },
  // Representative OCONUS locations
  'TOKYO':            { mie: 118, lodging: 212 },
  'LONDON':           { mie: 99, lodging: 255 },
  'BERLIN':           { mie: 84, lodging: 156 },
  'SEOUL':            { mie: 89, lodging: 175 },
  'BAHRAIN':          { mie: 78, lodging: 180 },
};

const OCONUS_KEYWORDS = [
  'GERMANY', 'JAPAN', 'KOREA', 'ITALY', 'UK', 'GUAM', 'BAHRAIN',
  'QATAR', 'KUWAIT', 'TOKYO', 'LONDON', 'BERLIN', 'SEOUL', 'OCONUS',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeDestination(destination: string): string {
  return destination.toUpperCase().trim().replace(/[\s-]+/g, '_');
}

function isOCONUS(normalized: string): boolean {
  return OCONUS_KEYWORDS.some(kw => normalized.includes(kw));
}

function lookupMIERate(destination: string, _fiscalYear: number): number {
  const normalized = normalizeDestination(destination);
  const override = LOCATION_RATES[normalized];
  if (override) return override.mie;
  return isOCONUS(normalized) ? DEFAULT_OCONUS_MIE_RATE : DEFAULT_CONUS_MIE_RATE;
}

function lookupLodgingRate(destination: string, _fiscalYear: number): number {
  const normalized = normalizeDestination(destination);
  const override = LOCATION_RATES[normalized];
  if (override) return override.lodging;
  return isOCONUS(normalized) ? DEFAULT_OCONUS_LODGING_RATE : DEFAULT_CONUS_LODGING_RATE;
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a per diem (total M&IE + lodging) claim against authorized rates.
 *
 * Per JTR Ch 2 and DoD FMR Vol 9, Ch 3: Per diem rates are set by GSA for
 * CONUS and by the DTMO for OCONUS locations. The total per diem for a
 * location equals lodging + MIE. Claims exceeding the authorized per diem
 * require an actual expense allowance (AEA) authorization.
 *
 * @param destination - travel destination location name
 * @param claimedAmount - total per diem amount claimed for the period
 * @param days - number of travel days
 * @param fiscalYear - fiscal year for rate lookup
 * @returns Validation result with maximum allowed and any excess
 */
export function validatePerDiem(
  destination: string,
  claimedAmount: number,
  days: number,
  fiscalYear: number,
): { valid: boolean; maxAllowed: number; excess: number } {
  const mieRate = lookupMIERate(destination, fiscalYear);
  const lodgingRate = lookupLodgingRate(destination, fiscalYear);
  const dailyPerDiem = mieRate + lodgingRate;

  // Per JTR Ch 2, Part B: First and last travel days receive 75% of M&IE.
  // Approximate: full-day rate for all days (conservative upper bound).
  const maxAllowed = Math.round(dailyPerDiem * days * 100) / 100;
  const excess = Math.max(0, Math.round((claimedAmount - maxAllowed) * 100) / 100);

  return {
    valid: claimedAmount <= maxAllowed,
    maxAllowed,
    excess,
  };
}

/**
 * Validate a lodging claim against the maximum authorized lodging rate.
 *
 * Per JTR Ch 2 and DoD FMR Vol 9, Ch 3: Lodging reimbursement is limited
 * to the locality rate unless an Actual Expense Allowance (AEA) has been
 * approved by the authorizing official.
 *
 * @param destination - travel destination location name
 * @param claimedAmount - total lodging amount claimed
 * @param nights - number of nights of lodging
 * @param fiscalYear - fiscal year for rate lookup
 * @returns Validation result with maximum allowed and any excess
 */
export function validateLodging(
  destination: string,
  claimedAmount: number,
  nights: number,
  fiscalYear: number,
): { valid: boolean; maxAllowed: number; excess: number } {
  const maxRate = lookupLodgingRate(destination, fiscalYear);
  const maxAllowed = Math.round(maxRate * nights * 100) / 100;
  const excess = Math.max(0, Math.round((claimedAmount - maxAllowed) * 100) / 100);

  return {
    valid: claimedAmount <= maxAllowed,
    maxAllowed,
    excess,
  };
}

/**
 * Validate Meals & Incidental Expenses (MIE) claims with provided-meal deductions.
 *
 * Per JTR Ch 2, Part C: When meals are provided (e.g., at a conference or
 * government facility), the traveler's M&IE reimbursement must be reduced
 * by the proportion of provided meals. Standard deduction is approximately
 * breakfast=20%, lunch=30%, dinner=50% of the daily M&IE rate.
 *
 * @param claimedMeals - total M&IE amount claimed by the traveler
 * @param providedMeals - number of meals provided during the trip
 * @param mieRate - daily M&IE rate for the destination
 * @param days - number of travel days
 * @returns Validation result with adjusted rate and any excess
 */
export function validateMIE(
  claimedMeals: number,
  providedMeals: number,
  mieRate: number,
  days: number,
): { valid: boolean; adjustedRate: number; excess: number } {
  // Each provided meal reduces the M&IE by approximately 1/3 of the daily rate.
  // More precisely: breakfast ~20%, lunch ~30%, dinner ~50%, but we simplify
  // to an average deduction per meal.
  const avgMealDeduction = mieRate / 3;
  const totalDeductions = avgMealDeduction * providedMeals;
  const totalMIEAllowed = mieRate * days;
  const adjustedTotal = Math.max(0, totalMIEAllowed - totalDeductions);
  const adjustedRate = days > 0 ? Math.round((adjustedTotal / days) * 100) / 100 : 0;
  const excess = Math.max(0, Math.round((claimedMeals - adjustedTotal) * 100) / 100);

  return {
    valid: claimedMeals <= adjustedTotal,
    adjustedRate,
    excess,
  };
}

/**
 * Validate TDY (Temporary Duty) entitlements by comparing the travel voucher
 * against the original travel order authorization.
 *
 * Per DoD FMR Vol 9, Ch 2: Travel entitlements must be authorized in advance.
 * Voucher claims must align with authorized amounts, purposes, and dates.
 *
 * @param order - the original TravelOrder authorization
 * @param voucher - the submitted TravelVoucher claim
 * @returns Validation result with identified findings
 */
export function validateTDYEntitlements(
  order: TravelOrder,
  voucher: TravelVoucher,
): { valid: boolean; findings: string[] } {
  const findings: string[] = [];

  // --- Voucher must reference the correct travel order ---
  if (voucher.travelOrderId !== order.id) {
    findings.push(
      `Voucher references travel order "${voucher.travelOrderId}" but is being ` +
      `validated against order "${order.id}". Ref: DoD FMR Vol 9, Ch 2.`,
    );
  }

  // --- Total claim must not exceed authorized amount ---
  if (voucher.totalClaim > order.authorizedAmount) {
    const overAmount = voucher.totalClaim - order.authorizedAmount;
    findings.push(
      `Voucher total claim ($${voucher.totalClaim.toFixed(2)}) exceeds authorized ` +
      `amount ($${order.authorizedAmount.toFixed(2)}) by $${overAmount.toFixed(2)}. ` +
      `An amended travel order is required. Ref: DoD FMR Vol 9, Ch 2.`,
    );
  }

  // --- Voucher filing timeliness (5 business days ~= 7 calendar days) ---
  if (voucher.filedDate && order.returnDate) {
    const daysToFile = daysBetween(order.returnDate, voucher.filedDate);
    if (daysToFile > 7) {
      findings.push(
        `Voucher filed ${daysToFile} days after travel completion (filed: ` +
        `${voucher.filedDate}, returned: ${order.returnDate}). JTR requires ` +
        `filing within 5 business days. Ref: JTR Ch 2, Part J; DoD FMR Vol 9, Ch 2.`,
      );
    }
  }

  // --- Lodging cost validation ---
  const travelDays = daysBetween(order.departDate, order.returnDate);
  if (travelDays > 0 && order.lodgingRate > 0) {
    const nights = Math.max(0, travelDays - 1); // no lodging on return day
    const maxLodging = order.lodgingRate * nights;
    if (voucher.lodgingCost > maxLodging) {
      findings.push(
        `Lodging claim ($${voucher.lodgingCost.toFixed(2)}) exceeds maximum ` +
        `authorized lodging ($${maxLodging.toFixed(2)} = $${order.lodgingRate.toFixed(2)} x ` +
        `${nights} nights). Ref: DoD FMR Vol 9, Ch 3.`,
      );
    }
  }

  // --- MIE cost validation ---
  if (travelDays > 0 && order.mieRate > 0) {
    // First and last days at 75% per JTR
    const fullDays = Math.max(0, travelDays - 2);
    const partialDays = Math.min(travelDays, 2);
    const maxMIE = (order.mieRate * fullDays) + (order.mieRate * 0.75 * partialDays);
    if (voucher.mealsCost > maxMIE) {
      findings.push(
        `Meals/MIE claim ($${voucher.mealsCost.toFixed(2)}) exceeds authorized ` +
        `per diem ($${maxMIE.toFixed(2)} for ${travelDays} days). ` +
        `Ref: JTR Ch 2, Part B; DoD FMR Vol 9, Ch 3.`,
      );
    }
  }

  // --- Travel advance reconciliation ---
  if (voucher.advanceAmount > 0 && voucher.advanceAmount > voucher.totalClaim) {
    findings.push(
      `Travel advance ($${voucher.advanceAmount.toFixed(2)}) exceeds total claim ` +
      `($${voucher.totalClaim.toFixed(2)}). Excess advance must be returned. ` +
      `Ref: DoD FMR Vol 9, Ch 4.`,
    );
  }

  // --- Travel type must be TDY ---
  if (order.orderType !== 'tdy') {
    findings.push(
      `Travel order type is "${order.orderType}" — TDY entitlement validation ` +
      `is designed for TDY orders only. PCS/local travel use different rules. ` +
      `Ref: DoD FMR Vol 9.`,
    );
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

/**
 * Check Government Travel Charge Card (GTCC) compliance.
 *
 * Per OMB Circular A-123 Appendix B and DoD FMR Vol 9, Ch 3:
 * - Mandatory use of GTCC for official travel expenses.
 * - Accounts delinquent 61+ days trigger management action.
 * - Delinquency rates exceeding 7% require component corrective action.
 *
 * @param transactions - array of TravelCardTransaction records
 * @returns Compliance result with delinquency details and findings
 */
export function checkTravelCardCompliance(
  transactions: TravelCardTransaction[],
): { delinquentCount: number; totalDelinquent: number; findings: string[] } {
  const findings: string[] = [];
  let delinquentCount = 0;
  let totalDelinquent = 0;

  const delinquentStatuses = new Set(['30_day', '60_day', '90_plus', 'charge_off']);

  for (const txn of transactions) {
    if (delinquentStatuses.has(txn.delinquencyStatus)) {
      delinquentCount++;
      totalDelinquent += txn.amount;
    }
  }

  // Severe delinquency (61+ days)
  const severeDelinquent = transactions.filter(
    t => t.delinquencyStatus === '60_day' ||
         t.delinquencyStatus === '90_plus' ||
         t.delinquencyStatus === 'charge_off',
  );
  if (severeDelinquent.length > 0) {
    const severeAmount = severeDelinquent.reduce((sum, t) => sum + t.amount, 0);
    findings.push(
      `${severeDelinquent.length} transaction(s) delinquent 61+ days totaling ` +
      `$${severeAmount.toFixed(2)}. Requires management action per OMB A-123, ` +
      `Appendix B. Ref: DoD FMR Vol 9, Ch 3.`,
    );
  }

  // Unreconciled transactions
  const unreconciledTxns = transactions.filter(t => !t.reconciledToVoucher);
  if (unreconciledTxns.length > 0) {
    const unreconciledAmount = unreconciledTxns.reduce((sum, t) => sum + t.amount, 0);
    findings.push(
      `${unreconciledTxns.length} travel card transaction(s) not reconciled to a ` +
      `voucher ($${unreconciledAmount.toFixed(2)}). All GTCC transactions must be ` +
      `reconciled. Ref: DoD FMR Vol 9, Ch 3.`,
    );
  }

  // Charge-offs
  const chargeOffs = transactions.filter(t => t.delinquencyStatus === 'charge_off');
  if (chargeOffs.length > 0) {
    const chargeOffAmount = chargeOffs.reduce((sum, t) => sum + t.amount, 0);
    findings.push(
      `${chargeOffs.length} charge-off(s) totaling $${chargeOffAmount.toFixed(2)}. ` +
      `Charge-offs indicate potential misuse and must be investigated. ` +
      `Ref: OMB A-123, Appendix B; DoD FMR Vol 9, Ch 3.`,
    );
  }

  // Delinquency rate check
  if (transactions.length > 0) {
    const delinquencyRate = delinquentCount / transactions.length;
    if (delinquencyRate > 0.07) {
      findings.push(
        `Travel card delinquency rate (${(delinquencyRate * 100).toFixed(1)}%) exceeds ` +
        `DoD's 7% threshold. Component APC must implement corrective action. ` +
        `Ref: DoD FMR Vol 9, Ch 3.`,
      );
    }
  }

  return {
    delinquentCount,
    totalDelinquent: Math.round(totalDelinquent * 100) / 100,
    findings,
  };
}

/**
 * Calculate split disbursement amounts between the travel card and the traveler.
 *
 * Per DoD FMR Vol 9, Ch 3: When a traveler uses the GTCC, the voucher
 * settlement must be split-disbursed. The card charges are paid directly
 * to the card vendor, and any remaining balance is paid to the traveler.
 * Split disbursement is mandatory for DoD travel card holders.
 *
 * @param voucher - the settled TravelVoucher
 * @param cardTransactions - GTCC transactions associated with this trip
 * @returns Split disbursement amounts for card and personal portions
 */
export function calculateSplitDisbursement(
  voucher: TravelVoucher,
  cardTransactions: TravelCardTransaction[],
): { cardPortion: number; personalPortion: number } {
  const totalSettlement = voucher.approvedAmount ?? voucher.totalClaim;
  const totalCardCharges = cardTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Card portion: the lesser of GTCC charges or total settlement
  const cardPortion = Math.min(totalCardCharges, totalSettlement);
  // Personal portion: remainder goes to the traveler
  const personalPortion = Math.max(0, totalSettlement - cardPortion);

  return {
    cardPortion: Math.round(cardPortion * 100) / 100,
    personalPortion: Math.round(personalPortion * 100) / 100,
  };
}
