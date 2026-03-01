import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const fairValueRules: AuditRule[] = [
  {
    id: 'GAAP-FV-001',
    name: 'Large Unrealized Gains or Losses',
    framework: 'GAAP',
    category: 'Fair Value Measurement (ASC 820)',
    description: 'Identifies significant unrealized gains or losses through AOCI or income statement that may indicate valuation concerns',
    citation: 'ASC 820-10-35-2: Fair value measurement requires assessment of assumptions market participants would use',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Check AOCI changes (unrealized gains/losses on available-for-sale securities, hedges, etc.)
      const aociAccounts = data.accounts.filter(a => a.subType === 'aoci');
      const aociBeginning = aociAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const aociEnding = aociAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const aociChange = aociEnding - aociBeginning;

      // Also look for gain/loss accounts that may contain fair value adjustments
      const gainLossAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('gain') ||
        a.accountName.toLowerCase().includes('loss') ||
        a.accountName.toLowerCase().includes('unrealized') ||
        a.accountName.toLowerCase().includes('fair value')
      );
      const totalGainLoss = gainLossAccounts.reduce((sum, a) => sum + a.endingBalance, 0);

      // Check if AOCI change is material
      if (Math.abs(aociChange) > data.materialityThreshold * 0.5) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-FV-001',
          'GAAP',
          'medium',
          'Significant Unrealized Gains/Losses in AOCI',
          `Accumulated other comprehensive income changed by $${(aociChange / 1000).toFixed(0)}K during the period (from $${(aociBeginning / 1000).toFixed(0)}K to $${(aociEnding / 1000).toFixed(0)}K). ${aociChange > 0 ? 'The positive movement (unrealized gain) may indicate favorable market conditions or valuation assumptions that should be verified.' : 'The negative movement (unrealized loss) warrants assessment of whether the decline is other-than-temporary and may require reclassification to earnings.'} Fair value inputs used in the measurement should be evaluated for reasonableness and proper hierarchy classification.`,
          'ASC 820-10-35-2: A fair value measurement requires an entity to determine the assumptions that market participants would use in pricing the asset or liability.',
          'Obtain the fair value measurement documentation for all instruments recorded through OCI. Verify the valuation methodology, inputs used (Level 1, 2, or 3), and assess whether any impairments should be recognized in earnings. Review the entity\'s policy for assessing other-than-temporary impairment.',
          Math.abs(aociChange),
          aociAccounts.map(a => a.accountNumber)
        ));
      }

      // Check gain/loss accounts for large fair value adjustments
      if (gainLossAccounts.length > 0 && Math.abs(totalGainLoss) > data.materialityThreshold) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-FV-001',
          'GAAP',
          'high',
          'Material Fair Value Gains or Losses Recognized in Earnings',
          `Fair value-related gains/losses of $${(totalGainLoss / 1000000).toFixed(2)}M were recognized in the income statement through accounts: ${gainLossAccounts.map(a => `${a.accountName} ($${(a.endingBalance / 1000).toFixed(0)}K)`).join(', ')}. Material fair value adjustments require scrutiny of the underlying valuation methodology, including market data used, discount rates applied, and whether the measurements are properly classified in the fair value hierarchy.`,
          'ASC 820-10-50-2: Disclosure requirements for fair value measurements including the level of the fair value hierarchy.',
          'Review the valuation reports and methodologies for all instruments with fair value adjustments flowing through earnings. Verify pricing inputs against independent market data. Assess whether Level 3 measurements have appropriate documentation of significant unobservable inputs.',
          Math.abs(totalGainLoss),
          gainLossAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-FV-002',
    name: 'Intangible Asset Valuation Concerns',
    framework: 'GAAP',
    category: 'Fair Value Measurement (ASC 820)',
    description: 'Evaluates whether intangible assets (excluding goodwill) show indicators of valuation concerns requiring fair value reassessment',
    citation: 'ASC 820-10-35-24C: Fair value of assets with unobservable inputs (Level 3)',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const intangibleAccounts = data.accounts.filter(
        a => a.subType === 'intangible' && !a.accountName.toLowerCase().includes('goodwill')
      );
      const amortizationAccounts = data.accounts.filter(a => a.subType === 'amortization');

      const intangibleBeginning = intangibleAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const intangibleEnding = intangibleAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const totalAmortization = amortizationAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (intangibleBeginning > 0) {
        const intangibleDecline = intangibleBeginning - intangibleEnding;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const declinePct = intangibleDecline / intangibleBeginning;

        // Check if amortization seems reasonable relative to the intangible balance
        // Very high amortization rate (>30%) may suggest short-lived assets that need careful valuation
        // Very low amortization rate (<5%) may suggest underamortization
        if (intangibleEnding > 0 && totalAmortization > 0) {
          const amortRate = totalAmortization / intangibleBeginning;
          const impliedLife = 1 / amortRate;

          if (amortRate > 0.30) {
            findings.push(createFinding(
              data.engagementId,
              'GAAP-FV-002',
              'GAAP',
              'medium',
              'Intangible Asset Rapid Amortization May Indicate Valuation Concern',
              `Intangible assets (excluding goodwill) are being amortized at ${(amortRate * 100).toFixed(1)}% annually ($${(totalAmortization / 1000).toFixed(0)}K amortization on $${(intangibleBeginning / 1000000).toFixed(2)}M beginning balance), implying a useful life of only ${impliedLife.toFixed(1)} years. Rapidly declining intangible asset values may indicate: (1) technology becoming obsolete faster than expected, (2) customer relationships deteriorating, or (3) initial fair value at acquisition may have been overstated. These assets were likely valued using Level 3 inputs at acquisition and the current amortization pattern should be reassessed.`,
              'ASC 820-10-35-24C: When observable inputs are not available, fair value is measured using unobservable inputs reflecting the entity\'s own assumptions.',
              'Review the original fair value measurement reports for acquired intangibles. Assess whether the useful life assumptions remain appropriate given current business conditions. Evaluate whether triggering events for impairment testing exist. Verify that amortization methods align with the pattern of economic benefit consumption.',
              null,
              intangibleAccounts.map(a => a.accountNumber)
            ));
          }
        }

        // Check for intangibles that are large relative to total assets (concentration risk)
        const totalAssets = data.accounts
          .filter(a => a.accountType === 'asset')
          .reduce((sum, a) => sum + a.endingBalance, 0);

        if (totalAssets > 0 && intangibleEnding / totalAssets > 0.15) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-FV-002',
            'GAAP',
            'medium',
            'Significant Intangible Asset Concentration',
            `Intangible assets (excluding goodwill) of $${(intangibleEnding / 1000000).toFixed(2)}M represent ${((intangibleEnding / totalAssets) * 100).toFixed(1)}% of total assets ($${(totalAssets / 1000000).toFixed(1)}M). High intangible asset concentration increases valuation risk as these assets typically rely on Level 3 fair value inputs with significant estimation uncertainty. The valuation of these assets can materially affect the financial statements.`,
            'ASC 820-10-50-2: Entities must disclose the valuation techniques and inputs used for Level 3 measurements.',
            'Evaluate the composition of intangible assets by category (customer relationships, technology, trade names, etc.). Assess the reasonableness of assumptions underlying each category\'s valuation and useful life. Consider engaging a valuation specialist if warranted by the significance of the balance.',
            intangibleEnding,
            intangibleAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
