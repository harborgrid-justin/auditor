import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const businessCombinationsRules: AuditRule[] = [
  {
    id: 'GAAP-BC-001',
    name: 'Goodwill Concentration Risk',
    framework: 'GAAP',
    category: 'Business Combinations (ASC 805)',
    description: 'Identifies when goodwill exceeds 50% of total assets, indicating significant acquisition risk and potential impairment exposure',
    citation: 'ASC 805-30-30-1: Measurement of goodwill in business combinations',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const goodwillAccounts = data.accounts.filter(
        a => a.accountName.toLowerCase().includes('goodwill') && a.subType === 'intangible'
      );
      const totalAssetAccounts = data.accounts.filter(a => a.accountType === 'asset');

      const totalGoodwill = goodwillAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const totalAssets = totalAssetAccounts.reduce((sum, a) => sum + a.endingBalance, 0);

      if (totalGoodwill > 0 && totalAssets > 0) {
        const goodwillToAssetsRatio = totalGoodwill / totalAssets;

        if (goodwillToAssetsRatio > 0.50) {
          const goodwillBeginning = goodwillAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
          const goodwillChange = totalGoodwill - goodwillBeginning;
          const changeDescription = goodwillChange > 0
            ? `Goodwill increased by $${(goodwillChange / 1000000).toFixed(2)}M during the period, potentially from new acquisitions.`
            : goodwillChange < 0
              ? `Goodwill decreased by $${(Math.abs(goodwillChange) / 1000000).toFixed(2)}M during the period, potentially from impairment charges or divestitures.`
              : 'No change in goodwill balance was recorded during the period.';

          findings.push(createFinding(
            data.engagementId,
            'GAAP-BC-001',
            'GAAP',
            'high',
            'Goodwill Exceeds 50% of Total Assets',
            `Goodwill of $${(totalGoodwill / 1000000).toFixed(2)}M represents ${(goodwillToAssetsRatio * 100).toFixed(1)}% of total assets ($${(totalAssets / 1000000).toFixed(2)}M), exceeding the 50% concentration threshold. ${changeDescription} A high goodwill concentration exposes the entity to significant impairment risk and raises questions about the recoverability of acquisition premiums. Under ASC 805, goodwill recognized in a business combination must be tested for impairment at least annually, and management should demonstrate that the reporting unit fair value supports the carrying amount.`,
            'ASC 805-30-30-1: The acquirer shall recognize goodwill as of the acquisition date, measured as the excess of the consideration transferred over the net of the acquisition-date amounts of the identifiable assets acquired and the liabilities assumed.',
            'Obtain the schedule of goodwill by reporting unit and the most recent impairment analysis. Evaluate whether: (1) goodwill has been properly allocated to reporting units, (2) impairment testing has been performed timely and with reasonable assumptions, (3) the fair value of each reporting unit exceeds its carrying amount including goodwill. Consider whether changes in market conditions or business performance require interim impairment testing.',
            totalGoodwill,
            goodwillAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-BC-002',
    name: 'Large Acquisition Without Documentation',
    framework: 'GAAP',
    category: 'Business Combinations (ASC 805)',
    description: 'Detects large journal entries to acquisition-related accounts that may indicate undocumented or improperly recorded business combinations',
    citation: 'ASC 805-10-25-1: Recognition of assets acquired and liabilities assumed in a business combination',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Look for large journal entries to goodwill, intangible assets, or acquisition-related accounts
      const acquisitionKeywords = ['goodwill', 'acquisition', 'purchase', 'merger', 'intangible', 'customer list', 'trademark', 'patent', 'noncompete', 'non-compete'];

      const acquisitionJEs = data.journalEntries.filter(je => {
        const hasAcquisitionLine = je.lines.some(l => {
          const name = (l.accountName || '').toLowerCase();
          const desc = (l.description || '').toLowerCase();
          return acquisitionKeywords.some(kw => name.includes(kw) || desc.includes(kw));
        });
        const hasLargeAmount = je.lines.some(l =>
          l.debit > data.materialityThreshold || l.credit > data.materialityThreshold
        );
        return hasAcquisitionLine && hasLargeAmount;
      });

      // Check if these JEs lack approval (approvedBy is null)
      const undocumentedAcquisitionJEs = acquisitionJEs.filter(je => !je.approvedBy);

      if (undocumentedAcquisitionJEs.length > 0) {
        const totalAmount = undocumentedAcquisitionJEs.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + Math.max(l.debit, l.credit), 0), 0
        );
        const affectedAccountNumbers = new Set<string>();
        undocumentedAcquisitionJEs.forEach(je =>
          je.lines.forEach(l => {
            if (l.accountName) affectedAccountNumbers.add(l.accountId);
          })
        );

        findings.push(createFinding(
          data.engagementId,
          'GAAP-BC-002',
          'GAAP',
          'high',
          'Large Acquisition Entries Without Proper Approval',
          `${undocumentedAcquisitionJEs.length} journal entry/entries totaling $${(totalAmount / 1000000).toFixed(2)}M were recorded to acquisition-related accounts without documented approval. Entries: ${undocumentedAcquisitionJEs.map(je => `${je.entryNumber} (${je.date}): "${je.description}"`).join('; ')}. Under ASC 805, the accounting for a business combination requires significant judgment in identifying and measuring assets acquired and liabilities assumed. Unapproved entries to acquisition accounts create a risk of material misstatement and may indicate incomplete purchase price allocation.`,
          'ASC 805-10-25-1: An entity shall account for each business combination by applying the acquisition method, which requires identifying the acquirer, determining the acquisition date, recognizing and measuring the identifiable assets acquired and liabilities assumed.',
          'Obtain documentation supporting each acquisition-related journal entry including: (1) the purchase agreement and closing documents, (2) the purchase price allocation report, (3) management approval and board authorization, (4) valuations for any intangible assets recognized. Verify that all entries have been properly approved per the entity\'s internal control procedures.',
          totalAmount,
          Array.from(affectedAccountNumbers)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-BC-003',
    name: 'Purchase Price Allocation Completeness',
    framework: 'GAAP',
    category: 'Business Combinations (ASC 805)',
    description: 'Checks whether purchase price allocations appear complete by examining the relationship between goodwill increases and identifiable intangible asset recognition',
    citation: 'ASC 805-20-25-10: Recognition of identifiable intangible assets apart from goodwill',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const goodwillAccounts = data.accounts.filter(
        a => a.accountName.toLowerCase().includes('goodwill') && a.subType === 'intangible'
      );
      const intangibleAccounts = data.accounts.filter(
        a => a.subType === 'intangible' && !a.accountName.toLowerCase().includes('goodwill')
      );

      const goodwillBeginning = goodwillAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const goodwillEnding = goodwillAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const goodwillIncrease = goodwillEnding - goodwillBeginning;

      const intangibleBeginning = intangibleAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const intangibleEnding = intangibleAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const intangibleIncrease = intangibleEnding - intangibleBeginning;

      // If goodwill increased materially but no identifiable intangibles were recognized,
      // the purchase price allocation may be incomplete
      if (goodwillIncrease > data.materialityThreshold) {
        if (intangibleIncrease <= 0) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-BC-003',
            'GAAP',
            'medium',
            'Potential Incomplete Purchase Price Allocation',
            `Goodwill increased by $${(goodwillIncrease / 1000000).toFixed(2)}M during the period, but no increase in identifiable intangible assets was recognized (intangibles changed by $${(intangibleIncrease / 1000).toFixed(0)}K). Under ASC 805, the acquirer must identify and separately recognize intangible assets such as customer relationships, trade names, technology, and non-compete agreements apart from goodwill. The absence of any separately recognized intangible assets in a material acquisition suggests the purchase price allocation may be incomplete or that management has not yet finalized the measurement of identifiable assets.`,
            'ASC 805-20-25-10: The acquirer shall recognize separately from goodwill the identifiable intangible assets acquired in a business combination. An intangible asset is identifiable if it meets either the separability criterion or the contractual-legal criterion.',
            'Obtain the complete purchase price allocation for all acquisitions during the period. Verify that management has: (1) identified all intangible assets meeting the separability or contractual-legal criterion, (2) engaged a qualified valuation specialist, (3) completed the allocation within the measurement period (up to one year from acquisition date), (4) provided adequate disclosures under ASC 805-30-50. If the measurement period is still open, evaluate the provisional amounts for reasonableness.',
            goodwillIncrease,
            [...goodwillAccounts, ...intangibleAccounts].map(a => a.accountNumber)
          ));
        }

        // Also flag if goodwill is disproportionately large relative to identified intangibles
        if (intangibleIncrease > 0 && goodwillIncrease / (goodwillIncrease + intangibleIncrease) > 0.85) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-BC-003',
            'GAAP',
            'low',
            'Goodwill Disproportionate to Identifiable Intangibles',
            `Of the total acquisition-related increases, goodwill of $${(goodwillIncrease / 1000000).toFixed(2)}M represents ${((goodwillIncrease / (goodwillIncrease + intangibleIncrease)) * 100).toFixed(1)}% of the combined goodwill and identifiable intangible increase ($${((goodwillIncrease + intangibleIncrease) / 1000000).toFixed(2)}M). While this is not inherently incorrect, a disproportionately high goodwill allocation may indicate that the purchase price allocation has not fully identified all separable intangible assets, particularly customer relationships, technology, or trade names.`,
            'ASC 805-20-25-10: An intangible asset is identifiable if it meets either the separability criterion or the contractual-legal criterion.',
            'Review the purchase price allocation methodology and valuation report. Challenge whether all identifiable intangible assets have been properly identified and valued. Compare the allocation percentages to industry benchmarks for similar acquisitions. Verify that the valuation specialist is independent and qualified.',
            goodwillIncrease,
            [...goodwillAccounts, ...intangibleAccounts].map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
