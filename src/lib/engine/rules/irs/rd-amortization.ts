import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const rdAmortizationRules: AuditRule[] = [
  {
    id: 'IRS-RDA-001',
    name: '§174 R&D Amortization Compliance',
    framework: 'IRS',
    category: 'R&D Amortization',
    description: 'For tax years beginning after December 31, 2021, verifies that R&D expenditures are capitalized and amortized over 5 years (domestic) or 15 years (foreign) per TCJA amendments to §174',
    citation: 'IRC §174 - Research and experimental expenditures (post-TCJA mandatory amortization)',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // §174 mandatory amortization only applies for tax years beginning after 12/31/2021
      if (taxYear < 2022) return findings;

      const domesticYears = getParameter('RD_AMORT_DOMESTIC_YRS', taxYear, data.entityType ?? undefined, 5);
      const foreignYears = getParameter('RD_AMORT_FOREIGN_YRS', taxYear, data.entityType ?? undefined, 15);

      // Look for R&D expense accounts
      const rdExpenseAccounts = data.accounts.filter(a =>
        a.subType === 'rd_expense' ||
        a.accountName.toLowerCase().includes('research') ||
        a.accountName.toLowerCase().includes('r&d') ||
        a.accountName.toLowerCase().includes('development expense') ||
        a.accountName.toLowerCase().includes('experimental')
      );

      const totalRdExpense = rdExpenseAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance), 0
      );

      if (totalRdExpense === 0) return findings;

      // Look for indicators that R&D is being immediately expensed on the tax return
      // (i.e., no Schedule M adjustment for §174 capitalization)
      const scheduleMAdjustment = data.taxData.filter(t =>
        (t.schedule.includes('Schedule M') &&
          (t.description.toLowerCase().includes('174') ||
           t.description.toLowerCase().includes('r&d') ||
           t.description.toLowerCase().includes('research') ||
           t.description.toLowerCase().includes('amortization'))) ||
        t.description.toLowerCase().includes('174 amort') ||
        t.description.toLowerCase().includes('r&d capitalization')
      );

      // Look for §174 amortization data
      const amortizationData = data.taxData.filter(t =>
        t.description.toLowerCase().includes('174 amort') ||
        t.description.toLowerCase().includes('r&d amort') ||
        t.description.toLowerCase().includes('research amort') ||
        t.description.toLowerCase().includes('sec 174') ||
        t.description.toLowerCase().includes('section 174') ||
        t.description.toLowerCase().includes('capitalized r&d')
      );

      // Check for immediate R&D expensing on tax return
      const rdTaxDeduction = data.taxData.find(t =>
        (t.formType === '1120' && t.description.toLowerCase().includes('research')) ||
        (t.formType === '1120' && t.description.toLowerCase().includes('r&d'))
      );

      // If R&D expense is on the books but no §174 amortization adjustment exists
      if (totalRdExpense > 0 && scheduleMAdjustment.length === 0 && amortizationData.length === 0) {
        // Calculate the expected first-year amortization vs full expense
        const firstYearAmort = totalRdExpense / domesticYears / 2; // Mid-year convention per §174(a)
        const disallowedCurrentYear = totalRdExpense - firstYearAmort;

        findings.push(createFinding(
          data.engagementId,
          'IRS-RDA-001',
          'IRS',
          'critical',
          '§174 R&D Expenditures Not Properly Capitalized',
          `R&D expenditures of $${(totalRdExpense / 1000).toFixed(0)}K appear to be immediately expensed for tax purposes, but effective for tax years beginning after December 31, 2021 (TCJA §13206), §174 requires mandatory capitalization and amortization. Domestic R&D: ${domesticYears}-year amortization; foreign R&D: ${foreignYears}-year amortization (using mid-year convention). First-year allowable amortization (domestic): approximately $${(firstYearAmort / 1000).toFixed(0)}K. Potential overstatement of current-year deduction: $${(disallowedCurrentYear / 1000).toFixed(0)}K.`,
          'IRC §174(a)(2)(B) (as amended by TCJA §13206): Specified research or experimental expenditures paid or incurred in connection with a trade or business shall be charged to capital account and amortized ratably over the 5-year period (15-year for foreign) beginning with the midpoint of the taxable year in which such expenditures are paid or incurred.',
          'Capitalize all §174 R&D expenditures and amortize over 5 years (domestic) or 15 years (foreign) using mid-year convention. Create a Schedule M adjustment to add back the book R&D expense and deduct only the allowable amortization. Maintain a detailed §174 amortization schedule tracking each year\'s expenditures, amortization period, and remaining unamortized balance.',
          disallowedCurrentYear,
          rdExpenseAccounts.map(a => a.accountNumber)
        ));
      }

      // If R&D expense is immediately deducted on the tax return
      if (rdTaxDeduction && rdTaxDeduction.amount > 0) {
        const expectedAmort = totalRdExpense / domesticYears / 2;
        if (rdTaxDeduction.amount > expectedAmort * 1.5) {
          const excessDeduction = rdTaxDeduction.amount - expectedAmort;
          findings.push(createFinding(
            data.engagementId,
            'IRS-RDA-001',
            'IRS',
            'high',
            '§174 Tax Deduction Exceeds Allowable Amortization',
            `R&D tax deduction of $${(rdTaxDeduction.amount / 1000).toFixed(0)}K appears to exceed the allowable first-year §174 amortization of approximately $${(expectedAmort / 1000).toFixed(0)}K (based on $${(totalRdExpense / 1000).toFixed(0)}K total R&D capitalized over ${domesticYears} years with mid-year convention). Excess deduction: $${(excessDeduction / 1000).toFixed(0)}K. This may indicate R&D is still being immediately expensed rather than properly capitalized.`,
            'IRC §174(a)(2)(B): Specified research or experimental expenditures shall be amortized ratably over the applicable period.',
            'Review the R&D tax deduction computation to ensure it reflects only the allowable §174 amortization. Verify whether amounts include carryover amortization from prior years (which would increase the current deduction). Reconcile the total tax deduction to the §174 amortization schedule.',
            excessDeduction,
            rdExpenseAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-RDA-002',
    name: 'R&D Book-Tax Difference',
    framework: 'IRS',
    category: 'R&D Amortization',
    description: 'Verifies that Schedule M properly captures the book-tax difference arising from §174 mandatory capitalization',
    citation: 'IRC §174 / Schedule M - R&D book-tax difference reconciliation',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // Only applies post-2021
      if (taxYear < 2022) return findings;

      const domesticYears = getParameter('RD_AMORT_DOMESTIC_YRS', taxYear, data.entityType ?? undefined, 5);

      // Look for R&D expense on the books
      const rdExpenseAccounts = data.accounts.filter(a =>
        a.subType === 'rd_expense' ||
        a.accountName.toLowerCase().includes('research') ||
        a.accountName.toLowerCase().includes('r&d') ||
        a.accountName.toLowerCase().includes('development expense')
      );

      const totalBookRdExpense = rdExpenseAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance), 0
      );

      if (totalBookRdExpense === 0) return findings;

      // Look for Schedule M adjustment related to R&D/§174
      const schedMRdAdjustments = data.taxData.filter(t =>
        t.schedule.includes('Schedule M') &&
        (t.description.toLowerCase().includes('174') ||
         t.description.toLowerCase().includes('r&d') ||
         t.description.toLowerCase().includes('research') ||
         t.description.toLowerCase().includes('r & d'))
      );

      // Calculate the expected book-tax difference
      // Book: full R&D expense in current year
      // Tax: only §174 amortization (first year = half-year of 1/5 = 10% for domestic)
      const firstYearAmort = totalBookRdExpense / domesticYears / 2;
      const expectedBookTaxDiff = totalBookRdExpense - firstYearAmort;

      if (schedMRdAdjustments.length === 0 && totalBookRdExpense > 50000) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-RDA-002',
          'IRS',
          'medium',
          'R&D Book-Tax Difference Not Reflected on Schedule M',
          `Book R&D expense of $${(totalBookRdExpense / 1000).toFixed(0)}K creates a significant temporary book-tax difference under §174. Tax amortization (first year, domestic, mid-year convention): approximately $${(firstYearAmort / 1000).toFixed(0)}K. Expected Schedule M adjustment: $${(expectedBookTaxDiff / 1000).toFixed(0)}K. No corresponding Schedule M adjustment was found for the §174 capitalization and amortization difference.`,
          'IRC §174(a) (as amended): Research expenditures must be capitalized for tax purposes, creating a timing difference with GAAP treatment under ASC 730.',
          'Add a Schedule M-1 or M-3 adjustment to reconcile the R&D book-tax difference. The adjustment should add back the full book R&D expense and deduct only the allowable §174 amortization. Ensure the corresponding deferred tax asset is recorded for the temporary difference per ASC 740.',
          expectedBookTaxDiff,
          rdExpenseAccounts.map(a => a.accountNumber)
        ));
      }

      if (schedMRdAdjustments.length > 0) {
        // Verify the Schedule M amount is reasonable
        const totalSchedMAdjustment = schedMRdAdjustments.reduce(
          (sum, t) => sum + Math.abs(t.amount), 0
        );

        const variance = Math.abs(totalSchedMAdjustment - expectedBookTaxDiff);
        if (variance > expectedBookTaxDiff * 0.15 && variance > 50000) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-RDA-002',
            'IRS',
            'medium',
            'R&D Schedule M Adjustment Does Not Reconcile',
            `Schedule M R&D adjustment of $${(totalSchedMAdjustment / 1000).toFixed(0)}K does not align with the expected book-tax difference of $${(expectedBookTaxDiff / 1000).toFixed(0)}K (book R&D: $${(totalBookRdExpense / 1000).toFixed(0)}K, tax amort: $${(firstYearAmort / 1000).toFixed(0)}K). Variance: $${(variance / 1000).toFixed(0)}K. The difference may be due to prior-year amortization layers, foreign R&D (15-year period), or classification differences.`,
            'IRC §174(a)(2)(B): Domestic R&D amortized over 5 years; foreign R&D over 15 years. The Schedule M must reconcile book expense to tax amortization.',
            'Reconcile the Schedule M R&D adjustment to the §174 amortization schedule. Ensure all layers (current year and prior year carryovers) are included. Verify the split between domestic and foreign R&D. Review the corresponding ASC 740 deferred tax asset computation.',
            variance,
            rdExpenseAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
