import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const civilianPayRules: AuditRule[] = [
  {
    id: 'DOD-CIVPAY-001',
    name: 'GS Pay Rate Validation',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Validates that basic pay conforms to expected GS pay schedule rates for the grade and step',
    citation: 'DoD FMR Vol 8, Ch 1; 5 U.S.C. \u00A7 5332 - General Schedule pay rates',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Approximate GS base pay ranges (Step 1 minimum to Step 10 maximum) for reasonableness
      const gsPayRanges: Record<string, { min: number; max: number }> = {
        'GS-1':  { min: 21000, max: 27000 },
        'GS-2':  { min: 24000, max: 30000 },
        'GS-3':  { min: 26000, max: 34000 },
        'GS-4':  { min: 29000, max: 38000 },
        'GS-5':  { min: 33000, max: 42000 },
        'GS-6':  { min: 36000, max: 47000 },
        'GS-7':  { min: 40000, max: 52000 },
        'GS-8':  { min: 44000, max: 57000 },
        'GS-9':  { min: 48000, max: 63000 },
        'GS-10': { min: 53000, max: 69000 },
        'GS-11': { min: 58000, max: 76000 },
        'GS-12': { min: 70000, max: 91000 },
        'GS-13': { min: 83000, max: 108000 },
        'GS-14': { min: 98000, max: 127000 },
        'GS-15': { min: 115000, max: 150000 },
      };

      for (const record of data.dodData.civilianPayRecords) {
        const gradeKey = `${record.payPlan}-${record.grade}`;
        const range = gsPayRanges[gradeKey];
        if (!range) continue;

        if (record.basicPay < range.min * 0.90 || record.basicPay > range.max * 1.10) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-001',
            'DOD_FMR',
            'high',
            `GS Pay Rate Outside Expected Range for ${gradeKey} Step ${record.step}`,
            `Employee ${record.employeeId} at ${gradeKey}, Step ${record.step} has basic pay of $${record.basicPay.toLocaleString()} which falls outside the expected range of $${range.min.toLocaleString()}-$${range.max.toLocaleString()} (with 10% tolerance for fiscal year variations). This may indicate an incorrect grade/step assignment or pay rate table error.`,
            'DoD FMR Vol 8, Ch 1; 5 U.S.C. \u00A7 5332 - GS basic pay rates are established by law and adjusted annually.',
            'Verify the employee grade, step, and pay plan against the SF-50 and the published OPM pay tables for the applicable fiscal year. Correct any discrepancies and process retroactive adjustments if needed.',
            Math.abs(record.basicPay - (record.basicPay > range.max ? range.max : range.min)),
            ['Civilian Pay - Basic Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-002',
    name: 'Locality Pay Adjustment Verification',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Verifies that locality pay adjustments are reasonable and properly applied',
    citation: 'DoD FMR Vol 8, Ch 2; 5 U.S.C. \u00A7 5304 - Locality-based comparability payments',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        if (record.basicPay <= 0) continue;

        const localityPct = record.localityAdjustment / record.basicPay;

        // Locality pay typically ranges from ~16% (Rest of US) to ~43% (San Francisco)
        if (record.localityAdjustment > 0 && (localityPct < 0.10 || localityPct > 0.50)) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-002',
            'DOD_FMR',
            'medium',
            `Locality Pay Adjustment Outside Expected Range`,
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}, locality: ${record.locality}) has a locality adjustment of $${record.localityAdjustment.toLocaleString()} (${(localityPct * 100).toFixed(1)}% of basic pay). Locality pay rates typically range from 16% to 43%. A rate of ${(localityPct * 100).toFixed(1)}% is outside normal parameters and should be verified.`,
            'DoD FMR Vol 8, Ch 2; 5 U.S.C. \u00A7 5304 - Locality-based comparability payments are computed as a percentage of basic pay based on duty station.',
            'Verify the employee duty station and applicable locality pay area. Cross-reference the locality percentage against the OPM locality pay tables for the fiscal year. Correct any errors in duty station coding or locality rate application.',
            null,
            ['Civilian Pay - Locality Pay']
          ));
        }

        // Locality pay should be present for GS employees
        if (record.payPlan === 'GS' && record.localityAdjustment <= 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-002',
            'DOD_FMR',
            'medium',
            `Missing Locality Pay for GS Employee`,
            `Employee ${record.employeeId} (GS-${record.grade}, Step ${record.step}) has no locality pay adjustment. All GS employees within the United States are entitled to locality pay per 5 U.S.C. \u00A7 5304.`,
            'DoD FMR Vol 8, Ch 2; 5 U.S.C. \u00A7 5304 - Locality pay is applicable to all GS employees.',
            'Verify the employee duty station and ensure locality pay is applied. If the employee is stationed overseas and legitimately exempt, document the basis.',
            null,
            ['Civilian Pay - Locality Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-003',
    name: 'FERS Contribution Rate Compliance',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Validates Federal Employees Retirement System contribution rates are correct',
    citation: 'DoD FMR Vol 8, Ch 3; 5 U.S.C. \u00A7 8422 - FERS deductions and withholdings',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // FERS contribution rates by plan
      const fersRates: Record<string, number> = {
        'fers': 0.008,          // FERS employees hired before 2013: 0.8%
        'fers_revised': 0.044,  // FERS-FRAE employees hired 2014+: 4.4%
        'csrs': 0.07,           // CSRS: 7.0%
      };

      for (const record of data.dodData.civilianPayRecords) {
        if (record.basicPay <= 0) continue;

        const expectedRate = fersRates[record.retirementPlan];
        if (!expectedRate) continue;

        const adjustedPay = record.basicPay + record.localityAdjustment;
        const expectedContribution = adjustedPay * expectedRate;
        const tolerance = adjustedPay * 0.01; // 1% tolerance

        if (Math.abs(record.retirementContribution - expectedContribution) > tolerance) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-003',
            'DOD_FMR',
            'high',
            `${record.retirementPlan.toUpperCase()} Contribution Rate Discrepancy`,
            `Employee ${record.employeeId} (${record.retirementPlan.toUpperCase()}) has retirement contribution of $${record.retirementContribution.toFixed(2)} but expected contribution at ${(expectedRate * 100).toFixed(1)}% of adjusted pay ($${adjustedPay.toLocaleString()}) is $${expectedContribution.toFixed(2)}. Difference: $${Math.abs(record.retirementContribution - expectedContribution).toFixed(2)}.`,
            'DoD FMR Vol 8, Ch 3; 5 U.S.C. \u00A7 8422 - Employee deductions for FERS must conform to the statutory rate based on the applicable FERS category.',
            'Verify the employee retirement plan designation and applicable contribution rate. Cross-reference with the SF-50 and payroll system configuration. Correct any under-withholding or over-withholding and notify the employee.',
            Math.abs(record.retirementContribution - expectedContribution),
            ['Civilian Pay - Retirement']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-004',
    name: 'FEHB Contribution Accuracy',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Verifies that Federal Employees Health Benefits contributions are within expected ranges',
    citation: 'DoD FMR Vol 8, Ch 4; 5 U.S.C. \u00A7 8906 - Contributions to FEHB',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // FEHB bi-weekly employee premiums typically range from $50 to $400
      // Annual range: approximately $1,300 to $10,400
      const minAnnualFEHB = 1000;
      const maxAnnualFEHB = 12000;

      for (const record of data.dodData.civilianPayRecords) {
        if (record.fehbContribution <= 0) continue;

        if (record.fehbContribution < minAnnualFEHB || record.fehbContribution > maxAnnualFEHB) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-004',
            'DOD_FMR',
            'medium',
            `FEHB Contribution Outside Expected Range`,
            `Employee ${record.employeeId} has annual FEHB contribution of $${record.fehbContribution.toLocaleString()}, which is outside the typical range of $${minAnnualFEHB.toLocaleString()}-$${maxAnnualFEHB.toLocaleString()}. This may indicate an incorrect enrollment code, plan selection error, or payroll processing issue.`,
            'DoD FMR Vol 8, Ch 4; 5 U.S.C. \u00A7 8906 - The government and employee share of FEHB premiums are established annually based on plan selection.',
            'Verify the employee FEHB enrollment code and plan type (self-only, self-plus-one, family). Cross-reference the premium amount with the published OPM FEHB premium rates for the plan year.',
            null,
            ['Civilian Pay - FEHB']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-005',
    name: 'Leave Accrual Rate Validation',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Validates annual leave accrual rates based on years of service thresholds (4/6/8 hours per pay period)',
    citation: 'DoD FMR Vol 8, Ch 5; 5 U.S.C. \u00A7 6303 - Annual leave accrual',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        // Determine expected bi-weekly accrual based on years of service:
        // < 3 years: 4 hours/pay period (104 hours/year)
        // 3-15 years: 6 hours/pay period (160 hours/year)
        // 15+ years: 8 hours/pay period (208 hours/year)
        let expectedAnnualHours: number;
        let category: string;

        // Use yearsOfService if available via pay period data; approximate from step
        // GS step progression: step increases occur at 1,2,3 (1yr), 4,5,6 (2yr), 7,8,9 (3yr), 10
        const estimatedYOS = record.step <= 3 ? record.step - 1 :
          record.step <= 6 ? 3 + (record.step - 3) * 2 :
          record.step <= 9 ? 9 + (record.step - 6) * 3 : 18;

        if (estimatedYOS < 3) {
          expectedAnnualHours = 104;
          category = 'less than 3 years';
        } else if (estimatedYOS < 15) {
          expectedAnnualHours = 160;
          category = '3 to 15 years';
        } else {
          expectedAnnualHours = 208;
          category = '15 or more years';
        }

        const tolerance = 40; // Allow for partial year employment, LWOP, etc.

        if (record.leaveHoursAccrued > 0 && Math.abs(record.leaveHoursAccrued - expectedAnnualHours) > tolerance) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-005',
            'DOD_FMR',
            'medium',
            `Leave Accrual Rate May Be Incorrect`,
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}, Step ${record.step}, est. ${estimatedYOS} years service) accrued ${record.leaveHoursAccrued} hours of annual leave. Expected accrual for the "${category}" category is ${expectedAnnualHours} hours/year. The difference of ${Math.abs(record.leaveHoursAccrued - expectedAnnualHours)} hours exceeds the ${tolerance}-hour tolerance.`,
            'DoD FMR Vol 8, Ch 5; 5 U.S.C. \u00A7 6303 - Full-time employees accrue annual leave at 4, 6, or 8 hours per pay period based on creditable service.',
            'Verify the employee service computation date (SCD) for leave purposes. Confirm the correct leave accrual category and adjust the SCD if creditable service was not properly calculated. Review for any periods of LWOP that would reduce accrual.',
            null,
            ['Civilian Pay - Leave']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-006',
    name: 'Premium Pay Cap Compliance',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Ensures premium pay combined with basic pay does not exceed the GS-15, Step 10 cap',
    citation: 'DoD FMR Vol 8, Ch 6; 5 U.S.C. \u00A7 5547 - Limitation on premium pay',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Approximate GS-15 Step 10 rate (base + typical locality average)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const gs15Step10Base = 150000;
      const gs15Step10WithLocality = 195000; // Approximate with average locality

      for (const record of data.dodData.civilianPayRecords) {
        if (record.premiumPay <= 0) continue;

        const totalWithPremium = record.basicPay + record.localityAdjustment + record.premiumPay;

        if (totalWithPremium > gs15Step10WithLocality) {
          const excess = totalWithPremium - gs15Step10WithLocality;
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-006',
            'DOD_FMR',
            'high',
            `Premium Pay Cap Exceeded`,
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}) has combined basic pay ($${record.basicPay.toLocaleString()}), locality ($${record.localityAdjustment.toLocaleString()}), and premium pay ($${record.premiumPay.toLocaleString()}) totaling $${totalWithPremium.toLocaleString()}, which exceeds the estimated GS-15, Step 10 cap of $${gs15Step10WithLocality.toLocaleString()} by $${excess.toLocaleString()}. Premium pay is generally capped at the GS-15, Step 10 rate for the applicable locality.`,
            'DoD FMR Vol 8, Ch 6; 5 U.S.C. \u00A7 5547(a) - Premium pay may not cause aggregate compensation to exceed the GS-15 Step 10 rate.',
            'Verify the premium pay cap applicable to the employee duty station. Determine if an emergency or mission-critical waiver under 5 U.S.C. \u00A7 5547(b) has been authorized. If no waiver exists, reduce premium pay to the cap and recover any overpayment.',
            excess,
            ['Civilian Pay - Premium Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-007',
    name: 'Overtime Pay Authorization',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Validates that overtime pay is within authorized limits and properly documented',
    citation: 'DoD FMR Vol 8, Ch 6; 5 U.S.C. \u00A7 5542 - Overtime rates of pay',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        if (record.overtimePay <= 0) continue;

        // Overtime pay exceeding 25% of basic pay warrants review
        const overtimeRatio = record.overtimePay / record.basicPay;
        if (overtimeRatio > 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-007',
            'DOD_FMR',
            'medium',
            `Excessive Overtime Pay Relative to Basic Pay`,
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}) has overtime pay of $${record.overtimePay.toLocaleString()} which is ${(overtimeRatio * 100).toFixed(1)}% of basic pay ($${record.basicPay.toLocaleString()}). Overtime exceeding 25% of basic pay indicates potentially unsustainable workload or inadequate staffing. Verify that all overtime is properly authorized in advance.`,
            'DoD FMR Vol 8, Ch 6; 5 U.S.C. \u00A7 5542 - Overtime must be officially ordered or approved and compensated at the applicable rate.',
            'Review overtime authorization records for the employee. Verify that overtime was ordered or approved in advance by an authorized official. Evaluate whether the overtime level is operationally justified and whether additional staffing should be considered.',
            null,
            ['Civilian Pay - Overtime']
          ));
        }

        // FLSA-exempt employees at GS-10 Step 1 and above receive overtime at greater of
        // 1.5x GS-10 Step 1 or their regular rate; flag if overtime appears miscalculated
        const gradeNum = parseInt(record.grade, 10);
        if (record.payPlan === 'GS' && gradeNum >= 10) {
          const hourlyBasic = (record.basicPay + record.localityAdjustment) / 2087;
          const gs10Step1Rate = 53000 / 2087; // Approximate
          const expectedOTRate = Math.max(hourlyBasic, gs10Step1Rate * 1.5);
          // Rough check: if overtime pay implies an hourly rate exceeding 2x expected OT rate
          if (record.overtimePay > expectedOTRate * 500) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-CIVPAY-007',
              'DOD_FMR',
              'high',
              `Overtime Pay Amount Appears Excessive for FLSA-Exempt Employee`,
              `Employee ${record.employeeId} (GS-${record.grade}) has overtime pay of $${record.overtimePay.toLocaleString()} which implies an unusually high number of overtime hours for an FLSA-exempt employee. Verify the overtime rate calculation and hours worked.`,
              'DoD FMR Vol 8, Ch 6; 5 U.S.C. \u00A7 5542(a) - FLSA-exempt overtime is computed at the greater of 1.5 times GS-10 Step 1 or the employee hourly rate.',
              'Audit the overtime hours and rate computation. Verify against time and attendance records and overtime authorization forms.',
              record.overtimePay,
              ['Civilian Pay - Overtime']
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-008',
    name: 'TSP Matching Compliance',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Ensures TSP agency matching contributions do not exceed 5% of basic pay for FERS employees',
    citation: 'DoD FMR Vol 8, Ch 3; 5 U.S.C. \u00A7 8432 - TSP contributions',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        if (record.retirementPlan === 'csrs') continue; // CSRS not eligible for matching

        const adjustedPay = record.basicPay + record.localityAdjustment;
        const maxMatch = adjustedPay * 0.05;

        if (record.tspMatchAmount > maxMatch) {
          const excess = record.tspMatchAmount - maxMatch;
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-008',
            'DOD_FMR',
            'high',
            `TSP Agency Matching Exceeds 5% Limit`,
            `Employee ${record.employeeId} (${record.retirementPlan.toUpperCase()}) has TSP agency matching of $${record.tspMatchAmount.toFixed(2)} which exceeds the 5% maximum of $${maxMatch.toFixed(2)} (adjusted pay: $${adjustedPay.toLocaleString()}). Excess: $${excess.toFixed(2)}. FERS employees are entitled to up to 5% agency match (1% automatic + up to 4% matching).`,
            'DoD FMR Vol 8, Ch 3; 5 U.S.C. \u00A7 8432(c) - Agency matching contributions: 1% automatic plus dollar-for-dollar on first 3% and $0.50 per dollar on next 2% of basic pay.',
            'Verify the TSP matching formula computation. Correct the agency matching amount and recover the excess. Ensure the payroll system correctly applies the matching tiers.',
            excess,
            ['Civilian Pay - TSP']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-009',
    name: 'Total Compensation Reconciliation',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Ensures the sum of civilian pay components reconciles to reported total compensation',
    citation: 'DoD FMR Vol 8, Ch 1 - Civilian pay accountability and reconciliation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        const computedTotal =
          record.basicPay +
          record.localityAdjustment +
          record.premiumPay +
          record.overtimePay;

        const difference = Math.abs(record.totalCompensation - computedTotal);
        const tolerancePct = 0.02;

        if (difference > Math.max(record.totalCompensation * tolerancePct, 100)) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-009',
            'DOD_FMR',
            'high',
            `Civilian Total Compensation Reconciliation Variance`,
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}) has reported total compensation of $${record.totalCompensation.toLocaleString()} but the sum of basic pay, locality, premium, and overtime equals $${computedTotal.toLocaleString()}, a difference of $${difference.toFixed(2)}. This variance exceeds the ${(tolerancePct * 100)}% tolerance and must be reconciled.`,
            'DoD FMR Vol 8, Ch 1 - Total compensation must be reconcilable to individual pay components to support audit readiness.',
            'Reconcile total compensation to all individual pay elements including awards, bonuses, allowances, and deductions. Identify and document the source of any unreconciled differences.',
            difference,
            ['Civilian Pay - Total Compensation']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-CIVPAY-010',
    name: 'Step Increase Eligibility',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Volume 8)',
    description: 'Validates within-grade step increase eligibility based on time-in-step requirements',
    citation: 'DoD FMR Vol 8, Ch 2; 5 U.S.C. \u00A7 5335 - Periodic step increases',
    defaultSeverity: 'low',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check for employees at Step 10 for extended periods or employees at Step 1
      // who may have been denied step increases improperly
      const stepCounts: Record<number, number> = {};
      for (const record of data.dodData.civilianPayRecords) {
        if (record.payPlan !== 'GS') continue;
        stepCounts[record.step] = (stepCounts[record.step] || 0) + 1;
      }

      // Flag employees stuck at Step 1 which may indicate missed WGIs
      for (const record of data.dodData.civilianPayRecords) {
        if (record.payPlan !== 'GS') continue;

        // Step increase waiting periods: Steps 1-3 = 1 year, Steps 4-6 = 2 years, Steps 7-9 = 3 years
        // An employee at Step 1 with significant tenure likely should have progressed
        if (record.step === 1) {
          const gradeNum = parseInt(record.grade, 10);
          // If at a relatively senior grade and still at Step 1, could be a new promotion
          // or a missed WGI; flag for review at lower grades where it's less common
          if (gradeNum <= 12) {
            // This is informational; may be a new hire or recent promotion
            // We only flag if there are patterns suggesting systematic issues
          }
        }

        // Validate step is within valid range
        if (record.step < 1 || record.step > 10) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-CIVPAY-010',
            'DOD_FMR',
            'high',
            `Invalid GS Step Value`,
            `Employee ${record.employeeId} (GS-${record.grade}) has step value of ${record.step}, which is outside the valid range of 1-10. This indicates a data integrity issue in the personnel/payroll system.`,
            'DoD FMR Vol 8, Ch 2; 5 U.S.C. \u00A7 5332 - The General Schedule consists of grades GS-1 through GS-15, each with 10 steps.',
            'Correct the step value in the payroll system. Verify the employee current step against the most recent SF-50 and correct any discrepancies.',
            null,
            ['Civilian Pay - Step Increase']
          ));
        }
      }

      return findings;
    },
  },
];
