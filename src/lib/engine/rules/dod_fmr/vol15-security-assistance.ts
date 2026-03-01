import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const securityAssistanceRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V15-001',
    name: 'FMF Compliance',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies that security-related interagency agreements comply with Foreign Military Financing rules including proper fund tracking and obligation management',
    citation: 'DoD FMR Vol 15, Ch 4; 22 U.S.C. 2763 - Foreign Military Financing program',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check FMF-related appropriations
      const fmfAppropriations = data.dodData.appropriations.filter(
        a => a.appropriationTitle.toLowerCase().includes('foreign military financing') ||
             a.appropriationTitle.toLowerCase().includes('fmf')
      );

      for (const approp of fmfAppropriations) {
        // FMF funds expired with unobligated balance
        if (approp.status === 'expired' && approp.unobligatedBalance > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-001',
            'DOD_FMR',
            'high',
            `Expired FMF Appropriation with Unobligated Balance`,
            `FMF appropriation "${approp.appropriationTitle}" (${approp.treasuryAccountSymbol}) has expired with an unobligated balance of $${approp.unobligatedBalance.toLocaleString()}. FMF funds that expire unobligated may need to be returned to the Treasury and represent lost security assistance capability for partner nations.`,
            'DoD FMR Vol 15, Ch 4; 22 U.S.C. 2763 - FMF appropriations must be obligated within the period of availability. Expired FMF funds may not be used for new obligations.',
            'Determine if any valid adjustments can still be recorded against the expired account. Prepare documentation for the return of unobligated funds to the Treasury. Report the expiration to DSCA for program tracking and congressional notification.',
            approp.unobligatedBalance,
            ['Security Assistance - FMF']
          ));
        }

        // Over-obligation of FMF funds
        if (approp.obligated > approp.totalAuthority && approp.totalAuthority > 0) {
          const excess = approp.obligated - approp.totalAuthority;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-001',
            'DOD_FMR',
            'critical',
            `FMF Obligations Exceed Total Authority`,
            `FMF appropriation "${approp.appropriationTitle}": obligations of $${approp.obligated.toLocaleString()} exceed the total budget authority of $${approp.totalAuthority.toLocaleString()} by $${excess.toLocaleString()}. This is a potential Anti-Deficiency Act violation on security assistance funds.`,
            'DoD FMR Vol 15, Ch 4; 31 U.S.C. 1341 - Obligations shall not exceed the amount available in the appropriation. FMF fund violations have additional reporting implications under the Arms Export Control Act.',
            'Immediately investigate the over-obligation. Determine the cause and report as a potential ADA violation per DoD FMR Vol 14. Notify DSCA. Take corrective action to reduce obligations or obtain additional authority.',
            excess,
            ['Security Assistance - FMF']
          ));
        }
      }

      // Check FMS trust fund accounts for FMF compliance
      const fmsTrustAccounts = data.dodData.specialAccounts.filter(a => a.accountType === 'fms_trust');

      for (const account of fmsTrustAccounts) {
        // FMS accounts with disbursements far exceeding receipts
        if (account.disbursements > account.receipts * 1.20 && account.receipts > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-001',
            'DOD_FMR',
            'high',
            `FMS Trust Fund Disbursements Outpacing Receipts`,
            `FMS trust account "${account.accountName}": disbursements of $${account.disbursements.toLocaleString()} exceed receipts of $${account.receipts.toLocaleString()} by more than 20%. FMS operates on a customer-funded basis; disbursements outpacing deposits indicate deliveries are exceeding collections from foreign customers.`,
            'DoD FMR Vol 15, Ch 4; 22 U.S.C. 2762 - FMS cases should be funded by customer deposits before deliveries. The trust fund should not advance funds without authorization.',
            'Review FMS case billing and collection status. Issue demand letters for delinquent customer payments. Consider suspending deliveries on underfunded cases until adequate deposits are received.',
            account.disbursements - account.receipts,
            ['Security Assistance - FMF']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-002',
    name: 'Grant vs Loan Classification',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies proper classification of security assistance as grants or loans by examining FMS trust fund patterns and interagency agreement structures',
    citation: 'DoD FMR Vol 15, Ch 3; 22 U.S.C. 2761-2762 - FMS grant and credit distinctions',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check FMS trust accounts for grant vs loan classification indicators
      const fmsAccounts = data.dodData.specialAccounts.filter(a => a.accountType === 'fms_trust');

      for (const account of fmsAccounts) {
        // If receipts are zero but disbursements exist, this may indicate
        // a grant-funded (FMF) case incorrectly set up as a trust fund account
        if (account.receipts === 0 && account.disbursements > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-002',
            'DOD_FMR',
            'medium',
            `FMS Trust Account Classification Issue - No Receipts with Active Disbursements`,
            `FMS trust account "${account.accountName}": $${account.disbursements.toLocaleString()} in disbursements with zero receipts. This pattern is consistent with grant-funded (FMF) cases rather than cash FMS cases. Grant-funded cases require different accounting treatment and should be tracked through the FMF appropriation rather than as customer-funded trust fund activity.`,
            'DoD FMR Vol 15, Ch 3; 22 U.S.C. 2761-2762 - Grant-funded and cash FMS cases require different accounting treatments. Grants are funded through FMF appropriations, not customer deposits. Proper classification affects financial statement presentation and congressional reporting.',
            'Verify whether this is a grant-funded case or a cash case with delinquent collections. If grant-funded, ensure the proper FMF appropriation is charged and the trust fund accounting reflects the grant nature. If cash FMS, initiate collection from the foreign customer immediately.',
            account.disbursements,
            ['Security Assistance - Classification']
          ));
        }

        // Large transfers with no direct receipts or disbursements may indicate loan restructuring
        if (account.transfersIn > 0 && account.receipts === 0 && account.disbursements === 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-002',
            'DOD_FMR',
            'low',
            `FMS Trust Account with Transfers Only - Possible Loan Activity`,
            `FMS trust account "${account.accountName}": has transfers in of $${account.transfersIn.toLocaleString()} but no direct receipts or disbursements. This pattern may indicate FMS credit (loan) activity or restructured payment arrangements that should be classified and reported separately from cash and grant cases.`,
            'DoD FMR Vol 15, Ch 3; 22 U.S.C. 2763 - FMS credit (loan) programs have specific accounting and reporting requirements distinct from cash FMS and grant programs.',
            'Verify the nature of the transfer activity. Determine if this represents loan proceeds, grant transfers, or internal accounting movements. Ensure the proper classification is applied for reporting purposes.',
            null,
            ['Security Assistance - Classification']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-003',
    name: 'IMET Accounting',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies that IMET-related obligations are properly tracked with adequate obligation and disbursement rates',
    citation: 'DoD FMR Vol 15, Ch 5; 22 U.S.C. 2347 - International Military Education and Training',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check IMET-related appropriations
      const imetAppropriations = data.dodData.appropriations.filter(
        a => a.appropriationTitle.toLowerCase().includes('international military education') ||
             a.appropriationTitle.toLowerCase().includes('imet')
      );

      for (const approp of imetAppropriations) {
        // Low obligation rate on IMET funds
        if (approp.status === 'current' && approp.totalAuthority > 0) {
          const obligationRate = approp.obligated / approp.totalAuthority;

          if (obligationRate < 0.50) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V15-003',
              'DOD_FMR',
              'medium',
              `Low IMET Obligation Rate`,
              `IMET appropriation "${approp.appropriationTitle}": only ${(obligationRate * 100).toFixed(1)}% of the $${approp.totalAuthority.toLocaleString()} budget authority has been obligated ($${approp.obligated.toLocaleString()}). Low obligation rates may indicate program execution challenges, training schedule delays, or underutilization of IMET opportunities with partner nations.`,
              'DoD FMR Vol 15, Ch 5; 22 U.S.C. 2347 - IMET funds should be effectively utilized to support authorized training programs for foreign military and civilian personnel.',
              'Review IMET program execution with the Security Cooperation Office. Identify barriers to obligation such as country clearance issues, training seat availability, or partner nation participation. Develop an execution plan to ensure funds are utilized before expiration.',
              null,
              ['Security Assistance - IMET']
            ));
          }
        }

        // Low disbursement rate on obligated IMET funds
        if (approp.obligated > 0 && approp.status !== 'current') {
          const disbursementRate = approp.disbursed / approp.obligated;
          if (disbursementRate < 0.25) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V15-003',
              'DOD_FMR',
              'medium',
              `Low IMET Disbursement Rate on Obligated Funds`,
              `IMET appropriation "${approp.appropriationTitle}": only ${(disbursementRate * 100).toFixed(1)}% of obligated funds ($${approp.disbursed.toLocaleString()} of $${approp.obligated.toLocaleString()}) have been disbursed. Low disbursement rates indicate potential stale obligations that should be reviewed and deobligated if the underlying training requirement no longer exists.`,
              'DoD FMR Vol 15, Ch 5 - Obligations should be regularly reviewed and deobligated when the underlying requirement no longer exists. Stale obligations misrepresent the financial position.',
              'Review all outstanding IMET obligations. Verify that each obligation is supported by an active training agreement. Deobligate any stale or invalid obligations and return excess funds.',
              approp.obligated - approp.disbursed,
              ['Security Assistance - IMET']
            ));
          }
        }
      }

      // Check IMET-related obligations for proper tracking
      const imetObligations = data.dodData.obligations.filter(o => {
        const approp = data.dodData!.appropriations.find(a => a.id === o.appropriationId);
        return approp && (
          approp.appropriationTitle.toLowerCase().includes('imet') ||
          approp.appropriationTitle.toLowerCase().includes('international military education')
        );
      });

      for (const obligation of imetObligations) {
        if (obligation.status === 'open' && obligation.unliquidatedBalance > 0 && obligation.unliquidatedBalance === obligation.amount) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-003',
            'DOD_FMR',
            'low',
            `Fully Unliquidated IMET Obligation`,
            `IMET obligation ${obligation.obligationNumber}: $${obligation.amount.toLocaleString()} is fully unliquidated (no disbursements recorded). This may indicate the training has not commenced or billing has not been processed.`,
            'DoD FMR Vol 15, Ch 5 - IMET obligations should be liquidated as training services are delivered and billed.',
            'Verify the status of the training associated with this obligation. If training has occurred, ensure disbursements are processed. If training has been cancelled, deobligate the funds.',
            null,
            ['Security Assistance - IMET']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-004',
    name: 'Security Assistance Fund Tracking',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies proper fund allocation and tracking for security assistance appropriations including disbursement alignment and stale obligation monitoring',
    citation: 'DoD FMR Vol 15, Ch 2; DSCA policy - Security assistance fund management',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Identify security-assistance-related appropriations
      const saAppropriations = data.dodData.appropriations.filter(
        a => a.appropriationTitle.toLowerCase().includes('security assistance') ||
             a.appropriationTitle.toLowerCase().includes('foreign military') ||
             a.appropriationTitle.toLowerCase().includes('imet') ||
             a.appropriationTitle.toLowerCase().includes('fmf') ||
             a.appropriationTitle.toLowerCase().includes('security cooperation')
      );

      for (const approp of saAppropriations) {
        // Disbursements exceeding obligations
        if (approp.obligated > 0 && approp.disbursed > approp.obligated) {
          const excess = approp.disbursed - approp.obligated;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-004',
            'DOD_FMR',
            'critical',
            `Security Assistance Disbursements Exceed Obligations`,
            `Security assistance appropriation "${approp.appropriationTitle}": disbursements of $${approp.disbursed.toLocaleString()} exceed obligations of $${approp.obligated.toLocaleString()} by $${excess.toLocaleString()}. Disbursements without supporting obligations indicate a control failure and potential ADA violation.`,
            'DoD FMR Vol 15, Ch 2; 31 U.S.C. 1501 - All disbursements must be supported by valid recorded obligations.',
            'Investigate the over-disbursement immediately. Determine if obligations exist but are unrecorded, or if disbursements were made without proper obligation authority. Report as a potential ADA violation if confirmed.',
            excess,
            ['Security Assistance - Fund Tracking']
          ));
        }

        // Stale unliquidated obligations on expired/cancelled accounts
        if (approp.status === 'expired' || approp.status === 'cancelled') {
          const ulo = approp.obligated - approp.disbursed;
          if (ulo > 0 && approp.obligated > 0 && ulo > approp.obligated * 0.30) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V15-004',
              'DOD_FMR',
              'medium',
              `Stale Unliquidated Obligations in Security Assistance`,
              `Security assistance appropriation "${approp.appropriationTitle}" (${approp.status}): unliquidated obligations of $${ulo.toLocaleString()} represent ${((ulo / approp.obligated) * 100).toFixed(1)}% of total obligations. Stale ULOs in expired or cancelled accounts should be reviewed and deobligated if no longer valid.`,
              'DoD FMR Vol 15, Ch 2 - Unliquidated obligations should be reviewed at least annually and deobligated when no longer needed. This is particularly important for security assistance programs that may span multiple fiscal years.',
              'Conduct a comprehensive review of all outstanding security assistance obligations. Coordinate with DSCA and implementing agencies to verify the validity of each obligation. Deobligate any that are no longer valid.',
              ulo,
              ['Security Assistance - Fund Tracking']
            ));
          }
        }

        // Check for appropriations with no obligations (potentially unused allocation)
        if (approp.status === 'current' && approp.totalAuthority > 0 && approp.obligated === 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-004',
            'DOD_FMR',
            'low',
            `Security Assistance Appropriation with No Obligations`,
            `Security assistance appropriation "${approp.appropriationTitle}": total authority of $${approp.totalAuthority.toLocaleString()} but zero obligations recorded. The appropriation may not have been distributed or program execution has not commenced.`,
            'DoD FMR Vol 15, Ch 2 - Security assistance funds should be obligated in a timely manner to support authorized programs.',
            'Verify the fund distribution status. Coordinate with program managers to determine the execution timeline. Ensure funds are distributed and obligated before the end of the availability period.',
            null,
            ['Security Assistance - Fund Tracking']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V15-005',
    name: 'Case Closure Compliance',
    framework: 'DOD_FMR',
    category: 'Security Assistance (Volume 15)',
    description: 'Verifies that completed security assistance cases (represented by FMS trust accounts and completed interagency agreements) are properly closed out',
    citation: 'DoD FMR Vol 15, Ch 7; DSCA Manual 5105.38-M - FMS case closure procedures',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check FMS trust accounts for closure indicators
      const fmsTrustAccounts = data.dodData.specialAccounts.filter(a => a.accountType === 'fms_trust');

      for (const account of fmsTrustAccounts) {
        // Accounts with no activity but remaining balance may need closure
        if (account.receipts === 0 && account.disbursements === 0 && account.balance > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-005',
            'DOD_FMR',
            'medium',
            `Inactive FMS Case with Remaining Balance`,
            `FMS trust account "${account.accountName}": has a balance of $${account.balance.toLocaleString()} but no receipt or disbursement activity in FY${account.fiscalYear}. This may indicate a completed case that has not been formally closed. Open cases with idle balances tie up resources and create reporting complexity.`,
            'DoD FMR Vol 15, Ch 7; DSCA Manual 5105.38-M - FMS cases should be closed when all deliveries are complete, all disbursements are made, and final reconciliation is performed. Idle case balances should be returned to the customer or applied to other cases.',
            'Review the case status with the implementing agency. If all deliveries and services are complete, initiate case closure procedures. Reconcile the remaining balance and process a refund to the foreign customer or apply it to another active case as authorized.',
            account.balance,
            ['Security Assistance - Case Closure']
          ));
        }
      }

      // Check completed interagency agreements related to security assistance
      const saAgreements = data.dodData.interagencyAgreements.filter(
        iaa => iaa.status === 'completed' &&
               (iaa.agreementNumber.toLowerCase().includes('fms') ||
                iaa.agreementNumber.toLowerCase().includes('sa') ||
                iaa.servicingAgency.toLowerCase().includes('dsca') ||
                iaa.requestingAgency.toLowerCase().includes('dsca'))
      );

      for (const iaa of saAgreements) {
        const unbilledBalance = iaa.obligatedAmount - iaa.billedAmount;

        if (unbilledBalance > 0 && iaa.obligatedAmount > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-005',
            'DOD_FMR',
            'medium',
            `Completed Security Assistance Agreement with Unbilled Balance`,
            `Security assistance agreement ${iaa.agreementNumber}: completed but has an unbilled balance of $${unbilledBalance.toLocaleString()} (obligated: $${iaa.obligatedAmount.toLocaleString()}, billed: $${iaa.billedAmount.toLocaleString()}). Completed agreements should be fully reconciled and closed out promptly.`,
            'DoD FMR Vol 15, Ch 7 - Completed security assistance agreements must be reconciled. Excess obligations should be deobligated and unused funds returned.',
            'Reconcile the agreement by reviewing all billings and obligations. Deobligate the unbilled balance if work is complete. Process final billing if services were delivered but not billed. Close out the agreement and notify all parties.',
            unbilledBalance,
            ['Security Assistance - Case Closure']
          ));
        }

        const uncollectedAmount = iaa.billedAmount - iaa.collectedAmount;

        if (uncollectedAmount > 0 && iaa.billedAmount > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V15-005',
            'DOD_FMR',
            'medium',
            `Completed Security Assistance Agreement with Uncollected Balance`,
            `Security assistance agreement ${iaa.agreementNumber}: completed but has uncollected billings of $${uncollectedAmount.toLocaleString()} (billed: $${iaa.billedAmount.toLocaleString()}, collected: $${iaa.collectedAmount.toLocaleString()}). Cases cannot be formally closed until all collections are received.`,
            'DoD FMR Vol 15, Ch 7 - All collections must be received before a security assistance case can be formally closed.',
            'Follow up on outstanding collections. Issue demand letters if needed. Coordinate with DSCA and the foreign customer to resolve any billing disputes and expedite collection.',
            uncollectedAmount,
            ['Security Assistance - Case Closure']
          ));
        }
      }

      return findings;
    },
  },
];
