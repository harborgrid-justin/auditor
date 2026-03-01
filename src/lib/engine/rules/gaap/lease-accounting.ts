import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const leaseAccountingRules: AuditRule[] = [
  {
    id: 'GAAP-LEASE-001',
    name: 'ROU Asset Without Corresponding Lease Liability',
    framework: 'GAAP',
    category: 'Lease Accounting (ASC 842)',
    description: 'Identifies right-of-use assets recorded without a corresponding lease liability, which violates ASC 842 recognition requirements',
    citation: 'ASC 842-20-25-1: A lessee shall recognize a right-of-use asset and a lease liability at the commencement date',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const rouAccounts = data.accounts.filter(a => a.subType === 'rou_asset');
      const leaseliabilityAccounts = data.accounts.filter(a => a.subType === 'lease_liability');

      const totalROU = rouAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const totalLeaseLiability = leaseliabilityAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalROU > 0 && totalLeaseLiability === 0) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-LEASE-001',
          'GAAP',
          'high',
          'Right-of-Use Asset Recorded Without Lease Liability',
          `A right-of-use asset of $${(totalROU / 1000000).toFixed(2)}M is recognized on the balance sheet, but no corresponding lease liability has been recorded. Under ASC 842, both the ROU asset and the lease liability must be recognized at lease commencement. The absence of a lease liability suggests either an omission in recording, an error in account classification, or a potential off-balance-sheet arrangement.`,
          'ASC 842-20-25-1: At the commencement date, a lessee shall recognize a right-of-use asset and a lease liability.',
          'Obtain the lease schedule and verify that all lease liabilities are properly recorded. Ensure lease liabilities are classified to the correct sub-type. If the ROU asset relates to a short-term lease exemption, verify that the lease term is 12 months or less and document the policy election.',
          totalROU,
          rouAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-LEASE-002',
    name: 'Lease Liability vs ROU Asset Balance Mismatch',
    framework: 'GAAP',
    category: 'Lease Accounting (ASC 842)',
    description: 'Detects significant imbalances between ROU asset and lease liability balances that may indicate measurement or recording errors',
    citation: 'ASC 842-20-30-1: Initial measurement of the right-of-use asset',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const rouAccounts = data.accounts.filter(a => a.subType === 'rou_asset');
      const leaseliabilityAccounts = data.accounts.filter(a => a.subType === 'lease_liability');

      const totalROU = rouAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const totalLeaseLiability = leaseliabilityAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalROU > 0 && totalLeaseLiability > 0) {
        const difference = Math.abs(totalROU - totalLeaseLiability);
        const thresholdPct = 0.05;
        const avgBalance = (totalROU + totalLeaseLiability) / 2;

        if (difference > avgBalance * thresholdPct && difference > data.materialityThreshold * 0.25) {
          const rouHigher = totalROU > totalLeaseLiability;
          findings.push(createFinding(
            data.engagementId,
            'GAAP-LEASE-002',
            'GAAP',
            'medium',
            'Lease Liability and ROU Asset Balance Mismatch',
            `The ROU asset balance ($${(totalROU / 1000000).toFixed(2)}M) and lease liability balance ($${(totalLeaseLiability / 1000000).toFixed(2)}M) differ by $${(difference / 1000).toFixed(0)}K (${((difference / avgBalance) * 100).toFixed(1)}%). ${rouHigher ? 'The ROU asset exceeds the lease liability, which may indicate initial direct costs or prepaid rent included in the ROU asset, or an understatement of the lease liability.' : 'The lease liability exceeds the ROU asset, which could indicate lease incentives received or an error in amortization calculations.'} While some divergence is expected from differing amortization patterns, the magnitude warrants investigation.`,
            'ASC 842-20-30-1: The ROU asset is initially measured at the amount of the lease liability, adjusted for prepayments, lease incentives, and initial direct costs.',
            'Obtain the detailed lease amortization schedule. Reconcile the ROU asset to the lease liability, accounting for initial direct costs, prepaid rent, lease incentives, and any impairment. Verify the discount rate used and that amortization patterns are applied correctly for each lease classification.',
            difference,
            [...rouAccounts, ...leaseliabilityAccounts].map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-LEASE-003',
    name: 'Operating Lease Amortization Reasonableness',
    framework: 'GAAP',
    category: 'Lease Accounting (ASC 842)',
    description: 'Validates that operating lease ROU asset amortization is reasonable relative to rent expense and lease balances',
    citation: 'ASC 842-20-25-6: Operating lease cost recognized on a straight-line basis over the lease term',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const rouAccounts = data.accounts.filter(a => a.subType === 'rou_asset');
      const rentExpenseAccounts = data.accounts.filter(
        a => a.accountName.toLowerCase().includes('rent') && a.accountType === 'expense'
      );

      const rouBeginning = rouAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const rouEnding = rouAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const rouAmortization = rouBeginning - rouEnding;
      const totalRentExpense = rentExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (rouBeginning > 0 && totalRentExpense > 0) {
        // For operating leases, the straight-line lease cost should approximate rent expense.
        // If amortization is significantly different from rent expense, it may indicate an error.
        const ratio = rouAmortization / totalRentExpense;

        if (ratio < 0.10 || ratio > 0.50) {
          const impliedLife = rouAmortization > 0 ? rouBeginning / rouAmortization : 0;
          findings.push(createFinding(
            data.engagementId,
            'GAAP-LEASE-003',
            'GAAP',
            'medium',
            'Operating Lease Amortization Appears Unreasonable',
            `ROU asset amortization of $${(rouAmortization / 1000).toFixed(0)}K represents only ${(ratio * 100).toFixed(1)}% of rent expense ($${(totalRentExpense / 1000000).toFixed(2)}M). ${ratio < 0.10 ? `The low amortization rate implies a remaining useful life of ${impliedLife.toFixed(1)} years, which may be excessively long and should be verified against actual lease terms.` : 'The high amortization relative to rent expense suggests potential errors in the amortization schedule or lease classification.'} Under ASC 842, operating lease cost should be recognized on a straight-line basis, and the ROU asset should be amortized consistently with the lease liability reduction pattern.`,
            'ASC 842-20-25-6: A lessee shall recognize operating lease cost on a straight-line basis over the lease term, unless another systematic basis is more representative.',
            'Obtain the lease amortization schedule and verify: (1) the discount rate applied, (2) the remaining lease term, (3) that renewal options are properly evaluated, and (4) that straight-line expense is correctly calculated. Compare to the actual lease agreements.',
            Math.abs(rouAmortization - totalRentExpense),
            [...rouAccounts, ...rentExpenseAccounts].map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
