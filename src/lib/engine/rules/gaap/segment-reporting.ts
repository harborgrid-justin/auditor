import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const segmentReportingRules: AuditRule[] = [
  {
    id: 'GAAP-SEG-001',
    name: 'Revenue Concentration Risk',
    framework: 'GAAP',
    category: 'Segment Reporting (ASC 280)',
    description: 'Identifies when revenue is highly concentrated in a single segment or revenue type, exceeding 75% of total revenue',
    citation: 'ASC 280-10-50-1: General disclosure requirements for segment information',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const revenueAccounts = data.accounts.filter(a => a.accountType === 'revenue');

      if (revenueAccounts.length === 0) return findings;

      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalRevenue === 0) return findings;

      // Check for concentration by individual revenue account/type
      for (const account of revenueAccounts) {
        const accountRevenue = Math.abs(account.endingBalance);
        const concentrationPct = accountRevenue / totalRevenue;

        if (concentrationPct > 0.75 && revenueAccounts.length > 1) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-SEG-001',
            'GAAP',
            'medium',
            'Revenue Concentration Exceeds 75% in Single Source',
            `Revenue account "${account.accountName}" ($${(accountRevenue / 1000000).toFixed(2)}M) represents ${(concentrationPct * 100).toFixed(1)}% of total revenue ($${(totalRevenue / 1000000).toFixed(2)}M). Under ASC 280, when a significant portion of revenue is derived from a single product, service, or customer group, the entity must ensure adequate segment disclosures are provided. High revenue concentration also represents a significant business risk that may affect going concern assessments and the fair value of reporting units. Auditors should evaluate whether the entity has identified all operating segments and whether the concentrated revenue source is appropriately disclosed.`,
            'ASC 280-10-50-1: A public entity shall report information about each operating segment that meets the quantitative thresholds. Disclosure is required for revenues from external customers attributed to the entity\'s country of domicile and to all foreign countries.',
            'Evaluate whether the entity has properly identified and disclosed all operating segments. Review whether: (1) revenue concentration by customer, product, or geography is adequately disclosed per ASC 280-10-50-40, (2) the chief operating decision maker reviews disaggregated financial information that would indicate additional operating segments, (3) the concentration risk is disclosed in the risk factors or significant estimates disclosures, (4) the going concern assessment considers the impact of losing the concentrated revenue source.',
            accountRevenue,
            [account.accountNumber]
          ));
          break; // Only flag the highest concentration
        }
      }

      // Check by revenue subType grouping
      const revenueBySubType = new Map<string, number>();
      for (const account of revenueAccounts) {
        const subType = account.subType || 'unclassified';
        revenueBySubType.set(subType, (revenueBySubType.get(subType) || 0) + Math.abs(account.endingBalance));
      }

      if (revenueBySubType.size > 1) {
        for (const [subType, amount] of Array.from(revenueBySubType.entries())) {
          const pct = amount / totalRevenue;
          if (pct > 0.75 && subType !== 'operating_revenue') {
            const accountsInGroup = revenueAccounts.filter(a => (a.subType || 'unclassified') === subType);
            findings.push(createFinding(
              data.engagementId,
              'GAAP-SEG-001',
              'GAAP',
              'low',
              `Revenue Concentrated in ${subType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Category`,
              `Revenue classified as "${subType}" totals $${(amount / 1000000).toFixed(2)}M, representing ${(pct * 100).toFixed(1)}% of total revenue. While operating revenue concentration is common, a heavy concentration in a specific revenue category may affect segment reporting requirements and warrants evaluation of whether additional disaggregation disclosures are needed under ASC 280 and ASC 606-10-50-5.`,
              'ASC 280-10-50-40: An entity shall provide information about the extent of its reliance on major customers.',
              'Review revenue disaggregation disclosures for completeness. Evaluate whether the concentration requires additional disclosure under ASC 606-10-50-5 regarding disaggregation of revenue, and ASC 280-10-50-40 regarding major customer disclosures.',
              amount,
              accountsInGroup.map(a => a.accountNumber)
            ));
            break;
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-SEG-002',
    name: 'Segment Disclosure Completeness',
    framework: 'GAAP',
    category: 'Segment Reporting (ASC 280)',
    description: 'Evaluates the completeness of segment reporting by checking for indicators that multiple operating segments may exist but are not separately reported',
    citation: 'ASC 280-10-50-22: Measurement disclosures for reportable segments',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const indicators: string[] = [];

      // Indicator 1: Multiple distinct revenue streams suggest multiple segments
      const revenueAccounts = data.accounts.filter(a => a.accountType === 'revenue');
      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const significantRevenueStreams = revenueAccounts.filter(a => {
        const pct = Math.abs(a.endingBalance) / (totalRevenue || 1);
        return pct >= 0.10;
      });

      if (significantRevenueStreams.length >= 3) {
        indicators.push(`${significantRevenueStreams.length} distinct revenue streams each represent 10% or more of total revenue, which may indicate multiple operating segments: ${significantRevenueStreams.map(a => `${a.accountName} (${((Math.abs(a.endingBalance) / totalRevenue) * 100).toFixed(1)}%)`).join(', ')}`);
      }

      // Indicator 2: Multiple cost centers or department-coded expense accounts
      const expenseAccounts = data.accounts.filter(a => a.accountType === 'expense');
      const departmentPattern = /dept|department|division|segment|region|unit/i;
      const departmentExpenses = expenseAccounts.filter(a => departmentPattern.test(a.accountName));

      if (departmentExpenses.length >= 3) {
        const departments = new Set(departmentExpenses.map(a => {
          const match = a.accountName.match(departmentPattern);
          return match ? a.accountName : 'Unknown';
        }));
        indicators.push(`${departments.size} department/division-specific expense account groups were identified, suggesting the entity tracks performance by business unit which may constitute separate operating segments`);
      }

      // Indicator 3: Journal entries referencing different geographic or business units
      const geoKeywords = ['domestic', 'international', 'europe', 'asia', 'americas', 'north america', 'emea', 'apac'];
      const geoJEs = data.journalEntries.filter(je =>
        geoKeywords.some(kw => (je.description || '').toLowerCase().includes(kw))
      );

      if (geoJEs.length > 5) {
        indicators.push(`${geoJEs.length} journal entries reference geographic regions, suggesting the entity operates in multiple geographic areas that may require segment or geographic area disclosures`);
      }

      if (indicators.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-SEG-002',
          'GAAP',
          'medium',
          'Potential Undisclosed Operating Segments',
          `${indicators.length} indicator(s) suggest the entity may have multiple operating segments requiring separate disclosure: ${indicators.join('. ')}. Under ASC 280, an operating segment is a component of a public entity that engages in business activities from which it may earn revenues and incur expenses, whose operating results are regularly reviewed by the chief operating decision maker, and for which discrete financial information is available. If the entity reports as a single segment, the auditor should evaluate whether the aggregation criteria in ASC 280-10-50-11 are met.`,
          'ASC 280-10-50-22: A public entity shall report a measure of profit or loss and total assets for each reportable segment. An entity shall also disclose revenues from external customers, intersegment revenues, interest revenue, interest expense, depreciation and amortization, and other significant items.',
          'Inquire of management regarding the organizational structure and how the chief operating decision maker reviews financial results. Obtain the internal financial reports used for decision-making. Evaluate whether: (1) the entity has properly identified all operating segments, (2) if segments have been aggregated, verify the aggregation criteria are met, (3) all required quantitative disclosures for each reportable segment are complete, (4) the entity-wide disclosures for products/services, geographic areas, and major customers are adequate.',
          null,
          revenueAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
