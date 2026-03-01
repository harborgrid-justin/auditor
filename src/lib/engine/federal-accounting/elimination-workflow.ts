/**
 * Consolidation Elimination Workflow Engine
 *
 * Handles the buyer-seller matching workflow for intragovernmental
 * transactions (IGT) and generates elimination journal entries
 * for consolidated DoD financial statements.
 *
 * This extends the existing consolidation.ts engine by adding:
 *   - Automated buyer-seller matching with tolerance thresholds
 *   - Elimination entry generation per USSGL accounting standards
 *   - Dispute resolution workflow for unmatched transactions
 *   - Consolidated trial balance generation
 *
 * References:
 *   - DoD FMR Vol 6B Ch 13: Intragovernmental Transactions
 *   - Treasury FMS Intragovernmental Reporting Guidelines
 *   - SFFAS 47: Reporting Entity (consolidation requirements)
 *   - OMB Circular A-136: Form and content requirements
 */

import type {
  IntragovernmentalTransaction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ConsolidationElimination,
  DoDComponentCode,
  USSGLAccount,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IGTMatchResult {
  matchId: string;
  buyerTransaction: IntragovernmentalTransaction;
  sellerTransaction: IntragovernmentalTransaction | null;
  matchStatus: 'matched' | 'partial_match' | 'unmatched';
  difference: number;
  withinTolerance: boolean;
}

export interface EliminationEntry {
  id: string;
  matchId: string;
  debitAccountCode: string;
  creditAccountCode: string;
  amount: number;
  buyerComponent: DoDComponentCode;
  sellerComponent: DoDComponentCode;
  description: string;
  generatedAt: string;
}

export interface IGTDispute {
  id: string;
  matchId: string;
  buyerComponent: DoDComponentCode;
  sellerComponent: DoDComponentCode;
  buyerAmount: number;
  sellerAmount: number;
  difference: number;
  status: 'open' | 'under_review' | 'resolved' | 'escalated';
  resolution?: string;
  resolvedAt?: string;
}

export interface EliminationWorkflowResult {
  matches: IGTMatchResult[];
  eliminationEntries: EliminationEntry[];
  disputes: IGTDispute[];
  summary: {
    totalTransactions: number;
    matchedCount: number;
    partialMatchCount: number;
    unmatchedCount: number;
    totalEliminationAmount: number;
    disputeCount: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dollar tolerance for buyer-seller matching (per Treasury guidance) */
const MATCH_TOLERANCE_DOLLARS = 500;

/** Percentage tolerance for partial matches */
const MATCH_TOLERANCE_PERCENT = 0.01; // 1%

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

/**
 * Match buyer and seller IGT transactions.
 *
 * Matches on trading partner agency + agreement number, then compares amounts.
 */
export function matchBuyerSellerTransactions(
  transactions: IntragovernmentalTransaction[],
): IGTMatchResult[] {
  const buyers = transactions.filter(t => t.buyerSellerIndicator === 'buyer');
  const sellers = [...transactions.filter(t => t.buyerSellerIndicator === 'seller')];
  const results: IGTMatchResult[] = [];

  for (const buyer of buyers) {
    // Find matching seller by trading partner + agreement
    const sellerIdx = sellers.findIndex(
      s =>
        s.tradingPartnerAgency === buyer.tradingPartnerAgency &&
        s.agreementNumber === buyer.agreementNumber,
    );

    if (sellerIdx === -1) {
      results.push({
        matchId: genId('match'),
        buyerTransaction: buyer,
        sellerTransaction: null,
        matchStatus: 'unmatched',
        difference: buyer.amount,
        withinTolerance: false,
      });
      continue;
    }

    const seller = sellers.splice(sellerIdx, 1)[0];
    const diff = Math.abs(buyer.amount - seller.amount);
    const pctDiff = buyer.amount > 0 ? diff / buyer.amount : 0;

    let status: IGTMatchResult['matchStatus'] = 'matched';
    let withinTolerance = true;

    if (diff > MATCH_TOLERANCE_DOLLARS && pctDiff > MATCH_TOLERANCE_PERCENT) {
      status = 'partial_match';
      withinTolerance = false;
    } else if (diff > 0.01) {
      status = 'partial_match';
      withinTolerance = true; // within tolerance
    }

    results.push({
      matchId: genId('match'),
      buyerTransaction: buyer,
      sellerTransaction: seller,
      matchStatus: status,
      difference: Math.round(diff * 100) / 100,
      withinTolerance,
    });
  }

  // Remaining unmatched sellers
  for (const seller of sellers) {
    results.push({
      matchId: genId('match'),
      buyerTransaction: seller, // seller with no buyer
      sellerTransaction: null,
      matchStatus: 'unmatched',
      difference: seller.amount,
      withinTolerance: false,
    });
  }

  return results;
}

/**
 * Generate elimination journal entries for matched transactions.
 *
 * For each matched pair, creates a debit/credit entry that removes the
 * intragovernmental balance from the consolidated statements.
 */
export function generateEliminationEntries(
  matches: IGTMatchResult[],
): EliminationEntry[] {
  const entries: EliminationEntry[] = [];

  for (const match of matches) {
    if (match.matchStatus === 'unmatched') continue;

    const amount = match.sellerTransaction
      ? Math.min(match.buyerTransaction.amount, match.sellerTransaction.amount)
      : 0;

    if (amount <= 0) continue;

    entries.push({
      id: genId('elim'),
      matchId: match.matchId,
      debitAccountCode: '5700', // Revenue elimination
      creditAccountCode: '6100', // Expense elimination
      amount: Math.round(amount * 100) / 100,
      buyerComponent: match.buyerTransaction.tradingPartnerAgency as DoDComponentCode,
      sellerComponent: (match.sellerTransaction?.tradingPartnerAgency ??
        match.buyerTransaction.tradingPartnerAgency) as DoDComponentCode,
      description: `Elimination entry: agreement ${match.buyerTransaction.agreementNumber ?? 'N/A'}`,
      generatedAt: new Date().toISOString(),
    });
  }

  return entries;
}

/**
 * Create disputes for unmatched or out-of-tolerance transactions.
 */
export function resolveIGTDisputes(
  matches: IGTMatchResult[],
): IGTDispute[] {
  const disputes: IGTDispute[] = [];

  for (const match of matches) {
    if (match.matchStatus === 'matched' || match.withinTolerance) continue;

    disputes.push({
      id: genId('dispute'),
      matchId: match.matchId,
      buyerComponent: match.buyerTransaction.tradingPartnerAgency as DoDComponentCode,
      sellerComponent: (match.sellerTransaction?.tradingPartnerAgency ??
        'unknown') as DoDComponentCode,
      buyerAmount: match.buyerTransaction.amount,
      sellerAmount: match.sellerTransaction?.amount ?? 0,
      difference: match.difference,
      status: 'open',
    });
  }

  return disputes;
}

/**
 * Generate consolidated trial balance from component accounts
 * and elimination entries.
 */
export function generateConsolidatedTrialBalance(
  componentAccounts: Map<DoDComponentCode, USSGLAccount[]>,
  eliminationEntries: EliminationEntry[],
): {
  componentTotals: { component: DoDComponentCode; debits: number; credits: number }[];
  totalEliminations: number;
  consolidatedDebits: number;
  consolidatedCredits: number;
  isBalanced: boolean;
} {
  const componentTotals: { component: DoDComponentCode; debits: number; credits: number }[] = [];

  let grossDebits = 0;
  let grossCredits = 0;

  for (const [component, accounts] of Array.from(componentAccounts.entries())) {
    let debits = 0;
    let credits = 0;

    for (const acct of accounts) {
      if (acct.normalBalance === 'debit') {
        debits += Math.abs(acct.endBalance);
      } else {
        credits += Math.abs(acct.endBalance);
      }
    }

    componentTotals.push({
      component,
      debits: Math.round(debits * 100) / 100,
      credits: Math.round(credits * 100) / 100,
    });

    grossDebits += debits;
    grossCredits += credits;
  }

  const totalEliminations = eliminationEntries.reduce((s, e) => s + e.amount, 0);
  const consolidatedDebits = Math.round((grossDebits - totalEliminations) * 100) / 100;
  const consolidatedCredits = Math.round((grossCredits - totalEliminations) * 100) / 100;

  return {
    componentTotals,
    totalEliminations: Math.round(totalEliminations * 100) / 100,
    consolidatedDebits,
    consolidatedCredits,
    isBalanced: Math.abs(consolidatedDebits - consolidatedCredits) < 0.01,
  };
}

/**
 * Run the complete elimination workflow.
 */
export function runEliminationWorkflow(
  transactions: IntragovernmentalTransaction[],
): EliminationWorkflowResult {
  const matches = matchBuyerSellerTransactions(transactions);
  const eliminationEntries = generateEliminationEntries(matches);
  const disputes = resolveIGTDisputes(matches);

  return {
    matches,
    eliminationEntries,
    disputes,
    summary: {
      totalTransactions: transactions.length,
      matchedCount: matches.filter(m => m.matchStatus === 'matched').length,
      partialMatchCount: matches.filter(m => m.matchStatus === 'partial_match').length,
      unmatchedCount: matches.filter(m => m.matchStatus === 'unmatched').length,
      totalEliminationAmount: eliminationEntries.reduce((s, e) => s + e.amount, 0),
      disputeCount: disputes.length,
    },
  };
}
