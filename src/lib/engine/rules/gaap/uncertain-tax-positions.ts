import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const uncertainTaxPositionRules: AuditRule[] = [
  {
    id: 'GAAP-UTP-001',
    name: 'UTP Reserve Adequacy',
    framework: 'GAAP',
    category: 'Uncertain Tax Positions (ASC 740-10)',
    description:
      'Evaluates whether uncertain tax positions have been identified and reserves are adequate under the ASC 740-10 two-step recognition and measurement framework',
    citation:
      'ASC 740-10-25-6 through 25-7: An entity shall recognize the financial statement effects of a tax position when it is more likely than not that the position will be sustained upon examination based solely on its technical merits. The benefit recognized is the largest amount that is greater than 50% likely of being realized upon settlement.',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Identify tax-related accounts
      const taxExpenseAccounts = data.accounts.filter(
        (a) => a.subType === 'tax_expense'
      );
      const taxReserveKeywords = ['tax reserve', 'uncertain', 'fin 48'];
      const taxReserveAccounts = data.accounts.filter((a) =>
        taxReserveKeywords.some((kw) =>
          a.accountName.toLowerCase().includes(kw)
        )
      );
      const taxRelatedAccounts = [...taxExpenseAccounts, ...taxReserveAccounts];

      const totalTaxExpense = taxExpenseAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance),
        0
      );

      const hasUTPs =
        data.uncertainTaxPositions && data.uncertainTaxPositions.length > 0;

      // If tax expense/provision is significant but no UTPs tracked, flag
      if (totalTaxExpense > 0 && !hasUTPs) {
        // Compute effective tax rate for context
        const totalRevenue = data.accounts
          .filter((a) => a.accountType === 'revenue')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const totalExpensesExTax = data.accounts
          .filter(
            (a) => a.accountType === 'expense' && a.subType !== 'tax_expense'
          )
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const preTaxIncome = totalRevenue - totalExpensesExTax;
        const effectiveRate =
          preTaxIncome > 0 ? totalTaxExpense / preTaxIncome : 0;

        // Identify risk indicators that strengthen the finding
        const riskIndicators: string[] = [];

        const rdCreditAccounts = data.accounts.filter(
          (a) =>
            a.accountName.toLowerCase().includes('r&d credit') ||
            a.accountName.toLowerCase().includes('research credit') ||
            a.accountName.toLowerCase().includes('tax credit')
        );
        if (rdCreditAccounts.length > 0) {
          riskIndicators.push(
            'R&D tax credits are present, a common area for uncertain tax positions'
          );
        }

        const transferPricingIndicators = data.accounts.filter(
          (a) =>
            a.accountName.toLowerCase().includes('intercompany') ||
            a.accountName.toLowerCase().includes('transfer price') ||
            a.accountName.toLowerCase().includes('related party')
        );
        if (transferPricingIndicators.length > 0) {
          riskIndicators.push(
            'intercompany/related party transactions exist, creating transfer pricing risk'
          );
        }

        const foreignAccounts = data.accounts.filter(
          (a) =>
            a.accountName.toLowerCase().includes('foreign') ||
            a.accountName.toLowerCase().includes('international')
        );
        if (foreignAccounts.length > 0) {
          riskIndicators.push(
            'foreign operations are present, increasing the likelihood of uncertain positions on cross-border matters'
          );
        }

        const riskDescription =
          riskIndicators.length > 0
            ? ` Risk indicators identified: ${riskIndicators.join('; ')}.`
            : '';

        findings.push(
          createFinding(
            data.engagementId,
            'GAAP-UTP-001',
            'GAAP',
            'high',
            'Material Tax Expense Without Uncertain Tax Position Analysis',
            `Tax expense of $${(totalTaxExpense / 1_000_000).toFixed(2)}M ` +
              `(effective rate: ${(effectiveRate * 100).toFixed(1)}%) is significant, ` +
              `but no uncertain tax position (UTP) reserves, FIN 48 accounts, or ` +
              `related journal entries were identified. Under ASC 740-10-25-6, an ` +
              `entity must evaluate all tax positions and recognize the financial ` +
              `statement effects of positions that meet the more-likely-than-not ` +
              `threshold.${riskDescription} The absence of any UTP analysis suggests ` +
              `either: (1) the entity has not performed the required ASC 740-10 ` +
              `analysis, (2) all tax positions were determined to be sustained and ` +
              `measured at full benefit, or (3) UTP reserves exist but are not ` +
              `separately identifiable in the account structure.`,
            'ASC 740-10-25-6 through 25-7; FIN 48: A tax position shall be ' +
              'recognized when it is more likely than not (>50%) that the position ' +
              'will be sustained upon examination. The benefit recognized shall be ' +
              'the largest amount greater than 50% likely of being realized upon ' +
              'settlement.',
            'Evaluate all tax positions using the two-step process: ' +
              '(1) determine whether each position meets the more-likely-than-not ' +
              'recognition threshold based on technical merits, and ' +
              '(2) measure the recognized benefit using the cumulative probability ' +
              'approach. Request management\'s ASC 740-10 uncertain tax position ' +
              'analysis and verify completeness. Obtain the UTP rollforward schedule ' +
              'and reconcile to the tax provision workpapers.',
            null,
            taxRelatedAccounts.map((a) => a.accountNumber)
          )
        );
      }

      // If UTPs exist, check reserve adequacy relative to gross positions
      if (hasUTPs && data.uncertainTaxPositions) {
        const totalGross = data.uncertainTaxPositions.reduce(
          (sum, utp) => sum + utp.grossAmount,
          0
        );
        const totalReserve = data.uncertainTaxPositions.reduce(
          (sum, utp) => sum + utp.totalReserve,
          0
        );

        if (totalGross > 0 && totalReserve / totalGross < 0.1) {
          findings.push(
            createFinding(
              data.engagementId,
              'GAAP-UTP-001',
              'GAAP',
              'high',
              'UTP Reserves Appear Insufficient Relative to Gross Exposure',
              `Total gross uncertain tax positions of ` +
                `$${(totalGross / 1_000_000).toFixed(2)}M are supported by reserves ` +
                `of only $${(totalReserve / 1_000_000).toFixed(2)}M ` +
                `(${((totalReserve / totalGross) * 100).toFixed(1)}% coverage). ` +
                `A reserve-to-exposure ratio below 10% may indicate that: ` +
                `(1) the measurement analysis does not properly apply the cumulative ` +
                `probability approach, (2) technical merits ratings are overly ` +
                `optimistic, or (3) certain positions have not been fully evaluated.`,
              'ASC 740-10-25-6 through 25-7; FIN 48: The cumulative probability ' +
                'approach requires recognizing the largest amount of benefit that is ' +
                'greater than 50% likely of being realized upon ultimate settlement.',
              'Review each UTP measurement analysis. Verify that the cumulative ' +
                'probability table properly reflects all possible outcomes and their ' +
                'probabilities. Challenge management\'s technical merits ratings with ' +
                'reference to relevant case law, rulings, and regulations.',
              totalGross - totalReserve,
              taxExpenseAccounts.map((a) => a.accountNumber)
            )
          );
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-UTP-002',
    name: 'UTP Interest and Penalty Accrual',
    framework: 'GAAP',
    category: 'Uncertain Tax Positions (ASC 740-10)',
    description:
      'Verifies that interest and penalties are properly accrued on uncertain tax positions that have not met the recognition threshold',
    citation:
      'ASC 740-10-25-56 through 25-57: Interest and penalties related to uncertain tax positions shall be recognized in accordance with the entity\'s accounting policy election',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      if (
        !data.uncertainTaxPositions ||
        data.uncertainTaxPositions.length === 0
      ) {
        return findings;
      }

      // Identify positions where recognition threshold is NOT met
      const unrecognizedPositions = data.uncertainTaxPositions.filter(
        (utp) =>
          !utp.recognitionThresholdMet &&
          utp.status !== 'settled' &&
          utp.status !== 'lapsed'
      );

      if (unrecognizedPositions.length === 0) {
        return findings;
      }

      // Sum interest and penalty accruals on unrecognized positions
      const totalInterestAccrual = unrecognizedPositions.reduce(
        (sum, utp) => sum + utp.interestAccrual,
        0
      );
      const totalPenaltyAccrual = unrecognizedPositions.reduce(
        (sum, utp) => sum + utp.penaltyAccrual,
        0
      );
      const totalUnrecognizedGross = unrecognizedPositions.reduce(
        (sum, utp) => sum + utp.grossAmount,
        0
      );

      // Check for zero interest on unrecognized positions
      const positionsWithoutInterest = unrecognizedPositions.filter(
        (utp) => utp.interestAccrual === 0
      );
      // Check for zero penalty on unrecognized positions
      const positionsWithoutPenalty = unrecognizedPositions.filter(
        (utp) => utp.penaltyAccrual === 0
      );

      if (
        totalInterestAccrual === 0 &&
        totalPenaltyAccrual === 0 &&
        unrecognizedPositions.length > 0
      ) {
        findings.push(
          createFinding(
            data.engagementId,
            'GAAP-UTP-002',
            'GAAP',
            'medium',
            'No Interest or Penalty Accrual on Unrecognized Tax Positions',
            `${unrecognizedPositions.length} uncertain tax position(s) with a ` +
              `combined gross amount of ` +
              `$${(totalUnrecognizedGross / 1_000_000).toFixed(2)}M have not met ` +
              `the recognition threshold, yet no interest or penalty accruals have ` +
              `been recorded. Under ASC 740-10-25-56 through 25-57, an entity must ` +
              `accrue interest and penalties associated with uncertain tax positions ` +
              `in accordance with its accounting policy election. Interest on ` +
              `underpayments accrues from the return due date at the applicable ` +
              `federal underpayment rate (IRC Section 6601). Accuracy-related ` +
              `penalties under IRC Section 6662 may also apply.`,
            'ASC 740-10-25-56 through 25-57: The accounting for interest and ' +
              'penalties related to unrecognized tax benefits shall be determined ' +
              'by the entity\'s accounting policy election.',
            'For each unrecognized UTP: (1) compute applicable interest from the ' +
              'original return due date to the current reporting date using the ' +
              'federal underpayment rate, (2) assess whether accuracy-related or ' +
              'other penalties apply, (3) record the appropriate interest and penalty ' +
              'accruals. Verify the entity\'s accounting policy election for ' +
              'classifying interest and penalties (income tax expense vs. separate ' +
              'line item).',
            totalUnrecognizedGross,
            []
          )
        );
      } else {
        // Partial accrual — some positions missing interest or penalty
        if (positionsWithoutInterest.length > 0) {
          const missingInterestAmount = positionsWithoutInterest.reduce(
            (sum, utp) => sum + utp.grossAmount,
            0
          );
          findings.push(
            createFinding(
              data.engagementId,
              'GAAP-UTP-002',
              'GAAP',
              'medium',
              'Missing Interest Accrual on Certain Unrecognized Tax Positions',
              `${positionsWithoutInterest.length} of ` +
                `${unrecognizedPositions.length} unrecognized tax position(s) ` +
                `(gross amount $${(missingInterestAmount / 1_000_000).toFixed(2)}M) ` +
                `have zero interest accrual. Interest typically accrues from the ` +
                `return due date at the federal underpayment rate and should be ` +
                `recorded for all open positions not meeting the recognition threshold.`,
              'ASC 740-10-25-56 through 25-57: Interest on uncertain tax positions.',
              'Compute and record the appropriate interest accrual for each ' +
                'position currently showing zero interest. Use the federal ' +
                'underpayment rate applicable to each period.',
              missingInterestAmount,
              []
            )
          );
        }

        if (positionsWithoutPenalty.length > 0) {
          const missingPenaltyAmount = positionsWithoutPenalty.reduce(
            (sum, utp) => sum + utp.grossAmount,
            0
          );
          findings.push(
            createFinding(
              data.engagementId,
              'GAAP-UTP-002',
              'GAAP',
              'medium',
              'Missing Penalty Accrual on Certain Unrecognized Tax Positions',
              `${positionsWithoutPenalty.length} of ` +
                `${unrecognizedPositions.length} unrecognized tax position(s) ` +
                `(gross amount $${(missingPenaltyAmount / 1_000_000).toFixed(2)}M) ` +
                `have zero penalty accrual. Positions that do not meet the ` +
                `more-likely-than-not threshold may be subject to accuracy-related ` +
                `penalties under IRC Section 6662. Evaluate whether reasonable cause ` +
                `or other defenses apply.`,
              'ASC 740-10-25-56 through 25-57: Penalty accrual on uncertain tax positions.',
              'Assess penalty exposure for each position without an accrual. ' +
                'Determine if the accuracy-related penalty (20%) or negligence ' +
                'penalty applies. If penalties are probable, accrue them alongside ' +
                'the UTP reserve.',
              missingPenaltyAmount,
              []
            )
          );
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-UTP-003',
    name: 'UTP Disclosure Completeness',
    framework: 'GAAP',
    category: 'Uncertain Tax Positions (ASC 740-10)',
    description:
      'Checks for required ASC 740-10-50 disclosures related to uncertain tax positions, including the tabular rollforward, ETR impact, and statute of limitations considerations',
    citation:
      'ASC 740-10-50-15 through 50-15D: Required disclosures for unrecognized tax benefits including rollforward, ETR impact, and reasonably possible changes within 12 months',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      if (
        !data.uncertainTaxPositions ||
        data.uncertainTaxPositions.length === 0
      ) {
        return findings;
      }

      const positions = data.uncertainTaxPositions;
      const totalReserve = positions.reduce(
        (sum, utp) => sum + utp.totalReserve,
        0
      );

      // Only flag if the UTP reserve is material enough to warrant disclosure scrutiny
      if (totalReserve <= 100_000) {
        return findings;
      }

      const disclosureGaps: string[] = [];

      // Check 1: Rollforward completeness — need beginning balance, additions,
      // settlements, and lapses represented in the data
      const hasSettledOrLapsed = positions.some(
        (p) => p.status === 'settled' || p.status === 'lapsed'
      );
      const currentYearPositions = positions.filter(
        (p) => p.taxYear === data.taxYear
      );
      const priorYearPositions = positions.filter(
        (p) => p.taxYear < data.taxYear
      );

      const hasBeginningBalance = priorYearPositions.length > 0;
      const hasAdditions = currentYearPositions.length > 0;

      if (!hasBeginningBalance && !hasSettledOrLapsed) {
        disclosureGaps.push(
          'Rollforward appears incomplete: no prior-year positions (beginning ' +
            'balance) and no settled/lapsed positions were found. ASC 740-10-50-15A ' +
            'requires a tabular reconciliation of the total amounts of unrecognized ' +
            'tax benefits at the beginning and end of the period'
        );
      }

      if (!hasBeginningBalance && hasAdditions && !hasSettledOrLapsed) {
        disclosureGaps.push(
          'Only current-year additions exist with no beginning balance, settlements, ' +
            'or lapses, suggesting the rollforward may be missing required components'
        );
      }

      // Check 2: Positions approaching statute of limitations
      const positionsNearExpiration = positions.filter((utp) => {
        if (!utp.expirationDate) return false;
        const expDate = new Date(utp.expirationDate);
        const fyeDate = new Date(data.fiscalYearEnd);
        const monthsToExpiration =
          (expDate.getTime() - fyeDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return monthsToExpiration > 0 && monthsToExpiration <= 12;
      });

      if (positionsNearExpiration.length > 0) {
        const expiringAmount = positionsNearExpiration.reduce(
          (sum, utp) => sum + utp.totalReserve,
          0
        );
        disclosureGaps.push(
          `${positionsNearExpiration.length} position(s) with reserves of ` +
            `$${(expiringAmount / 1_000_000).toFixed(2)}M have statutes of ` +
            `limitations expiring within 12 months. ASC 740-10-50-15D requires ` +
            `disclosure of the nature and estimate of reasonably possible changes ` +
            `within 12 months`
        );
      }

      // Check 3: ETR impact disclosure
      const taxExpenseAccounts = data.accounts.filter(
        (a) => a.subType === 'tax_expense'
      );
      const totalTaxExpense = taxExpenseAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance),
        0
      );

      if (totalTaxExpense > 0 && totalReserve / totalTaxExpense > 0.1) {
        disclosureGaps.push(
          `UTP reserves represent ${((totalReserve / totalTaxExpense) * 100).toFixed(1)}% ` +
            `of total tax expense. ASC 740-10-50-15C requires disclosure of the ` +
            `total amount of unrecognized tax benefits that, if recognized, would ` +
            `affect the effective tax rate`
        );
      }

      // Check 4: Interest and penalty classification policy
      const hasInterest = positions.some((utp) => utp.interestAccrual > 0);
      const hasPenalties = positions.some((utp) => utp.penaltyAccrual > 0);

      if (hasInterest || hasPenalties) {
        const totalInterestPenalty = positions.reduce(
          (sum, utp) => sum + utp.interestAccrual + utp.penaltyAccrual,
          0
        );
        disclosureGaps.push(
          `Interest and penalties on UTPs total ` +
            `$${(totalInterestPenalty / 1_000_000).toFixed(2)}M. The entity\'s ` +
            `accounting policy for classifying interest and penalties must be ` +
            `disclosed along with amounts recognized in the current period`
        );
      }

      if (disclosureGaps.length > 0) {
        const severity =
          disclosureGaps.length >= 3 ? ('high' as const) : ('medium' as const);

        const utpAccountNumbers = data.accounts
          .filter((a) =>
            ['tax reserve', 'uncertain', 'fin 48', 'tax contingency'].some(
              (kw) => a.accountName.toLowerCase().includes(kw)
            )
          )
          .map((a) => a.accountNumber);

        findings.push(
          createFinding(
            data.engagementId,
            'GAAP-UTP-003',
            'GAAP',
            severity,
            'Uncertain Tax Position Disclosure Gaps Identified',
            `${disclosureGaps.length} potential disclosure gap(s) were identified ` +
              `for uncertain tax positions with total reserves of ` +
              `$${(totalReserve / 1_000_000).toFixed(2)}M: ` +
              `${disclosureGaps.join('. ')}.`,
            'ASC 740-10-50-15 through 50-15D: Required disclosures for ' +
              'unrecognized tax benefits, including a tabular rollforward, ' +
              'amounts that would affect the effective tax rate, positions ' +
              'reasonably possible of significant change within 12 months, and ' +
              'the entity\'s interest and penalty classification policy.',
            'Prepare or review the complete ASC 740-10-50 disclosure package. ' +
              'Ensure the UTP rollforward is complete and accurate with beginning ' +
              'balance, additions, settlements, and lapses. Disclose the total ' +
              'amount of unrecognized tax benefits that would affect the ETR. ' +
              'Identify and disclose positions reasonably possible of significant ' +
              'change within 12 months. State the entity\'s accounting policy for ' +
              'classifying interest and penalties.',
            null,
            utpAccountNumbers
          )
        );
      }

      return findings;
    },
  },
];
