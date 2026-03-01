import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const bonusDepreciationRules: AuditRule[] = [
  {
    id: 'IRS-BD-001',
    name: 'Bonus Depreciation Rate Verification',
    framework: 'IRS',
    category: 'Bonus Depreciation',
    description: 'Verifies the correct bonus depreciation phase-down rate is applied for the tax year under TCJA §168(k)',
    citation: 'IRC §168(k) - Bonus depreciation phase-down schedule',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const correctRate = getParameter('BONUS_DEPR_RATE', taxYear, data.entityType ?? undefined, 0);

      // Look for bonus depreciation on Form 4562
      const bonusDeprData = data.taxData.filter(t =>
        t.formType === '4562' ||
        t.description.toLowerCase().includes('bonus depreciation') ||
        t.description.toLowerCase().includes('bonus depr') ||
        t.description.toLowerCase().includes('168(k)') ||
        t.description.toLowerCase().includes('special depreciation')
      );

      // Look for qualified property placed in service
      const qualifiedProperty = data.taxData.find(t =>
        (t.formType === '4562' && t.lineNumber === '14') ||
        t.description.toLowerCase().includes('qualified property') ||
        t.description.toLowerCase().includes('placed in service')
      );

      // Look for bonus depreciation amount
      const bonusAmount = data.taxData.find(t =>
        (t.formType === '4562' && (t.lineNumber === '14' || t.lineNumber === '25')) ||
        t.description.toLowerCase().includes('bonus depreciation amount') ||
        t.description.toLowerCase().includes('special depreciation allowance')
      );

      // Also check accounts for bonus depreciation
      const bonusDeprAccounts = data.accounts.filter(a =>
        a.subType === 'bonus_depreciation' ||
        a.accountName.toLowerCase().includes('bonus depreciation') ||
        a.accountName.toLowerCase().includes('special depreciation')
      );

      const hasBonusDepr = bonusDeprData.length > 0 || bonusDeprAccounts.length > 0;

      if (!hasBonusDepr) return findings;

      // If bonus rate is 0%, no bonus depreciation should be claimed
      if (correctRate === 0 && bonusAmount && bonusAmount.amount > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-BD-001',
          'IRS',
          'critical',
          'Bonus Depreciation Claimed After Full Phase-Out',
          `Bonus depreciation of $${(bonusAmount.amount / 1000).toFixed(0)}K was claimed for tax year ${taxYear}, but the §168(k) bonus depreciation rate has fully phased out to 0% for property placed in service after December 31, ${taxYear - 1}. The TCJA bonus depreciation phase-down schedule is: 100% (2017-2022), 80% (2023), 60% (2024), 40% (2025), 20% (2026), 0% (2027+).`,
          'IRC §168(k)(6): The applicable percentage shall be 0% for property placed in service after December 31, 2026 (or December 31, 2027 for certain property with longer production periods).',
          'Remove the bonus depreciation deduction. Depreciate the qualified property using standard MACRS recovery periods and conventions. Consider whether §179 expensing may be available as an alternative for eligible property.',
          bonusAmount.amount,
          ['fixed_asset', 'depreciation']
        ));
        return findings;
      }

      // Verify the rate applied is correct for the tax year
      if (qualifiedProperty && qualifiedProperty.amount > 0 && bonusAmount) {
        const impliedRate = bonusAmount.amount / qualifiedProperty.amount;
        const rateTolerance = 0.05; // 5 percentage point tolerance

        if (Math.abs(impliedRate - correctRate) > rateTolerance) {
          const overUnder = impliedRate > correctRate ? 'over' : 'under';
          const impactAmount = Math.abs(bonusAmount.amount - (qualifiedProperty.amount * correctRate));

          findings.push(createFinding(
            data.engagementId,
            'IRS-BD-001',
            'IRS',
            'high',
            `Bonus Depreciation Rate Appears Incorrect for Tax Year ${taxYear}`,
            `The implied bonus depreciation rate is ${(impliedRate * 100).toFixed(0)}% (bonus of $${(bonusAmount.amount / 1000).toFixed(0)}K on qualified property of $${(qualifiedProperty.amount / 1000).toFixed(0)}K), but the correct rate for tax year ${taxYear} is ${(correctRate * 100).toFixed(0)}%. The deduction appears to be ${overUnder}stated by $${(impactAmount / 1000).toFixed(0)}K. TCJA phase-down: 100% (2022), 80% (2023), 60% (2024), 40% (2025), 20% (2026), 0% (2027+).`,
            'IRC §168(k)(6): The applicable percentage is 80% for property placed in service during 2023, 60% during 2024, 40% during 2025, 20% during 2026, and 0% thereafter.',
            `Recalculate bonus depreciation using the correct ${(correctRate * 100).toFixed(0)}% rate. Verify the placed-in-service date for each asset to determine the applicable rate. Note that property with a longer production period may have a different phase-down schedule. Update Form 4562 accordingly.`,
            impactAmount,
            ['fixed_asset', 'depreciation']
          ));
        }
      }

      // Informational alert about phase-down if rate is not 100%
      if (correctRate > 0 && correctRate < 1.0 && bonusAmount && bonusAmount.amount > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-BD-001',
          'IRS',
          'info',
          `Bonus Depreciation at ${(correctRate * 100).toFixed(0)}% Phase-Down Rate`,
          `Tax year ${taxYear} bonus depreciation rate is ${(correctRate * 100).toFixed(0)}% under the TCJA phase-down schedule. Bonus depreciation claimed: $${(bonusAmount.amount / 1000).toFixed(0)}K. The remaining ${((1 - correctRate) * 100).toFixed(0)}% of the cost of qualified property is depreciated under standard MACRS recovery periods. This rate will continue to decline by 20 percentage points each year until reaching 0% in 2027.`,
          'IRC §168(k)(6)(A): For property placed in service after December 31, 2022, the applicable percentage is reduced by 20 percentage points for each calendar year after 2022.',
          'Ensure standard MACRS depreciation is computed on the non-bonus portion of qualified property. Verify the correct MACRS class life, convention (half-year or mid-quarter), and method are applied to the remaining depreciable basis.',
          null,
          ['fixed_asset', 'depreciation']
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-BD-002',
    name: 'Bonus Depreciation Election Out',
    framework: 'IRS',
    category: 'Bonus Depreciation',
    description: 'Checks for indicators that the taxpayer elected out of bonus depreciation under §168(k)(7)',
    citation: 'IRC §168(k)(7) - Election out of bonus depreciation',
    defaultSeverity: 'low',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const bonusRate = getParameter('BONUS_DEPR_RATE', taxYear, data.entityType ?? undefined, 0);

      // If bonus rate is 0%, election out is moot
      if (bonusRate === 0) return findings;

      // Look for election-out indicators
      const electionOutIndicators = data.taxData.filter(t =>
        t.description.toLowerCase().includes('elect out') ||
        t.description.toLowerCase().includes('election out') ||
        t.description.toLowerCase().includes('168(k)(7)') ||
        t.description.toLowerCase().includes('no bonus') ||
        t.description.toLowerCase().includes('opted out') ||
        t.description.toLowerCase().includes('waive bonus')
      );

      // Check if entity has significant fixed asset additions but no bonus depreciation
      const assetAdditions = data.accounts.filter(a =>
        a.subType === 'fixed_asset' || a.subType === 'construction_in_progress'
      );
      const totalAdditions = assetAdditions.reduce((sum, a) => {
        const addition = a.endingBalance - a.beginningBalance;
        return addition > 0 ? sum + addition : sum;
      }, 0);

      const bonusDeprClaimed = data.taxData.filter(t =>
        t.description.toLowerCase().includes('bonus depreciation') ||
        t.description.toLowerCase().includes('special depreciation') ||
        (t.formType === '4562' && t.lineNumber === '14')
      );

      const totalBonusClaimed = bonusDeprClaimed.reduce(
        (sum, t) => sum + Math.abs(t.amount), 0
      );

      if (electionOutIndicators.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-BD-002',
          'IRS',
          'low',
          'Bonus Depreciation Election Out Detected',
          `The taxpayer appears to have elected out of bonus depreciation under §168(k)(7) for tax year ${taxYear}. The available bonus rate is ${(bonusRate * 100).toFixed(0)}%. Election out is irrevocable for the tax year and property class elected. Verify the election is intentional and documented — electing out may be beneficial for NOL management, AMT planning, or to preserve depreciation deductions for future higher-rate years.`,
          'IRC §168(k)(7): A taxpayer may elect, for any class of property, not to have §168(k) apply. Such election, once made, shall be irrevocable.',
          'Confirm the election-out is properly documented and attached to the return. Verify which property classes are subject to the election. Evaluate whether the election remains in the taxpayer\'s best interest given current and projected tax positions.',
          null,
          ['fixed_asset', 'depreciation']
        ));
      } else if (totalAdditions > 500000 && totalBonusClaimed === 0 && bonusRate > 0) {
        // Entity has significant additions but claims no bonus — potential undisclosed election out
        findings.push(createFinding(
          data.engagementId,
          'IRS-BD-002',
          'IRS',
          'medium',
          'No Bonus Depreciation Despite Significant Asset Additions',
          `The entity has fixed asset additions of approximately $${(totalAdditions / 1000).toFixed(0)}K for tax year ${taxYear}, but no bonus depreciation was claimed. The available bonus rate is ${(bonusRate * 100).toFixed(0)}%. If the taxpayer elected out under §168(k)(7), this should be documented. If no election was made, up to $${((totalAdditions * bonusRate) / 1000).toFixed(0)}K in additional first-year depreciation may be available.`,
          'IRC §168(k)(1): In the case of any qualified property, the depreciation deduction shall include an allowance equal to the applicable percentage of the adjusted basis of the qualified property.',
          'Determine whether (1) the taxpayer intentionally elected out, (2) the assets do not qualify for bonus depreciation, or (3) the bonus depreciation was inadvertently omitted. If qualified property exists and no election out was intended, compute and claim bonus depreciation on Form 4562.',
          totalAdditions * bonusRate,
          ['fixed_asset', 'depreciation']
        ));
      }

      return findings;
    },
  },
];
