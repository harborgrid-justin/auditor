/**
 * Intragovernmental Transaction (IGT) Reconciliation Engine
 *
 * Handles the full lifecycle of intragovernmental transaction reconciliation
 * including trading partner matching, dispute resolution, elimination journal
 * entry generation, GTAS reconciliation, and quarterly IGT reporting.
 *
 * Intragovernmental transactions are financial activity between two federal
 * entities. For consolidated government-wide financial statements, these
 * must be identified and eliminated. The Treasury requires agencies to
 * reconcile buy-sell transactions through GTAS/CARS and resolve differences
 * before certification.
 *
 * Key reconciliation steps:
 *   1. Match buyer/seller transactions by TAS + amount + period
 *   2. Identify and resolve differences (disputes)
 *   3. Generate elimination journal entries for consolidation
 *   4. Reconcile with GTAS/CARS government-wide data
 *   5. Produce quarterly IGT status reports per Treasury FBwT guidance
 *
 * References:
 *   - Treasury Financial Manual (TFM) Vol I, Part 2, Ch 4700
 *   - Treasury FBwT Reconciliation Procedures
 *   - GTAS Submission Requirements
 *   - DoD FMR Vol. 4, Ch. 13 (Intragovernmental Transactions)
 *   - DoD FMR Vol. 6B, Ch. 13 (IGT Reporting)
 *   - OMB Circular A-136 (Consolidated Financial Statements)
 *   - SFFAS 47: Reporting Entity
 */

import type {
  IntragovernmentalTransaction,
  DoDComponentCode,
  ConsolidationElimination,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types — Trading Partner Matching
// ---------------------------------------------------------------------------

/** Matching status for a trading partner pair. */
export type MatchStatus = 'matched' | 'partial_match' | 'unmatched';

/** A matched pair of buyer/seller transactions. */
export interface TradingPartnerMatch {
  id: string;
  buyerTransaction: IntragovernmentalTransaction;
  sellerTransaction: IntragovernmentalTransaction | null;
  matchStatus: MatchStatus;
  /** Absolute dollar difference between buyer and seller amounts. */
  difference: number;
  /** Whether difference falls within Treasury tolerance ($500 or 1%). */
  withinTolerance: boolean;
  /** Matching criteria used. */
  matchedOn: string[];
}

/** Result of the trading partner matching process. */
export interface TradingPartnerMatchResult {
  id: string;
  matched: TradingPartnerMatch[];
  unmatched: TradingPartnerMatch[];
  disputed: TradingPartnerMatch[];
  summary: {
    totalBuyerTransactions: number;
    totalSellerTransactions: number;
    matchedCount: number;
    unmatchedCount: number;
    disputedCount: number;
    totalMatchedAmount: number;
    totalUnmatchedAmount: number;
    totalDisputedAmount: number;
  };
  processedAt: string;
}

// ---------------------------------------------------------------------------
// Types — Dispute Resolution
// ---------------------------------------------------------------------------

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'escalated' | 'closed';

export type DisputeResolutionType =
  | 'buyer_adjustment'
  | 'seller_adjustment'
  | 'split_adjustment'
  | 'write_off'
  | 'reclassification';

export interface IGTDispute {
  id: string;
  matchId: string;
  buyerComponent: DoDComponentCode;
  sellerComponent: DoDComponentCode;
  buyerTAS: string;
  sellerTAS: string;
  buyerAmount: number;
  sellerAmount: number;
  difference: number;
  reason: string;
  status: DisputeStatus;
  resolution?: DisputeResolutionType;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  /** Number of days since dispute was opened. */
  agingDays: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Types — Elimination Journal Entries
// ---------------------------------------------------------------------------

export interface EliminationJournalEntry {
  id: string;
  matchId: string;
  /** USSGL account to debit (e.g. revenue elimination). */
  debitUSSGL: string;
  /** USSGL account to credit (e.g. expense elimination). */
  creditUSSGL: string;
  amount: number;
  buyerComponent: DoDComponentCode;
  sellerComponent: DoDComponentCode;
  transactionType: string;
  description: string;
  fiscalYear: number;
  period: string;
  generatedAt: string;
}

/** Result of elimination entry generation. */
export interface EliminationEntryResult {
  entries: EliminationJournalEntry[];
  totalEliminationAmount: number;
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Types — GTAS Reconciliation
// ---------------------------------------------------------------------------

export type GTASDifferenceType = 'amount' | 'classification' | 'timing' | 'missing';

export interface GTASDifference {
  id: string;
  treasuryAccountSymbol: string;
  agencyAmount: number;
  gtasAmount: number;
  difference: number;
  differenceType: GTASDifferenceType;
  recommendation: string;
}

/** Agency-level data to reconcile against GTAS. */
export interface AgencyIGTData {
  agencyId: string;
  fiscalYear: number;
  period: number;
  transactions: IntragovernmentalTransaction[];
  totalBuyerAmount: number;
  totalSellerAmount: number;
  /** Balances by TAS. */
  tasSummary: Array<{
    treasuryAccountSymbol: string;
    buyerAmount: number;
    sellerAmount: number;
  }>;
}

/** GTAS-side data for reconciliation. */
export interface GTASIGTData {
  agencyId: string;
  fiscalYear: number;
  period: number;
  /** GTAS-reported IGT balances by TAS. */
  tasSummary: Array<{
    treasuryAccountSymbol: string;
    reportedAmount: number;
    tradingPartnerAgency: string;
  }>;
}

export interface GTASReconciliationResult {
  id: string;
  agencyId: string;
  fiscalYear: number;
  period: number;
  isReconciled: boolean;
  differences: GTASDifference[];
  totalDifferenceAmount: number;
  recommendations: string[];
  reconciledAt: string;
}

// ---------------------------------------------------------------------------
// Types — Quarterly IGT Report
// ---------------------------------------------------------------------------

export interface IGTQuarterlyReport {
  id: string;
  reportingAgency: string;
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  reportDate: string;
  /** Summary of all IGT activity. */
  transactionSummary: {
    totalBuyerTransactions: number;
    totalSellerTransactions: number;
    totalBuyerAmount: number;
    totalSellerAmount: number;
    netPosition: number;
  };
  /** Reconciliation status. */
  reconciliationStatus: {
    matchedCount: number;
    unmatchedCount: number;
    disputedCount: number;
    matchRate: number;
  };
  /** Aging of open disputes. */
  disputeAging: {
    under30Days: number;
    days30to60: number;
    days60to90: number;
    over90Days: number;
    totalOpenDisputes: number;
    totalDisputedAmount: number;
  };
  /** Elimination entries generated. */
  eliminationSummary: {
    totalEntries: number;
    totalEliminationAmount: number;
  };
  /** GTAS reconciliation status. */
  gtasReconciled: boolean;
  /** Outstanding differences. */
  outstandingDifferences: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dollar tolerance for buyer-seller matching per Treasury guidance. */
const MATCH_TOLERANCE_DOLLARS = 500;

/** Percentage tolerance for partial matches. */
const MATCH_TOLERANCE_PERCENT = 0.01;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  return Math.floor(
    Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime()) / msPerDay,
  );
}

// ---------------------------------------------------------------------------
// 1. Trading Partner Matching
// ---------------------------------------------------------------------------

/**
 * Match buyer and seller intragovernmental transactions.
 *
 * Matches transactions using a composite key of:
 *   - Trading partner agency
 *   - Treasury Account Symbol (TAS)
 *   - Fiscal period
 *   - Amount (within tolerance)
 *
 * Transactions are classified as matched, partially matched (within
 * tolerance), or unmatched. Out-of-tolerance partial matches are
 * flagged as disputed.
 *
 * @param buyerTransactions - Buyer-side IGT transactions
 * @param sellerTransactions - Seller-side IGT transactions
 * @returns TradingPartnerMatchResult with matched, unmatched, and disputed
 *
 * @see DoD FMR Vol. 4, Ch. 13 — IGT reconciliation procedures
 * @see Treasury FBwT Guidance — matching requirements
 */
export function matchTradingPartners(
  buyerTransactions: IntragovernmentalTransaction[],
  sellerTransactions: IntragovernmentalTransaction[],
): TradingPartnerMatchResult {
  const remainingSellers = [...sellerTransactions];
  const allMatches: TradingPartnerMatch[] = [];

  for (const buyer of buyerTransactions) {
    // Find best matching seller: TAS + trading partner + period
    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < remainingSellers.length; i++) {
      const seller = remainingSellers[i];

      // Must match on trading partner agency
      if (seller.tradingPartnerAgency !== buyer.tradingPartnerAgency) continue;

      // Must match on TAS if available
      if (
        buyer.tradingPartnerTas &&
        seller.tradingPartnerTas &&
        buyer.tradingPartnerTas !== seller.tradingPartnerTas
      ) {
        continue;
      }

      // Must match on period
      if (buyer.period !== seller.period) continue;

      const diff = Math.abs(buyer.amount - seller.amount);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // No matching seller found
      allMatches.push({
        id: uuid(),
        buyerTransaction: buyer,
        sellerTransaction: null,
        matchStatus: 'unmatched',
        difference: buyer.amount,
        withinTolerance: false,
        matchedOn: [],
      });
      continue;
    }

    const seller = remainingSellers.splice(bestIdx, 1)[0];
    const diff = round2(Math.abs(buyer.amount - seller.amount));
    const pctDiff = buyer.amount > 0 ? diff / buyer.amount : 0;

    const matchedOn: string[] = ['trading_partner', 'period'];
    if (
      buyer.tradingPartnerTas &&
      seller.tradingPartnerTas &&
      buyer.tradingPartnerTas === seller.tradingPartnerTas
    ) {
      matchedOn.push('tas');
    }

    let matchStatus: MatchStatus;
    let withinTolerance: boolean;

    if (diff < 0.01) {
      matchStatus = 'matched';
      withinTolerance = true;
      matchedOn.push('amount_exact');
    } else if (diff <= MATCH_TOLERANCE_DOLLARS || pctDiff <= MATCH_TOLERANCE_PERCENT) {
      matchStatus = 'partial_match';
      withinTolerance = true;
      matchedOn.push('amount_within_tolerance');
    } else {
      matchStatus = 'partial_match';
      withinTolerance = false;
    }

    allMatches.push({
      id: uuid(),
      buyerTransaction: buyer,
      sellerTransaction: seller,
      matchStatus,
      difference: diff,
      withinTolerance,
      matchedOn,
    });
  }

  // Remaining unmatched sellers
  for (const seller of remainingSellers) {
    allMatches.push({
      id: uuid(),
      buyerTransaction: seller,
      sellerTransaction: null,
      matchStatus: 'unmatched',
      difference: seller.amount,
      withinTolerance: false,
      matchedOn: [],
    });
  }

  const matched = allMatches.filter(
    (m) => m.matchStatus === 'matched' || (m.matchStatus === 'partial_match' && m.withinTolerance),
  );
  const unmatched = allMatches.filter((m) => m.matchStatus === 'unmatched');
  const disputed = allMatches.filter(
    (m) => m.matchStatus === 'partial_match' && !m.withinTolerance,
  );

  return {
    id: uuid(),
    matched,
    unmatched,
    disputed,
    summary: {
      totalBuyerTransactions: buyerTransactions.length,
      totalSellerTransactions: sellerTransactions.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      disputedCount: disputed.length,
      totalMatchedAmount: round2(
        matched.reduce((s, m) => s + m.buyerTransaction.amount, 0),
      ),
      totalUnmatchedAmount: round2(
        unmatched.reduce((s, m) => s + m.difference, 0),
      ),
      totalDisputedAmount: round2(
        disputed.reduce((s, m) => s + m.difference, 0),
      ),
    },
    processedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 2. Dispute Resolution
// ---------------------------------------------------------------------------

/**
 * Create a dispute record for an unreconciled IGT transaction.
 *
 * Per DoD FMR Vol. 4, Ch. 13, unreconciled differences must be
 * documented and tracked through resolution. Disputes older than
 * 90 days are subject to escalation.
 *
 * @param match - The trading partner match that is in dispute
 * @param reason - Description of why the dispute exists
 * @returns IGTDispute record
 *
 * @see DoD FMR Vol. 4, Ch. 13 — dispute resolution procedures
 * @see Treasury FBwT Guidance — dispute aging requirements
 */
export function createDispute(
  match: TradingPartnerMatch,
  reason: string,
): IGTDispute {
  const now = new Date().toISOString();
  const buyerTAS = match.buyerTransaction.tradingPartnerTas ?? 'N/A';
  const sellerTAS = match.sellerTransaction?.tradingPartnerTas ?? 'N/A';

  return {
    id: uuid(),
    matchId: match.id,
    buyerComponent: match.buyerTransaction.tradingPartnerAgency as DoDComponentCode,
    sellerComponent: (match.sellerTransaction?.tradingPartnerAgency ??
      match.buyerTransaction.tradingPartnerAgency) as DoDComponentCode,
    buyerTAS,
    sellerTAS,
    buyerAmount: match.buyerTransaction.amount,
    sellerAmount: match.sellerTransaction?.amount ?? 0,
    difference: match.difference,
    reason,
    status: 'open',
    agingDays: 0,
    createdAt: now,
  };
}

/**
 * Resolve an existing IGT dispute.
 *
 * Updates the dispute status, records the resolution type and notes,
 * and recalculates aging. The resolution type determines how the
 * difference is handled in subsequent elimination entries.
 *
 * @param dispute - The dispute to resolve
 * @param resolution - Type of resolution applied
 * @param notes - Explanation of the resolution
 * @param resolvedBy - ID of the person resolving
 * @returns Updated IGTDispute with resolution details
 *
 * @see DoD FMR Vol. 4, Ch. 13 — resolution documentation requirements
 */
export function resolveDispute(
  dispute: IGTDispute,
  resolution: DisputeResolutionType,
  notes: string,
  resolvedBy: string,
): IGTDispute {
  const now = new Date().toISOString();
  return {
    ...dispute,
    status: 'resolved',
    resolution,
    resolutionNotes: notes,
    resolvedBy,
    resolvedAt: now,
    agingDays: daysBetween(dispute.createdAt, now),
  };
}

/**
 * Refresh aging on a set of open disputes.
 *
 * Calculates the number of days each dispute has been open and
 * escalates disputes older than 90 days per Treasury guidance.
 *
 * @param disputes - Array of disputes to refresh
 * @returns Updated disputes with current aging and auto-escalation
 */
export function refreshDisputeAging(disputes: IGTDispute[]): IGTDispute[] {
  const now = new Date().toISOString();
  return disputes.map((d) => {
    if (d.status === 'resolved' || d.status === 'closed') return d;
    const aging = daysBetween(d.createdAt, now);
    return {
      ...d,
      agingDays: aging,
      status: aging > 90 ? 'escalated' : d.status,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Elimination Journal Entries
// ---------------------------------------------------------------------------

/**
 * Generate elimination journal entries for matched IGT pairs.
 *
 * For each matched buyer-seller pair, generates a USSGL debit/credit
 * entry to eliminate the intragovernmental balance from consolidated
 * financial statements.
 *
 * Standard elimination entries:
 *   - Revenue/Expense: Debit 5700 (Revenue from services) /
 *     Credit 6100 (Operating expenses)
 *   - Receivable/Payable: Debit 2110 (Accounts payable) /
 *     Credit 1310 (Accounts receivable)
 *   - Transfer: Debit 5720 (Financing sources) /
 *     Credit 6300 (Financing uses)
 *
 * @param matchedPairs - Successfully matched trading partner pairs
 * @param fiscalYear - Fiscal year for the entries
 * @returns EliminationEntryResult with generated entries
 *
 * @see DoD FMR Vol. 6B, Ch. 13 — elimination entry requirements
 * @see USSGL TFM Supplement — intragovernmental account crosswalk
 */
export function generateEliminationEntries(
  matchedPairs: TradingPartnerMatch[],
  fiscalYear: number,
): EliminationEntryResult {
  const entries: EliminationJournalEntry[] = [];

  for (const match of matchedPairs) {
    if (match.matchStatus === 'unmatched' || !match.sellerTransaction) continue;

    const eliminationAmount = round2(
      Math.min(match.buyerTransaction.amount, match.sellerTransaction.amount),
    );
    if (eliminationAmount <= 0) continue;

    // Determine USSGL accounts based on transaction type
    let debitUSSGL: string;
    let creditUSSGL: string;
    const txnType = match.buyerTransaction.transactionType;

    switch (txnType) {
      case 'reimbursable':
      case 'economy_act':
      case 'interagency_agreement':
        // Revenue/Expense elimination
        debitUSSGL = '5700';
        creditUSSGL = '6100';
        break;
      case 'transfer':
      case 'allocation':
        // Transfer elimination
        debitUSSGL = '5720';
        creditUSSGL = '6300';
        break;
      default:
        debitUSSGL = '5700';
        creditUSSGL = '6100';
    }

    entries.push({
      id: uuid(),
      matchId: match.id,
      debitUSSGL,
      creditUSSGL,
      amount: eliminationAmount,
      buyerComponent: match.buyerTransaction.tradingPartnerAgency as DoDComponentCode,
      sellerComponent: match.sellerTransaction.tradingPartnerAgency as DoDComponentCode,
      transactionType: txnType,
      description:
        `IGT elimination: ${txnType} between ` +
        `${match.buyerTransaction.tradingPartnerAgency} (buyer) and ` +
        `${match.sellerTransaction.tradingPartnerAgency} (seller). ` +
        `Agreement: ${match.buyerTransaction.agreementNumber ?? 'N/A'}`,
      fiscalYear,
      period: match.buyerTransaction.period,
      generatedAt: new Date().toISOString(),
    });
  }

  return {
    entries,
    totalEliminationAmount: round2(
      entries.reduce((sum, e) => sum + e.amount, 0),
    ),
    entryCount: entries.length,
  };
}

// ---------------------------------------------------------------------------
// 4. GTAS Reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile agency IGT data against GTAS government-wide data.
 *
 * Compares agency-reported intragovernmental balances (by TAS)
 * against the GTAS/CARS buy-sell dataset. Identifies differences
 * and provides recommendations for resolution.
 *
 * Per TFM Vol I, Part 2, Ch 4700, agencies must reconcile their
 * intragovernmental activity with GTAS before quarterly certification.
 *
 * @param agencyData - Agency-reported IGT balances by TAS
 * @param gtasData - GTAS-reported IGT balances by TAS
 * @returns GTASReconciliationResult with differences and recommendations
 *
 * @see TFM Vol I, Part 2, Ch 4700 — GTAS reconciliation requirements
 * @see DoD FMR Vol. 4, Ch. 13 — GTAS buy-sell reconciliation
 */
export function reconcileWithGTAS(
  agencyData: AgencyIGTData,
  gtasData: GTASIGTData,
): GTASReconciliationResult {
  const differences: GTASDifference[] = [];

  // Build lookup of GTAS data by TAS
  const gtasByTAS = new Map<string, number>();
  for (const row of gtasData.tasSummary) {
    const existing = gtasByTAS.get(row.treasuryAccountSymbol) ?? 0;
    gtasByTAS.set(row.treasuryAccountSymbol, existing + row.reportedAmount);
  }

  // Compare agency TAS balances to GTAS
  for (const agencyRow of agencyData.tasSummary) {
    const tas = agencyRow.treasuryAccountSymbol;
    const agencyNetAmount = round2(agencyRow.buyerAmount - agencyRow.sellerAmount);
    const gtasAmount = gtasByTAS.get(tas);

    if (gtasAmount === undefined) {
      differences.push({
        id: uuid(),
        treasuryAccountSymbol: tas,
        agencyAmount: agencyNetAmount,
        gtasAmount: 0,
        difference: agencyNetAmount,
        differenceType: 'missing',
        recommendation:
          `TAS ${tas} exists in agency records but not in GTAS. ` +
          'Verify TAS is correctly reported or submit an adjustment.',
      });
      continue;
    }

    const diff = round2(Math.abs(agencyNetAmount - gtasAmount));
    if (diff > 0.01) {
      let differenceType: GTASDifferenceType = 'amount';
      let recommendation: string;

      if (diff > Math.abs(agencyNetAmount) * 0.1) {
        differenceType = 'classification';
        recommendation =
          `Significant difference ($${diff.toLocaleString()}) on TAS ${tas}. ` +
          'Review classification of transactions between buyer/seller. ' +
          'Coordinate with trading partner to identify root cause.';
      } else {
        recommendation =
          `Difference of $${diff.toLocaleString()} on TAS ${tas}. ` +
          'May be timing difference — verify period cut-off alignment.';
        differenceType = 'timing';
      }

      differences.push({
        id: uuid(),
        treasuryAccountSymbol: tas,
        agencyAmount: agencyNetAmount,
        gtasAmount: round2(gtasAmount),
        difference: diff,
        differenceType,
        recommendation,
      });
    }

    gtasByTAS.delete(tas);
  }

  // GTAS entries with no agency counterpart
  for (const [tas, gtasAmount] of Array.from(gtasByTAS.entries())) {
    if (Math.abs(gtasAmount) < 0.01) continue;
    differences.push({
      id: uuid(),
      treasuryAccountSymbol: tas,
      agencyAmount: 0,
      gtasAmount: round2(gtasAmount),
      difference: round2(Math.abs(gtasAmount)),
      differenceType: 'missing',
      recommendation:
        `TAS ${tas} reported in GTAS ($${round2(gtasAmount).toLocaleString()}) ` +
        'but not in agency records. Investigate missing transactions.',
    });
  }

  const totalDifferenceAmount = round2(
    differences.reduce((sum, d) => sum + d.difference, 0),
  );

  // Generate high-level recommendations
  const recommendations: string[] = [];
  if (differences.length === 0) {
    recommendations.push('Agency IGT data is fully reconciled with GTAS.');
  } else {
    recommendations.push(
      `${differences.length} difference(s) identified totaling $${totalDifferenceAmount.toLocaleString()}.`,
    );

    const missingCount = differences.filter(
      (d) => d.differenceType === 'missing',
    ).length;
    if (missingCount > 0) {
      recommendations.push(
        `${missingCount} TAS(s) missing from one side — coordinate with trading partners.`,
      );
    }

    const classificationCount = differences.filter(
      (d) => d.differenceType === 'classification',
    ).length;
    if (classificationCount > 0) {
      recommendations.push(
        `${classificationCount} significant classification difference(s) require deep-dive analysis.`,
      );
    }

    if (totalDifferenceAmount > 1_000_000) {
      recommendations.push(
        'Total differences exceed $1M — escalate to Component CFO per DoD FMR Vol. 4, Ch. 13.',
      );
    }
  }

  return {
    id: uuid(),
    agencyId: agencyData.agencyId,
    fiscalYear: agencyData.fiscalYear,
    period: agencyData.period,
    isReconciled: differences.length === 0,
    differences,
    totalDifferenceAmount,
    recommendations,
    reconciledAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 5. Quarterly IGT Report
// ---------------------------------------------------------------------------

/**
 * Generate an IGT quarterly status report.
 *
 * Per Treasury FBwT guidance and DoD FMR Vol. 4, Ch. 13, agencies
 * must report their intragovernmental transaction reconciliation
 * status on a quarterly basis. The report includes:
 *   - Transaction volume and dollar totals
 *   - Matching/reconciliation rates
 *   - Open dispute aging
 *   - Elimination entry summaries
 *   - GTAS reconciliation status
 *
 * @param matchResult - Trading partner match results
 * @param disputes - Current dispute records
 * @param eliminationResult - Generated elimination entries
 * @param gtasReconciliation - GTAS reconciliation results
 * @param reportingAgency - Name of the reporting agency
 * @param fiscalYear - Fiscal year
 * @param quarter - Reporting quarter (1-4)
 * @returns IGTQuarterlyReport
 *
 * @see Treasury FBwT Guidance — quarterly reporting requirements
 * @see DoD FMR Vol. 4, Ch. 13 — reporting format
 */
export function generateIGTReport(
  matchResult: TradingPartnerMatchResult,
  disputes: IGTDispute[],
  eliminationResult: EliminationEntryResult,
  gtasReconciliation: GTASReconciliationResult | null,
  reportingAgency: string,
  fiscalYear: number,
  quarter: 1 | 2 | 3 | 4,
): IGTQuarterlyReport {
  // Dispute aging buckets
  const openDisputes = disputes.filter(
    (d) => d.status !== 'resolved' && d.status !== 'closed',
  );
  const under30 = openDisputes.filter((d) => d.agingDays < 30).length;
  const days30to60 = openDisputes.filter(
    (d) => d.agingDays >= 30 && d.agingDays < 60,
  ).length;
  const days60to90 = openDisputes.filter(
    (d) => d.agingDays >= 60 && d.agingDays < 90,
  ).length;
  const over90 = openDisputes.filter((d) => d.agingDays >= 90).length;
  const totalDisputedAmount = round2(
    openDisputes.reduce((s, d) => s + d.difference, 0),
  );

  const totalTransactions =
    matchResult.summary.totalBuyerTransactions +
    matchResult.summary.totalSellerTransactions;
  const matchRate =
    totalTransactions > 0
      ? round2(
          (matchResult.summary.matchedCount /
            (matchResult.summary.matchedCount +
              matchResult.summary.unmatchedCount +
              matchResult.summary.disputedCount)) *
            100,
        )
      : 0;

  // Calculate buyer/seller totals from match result
  const totalBuyerAmount = round2(
    matchResult.matched.reduce((s, m) => s + m.buyerTransaction.amount, 0) +
    matchResult.unmatched
      .filter((m) => m.buyerTransaction.buyerSellerIndicator === 'buyer')
      .reduce((s, m) => s + m.buyerTransaction.amount, 0) +
    matchResult.disputed.reduce((s, m) => s + m.buyerTransaction.amount, 0),
  );

  const totalSellerAmount = round2(
    matchResult.matched
      .filter((m) => m.sellerTransaction !== null)
      .reduce((s, m) => s + m.sellerTransaction!.amount, 0) +
    matchResult.unmatched
      .filter((m) => m.buyerTransaction.buyerSellerIndicator === 'seller')
      .reduce((s, m) => s + m.buyerTransaction.amount, 0),
  );

  return {
    id: uuid(),
    reportingAgency,
    fiscalYear,
    quarter,
    reportDate: new Date().toISOString().split('T')[0],
    transactionSummary: {
      totalBuyerTransactions: matchResult.summary.totalBuyerTransactions,
      totalSellerTransactions: matchResult.summary.totalSellerTransactions,
      totalBuyerAmount,
      totalSellerAmount,
      netPosition: round2(totalBuyerAmount - totalSellerAmount),
    },
    reconciliationStatus: {
      matchedCount: matchResult.summary.matchedCount,
      unmatchedCount: matchResult.summary.unmatchedCount,
      disputedCount: matchResult.summary.disputedCount,
      matchRate,
    },
    disputeAging: {
      under30Days: under30,
      days30to60: days30to60,
      days60to90: days60to90,
      over90Days: over90,
      totalOpenDisputes: openDisputes.length,
      totalDisputedAmount,
    },
    eliminationSummary: {
      totalEntries: eliminationResult.entryCount,
      totalEliminationAmount: eliminationResult.totalEliminationAmount,
    },
    gtasReconciled: gtasReconciliation?.isReconciled ?? false,
    outstandingDifferences: gtasReconciliation?.totalDifferenceAmount ?? 0,
  };
}
