/**
 * Related Party Management & Analysis (ASC 850 / AU-C 550)
 *
 * Provides:
 * - Related party entity registry
 * - Transaction identification from journal entries
 * - Arm's length assessment
 * - ASC 850 disclosure completeness check
 */

export type RelationshipType =
  | 'parent'
  | 'subsidiary'
  | 'affiliate'
  | 'key_management'
  | 'close_family'
  | 'joint_venture'
  | 'significant_investor'
  | 'other';

export type ArmLengthAssessment = 'comparable' | 'not_comparable' | 'not_assessed';

export interface RelatedParty {
  id: string;
  partyName: string;
  relationship: RelationshipType;
  ownershipPct?: number;
  controlIndicators?: string;
}

export interface RelatedPartyTransaction {
  id: string;
  relatedPartyId: string;
  partyName: string;
  transactionType: string;
  description: string;
  amount: number;
  terms?: string;
  businessPurpose?: string;
  armLengthAssessment: ArmLengthAssessment;
  disclosed: boolean;
}

export interface RelatedPartyAnalysis {
  parties: RelatedParty[];
  transactions: RelatedPartyTransaction[];
  totalTransactionVolume: number;
  undisclosedTransactions: RelatedPartyTransaction[];
  notAssessedTransactions: RelatedPartyTransaction[];
  notComparableTransactions: RelatedPartyTransaction[];
  disclosureComplete: boolean;
  findings: RelatedPartyFinding[];
  summary: string;
}

export interface RelatedPartyFinding {
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string;
}

/**
 * Identify potential related party transactions from journal entries.
 * Uses keyword matching and known party names.
 */
export function identifyRelatedPartyTransactions(
  journalEntries: Array<{
    id: string;
    description: string;
    date: string;
    lines: Array<{ debit: number; credit: number; description?: string }>;
  }>,
  knownParties: RelatedParty[]
): Array<{
  entryId: string;
  description: string;
  amount: number;
  matchedParty?: string;
  matchType: 'name_match' | 'keyword_match';
}> {
  const rpKeywords = [
    'intercompany', 'related party', 'affiliated', 'management fee',
    'transfer', 'loan to officer', 'loan from officer', 'shareholder',
    'director', 'officer loan', 'due to', 'due from', 'consulting fee',
    'royalty', 'lease payment', 'rent expense'
  ];

  const partyNames = knownParties.map(p => p.partyName.toLowerCase());
  const matches: Array<{
    entryId: string;
    description: string;
    amount: number;
    matchedParty?: string;
    matchType: 'name_match' | 'keyword_match';
  }> = [];

  for (const entry of journalEntries) {
    const desc = entry.description.toLowerCase();
    const lineDescs = entry.lines.map(l => (l.description || '').toLowerCase());
    const allText = [desc, ...lineDescs].join(' ');
    const totalAmount = entry.lines.reduce((s, l) => s + Math.max(l.debit, l.credit), 0);

    // Check for known party name matches
    for (const partyName of partyNames) {
      if (allText.includes(partyName)) {
        const party = knownParties.find(p => p.partyName.toLowerCase() === partyName);
        matches.push({
          entryId: entry.id,
          description: entry.description,
          amount: totalAmount,
          matchedParty: party?.partyName,
          matchType: 'name_match',
        });
        break;
      }
    }

    // Check for keyword matches (only if not already matched by name)
    if (!matches.find(m => m.entryId === entry.id)) {
      for (const keyword of rpKeywords) {
        if (allText.includes(keyword)) {
          matches.push({
            entryId: entry.id,
            description: entry.description,
            amount: totalAmount,
            matchType: 'keyword_match',
          });
          break;
        }
      }
    }
  }

  return matches;
}

/**
 * Evaluate related party transactions for ASC 850 disclosure completeness
 * and arm's length compliance.
 */
export function evaluateRelatedParties(
  parties: RelatedParty[],
  transactions: RelatedPartyTransaction[],
  materialityThreshold: number
): RelatedPartyAnalysis {
  const undisclosed = transactions.filter(t => !t.disclosed);
  const notAssessed = transactions.filter(t => t.armLengthAssessment === 'not_assessed');
  const notComparable = transactions.filter(t => t.armLengthAssessment === 'not_comparable');
  const totalVolume = transactions.reduce((s, t) => s + Math.abs(t.amount), 0);

  const findings: RelatedPartyFinding[] = [];

  // Check for undisclosed material transactions
  const materialUndisclosed = undisclosed.filter(t => Math.abs(t.amount) >= materialityThreshold);
  if (materialUndisclosed.length > 0) {
    findings.push({
      severity: 'high',
      title: 'Undisclosed Material Related Party Transactions',
      description: `${materialUndisclosed.length} material related party transaction(s) totaling $${Math.round(materialUndisclosed.reduce((s, t) => s + Math.abs(t.amount), 0)).toLocaleString()} have not been disclosed in the financial statements as required by ASC 850-10-50.`,
      recommendation: 'Ensure all material related party transactions are disclosed including the nature of the relationship, transaction description, amounts, and any terms.',
    });
  }

  // Check for non-arm's length transactions
  if (notComparable.length > 0) {
    findings.push({
      severity: 'medium',
      title: 'Related Party Transactions Not at Arm\'s Length',
      description: `${notComparable.length} transaction(s) were assessed as not being at arm's length terms. Total amount: $${Math.round(notComparable.reduce((s, t) => s + Math.abs(t.amount), 0)).toLocaleString()}.`,
      recommendation: 'Evaluate whether non-arm\'s length terms result in financial statement misstatement. Ensure adequate disclosure of the nature of the terms.',
    });
  }

  // Check for unassessed transactions
  if (notAssessed.length > 0) {
    findings.push({
      severity: 'medium',
      title: 'Related Party Transactions Not Assessed for Arm\'s Length Terms',
      description: `${notAssessed.length} transaction(s) have not been assessed for arm's length compliance.`,
      recommendation: 'Complete arm\'s length assessment for all related party transactions by comparing to market terms for similar transactions.',
    });
  }

  // Check for significant volume relative to total activity
  if (totalVolume > materialityThreshold * 2) {
    findings.push({
      severity: 'low',
      title: 'Significant Related Party Transaction Volume',
      description: `Total related party transaction volume of $${Math.round(totalVolume).toLocaleString()} is significant relative to materiality. Enhanced scrutiny is recommended.`,
      recommendation: 'Evaluate whether the volume and nature of related party transactions indicates undue influence or control.',
    });
  }

  // Check for parties with no transactions (may indicate undiscovered transactions)
  const partiesWithTransactions = new Set(transactions.map(t => t.relatedPartyId));
  const partiesWithoutTransactions = parties.filter(p => !partiesWithTransactions.has(p.id));
  if (partiesWithoutTransactions.length > 0) {
    findings.push({
      severity: 'low',
      title: 'Related Parties Without Identified Transactions',
      description: `${partiesWithoutTransactions.length} known related party(ies) have no identified transactions: ${partiesWithoutTransactions.map(p => p.partyName).join(', ')}. Verify no transactions have been missed.`,
      recommendation: 'Inquire of management whether any transactions with these parties occurred during the period.',
    });
  }

  const disclosureComplete = materialUndisclosed.length === 0;

  const summary = findings.length === 0
    ? `${parties.length} related parties identified with ${transactions.length} transactions totaling $${Math.round(totalVolume).toLocaleString()}. All properly disclosed and assessed.`
    : `${findings.length} finding(s) identified in related party review. ${disclosureComplete ? 'Disclosures are complete.' : 'DISCLOSURE GAPS EXIST — must be resolved before opinion issuance.'}`;

  return {
    parties,
    transactions,
    totalTransactionVolume: totalVolume,
    undisclosedTransactions: undisclosed,
    notAssessedTransactions: notAssessed,
    notComparableTransactions: notComparable,
    disclosureComplete,
    findings,
    summary,
  };
}
