import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const transferPricingRules: AuditRule[] = [
  {
    id: 'IRS-TP-001',
    name: 'Related Party Transactions at Non-Arm\'s Length Prices',
    framework: 'IRS',
    category: 'Transfer Pricing',
    description: 'Identifies related-party transactions that may not reflect arm\'s length pricing under IRC §482',
    citation: 'IRC §482 - Allocation of income and deductions among taxpayers',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const rpAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('intercompany') ||
          name.includes('related party') ||
          name.includes('affiliate');
      });

      if (rpAccounts.length === 0) return findings;

      const totalRPBalance = rpAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalRPBalance > data.materialityThreshold) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-TP-001',
          'IRS',
          'high',
          'Material Related-Party Balances Require §482 Arm\'s Length Analysis',
          `${rpAccounts.length} accounts with intercompany/related-party/affiliate indicators carry aggregate balances of $${(totalRPBalance / 1000000).toFixed(1)}M, exceeding the materiality threshold of $${(data.materialityThreshold / 1000000).toFixed(1)}M. These balances must be tested for arm's length pricing under IRC §482.`,
          'IRC §482: In any case of two or more organizations, trades, or businesses owned or controlled directly or indirectly by the same interests, the Secretary may distribute, apportion, or allocate gross income, deductions, credits, or allowances to prevent evasion of taxes or clearly to reflect the income.',
          'Obtain or prepare a transfer pricing study documenting the arm\'s length nature of all intercompany transactions. Evaluate whether the comparable uncontrolled price (CUP), resale price, cost plus, or transactional net margin method is most appropriate. Ensure contemporaneous documentation meets §6662(e) penalty protection requirements.',
          totalRPBalance,
          rpAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-TP-002',
    name: 'Management Fees and Royalties to Related Entities',
    framework: 'IRS',
    category: 'Transfer Pricing',
    description: 'Detects management fees or royalty payments to related entities requiring §482 documentation',
    citation: 'IRC §482 - Allocation of income and deductions among taxpayers',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const feeAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return (name.includes('management fee') || name.includes('royalt') || name.includes('license fee')) &&
          (name.includes('intercompany') || name.includes('related') || name.includes('affiliate'));
      });

      const feeEntries = data.journalEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return (desc.includes('management fee') || desc.includes('royalt') || desc.includes('license fee')) &&
          (desc.includes('intercompany') || desc.includes('related') || desc.includes('affiliate'));
      });

      const feeAccountTotal = feeAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const feeEntryTotal = feeEntries.reduce((sum, je) =>
        sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
      );
      const totalFees = Math.max(feeAccountTotal, feeEntryTotal);

      if (totalFees > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-TP-002',
          'IRS',
          'medium',
          'Related-Party Management Fees or Royalties Detected',
          `Management fees, royalties, or license fees paid to related entities total $${(totalFees / 1000000).toFixed(1)}M. These payments are subject to heightened scrutiny under IRC §482 and require documentation demonstrating that amounts charged are consistent with arm's length standards.`,
          'IRC §482; Treas. Reg. §1.482-1(b)(1): The standard to be applied is that of a taxpayer dealing at arm\'s length with an uncontrolled taxpayer. An arm\'s length result is the result that would have been realized if uncontrolled taxpayers had engaged in the same transaction under the same circumstances.',
          'Verify that management fee or royalty agreements are documented in written intercompany agreements. Confirm that the fee basis (cost-based, revenue-based, or fixed) reflects arm\'s length terms. Benchmark rates against third-party comparable agreements. Ensure §6662(e) documentation requirements are satisfied.',
          totalFees,
          feeAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-TP-003',
    name: 'Intercompany Transaction Volume Review',
    framework: 'IRS',
    category: 'Transfer Pricing',
    description: 'Assesses the volume and frequency of intercompany transactions for §482 compliance risk',
    citation: 'IRC §482 - Allocation of income and deductions among taxpayers',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const icEntries = data.journalEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return desc.includes('intercompany') ||
          desc.includes('related party') ||
          desc.includes('affiliate');
      });

      if (icEntries.length === 0) return findings;

      const totalDebitVolume = icEntries.reduce((sum, je) =>
        sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
      );

      // Check for transfer pricing documentation in tax data
      const tpDocumentation = data.taxData.filter(t =>
        t.description.toLowerCase().includes('transfer pricing') ||
        t.description.toLowerCase().includes('§482') ||
        t.description.toLowerCase().includes('intercompany')
      );

      if (totalDebitVolume > data.materialityThreshold && tpDocumentation.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-TP-003',
          'IRS',
          'medium',
          'High Intercompany Transaction Volume Without Transfer Pricing Documentation',
          `${icEntries.length} intercompany journal entries with total debit volume of $${(totalDebitVolume / 1000000).toFixed(1)}M were identified, but no transfer pricing documentation was found in the tax workpapers. The volume exceeds the materiality threshold of $${(data.materialityThreshold / 1000000).toFixed(1)}M.`,
          'IRC §482; IRC §6662(e): A taxpayer subject to §482 adjustments may be subject to a 20% or 40% penalty unless contemporaneous documentation meeting §6662(e) requirements is maintained.',
          'Prepare or obtain contemporaneous transfer pricing documentation. The documentation should include an industry and company analysis, functional analysis, economic analysis with selection and application of the best method, and comparable data. Ensure documentation is completed by the tax return filing date.',
          totalDebitVolume
        ));
      }

      return findings;
    },
  },
];
