import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const specialAccountsRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V12-001',
    name: 'Trust Fund Balance Verification',
    framework: 'DOD_FMR',
    category: 'Special Accounts (Volume 12)',
    description: 'Checks that FMS trust fund accounts maintain a positive balance, ensuring customer deposits are sufficient to cover disbursements',
    citation: 'DoD FMR Vol 12, Ch 1; 22 U.S.C. 2762 - Foreign Military Sales fund',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const fmsTrustAccounts = data.dodData.specialAccounts.filter(a => a.accountType === 'fms_trust');

      for (const account of fmsTrustAccounts) {
        if (account.balance < 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V12-001',
            'DOD_FMR',
            'critical',
            `FMS Trust Fund Negative Balance`,
            `FMS trust account "${account.accountName}" has a negative balance of $${account.balance.toLocaleString()}. Disbursements have exceeded available funds, indicating unauthorized expenditures or a failure to collect from the foreign customer prior to delivery. FMS trust funds hold fiduciary obligations on behalf of foreign governments and must maintain positive balances.`,
            'DoD FMR Vol 12, Ch 1; 22 U.S.C. 2762(d) - FMS deliveries should generally not occur until sufficient funds are deposited by the foreign purchaser. The trust fund balance must be positive.',
            'Investigate the cause of the negative balance. Determine if foreign customer payments are overdue and initiate collection. Suspend further deliveries until the balance is restored. Report as a potential violation of the Arms Export Control Act.',
            Math.abs(account.balance),
            ['Special Accounts - FMS Trust']
          ));
        } else if (account.balance === 0 && account.receipts > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V12-001',
            'DOD_FMR',
            'medium',
            `FMS Trust Fund Balance Fully Depleted`,
            `FMS trust account "${account.accountName}" has a zero balance despite having receipts of $${account.receipts.toLocaleString()} during the period. All customer deposits have been fully disbursed. Any additional deliveries or charges will create a negative balance.`,
            'DoD FMR Vol 12, Ch 1; 22 U.S.C. 2762 - Sufficient FMS trust fund balances must be maintained to cover planned disbursements.',
            'Review upcoming delivery schedules and ensure additional customer deposits are received before further disbursements. Coordinate with DSCA for collection support if needed.',
            null,
            ['Special Accounts - FMS Trust']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V12-002',
    name: 'Environmental Restoration Accounting',
    framework: 'DOD_FMR',
    category: 'Special Accounts (Volume 12)',
    description: 'Verifies that environmental restoration accounts are properly tracked with accurate balances and appropriate activity',
    citation: 'DoD FMR Vol 12, Ch 5; 10 U.S.C. 2703 - Environmental Restoration Account',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const envAccounts = data.dodData.specialAccounts.filter(a => a.accountType === 'environmental_restoration');

      for (const account of envAccounts) {
        // Verify balance integrity
        const computedBalance = account.receipts + account.transfersIn - account.disbursements - account.transfersOut;
        const balanceDiff = Math.abs(account.balance - computedBalance);

        if (balanceDiff > 1) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V12-002',
            'DOD_FMR',
            'high',
            `Environmental Restoration Account Balance Discrepancy`,
            `Environmental restoration account "${account.accountName}": reported balance of $${account.balance.toLocaleString()} differs from computed balance of $${computedBalance.toLocaleString()} (receipts $${account.receipts.toLocaleString()} + transfers in $${account.transfersIn.toLocaleString()} - disbursements $${account.disbursements.toLocaleString()} - transfers out $${account.transfersOut.toLocaleString()}). Difference: $${balanceDiff.toFixed(2)}.`,
            'DoD FMR Vol 12, Ch 5; 10 U.S.C. 2703 - Environmental restoration account funds must be tracked and reported accurately. The balance must reconcile to the underlying transaction activity.',
            'Reconcile the account and identify the source of the discrepancy. Verify all environmental restoration transactions are properly classified. Investigate whether the prior period balance was correctly carried forward.',
            balanceDiff,
            ['Special Accounts - Environmental Restoration']
          ));
        }

        // Check for negative balance
        if (account.balance < 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V12-002',
            'DOD_FMR',
            'high',
            `Environmental Restoration Account Negative Balance`,
            `Environmental restoration account "${account.accountName}" has a negative balance of $${account.balance.toLocaleString()}. Environmental restoration activities may be exceeding available funding authority.`,
            'DoD FMR Vol 12, Ch 5; 10 U.S.C. 2703 - Disbursements from the environmental restoration account must not exceed available authority.',
            'Verify the availability of funds and ensure all disbursements are within authorized limits. Request additional appropriations if the restoration program requires additional funding.',
            Math.abs(account.balance),
            ['Special Accounts - Environmental Restoration']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V12-003',
    name: 'Special Account Activity Monitoring',
    framework: 'DOD_FMR',
    category: 'Special Accounts (Volume 12)',
    description: 'Flags special accounts with no activity (receipts plus disbursements equal zero) that may be dormant and should be reviewed for closure',
    citation: 'DoD FMR Vol 12, Ch 1 - Special account reporting and monitoring requirements',
    defaultSeverity: 'low',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const account of data.dodData.specialAccounts) {
        const totalActivity = account.receipts + account.disbursements;

        if (totalActivity === 0) {
          if (account.balance !== 0) {
            // Has balance but no activity - stale balance
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V12-003',
              'DOD_FMR',
              'medium',
              `Special Account with Stale Balance and No Activity`,
              `Special account "${account.accountName}" (${account.accountType}) has a balance of $${account.balance.toLocaleString()} but no receipt or disbursement activity in FY${account.fiscalYear}. Stale balances in inactive accounts may indicate funds that should be returned to the general fund or transferred.`,
              'DoD FMR Vol 12, Ch 1 - Special account balances should be reviewed periodically. Inactive accounts with remaining balances should be dispositioned properly.',
              'Investigate the stale balance. Determine the original source of funds and whether they should be returned, transferred, or retained. Document the disposition decision and take action accordingly.',
              Math.abs(account.balance),
              ['Special Accounts - Activity']
            ));
          } else {
            // Zero balance and no activity - dormant account
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V12-003',
              'DOD_FMR',
              'low',
              `Dormant Special Account with No Activity or Balance`,
              `Special account "${account.accountName}" (${account.accountType}) has zero balance and no transaction activity in FY${account.fiscalYear}. Dormant special accounts should be reviewed for closure to simplify reporting and reduce administrative burden.`,
              'DoD FMR Vol 12, Ch 1 - Special accounts should be reviewed periodically and closed when no longer needed.',
              'Evaluate whether this special account is still required. If it is no longer needed, initiate procedures to close the account and remove it from reporting requirements.',
              null,
              ['Special Accounts - Activity']
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V12-004',
    name: 'Transfer Authorization',
    framework: 'DOD_FMR',
    category: 'Special Accounts (Volume 12)',
    description: 'Verifies that aggregate transfers in and transfers out across all special accounts are balanced overall, ensuring proper transfer authorization',
    citation: 'DoD FMR Vol 12, Ch 3; 31 U.S.C. 1532 - Transfer of funds between appropriations',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Check overall transfer balance across all special accounts
      let totalTransfersIn = 0;
      let totalTransfersOut = 0;

      for (const account of data.dodData.specialAccounts) {
        totalTransfersIn += account.transfersIn;
        totalTransfersOut += account.transfersOut;
      }

      const transferImbalance = Math.abs(totalTransfersIn - totalTransfersOut);

      if (transferImbalance > 1 && (totalTransfersIn > 0 || totalTransfersOut > 0)) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V12-004',
          'DOD_FMR',
          'medium',
          `Special Account Transfers Not Balanced Overall`,
          `Across all special accounts: total transfers in ($${totalTransfersIn.toLocaleString()}) and total transfers out ($${totalTransfersOut.toLocaleString()}) are not balanced. Imbalance: $${transferImbalance.toLocaleString()}. Internal transfers between special accounts should net to zero. An imbalance may indicate transfers to/from external accounts that require specific statutory authority.`,
          'DoD FMR Vol 12, Ch 3; 31 U.S.C. 1532 - Transfers between appropriations and funds require specific statutory authority. Internal transfers should balance across accounts.',
          'Reconcile all transfer transactions across special accounts. Identify which transfers are internal (between special accounts) and which are external. Verify that external transfers have proper statutory authorization. Correct any posting errors.',
          transferImbalance,
          ['Special Accounts - Transfers']
        ));
      }

      // Check individual accounts with large transfer volumes
      for (const account of data.dodData.specialAccounts) {
        const totalTransfers = account.transfersIn + account.transfersOut;
        const totalActivity = account.receipts + account.disbursements + totalTransfers;

        if (totalActivity > 0 && totalTransfers > 0 && totalTransfers / totalActivity > 0.50) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V12-004',
            'DOD_FMR',
            'medium',
            `High Transfer Volume on Special Account`,
            `Special account "${account.accountName}": total transfers (in: $${account.transfersIn.toLocaleString()}, out: $${account.transfersOut.toLocaleString()}) represent ${((totalTransfers / totalActivity) * 100).toFixed(1)}% of total account activity. High transfer volumes may indicate the account is being used as a pass-through, which requires specific statutory authority.`,
            'DoD FMR Vol 12, Ch 3; 31 U.S.C. 1532 - Transfers between appropriations and funds require specific statutory authority.',
            'Verify that each transfer has proper statutory or regulatory authorization. Document the authority for each transfer and ensure the account is being used for its intended purpose.',
            null,
            ['Special Accounts - Transfers']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V12-005',
    name: 'Balance Reconciliation',
    framework: 'DOD_FMR',
    category: 'Special Accounts (Volume 12)',
    description: 'Verifies that each special account balance equals the computed balance from receipts, disbursements, and transfers (balance = prior balance + receipts - disbursements + transfersIn - transfersOut)',
    citation: 'DoD FMR Vol 12, Ch 1 - Special account balance reconciliation requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const account of data.dodData.specialAccounts) {
        const computedBalance = account.receipts - account.disbursements + account.transfersIn - account.transfersOut;
        const difference = Math.abs(account.balance - computedBalance);

        if (difference > 0.01) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V12-005',
            'DOD_FMR',
            'high',
            `Special Account Balance Does Not Reconcile`,
            `Special account "${account.accountName}" (${account.accountType}): reported balance of $${account.balance.toLocaleString()} does not match the computed balance of $${computedBalance.toLocaleString()}. Computation: receipts ($${account.receipts.toLocaleString()}) - disbursements ($${account.disbursements.toLocaleString()}) + transfers in ($${account.transfersIn.toLocaleString()}) - transfers out ($${account.transfersOut.toLocaleString()}) = $${computedBalance.toLocaleString()}. Difference: $${difference.toFixed(2)}.`,
            'DoD FMR Vol 12, Ch 1 - Special account balances must be verifiable through the accounting equation. The balance should reconcile to the sum of all transactions plus the prior period balance.',
            'Investigate and resolve the balance discrepancy. Review all transactions posted to the account for the fiscal year. Verify that the opening balance was correctly carried forward from the prior period and that no transactions are missing or duplicated.',
            difference,
            ['Special Accounts - Reconciliation']
          ));
        }
      }

      return findings;
    },
  },
];
