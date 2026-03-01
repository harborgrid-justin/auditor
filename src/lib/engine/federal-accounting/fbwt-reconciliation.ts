/**
 * Fund Balance with Treasury (FBWT) Reconciliation Engine
 *
 * FBWT is consistently DoD's #1 audit challenge and the most significant
 * impediment to achieving a clean audit opinion. The fund balance with
 * Treasury represents the aggregate amount of funds in the agency's
 * accounts at the U.S. Treasury from which the agency is authorized to
 * make expenditures and pay liabilities.
 *
 * This engine compares agency disbursement/collection records (the
 * "agency book balance") against Treasury account statements (from
 * SF-133/GWA data) to identify reconciling items. Differences arise
 * from:
 *
 *   1. In-transit disbursements - agency has recorded but Treasury
 *      has not yet processed (USSGL 1010 vs. GWA/CARS mismatch).
 *   2. Unprocessed collections - deposits credited by Treasury but
 *      not yet recorded by the agency.
 *   3. Timing differences - transactions recorded in different
 *      accounting periods by agency and Treasury.
 *   4. Classification differences - same transaction, different
 *      Treasury Account Symbol or amount.
 *   5. Suspense items - transactions in Treasury suspense accounts
 *      (F3875/F3880/F3885) awaiting proper classification.
 *
 * The reconciliation process follows the methodology prescribed by:
 *   - DoD FMR Vol. 4, Ch. 5 (Fund Balance with Treasury)
 *   - SFFAS 1, para. 31-34 (Reporting Entity Assets)
 *   - Treasury Financial Manual Vol. I, Part 2, Ch. 5100
 *     (Reconciliation Procedures)
 *   - USSGL Account 1010 (Fund Balance with Treasury)
 *   - OMB Circular A-136, Section II.2.3 (FBWT Disclosures)
 */

import type { EngagementData } from '@/types/findings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FBWTDifferenceType = 'amount' | 'timing' | 'classification' | 'unmatched';

export interface FBWTReconcilingItem {
  id: string;
  description: string;
  differenceType: FBWTDifferenceType;
  agencyAmount: number;
  treasuryAmount: number;
  difference: number;
  ageInDays: number;
  accountSymbol: string;
  category: 'in_transit_disbursement' | 'unprocessed_collection' | 'timing_difference' | 'suspense' | 'other';
}

export interface FBWTReconciliationResult {
  reconciliationDate: string;
  fiscalYear: number;
  treasuryAccountSymbol: string;
  agencyBookBalance: number;
  treasuryBalance: number;
  netDifference: number;
  reconcilingItems: FBWTReconcilingItem[];
  unreconciledAmount: number;
  materialityThreshold: number;
  isReconciled: boolean;
  isMaterial: boolean;
  agingAnalysis: {
    current: number;    // 0-30 days
    days31to60: number;
    days61to90: number;
    days91to120: number;
    over120Days: number;
  };
  summary: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default materiality threshold for FBWT reconciliation expressed as a
 * fraction of the agency book balance. DoD typically uses a tiered
 * approach; this constant serves as a fallback when the engagement-level
 * threshold is not specific to FBWT.
 *
 * Ref: DoD FMR Vol. 4, Ch. 5, para 050202
 */
const DEFAULT_FBWT_MATERIALITY_FRACTION = 0.01;

/**
 * Items older than this threshold (in days) are flagged as stale and
 * require escalated management attention per DoD FMR Vol. 4, Ch. 5.
 */
const STALE_ITEM_THRESHOLD_DAYS = 120;

/**
 * USSGL 1010 -- the proprietary general ledger account that records
 * the entity's fund balance with Treasury.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USSGL_FBWT_ACCOUNT = '1010';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _itemCounter = 0;

/**
 * Generates a deterministic-ish unique ID for reconciling items. In a
 * production system this would be a UUID; here we use a monotonic counter
 * prefixed with "FBWT-RI-" for readability in audit work papers.
 */
function generateItemId(): string {
  _itemCounter += 1;
  return `FBWT-RI-${String(_itemCounter).padStart(6, '0')}`;
}

/**
 * Resets the item counter. Useful for deterministic testing.
 */
export function _resetItemCounter(): void {
  _itemCounter = 0;
}

/**
 * Calculates the number of calendar days between two ISO date strings.
 * Returns a non-negative integer.
 */
function daysBetween(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.max(0, Math.floor(Math.abs(b - a) / msPerDay));
}

/**
 * Rounds a number to two decimal places (cent precision) to avoid
 * floating-point comparison issues in financial calculations.
 */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Core engine functions
// ---------------------------------------------------------------------------

/**
 * Performs FBWT reconciliation for all Treasury Account Symbols present
 * in the engagement data.
 *
 * For each unique TAS found in `data.dodData.appropriations`, the engine:
 *
 *   1. Computes the agency-side book balance by summing disbursements
 *      and collections associated with appropriations under that TAS.
 *   2. Retrieves the corresponding Treasury-side balance from SF-133
 *      data (accessed via `(data.dodData as any).sf133Data`).
 *   3. Identifies reconciling items by comparing the two sides and
 *      categorizing differences.
 *   4. Ages each reconciling item based on the transaction date
 *      relative to the reconciliation date.
 *   5. Determines whether the net unreconciled difference is material.
 *
 * Ref: DoD FMR Vol. 4, Ch. 5; SFFAS 1; TFM Vol I Part 2 Ch 5100
 *
 * @param data - The full engagement data structure.
 * @returns An array of FBWTReconciliationResult, one per TAS.
 */
export function reconcileFBWT(data: EngagementData): FBWTReconciliationResult[] {
  if (!data.dodData) {
    return [];
  }

  const dodData = data.dodData;
  const reconciliationDate = new Date().toISOString();
  const materialityThreshold = data.materialityThreshold;

  // Gather SF-133 data (may be absent on some engagements)
  const sf133Records: Array<{
    treasuryAccountSymbol: string;
    fiscalYear: number;
    outlays: { outlaysNet: number };
    budgetaryResources: { totalBudgetaryResources: number };
    statusOfBudgetaryResources: { newObligationsAndUpwardAdjustments: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }> = ((dodData as any).sf133Data as any[]) || [];

  // Build a lookup of appropriation IDs to their parent TAS
  const appropriationsByTas = new Map<string, typeof dodData.appropriations>();
  for (const approp of dodData.appropriations) {
    const tas = approp.treasuryAccountSymbol;
    if (!appropriationsByTas.has(tas)) {
      appropriationsByTas.set(tas, []);
    }
    appropriationsByTas.get(tas)!.push(approp);
  }

  // Build an index from appropriation ID -> TAS for quick lookups
  const appropIdToTas = new Map<string, string>();
  for (const approp of dodData.appropriations) {
    appropIdToTas.set(approp.id, approp.treasuryAccountSymbol);
  }

  // Index obligations by appropriation ID for joining disbursements
  const obligationsByAppropId = new Map<string, typeof dodData.obligations>();
  for (const obl of dodData.obligations) {
    if (!obligationsByAppropId.has(obl.appropriationId)) {
      obligationsByAppropId.set(obl.appropriationId, []);
    }
    obligationsByAppropId.get(obl.appropriationId)!.push(obl);
  }

  // Index obligation ID -> appropriation ID for disbursement linkage
  const obligationIdToAppropId = new Map<string, string>();
  for (const obl of dodData.obligations) {
    obligationIdToAppropId.set(obl.id, obl.appropriationId);
  }

  // Build SF-133 lookup by TAS + FY
  const sf133ByTasFy = new Map<string, (typeof sf133Records)[number]>();
  for (const record of sf133Records) {
    const key = `${record.treasuryAccountSymbol}|${record.fiscalYear}`;
    sf133ByTasFy.set(key, record);
  }

  const results: FBWTReconciliationResult[] = [];

  for (const [tas, appropriations] of Array.from(appropriationsByTas.entries())) {
    const fiscalYear = dodData.fiscalYear;
    const appropIds = new Set(appropriations.map((a: typeof dodData.appropriations[number]) => a.id));

    // -----------------------------------------------------------------
    // Step 1: Compute agency-side book balance
    // -----------------------------------------------------------------
    // Agency book balance = total disbursed - total collected
    // (Disbursements reduce FBWT; collections increase FBWT)

    // Sum disbursements linked to obligations under this TAS
    let totalDisbursed = 0;
    const disbursementsForTas: typeof dodData.disbursements = [];
    for (const disb of dodData.disbursements) {
      const appropId = obligationIdToAppropId.get(disb.obligationId);
      if (appropId && appropIds.has(appropId)) {
        totalDisbursed += disb.amount;
        disbursementsForTas.push(disb);
      }
    }

    // Sum collections linked to appropriations under this TAS
    let totalCollected = 0;
    const collectionsForTas: typeof dodData.collections = [];
    for (const coll of dodData.collections) {
      if (appropIds.has(coll.appropriationId)) {
        totalCollected += coll.amount;
        collectionsForTas.push(coll);
      }
    }

    // Agency book balance: start with total authority and adjust for
    // net outlays. The FBWT for a TAS is effectively:
    //   Beginning FBWT + Collections - Disbursements
    // For simplicity, derive from the appropriation-level data:
    //   Sum of (totalAuthority) represents budget authority received
    //   from Treasury; disbursements reduce it; collections add back.
    const totalAuthority = appropriations.reduce((sum: number, a: typeof dodData.appropriations[number]) => sum + a.totalAuthority, 0);
    const agencyBookBalance = toCents(totalAuthority - totalDisbursed + totalCollected);

    // -----------------------------------------------------------------
    // Step 2: Retrieve Treasury-side balance from SF-133
    // -----------------------------------------------------------------
    const sf133Key = `${tas}|${fiscalYear}`;
    const sf133 = sf133ByTasFy.get(sf133Key);

    // Treasury balance derived from SF-133:
    //   Total Budgetary Resources - Net Outlays = remaining FBWT
    // This is a simplification; in practice the GWA/CARS statement
    // provides the authoritative Treasury balance.
    let treasuryBalance: number;
    if (sf133) {
      treasuryBalance = toCents(
        sf133.budgetaryResources.totalBudgetaryResources - sf133.outlays.outlaysNet
      );
    } else {
      // If no SF-133 data is available, assume Treasury matches agency
      // (no reconciling items can be identified without the other side)
      treasuryBalance = agencyBookBalance;
    }

    const netDifference = toCents(agencyBookBalance - treasuryBalance);

    // -----------------------------------------------------------------
    // Step 3: Identify reconciling items
    // -----------------------------------------------------------------
    const reconcilingItems: FBWTReconcilingItem[] = [];

    // 3a. In-transit disbursements
    // Disbursements recorded by agency but not yet processed by Treasury.
    // Indicators: status is 'released' or 'certified' (not yet confirmed
    // by Treasury), or disbursement date is very recent.
    const pendingDisbursements = disbursementsForTas.filter(
      d => d.status === 'pending' || d.status === 'certified'
    );
    for (const disb of pendingDisbursements) {
      const age = daysBetween(disb.disbursementDate, reconciliationDate);
      reconcilingItems.push({
        id: generateItemId(),
        description:
          `In-transit disbursement ${disb.disbursementNumber}: agency recorded ` +
          `$${disb.amount.toFixed(2)} on ${disb.disbursementDate.split('T')[0]} ` +
          `but payment has not cleared Treasury (status: ${disb.status})`,
        differenceType: 'timing',
        agencyAmount: disb.amount,
        treasuryAmount: 0,
        difference: toCents(disb.amount),
        ageInDays: age,
        accountSymbol: tas,
        category: 'in_transit_disbursement',
      });
    }

    // 3b. Unprocessed collections
    // Collections credited by Treasury but not yet recorded by the agency.
    // For collections with a recent date and status still pending, the
    // agency side lags behind Treasury.
    const pendingCollections = collectionsForTas.filter(
      c => c.status === 'pending' || c.status === 'unprocessed'
    );
    for (const coll of pendingCollections) {
      const age = daysBetween(coll.collectionDate, reconciliationDate);
      reconcilingItems.push({
        id: generateItemId(),
        description:
          `Unprocessed collection from ${coll.sourceEntity}: Treasury ` +
          `credited $${coll.amount.toFixed(2)} on ${coll.collectionDate.split('T')[0]} ` +
          `but agency has not recorded (type: ${coll.collectionType}, status: ${coll.status})`,
        differenceType: 'timing',
        agencyAmount: 0,
        treasuryAmount: coll.amount,
        difference: toCents(-coll.amount),
        ageInDays: age,
        accountSymbol: tas,
        category: 'unprocessed_collection',
      });
    }

    // 3c. Timing differences from disbursements near period-end
    // Disbursements recorded by agency in the last 5 days of a month
    // may not appear on the Treasury statement until the next period.
    const releasedDisbursements = disbursementsForTas.filter(
      d => d.status === 'released'
    );
    for (const disb of releasedDisbursements) {
      const disbDate = new Date(disb.disbursementDate);
      const dayOfMonth = disbDate.getUTCDate();
      const daysInMonth = new Date(
        disbDate.getUTCFullYear(),
        disbDate.getUTCMonth() + 1,
        0
      ).getUTCDate();

      // If disbursed in the last 5 days of the month, flag as potential
      // timing difference
      if (dayOfMonth > daysInMonth - 5) {
        const age = daysBetween(disb.disbursementDate, reconciliationDate);
        // Only flag if relatively recent (within 60 days) to avoid
        // marking old transactions that should have cleared
        if (age <= 60) {
          reconcilingItems.push({
            id: generateItemId(),
            description:
              `Potential timing difference: disbursement ${disb.disbursementNumber} ` +
              `for $${disb.amount.toFixed(2)} released on ${disb.disbursementDate.split('T')[0]} ` +
              `(day ${dayOfMonth} of ${daysInMonth}) may not have cleared Treasury ` +
              `in the same accounting period`,
            differenceType: 'timing',
            agencyAmount: disb.amount,
            treasuryAmount: 0,
            difference: toCents(disb.amount),
            ageInDays: age,
            accountSymbol: tas,
            category: 'timing_difference',
          });
        }
      }
    }

    // 3d. Classification differences
    // Check for disbursements where the payment method suggests
    // intragovernmental processing that may be classified differently
    // by Treasury (e.g., IPAC transactions coded to wrong TAS).
    const intraGovDisbursements = disbursementsForTas.filter(
      d => d.paymentMethod === 'intra_gov'
    );
    for (const disb of intraGovDisbursements) {
      // Intragovernmental payments processed through IPAC/CARS may be
      // recorded under a different TAS at Treasury if the trading
      // partner agency applied a different account classification.
      const age = daysBetween(disb.disbursementDate, reconciliationDate);
      if (disb.status === 'released' && age > 30) {
        reconcilingItems.push({
          id: generateItemId(),
          description:
            `Potential classification difference: intragovernmental disbursement ` +
            `${disb.disbursementNumber} for $${disb.amount.toFixed(2)} via IPAC ` +
            `may be classified under a different TAS at Treasury. ` +
            `Age: ${age} days. Requires trading partner confirmation.`,
          differenceType: 'classification',
          agencyAmount: disb.amount,
          treasuryAmount: 0,
          difference: toCents(disb.amount),
          ageInDays: age,
          accountSymbol: tas,
          category: 'other',
        });
      }
    }

    // 3e. Suspense items
    // If the net difference exceeds what the identified reconciling items
    // explain, the remainder is treated as suspense requiring research.
    const explainedDifference = toCents(
      reconcilingItems.reduce((sum, item) => sum + item.difference, 0)
    );
    const unexplainedDifference = toCents(netDifference - explainedDifference);

    if (Math.abs(unexplainedDifference) > 0.01) {
      reconcilingItems.push({
        id: generateItemId(),
        description:
          `Unexplained difference of $${unexplainedDifference.toFixed(2)} between ` +
          `agency book balance ($${agencyBookBalance.toFixed(2)}) and Treasury balance ` +
          `($${treasuryBalance.toFixed(2)}) after accounting for identified reconciling ` +
          `items ($${explainedDifference.toFixed(2)}). Requires research — may be in ` +
          `Treasury suspense (F3875/F3880/F3885) pending proper classification.`,
        differenceType: 'unmatched',
        agencyAmount: unexplainedDifference > 0 ? Math.abs(unexplainedDifference) : 0,
        treasuryAmount: unexplainedDifference < 0 ? Math.abs(unexplainedDifference) : 0,
        difference: unexplainedDifference,
        ageInDays: 0, // Unknown — requires research
        accountSymbol: tas,
        category: 'suspense',
      });
    }

    // -----------------------------------------------------------------
    // Step 4: Aging analysis
    // -----------------------------------------------------------------
    const agingAnalysis = calculateFBWTAgingAnalysis(reconcilingItems);

    // -----------------------------------------------------------------
    // Step 5: Materiality determination
    // -----------------------------------------------------------------
    // The unreconciled amount is the absolute value of items that
    // cannot be explained (suspense + unmatched items).
    const unreconciledAmount = toCents(
      Math.abs(
        reconcilingItems
          .filter(item => item.differenceType === 'unmatched' || item.category === 'suspense')
          .reduce((sum, item) => sum + item.difference, 0)
      )
    );

    // Use the engagement materiality threshold. If the FBWT difference
    // exceeds it, the difference is material.
    const effectiveThreshold = materialityThreshold > 0
      ? materialityThreshold
      : Math.abs(agencyBookBalance) * DEFAULT_FBWT_MATERIALITY_FRACTION;

    const isMaterial = unreconciledAmount > effectiveThreshold;

    // Reconciliation is achieved when either:
    //   (a) The net difference is zero (or within rounding), or
    //   (b) All differences are explained by identified reconciling items
    //       and the unexplained remainder is immaterial.
    const isReconciled = Math.abs(netDifference) < 0.01 ||
      (Math.abs(unexplainedDifference) < 0.01 && !isMaterial);

    // -----------------------------------------------------------------
    // Step 6: Generate summary narrative
    // -----------------------------------------------------------------
    const staleItems = reconcilingItems.filter(
      item => item.ageInDays > STALE_ITEM_THRESHOLD_DAYS
    );

    const summaryParts: string[] = [
      `FBWT Reconciliation for TAS ${tas}, FY${fiscalYear}:`,
      `Agency book balance: $${agencyBookBalance.toFixed(2)}.`,
      `Treasury balance: $${treasuryBalance.toFixed(2)}.`,
      `Net difference: $${netDifference.toFixed(2)}.`,
      `${reconcilingItems.length} reconciling item(s) identified totaling $${explainedDifference.toFixed(2)}.`,
    ];

    if (unreconciledAmount > 0) {
      summaryParts.push(
        `Unreconciled amount: $${unreconciledAmount.toFixed(2)} ` +
        `(${isMaterial ? 'MATERIAL' : 'immaterial'} against threshold of $${effectiveThreshold.toFixed(2)}).`
      );
    }

    if (staleItems.length > 0) {
      summaryParts.push(
        `WARNING: ${staleItems.length} item(s) exceed ${STALE_ITEM_THRESHOLD_DAYS}-day ` +
        `aging threshold and require management attention per DoD FMR Vol. 4, Ch. 5.`
      );
    }

    summaryParts.push(
      isReconciled
        ? 'Status: RECONCILED.'
        : 'Status: NOT RECONCILED — corrective action required.'
    );

    results.push({
      reconciliationDate,
      fiscalYear,
      treasuryAccountSymbol: tas,
      agencyBookBalance,
      treasuryBalance,
      netDifference,
      reconcilingItems,
      unreconciledAmount,
      materialityThreshold: effectiveThreshold,
      isReconciled,
      isMaterial,
      agingAnalysis,
      summary: summaryParts.join(' '),
    });
  }

  return results;
}

/**
 * Generates finding descriptions for FBWT reconciliation results that
 * indicate material or unreconciled balances.
 *
 * Each finding is a prose description suitable for inclusion in the
 * audit report's Schedule of Findings and Questioned Costs or the
 * Notice of Findings and Recommendations (NFR).
 *
 * @param results - Array of FBWTReconciliationResult from reconcileFBWT.
 * @returns Array of finding description strings.
 */
export function generateFBWTFindings(results: FBWTReconciliationResult[]): string[] {
  const findings: string[] = [];

  for (const result of results) {
    // Finding for material unreconciled differences
    if (result.isMaterial) {
      findings.push(
        `Material FBWT Difference — TAS ${result.treasuryAccountSymbol}, ` +
        `FY${result.fiscalYear}: The agency book balance of ` +
        `$${result.agencyBookBalance.toFixed(2)} differs from the Treasury ` +
        `balance of $${result.treasuryBalance.toFixed(2)} by ` +
        `$${result.netDifference.toFixed(2)}. The unreconciled amount of ` +
        `$${result.unreconciledAmount.toFixed(2)} exceeds the materiality ` +
        `threshold of $${result.materialityThreshold.toFixed(2)}. ` +
        `This constitutes a material weakness in internal controls over ` +
        `financial reporting per DoD FMR Vol. 4, Ch. 5 and SFFAS 1. ` +
        `Condition: ${result.reconcilingItems.length} reconciling item(s) ` +
        `were identified but do not fully explain the difference. ` +
        `Criteria: Agencies must reconcile FBWT to Treasury records at ` +
        `least monthly per TFM Vol. I, Part 2, Ch. 5100. ` +
        `Effect: Financial statements may be materially misstated. ` +
        `Recommendation: Perform detailed transaction-level reconciliation, ` +
        `research suspense items, and resolve in-transit disbursements.`
      );
    }

    // Finding for unreconciled (but not necessarily material) balances
    if (!result.isReconciled && !result.isMaterial) {
      findings.push(
        `FBWT Reconciliation Deficiency — TAS ${result.treasuryAccountSymbol}, ` +
        `FY${result.fiscalYear}: The FBWT reconciliation identified a net ` +
        `difference of $${result.netDifference.toFixed(2)} with ` +
        `$${result.unreconciledAmount.toFixed(2)} remaining unexplained. ` +
        `While below the materiality threshold of ` +
        `$${result.materialityThreshold.toFixed(2)}, the inability to fully ` +
        `reconcile indicates a control deficiency. ` +
        `${result.reconcilingItems.length} reconciling item(s) require ` +
        `resolution per DoD FMR Vol. 4, Ch. 5.`
      );
    }

    // Finding for stale reconciling items (over 120 days)
    const staleItems = result.reconcilingItems.filter(
      item => item.ageInDays > STALE_ITEM_THRESHOLD_DAYS
    );
    if (staleItems.length > 0) {
      const totalStaleAmount = staleItems.reduce(
        (sum, item) => sum + Math.abs(item.difference),
        0
      );
      findings.push(
        `Stale FBWT Reconciling Items — TAS ${result.treasuryAccountSymbol}, ` +
        `FY${result.fiscalYear}: ${staleItems.length} reconciling item(s) ` +
        `totaling $${totalStaleAmount.toFixed(2)} have been outstanding for ` +
        `more than ${STALE_ITEM_THRESHOLD_DAYS} days. Per DoD FMR Vol. 4, ` +
        `Ch. 5, reconciling items should be researched and resolved within ` +
        `the current reporting period. Stale items indicate inadequate ` +
        `follow-up procedures and increase the risk of misstatement.`
      );
    }

    // Finding for significant in-transit disbursements
    const inTransitItems = result.reconcilingItems.filter(
      item => item.category === 'in_transit_disbursement'
    );
    if (inTransitItems.length > 0) {
      const inTransitTotal = inTransitItems.reduce(
        (sum, item) => sum + Math.abs(item.difference),
        0
      );
      if (inTransitTotal > result.materialityThreshold * 0.5) {
        findings.push(
          `Significant In-Transit Disbursements — TAS ${result.treasuryAccountSymbol}, ` +
          `FY${result.fiscalYear}: ${inTransitItems.length} in-transit ` +
          `disbursement(s) totaling $${inTransitTotal.toFixed(2)} have been ` +
          `recorded by the agency but not yet confirmed by Treasury. ` +
          `This amount represents ${((inTransitTotal / Math.abs(result.agencyBookBalance || 1)) * 100).toFixed(1)}% ` +
          `of the agency book balance. Concentration of in-transit items ` +
          `may indicate disbursing office processing delays or DSSN ` +
          `reporting issues per DoD FMR Vol. 5, Ch. 2.`
        );
      }
    }

    // Finding for aging concentration
    const { over120Days, days91to120 } = result.agingAnalysis;
    const agedAmount = over120Days + days91to120;
    if (agedAmount > result.materialityThreshold * 0.25) {
      findings.push(
        `FBWT Aging Concentration — TAS ${result.treasuryAccountSymbol}, ` +
        `FY${result.fiscalYear}: $${agedAmount.toFixed(2)} of reconciling ` +
        `items are aged over 90 days. This aging concentration suggests ` +
        `systemic reconciliation weaknesses and increases the risk that ` +
        `these items may represent undetected errors or misclassifications. ` +
        `Per OMB Circular A-136, Section II.2.3, agencies must disclose ` +
        `the nature and amount of significant FBWT reconciling differences.`
      );
    }
  }

  return findings;
}

/**
 * Calculates the aging analysis for a set of FBWT reconciling items.
 *
 * Items are bucketed by their age (ageInDays) into standard aging
 * categories. The dollar amounts represent the absolute value of the
 * difference for each item to provide a gross exposure measure.
 *
 * Aging buckets:
 *   - Current:      0-30 days
 *   - 31-60 days:   31-60 days
 *   - 61-90 days:   61-90 days
 *   - 91-120 days:  91-120 days
 *   - Over 120 days: > 120 days
 *
 * @param items - Array of FBWTReconcilingItem to analyze.
 * @returns The aging analysis breakdown matching the agingAnalysis
 *          property of FBWTReconciliationResult.
 */
export function calculateFBWTAgingAnalysis(
  items: FBWTReconcilingItem[]
): FBWTReconciliationResult['agingAnalysis'] {
  const aging: FBWTReconciliationResult['agingAnalysis'] = {
    current: 0,
    days31to60: 0,
    days61to90: 0,
    days91to120: 0,
    over120Days: 0,
  };

  for (const item of items) {
    const amount = Math.abs(item.difference);

    if (item.ageInDays <= 30) {
      aging.current = toCents(aging.current + amount);
    } else if (item.ageInDays <= 60) {
      aging.days31to60 = toCents(aging.days31to60 + amount);
    } else if (item.ageInDays <= 90) {
      aging.days61to90 = toCents(aging.days61to90 + amount);
    } else if (item.ageInDays <= 120) {
      aging.days91to120 = toCents(aging.days91to120 + amount);
    } else {
      aging.over120Days = toCents(aging.over120Days + amount);
    }
  }

  return aging;
}
