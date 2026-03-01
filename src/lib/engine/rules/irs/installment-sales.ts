import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const installmentSaleRules: AuditRule[] = [
  {
    id: 'IRS-INST-001',
    name: 'Installment Sale Recognition',
    framework: 'IRS',
    category: 'Installment Sales',
    description: 'Detects installment sale indicators (notes receivable from asset sales, deferred gain accounts) and verifies proper timing of gain recognition under IRC §453',
    citation: 'IRC §453 - Installment method',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Detect installment sale indicators in accounts
      const installmentAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return a.subType === 'installment_receivable' ||
          name.includes('installment') ||
          name.includes('notes receivable') && (name.includes('sale') || name.includes('asset') || name.includes('property')) ||
          name.includes('deferred gain') ||
          name.includes('unrecognized gain') ||
          name.includes('installment obligation');
      });

      // Detect installment sale indicators in tax data
      const installmentTaxData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('installment') ||
          desc.includes('§453') ||
          desc.includes('453') && desc.includes('sale') ||
          t.formType === '6252' ||
          desc.includes('deferred gain') ||
          desc.includes('gross profit ratio') ||
          desc.includes('contract price');
      });

      // Detect notes receivable from asset dispositions in journal entries
      const installmentEntries = data.journalEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return desc.includes('installment') ||
          (desc.includes('note') && (desc.includes('sale') || desc.includes('disposition') || desc.includes('property'))) ||
          desc.includes('deferred gain') ||
          desc.includes('§453');
      });

      if (installmentAccounts.length === 0 && installmentTaxData.length === 0 && installmentEntries.length === 0) return findings;

      const installmentBalance = installmentAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const installmentTaxAmount = installmentTaxData.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const totalAmount = Math.max(installmentBalance, installmentTaxAmount);

      // Check for Form 6252 or installment method documentation
      const hasForm6252 = installmentTaxData.some(t => t.formType === '6252');
      const hasGrossProfitRatio = installmentTaxData.some(t =>
        t.description.toLowerCase().includes('gross profit ratio') ||
        t.description.toLowerCase().includes('gross profit percentage')
      );

      // Check for deferred gain accounts
      const deferredGainAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('deferred gain') ||
          name.includes('unrecognized gain') ||
          name.includes('installment') && name.includes('gain');
      });
      const deferredGain = deferredGainAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check for related-party installment sales (§453(e) — disposition by related party triggers acceleration)
      const relatedPartyIndicators = installmentTaxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('related party') || desc.includes('related person') || desc.includes('§453(e)');
      });

      const relatedPartyEntries = installmentEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return desc.includes('related party') || desc.includes('affiliate') || desc.includes('related person');
      });

      if (!hasForm6252 && totalAmount > 0) {
        // Estimate potential deferred gain using a conservative gross profit ratio
        const estimatedDeferredGain = deferredGain > 0 ? deferredGain : totalAmount * 0.30;

        findings.push(createFinding(
          data.engagementId,
          'IRS-INST-001',
          'IRS',
          'medium',
          'Installment Sale Detected Without Form 6252',
          `Installment sale indicators were detected: ${installmentAccounts.length} installment-related account(s) (balance: $${(installmentBalance / 1000).toFixed(0)}K), ${installmentTaxData.length} tax data item(s), and ${installmentEntries.length} journal entry(ies). ${deferredGain > 0 ? `Deferred gain balance: $${(deferredGain / 1000).toFixed(0)}K. ` : ''}No Form 6252 (Installment Sale Income) was found in the tax workpapers. Under IRC §453, the installment method is the default for qualifying dispositions with at least one payment received after the year of sale, and Form 6252 must be filed for each year a payment is received.`,
          'IRC §453(a): Income from an installment sale shall be taken into account under the installment method. IRC §453(c): The installment method treats each payment as consisting of a proportionate share of gain (gross profit ratio times payment received).',
          'Prepare Form 6252 for each installment sale. Calculate the gross profit ratio (gain / contract price). Report the portion of each payment received during the year that represents gain. Verify selling price, adjusted basis, and contract price are correct. If the taxpayer wishes to elect out of the installment method under §453(d), the election must be made on a timely filed return.',
          estimatedDeferredGain,
          [...installmentAccounts.map(a => a.accountNumber), ...deferredGainAccounts.map(a => a.accountNumber)]
        ));
      } else if (hasForm6252 && !hasGrossProfitRatio) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-INST-001',
          'IRS',
          'low',
          'Installment Sale — Verify Gross Profit Ratio Computation',
          `Form 6252 is present but no gross profit ratio documentation was found. Installment balance: $${(installmentBalance / 1000).toFixed(0)}K. ${deferredGain > 0 ? `Deferred gain: $${(deferredGain / 1000).toFixed(0)}K. ` : ''}The gross profit ratio determines how much of each payment is taxable gain, and an incorrect ratio results in improper timing of income recognition throughout the installment period.`,
          'IRC §453(c): The term "installment method" means a method under which the income recognized for any taxable year from a disposition is that proportion of the payments received in that year which the gross profit bears to the total contract price.',
          'Document the gross profit ratio computation: gross profit (selling price less adjusted basis and selling expenses) divided by contract price (selling price less qualifying indebtedness assumed by the buyer that does not exceed basis). Apply the ratio to all payments received in the current year. Reconcile to Form 6252 lines.',
          null,
          installmentAccounts.map(a => a.accountNumber)
        ));
      }

      // Flag related-party installment sales
      if (relatedPartyIndicators.length > 0 || relatedPartyEntries.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-INST-001',
          'IRS',
          'high',
          'Related-Party Installment Sale — Potential Gain Acceleration',
          `Related-party installment sale indicators were detected (${relatedPartyIndicators.length} tax data item(s), ${relatedPartyEntries.length} journal entry(ies)). Under IRC §453(e), if a related party (as defined in §453(f)(1)) disposes of the property within 2 years, the original seller must recognize gain in the year of the second disposition. This anti-abuse rule prevents using installment sales to related parties as a means of deferring gain while the related party receives cash.`,
          'IRC §453(e)(1): If the person acquiring property in an installment sale is a related person and the related person disposes of such property before making all payments under the installment obligation, the original seller must recognize gain. IRC §453(f)(1): Related persons include those defined in §267(b) and §707(b)(1).',
          'Determine the relationship between buyer and seller under §267(b) and §707(b)(1). Monitor whether the related-party buyer has resold or disposed of the property within 2 years. If a second disposition occurred, compute the gain that must be accelerated. Exceptions may apply under §453(e)(6) for involuntary conversions and §453(e)(7) for tax-free transactions.',
          totalAmount,
          installmentAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
