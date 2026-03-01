/**
 * Multi-Component Consolidation Engine
 *
 * Handles consolidation of DoD component financial statements including
 * identification of intragovernmental transactions, generation of
 * eliminating entries, and production of a consolidated trial balance.
 *
 * DoD has dozens of components (Army, Navy, Air Force, Marines, DLA, DFAS, etc.)
 * that must consolidate their financial statements. This engine validates
 * reciprocal balances and generates consolidation adjustments.
 *
 * References:
 *   - DoD FMR Vol 6B: Form and Content of DoD Financial Statements
 *   - SFFAS 47: Reporting Entity
 *   - OMB Circular A-136: Financial Reporting Requirements
 */

import type { EngagementData } from '@/types/findings';
import type {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IntragovernmentalTransaction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ConsolidationElimination,
  ConsolidatedTrialBalance,
  DoDComponentCode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  USSGLAccount,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidationResult {
  fiscalYear: number;
  componentsIncluded: DoDComponentCode[];
  totalEliminatingEntries: number;
  totalEliminationAmount: number;
  unreconciledDifferences: number;
  findings: ConsolidationFinding[];
  trialBalance: ConsolidatedTrialBalance;
}

export interface ConsolidationFinding {
  findingType: 'reciprocal_mismatch' | 'missing_counterpart' | 'classification_difference' | 'material_difference' | 'balance_error';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  buyerComponent: DoDComponentCode;
  sellerComponent: DoDComponentCode;
  amount: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform multi-component consolidation analysis.
 */
export function performConsolidation(data: EngagementData): ConsolidationResult {
  const dodData = data.dodData;
  const fy = data.taxYear;
  const findings: ConsolidationFinding[] = [];

  if (!dodData) {
    return emptyResult(fy);
  }

  const igtTransactions = dodData.intragovernmentalTransactions ?? [];
  const eliminations = dodData.consolidationEliminations ?? [];
  const accounts = dodData.ussglAccounts ?? [];

  // Identify unique components from transactions
  const components = new Set<DoDComponentCode>();
  components.add(dodData.dodComponent as DoDComponentCode);

  // Analyze intragovernmental transactions for reciprocal matching
  const buyerTransactions = igtTransactions.filter(t => t.buyerSellerIndicator === 'buyer');
  const sellerTransactions = igtTransactions.filter(t => t.buyerSellerIndicator === 'seller');

  // Match buyer/seller pairs by trading partner and agreement
  for (const buyer of buyerTransactions) {
    const matchingSellers = sellerTransactions.filter(
      s => s.tradingPartnerAgency === buyer.tradingPartnerAgency &&
        s.agreementNumber === buyer.agreementNumber
    );

    if (matchingSellers.length === 0) {
      findings.push({
        findingType: 'missing_counterpart',
        severity: 'high',
        description: `Buyer transaction ${buyer.id} with ${buyer.tradingPartnerAgency} ` +
          `(agreement ${buyer.agreementNumber ?? 'N/A'}) has no matching seller entry. ` +
          `Amount: $${buyer.amount.toLocaleString()}.`,
        buyerComponent: dodData.dodComponent as DoDComponentCode,
        sellerComponent: buyer.tradingPartnerAgency as DoDComponentCode,
        amount: buyer.amount,
      });
    } else {
      const sellerTotal = matchingSellers.reduce((sum, s) => sum + s.amount, 0);
      const diff = Math.abs(buyer.amount - sellerTotal);
      if (diff > 0.01) {
        const severity = diff > data.materialityThreshold ? 'critical' : diff > data.materialityThreshold * 0.5 ? 'high' : 'medium';
        findings.push({
          findingType: 'reciprocal_mismatch',
          severity,
          description: `Reciprocal balance mismatch between ${dodData.dodComponent} (buyer: ` +
            `$${buyer.amount.toLocaleString()}) and ${buyer.tradingPartnerAgency} ` +
            `(seller: $${sellerTotal.toLocaleString()}). Difference: $${diff.toLocaleString()}.`,
          buyerComponent: dodData.dodComponent as DoDComponentCode,
          sellerComponent: buyer.tradingPartnerAgency as DoDComponentCode,
          amount: diff,
        });
      }
    }
  }

  // Validate existing elimination entries
  let totalEliminationAmount = 0;
  for (const elim of eliminations) {
    totalEliminationAmount += elim.eliminationAmount;
    if (!elim.reconciled && elim.difference > 0.01) {
      findings.push({
        findingType: 'material_difference',
        severity: elim.difference > data.materialityThreshold ? 'critical' : 'medium',
        description: `Unreconciled elimination entry between ${elim.buyerComponent} and ` +
          `${elim.sellerComponent}. Buyer: $${elim.buyerAmount.toLocaleString()}, ` +
          `Seller: $${elim.sellerAmount.toLocaleString()}, Difference: $${elim.difference.toLocaleString()}.`,
        buyerComponent: elim.buyerComponent,
        sellerComponent: elim.sellerComponent,
        amount: elim.difference,
      });
    }
  }

  // Build consolidated trial balance
  const componentBalances = new Map<DoDComponentCode, { debits: number; credits: number }>();
  for (const acct of accounts) {
    const comp = dodData.dodComponent as DoDComponentCode;
    if (!componentBalances.has(comp)) {
      componentBalances.set(comp, { debits: 0, credits: 0 });
    }
    const bal = componentBalances.get(comp)!;
    if (acct.normalBalance === 'debit') {
      bal.debits += Math.abs(acct.endBalance);
    } else {
      bal.credits += Math.abs(acct.endBalance);
    }
  }

  const consolidatedDebits = Array.from(componentBalances.values()).reduce((s, b) => s + b.debits, 0) - totalEliminationAmount;
  const consolidatedCredits = Array.from(componentBalances.values()).reduce((s, b) => s + b.credits, 0) - totalEliminationAmount;

  const trialBalance: ConsolidatedTrialBalance = {
    fiscalYear: fy,
    componentBalances: Array.from(componentBalances.entries()).map(([comp, bal]) => ({
      component: comp,
      totalDebits: Math.round(bal.debits * 100) / 100,
      totalCredits: Math.round(bal.credits * 100) / 100,
    })),
    eliminations,
    consolidatedDebits: Math.round(consolidatedDebits * 100) / 100,
    consolidatedCredits: Math.round(consolidatedCredits * 100) / 100,
    isBalanced: Math.abs(consolidatedDebits - consolidatedCredits) < 0.01,
  };

  if (!trialBalance.isBalanced) {
    findings.push({
      findingType: 'balance_error',
      severity: 'critical',
      description: `Consolidated trial balance is out of balance. Debits: ` +
        `$${consolidatedDebits.toLocaleString()}, Credits: $${consolidatedCredits.toLocaleString()}, ` +
        `Difference: $${Math.abs(consolidatedDebits - consolidatedCredits).toLocaleString()}.`,
      buyerComponent: dodData.dodComponent as DoDComponentCode,
      sellerComponent: dodData.dodComponent as DoDComponentCode,
      amount: Math.abs(consolidatedDebits - consolidatedCredits),
    });
  }

  return {
    fiscalYear: fy,
    componentsIncluded: Array.from(components),
    totalEliminatingEntries: eliminations.length,
    totalEliminationAmount: Math.round(totalEliminationAmount * 100) / 100,
    unreconciledDifferences: findings.filter(f => f.findingType === 'reciprocal_mismatch' || f.findingType === 'material_difference').length,
    findings,
    trialBalance,
  };
}

function emptyResult(fy: number): ConsolidationResult {
  return {
    fiscalYear: fy,
    componentsIncluded: [],
    totalEliminatingEntries: 0,
    totalEliminationAmount: 0,
    unreconciledDifferences: 0,
    findings: [],
    trialBalance: {
      fiscalYear: fy,
      componentBalances: [],
      eliminations: [],
      consolidatedDebits: 0,
      consolidatedCredits: 0,
      isBalanced: true,
    },
  };
}
