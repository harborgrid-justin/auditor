import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const civilianPayRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V08-001',
    name: 'GS Pay Table Compliance',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies that basic pay plus locality adjustment are reasonable for the assigned grade and step',
    citation: 'DoD FMR Vol 8, Ch 1; 5 U.S.C. § 5332 - General Schedule pay rates',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

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

        // Check basic pay + locality as combined rate
        const adjustedPay = record.basicPay + record.localityAdjustment;

        if (record.basicPay < range.min * 0.90 || record.basicPay > range.max * 1.10) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-001',
            'DOD_FMR',
            'high',
            `GS Pay Rate Outside Expected Range for ${gradeKey} Step ${record.step}`,
            `Employee ${record.employeeId} at ${gradeKey}, Step ${record.step} has basic pay of $${record.basicPay.toLocaleString()} (adjusted: $${adjustedPay.toLocaleString()} with locality), which falls outside the expected base range of $${range.min.toLocaleString()}-$${range.max.toLocaleString()} (with 10% tolerance). This may indicate an incorrect grade/step assignment or pay rate table error.`,
            'DoD FMR Vol 8, Ch 1; 5 U.S.C. § 5332: GS basic pay rates are established by law and adjusted annually.',
            'Verify the employee grade, step, and pay plan against the SF-50 and the published OPM pay tables for the applicable fiscal year. Correct any discrepancies and process retroactive adjustments.',
            Math.abs(record.basicPay - (record.basicPay > range.max ? range.max : range.min)),
            ['Civilian Pay - Basic Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-002',
    name: 'FEHB Contribution Validation',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies Federal Employees Health Benefits contributions are greater than zero for active employees',
    citation: 'DoD FMR Vol 8, Ch 4; 5 U.S.C. § 8906 - Contributions to FEHB',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const activeEmployees = data.dodData.civilianPayRecords.filter(r => r.status === 'active');
      const noFehb = activeEmployees.filter(r => r.fehbContribution <= 0);

      if (noFehb.length > 0 && activeEmployees.length > 0) {
        const pct = ((noFehb.length / activeEmployees.length) * 100).toFixed(1);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V08-002',
          'DOD_FMR',
          'medium',
          'Active Employees Without FEHB Contributions',
          `${noFehb.length} of ${activeEmployees.length} active employee(s) (${pct}%) have no FEHB contribution recorded. While FEHB enrollment is voluntary, a high percentage of employees without health insurance warrants review to ensure enrollment elections are properly recorded. Employees: ${noFehb.slice(0, 5).map(r => `${r.employeeId} (${r.payPlan}-${r.grade})`).join(', ')}${noFehb.length > 5 ? ` and ${noFehb.length - 5} more` : ''}.`,
          'DoD FMR Vol 8, Ch 4; 5 U.S.C. § 8906: FEHB contributions are shared between the government and the employee. Eligible employees may elect coverage during open enrollment or qualifying life events.',
          'Verify that employees without FEHB have elected to waive coverage. Ensure the payroll system accurately reflects enrollment elections. Check for processing errors during open enrollment.',
          null,
          noFehb.map(r => r.employeeId)
        ));
      }

      // Check for unreasonable FEHB amounts
      const minAnnualFEHB = 1000;
      const maxAnnualFEHB = 12000;

      for (const record of data.dodData.civilianPayRecords) {
        if (record.fehbContribution <= 0) continue;
        if (record.fehbContribution < minAnnualFEHB || record.fehbContribution > maxAnnualFEHB) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-002',
            'DOD_FMR',
            'medium',
            'FEHB Contribution Outside Expected Range',
            `Employee ${record.employeeId} has annual FEHB contribution of $${record.fehbContribution.toLocaleString()}, which is outside the typical range of $${minAnnualFEHB.toLocaleString()}-$${maxAnnualFEHB.toLocaleString()}. This may indicate an incorrect enrollment code or payroll processing issue.`,
            'DoD FMR Vol 8, Ch 4; 5 U.S.C. § 8906: FEHB premiums are established annually based on plan selection.',
            'Verify the employee FEHB enrollment code and plan type. Cross-reference with published OPM FEHB premium rates.',
            null,
            ['Civilian Pay - FEHB']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-003',
    name: 'FERS/CSRS Contribution Compliance',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies retirement contributions match expected plan rates for FERS, FERS-FRAE, and CSRS',
    citation: 'DoD FMR Vol 8, Ch 3; 5 U.S.C. § 8422 - FERS deductions and withholdings',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const fersRates: Record<string, number> = {
        'fers': 0.008,
        'fers_revised': 0.044,
        'csrs': 0.07,
      };

      for (const record of data.dodData.civilianPayRecords) {
        if (record.basicPay <= 0) continue;

        const expectedRate = fersRates[record.retirementPlan];
        if (!expectedRate) continue;

        const adjustedPay = record.basicPay + record.localityAdjustment;
        const expectedContribution = adjustedPay * expectedRate;
        const tolerance = adjustedPay * 0.01;

        if (Math.abs(record.retirementContribution - expectedContribution) > tolerance) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-003',
            'DOD_FMR',
            'high',
            `${record.retirementPlan.toUpperCase()} Contribution Rate Discrepancy`,
            `Employee ${record.employeeId} (${record.retirementPlan.toUpperCase()}) has retirement contribution of $${record.retirementContribution.toFixed(2)} but expected contribution at ${(expectedRate * 100).toFixed(1)}% of adjusted pay ($${adjustedPay.toLocaleString()}) is $${expectedContribution.toFixed(2)}. Difference: $${Math.abs(record.retirementContribution - expectedContribution).toFixed(2)}.`,
            'DoD FMR Vol 8, Ch 3; 5 U.S.C. § 8422: Employee deductions for FERS must conform to the statutory rate based on the applicable FERS category.',
            'Verify the employee retirement plan designation and applicable contribution rate. Cross-reference with the SF-50 and payroll system. Correct any under-withholding or over-withholding.',
            Math.abs(record.retirementContribution - expectedContribution),
            ['Civilian Pay - Retirement']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-004',
    name: 'TSP Match Compliance',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies TSP agency matching does not exceed 5% of basic pay for FERS employees',
    citation: 'DoD FMR Vol 8, Ch 3; 5 U.S.C. § 8432 - TSP contributions',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        if (record.retirementPlan === 'csrs') continue;

        const adjustedPay = record.basicPay + record.localityAdjustment;
        const maxMatch = adjustedPay * 0.05;

        if (record.tspMatchAmount > maxMatch) {
          const excess = record.tspMatchAmount - maxMatch;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-004',
            'DOD_FMR',
            'high',
            'TSP Agency Matching Exceeds 5% Limit',
            `Employee ${record.employeeId} (${record.retirementPlan.toUpperCase()}) has TSP agency matching of $${record.tspMatchAmount.toFixed(2)} which exceeds the 5% maximum of $${maxMatch.toFixed(2)} (adjusted pay: $${adjustedPay.toLocaleString()}). Excess: $${excess.toFixed(2)}. FERS employees are entitled to up to 5% agency match (1% automatic + up to 4% matching).`,
            'DoD FMR Vol 8, Ch 3; 5 U.S.C. § 8432(c): Agency matching contributions: 1% automatic plus dollar-for-dollar on first 3% and $0.50 per dollar on next 2% of basic pay.',
            'Verify the TSP matching formula computation. Correct the agency matching amount and recover the excess.',
            excess,
            ['Civilian Pay - TSP']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-005',
    name: 'Leave Accrual Validation',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies leave hours accrued match the service-year tier: 4 hrs (<3 yrs), 6 hrs (3-15 yrs), 8 hrs (15+ yrs)',
    citation: 'DoD FMR Vol 8, Ch 5; 5 U.S.C. § 6303 - Annual leave accrual',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        if (record.leaveHoursAccrued <= 0) continue;

        // Estimate years of service from step progression
        const estimatedYOS = record.step <= 3 ? record.step - 1 :
          record.step <= 6 ? 3 + (record.step - 3) * 2 :
          record.step <= 9 ? 9 + (record.step - 6) * 3 : 18;

        let expectedAnnualHours: number;
        let category: string;

        if (estimatedYOS < 3) {
          expectedAnnualHours = 104; // 4 hrs/pay period x 26
          category = 'less than 3 years';
        } else if (estimatedYOS < 15) {
          expectedAnnualHours = 160; // 6 hrs/pay period x 26
          category = '3 to 15 years';
        } else {
          expectedAnnualHours = 208; // 8 hrs/pay period x 26
          category = '15 or more years';
        }

        const tolerance = 40;

        if (Math.abs(record.leaveHoursAccrued - expectedAnnualHours) > tolerance) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-005',
            'DOD_FMR',
            'medium',
            'Leave Accrual Rate May Be Incorrect',
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}, Step ${record.step}, est. ${estimatedYOS} years service) accrued ${record.leaveHoursAccrued} hours. Expected for the "${category}" tier: ${expectedAnnualHours} hours/year. Difference of ${Math.abs(record.leaveHoursAccrued - expectedAnnualHours)} hours exceeds the ${tolerance}-hour tolerance.`,
            'DoD FMR Vol 8, Ch 5; 5 U.S.C. § 6303: Full-time employees accrue annual leave at 4, 6, or 8 hours per pay period based on creditable service.',
            'Verify the employee service computation date (SCD) for leave purposes. Confirm the correct accrual category and adjust the SCD if creditable service was not properly calculated.',
            null,
            ['Civilian Pay - Leave']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-006',
    name: 'Premium Pay Cap',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies that premium pay plus overtime pay combined with basic pay do not exceed the GS-15 Step 10 cap',
    citation: 'DoD FMR Vol 8, Ch 6; 5 U.S.C. § 5547 - Limitation on premium pay',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const gs15Step10WithLocality = 195000;

      for (const record of data.dodData.civilianPayRecords) {
        if (record.premiumPay <= 0 && record.overtimePay <= 0) continue;

        const totalWithPremium = record.basicPay + record.localityAdjustment + record.premiumPay + record.overtimePay;

        if (totalWithPremium > gs15Step10WithLocality) {
          const excess = totalWithPremium - gs15Step10WithLocality;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-006',
            'DOD_FMR',
            'high',
            'Premium Pay Cap Exceeded',
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}) has combined basic pay ($${record.basicPay.toLocaleString()}), locality ($${record.localityAdjustment.toLocaleString()}), premium pay ($${record.premiumPay.toLocaleString()}), and overtime ($${record.overtimePay.toLocaleString()}) totaling $${totalWithPremium.toLocaleString()}, which exceeds the estimated GS-15 Step 10 cap of $${gs15Step10WithLocality.toLocaleString()} by $${excess.toLocaleString()}.`,
            'DoD FMR Vol 8, Ch 6; 5 U.S.C. § 5547(a): Premium pay may not cause aggregate compensation to exceed the GS-15 Step 10 rate for the locality.',
            'Verify the premium pay cap for the employee duty station. Determine if an emergency or mission-critical waiver under 5 U.S.C. § 5547(b) has been authorized. If no waiver, reduce premium pay to the cap and recover overpayment.',
            excess,
            ['Civilian Pay - Premium Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-007',
    name: 'Pay Record Completeness',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies that required fields in civilian pay records are populated for audit trail integrity',
    citation: 'DoD FMR Vol 8, Ch 1 - Civilian Pay Record Requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const incomplete = data.dodData.civilianPayRecords.filter(r =>
        !r.employeeId || !r.payPlan || !r.grade || !r.payPeriod || !r.status
      );

      if (incomplete.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V08-007',
          'DOD_FMR',
          'medium',
          'Incomplete Civilian Pay Records',
          `${incomplete.length} civilian pay record(s) are missing required fields (employee ID, pay plan, grade, pay period, or status). Incomplete records cannot be properly validated for pay entitlement accuracy and do not support audit requirements.`,
          'DoD FMR Vol 8, Ch 1: Civilian pay records must contain all required fields for proper pay computation and audit purposes.',
          'Review and complete all missing fields. Implement system edits to prevent creation of records with missing required data.',
          null,
          incomplete.map(r => r.employeeId || r.id)
        ));
      }

      // Check for invalid step values
      const invalidSteps = data.dodData.civilianPayRecords.filter(r =>
        r.payPlan === 'GS' && (r.step < 1 || r.step > 10)
      );

      if (invalidSteps.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V08-007',
          'DOD_FMR',
          'high',
          'Invalid GS Step Values',
          `${invalidSteps.length} GS employee record(s) have step values outside the valid range of 1-10: ${invalidSteps.map(r => `${r.employeeId} (GS-${r.grade}, step ${r.step})`).join(', ')}. This indicates a data integrity issue.`,
          'DoD FMR Vol 8, Ch 2; 5 U.S.C. § 5332: The General Schedule consists of grades GS-1 through GS-15, each with steps 1-10.',
          'Correct the step values against the most recent SF-50 for each affected employee.',
          null,
          invalidSteps.map(r => r.employeeId)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-008',
    name: 'Overtime Authorization',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Flags employees with high overtime amounts that warrant review of authorization and necessity',
    citation: 'DoD FMR Vol 8, Ch 6; 5 U.S.C. § 5542 - Overtime rates of pay',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        if (record.overtimePay <= 0 || record.basicPay <= 0) continue;

        const overtimeRatio = record.overtimePay / record.basicPay;
        if (overtimeRatio > 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-008',
            'DOD_FMR',
            'medium',
            'Excessive Overtime Pay Relative to Basic Pay',
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}) has overtime pay of $${record.overtimePay.toLocaleString()} which is ${(overtimeRatio * 100).toFixed(1)}% of basic pay ($${record.basicPay.toLocaleString()}). Overtime exceeding 25% of basic pay indicates potentially unsustainable workload or inadequate staffing. Verify all overtime is properly authorized.`,
            'DoD FMR Vol 8, Ch 6; 5 U.S.C. § 5542: Overtime must be officially ordered or approved and compensated at the applicable rate.',
            'Review overtime authorization records. Verify overtime was ordered or approved in advance. Evaluate whether the overtime level is operationally justified.',
            null,
            ['Civilian Pay - Overtime']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-009',
    name: 'Locality Pay Validation',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies that locality pay code is populated and adjustment is within expected ranges for GS employees',
    citation: 'DoD FMR Vol 8, Ch 2; 5 U.S.C. § 5304 - Locality-based comparability payments',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.civilianPayRecords) {
        // GS employees in the US are entitled to locality pay
        if (record.payPlan === 'GS' && record.localityAdjustment <= 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-009',
            'DOD_FMR',
            'medium',
            'Missing Locality Pay for GS Employee',
            `Employee ${record.employeeId} (GS-${record.grade}, Step ${record.step}, locality: "${record.locality}") has no locality pay adjustment. All GS employees within the United States are entitled to locality pay per 5 U.S.C. § 5304.`,
            'DoD FMR Vol 8, Ch 2; 5 U.S.C. § 5304: Locality pay is applicable to all GS employees in the United States.',
            'Verify the employee duty station. If stationed within the US, apply the correct locality pay. If overseas and legitimately exempt, document the basis.',
            null,
            ['Civilian Pay - Locality Pay']
          ));
          continue;
        }

        if (record.basicPay <= 0 || record.localityAdjustment <= 0) continue;

        const localityPct = record.localityAdjustment / record.basicPay;

        // Locality pay typically ranges from ~16% (Rest of US) to ~43% (San Francisco)
        if (localityPct < 0.10 || localityPct > 0.50) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V08-009',
            'DOD_FMR',
            'medium',
            'Locality Pay Adjustment Outside Expected Range',
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}, locality: ${record.locality}) has a locality adjustment of $${record.localityAdjustment.toLocaleString()} (${(localityPct * 100).toFixed(1)}% of basic pay). Typical locality rates range from 16% to 43%. A rate of ${(localityPct * 100).toFixed(1)}% is outside normal parameters.`,
            'DoD FMR Vol 8, Ch 2; 5 U.S.C. § 5304: Locality-based comparability payments are computed as a percentage of basic pay based on duty station.',
            'Verify the employee duty station and applicable locality pay area. Cross-reference against OPM locality pay tables.',
            null,
            ['Civilian Pay - Locality Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V08-010',
    name: 'Total Compensation Accuracy',
    framework: 'DOD_FMR',
    category: 'Civilian Pay (Vol 8)',
    description: 'Verifies that totalCompensation equals the sum of basic pay, locality, premium, and overtime components',
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
            'DOD-FMR-V08-010',
            'DOD_FMR',
            'high',
            'Civilian Total Compensation Reconciliation Variance',
            `Employee ${record.employeeId} (${record.payPlan}-${record.grade}) has reported total compensation of $${record.totalCompensation.toLocaleString()} but the sum of basic pay ($${record.basicPay.toLocaleString()}), locality ($${record.localityAdjustment.toLocaleString()}), premium ($${record.premiumPay.toLocaleString()}), and overtime ($${record.overtimePay.toLocaleString()}) equals $${computedTotal.toLocaleString()}, a difference of $${difference.toFixed(2)}. This exceeds the ${(tolerancePct * 100)}% tolerance and must be reconciled.`,
            'DoD FMR Vol 8, Ch 1: Total compensation must be reconcilable to individual pay components to support audit readiness.',
            'Reconcile total compensation to all individual pay elements including awards, bonuses, allowances, and deductions. Identify and document the source of any unreconciled differences.',
            difference,
            ['Civilian Pay - Total Compensation']
          ));
        }
      }

      return findings;
    },
  },
];
