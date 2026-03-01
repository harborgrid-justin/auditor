import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const likeKindExchangeRules: AuditRule[] = [
  {
    id: 'IRS-LKE-001',
    name: 'Like-Kind Property Qualification',
    framework: 'IRS',
    category: 'Like-Kind Exchanges',
    description: 'Verifies that like-kind exchange property qualifies as real property post-TCJA and flags personal property exchange indicators',
    citation: 'IRC §1031 - Exchange of real property held for productive use or investment',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // Detect like-kind exchange indicators in tax data
      const exchangeData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('like-kind') ||
          desc.includes('like kind') ||
          desc.includes('1031') ||
          desc.includes('exchange') && (desc.includes('property') || desc.includes('defer')) ||
          t.formType === '8824';
      });

      // Detect exchange-related journal entries
      const exchangeEntries = data.journalEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return desc.includes('like-kind') ||
          desc.includes('like kind') ||
          desc.includes('1031') ||
          desc.includes('exchange') && (desc.includes('property') || desc.includes('defer'));
      });

      // Detect exchange-related accounts (deferred gain, exchange intermediary)
      const exchangeAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('1031') ||
          name.includes('like-kind') ||
          name.includes('like kind') ||
          name.includes('exchange') && (name.includes('defer') || name.includes('intermediary') || name.includes('escrow')) ||
          name.includes('deferred gain') && name.includes('exchange');
      });

      if (exchangeData.length === 0 && exchangeEntries.length === 0 && exchangeAccounts.length === 0) return findings;

      // Post-TCJA (2018+): §1031 only applies to real property
      if (taxYear >= 2018) {
        // Check for personal property exchange indicators
        const personalPropertyIndicators = data.taxData.filter(t => {
          const desc = t.description.toLowerCase();
          return (desc.includes('1031') || desc.includes('like-kind') || desc.includes('like kind') || desc.includes('exchange')) &&
            (desc.includes('equipment') ||
             desc.includes('vehicle') ||
             desc.includes('machinery') ||
             desc.includes('furniture') ||
             desc.includes('computer') ||
             desc.includes('aircraft') ||
             desc.includes('artwork') ||
             desc.includes('collectible') ||
             desc.includes('intangible') ||
             desc.includes('personal property'));
        });

        const personalPropertyEntries = data.journalEntries.filter(je => {
          const desc = je.description.toLowerCase();
          return (desc.includes('1031') || desc.includes('like-kind') || desc.includes('exchange')) &&
            (desc.includes('equipment') ||
             desc.includes('vehicle') ||
             desc.includes('machinery') ||
             desc.includes('furniture') ||
             desc.includes('personal property'));
        });

        if (personalPropertyIndicators.length > 0 || personalPropertyEntries.length > 0) {
          const totalAmount = personalPropertyIndicators.reduce((sum, t) => sum + Math.abs(t.amount), 0);
          findings.push(createFinding(
            data.engagementId,
            'IRS-LKE-001',
            'IRS',
            'high',
            'Like-Kind Exchange May Include Non-Qualifying Personal Property',
            `Like-kind exchange data references personal property (equipment, vehicles, machinery, etc.) in tax year ${taxYear}. Post-TCJA (effective for exchanges completed after December 31, 2017), IRC §1031 only applies to real property. ${personalPropertyIndicators.length} tax data item(s) and ${personalPropertyEntries.length} journal entry(ies) reference personal property in connection with a §1031 exchange.${totalAmount > 0 ? ` Amounts involved: $${(totalAmount / 1000).toFixed(0)}K.` : ''} Any deferred gain on personal property exchanges must be recognized.`,
            'IRC §1031(a)(1) (as amended by TCJA §13303): No gain or loss shall be recognized on the exchange of real property held for productive use in a trade or business or for investment if such real property is exchanged solely for real property of like kind.',
            'Review the property involved in the exchange to confirm it qualifies as real property under Treas. Reg. §1.1031(a)-3. Personal property (equipment, vehicles, machinery, etc.) no longer qualifies for like-kind exchange treatment after 2017. If personal property was incorrectly deferred, recognize the gain in the current year and file an amended return if necessary.',
            totalAmount,
            exchangeAccounts.map(a => a.accountNumber)
          ));
        } else if (exchangeData.length > 0 || exchangeAccounts.length > 0) {
          // Exchange detected but no personal property flags — confirm it is real property
          const exchangeAmount = exchangeData.reduce((sum, t) => sum + Math.abs(t.amount), 0) ||
            exchangeAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

          findings.push(createFinding(
            data.engagementId,
            'IRS-LKE-001',
            'IRS',
            'medium',
            'Like-Kind Exchange Detected — Verify Real Property Qualification',
            `Like-kind exchange activity was detected with amounts totaling $${(exchangeAmount / 1000).toFixed(0)}K. Post-TCJA, only real property qualifies for §1031 treatment. Verify that the relinquished and replacement properties are both real property as defined in Treas. Reg. §1.1031(a)-3 (land, buildings, and structural components).`,
            'IRC §1031(a)(1): No gain or loss shall be recognized on the exchange of real property held for productive use in a trade or business or for investment if such real property is exchanged solely for real property of like kind.',
            'Document the nature of both relinquished and replacement properties. Confirm both meet the definition of real property under the final regulations. Verify Form 8824 is properly completed. Ensure any boot received is properly recognized as gain.',
            null,
            exchangeAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-LKE-002',
    name: 'Exchange Timing Requirements',
    framework: 'IRS',
    category: 'Like-Kind Exchanges',
    description: 'Checks 45-day identification and 180-day completion periods for deferred like-kind exchanges',
    citation: 'IRC §1031(a)(3) - Requirement relating to timing of exchange',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Detect like-kind exchange indicators
      const exchangeData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('like-kind') ||
          desc.includes('like kind') ||
          desc.includes('1031') ||
          t.formType === '8824';
      });

      const exchangeEntries = data.journalEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return desc.includes('like-kind') ||
          desc.includes('like kind') ||
          desc.includes('1031') ||
          (desc.includes('exchange') && desc.includes('defer'));
      });

      const exchangeAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('1031') ||
          name.includes('like-kind') ||
          name.includes('exchange') && (name.includes('intermediary') || name.includes('escrow') || name.includes('defer'));
      });

      if (exchangeData.length === 0 && exchangeEntries.length === 0 && exchangeAccounts.length === 0) return findings;

      // Check for timing documentation
      const timingData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return (desc.includes('1031') || desc.includes('like-kind') || desc.includes('exchange')) &&
          (desc.includes('45') || desc.includes('45-day') || desc.includes('identification') ||
           desc.includes('180') || desc.includes('180-day') || desc.includes('completion') ||
           desc.includes('closing') || desc.includes('settlement'));
      });

      // Check for exchange intermediary / qualified intermediary (QI)
      const qiData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('qualified intermediary') ||
          desc.includes('exchange intermediary') ||
          desc.includes('accommodator') ||
          desc.includes('qi ') || desc.includes(' qi');
      });

      const qiAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('intermediary') ||
          name.includes('exchange escrow') ||
          name.includes('qi ') || name.includes(' qi');
      });

      // Flag if exchange exists but timing documentation is missing
      const exchangeAmount = exchangeData.reduce((sum, t) => sum + Math.abs(t.amount), 0) ||
        exchangeAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (timingData.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-LKE-002',
          'IRS',
          'high',
          'Like-Kind Exchange Timing Documentation Missing',
          `Like-kind exchange activity was detected (amounts: $${(exchangeAmount / 1000).toFixed(0)}K), but no documentation of the 45-day identification period or 180-day completion period was found. For deferred exchanges under §1031(a)(3), the replacement property must be identified within 45 days and received within 180 days of transferring the relinquished property. Failure to meet either deadline disqualifies the exchange.${qiData.length === 0 && qiAccounts.length === 0 ? ' Additionally, no qualified intermediary (QI) documentation was found — use of a QI is critical for deferred exchanges to avoid constructive receipt.' : ''}`,
          'IRC §1031(a)(3): Any property received by the taxpayer shall be treated as property which is not like-kind property if (A) such property is not identified as replacement property before the day which is 45 days after the date of transfer, or (B) such property is received after the earlier of 180 days after the date of transfer or the due date of the return.',
          'Obtain and document the following for the deferred exchange: (1) Date the relinquished property was transferred; (2) Written identification of replacement property within 45 days — verify compliance with the 3-property rule, 200% rule, or 95% rule; (3) Date replacement property was received — verify within 180 days; (4) Qualified intermediary agreement and exchange documentation; (5) Form 8824 reporting all exchange details.',
          exchangeAmount,
          exchangeAccounts.map(a => a.accountNumber)
        ));
      }

      // If there is an exchange intermediary balance at year-end, flag it
      const qiBalance = qiAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      if (qiBalance > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-LKE-002',
          'IRS',
          'medium',
          'Exchange Intermediary Balance Outstanding at Year-End',
          `An outstanding balance of $${(qiBalance / 1000).toFixed(0)}K is held with an exchange intermediary or in an exchange escrow account at year-end. This may indicate a §1031 exchange is in progress and spans the fiscal year boundary. Verify that the 45-day identification and 180-day completion deadlines will be met in the subsequent period. If the exchange fails, the proceeds must be recognized as gain.`,
          'IRC §1031(a)(3): The identification and completion periods are strict deadlines. Treas. Reg. §1.1031(k)-1(g): The taxpayer must use a qualified intermediary to avoid constructive receipt of exchange proceeds.',
          'Monitor the exchange to ensure timely identification and completion. Document the expected closing dates. If the exchange may fail, prepare for gain recognition. Ensure the exchange agreement includes proper safe harbor language to avoid constructive receipt under Treas. Reg. §1.1031(k)-1(g)(4).',
          qiBalance,
          qiAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
