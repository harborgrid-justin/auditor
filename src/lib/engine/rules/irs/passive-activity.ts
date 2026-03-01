import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getParameter } from '../../tax-parameters/registry';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getTaxYear } from '../../tax-parameters/utils';

export const passiveActivityRules: AuditRule[] = [
  {
    id: 'IRS-PAL-001',
    name: 'Passive Activity Loss Limitation',
    framework: 'IRS',
    category: 'Passive Activity',
    description: 'For pass-through entities, flags passive losses that may be limited under IRC §469 passive activity rules',
    citation: 'IRC §469 - Passive activity losses and credits limited',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // §469 applies to individuals, estates, trusts, closely held C-corps, and personal service corps
      // Primarily relevant for pass-through entity owners
      const passThrough = data.taxData.filter(t =>
        t.formType === '1065' ||
        t.formType === '1120-S' ||
        t.description.toLowerCase().includes('k-1') ||
        t.description.toLowerCase().includes('pass-through')
      );

      if (passThrough.length === 0) return findings;

      // Detect passive activity indicators
      const passiveData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('passive') ||
          desc.includes('rental') ||
          desc.includes('limited partner') ||
          desc.includes('non-material participation') ||
          desc.includes('§469');
      });

      // Detect rental income/loss accounts
      const rentalAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('rental') ||
          name.includes('passive') ||
          name.includes('limited partnership');
      });

      // Detect passive losses
      const passiveLosses = passiveData.filter(t => t.amount < 0);
      const passiveLossAmount = passiveLosses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Also check for rental losses in accounts
      const rentalLossAccounts = rentalAccounts.filter(a => a.endingBalance < 0 || a.accountType === 'expense');
      const rentalLossAmount = rentalLossAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const totalPassiveLoss = passiveLossAmount + rentalLossAmount;

      // Detect passive income
      const passiveIncome = passiveData
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

      const rentalIncome = rentalAccounts
        .filter(a => a.endingBalance > 0 && a.accountType === 'revenue')
        .reduce((sum, a) => sum + a.endingBalance, 0);

      const totalPassiveIncome = passiveIncome + rentalIncome;

      if (totalPassiveLoss === 0) return findings;

      // Net passive loss — losses exceed passive income
      const netPassiveLoss = totalPassiveLoss - totalPassiveIncome;

      if (netPassiveLoss > 0) {
        // Check for material participation documentation
        const materialParticipationDoc = data.taxData.filter(t => {
          const desc = t.description.toLowerCase();
          return desc.includes('material participation') ||
            desc.includes('§469(c)(1)') ||
            desc.includes('active participation') ||
            desc.includes('real estate professional');
        });

        // Check for Form 8582
        const form8582 = data.taxData.some(t =>
          t.formType === '8582' ||
          t.description.toLowerCase().includes('form 8582')
        );

        findings.push(createFinding(
          data.engagementId,
          'IRS-PAL-001',
          'IRS',
          'medium',
          'Passive Activity Losses May Be Limited Under §469',
          `Net passive activity losses of $${(netPassiveLoss / 1000).toFixed(0)}K were detected (passive losses: $${(totalPassiveLoss / 1000).toFixed(0)}K, passive income: $${(totalPassiveIncome / 1000).toFixed(0)}K). Under IRC §469, passive losses can only offset passive income. ${passiveLosses.length > 0 ? `${passiveLosses.length} passive loss item(s) identified in tax data. ` : ''}${rentalLossAccounts.length > 0 ? `${rentalLossAccounts.length} rental/passive loss account(s) totaling $${(rentalLossAmount / 1000).toFixed(0)}K. ` : ''}${materialParticipationDoc.length === 0 ? 'No material participation documentation was found. ' : ''}${!form8582 ? 'Form 8582 (Passive Activity Loss Limitations) was not found in the workpapers.' : 'Form 8582 is present.'}`,
          'IRC §469(a)(1): If for any taxable year the taxpayer is described in paragraph (2), the passive activity loss shall not be allowed. IRC §469(d)(1): The passive activity loss is the excess of aggregate losses from passive activities over aggregate income from passive activities.',
          'Prepare Form 8582 to compute the allowable passive activity loss. Determine material participation status for each activity under Treas. Reg. §1.469-5T (7 tests). If rental activity, evaluate the $25,000 rental real estate exception under §469(i) and the real estate professional exception under §469(c)(7). Suspended passive losses carry forward and are released upon disposition of the entire interest in the activity under §469(g).',
          netPassiveLoss,
          rentalAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-PAL-002',
    name: 'At-Risk Limitation',
    framework: 'IRS',
    category: 'Passive Activity',
    description: 'Flags losses that may be limited by the at-risk rules under IRC §465, which must be applied before §469 passive activity rules',
    citation: 'IRC §465 - Deductions limited to amount at risk',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // §465 applies to individuals and closely held C-corps in any activity
      const passThrough = data.taxData.filter(t =>
        t.formType === '1065' ||
        t.formType === '1120-S' ||
        t.description.toLowerCase().includes('k-1') ||
        t.description.toLowerCase().includes('pass-through')
      );

      if (passThrough.length === 0) return findings;

      // Detect at-risk indicators
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const atRiskData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('at-risk') ||
          desc.includes('at risk') ||
          desc.includes('§465') ||
          desc.includes('nonrecourse') ||
          desc.includes('non-recourse');
      });

      // Look for partner/shareholder basis or at-risk amount data on K-1s
      const basisData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return (desc.includes('basis') || desc.includes('at-risk') || desc.includes('at risk')) &&
          (desc.includes('k-1') || desc.includes('partner') || desc.includes('shareholder') ||
           t.formType === '1065' || t.formType === '1120-S');
      });

      // Look for nonrecourse debt indicators
      const nonrecourseData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('nonrecourse') || desc.includes('non-recourse') ||
          (desc.includes('qualified') && desc.includes('financing'));
      });

      // Detect losses from pass-through activities
      const passLosses = passThrough.filter(t => t.amount < 0);
      const totalPassLoss = passLosses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      if (totalPassLoss === 0) return findings;

      // Check for nonrecourse debt that may limit at-risk amount
      const nonrecourseAmount = nonrecourseData.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // If there are losses and at-risk/basis data is missing, flag for review
      if (basisData.length === 0 && totalPassLoss > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-PAL-002',
          'IRS',
          'medium',
          'At-Risk Limitation — Basis Documentation Missing',
          `Pass-through entity losses of $${(totalPassLoss / 1000).toFixed(0)}K were detected (${passLosses.length} loss item(s) from Forms 1065/1120-S/K-1), but no at-risk basis documentation was found. Under IRC §465, a taxpayer cannot deduct losses in excess of their amount at risk in the activity. The at-risk amount generally includes cash and adjusted basis of property contributed, plus amounts borrowed for which the taxpayer has personal liability (recourse debt). Nonrecourse financing generally is not at risk except for qualified nonrecourse financing for real estate under §465(b)(6).`,
          'IRC §465(a)(1): In the case of a taxpayer to which this section applies, any loss from an activity shall be allowed only to the extent of the aggregate amount with respect to which the taxpayer is at risk for such activity at the close of the taxable year. IRC §465(b): A taxpayer is at risk for amounts of money and the adjusted basis of property contributed, plus certain borrowed amounts.',
          'Compute the at-risk amount for each activity: cash contributed, adjusted basis of property contributed, recourse debt for which the taxpayer is personally liable, and qualified nonrecourse financing (for real estate). Compare losses claimed to the at-risk amount. Losses exceeding the at-risk amount are suspended and carried forward. Apply §465 before §469 passive activity rules. Prepare Form 6198 (At-Risk Limitations) if losses are limited.',
          totalPassLoss
        ));
      } else if (nonrecourseAmount > 0 && totalPassLoss > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-PAL-002',
          'IRS',
          'medium',
          'At-Risk Limitation — Nonrecourse Debt May Reduce At-Risk Amount',
          `Pass-through entity losses of $${(totalPassLoss / 1000).toFixed(0)}K were detected alongside nonrecourse financing of $${(nonrecourseAmount / 1000).toFixed(0)}K. Nonrecourse debt generally does not increase the taxpayer's at-risk amount under §465, which may limit deductible losses. Exception: qualified nonrecourse financing from a commercial lender for real property activities is considered at risk under §465(b)(6).`,
          'IRC §465(b)(4): A taxpayer is not considered at risk with respect to amounts borrowed for use in an activity if the taxpayer is not personally liable for repayment and does not pledge property (other than property used in the activity) as security. IRC §465(b)(6): Qualified nonrecourse financing for real property is treated as an amount at risk.',
          'Identify all nonrecourse debt associated with the activities generating losses. Determine whether each nonrecourse obligation qualifies as "qualified nonrecourse financing" under §465(b)(6) (must be secured by real property used in the activity, from a qualified lender, with no guarantees from related parties). Prepare Form 6198 and compute the at-risk limitation for each activity.',
          totalPassLoss
        ));
      }

      return findings;
    },
  },
];
