import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const consolidationRules: AuditRule[] = [
  {
    id: 'GAAP-CON-001',
    name: 'Inter-Company Balances Not Eliminated',
    framework: 'GAAP',
    category: 'Consolidation (ASC 810)',
    description: 'Identifies inter-company receivable and payable balances that do not net to zero, indicating incomplete or erroneous elimination entries',
    citation: 'ASC 810-10-45-1: Elimination of inter-company balances and transactions in consolidation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const intercompanyKeywords = ['intercompany', 'inter-company', 'ic ', 'i/c', 'due from', 'due to', 'affiliated', 'subsidiary', 'parent'];

      // Find inter-company receivable accounts (assets)
      const icReceivables = data.accounts.filter(a =>
        a.accountType === 'asset' &&
        intercompanyKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      // Find inter-company payable accounts (liabilities)
      const icPayables = data.accounts.filter(a =>
        a.accountType === 'liability' &&
        intercompanyKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      const totalICReceivables = icReceivables.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalICPayables = icPayables.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalICReceivables > 0 || totalICPayables > 0) {
        const netDifference = Math.abs(totalICReceivables - totalICPayables);

        // Inter-company balances should net to zero after elimination
        if (netDifference > data.materialityThreshold * 0.10) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-CON-001',
            'GAAP',
            'high',
            'Inter-Company Balances Do Not Net to Zero',
            `Inter-company receivables total $${(totalICReceivables / 1000000).toFixed(2)}M and inter-company payables total $${(totalICPayables / 1000000).toFixed(2)}M, resulting in a net difference of $${(netDifference / 1000).toFixed(0)}K. In a consolidated entity, all inter-company balances must be fully eliminated. A non-zero net balance may indicate: (1) missing elimination journal entries, (2) timing differences in inter-company transaction recording, (3) unreconciled inter-company accounts, or (4) errors in subsidiary-level accounting. This difference could result in overstatement of both assets and liabilities on the consolidated balance sheet.`,
            'ASC 810-10-45-1: In preparing consolidated financial statements, all inter-company balances and transactions shall be eliminated.',
            'Obtain the inter-company reconciliation schedule and identify the source of the imbalance. Verify that: (1) all subsidiaries have recorded reciprocal inter-company transactions, (2) elimination entries are complete and properly calculated, (3) any timing differences are documented and immaterial, (4) foreign currency translation has been properly applied to inter-company balances. Propose adjusting entries to eliminate any remaining differences.',
            netDifference,
            [...icReceivables, ...icPayables].map(a => a.accountNumber)
          ));
        }

        // Also flag if inter-company balances exist at all (they should be eliminated)
        if (netDifference <= data.materialityThreshold * 0.10 && (totalICReceivables + totalICPayables) > data.materialityThreshold) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-CON-001',
            'GAAP',
            'low',
            'Inter-Company Balances Present in Consolidated Accounts',
            `Inter-company accounts are present in the trial balance with receivables of $${(totalICReceivables / 1000000).toFixed(2)}M and payables of $${(totalICPayables / 1000000).toFixed(2)}M. While these balances approximately offset (net difference of $${(netDifference / 1000).toFixed(0)}K), their presence in the consolidated data may indicate that elimination entries have not yet been posted, or that the data reflects pre-consolidation subsidiary balances. Verify that the final consolidated financial statements properly eliminate all inter-company amounts.`,
            'ASC 810-10-45-1: In preparing consolidated financial statements, all inter-company balances and transactions shall be eliminated.',
            'Confirm whether the data represents pre- or post-consolidation balances. If pre-consolidation, ensure the consolidation process includes complete elimination entries for all inter-company balances, transactions, revenue, and cost of sales.',
            null,
            [...icReceivables, ...icPayables].map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-CON-002',
    name: 'Subsidiary Accounts Without Elimination Entries',
    framework: 'GAAP',
    category: 'Consolidation (ASC 810)',
    description: 'Detects subsidiary or affiliated entity accounts that lack corresponding elimination journal entries in the consolidation process',
    citation: 'ASC 810-10-45-1: Consolidation procedures and eliminations',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const subsidiaryKeywords = ['subsidiary', 'sub ', 'affiliated', 'division', 'branch', 'entity', 'unit '];
      const eliminationKeywords = ['elimination', 'consolidat', 'elim ', 'elim.', 'consol'];

      // Find accounts that appear to be subsidiary-specific
      const subsidiaryAccounts = data.accounts.filter(a =>
        subsidiaryKeywords.some(kw => a.accountName.toLowerCase().includes(kw)) &&
        Math.abs(a.endingBalance) > 0
      );

      if (subsidiaryAccounts.length === 0) return findings;

      // Check for elimination journal entries
      const eliminationJEs = data.journalEntries.filter(je => {
        const descLower = (je.description || '').toLowerCase();
        const sourceLower = (je.source || '').toLowerCase();
        return eliminationKeywords.some(kw => descLower.includes(kw) || sourceLower.includes(kw));
      });

      // Check which subsidiary accounts have related elimination entries
      const eliminatedAccountIds = new Set<string>();
      eliminationJEs.forEach(je => {
        je.lines.forEach(l => eliminatedAccountIds.add(l.accountId));
      });

      const uneliminatedSubAccounts = subsidiaryAccounts.filter(
        a => !eliminatedAccountIds.has(a.id)
      );

      if (uneliminatedSubAccounts.length > 0) {
        const totalUneliminatedBalance = uneliminatedSubAccounts.reduce(
          (sum, a) => sum + Math.abs(a.endingBalance), 0
        );

        if (totalUneliminatedBalance > data.materialityThreshold * 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-CON-002',
            'GAAP',
            'medium',
            'Subsidiary Accounts Lack Elimination Entries',
            `${uneliminatedSubAccounts.length} subsidiary-related account(s) with a total balance of $${(totalUneliminatedBalance / 1000000).toFixed(2)}M do not have corresponding elimination journal entries. Accounts include: ${uneliminatedSubAccounts.slice(0, 5).map(a => `${a.accountName} ($${(Math.abs(a.endingBalance) / 1000).toFixed(0)}K)`).join(', ')}${uneliminatedSubAccounts.length > 5 ? `, and ${uneliminatedSubAccounts.length - 5} more` : ''}. Under ASC 810, consolidation requires elimination of all inter-entity investments, balances, and transactions. The absence of elimination entries for subsidiary accounts may result in double-counting of assets, liabilities, revenue, or expenses in the consolidated financial statements.`,
            'ASC 810-10-45-1: The financial statements of the parent and its subsidiaries are combined and intercompany items are eliminated. All intercompany balances and transactions shall be eliminated.',
            'Review the consolidation workpapers to determine whether elimination entries exist outside of the journal entry data. If eliminations are missing, prepare the necessary entries to: (1) eliminate the parent\'s investment in subsidiary equity, (2) eliminate inter-company revenue and expenses, (3) eliminate inter-company receivables and payables, (4) eliminate inter-company profits in inventory or fixed assets. Document and test consolidation controls.',
            totalUneliminatedBalance,
            uneliminatedSubAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
