import type {
  PenaltyAssessment,
  InterestComputation,
  PenaltyExposureSummary,
} from '@/types/tax-compliance';

/**
 * Calculates the IRC Section 6651(a)(1) failure-to-file penalty.
 *
 * The penalty is 5% of the unpaid tax for each month (or partial month) the
 * return is late, up to a maximum of 25%. If the failure-to-pay penalty also
 * applies for the same period, the failure-to-file rate is reduced by 0.5%
 * per month of overlap (i.e., the effective rate is 4.5% per overlapping month).
 *
 * @param taxDue The amount of tax due on the return.
 * @param monthsLate The number of full or partial months the return is late.
 * @returns PenaltyAssessment with the computed penalty details.
 */
export function calculateFailureToFilePenalty(
  taxDue: number,
  monthsLate: number
): PenaltyAssessment {
  const maxRate = 0.25;
  const baseRatePerMonth = 0.05;
  const overlapReduction = 0.005; // Reduced by 0.5% when failure-to-pay also applies

  // Effective rate per month after overlap reduction
  const effectiveRatePerMonth = baseRatePerMonth - overlapReduction;
  const penaltyRate = Math.min(effectiveRatePerMonth * monthsLate, maxRate);
  const penaltyAmount = Math.round(taxDue * penaltyRate * 100) / 100;

  const mitigatingFactors: string[] = [];
  if (monthsLate <= 1) {
    mitigatingFactors.push(
      'Filed within one month of deadline; first-time penalty abatement may be available'
    );
  }
  mitigatingFactors.push(
    'Reasonable cause defense available under IRC §6651(a) if the taxpayer can demonstrate the failure was not due to willful neglect'
  );

  return {
    type: 'failure_to_file',
    ircSection: 'IRC §6651(a)(1)',
    baseAmount: taxDue,
    penaltyRate,
    penaltyAmount,
    interestAmount: 0,
    totalExposure: penaltyAmount,
    mitigatingFactors,
    defenseAvailable: true,
    defenseDescription:
      'Reasonable cause exception under IRC §6651(a): penalty may be abated if the taxpayer can ' +
      'demonstrate the failure was due to reasonable cause and not willful neglect. First-time ' +
      'abatement (FTA) administrative waiver may also apply.',
  };
}

/**
 * Calculates the IRC Section 6651(a)(2) failure-to-pay penalty.
 *
 * The penalty is 0.5% of the unpaid tax for each month (or partial month) the
 * tax remains unpaid, up to a maximum of 25%.
 *
 * @param taxDue The amount of unpaid tax.
 * @param monthsLate The number of full or partial months the tax is unpaid.
 * @returns PenaltyAssessment with the computed penalty details.
 */
export function calculateFailureToPayPenalty(
  taxDue: number,
  monthsLate: number
): PenaltyAssessment {
  const maxRate = 0.25;
  const ratePerMonth = 0.005;

  const penaltyRate = Math.min(ratePerMonth * monthsLate, maxRate);
  const penaltyAmount = Math.round(taxDue * penaltyRate * 100) / 100;

  const mitigatingFactors: string[] = [];
  mitigatingFactors.push(
    'Reasonable cause defense available under IRC §6651(a) if the taxpayer can demonstrate inability to pay was due to reasonable cause'
  );
  if (monthsLate <= 1) {
    mitigatingFactors.push(
      'First-time penalty abatement (FTA) administrative waiver may be available'
    );
  }

  return {
    type: 'failure_to_pay',
    ircSection: 'IRC §6651(a)(2)',
    baseAmount: taxDue,
    penaltyRate,
    penaltyAmount,
    interestAmount: 0,
    totalExposure: penaltyAmount,
    mitigatingFactors,
    defenseAvailable: true,
    defenseDescription:
      'Reasonable cause exception: penalty may be abated if the taxpayer demonstrates the failure to pay was due to reasonable cause and not willful neglect.',
  };
}

/**
 * Calculates the IRC Section 6662 accuracy-related penalty.
 *
 * A 20% penalty applies for substantial understatement, which is defined as the
 * greater of $10,000,000 or 10% of the tax shown on the return. A 40% penalty
 * applies for gross valuation misstatements under IRC Section 6662(h).
 *
 * @param understatement The amount of the understatement.
 * @param taxShown The total tax shown on the return.
 * @param isGrossValuation Whether this is a gross valuation misstatement.
 * @returns PenaltyAssessment with the computed penalty details.
 */
export function calculateAccuracyPenalty(
  understatement: number,
  taxShown: number,
  isGrossValuation: boolean
): PenaltyAssessment {
  // Determine if the understatement is "substantial"
  const substantialThreshold = Math.max(10_000_000, taxShown * 0.1);
  const isSubstantial = understatement > substantialThreshold;

  const mitigatingFactors: string[] = [];
  let defenseAvailable = true;
  let defenseDescription: string | undefined;

  let penaltyRate: number;
  let ircSection: string;

  if (isGrossValuation) {
    // Gross valuation misstatement: 40%
    penaltyRate = 0.40;
    ircSection = 'IRC §6662(h)';
  } else if (isSubstantial) {
    // Substantial understatement: 20%
    penaltyRate = 0.20;
    ircSection = 'IRC §6662(a)';
  } else {
    // Does not meet substantial understatement threshold
    penaltyRate = 0;
    ircSection = 'IRC §6662(a)';
  }

  const penaltyAmount = Math.round(understatement * penaltyRate * 100) / 100;

  if (!isSubstantial && !isGrossValuation) {
    mitigatingFactors.push(
      `Understatement does not meet the substantial understatement threshold (greater of $10M or 10% of tax shown: $${substantialThreshold.toLocaleString()})`
    );
  }

  if (isSubstantial && !isGrossValuation) {
    mitigatingFactors.push(
      'Substantial authority or adequate disclosure on Form 8275/8275-R may reduce or eliminate the penalty under IRC §6662(d)(2)(B)'
    );
  }

  mitigatingFactors.push(
    'Reasonable cause and good faith defense available under IRC §6664(c)'
  );

  defenseDescription =
    'Reasonable cause and good faith exception under IRC §6664(c). For substantial understatement, ' +
    'the penalty may be avoided if the position has substantial authority or was adequately disclosed. ' +
    'Reliance on professional advice may constitute reasonable cause.';

  return {
    type: 'accuracy_related',
    ircSection,
    baseAmount: understatement,
    penaltyRate,
    penaltyAmount,
    interestAmount: 0,
    totalExposure: penaltyAmount,
    mitigatingFactors,
    defenseAvailable,
    defenseDescription,
  };
}

/**
 * Calculates underpayment interest under IRC Sections 6621 and 6622.
 *
 * Interest is compounded daily on the underpayment amount from the due date
 * of the return to the payment date.
 *
 * @param underpayment The amount of the tax underpayment.
 * @param startDate The date interest begins accruing (ISO string, typically the return due date).
 * @param endDate The date interest stops accruing (ISO string, typically the payment date).
 * @param annualRate The applicable annual underpayment rate (federal short-term rate + 3%).
 * @returns InterestComputation with the daily compounded interest details.
 */
export function calculateUnderpaymentInterest(
  underpayment: number,
  startDate: string,
  endDate: string,
  annualRate: number
): InterestComputation {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end <= start || underpayment <= 0 || annualRate <= 0) {
    return {
      principalAmount: underpayment,
      startDate,
      endDate,
      applicableRate: annualRate,
      dailyCompounding: true,
      totalInterest: 0,
    };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / msPerDay);

  // Daily compounding: A = P * (1 + r/365)^n - P
  const dailyRate = annualRate / 365;
  const compoundedAmount = underpayment * Math.pow(1 + dailyRate, totalDays);
  const totalInterest = Math.round((compoundedAmount - underpayment) * 100) / 100;

  return {
    principalAmount: underpayment,
    startDate,
    endDate,
    applicableRate: annualRate,
    dailyCompounding: true,
    totalInterest,
  };
}

/**
 * Assesses transfer pricing penalties under IRC Section 6662(e).
 *
 * A 20% penalty applies to transfer pricing adjustments unless the taxpayer
 * has contemporaneous documentation (IRC §6662(e)(3)(B)). A 40% penalty
 * applies for gross misstatements (net §482 adjustments exceeding the greater
 * of $20M or 20% of gross receipts).
 *
 * @param adjustmentAmount The IRC Section 482 transfer pricing adjustment.
 * @param hasDocumentation Whether contemporaneous transfer pricing documentation exists.
 * @returns PenaltyAssessment with the transfer pricing penalty details.
 */
export function assessTransferPricingPenalty(
  adjustmentAmount: number,
  hasDocumentation: boolean
): PenaltyAssessment {
  const mitigatingFactors: string[] = [];
  let defenseAvailable = false;
  let defenseDescription: string | undefined;

  // Gross valuation misstatement threshold: $20M or 20% of gross receipts
  // Since we do not have gross receipts here, use the $20M threshold
  const grossMisstatementThreshold = 20_000_000;
  const isGrossMisstatement = adjustmentAmount > grossMisstatementThreshold;

  let penaltyRate: number;

  if (isGrossMisstatement) {
    // 40% penalty for gross valuation misstatements (§6662(h))
    penaltyRate = 0.40;
    mitigatingFactors.push(
      `Adjustment of $${(adjustmentAmount / 1_000_000).toFixed(2)}M exceeds the gross valuation misstatement threshold of $20M, triggering the 40% penalty rate`
    );
  } else {
    // 20% penalty for substantial valuation misstatements
    penaltyRate = 0.20;
  }

  if (hasDocumentation) {
    mitigatingFactors.push(
      'Contemporaneous transfer pricing documentation exists, which may support a reasonable cause defense under IRC §6662(e)(3)(B)'
    );
    defenseAvailable = true;
    defenseDescription = 'Under IRC §6662(e)(3)(B), the transfer pricing penalty does not apply if the taxpayer maintains contemporaneous documentation establishing that the method and its application were reasonable. The documentation must be in existence when the return is filed.';
    // With documentation, the penalty may be reduced or eliminated
    penaltyRate = hasDocumentation && !isGrossMisstatement ? 0 : penaltyRate;
  } else {
    mitigatingFactors.push(
      'No contemporaneous transfer pricing documentation exists; the reasonable cause defense under IRC §6662(e)(3)(B) is not available'
    );
  }

  const penaltyAmount = Math.round(adjustmentAmount * penaltyRate * 100) / 100;

  return {
    type: 'transfer_pricing',
    ircSection: 'IRC §6662(e)',
    baseAmount: adjustmentAmount,
    penaltyRate,
    penaltyAmount,
    interestAmount: 0,
    totalExposure: penaltyAmount,
    mitigatingFactors,
    defenseAvailable,
    defenseDescription,
  };
}

/**
 * Calculates the estimated tax penalty under IRC Section 6655 (corporations).
 *
 * The penalty is computed at the federal short-term rate plus 3% on the amount
 * of the underpayment for the number of quarterly periods the estimated tax was short.
 *
 * @param requiredPayment The required estimated tax payment amount.
 * @param actualPayment The actual estimated tax payment made.
 * @param periodsShort The number of quarterly periods the payment was short.
 * @returns PenaltyAssessment with the estimated tax penalty details.
 */
export function calculateEstimatedTaxPenalty(
  requiredPayment: number,
  actualPayment: number,
  periodsShort: number
): PenaltyAssessment {
  const mitigatingFactors: string[] = [];

  const underpayment = Math.max(0, requiredPayment - actualPayment);

  if (underpayment === 0) {
    return {
      type: 'estimated_tax',
      ircSection: 'IRC §6655',
      baseAmount: requiredPayment,
      penaltyRate: 0,
      penaltyAmount: 0,
      interestAmount: 0,
      totalExposure: 0,
      mitigatingFactors: ['Required estimated tax payments were met; no penalty applies'],
      defenseAvailable: false,
    };
  }

  // Federal short-term rate + 3% applied for each underpayment period
  // Each period is approximately one quarter (3 months out of 12)
  const annualizedRate = 0.08; // Default federal short-term + 3%
  const periodRate = annualizedRate / 4; // Quarterly rate

  const penaltyRate = periodRate * periodsShort;
  const penaltyAmount = Math.round(underpayment * penaltyRate * 100) / 100;

  if (actualPayment >= requiredPayment * 0.9) {
    mitigatingFactors.push(
      'Payment was at least 90% of required amount; safe harbor may apply'
    );
  }

  mitigatingFactors.push(
    'Annualized income installment method under IRC §6655(e) may reduce or eliminate the penalty if income was earned unevenly throughout the year'
  );

  mitigatingFactors.push(
    'Prior-year safe harbor: penalty may be avoided if estimated payments equal or exceed 100% (110% for large corporations) of the prior year\'s tax liability'
  );

  return {
    type: 'estimated_tax',
    ircSection: 'IRC §6655',
    baseAmount: underpayment,
    penaltyRate,
    penaltyAmount,
    interestAmount: 0,
    totalExposure: penaltyAmount,
    mitigatingFactors,
    defenseAvailable: true,
    defenseDescription:
      'Safe harbor provisions under IRC §6655(d): no penalty if estimated payments equal or exceed ' +
      '100% of the prior year tax (110% for large corporations). The annualized income installment ' +
      'method under IRC §6655(e) may also apply.',
  };
}

/**
 * Aggregates all penalty assessments into a comprehensive exposure summary.
 *
 * @param engagementId The audit engagement identifier.
 * @param taxYear The tax year being assessed.
 * @param assessments Array of individual PenaltyAssessment results.
 * @returns PenaltyExposureSummary with totals across all penalty types.
 */
export function assessPenaltyExposure(
  engagementId: string,
  taxYear: number,
  assessments: PenaltyAssessment[]
): PenaltyExposureSummary {
  const totalPenaltyExposure = assessments.reduce(
    (sum, a) => sum + a.penaltyAmount, 0
  );

  const totalInterestExposure = assessments.reduce(
    (sum, a) => sum + a.interestAmount, 0
  );

  const grandTotal = Math.round((totalPenaltyExposure + totalInterestExposure) * 100) / 100;

  return {
    engagementId,
    taxYear,
    assessments,
    totalPenaltyExposure: Math.round(totalPenaltyExposure * 100) / 100,
    totalInterestExposure: Math.round(totalInterestExposure * 100) / 100,
    grandTotal,
  };
}
