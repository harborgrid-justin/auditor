import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const militaryPayRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V07-001',
    name: 'Basic Pay Compliance',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies basic pay amounts against expected ranges by pay grade and years of service',
    citation: 'DoD FMR Vol 7A, Ch 1; 37 U.S.C. § 203 - Rates of basic pay',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

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
            'DOD-FMR-V07-001',
            'DOD_FMR',
            'high',
            `Basic Pay Exceeds Expected Rate for ${record.payGrade}`,
            `Member ${record.memberId} at pay grade ${record.payGrade} with ${record.yearsOfService} years of service has basic pay of $${record.basicPay.toLocaleString()} which exceeds the expected maximum of $${maxPay.toLocaleString()} for FY${record.fiscalYear}. This may indicate an incorrect pay grade assignment, erroneous rate table, or data entry error.`,
            'DoD FMR Vol 7A, Ch 1, Sec 0102; 37 U.S.C. § 203: Rates of basic pay shall conform to the pay tables published annually.',
            'Verify the member pay grade and years of service against personnel records. Cross-reference the basic pay amount with the published military pay tables for the applicable fiscal year. Correct any discrepancies and recoup overpayments if confirmed.',
            record.basicPay - maxPay,
            ['Military Pay - Basic Pay']
          ));
        }

        if (record.basicPay <= 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-001',
            'DOD_FMR',
            'critical',
            `Missing or Zero Basic Pay for ${record.payGrade}`,
            `Member ${record.memberId} at pay grade ${record.payGrade} has basic pay of $${record.basicPay.toFixed(2)}, which is invalid. All active duty service members are entitled to basic pay per 37 U.S.C. § 203.`,
            'DoD FMR Vol 7A, Ch 1, Sec 0102; 37 U.S.C. § 203',
            'Investigate the pay record immediately. Verify the member active duty status and ensure correct basic pay is computed and disbursed.',
            null,
            ['Military Pay - Basic Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-002',
    name: 'BAH Rate Validation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies Basic Allowance for Housing amounts are reasonable and paid when expected',
    citation: 'DoD FMR Vol 7A, Ch 26; 37 U.S.C. § 403 - Basic allowance for housing',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        const isLikelyEntitled =
          record.payGrade.startsWith('O-') ||
          record.payGrade.startsWith('W-') ||
          (record.payGrade === 'E-4' && record.yearsOfService >= 4) ||
          ['E-5', 'E-6', 'E-7', 'E-8', 'E-9'].includes(record.payGrade);

        if (isLikelyEntitled && record.bah <= 0 && record.status === 'active') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-002',
            'DOD_FMR',
            'medium',
            `BAH Not Paid for Eligible Member ${record.payGrade}`,
            `Member ${record.memberId} at pay grade ${record.payGrade} with ${record.yearsOfService} years of service has $0 BAH. Unless assigned to government quarters, BAH should be authorized per 37 U.S.C. § 403.`,
            'DoD FMR Vol 7A, Ch 26; 37 U.S.C. § 403: Members entitled to basic pay are entitled to BAH based on grade, dependency status, and duty station.',
            'Confirm whether the member is residing in government quarters or barracks. If entitled to BAH, initiate a corrective pay action and compute any back pay owed.',
            null,
            ['Military Pay - BAH']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-003',
    name: 'BAS Rate Validation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies Basic Allowance for Subsistence matches expected enlisted or officer rates',
    citation: 'DoD FMR Vol 7A, Ch 25; 37 U.S.C. § 402 - Basic allowance for subsistence',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const enlistedBAS = 452.56;
      const officerBAS = 311.68;
      const tolerance = 50;

      for (const record of data.dodData.militaryPayRecords) {
        if (record.status !== 'active' || record.bas <= 0) continue;

        const isOfficer = record.payGrade.startsWith('O-') || record.payGrade.startsWith('W-');
        const expectedBAS = isOfficer ? officerBAS : enlistedBAS;

        if (Math.abs(record.bas - expectedBAS) > tolerance) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-003',
            'DOD_FMR',
            'medium',
            `BAS Rate Mismatch for ${isOfficer ? 'Officer' : 'Enlisted'} Member`,
            `Member ${record.memberId} (${record.payGrade}) receives BAS of $${record.bas.toFixed(2)}/month, which deviates from the expected ${isOfficer ? 'officer' : 'enlisted'} rate of ~$${expectedBAS.toFixed(2)}/month by more than $${tolerance}. BAS is a flat rate that should not vary within the same fiscal year for the same category.`,
            'DoD FMR Vol 7A, Ch 25, Sec 2501; 37 U.S.C. § 402: BAS is paid at a flat rate established annually for enlisted members and officers.',
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
    id: 'DOD-FMR-V07-004',
    name: 'Combat Zone Tax Exclusion',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies combat zone tax exclusion is properly applied with supporting documentation',
    citation: 'DoD FMR Vol 7A, Ch 44; 26 U.S.C. § 112 - Certain combat zone compensation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (record.combatZoneExclusion && !record.specialPaysJson) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-004',
            'DOD_FMR',
            'high',
            'Combat Zone Tax Exclusion Without Supporting Documentation',
            `Member ${record.memberId} (${record.payGrade}) has combat zone tax exclusion flagged but no supporting special pays documentation is present. CZTE eligibility requires deployment orders to a designated combat zone, qualified hazardous duty area, or direct support area.`,
            'DoD FMR Vol 7A, Ch 44; 26 U.S.C. § 112: Military compensation earned while serving in a combat zone is excluded from gross income.',
            'Obtain and review deployment orders, hostile fire/imminent danger pay authorization, and combat zone certification. If not deployed to a designated combat zone during the pay period, remove the exclusion and recalculate tax withholding.',
            null,
            ['Military Pay - CZTE']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-005',
    name: 'TSP Contribution Compliance',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies TSP contributions do not exceed IRS annual limits and TSP match does not exceed 5% of basic pay',
    citation: 'DoD FMR Vol 7A, Ch 62; 5 U.S.C. § 8432 - TSP contributions and matching',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const annualTspLimit = 23000; // IRS elective deferral limit (approximate)

      for (const record of data.dodData.militaryPayRecords) {
        // Check match limit (5% of basic pay)
        const maxMatch = record.basicPay * 0.05;
        if (record.tspMatchAmount > maxMatch) {
          const excess = record.tspMatchAmount - maxMatch;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-005',
            'DOD_FMR',
            'high',
            `TSP Matching Exceeds 5% Limit for ${record.payGrade}`,
            `Member ${record.memberId} has TSP matching of $${record.tspMatchAmount.toFixed(2)} which exceeds the 5% of basic pay limit ($${maxMatch.toFixed(2)}). Excess: $${excess.toFixed(2)}. The government matching contribution is capped at 5% of basic pay under BRS.`,
            'DoD FMR Vol 7A, Ch 62; 5 U.S.C. § 8432(c)(2): Agency automatic and matching contributions shall not exceed 5% of basic pay.',
            'Verify the TSP matching calculation. If the match exceeds 5%, adjust and recover the excess amount. Ensure the payroll system correctly applies the BRS matching formula.',
            excess,
            ['Military Pay - TSP']
          ));
        }

        // Check IRS annual contribution limit
        if (record.tspContribution > annualTspLimit) {
          const excess = record.tspContribution - annualTspLimit;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-005',
            'DOD_FMR',
            'medium',
            `TSP Contribution Exceeds IRS Annual Limit for ${record.payGrade}`,
            `Member ${record.memberId} has TSP employee contributions of $${record.tspContribution.toLocaleString()} which exceeds the IRS annual elective deferral limit of $${annualTspLimit.toLocaleString()}. Excess: $${excess.toLocaleString()}. Catch-up contributions may apply for members age 50+, but this should be verified.`,
            'DoD FMR Vol 7A, Ch 62; 26 U.S.C. § 402(g): Elective deferrals are subject to annual IRS limits.',
            'Verify whether the member is eligible for catch-up contributions. If not, stop excess contributions and process a refund of excess deferrals before the tax filing deadline.',
            excess,
            ['Military Pay - TSP']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-006',
    name: 'Separation Pay Validation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies separation pay is properly authorized and correctly computed',
    citation: 'DoD FMR Vol 7A, Ch 35; 10 U.S.C. § 1174 - Separation pay upon involuntary discharge',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (record.separationPay <= 0) continue;

        // Full separation pay = 10% x yearsOfService x 12 x monthly basic pay
        const monthlyBasicPay = record.basicPay / 12;
        const fullSepPay = 0.10 * record.yearsOfService * 12 * monthlyBasicPay;

        if (record.separationPay > fullSepPay * 1.05) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-006',
            'DOD_FMR',
            'high',
            'Separation Pay Exceeds Computed Maximum',
            `Member ${record.memberId} (${record.payGrade}, ${record.yearsOfService} YOS) received separation pay of $${record.separationPay.toLocaleString()} which exceeds the computed full separation pay of $${fullSepPay.toFixed(2)}. Full separation pay = 10% x years of service x 12 x monthly basic pay.`,
            'DoD FMR Vol 7A, Ch 35; 10 U.S.C. § 1174: Separation pay shall not exceed the amount computed under the statutory formula.',
            'Recalculate separation pay using the correct basic pay rate, years of service, and full or half rate determination. Recoup any overpayment.',
            record.separationPay - fullSepPay,
            ['Military Pay - Separation Pay']
          ));
        }

        if (record.yearsOfService < 6) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-006',
            'DOD_FMR',
            'high',
            'Separation Pay Issued to Ineligible Member',
            `Member ${record.memberId} (${record.payGrade}) received separation pay of $${record.separationPay.toLocaleString()} with only ${record.yearsOfService} years of service. Separation pay generally requires a minimum of 6 years of active service.`,
            'DoD FMR Vol 7A, Ch 35; 10 U.S.C. § 1174(a): Eligibility requires at least 6 years of active service.',
            'Verify eligibility including total active service computation. If ineligible, initiate recoupment procedures.',
            record.separationPay,
            ['Military Pay - Separation Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-007',
    name: 'Pay Record Completeness',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies that required fields in military pay records are populated for audit trail integrity',
    citation: 'DoD FMR Vol 7A, Ch 1 - Military Pay Record Requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const incompleteRecords = data.dodData.militaryPayRecords.filter(r =>
        !r.memberId || !r.payGrade || !r.payPeriod || !r.status
      );

      if (incompleteRecords.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V07-007',
          'DOD_FMR',
          'medium',
          'Incomplete Military Pay Records',
          `${incompleteRecords.length} military pay record(s) are missing required fields (member ID, pay grade, pay period, or status). Incomplete records cannot be properly validated for pay entitlement accuracy and do not support audit trail requirements.`,
          'DoD FMR Vol 7A, Ch 1: Military pay records must contain all required fields for proper pay computation, entitlement verification, and audit purposes.',
          'Review and complete all missing fields in the identified pay records. Implement system edits to prevent creation of records with missing required fields.',
          null,
          incompleteRecords.map(r => r.memberId || r.id)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-008',
    name: 'Overpayment Detection',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Checks total compensation for outliers exceeding 2x the population average for the same grade',
    citation: 'DoD FMR Vol 7A, Ch 1; 37 U.S.C. § 1007 - Deductions from pay',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const records = data.dodData.militaryPayRecords;

      if (records.length === 0) return findings;

      // Calculate average total compensation by pay grade
      const gradeAvg = new Map<string, { total: number; count: number }>();
      for (const record of records) {
        const entry = gradeAvg.get(record.payGrade) || { total: 0, count: 0 };
        entry.total += record.totalCompensation;
        entry.count += 1;
        gradeAvg.set(record.payGrade, entry);
      }

      for (const record of records) {
        const avg = gradeAvg.get(record.payGrade);
        if (!avg || avg.count < 2) continue;

        const averageComp = avg.total / avg.count;
        if (record.totalCompensation > averageComp * 2) {
          const excess = record.totalCompensation - averageComp;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-008',
            'DOD_FMR',
            'critical',
            `Potential Overpayment Detected for ${record.payGrade}`,
            `Member ${record.memberId} (${record.payGrade}, ${record.yearsOfService} YOS) has total compensation of $${record.totalCompensation.toLocaleString()} which is more than 2x the average of $${averageComp.toFixed(2)} for grade ${record.payGrade} (based on ${avg.count} records). Excess over average: $${excess.toFixed(2)}. This may indicate overpayment due to incorrect entitlement computation or system error.`,
            'DoD FMR Vol 7A, Ch 1; 37 U.S.C. § 1007: When an overpayment is detected, collection action must be initiated.',
            'Immediately investigate the pay record for errors. Verify all entitlements against authorization documents. If overpayment is confirmed, initiate collection procedures per DoD FMR Vol 7A, Ch 50.',
            excess,
            ['Military Pay - Total Compensation']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-009',
    name: 'Underpayment Detection',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Checks if basic pay falls below the minimum expected for the assigned pay grade',
    citation: 'DoD FMR Vol 7A, Ch 1; 37 U.S.C. § 203 - Minimum pay rates',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const gradeMinBasicPay: Record<string, number> = {
        'E-1': 18000, 'E-2': 22000, 'E-3': 24000, 'E-4': 26000,
        'E-5': 30000, 'E-6': 34000, 'E-7': 38000, 'E-8': 44000, 'E-9': 52000,
        'O-1': 38000, 'O-2': 44000, 'O-3': 50000, 'O-4': 56000,
        'O-5': 66000, 'O-6': 78000, 'O-7': 100000, 'O-8': 110000,
        'O-9': 170000, 'O-10': 180000,
        'W-1': 36000, 'W-2': 42000, 'W-3': 48000, 'W-4': 54000, 'W-5': 62000,
      };

      for (const record of data.dodData.militaryPayRecords) {
        if (record.basicPay <= 0 || record.status !== 'active') continue;

        const minPay = gradeMinBasicPay[record.payGrade];
        if (minPay && record.basicPay < minPay) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-009',
            'DOD_FMR',
            'high',
            `Basic Pay Below Minimum for ${record.payGrade}`,
            `Member ${record.memberId} at pay grade ${record.payGrade} with ${record.yearsOfService} years of service has basic pay of $${record.basicPay.toLocaleString()} which is below the expected minimum of $${minPay.toLocaleString()}. This may indicate an underpayment, incorrect pay grade assignment, or partial period calculation error.`,
            'DoD FMR Vol 7A, Ch 1; 37 U.S.C. § 203: Basic pay rates are published annually. Active duty members must be paid at least the rate for their grade and years of service.',
            'Verify the member pay grade and years of service. Cross-reference with the pay tables and correct any underpayment with retroactive pay adjustment.',
            minPay - record.basicPay,
            ['Military Pay - Basic Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-010',
    name: 'Special Pay Authorization',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies special pays in specialPaysJson have proper documentation and reasonable amounts',
    citation: 'DoD FMR Vol 7A, Ch 5-17; 37 U.S.C. § 301-374 - Special and incentive pays',
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
            'DOD-FMR-V07-010',
            'DOD_FMR',
            'high',
            'Invalid Special Pays Data Format',
            `Member ${record.memberId} (${record.payGrade}) has malformed special pays data that cannot be parsed. Special pay entitlements cannot be validated without properly structured data.`,
            'DoD FMR Vol 7A, Ch 5-17: All special pay entitlements must be properly documented and recorded.',
            'Correct the special pays data format. Verify each entitlement against authorization documents and re-enter the data correctly.',
            null,
            ['Military Pay - Special Pays']
          ));
          continue;
        }

        const payEntries = Object.entries(specialPays);
        if (payEntries.length > 5) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-010',
            'DOD_FMR',
            'medium',
            'Excessive Number of Special Pays',
            `Member ${record.memberId} (${record.payGrade}) has ${payEntries.length} distinct special pay entitlements. While not inherently improper, a high number of concurrent special pays warrants review to ensure each is properly authorized and no duplications exist.`,
            'DoD FMR Vol 7A, Ch 5-17; 37 U.S.C. § 301-374: Each special pay must be individually authorized.',
            'Review authorization documentation for each special pay. Verify concurrent receipt rules and check for duplicates.',
            null,
            ['Military Pay - Special Pays']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-011',
    name: 'Retirement Pay Calculation',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Verifies retirement pay consistency based on years of service and applicable retirement system',
    citation: 'DoD FMR Vol 7B, Ch 1; 10 U.S.C. § 1401 - Computation of retired pay',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const record of data.dodData.militaryPayRecords) {
        if (record.retirementPay <= 0) continue;

        // High-3 system: 2.5% x years x average of highest 36 months basic pay (max 75%)
        const multiplier = Math.min(record.yearsOfService * 0.025, 0.75);
        const expectedRetirementPay = multiplier * record.basicPay;

        if (record.retirementPay > expectedRetirementPay * 1.10) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-011',
            'DOD_FMR',
            'high',
            'Retirement Pay Exceeds Expected Amount',
            `Member ${record.memberId} (${record.payGrade}, ${record.yearsOfService} YOS) has retirement pay of $${record.retirementPay.toLocaleString()} which exceeds the estimated High-3 computation of $${expectedRetirementPay.toFixed(2)} (${(multiplier * 100).toFixed(1)}% multiplier) by more than 10%.`,
            'DoD FMR Vol 7B, Ch 1; 10 U.S.C. § 1401: Retired pay is computed based on years of creditable service and the applicable pay base.',
            'Verify the retirement system (Final Pay, High-3, Redux, or BRS). Validate years of creditable service, retired pay base, and COLA adjustments. Reconcile to the retirement pay order.',
            record.retirementPay - expectedRetirementPay,
            ['Military Pay - Retirement Pay']
          ));
        }

        if (record.yearsOfService < 20) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V07-011',
            'DOD_FMR',
            'medium',
            'Retirement Pay for Member with Less Than 20 Years',
            `Member ${record.memberId} (${record.payGrade}) is receiving retirement pay of $${record.retirementPay.toLocaleString()} with only ${record.yearsOfService} years of service. Standard non-disability retirement requires 20 years. Verify if this is medical/disability retirement or TERA.`,
            'DoD FMR Vol 7B, Ch 1; 10 U.S.C. § 3911/8911: Retirement eligibility generally requires 20 years.',
            'Confirm the basis for retirement and verify the computation method and authorization documentation.',
            null,
            ['Military Pay - Retirement Pay']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V07-012',
    name: 'Pay Period Continuity',
    framework: 'DOD_FMR',
    category: 'Military Pay (Vol 7)',
    description: 'Checks for gaps in pay period records that may indicate missing pay transactions',
    citation: 'DoD FMR Vol 7A, Ch 1 - Pay Period Requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const records = data.dodData.militaryPayRecords;

      if (records.length === 0) return findings;

      // Group pay records by member and check for period continuity
      const byMember = new Map<string, string[]>();
      for (const record of records) {
        const periods = byMember.get(record.memberId) || [];
        periods.push(record.payPeriod);
        byMember.set(record.memberId, periods);
      }

      const membersWithGaps: string[] = [];
      for (const [memberId, periods] of Array.from(byMember.entries())) {
        const sorted = periods.sort();
        if (sorted.length > 1) {
          // Simple gap detection: look for non-consecutive period identifiers
          for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            // If periods are date-based, check for gaps greater than expected
            const prevDate = new Date(prev);
            const currDate = new Date(curr);
            if (!isNaN(prevDate.getTime()) && !isNaN(currDate.getTime())) {
              const daysDiff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
              if (daysDiff > 45) {
                membersWithGaps.push(memberId);
                break;
              }
            }
          }
        }
      }

      if (membersWithGaps.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V07-012',
          'DOD_FMR',
          'medium',
          'Pay Period Gaps Detected in Military Pay Records',
          `${membersWithGaps.length} member(s) have gaps in their pay period records exceeding 45 days: ${membersWithGaps.slice(0, 10).join(', ')}${membersWithGaps.length > 10 ? ` and ${membersWithGaps.length - 10} more` : ''}. Gaps in pay records may indicate missing pay transactions, processing errors, or periods of unauthorized leave without pay (LWOP) that were not properly recorded.`,
          'DoD FMR Vol 7A, Ch 1: Military pay records must be maintained for each pay period to ensure complete and accurate pay history.',
          'Investigate each gap to determine the cause. Verify member status during the gap period (PCS, leave, TDY, etc.). Process any missing pay transactions and document the reason for gaps.',
          null,
          membersWithGaps.slice(0, 20)
        ));
      }

      return findings;
    },
  },
];
