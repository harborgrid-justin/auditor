import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const penaltiesInterestRules: AuditRule[] = [
  {
    id: 'IRS-PEN-001',
    name: 'Failure to File/Pay Assessment',
    framework: 'IRS',
    category: 'Penalties & Interest',
    description: 'Identifies indicators of late filing or late payment that could trigger penalties under IRC §6651, including missing estimated tax payments relative to computed tax liability',
    citation: 'IRC §6651 - Failure to file tax return or to pay tax',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // Determine current year tax liability from tax data or accounts
      const currentTaxLiability = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '31') ||
        (t.formType === '1120-S' && t.schedule === 'main' && t.lineNumber === '23c') ||
        (t.formType === '1065' && t.description.toLowerCase().includes('total tax')) ||
        t.description.toLowerCase().includes('total tax liability') ||
        t.description.toLowerCase().includes('tax due')
      );

      const taxExpenseAccounts = data.accounts.filter(a =>
        a.subType === 'tax_expense' ||
        a.accountName.toLowerCase().includes('income tax expense') ||
        a.accountName.toLowerCase().includes('federal tax') ||
        a.accountName.toLowerCase().includes('tax payable')
      );
      const totalTaxExpense = taxExpenseAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance), 0
      );

      const taxLiability = currentTaxLiability?.amount ?? totalTaxExpense;

      if (taxLiability <= 0) return findings;

      // Look for extension data
      const extensionData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('extension') ||
          desc.includes('form 7004') ||
          desc.includes('form 4868') ||
          desc.includes('automatic extension') ||
          t.formType === '7004';
      });

      // Look for estimated tax payments and other payment records
      const estimatedPayments = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('estimated tax') ||
          desc.includes('estimated payment') ||
          desc.includes('tax deposit') ||
          desc.includes('payment with extension') ||
          desc.includes('quarterly payment') ||
          (t.formType === '1120' && t.lineNumber === '33') ||
          (t.formType === '1120' && t.lineNumber === '34');
      });

      const totalPayments = estimatedPayments.reduce(
        (sum, t) => sum + Math.abs(t.amount), 0
      );

      // Look for late filing or late payment indicators
      const lateIndicators = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('late filing') ||
          desc.includes('late payment') ||
          desc.includes('failure to file') ||
          desc.includes('failure to pay') ||
          desc.includes('delinquent') ||
          desc.includes('late return') ||
          desc.includes('penalty assessed');
      });

      // Primary check: tax liability exists but no estimated payments found
      if (totalPayments === 0 && taxLiability > 500) {
        // Estimate potential failure-to-pay penalty: 0.5% per month, up to 25%
        const estimatedFTPPenalty = Math.min(taxLiability * 0.005 * 5, taxLiability * 0.25);

        const extensionNote = extensionData.length > 0
          ? 'An extension to file was detected, which avoids the failure-to-file penalty if timely filed within the extension period. However, an extension does not extend the time to pay — interest and failure-to-pay penalties accrue from the original due date.'
          : 'No extension filing was detected, which may also trigger a failure-to-file penalty of 5% per month (up to 25%) under §6651(a)(1) in addition to the failure-to-pay penalty.';

        findings.push(createFinding(
          data.engagementId,
          'IRS-PEN-001',
          'IRS',
          'medium',
          'Tax Liability Without Evidence of Timely Payments',
          `Tax liability of $${(taxLiability / 1000).toFixed(0)}K was identified for tax year ${taxYear}, but no estimated tax payments, deposits, or extension payments were found in the tax workpapers. Under IRC §6651(a)(2), failure to pay the amount shown as tax on or before the prescribed date results in a penalty of 0.5% of the unpaid tax per month (up to 25%). ${extensionNote} Estimated failure-to-pay penalty exposure (assuming 5 months): $${(estimatedFTPPenalty / 1000).toFixed(0)}K.`,
          'IRC §6651(a)(1): Failure to file — addition to tax of 5% of the amount required to be shown as tax for each month during which such failure continues, not exceeding 25% in the aggregate. IRC §6651(a)(2): Failure to pay — addition to tax of 0.5% of the amount shown as tax for each month of underpayment, not exceeding 25% in the aggregate. IRC §6651(c)(1): When both penalties apply for the same month, the failure-to-file rate is reduced by the failure-to-pay rate.',
          'Obtain records of all tax payments including estimated payments (Form 1120-W deposits), extension payments (Form 7004), and balance due payments. If payments are missing or insufficient, compute the failure-to-pay penalty and accrued interest. Evaluate whether reasonable cause and not willful neglect can be demonstrated for penalty abatement under §6651(a). For first-time penalty situations, consider requesting first-time penalty abatement under IRM 20.1.1.3.6.1. Ensure all future quarterly estimated payments are made timely.',
          estimatedFTPPenalty,
          taxExpenseAccounts.map(a => a.accountNumber)
        ));
      }

      // Secondary check: payments exist but are insufficient
      if (totalPayments > 0 && totalPayments < taxLiability * 0.90) {
        const shortfall = taxLiability - totalPayments;
        const potentialPenalty = Math.min(shortfall * 0.005 * 3, shortfall * 0.25);

        if (shortfall > 10000) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-PEN-001a',
            'IRS',
            'low',
            'Potential Underpayment May Trigger Failure-to-Pay Penalty',
            `Total tax payments of $${(totalPayments / 1000).toFixed(0)}K against a tax liability of $${(taxLiability / 1000).toFixed(0)}K leave a shortfall of $${(shortfall / 1000).toFixed(0)}K. If the remaining balance was not paid by the original due date, a failure-to-pay penalty of 0.5% per month may apply to the underpayment. Estimated penalty exposure (assuming 3 months): $${(potentialPenalty / 1000).toFixed(0)}K.`,
            'IRC §6651(a)(2): The amount of the addition to tax for any month is 0.5% of the amount of tax shown on the return if the failure is for not more than 1 month, with an additional 0.5% for each additional month, not to exceed 25% in the aggregate.',
            'Verify the payment history and due dates. Determine whether the remaining balance was paid timely. If a failure-to-pay penalty applies, evaluate reasonable cause for abatement. Consider filing Form 843 (Claim for Refund and Request for Abatement) if penalty abatement is warranted.',
            potentialPenalty
          ));
        }
      }

      // Tertiary check: explicit late filing/payment indicators in the data
      if (lateIndicators.length > 0) {
        const penaltyAmounts = lateIndicators
          .filter(t => t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0);

        findings.push(createFinding(
          data.engagementId,
          'IRS-PEN-001b',
          'IRS',
          'high',
          'Late Filing or Penalty Indicators Detected',
          `${lateIndicators.length} item(s) in the tax workpapers reference late filing, penalties, or delinquent returns.${penaltyAmounts > 0 ? ` Aggregate penalty amounts identified: $${(penaltyAmounts / 1000).toFixed(0)}K.` : ''} Late filing penalties under §6651(a)(1) accrue at 5% per month (up to 25%), and failure-to-pay penalties accrue at 0.5% per month (up to 25%). When both apply for the same month, the failure-to-file rate is reduced by the failure-to-pay rate.`,
          'IRC §6651(a)(1): Failure to file — 5% per month, up to 25%. IRC §6651(a)(2): Failure to pay — 0.5% per month, up to 25%. IRC §6651(c)(1): Concurrent application reduction.',
          'Review the late filing circumstances and determine exact penalty amounts. Evaluate whether reasonable cause and not willful neglect can be demonstrated under §6651(a). For first-time penalty situations, consider requesting first-time penalty abatement under IRM 20.1.1.3.6.1. Implement controls to prevent future late filings and ensure timely estimated payments.',
          penaltyAmounts > 0 ? penaltyAmounts : null
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-PEN-002',
    name: 'Accuracy-Related Penalty Risk',
    framework: 'IRS',
    category: 'Penalties & Interest',
    description: 'Assesses exposure to accuracy-related penalties under IRC §6662 by identifying substantial understatement indicators including large Schedule M adjustments and significant book-tax differences',
    citation: 'IRC §6662 - Imposition of accuracy-related penalty on underpayments',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      const penaltyRate = getParameter('ACCURACY_PENALTY_RATE', taxYear, data.entityType ?? undefined, 0.20);
      const grossPenaltyRate = getParameter('ACCURACY_PENALTY_GROSS_RATE', taxYear, data.entityType ?? undefined, 0.40);

      // Look for Schedule M adjustments (book-tax differences)
      const scheduleMData = data.taxData.filter(t =>
        t.schedule.includes('Schedule M') ||
        t.schedule.includes('M-1') ||
        t.schedule.includes('M-3')
      );

      // Calculate total Schedule M adjustments, excluding the starting book income and ending taxable income lines
      const totalScheduleMAdjustments = scheduleMData
        .filter(t => !['1', '10'].includes(t.lineNumber))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Look for additional book-tax difference indicators across tax data
      const bookTaxDiffData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('book-tax') ||
          desc.includes('book tax') ||
          desc.includes('temporary difference') ||
          desc.includes('permanent difference') ||
          desc.includes('m-1 adjustment') ||
          desc.includes('m-3 adjustment') ||
          desc.includes('tax adjustment');
      });

      const totalBookTaxDifferences = bookTaxDiffData.reduce(
        (sum, t) => sum + Math.abs(t.amount), 0
      );

      // Use the larger of Schedule M adjustments and identified book-tax differences
      const totalAdjustments = Math.max(totalScheduleMAdjustments, totalBookTaxDifferences);

      if (totalAdjustments === 0) return findings;

      // Look for reported tax amount to determine understatement significance
      const reportedTax = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '31') ||
        t.description.toLowerCase().includes('total tax') ||
        t.description.toLowerCase().includes('tax liability')
      );

      const taxableIncome = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '30') ||
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '28') ||
        t.description.toLowerCase().includes('taxable income')
      );

      const reportedTaxAmount = reportedTax?.amount ?? 0;
      const taxableIncomeAmount = taxableIncome?.amount ?? 0;

      // Determine if substantial understatement thresholds are met
      // For corporations: understatement exceeds the greater of 10% of tax required or $10M
      const tenPercentThreshold = reportedTaxAmount > 0 ? reportedTaxAmount * 0.10 : 0;
      const absoluteThreshold = 10000000; // $10M

      const exceedsTenPercent = reportedTaxAmount > 0 && totalAdjustments > tenPercentThreshold;
      const exceedsTenMillion = totalAdjustments > absoluteThreshold;

      if (exceedsTenPercent || exceedsTenMillion) {
        // Estimate additional tax from adjustments using effective rate or statutory rate
        const effectiveTaxRate = taxableIncomeAmount > 0 && reportedTaxAmount > 0
          ? reportedTaxAmount / taxableIncomeAmount
          : 0.21; // Default to 21% corporate rate

        const estimatedTaxImpact = totalAdjustments * effectiveTaxRate;
        const standardPenalty = estimatedTaxImpact * penaltyRate;
        const grossValuationPenalty = estimatedTaxImpact * grossPenaltyRate;

        // Check for gross valuation misstatement indicators
        const grossValuationIndicators = data.taxData.filter(t => {
          const desc = t.description.toLowerCase();
          return desc.includes('valuation') ||
            desc.includes('appraisal') ||
            desc.includes('fair market value') ||
            desc.includes('overstate') ||
            desc.includes('understate');
        });

        const applicablePenaltyRate = grossValuationIndicators.length > 0
          ? grossPenaltyRate
          : penaltyRate;
        const applicablePenalty = grossValuationIndicators.length > 0
          ? grossValuationPenalty
          : standardPenalty;

        const thresholdDescription = exceedsTenMillion
          ? `total adjustments of $${(totalAdjustments / 1000000).toFixed(1)}M exceed the $10M absolute threshold`
          : `total adjustments of $${(totalAdjustments / 1000000).toFixed(1)}M exceed 10% of reported tax ($${(tenPercentThreshold / 1000000).toFixed(1)}M)`;

        findings.push(createFinding(
          data.engagementId,
          'IRS-PEN-002',
          'IRS',
          'high',
          'Substantial Understatement — Accuracy-Related Penalty Exposure',
          `Significant book-tax adjustments indicate potential accuracy-related penalty exposure under IRC §6662. ${scheduleMData.length} Schedule M item(s) with aggregate adjustments of $${(totalScheduleMAdjustments / 1000000).toFixed(1)}M were identified. The ${thresholdDescription}, triggering the substantial understatement provisions. Estimated tax impact of adjustments: $${(estimatedTaxImpact / 1000000).toFixed(1)}M. Potential ${(applicablePenaltyRate * 100).toFixed(0)}% accuracy-related penalty: $${(applicablePenalty / 1000000).toFixed(2)}M.${grossValuationIndicators.length > 0 ? ' Valuation-related items detected — the 40% gross valuation misstatement penalty rate under §6662(h) may apply.' : ''}`,
          'IRC §6662(a): If this section applies, there is added to the tax an amount equal to 20% of the portion of the underpayment to which this section applies. IRC §6662(d)(1)(A): There is a substantial understatement of income tax if the amount of the understatement exceeds the greater of 10% of the tax required to be shown on the return or $10,000,000. IRC §6662(h): If any portion of the underpayment is attributable to a gross valuation misstatement, the penalty rate is increased to 40%.',
          'Review all Schedule M-1/M-3 adjustments for accuracy and adequate disclosure. For positions that reduce the understatement, ensure they meet the "substantial authority" standard under §6662(d)(2)(B) or are adequately disclosed on Form 8275/8275-R with a reasonable basis. Obtain or prepare supporting documentation for all significant book-tax differences. Consider whether a qualified amended return could reduce penalty exposure. Evaluate whether reasonable cause and good faith under §6664(c) can be demonstrated.',
          applicablePenalty
        ));
      }

      // Additional check: large adjustments below threshold — informational
      if (!exceedsTenPercent && !exceedsTenMillion && totalAdjustments > 1000000) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-PEN-002a',
          'IRS',
          'low',
          'Significant Book-Tax Differences Noted — Monitor for §6662 Exposure',
          `Schedule M adjustments totaling $${(totalAdjustments / 1000000).toFixed(1)}M were identified. While these do not currently exceed the substantial understatement thresholds ($10M absolute or 10% of reported tax), they should be monitored. Ensure all positions have at least a "reasonable basis" and consider adequate disclosure on Form 8275 for uncertain positions to reduce future penalty risk.`,
          'IRC §6662(d)(2)(B): The amount of the understatement may be reduced by the portion attributable to any item for which there was substantial authority for the treatment, or the relevant facts were adequately disclosed on the return and there is a reasonable basis for the tax treatment.',
          'Document the authority supporting each significant book-tax difference. Consider voluntary disclosure on Form 8275 for any positions lacking substantial authority. Maintain contemporaneous documentation for all significant tax positions to support reasonable cause arguments.',
          null
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-PEN-003',
    name: 'Transfer Pricing Penalty Exposure',
    framework: 'IRS',
    category: 'Penalties & Interest',
    description: 'Evaluates exposure to transfer pricing penalties under IRC §6662(e)/(h) for related party transactions that lack adequate contemporaneous documentation',
    citation: 'IRC §6662(e)/(h) - Substantial and gross valuation misstatements attributable to transfer pricing',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      const penaltyRate = getParameter('ACCURACY_PENALTY_RATE', taxYear, data.entityType ?? undefined, 0.20);
      const grossPenaltyRate = getParameter('ACCURACY_PENALTY_GROSS_RATE', taxYear, data.entityType ?? undefined, 0.40);

      // Look for related party and transfer pricing transactions in tax data
      const transferPricingData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('transfer pricing') ||
          desc.includes('transfer price') ||
          desc.includes('482') ||
          desc.includes('related party') ||
          desc.includes('related-party') ||
          desc.includes('intercompany') ||
          desc.includes('controlled transaction') ||
          desc.includes('arm\'s length') ||
          desc.includes('arms length');
      });

      // Look for related party accounts on the balance sheet
      const relatedPartyAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('intercompany') ||
          name.includes('related party') ||
          name.includes('related-party') ||
          name.includes('affiliate') ||
          name.includes('due to parent') ||
          name.includes('due from parent') ||
          name.includes('due to subsidiary') ||
          name.includes('due from subsidiary');
      });

      // Look for intercompany journal entries
      const intercompanyEntries = data.journalEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return desc.includes('intercompany') ||
          desc.includes('related party') ||
          desc.includes('affiliate') ||
          desc.includes('transfer pricing');
      });

      // Calculate total related party transaction volume from all sources
      const taxDataAmount = transferPricingData.reduce(
        (sum, t) => sum + Math.abs(t.amount), 0
      );

      const accountBalance = relatedPartyAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance), 0
      );

      const journalEntryVolume = intercompanyEntries.reduce(
        (sum, je) => sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
      );

      const totalRelatedPartyAmount = Math.max(taxDataAmount, accountBalance, journalEntryVolume);

      if (totalRelatedPartyAmount === 0) return findings;

      // Look for evidence of transfer pricing documentation
      const tpDocumentation = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('transfer pricing study') ||
          desc.includes('transfer pricing documentation') ||
          desc.includes('contemporaneous documentation') ||
          desc.includes('benchmark study') ||
          desc.includes('comparable analysis') ||
          desc.includes('arm\'s length analysis') ||
          desc.includes('best method') ||
          desc.includes('functional analysis') ||
          desc.includes('6662(e) documentation') ||
          desc.includes('§6662(e) documentation');
      });

      // Look for advance pricing agreement (APA) data
      const apaData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('advance pricing agreement') ||
          desc.includes('apa') ||
          desc.includes('bilateral agreement') ||
          desc.includes('competent authority');
      });

      // Primary check: significant transfer pricing amounts without documentation
      if (totalRelatedPartyAmount > 500000 && tpDocumentation.length === 0 && apaData.length === 0) {
        // Estimate potential penalty exposure
        // Use a conservative 10% adjustment assumption for undocumented transactions
        const estimatedAdjustmentRisk = totalRelatedPartyAmount * 0.10;
        const standardPenaltyExposure = estimatedAdjustmentRisk * penaltyRate;
        const grossPenaltyExposure = estimatedAdjustmentRisk * grossPenaltyRate;

        findings.push(createFinding(
          data.engagementId,
          'IRS-PEN-003',
          'IRS',
          'medium',
          'Transfer Pricing Penalty Exposure — No Documentation Found',
          `Related party/intercompany transactions totaling $${(totalRelatedPartyAmount / 1000000).toFixed(1)}M were identified across ${transferPricingData.length} tax data item(s), ${relatedPartyAccounts.length} account(s), and ${intercompanyEntries.length} journal entry/entries, but no contemporaneous transfer pricing documentation was found. Under IRC §6662(e), a ${(penaltyRate * 100).toFixed(0)}% penalty applies to any substantial valuation misstatement attributable to §482 adjustments, and the penalty increases to ${(grossPenaltyRate * 100).toFixed(0)}% under §6662(h) for gross valuation misstatements. The §6662(e)(3)(B) penalty protection safe harbor requires contemporaneous documentation — without it, the reasonable cause defense under §6664(c) is significantly weakened. Estimated penalty exposure assuming a 10% adjustment: $${(standardPenaltyExposure / 1000).toFixed(0)}K (standard) to $${(grossPenaltyExposure / 1000).toFixed(0)}K (gross valuation).`,
          'IRC §6662(e)(1)(B): There is a substantial valuation misstatement if the price for any property or services claimed on a return is 200% or more (or 50% or less) of the correct §482 price. IRC §6662(e)(3)(B): A taxpayer shall not be treated as having reasonable cause for a §482 adjustment unless contemporaneous documentation was maintained establishing that the pricing was consistent with the arm\'s length standard. IRC §6662(h): The penalty rate increases to 40% if the price used is 400% or more (or 25% or less) of the correct price.',
          'Prepare or obtain contemporaneous transfer pricing documentation meeting the requirements of Treas. Reg. §1.6662-6(d). Documentation should include: (1) an overview of the taxpayer\'s business and organizational structure, (2) a description of the controlled transactions, (3) a functional analysis of functions performed, assets used, and risks assumed, (4) selection and application of the best method, (5) an economic analysis with comparable data. Ensure documentation is completed by the tax return filing date (including extensions) to qualify for penalty protection. If an Advance Pricing Agreement (APA) is feasible, consider applying to provide prospective certainty.',
          standardPenaltyExposure,
          relatedPartyAccounts.map(a => a.accountNumber)
        ));
      }

      // Secondary check: documentation exists but may not cover all transactions
      if (tpDocumentation.length > 0 && totalRelatedPartyAmount > 5000000) {
        const documentedAmount = tpDocumentation.reduce(
          (sum, t) => sum + Math.abs(t.amount), 0
        );

        if (documentedAmount > 0 && documentedAmount < totalRelatedPartyAmount * 0.50) {
          const undocumentedAmount = totalRelatedPartyAmount - documentedAmount;
          const undocumentedPenaltyExposure = undocumentedAmount * 0.10 * penaltyRate;

          findings.push(createFinding(
            data.engagementId,
            'IRS-PEN-003a',
            'IRS',
            'low',
            'Transfer Pricing Documentation May Not Cover All Related Party Transactions',
            `Transfer pricing documentation covering $${(documentedAmount / 1000000).toFixed(1)}M was found, but total related party transaction volume is $${(totalRelatedPartyAmount / 1000000).toFixed(1)}M, leaving $${(undocumentedAmount / 1000000).toFixed(1)}M (${((undocumentedAmount / totalRelatedPartyAmount) * 100).toFixed(0)}%) potentially undocumented. Transactions not covered by contemporaneous documentation may lack penalty protection under §6662(e)(3)(B). Estimated additional penalty exposure for undocumented transactions: $${(undocumentedPenaltyExposure / 1000).toFixed(0)}K.`,
            'IRC §6662(e)(3)(B): The reasonable cause exception does not apply to a §482 adjustment unless the taxpayer maintains contemporaneous documentation with respect to the particular transaction at issue.',
            'Review the scope of existing transfer pricing documentation to ensure all material intercompany transactions are covered. Expand the study to include any transactions not currently documented. Prioritize high-value and high-risk transactions (e.g., intangible property transfers, cost sharing arrangements, intercompany services). Update the documentation annually to reflect current-year facts and economics.',
            undocumentedPenaltyExposure,
            relatedPartyAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
