import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const contingencyRules: AuditRule[] = [
  {
    id: 'GAAP-CONT-001',
    name: 'Large Accrued Liabilities Changes',
    framework: 'GAAP',
    category: 'Contingencies (ASC 450)',
    description: 'Identifies significant changes in accrued liabilities that may indicate unrecorded or improperly measured loss contingencies',
    citation: 'ASC 450-20-25-2: Accrual of loss contingencies when probable and estimable',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const accruedLiabilityAccounts = data.accounts.filter(a => a.subType === 'accrued_liabilities');

      const accruedBeginning = accruedLiabilityAccounts.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);
      const accruedEnding = accruedLiabilityAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (accruedBeginning > 0) {
        const accruedChange = accruedEnding - accruedBeginning;
        const changePct = accruedChange / accruedBeginning;

        // Flag significant increases (>15%) which may indicate new contingencies
        if (changePct > 0.15 && Math.abs(accruedChange) > data.materialityThreshold * 0.25) {
          // Analyze what might be driving the increase
          const totalRevenue = data.accounts
            .filter(a => a.accountType === 'revenue')
            .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
          const accruedToRevenuePct = totalRevenue > 0 ? (accruedEnding / totalRevenue) * 100 : 0;

          findings.push(createFinding(
            data.engagementId,
            'GAAP-CONT-001',
            'GAAP',
            'medium',
            'Significant Increase in Accrued Liabilities',
            `Accrued liabilities increased by ${(changePct * 100).toFixed(1)}% ($${(accruedChange / 1000).toFixed(0)}K) from $${(accruedBeginning / 1000000).toFixed(2)}M to $${(accruedEnding / 1000000).toFixed(2)}M. Accrued liabilities represent ${accruedToRevenuePct.toFixed(1)}% of total revenue. A significant increase may indicate: (1) new loss contingencies requiring disclosure or accrual under ASC 450, (2) litigation reserves or legal settlements, (3) warranty obligation increases, (4) restructuring accruals, or (5) environmental or regulatory liabilities. Each accrual should be evaluated for proper measurement and whether the underlying contingency is probable, reasonably possible, or remote.`,
            'ASC 450-20-25-2: An estimated loss from a loss contingency shall be accrued if it is probable that a liability has been incurred and the amount can be reasonably estimated.',
            'Obtain the detailed accrued liabilities schedule and compare to prior period. Investigate all new or significantly changed accruals. For each material accrual, verify: (1) the nature of the contingency, (2) that the accrual is probable and reasonably estimable, (3) supporting documentation or legal opinions, (4) adequacy of disclosures for both accrued and reasonably possible contingencies. Review legal representation letters.',
            Math.abs(accruedChange),
            accruedLiabilityAccounts.map(a => a.accountNumber)
          ));
        }

        // Flag significant decreases (>25%) which may indicate released or reversed accruals
        if (changePct < -0.25 && Math.abs(accruedChange) > data.materialityThreshold * 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-CONT-001',
            'GAAP',
            'medium',
            'Significant Decrease in Accrued Liabilities',
            `Accrued liabilities decreased by ${(Math.abs(changePct) * 100).toFixed(1)}% ($${(Math.abs(accruedChange) / 1000).toFixed(0)}K) from $${(accruedBeginning / 1000000).toFixed(2)}M to $${(accruedEnding / 1000000).toFixed(2)}M. A significant decrease may indicate: (1) reversal of prior-period accruals that could inflate current-period income, (2) settlement of previously accrued contingencies at different amounts, (3) reclassification to other liability categories, or (4) premature release of reserves. Reversals of loss contingency accruals should be carefully evaluated under ASC 450.`,
            'ASC 450-20-25-2: Changes in estimates of loss contingencies require reassessment of probability and estimability criteria.',
            'Analyze each material decrease in accrued liabilities. Determine whether the reversal is appropriate (e.g., contingency resolved or estimate changed) or whether it represents earnings management. Verify that gains from contingency resolutions are properly presented in the income statement.',
            Math.abs(accruedChange),
            accruedLiabilityAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-CONT-002',
    name: 'Unrecorded Contingency Indicators',
    framework: 'GAAP',
    category: 'Contingencies (ASC 450)',
    description: 'Identifies potential unrecorded contingencies by examining patterns in expenses and liabilities that may suggest undisclosed obligations',
    citation: 'ASC 450-20-50: Disclosure of loss contingencies',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const indicators: string[] = [];

      // 1) Large professional/legal fees may indicate significant litigation
      const legalFeeAccounts = data.accounts.filter(a =>
        a.accountType === 'expense' &&
        (a.accountName.toLowerCase().includes('legal') ||
         a.accountName.toLowerCase().includes('professional') ||
         a.accountName.toLowerCase().includes('litigation'))
      );
      const totalLegalFees = legalFeeAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalRevenue = data.accounts
        .filter(a => a.accountType === 'revenue')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalRevenue > 0 && totalLegalFees / totalRevenue > 0.02) {
        indicators.push(`Professional/legal fees of $${(totalLegalFees / 1000).toFixed(0)}K represent ${((totalLegalFees / totalRevenue) * 100).toFixed(1)}% of revenue, which is elevated and may indicate significant pending litigation or regulatory matters`);
      }

      // 2) Check for large year-end journal entries to accrued liabilities (potential late-recognized contingencies)
      const yearEndAccrualJEs = data.journalEntries.filter(je => {
        const jeDate = new Date(je.date);
        const fyeDate = new Date(data.fiscalYearEnd);
        const daysBeforeEnd = (fyeDate.getTime() - jeDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysBeforeEnd < 0 || daysBeforeEnd > 15) return false;

        return je.lines.some(l =>
          (l.accountName?.toLowerCase().includes('accrued') ||
           l.accountName?.toLowerCase().includes('contingent') ||
           l.accountName?.toLowerCase().includes('reserve') ||
           l.accountName?.toLowerCase().includes('provision')) &&
          l.credit > data.materialityThreshold * 0.25
        );
      });

      if (yearEndAccrualJEs.length > 0) {
        const totalYearEndAccruals = yearEndAccrualJEs.reduce((sum, je) =>
          sum + je.lines.filter(l => l.credit > 0).reduce((s, l) => s + l.credit, 0), 0);
        indicators.push(`${yearEndAccrualJEs.length} journal entry/entries near year-end credited accrual/reserve accounts for a total of $${(totalYearEndAccruals / 1000).toFixed(0)}K, potentially representing last-minute contingency recognition`);
      }

      // 3) Insurance expense changes may indicate claims activity
      const insuranceAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('insurance') && a.accountType === 'expense'
      );
      if (insuranceAccounts.length > 0) {
        const insuranceBeginning = insuranceAccounts.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);
        const insuranceEnding = insuranceAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        if (insuranceBeginning > 0) {
          const insuranceIncrease = (insuranceEnding - insuranceBeginning) / insuranceBeginning;
          if (insuranceIncrease > 0.30) {
            indicators.push(`Insurance expense increased by ${(insuranceIncrease * 100).toFixed(0)}%, which may indicate increased claims activity, new risk exposures, or premium increases from adverse loss experience`);
          }
        }
      }

      // 4) Check for significant accrued liabilities relative to materiality with no prior period comparison
      const accruedLiabilityAccounts = data.accounts.filter(a => a.subType === 'accrued_liabilities');
      const totalAccrued = accruedLiabilityAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check if accrued liabilities seem low relative to company size (may indicate unrecorded items)
      if (totalRevenue > 0 && totalAccrued / totalRevenue < 0.01 && totalRevenue > 10000000) {
        indicators.push(`Accrued liabilities of $${(totalAccrued / 1000).toFixed(0)}K represent only ${((totalAccrued / totalRevenue) * 100).toFixed(2)}% of revenue ($${(totalRevenue / 1000000).toFixed(1)}M), which appears unusually low for a company of this size and may indicate unrecorded obligations`);
      }

      if (indicators.length > 0) {
        const severity = indicators.length >= 3 ? 'high' as const : 'medium' as const;
        findings.push(createFinding(
          data.engagementId,
          'GAAP-CONT-002',
          'GAAP',
          severity,
          'Potential Unrecorded Contingency Indicators',
          `${indicators.length} indicator(s) suggest potential unrecorded or inadequately disclosed contingencies: ${indicators.join('. ')}. Under ASC 450, loss contingencies that are reasonably possible must be disclosed even if not accrued, and probable losses with estimable amounts must be recorded. The absence of adequate contingency accruals or disclosures may result in a material misstatement.`,
          'ASC 450-20-50-3: Disclosure shall be made of a loss contingency that is at least reasonably possible, including an estimate of the possible loss or range of loss, or a statement that such an estimate cannot be made.',
          'Obtain management\'s analysis of all known contingencies including pending litigation, regulatory matters, and claims. Review legal representation letters from all counsel. Evaluate whether each contingency is properly classified as probable, reasonably possible, or remote. Verify that financial statement disclosures are complete and adequate for all material contingencies.',
          null,
          [...legalFeeAccounts, ...accruedLiabilityAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
