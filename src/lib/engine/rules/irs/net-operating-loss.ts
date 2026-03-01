import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const nolRules: AuditRule[] = [
  {
    id: 'IRS-NOL-001',
    name: 'NOL Carryforward Utilization',
    framework: 'IRS',
    category: 'Net Operating Loss',
    description: 'Verifies that net operating loss carryforward deductions do not exceed the 80% taxable income limitation imposed by TCJA',
    citation: 'IRC §172(a) - Net operating loss deduction limited to 80% of taxable income',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const nolLimitPct = getParameter('NOL_DEDUCTION_LIMIT_PCT', taxYear, data.entityType ?? undefined, 0.80);

      // Look for NOL carryforward data in Form 1120 schedules
      const nolDeduction = data.taxData.find(t =>
        t.description.toLowerCase().includes('nol') ||
        t.description.toLowerCase().includes('net operating loss') ||
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '29a')
      );

      if (!nolDeduction || nolDeduction.amount <= 0) return findings;

      // Get taxable income before NOL deduction
      const taxableIncomeBeforeNOL = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '28') ||
        t.description.toLowerCase().includes('taxable income before nol')
      );

      if (taxableIncomeBeforeNOL && taxableIncomeBeforeNOL.amount > 0) {
        const maxAllowableNOL = taxableIncomeBeforeNOL.amount * nolLimitPct;

        if (nolDeduction.amount > maxAllowableNOL) {
          const excess = nolDeduction.amount - maxAllowableNOL;
          findings.push(createFinding(
            data.engagementId,
            'IRS-NOL-001',
            'IRS',
            'high',
            'NOL Deduction Exceeds 80% Taxable Income Limitation',
            `NOL carryforward deduction of $${(nolDeduction.amount / 1000).toFixed(0)}K exceeds the ${(nolLimitPct * 100).toFixed(0)}% limitation. Taxable income before NOL: $${(taxableIncomeBeforeNOL.amount / 1000).toFixed(0)}K. Maximum allowable NOL deduction: $${(maxAllowableNOL / 1000).toFixed(0)}K. Excess: $${(excess / 1000).toFixed(0)}K. Post-TCJA NOLs arising after December 31, 2017 are subject to this limitation.`,
            'IRC §172(a)(2): The net operating loss deduction for any taxable year shall not exceed the sum of 80% of taxable income computed without regard to the deduction allowable under this section.',
            'Reduce the NOL deduction to 80% of taxable income (computed without regard to the NOL deduction). Carry the excess NOL forward to subsequent tax years. Ensure pre-2018 NOL carryforwards (not subject to the 80% limit) are used first.',
            excess,
            ['nol_carryforward']
          ));
        }
      }

      // Verify NOL carryforward schedule exists and reconciles
      const nolSchedule = data.taxData.filter(t =>
        t.description.toLowerCase().includes('nol schedule') ||
        t.description.toLowerCase().includes('nol carryforward schedule') ||
        t.description.toLowerCase().includes('nol carryover')
      );

      if (nolSchedule.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-NOL-001',
          'IRS',
          'medium',
          'NOL Carryforward Schedule Not Found',
          `An NOL deduction of $${(nolDeduction.amount / 1000).toFixed(0)}K was claimed, but no supporting NOL carryforward schedule was identified in the tax workpapers. A detailed schedule is required to track the year of origin, available balance, utilization, and remaining carryforward for each NOL layer.`,
          'IRC §172(b): A net operating loss shall be an NOL carryover to each taxable year following the taxable year of the loss. Treas. Reg. §1.172-4: Computation of NOL carryovers.',
          'Prepare or obtain a detailed NOL carryforward schedule showing: (1) year of origin for each NOL, (2) beginning balance, (3) utilization in current year (subject to 80% limitation for post-2017 NOLs), and (4) remaining carryforward. Distinguish between pre-2018 and post-2017 NOLs.',
          null,
          ['nol_carryforward']
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-NOL-002',
    name: 'NOL Carryback Eligibility',
    framework: 'IRS',
    category: 'Net Operating Loss',
    description: 'Verifies that NOL carryback claims comply with post-TCJA restrictions (generally no carryback except for farming losses)',
    citation: 'IRC §172(b)(1)(A) - NOL carryback eliminated by TCJA (farming exception)',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // Look for NOL carryback indicators
      const carrybackIndicators = data.taxData.filter(t =>
        t.description.toLowerCase().includes('carryback') ||
        t.description.toLowerCase().includes('carry back') ||
        t.description.toLowerCase().includes('carry-back') ||
        t.formType === '1139' ||
        t.formType === '1045'
      );

      if (carrybackIndicators.length === 0) return findings;

      // CARES Act temporarily allowed 5-year carryback for 2018-2020 NOLs
      if (taxYear >= 2018 && taxYear <= 2020) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-NOL-002',
          'IRS',
          'info',
          'NOL Carryback Under CARES Act Temporary Relief',
          `NOL carryback indicators detected for tax year ${taxYear}. The CARES Act (P.L. 116-136) temporarily allowed a 5-year carryback for NOLs arising in tax years 2018, 2019, and 2020. Verify the carryback period and computation are correct under the CARES Act provisions.`,
          'IRC §172(b)(1)(D) (as added by CARES Act §2303): A net operating loss arising in a taxable year beginning after December 31, 2017 and before January 1, 2021 shall be an NOL carryback to each of the 5 taxable years preceding the taxable year of such loss.',
          'Verify the NOL carryback claim uses the correct 5-year carryback period. Ensure Form 1139 (Corporation Application for Tentative Refund) or amended returns are properly filed. Confirm the 80% limitation was suspended for these years under the CARES Act.',
          null,
          ['nol_carryforward']
        ));
        return findings;
      }

      // Post-2020: carrybacks generally not allowed (farming exception only)
      if (taxYear > 2020) {
        const farmingIndicators = data.taxData.filter(t =>
          t.description.toLowerCase().includes('farming') ||
          t.description.toLowerCase().includes('farm loss') ||
          t.formType === '1040-SF' ||
          t.formType === 'Schedule F'
        );

        if (farmingIndicators.length === 0) {
          const carrybackAmount = carrybackIndicators.reduce(
            (sum, t) => sum + Math.abs(t.amount), 0
          );
          findings.push(createFinding(
            data.engagementId,
            'IRS-NOL-002',
            'IRS',
            'high',
            'NOL Carryback Claimed — Not Permitted Post-TCJA',
            `NOL carryback claim of $${(carrybackAmount / 1000).toFixed(0)}K detected for tax year ${taxYear}. Under TCJA, NOL carrybacks are generally eliminated for losses arising in tax years beginning after December 31, 2020. The CARES Act temporary 5-year carryback only applied to tax years 2018-2020. The only remaining carryback exception is for farming losses (2-year carryback under §172(b)(1)(B)).`,
            'IRC §172(b)(1)(A) (as amended by TCJA §13302): Except as otherwise provided, a net operating loss for any taxable year shall be an NOL carryover to each taxable year following the taxable year of the loss (no carryback).',
            'Remove the NOL carryback claim unless the loss qualifies as a farming loss under §172(b)(1)(B). Convert the NOL to a carryforward-only position. If the carryback was previously filed on Form 1139, consider whether an amended return or adjustment is needed.',
            carrybackAmount,
            ['nol_carryforward']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-NOL-003',
    name: 'NOL Tracking Completeness',
    framework: 'IRS',
    category: 'Net Operating Loss',
    description: 'If the current year has a net loss, verifies that an NOL schedule exists to properly track the carryforward',
    citation: 'IRC §172(b) - NOL carryover rules and tracking requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Check for current year net loss on Form 1120
      const taxableIncome = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '30') ||
        t.description.toLowerCase().includes('taxable income')
      );

      // Also check book-level net income for indications of a loss
      const isStatements = data.financialStatements.filter(fs => fs.statementType === 'IS');
      let bookNetIncome = 0;
      if (isStatements.length > 0) {
        const isData = typeof isStatements[0].data === 'string'
          ? JSON.parse(isStatements[0].data)
          : isStatements[0].data;
        bookNetIncome = isData.netIncome ?? 0;
      }

      const hasNetLoss =
        (taxableIncome && taxableIncome.amount < 0) ||
        (bookNetIncome < 0 && !taxableIncome);

      if (!hasNetLoss) return findings;

      const lossAmount = taxableIncome
        ? Math.abs(taxableIncome.amount)
        : Math.abs(bookNetIncome);

      // Look for NOL schedule / tracking
      const nolSchedule = data.taxData.filter(t =>
        t.description.toLowerCase().includes('nol schedule') ||
        t.description.toLowerCase().includes('nol carryforward') ||
        t.description.toLowerCase().includes('nol carryover') ||
        t.description.toLowerCase().includes('net operating loss schedule')
      );

      // Also check for NOL carryforward accounts
      const nolAccounts = data.accounts.filter(a =>
        a.subType === 'nol_carryforward' ||
        a.accountName.toLowerCase().includes('nol') ||
        a.accountName.toLowerCase().includes('net operating loss')
      );

      if (nolSchedule.length === 0 && nolAccounts.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-NOL-003',
          'IRS',
          'medium',
          'Current Year Loss Without NOL Tracking Schedule',
          `The entity has a net loss of $${(lossAmount / 1000).toFixed(0)}K for the current tax year, but no NOL carryforward schedule or tracking mechanism was found. Under IRC §172, this loss creates an NOL that must be carried forward to future tax years (subject to the 80% limitation for post-2017 losses). Without proper tracking, the carryforward may be lost or incorrectly utilized.`,
          'IRC §172(b)(1)(A): A net operating loss for any taxable year shall be an NOL carryover to each taxable year following the taxable year of the loss. Treas. Reg. §1.172-1(a): The term net operating loss is defined.',
          'Create an NOL carryforward schedule documenting: (1) the current year loss amount, (2) any pre-existing NOL carryforwards from prior years, (3) the year of origin for each layer, and (4) the applicable limitation (80% for post-2017 losses, unlimited for pre-2018 losses). Include this schedule in the permanent tax workpaper file.',
          lossAmount,
          ['nol_carryforward']
        ));
      }

      return findings;
    },
  },
];
