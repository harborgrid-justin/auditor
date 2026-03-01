import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

export const antiDeficiencyActRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V14-001',
    name: 'Over-Obligation Detection (1341(a))',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks each appropriation where obligated amount exceeds total authority, constituting a potential ADA violation under 31 U.S.C. 1341(a)',
    citation: 'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1341(a)(1)(A) - Limitations on expending and obligating',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const approp of data.dodData.appropriations) {
        if (approp.totalAuthority > 0 && approp.obligated > approp.totalAuthority) {
          const excess = approp.obligated - approp.totalAuthority;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V14-001',
            'DOD_FMR',
            'critical',
            `ADA Violation: Obligations Exceed Total Authority`,
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}): obligations of $${approp.obligated.toLocaleString()} exceed total budget authority of $${approp.totalAuthority.toLocaleString()} by $${excess.toLocaleString()}. This constitutes a violation of 31 U.S.C. 1341(a)(1)(A), which prohibits any officer or employee from making or authorizing an obligation exceeding an amount available in an appropriation. This is a reportable Anti-Deficiency Act violation.`,
            'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1341(a)(1)(A) - An officer or employee may not make or authorize an obligation exceeding an amount available in an appropriation or fund. 31 U.S.C. 1351 - Violations must be reported to the President and Congress.',
            'Immediately cease all new obligations against this appropriation. Initiate a formal ADA investigation per DoD FMR Vol 14, Ch 3. Identify the responsible officer(s). Prepare the required report to the President (through OMB) and Congress per 31 U.S.C. 1351. Determine if disciplinary action is warranted per 31 U.S.C. 1349.',
            excess,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-002',
    name: 'Over-Expenditure Detection (1341(a))',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks for appropriations where disbursed amount exceeds obligated amount, indicating expenditures without proper obligation authority',
    citation: 'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1341(a)(1)(A) - Expenditure limitations',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const approp of data.dodData.appropriations) {
        if (approp.obligated > 0 && approp.disbursed > approp.obligated) {
          const excess = approp.disbursed - approp.obligated;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V14-002',
            'DOD_FMR',
            'critical',
            `ADA Violation: Expenditures Exceed Obligations`,
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}): disbursements of $${approp.disbursed.toLocaleString()} exceed obligations of $${approp.obligated.toLocaleString()} by $${excess.toLocaleString()}. An expenditure exceeding the amount obligated is a violation of 31 U.S.C. 1341(a)(1)(A) and constitutes both an improper payment and an ADA violation. Disbursements without corresponding valid obligations lack legal authority.`,
            'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1341(a)(1)(A) - An officer or employee may not make or authorize an expenditure exceeding an amount available in an appropriation. Expenditures must be supported by valid obligations. 31 U.S.C. 1351 requires reporting.',
            'Immediately halt further disbursements against this appropriation pending investigation. Initiate recovery of overpayments. Determine if additional obligation authority exists to cover the excess. If not, report as an ADA violation per Vol 14 procedures. Implement pre-payment verification controls.',
            excess,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-003',
    name: 'Apportionment Violation (1517(a))',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks obligations against OMB-approved apportionment controls to detect violations of 31 U.S.C. 1517(a)',
    citation: 'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1517(a) - Apportionment limitations',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const approp of data.dodData.appropriations) {
        if (approp.apportioned > 0 && approp.obligated > approp.apportioned) {
          const excess = approp.obligated - approp.apportioned;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V14-003',
            'DOD_FMR',
            'critical',
            `ADA Violation: Apportionment Ceiling Breach`,
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}): obligations of $${approp.obligated.toLocaleString()} exceed the OMB-approved apportionment of $${approp.apportioned.toLocaleString()} by $${excess.toLocaleString()}. Exceeding an OMB apportionment is a violation of 31 U.S.C. 1517(a) subject to the same reporting and penalty requirements as other ADA violations.`,
            'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1517(a) - An officer or employee may not make or authorize an obligation exceeding the amount apportioned by OMB under 31 U.S.C. 1512. 31 U.S.C. 1517(b) - Subject to same reporting as 1341 violations.',
            'Immediately suspend new obligations. Determine whether the apportionment schedule needs to be revised (request reapportionment from OMB if additional authority exists). If no additional authority is available, this is a confirmed ADA violation requiring reporting per 31 U.S.C. 1351. Identify responsible officer(s).',
            excess,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-004',
    name: 'Allotment Violation (1517(a))',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks obligations against allotment controls at the fund control level to detect violations of administrative subdivision limits',
    citation: 'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1517(a) - Administrative subdivision controls',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check appropriation-level allotment controls
      for (const approp of data.dodData.appropriations) {
        if (approp.allotted > 0 && approp.obligated > approp.allotted) {
          const excess = approp.obligated - approp.allotted;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V14-004',
            'DOD_FMR',
            'critical',
            `ADA Violation: Allotment Ceiling Breach`,
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}): obligations of $${approp.obligated.toLocaleString()} exceed the allotted amount of $${approp.allotted.toLocaleString()} by $${excess.toLocaleString()}. Exceeding an allotment designated as a formal administrative subdivision is a violation of 31 U.S.C. 1517(a).`,
            'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1517(a) - An officer or employee may not make or authorize an obligation exceeding an amount permitted by agency regulations, including allotments designated as formal control points. 31 U.S.C. 1514 requires agencies to prescribe administrative controls.',
            'Immediately suspend obligations at the allotment level. Determine if additional funds can be realigned from other allotments within the same apportionment. If the over-obligation cannot be resolved through internal realignment, report as an ADA violation.',
            excess,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      // Check fund control points at sub-allotment and operating budget level
      for (const fc of data.dodData.fundControls) {
        if ((fc.controlLevel === 'allotment' || fc.controlLevel === 'sub_allotment' || fc.controlLevel === 'operating_budget') &&
            fc.obligatedAgainst > fc.amount) {
          const excess = fc.obligatedAgainst - fc.amount;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V14-004',
            'DOD_FMR',
            'critical',
            `Fund Control Point Over-Obligation: ${fc.controlLevel.replace(/_/g, ' ')}`,
            `Fund control "${fc.controlledBy}" (${fc.controlLevel.replace(/_/g, ' ')}): obligations of $${fc.obligatedAgainst.toLocaleString()} exceed the authorized amount of $${fc.amount.toLocaleString()} by $${excess.toLocaleString()}. When designated as a formal administrative subdivision, exceeding this control point constitutes a 31 U.S.C. 1517(a) violation.`,
            'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1517(a) - Obligations may not exceed amounts permitted by agency regulations at any designated administrative subdivision level.',
            'Suspend new obligations at this control point. Realign funds from other control points if possible. If over-obligation is confirmed, initiate ADA investigation and reporting procedures.',
            excess,
            [fc.appropriationId]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-005',
    name: 'Voluntary Service Prohibition (1342)',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks for ADA violations related to acceptance of voluntary services without proper authorization under 31 U.S.C. 1342',
    citation: 'DoD FMR Vol 14, Ch 2; 31 U.S.C. 1342 - Prohibition on voluntary services',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const voluntaryServiceViolations = data.dodData.adaViolations.filter(
        v => v.violationType === 'voluntary_service'
      );

      for (const violation of voluntaryServiceViolations) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V14-005',
          'DOD_FMR',
          'critical',
          `ADA Violation: Acceptance of Voluntary Services (1342)`,
          `Voluntary service violation detected: "${violation.description}". Amount: $${violation.amount.toLocaleString()}. Discovered: ${violation.discoveredDate}. Status: ${violation.investigationStatus}. Under 31 U.S.C. 1342, an officer or employee may not accept voluntary services for the government or employ personal services exceeding that authorized by law, except for emergencies involving the safety of human life or protection of property.`,
          'DoD FMR Vol 14, Ch 2; 31 U.S.C. 1342 - An officer or employee may not accept voluntary services or employ personal services exceeding that authorized by law except for emergencies. 31 U.S.C. 1351 - All ADA violations must be reported.',
          'Immediately cease any ongoing voluntary service arrangements. Determine the value of services received and identify the responsible official(s). Report the violation per 31 U.S.C. 1351 through the chain of command to the President (through OMB) and Congress. Consider disciplinary action per 31 U.S.C. 1349 or criminal penalty per 31 U.S.C. 1350.',
          violation.amount,
          [violation.id]
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-006',
    name: 'Purpose Restriction Violation',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks for obligations recorded against expired appropriations, which violates the purpose and time restrictions on appropriation use',
    citation: 'DoD FMR Vol 14, Ch 2; 31 U.S.C. 1502(a) - Time limitations; 31 U.S.C. 1301(a) - Purpose statute',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Index expired and cancelled appropriations
      const nonCurrentApprops = new Map(
        data.dodData.appropriations
          .filter(a => a.status === 'expired' || a.status === 'cancelled')
          .map(a => [a.id, a])
      );

      // Find new obligations against non-current appropriations
      const violatingObligations = data.dodData.obligations.filter(o => {
        const approp = nonCurrentApprops.get(o.appropriationId);
        if (!approp) return false;
        return o.fiscalYear >= data.dodData!.fiscalYear;
      });

      if (violatingObligations.length > 0) {
        const totalAmount = violatingObligations.reduce((sum, o) => sum + o.amount, 0);
        const expiredCount = violatingObligations.filter(o => {
          const approp = nonCurrentApprops.get(o.appropriationId);
          return approp?.status === 'expired';
        }).length;
        const cancelledCount = violatingObligations.filter(o => {
          const approp = nonCurrentApprops.get(o.appropriationId);
          return approp?.status === 'cancelled';
        }).length;

        const oblSummary = violatingObligations.slice(0, 5)
          .map(o => `${o.obligationNumber} ($${o.amount.toLocaleString()})`)
          .join(', ');
        const moreText = violatingObligations.length > 5 ? ` and ${violatingObligations.length - 5} more` : '';

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V14-006',
          'DOD_FMR',
          'critical',
          `ADA Violation: Obligations Against Expired/Cancelled Appropriations`,
          `${violatingObligations.length} new obligation(s) totaling $${totalAmount.toLocaleString()} were recorded against non-current appropriations (${expiredCount} expired, ${cancelledCount} cancelled) in FY${data.dodData!.fiscalYear}. Obligations: ${oblSummary}${moreText}. This is a time violation under 31 U.S.C. 1502(a). Expired appropriations may only be used for adjustments to existing obligations, not new ones. Cancelled appropriations may not be used at all.`,
          'DoD FMR Vol 14, Ch 2; 31 U.S.C. 1502(a) - The balance of an appropriation limited for obligation to a definite period is available only for payment of expenses properly incurred during the period. 31 U.S.C. 1341(a)(1)(B) - Officers may not involve the government in obligations before an appropriation is made.',
          'Immediately reverse all new obligations against expired and cancelled appropriations. Charge obligations to the correct current-year appropriation of the same type if available. If no current-year appropriation exists, the requirement must be deferred or separately funded. Report confirmed violations per 31 U.S.C. 1351.',
          totalAmount,
          violatingObligations.map(o => o.obligationNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-007',
    name: 'Bona Fide Need Rule Violation',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks obligation dates against appropriation fiscal year dates to detect bona fide need rule violations where obligations are recorded outside the appropriation availability period',
    citation: 'DoD FMR Vol 14, Ch 2; 31 U.S.C. 1502(a) - Bona fide need rule',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const appropMap = new Map(
        data.dodData.appropriations.map(a => [a.id, a])
      );

      for (const obligation of data.dodData.obligations) {
        const approp = appropMap.get(obligation.appropriationId);
        if (!approp) continue;

        // Check if obligation has a bona fide need date that falls outside the appropriation period
        if (obligation.bonafideNeedDate && approp.fiscalYearStart && approp.fiscalYearEnd) {
          const needDate = new Date(obligation.bonafideNeedDate);
          const fyStart = new Date(approp.fiscalYearStart);
          const fyEnd = new Date(approp.fiscalYearEnd);

          if (needDate < fyStart || needDate > fyEnd) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V14-007',
              'DOD_FMR',
              'critical',
              `Bona Fide Need Rule Violation`,
              `Obligation ${obligation.obligationNumber} (amount: $${obligation.amount.toLocaleString()}): bona fide need date of ${obligation.bonafideNeedDate} falls outside the appropriation availability period (${approp.fiscalYearStart} to ${approp.fiscalYearEnd}) for "${approp.appropriationTitle}". Under the bona fide need rule, obligations must be incurred for needs arising during the period of availability of the appropriation charged.`,
              'DoD FMR Vol 14, Ch 2; 31 U.S.C. 1502(a) - A fixed appropriation is available for obligation only to meet a genuine (bona fide) need of the period of availability. Obligations for needs arising in a different fiscal year must be charged to that year\'s appropriation.',
              'Review the obligation to determine if the need truly arose during the appropriation period. If the need arose in a different fiscal year, reverse the obligation and charge it to the correct year\'s appropriation. If no current-year funds are available, the requirement must be funded through a new appropriation request.',
              obligation.amount,
              [obligation.obligationNumber]
            ));
          }
        }

        // Check obligation date against appropriation expiration
        if (approp.expirationDate) {
          const oblDate = new Date(obligation.obligatedDate);
          const expDate = new Date(approp.expirationDate);

          if (oblDate > expDate) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V14-007',
              'DOD_FMR',
              'critical',
              `Obligation Recorded After Appropriation Expiration`,
              `Obligation ${obligation.obligationNumber} (amount: $${obligation.amount.toLocaleString()}) was recorded on ${obligation.obligatedDate}, after the appropriation expiration date of ${approp.expirationDate} for "${approp.appropriationTitle}". New obligations cannot be recorded against expired appropriations.`,
              'DoD FMR Vol 14, Ch 2; 31 U.S.C. 1502(a) - Expired appropriations are available only for adjustments to existing obligations, not new ones.',
              'Reverse this obligation from the expired appropriation. Identify and charge the correct current-year appropriation. Report as a potential ADA violation if the charge cannot be corrected.',
              obligation.amount,
              [obligation.obligationNumber]
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-008',
    name: 'ADA Violation Reporting Timeliness',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks the gap between discovered date and reported date on ADA violations to ensure timely reporting as required by law',
    citation: 'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1351 - Violation reporting requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const fy = data.dodData?.fiscalYear ?? new Date(data.fiscalYearEnd).getFullYear();
      const findings: AuditFinding[] = [];
      const adaReportDeadlineDays = getParameter('DOD_ADA_REPORT_DEADLINE_DAYS', fy, undefined, 30);

      for (const violation of data.dodData.adaViolations) {
        if (!violation.discoveredDate) continue;

        const discoveredDate = new Date(violation.discoveredDate);

        if (violation.reportedDate) {
          const reportedDate = new Date(violation.reportedDate);
          const daysDiff = Math.ceil((reportedDate.getTime() - discoveredDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff > adaReportDeadlineDays) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V14-008',
              'DOD_FMR',
              daysDiff > 90 ? 'critical' : 'high',
              `ADA Violation Reporting Delay: ${daysDiff} Days`,
              `ADA violation "${violation.violationType}" (amount: $${violation.amount.toLocaleString()}): discovered on ${violation.discoveredDate} but not reported until ${violation.reportedDate} (${daysDiff} days gap). 31 U.S.C. 1351 requires violations to be reported "immediately" to the President and Congress. A ${daysDiff}-day delay is non-compliant.`,
              'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1351 - The head of the agency shall report immediately to the President and Congress all relevant facts and a statement of actions taken when an ADA violation is confirmed.',
              `Review the investigation and reporting process to identify bottlenecks. Ensure future ADA violations are reported within ${adaReportDeadlineDays} days as prescribed by DoD FMR Vol 14. Establish procedures for immediate preliminary notification while investigations continue.`,
              violation.amount,
              [violation.id]
            ));
          }
        } else if (violation.investigationStatus === 'confirmed') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V14-008',
            'DOD_FMR',
            'critical',
            `Confirmed ADA Violation Not Reported`,
            `ADA violation "${violation.violationType}" (amount: $${violation.amount.toLocaleString()}): confirmed but has no reported date. Discovered on ${violation.discoveredDate}, status: ${violation.investigationStatus}. 31 U.S.C. 1351 requires confirmed violations to be reported immediately. Failure to report is itself a violation of federal law.`,
            'DoD FMR Vol 14, Ch 3; 31 U.S.C. 1351 - Confirmed ADA violations must be reported immediately. The report must include all relevant facts, identification of responsible officers, and corrective actions taken.',
            'Immediately prepare and submit the ADA violation report. Include: (1) description of the violation, (2) amount, (3) appropriation charged, (4) responsible officer(s), (5) corrective actions taken, and (6) disciplinary action taken or proposed. Submit through the DoD chain of command.',
            violation.amount,
            [violation.id]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-009',
    name: 'ADA Investigation Completion',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Flags ADA violations with open or pending investigations that have not been completed, ensuring timely resolution',
    citation: 'DoD FMR Vol 14, Ch 3 - ADA investigation procedures',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const openInvestigations = data.dodData.adaViolations.filter(
        v => v.investigationStatus === 'detected' || v.investigationStatus === 'under_investigation'
      );

      for (const violation of openInvestigations) {
        const discoveredDate = new Date(violation.discoveredDate);
        const now = new Date();
        const daysOpen = Math.ceil((now.getTime() - discoveredDate.getTime()) / (1000 * 60 * 60 * 24));

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V14-009',
          'DOD_FMR',
          daysOpen > 180 ? 'critical' : 'high',
          `ADA Investigation Open: ${daysOpen} Days`,
          `ADA violation "${violation.violationType}" (amount: $${violation.amount.toLocaleString()}): investigation has been open for ${daysOpen} days since discovery on ${violation.discoveredDate}. Status: "${violation.investigationStatus}". ${violation.responsibleOfficer ? `Responsible officer: ${violation.responsibleOfficer}.` : 'No responsible officer identified.'} Open investigations should be completed promptly to determine if a reportable violation occurred.`,
          'DoD FMR Vol 14, Ch 3 - ADA investigations must be conducted promptly. The investigation should determine: (1) whether a violation occurred, (2) the amount, (3) responsible officer(s), and (4) corrective actions needed.',
          'Expedite the investigation to completion. Assign additional resources if needed. Determine whether the violation is confirmed or not substantiated. If confirmed, initiate the reporting process per 31 U.S.C. 1351 immediately. Document findings and corrective actions.',
          violation.amount,
          [violation.id]
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V14-010',
    name: 'Corrective Action Monitoring',
    framework: 'DOD_FMR',
    category: 'Anti-Deficiency Act (Volume 14)',
    description: 'Checks existing ADA violations for resolved status and monitors whether corrective actions have been completed',
    citation: 'DoD FMR Vol 14, Ch 3 - ADA corrective action and remediation requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check for confirmed violations without corrective action
      const confirmedWithoutCorrection = data.dodData.adaViolations.filter(
        v => (v.investigationStatus === 'confirmed' || v.investigationStatus === 'reported_to_president') &&
             (!v.correctiveAction || v.correctiveAction.trim() === '')
      );

      for (const violation of confirmedWithoutCorrection) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V14-010',
          'DOD_FMR',
          'high',
          `Confirmed ADA Violation Without Corrective Action`,
          `ADA violation "${violation.violationType}" (amount: $${violation.amount.toLocaleString()}, FY${violation.fiscalYear}): confirmed (status: ${violation.investigationStatus}) but no corrective action has been documented. DoD FMR Vol 14 requires that corrective actions be identified and implemented to prevent recurrence.`,
          'DoD FMR Vol 14, Ch 3 - Confirmed ADA violations must include a statement of corrective actions taken or planned. These corrective actions must address the root cause of the violation and prevent recurrence.',
          'Document the corrective actions taken or planned for this violation. Actions should address the root cause, such as implementing additional fund controls, providing training, updating procedures, or establishing automated checks. Include the corrective action plan in the violation report.',
          violation.amount,
          [violation.id]
        ));
      }

      // Aggregate summary for multiple unresolved violations
      const unresolvedViolations = data.dodData.adaViolations.filter(
        v => v.investigationStatus !== 'resolved'
      );

      if (unresolvedViolations.length >= 3) {
        const totalUnresolvedAmount = unresolvedViolations.reduce((sum, v) => sum + v.amount, 0);
        const byStatus = new Map<string, number>();
        for (const v of unresolvedViolations) {
          byStatus.set(v.investigationStatus, (byStatus.get(v.investigationStatus) || 0) + 1);
        }
        const statusSummary = Array.from(byStatus.entries())
          .map(([status, count]) => `${status}: ${count}`)
          .join(', ');

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V14-010',
          'DOD_FMR',
          'medium',
          `Multiple Unresolved ADA Violations`,
          `${unresolvedViolations.length} ADA violations totaling $${totalUnresolvedAmount.toLocaleString()} remain unresolved. Breakdown by status: ${statusSummary}. A high number of unresolved violations indicates systemic weaknesses in fund control and oversight.`,
          'DoD FMR Vol 14, Ch 3 - ADA violations must be investigated, reported, and resolved in a timely manner. Persistent or numerous violations indicate the need for systemic corrective action.',
          'Conduct a root cause analysis across all unresolved violations to identify common themes. Implement systemic corrective measures such as enhanced fund control automation, mandatory training, and strengthened approval workflows. Brief senior leadership on the status and trends.',
          totalUnresolvedAmount,
          unresolvedViolations.map(v => v.id)
        ));
      }

      return findings;
    },
  },
];
