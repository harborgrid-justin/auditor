import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const qbiDeductionRules: AuditRule[] = [
  {
    id: 'IRS-QBI-001',
    name: '§199A QBI Deduction Eligibility',
    framework: 'IRS',
    category: 'QBI Deduction',
    description: 'Verifies qualified business income deduction eligibility for pass-through entities and flags post-2025 sunset',
    citation: 'IRC §199A - Qualified business income deduction',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // Identify pass-through entity indicators
      const passThrough = data.taxData.filter(t =>
        t.formType === '1065' ||
        t.formType === '1120-S' ||
        t.description.toLowerCase().includes('k-1') ||
        t.description.toLowerCase().includes('pass-through')
      );

      if (passThrough.length === 0) return findings;

      const qbiDeductionPct = getParameter('QBI_DEDUCTION_PCT', taxYear, data.entityType ?? undefined, 0.20);

      // Post-2025: §199A has sunset under TCJA
      if (taxYear > 2025) {
        if (qbiDeductionPct === 0) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-QBI-001',
            'IRS',
            'critical',
            '§199A QBI Deduction Has Sunset — No Longer Available',
            `Tax year ${taxYear} is after the §199A sunset date (December 31, 2025). The qualified business income deduction is no longer available unless Congress enacts extending legislation. Pass-through entity indicators (Forms 1065/1120-S) were detected, and the entity may have been claiming the 20% QBI deduction in prior years. This sunset results in a significant tax increase for pass-through income.`,
            'IRC §199A(i): Section 199A shall not apply to taxable years beginning after December 31, 2025 (TCJA §11011(e)).',
            'Confirm whether §199A has been extended by subsequent legislation. If not extended, remove any QBI deduction from the return. Evaluate whether entity restructuring (e.g., C-corp election) may be beneficial. Communicate the impact to the taxpayer and update tax projections accordingly.',
            null
          ));
        }
        return findings;
      }

      // For active years (2018-2025), verify QBI deduction is being claimed
      const qbiData = data.taxData.filter(t =>
        t.description.toLowerCase().includes('qbi') ||
        t.description.toLowerCase().includes('qualified business income') ||
        t.description.toLowerCase().includes('199a')
      );

      // Calculate potential QBI from pass-through income
      const passThroughIncome = passThrough
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

      if (passThroughIncome > 0 && qbiData.length === 0) {
        const potentialDeduction = passThroughIncome * qbiDeductionPct;
        findings.push(createFinding(
          data.engagementId,
          'IRS-QBI-001',
          'IRS',
          'high',
          'QBI Deduction Not Claimed for Pass-Through Entity',
          `Pass-through entity income of $${(passThroughIncome / 1000).toFixed(0)}K was detected (Forms 1065/1120-S/K-1), but no §199A QBI deduction data was found. The potential deduction at ${(qbiDeductionPct * 100).toFixed(0)}% is $${(potentialDeduction / 1000).toFixed(0)}K. This deduction applies to qualified business income from partnerships, S corporations, and sole proprietorships.`,
          'IRC §199A(a): A taxpayer other than a corporation shall be allowed a deduction equal to the sum of 20% of qualified business income with respect to each qualified trade or business.',
          'Determine whether the pass-through income constitutes qualified business income under §199A. Verify the trade or business is not a specified service trade or business (SSTB) if income exceeds thresholds. Calculate the QBI deduction and ensure it is claimed on the return.',
          potentialDeduction
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-QBI-002',
    name: 'QBI Limitation Thresholds',
    framework: 'IRS',
    category: 'QBI Deduction',
    description: 'Checks W-2 wage and UBIA of qualified property limitations when taxable income exceeds threshold',
    citation: 'IRC §199A(b)(2) - W-2 wage and UBIA limitations',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // Only applicable for years §199A is active
      const qbiDeductionPct = getParameter('QBI_DEDUCTION_PCT', taxYear, data.entityType ?? undefined, 0.20);
      if (qbiDeductionPct === 0) return findings;

      // Check for pass-through entity
      const passThrough = data.taxData.filter(t =>
        t.formType === '1065' ||
        t.formType === '1120-S' ||
        t.description.toLowerCase().includes('k-1')
      );

      if (passThrough.length === 0) return findings;

      // Look for taxable income data
      const taxableIncomeData = data.taxData.find(t =>
        (t.formType === '1040' || t.formType === '1120-S' || t.formType === '1065') &&
        t.description.toLowerCase().includes('taxable income')
      );

      const taxableIncome = taxableIncomeData?.amount ?? 0;

      // §199A thresholds (simplified — single ~$182,100 / MFJ ~$364,200 for 2024)
      // When taxable income exceeds these, W-2 wage / UBIA limitations apply
      const highIncomeThreshold = 400000; // General high-income indicator

      if (taxableIncome > highIncomeThreshold) {
        // Look for W-2 wage data
        const w2WageData = data.taxData.filter(t =>
          t.description.toLowerCase().includes('w-2 wage') ||
          t.description.toLowerCase().includes('w2 wage') ||
          t.description.toLowerCase().includes('allocable wage')
        );

        // Look for UBIA data
        const ubiaData = data.taxData.filter(t =>
          t.description.toLowerCase().includes('ubia') ||
          t.description.toLowerCase().includes('unadjusted basis') ||
          t.description.toLowerCase().includes('qualified property')
        );

        if (w2WageData.length === 0 && ubiaData.length === 0) {
          const passThroughIncome = passThrough
            .filter(t => t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0);
          const uncappedDeduction = passThroughIncome * qbiDeductionPct;

          findings.push(createFinding(
            data.engagementId,
            'IRS-QBI-002',
            'IRS',
            'medium',
            'QBI Deduction May Be Limited — W-2 Wage / UBIA Data Missing',
            `Taxable income of $${(taxableIncome / 1000).toFixed(0)}K exceeds the §199A phase-in thresholds. At this income level, the QBI deduction is limited to the greater of: (1) 50% of W-2 wages, or (2) 25% of W-2 wages plus 2.5% of UBIA of qualified property. No W-2 wage or UBIA data was found in the tax workpapers to support the QBI deduction of up to $${(uncappedDeduction / 1000).toFixed(0)}K.`,
            'IRC §199A(b)(2): The QBI deduction with respect to any qualified trade or business shall not exceed the greater of 50% of W-2 wages or the sum of 25% of W-2 wages plus 2.5% of the UBIA of qualified property.',
            'Obtain W-2 wage information allocable to the qualified trade or business. Determine the unadjusted basis immediately after acquisition (UBIA) of all qualified property. Calculate the W-2/UBIA limitation and apply it to the QBI deduction. If the entity is an SSTB, evaluate whether the full phase-out applies.',
            uncappedDeduction
          ));
        }
      }

      return findings;
    },
  },
];
