import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const militaryPayRules: AuditRule[] = [
  {
    id: 'DOD-MILPAY-001',
    name: 'Basic Pay Rate Validation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Validates that basic pay matches expected rates for the service member pay grade and years of service',
    citation: 'DoD FMR Vol 7A, Ch 1; 37 U.S.C. \u00A7 203 - Rates of basic pay',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Approximate annual basic pay ceilings by grade category for reasonableness checks
      // These represent general upper bounds; actual rates vary by fiscal year
      const gradeMaxBasicPay: Record<string, number> = {
        'E-1': 28000, 'E-2': 30000, 'E-3': 34000, 'E-4': 40000,
        'E-5': 46000, 'E-6': 52000, 'E-7': 60000, 'E-8': 70000, 'E-9': 80000,
        'O-1': 52000, 'O-2': 62000, 'O-3': 82000, 'O-4': 100000,
        'O-5': 120000, 'O-6': 140000, 'O-7': 180000, 'O-8': 200000,
        'O-9': 210000, 'O-10': 220000,
        'W-1': 55000, 'W-2': 65000, 'W-3': 80000, 'W-4': 95000, 'W-5': 110000,
      };

      for (const record of data.dodData.militaryPayRecords) {
        const maxPay = gradeMaxBasicPay[record.payGrade];
        if (maxPay && record.basicPay > maxPay) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-001',
            'DOD_FMR',
            'high',
            `Basic Pay Exceeds Expected Rate for ${record.payGrade}`,
            `Member ${record.memberId} at pay grade ${record.payGrade} with ${record.yearsOfService} years of service has basic pay of $${record.basicPay.toLocaleString()} which exceeds the expected maximum of $${maxPay.toLocaleString()} for FY${record.fiscalYear}. This may indicate an incorrect pay grade assignment, erroneous rate table application, or data entry error.`,
            'DoD FMR Vol 7A, Ch 1, Sec 0102; 37 U.S.C. \u00A7 203 - Rates of basic pay shall conform to the pay tables published annually.',
            'Verify the member pay grade and years of service against personnel records. Cross-reference the basic pay amount with the published military pay tables for the applicable fiscal year. Correct any discrepancies and recoup overpayments if confirmed.',
            record.basicPay - maxPay,
            ['Military Pay - Basic Pay']
          ));
        }

        if (record.basicPay <= 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-001',
            'DOD_FMR',
            'critical',
            `Missing or Zero Basic Pay for ${record.payGrade}`,
            `Member ${record.memberId} at pay grade ${record.payGrade} has basic pay of $${record.basicPay.toFixed(2)}, which is invalid. All active duty service members are entitled to basic pay per 37 U.S.C. \u00A7 203.`,
            'DoD FMR Vol 7A, Ch 1, Sec 0102; 37 U.S.C. \u00A7 203',
            'Investigate the pay record immediately. Verify the member active duty status and ensure correct basic pay is computed and disbursed. File a corrective pay action if warranted.',
            null,
            ['Military Pay - Basic Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-002',
    name: 'BAH Rate Verification',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Verifies Basic Allowance for Housing is properly assigned for non-barracks personnel',
    citation: 'DoD FMR Vol 7A, Ch 26; 37 U.S.C. \u00A7 403 - Basic allowance for housing',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        // Members at E-4 with 4+ years, and all E-5+ and officers are generally
        // entitled to BAH unless residing in government quarters
        const isLikelyEntitled =
          record.payGrade.startsWith('O-') ||
          record.payGrade.startsWith('W-') ||
          (record.payGrade === 'E-4' && record.yearsOfService >= 4) ||
          (['E-5', 'E-6', 'E-7', 'E-8', 'E-9'].includes(record.payGrade));

        if (isLikelyEntitled && record.bah <= 0 && record.status === 'active') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-002',
            'DOD_FMR',
            'medium',
            `BAH Not Paid for Eligible Member ${record.payGrade}`,
            `Member ${record.memberId} at pay grade ${record.payGrade} with ${record.yearsOfService} years of service has $0 BAH. Unless the member is assigned to government quarters, BAH should be authorized per 37 U.S.C. \u00A7 403. Verify housing assignment status.`,
            'DoD FMR Vol 7A, Ch 26; 37 U.S.C. \u00A7 403 - Members entitled to basic pay are entitled to BAH based on grade, dependency status, and duty station.',
            'Confirm whether the member is residing in government quarters or barracks. If the member is entitled to BAH, initiate a corrective pay action and compute any back pay owed.',
            null,
            ['Military Pay - BAH']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-003',
    name: 'BAS Rate Verification',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Verifies Basic Allowance for Subsistence matches expected enlisted or officer rate',
    citation: 'DoD FMR Vol 7A, Ch 25; 37 U.S.C. \u00A7 402 - Basic allowance for subsistence',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Approximate monthly BAS rates (these change annually)
      const enlistedBAS = 452.56;
      const officerBAS = 311.68;
      const tolerance = 50; // Allow for fiscal year rate variations

      for (const record of data.dodData.militaryPayRecords) {
        if (record.status !== 'active' || record.bas <= 0) continue;

        const isOfficer = record.payGrade.startsWith('O-') || record.payGrade.startsWith('W-');
        const expectedBAS = isOfficer ? officerBAS : enlistedBAS;

        if (Math.abs(record.bas - expectedBAS) > tolerance) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-003',
            'DOD_FMR',
            'medium',
            `BAS Rate Mismatch for ${isOfficer ? 'Officer' : 'Enlisted'} Member`,
            `Member ${record.memberId} (${record.payGrade}) receives BAS of $${record.bas.toFixed(2)}/month, which deviates from the expected ${isOfficer ? 'officer' : 'enlisted'} rate of ~$${expectedBAS.toFixed(2)}/month by more than $${tolerance}. BAS is a flat rate that should not vary within the same fiscal year for the same category.`,
            'DoD FMR Vol 7A, Ch 25, Sec 2501; 37 U.S.C. \u00A7 402 - BAS is paid at a flat rate established annually for enlisted members and officers.',
            'Verify the BAS rate against the published rate table for the applicable fiscal year. Correct the rate if erroneous and process any resulting underpayment or overpayment.',
            Math.abs(record.bas - expectedBAS),
            ['Military Pay - BAS']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-004',
    name: 'TSP Matching Limit Compliance',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Ensures TSP agency matching contributions do not exceed the 5% of basic pay statutory limit',
    citation: 'DoD FMR Vol 7A, Ch 62; 5 U.S.C. \u00A7 8432 - TSP contributions and matching',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        const maxMatch = record.basicPay * 0.05;
        if (record.tspMatchAmount > maxMatch) {
          const excess = record.tspMatchAmount - maxMatch;
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-004',
            'DOD_FMR',
            'high',
            `TSP Matching Exceeds 5% Limit for ${record.payGrade}`,
            `Member ${record.memberId} has TSP matching of $${record.tspMatchAmount.toFixed(2)} which exceeds the 5% of basic pay limit ($${maxMatch.toFixed(2)}). Excess amount: $${excess.toFixed(2)}. The government matching contribution is capped at 5% of basic pay under BRS.`,
            'DoD FMR Vol 7A, Ch 62; 5 U.S.C. \u00A7 8432(c)(2) - Agency automatic and matching contributions shall not exceed 5% of basic pay.',
            'Verify the TSP matching calculation. If the match exceeds 5%, adjust the contribution and recover the excess amount. Ensure the payroll system is correctly applying the BRS matching formula.',
            excess,
            ['Military Pay - TSP']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-005',
    name: 'Combat Zone Tax Exclusion Eligibility',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Flags combat zone tax exclusion applied without supporting documentation or authorization',
    citation: 'DoD FMR Vol 7A, Ch 44; 26 U.S.C. \u00A7 112 - Certain combat zone compensation of members of the Armed Forces',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (record.combatZoneExclusion && !record.specialPaysJson) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-005',
            'DOD_FMR',
            'high',
            `Combat Zone Tax Exclusion Without Supporting Documentation`,
            `Member ${record.memberId} (${record.payGrade}) has combat zone tax exclusion flagged but no supporting special pays documentation is present. CZTE eligibility requires deployment orders to a designated combat zone, qualified hazardous duty area, or direct support area as certified by the DoD.`,
            'DoD FMR Vol 7A, Ch 44; 26 U.S.C. \u00A7 112 - Military compensation earned while serving in a combat zone is excluded from gross income.',
            'Obtain and review deployment orders, hostile fire/imminent danger pay authorization, and combat zone certification. If the member was not deployed to a designated combat zone during the pay period, remove the exclusion and recalculate tax withholding.',
            null,
            ['Military Pay - CZTE']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-006',
    name: 'Separation Pay Computation Verification',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Validates separation pay computations for involuntarily separated members',
    citation: 'DoD FMR Vol 7A, Ch 35; 10 U.S.C. \u00A7 1174 - Separation pay upon involuntary discharge or release',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (record.separationPay <= 0) continue;

        // Full separation pay = 10% x yearsOfService x 12 x monthly basic pay
        // Half separation pay = 5% x yearsOfService x 12 x monthly basic pay
        const monthlyBasicPay = record.basicPay / 12;
        const fullSepPay = 0.10 * record.yearsOfService * 12 * monthlyBasicPay;
        const halfSepPay = fullSepPay / 2;

        // Check if the separation pay is within a reasonable range
        if (record.separationPay > fullSepPay * 1.05) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-006',
            'DOD_FMR',
            'high',
            `Separation Pay Exceeds Computed Maximum`,
            `Member ${record.memberId} (${record.payGrade}, ${record.yearsOfService} YOS) received separation pay of $${record.separationPay.toLocaleString()} which exceeds the computed full separation pay of $${fullSepPay.toFixed(2)}. Full separation pay is calculated as 10% x years of service x 12 x monthly basic pay.`,
            'DoD FMR Vol 7A, Ch 35; 10 U.S.C. \u00A7 1174 - Separation pay shall not exceed the amount computed under the statutory formula.',
            'Recalculate separation pay using the correct basic pay rate, years of service, and full or half rate determination. Verify eligibility criteria and recoup any overpayment.',
            record.separationPay - fullSepPay,
            ['Military Pay - Separation Pay']
          ));
        }

        // Members need at least 6 years of service for separation pay
        if (record.yearsOfService < 6) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-006',
            'DOD_FMR',
            'high',
            `Separation Pay Issued to Ineligible Member`,
            `Member ${record.memberId} (${record.payGrade}) received separation pay of $${record.separationPay.toLocaleString()} with only ${record.yearsOfService} years of service. Separation pay generally requires a minimum of 6 years of active service under 10 U.S.C. \u00A7 1174.`,
            'DoD FMR Vol 7A, Ch 35; 10 U.S.C. \u00A7 1174(a) - Eligibility for separation pay requires at least 6 years of active service.',
            'Verify the member eligibility for separation pay including total active service computation. If ineligible, initiate recoupment procedures.',
            record.separationPay,
            ['Military Pay - Separation Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-007',
    name: 'Retirement Pay Computation Verification',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Validates retirement pay computations based on applicable retirement system',
    citation: 'DoD FMR Vol 7B, Ch 1; 10 U.S.C. \u00A7 1401 - Computation of retired pay',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (record.retirementPay <= 0) continue;

        // Under the High-3 system: 2.5% x years of service x average of highest 36 months basic pay
        // Maximum multiplier is 75% (30 years)
        const multiplier = Math.min(record.yearsOfService * 0.025, 0.75);
        const expectedRetirementPay = multiplier * record.basicPay;

        if (record.retirementPay > expectedRetirementPay * 1.10) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-007',
            'DOD_FMR',
            'high',
            `Retirement Pay Exceeds Expected Amount`,
            `Member ${record.memberId} (${record.payGrade}, ${record.yearsOfService} YOS) has retirement pay of $${record.retirementPay.toLocaleString()} which exceeds the estimated High-3 computation of $${expectedRetirementPay.toFixed(2)} (${(multiplier * 100).toFixed(1)}% multiplier) by more than 10%. This discrepancy may indicate incorrect years of service credit, pay grade, or multiplier application.`,
            'DoD FMR Vol 7B, Ch 1; 10 U.S.C. \u00A7 1401 - Retired pay is computed based on years of creditable service and the applicable pay base.',
            'Verify the retirement system applicable to the member (Final Pay, High-3, Redux, or BRS). Validate years of creditable service, retired pay base, and any COLA adjustments. Reconcile to the retirement pay order.',
            record.retirementPay - expectedRetirementPay,
            ['Military Pay - Retirement Pay']
          ));
        }

        // Members generally need 20 years for non-disability retirement
        if (record.yearsOfService < 20) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-007',
            'DOD_FMR',
            'medium',
            `Retirement Pay for Member with Less Than 20 Years`,
            `Member ${record.memberId} (${record.payGrade}) is receiving retirement pay of $${record.retirementPay.toLocaleString()} with only ${record.yearsOfService} years of service. Standard non-disability military retirement requires 20 years of active service. Verify if this is a medical/disability retirement or Temporary Early Retirement Authority (TERA).`,
            'DoD FMR Vol 7B, Ch 1; 10 U.S.C. \u00A7 3911/8911 - Retirement eligibility generally requires 20 years of active service.',
            'Confirm the basis for retirement (standard, medical/disability, or TERA). Verify the computation method used and ensure proper documentation of the retirement authorization.',
            null,
            ['Military Pay - Retirement Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-008',
    name: 'Total Compensation Reconciliation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Ensures the sum of all pay components reconciles to the reported total compensation',
    citation: 'DoD FMR Vol 7A, Ch 1; 37 U.S.C. \u00A7 101 - Definitions relating to military pay',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        const computedTotal =
          record.basicPay +
          record.bah +
          record.bas +
          record.separationPay +
          record.retirementPay;

        const difference = Math.abs(record.totalCompensation - computedTotal);
        const tolerancePct = 0.02;

        if (difference > Math.max(record.totalCompensation * tolerancePct, 100)) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-008',
            'DOD_FMR',
            'high',
            `Total Compensation Reconciliation Variance`,
            `Member ${record.memberId} (${record.payGrade}) has reported total compensation of $${record.totalCompensation.toLocaleString()} but the sum of tracked components (basic pay + BAH + BAS + separation + retirement) equals $${computedTotal.toLocaleString()}, a difference of $${difference.toFixed(2)}. While special/incentive pays may account for some variance, the gap exceeds the ${(tolerancePct * 100)}% tolerance threshold and requires reconciliation.`,
            'DoD FMR Vol 7A, Ch 1 - Total compensation must be fully reconcilable to its individual components for audit trail purposes.',
            'Reconcile total compensation to all individual pay components including special pays, incentive pays, bonuses, and deductions. Identify and document any unreconciled differences. Verify that all pay entitlements are properly authorized and recorded.',
            difference,
            ['Military Pay - Total Compensation']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-009',
    name: 'Pay Grade Progression Validation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Checks for inconsistencies between years of service and pay grade that may indicate data errors',
    citation: 'DoD FMR Vol 7A, Ch 1; 10 U.S.C. \u00A7 741 - Rank and precedence of officers',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Minimum typical years of service for senior grades
      const minYOSForGrade: Record<string, number> = {
        'E-7': 8, 'E-8': 12, 'E-9': 16,
        'O-4': 8, 'O-5': 14, 'O-6': 18, 'O-7': 22, 'O-8': 26,
        'W-3': 8, 'W-4': 14, 'W-5': 22,
      };

      for (const record of data.dodData.militaryPayRecords) {
        const minYOS = minYOSForGrade[record.payGrade];
        if (minYOS && record.yearsOfService < minYOS - 2) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-009',
            'DOD_FMR',
            'medium',
            `Pay Grade / Years of Service Inconsistency`,
            `Member ${record.memberId} at pay grade ${record.payGrade} has only ${record.yearsOfService} years of service, which is below the typical minimum of ${minYOS} years for that grade. This may indicate a data entry error in years of service or pay grade, or an exceptional promotion that should be documented.`,
            'DoD FMR Vol 7A, Ch 1; 10 U.S.C. \u00A7 741 - Rank and grade assignments must be consistent with statutory and regulatory requirements.',
            'Verify the member pay grade and years of service against official personnel records (DD-214, promotion orders). If the data is correct, document the basis for the accelerated promotion or reduced time-in-service.',
            null,
            ['Military Pay - Pay Grade']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-010',
    name: 'Special Pays Documentation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Verifies that special pay entitlements have supporting documentation',
    citation: 'DoD FMR Vol 7A, Ch 5-17; 37 U.S.C. \u00A7 301-374 - Special and incentive pays',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (!record.specialPaysJson) continue;

        let specialPays: Record<string, unknown>;
        try {
          specialPays = JSON.parse(record.specialPaysJson);
        } catch {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-010',
            'DOD_FMR',
            'high',
            `Invalid Special Pays Data Format`,
            `Member ${record.memberId} (${record.payGrade}) has malformed special pays data that cannot be parsed. Special pay entitlements cannot be validated without properly structured data.`,
            'DoD FMR Vol 7A, Ch 5-17 - All special pay entitlements must be properly documented and recorded.',
            'Correct the special pays data format in the pay record. Verify each special pay entitlement against authorization documents and re-enter the data correctly.',
            null,
            ['Military Pay - Special Pays']
          ));
          continue;
        }

        const payEntries = Object.entries(specialPays);
        if (payEntries.length > 5) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-010',
            'DOD_FMR',
            'medium',
            `Excessive Number of Special Pays`,
            `Member ${record.memberId} (${record.payGrade}) has ${payEntries.length} distinct special pay entitlements recorded. While not inherently improper, a high number of concurrent special pays warrants review to ensure each is properly authorized and that no duplications exist.`,
            'DoD FMR Vol 7A, Ch 5-17; 37 U.S.C. \u00A7 301-374 - Each special pay entitlement must be individually authorized and documented.',
            'Review the authorization documentation for each special pay. Verify that concurrent receipt rules are properly applied and that no special pays are duplicated or mutually exclusive.',
            null,
            ['Military Pay - Special Pays']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-011',
    name: 'Incentive Pays Authorization',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Validates that incentive pay entitlements are properly authorized and within statutory limits',
    citation: 'DoD FMR Vol 7A, Ch 5; 37 U.S.C. \u00A7 301a - Incentive pay: hazardous duty',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (!record.incentivePaysJson) continue;

        let incentivePays: Record<string, unknown>;
        try {
          incentivePays = JSON.parse(record.incentivePaysJson);
        } catch {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-011',
            'DOD_FMR',
            'high',
            `Invalid Incentive Pays Data Format`,
            `Member ${record.memberId} (${record.payGrade}) has malformed incentive pays data that cannot be parsed. Incentive pay entitlements cannot be validated.`,
            'DoD FMR Vol 7A, Ch 5; 37 U.S.C. \u00A7 301a - All incentive pay entitlements must be properly documented.',
            'Correct the incentive pays data format. Verify each incentive pay against authorization orders and re-enter data in the proper format.',
            null,
            ['Military Pay - Incentive Pays']
          ));
          continue;
        }

        // Sum total incentive pay values and flag if they seem disproportionate to basic pay
        let totalIncentivePay = 0;
        for (const value of Object.values(incentivePays)) {
          if (typeof value === 'number') {
            totalIncentivePay += value;
          }
        }

        if (totalIncentivePay > record.basicPay * 0.50) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-011',
            'DOD_FMR',
            'medium',
            `Incentive Pays Exceed 50% of Basic Pay`,
            `Member ${record.memberId} (${record.payGrade}) has total incentive pays of $${totalIncentivePay.toLocaleString()} which exceeds 50% of basic pay ($${record.basicPay.toLocaleString()}). While certain combinations of hazardous duty, flight, and professional pays can be substantial, this level warrants review of all authorization documents.`,
            'DoD FMR Vol 7A, Ch 5; 37 U.S.C. \u00A7 301a - Incentive pays are subject to statutory caps and must be individually authorized.',
            'Review all incentive pay authorizations. Verify flight orders, hazardous duty orders, proficiency pay designations, and any other incentive pay source documents. Ensure concurrent receipt rules are properly applied.',
            totalIncentivePay,
            ['Military Pay - Incentive Pays']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-MILPAY-012',
    name: 'Overpayment Detection',
    framework: 'DOD_FMR',
    category: 'Military Pay (Volume 7)',
    description: 'Detects total compensation that exceeds the expected maximum for the pay grade and years of service',
    citation: 'DoD FMR Vol 7A, Ch 1; 37 U.S.C. \u00A7 1007 - Deductions from pay',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Approximate maximum total annual compensation by grade category
      // Includes basic pay, BAH, BAS, and typical maximum special/incentive pays
      const gradeMaxTotalComp: Record<string, number> = {
        'E-1': 45000, 'E-2': 50000, 'E-3': 55000, 'E-4': 65000,
        'E-5': 80000, 'E-6': 95000, 'E-7': 115000, 'E-8': 130000, 'E-9': 150000,
        'O-1': 90000, 'O-2': 110000, 'O-3': 140000, 'O-4': 175000,
        'O-5': 210000, 'O-6': 250000, 'O-7': 310000, 'O-8': 350000,
        'O-9': 370000, 'O-10': 400000,
        'W-1': 90000, 'W-2': 110000, 'W-3': 135000, 'W-4': 165000, 'W-5': 190000,
      };

      for (const record of data.dodData.militaryPayRecords) {
        const maxComp = gradeMaxTotalComp[record.payGrade];
        if (maxComp && record.totalCompensation > maxComp) {
          const excess = record.totalCompensation - maxComp;
          findings.push(createFinding(
            data.engagementId,
            'DOD-MILPAY-012',
            'DOD_FMR',
            'critical',
            `Potential Overpayment Detected for ${record.payGrade}`,
            `Member ${record.memberId} (${record.payGrade}, ${record.yearsOfService} YOS) has total compensation of $${record.totalCompensation.toLocaleString()} which exceeds the expected maximum of $${maxComp.toLocaleString()} for that grade by $${excess.toLocaleString()}. This may indicate overpayment due to incorrect entitlement computation, system error, or fraudulent pay activity.`,
            'DoD FMR Vol 7A, Ch 1; 37 U.S.C. \u00A7 1007 - When an overpayment is detected, collection action must be initiated.',
            'Immediately investigate the pay record for errors. Verify all entitlements against authorization documents. If overpayment is confirmed, initiate collection procedures per DoD FMR Vol 7A, Ch 50 and notify the member. Document the root cause for corrective action.',
            excess,
            ['Military Pay - Total Compensation']
          ));
        }
      }

      return findings;
    },
  },
];
