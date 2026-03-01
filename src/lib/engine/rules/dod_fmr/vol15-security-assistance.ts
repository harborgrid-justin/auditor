import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const securityAssistanceRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V15-001',
    name: 'Security Assistance Fund Tracking',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies that interagency agreements with security assistance authority are properly tracked with required data elements',
    citation: 'DoD FMR Vol 15, Ch 2; 22 U.S.C. §2761 - Foreign Military Sales',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { interagencyAgreements } = data.dodData;

      const securityIAAs = interagencyAgreements.filter(iaa => {
        const auth = iaa.authority.toLowerCase();
        return auth.includes('security') || auth.includes('fmf') || auth.includes('imet');
      });

      const improperly = securityIAAs.filter(
        iaa => !iaa.agreementNumber || iaa.amount <= 0
      );

      if (improperly.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V15-001',
          'DOD_FMR',
          'medium',
          'Security Assistance IAAs Missing Required Tracking Data',
          `${improperly.length} security assistance interagency agreement(s) are not properly tracked: ${improperly.map(iaa => `IAA ${iaa.agreementNumber || '(no number)'} - ${iaa.servicingAgency} to ${iaa.requestingAgency} (amount: $${iaa.amount.toLocaleString()}, authority: ${iaa.authority})`).join('; ')}. Security assistance agreements involving FMF, IMET, or other security cooperation authorities must have a valid agreement number and a positive amount for proper fund accountability and DSCA reporting.`,
          'DoD FMR Volume 15, Chapter 2; 22 U.S.C. §2761: Security assistance funds must be tracked through properly documented agreements with unique identifiers, specified amounts, and clear authority citations to ensure accountability and compliance with the Arms Export Control Act.',
          'Assign agreement numbers to any agreements lacking them. Verify that the correct dollar amounts are recorded. Ensure all security assistance agreements are registered with DSCA and tracked in the Security Cooperation Information Portal (SCIP).',
          null,
          improperly.map(iaa => iaa.agreementNumber || iaa.id)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-002',
    name: 'Security Assistance Billing Accuracy',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Checks billed amount versus obligated amount for security-related interagency agreements to identify billing discrepancies',
    citation: 'DoD FMR Vol 15, Ch 7; DSCA Manual 5105.38-M - Security Assistance Billing',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { interagencyAgreements } = data.dodData;

      const securityIAAs = interagencyAgreements.filter(iaa => {
        const auth = iaa.authority.toLowerCase();
        return auth.includes('security') || auth.includes('fmf') || auth.includes('imet');
      });

      for (const iaa of securityIAAs) {
        if (iaa.obligatedAmount <= 0) continue;

        if (iaa.billedAmount > iaa.obligatedAmount) {
          const overBilled = iaa.billedAmount - iaa.obligatedAmount;

          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-002',
            'DOD_FMR',
            'medium',
            'Security Assistance Over-Billing',
            `Security assistance IAA ${iaa.agreementNumber} (${iaa.authority}): billed amount of $${iaa.billedAmount.toLocaleString()} exceeds obligated amount of $${iaa.obligatedAmount.toLocaleString()} by $${overBilled.toLocaleString()}. Over-billing on security assistance agreements may indicate billing errors, unauthorized work, or obligation recording failures. Accurate billing is critical for foreign partner trust and compliance with the Arms Export Control Act.`,
            'DoD FMR Volume 15, Chapter 7; DSCA Manual 5105.38-M: Billings must not exceed the obligated amounts for security assistance cases. Over-billings must be investigated and corrected to maintain the integrity of the FMS trust fund.',
            'Investigate the over-billing to determine whether it results from a billing error or an unrecorded obligation. If the billing is correct, record the additional obligation. If the billing is erroneous, issue a billing adjustment to the foreign customer or partner agency.',
            overBilled,
            [iaa.agreementNumber]
          ));
        }

        if (iaa.billedAmount < iaa.obligatedAmount * 0.50 && iaa.status === 'active') {
          const underBilled = iaa.obligatedAmount - iaa.billedAmount;

          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-002',
            'DOD_FMR',
            'medium',
            'Security Assistance Under-Billing',
            `Security assistance IAA ${iaa.agreementNumber} (${iaa.authority}): billed amount of $${iaa.billedAmount.toLocaleString()} is less than 50% of obligated amount of $${iaa.obligatedAmount.toLocaleString()} (unbilled: $${underBilled.toLocaleString()}). Significant under-billing may indicate delayed cost recovery, stalled program execution, or billing system issues. Timely billing is essential for FMS trust fund cash management.`,
            'DoD FMR Volume 15, Chapter 7: Implementing agencies must bill for security assistance work in a timely manner to ensure accurate financial reporting and proper cash management of the FMS trust fund.',
            'Review the status of work under this security assistance agreement. If work has been performed, ensure billings are submitted promptly. Identify any barriers to timely billing and resolve them. Coordinate with the implementing agency to establish a billing schedule.',
            underBilled,
            [iaa.agreementNumber]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-003',
    name: 'Security Assistance Collection Timeliness',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Checks the gap between collected and billed amounts for security assistance IAAs to identify collection delays',
    citation: 'DoD FMR Vol 15, Ch 7; 22 U.S.C. §2762 - FMS Collection Requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { interagencyAgreements } = data.dodData;

      const securityIAAs = interagencyAgreements.filter(iaa => {
        const auth = iaa.authority.toLowerCase();
        return auth.includes('security') || auth.includes('fmf') || auth.includes('imet');
      });

      for (const iaa of securityIAAs) {
        if (iaa.billedAmount <= 0) continue;

        const uncollected = iaa.billedAmount - iaa.collectedAmount;
        const uncollectedPct = uncollected / iaa.billedAmount;

        if (uncollected > 0 && uncollectedPct > 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-003',
            'DOD_FMR',
            'medium',
            'Security Assistance Collection Shortfall',
            `Security assistance IAA ${iaa.agreementNumber} (${iaa.authority}): billed $${iaa.billedAmount.toLocaleString()} but collected only $${iaa.collectedAmount.toLocaleString()}, leaving $${uncollected.toLocaleString()} uncollected (${(uncollectedPct * 100).toFixed(1)}%). A collection shortfall exceeding 25% of billed amounts indicates potential issues with foreign customer payment timeliness or interagency collection processing. Delinquent collections create cash management problems for the FMS trust fund.`,
            'DoD FMR Volume 15, Chapter 7; 22 U.S.C. §2762: FMS customers are generally required to fund cases in advance of delivery. Delinquent collections must be pursued aggressively, and deliveries may be suspended for non-payment.',
            'Follow up with the requesting agency or foreign customer on outstanding collections. For FMS cases, issue demand letters per DSCA policy. Consider suspending deliveries on delinquent accounts. For interagency transfers, process IPAC collections promptly.',
            uncollected,
            [iaa.agreementNumber]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-004',
    name: 'Security Assistance Case Closure',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies that completed security assistance IAAs have proper financial closeout with collected amounts matching billed amounts',
    citation: 'DoD FMR Vol 15, Ch 8; DSCA Manual 5105.38-M - Case Closure Requirements',
    defaultSeverity: 'low',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { interagencyAgreements } = data.dodData;

      const securityIAAs = interagencyAgreements.filter(iaa => {
        const auth = iaa.authority.toLowerCase();
        return auth.includes('security') || auth.includes('fmf') || auth.includes('imet');
      });

      const completedIAAs = securityIAAs.filter(iaa => iaa.status === 'completed');

      for (const iaa of completedIAAs) {
        if (iaa.billedAmount <= 0) continue;

        const collectionGap = Math.abs(iaa.collectedAmount - iaa.billedAmount);
        const gapPct = collectionGap / iaa.billedAmount;

        if (gapPct > 0.02) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-004',
            'DOD_FMR',
            'low',
            'Completed Security Assistance Case Not Properly Closed Out',
            `Security assistance IAA ${iaa.agreementNumber} (${iaa.authority}) has "completed" status but collected amount ($${iaa.collectedAmount.toLocaleString()}) differs from billed amount ($${iaa.billedAmount.toLocaleString()}) by $${collectionGap.toLocaleString()} (${(gapPct * 100).toFixed(1)}%). Completed cases should have collections equal to (or very close to) billings before financial closeout. ${iaa.collectedAmount < iaa.billedAmount ? 'Under-collection indicates outstanding receivables that must be resolved.' : 'Over-collection indicates excess funds that should be refunded.'}`,
            'DoD FMR Volume 15, Chapter 8; DSCA Manual 5105.38-M: Security assistance case closure requires reconciliation of all financial transactions. Final billing adjustments must be processed and all collections completed before a case can be financially closed.',
            'Reconcile the case by determining the correct final billed amount. If collections are short, issue a final demand. If collections are over, process a refund. Complete the financial closeout checklist and update the case status in the security cooperation management system.',
            collectionGap,
            [iaa.agreementNumber]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-005',
    name: 'Security Assistance Period Compliance',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies that security assistance IAA period of performance is reasonable and compliant',
    citation: 'DoD FMR Vol 15, Ch 2; 22 U.S.C. §2761 - Period of Performance Requirements',
    defaultSeverity: 'low',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { interagencyAgreements } = data.dodData;

      const securityIAAs = interagencyAgreements.filter(iaa => {
        const auth = iaa.authority.toLowerCase();
        return auth.includes('security') || auth.includes('fmf') || auth.includes('imet');
      });

      for (const iaa of securityIAAs) {
        if (!iaa.periodOfPerformance) continue;

        const popEndDate = new Date(iaa.periodOfPerformance);
        if (isNaN(popEndDate.getTime())) continue;

        const now = new Date();

        // Check for expired but still active
        if (iaa.status === 'active' && now > popEndDate) {
          const daysExpired = Math.ceil(
            (now.getTime() - popEndDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-005',
            'DOD_FMR',
            'low',
            'Security Assistance IAA Period of Performance Expired',
            `Security assistance IAA ${iaa.agreementNumber} (${iaa.authority}) has been expired for ${daysExpired} day(s) (period of performance ended: ${iaa.periodOfPerformance}) but remains in "active" status. Active security assistance agreements past their period of performance should be reviewed for extension, modification, or closure. Remaining amount: $${(iaa.amount - iaa.billedAmount).toLocaleString()}.`,
            'DoD FMR Volume 15, Chapter 2; 22 U.S.C. §2761: Security assistance agreements must be executed within the authorized period of performance. Expired agreements should be closed or extended through proper modification procedures.',
            'Review the agreement status and determine if a period of performance extension is needed. If work is complete, initiate closure procedures. If additional time is needed, process a modification. Deobligate any funds that will not be used.',
            null,
            [iaa.agreementNumber]
          ));
        }

        // Check for unreasonably long period of performance (> 10 years)
        const startFY = iaa.fiscalYear;
        const endYear = popEndDate.getFullYear();
        const popDurationYears = endYear - startFY;

        if (popDurationYears > 10 && iaa.status === 'active') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-005',
            'DOD_FMR',
            'low',
            'Unusually Long Security Assistance Period of Performance',
            `Security assistance IAA ${iaa.agreementNumber} (${iaa.authority}) has an estimated period of performance spanning approximately ${popDurationYears} years (FY${startFY} through ${endYear}). While some major security assistance programs have extended timelines, an unusually long period of performance should be reviewed to ensure it is justified by the nature of the program and that funds are being executed in a timely manner.`,
            'DoD FMR Volume 15, Chapter 2: Security assistance agreement periods of performance should be reasonable and aligned with the expected delivery schedule. Extended periods require periodic review.',
            'Review the program timeline to confirm the extended period of performance is justified. Ensure that funds are being executed at a reasonable rate. Consider breaking long-term programs into phases for better financial management.',
            null,
            [iaa.agreementNumber]
          ));
        }
      }

      return findings;
    },
  },
];
