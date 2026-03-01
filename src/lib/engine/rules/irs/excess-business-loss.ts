import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const excessBusinessLossRules: AuditRule[] = [
  {
    id: 'IRS-EBL-001',
    name: 'Excess Business Loss Limitation',
    framework: 'IRS',
    category: 'Excess Business Loss',
    description: 'For non-corporate (pass-through) entities, checks if net business losses exceed the §461(l) threshold',
    citation: 'IRC §461(l) - Limitation on excess business losses of noncorporate taxpayers',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // §461(l) applies to noncorporate taxpayers — check for pass-through entity indicators
      const passThrough = data.taxData.filter(t =>
        t.formType === '1065' ||
        t.formType === '1120-S' ||
        t.description.toLowerCase().includes('k-1') ||
        t.description.toLowerCase().includes('pass-through') ||
        t.description.toLowerCase().includes('schedule c') ||
        t.description.toLowerCase().includes('schedule f')
      );

      // C-corps are not subject to §461(l)
      const isCCorp = data.entityType === 'c_corp' ||
        data.taxData.some(t => t.formType === '1120' && !t.formType.includes('S'));

      if (passThrough.length === 0 && !isCCorp) return findings;
      if (isCCorp) return findings; // §461(l) does not apply to C-corps

      // Get the applicable threshold based on filing status
      const mfjThreshold = getParameter('EXCESS_BUSINESS_LOSS_MFJ', taxYear, data.entityType ?? undefined, 610000);
      const singleThreshold = getParameter('EXCESS_BUSINESS_LOSS_SINGLE', taxYear, data.entityType ?? undefined, 305000);

      // Compute aggregate business losses
      // Business losses include: operating losses from pass-through entities, Schedule C/F losses
      const businessLossData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return (t.formType === '1065' || t.formType === '1120-S' || t.formType === '1040') &&
          (desc.includes('loss') || desc.includes('net income') || desc.includes('ordinary income') ||
           desc.includes('business income') || desc.includes('schedule c') || desc.includes('schedule f')) &&
          t.amount < 0;
      });

      // Also check for business loss indicators in accounts
      const businessLossAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return a.accountType === 'expense' &&
          (name.includes('business loss') ||
           name.includes('operating loss') ||
           name.includes('net loss') ||
           name.includes('pass-through loss'));
      });

      const totalBusinessLoss = businessLossData.reduce((sum, t) => sum + Math.abs(t.amount), 0) +
        businessLossAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Also include current year net business income/loss from pass-through data
      const passIncome = passThrough
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      const passLoss = passThrough
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const netBusinessLoss = Math.max(0, (passLoss + totalBusinessLoss) - passIncome);

      if (netBusinessLoss === 0) return findings;

      // Check both thresholds — use MFJ as it's the more generous limit
      // In practice, the filing status would be known, but we flag if either threshold is exceeded
      if (netBusinessLoss > mfjThreshold) {
        const excessMFJ = netBusinessLoss - mfjThreshold;
        const excessSingle = netBusinessLoss - singleThreshold;
        findings.push(createFinding(
          data.engagementId,
          'IRS-EBL-001',
          'IRS',
          'high',
          'Excess Business Loss Limitation Exceeded',
          `Aggregate net business losses of $${(netBusinessLoss / 1000).toFixed(0)}K exceed the §461(l) excess business loss threshold. For married filing jointly: threshold $${(mfjThreshold / 1000).toFixed(0)}K, excess $${(excessMFJ / 1000).toFixed(0)}K. For single filers: threshold $${(singleThreshold / 1000).toFixed(0)}K, excess $${(excessSingle / 1000).toFixed(0)}K. The excess business loss is disallowed and treated as a net operating loss (NOL) carryforward to the succeeding taxable year.`,
          'IRC §461(l)(1): In the case of a taxpayer other than a corporation, any excess business loss of the taxpayer for the taxable year shall not be allowed. IRC §461(l)(2): The excess business loss is treated as a net operating loss carryforward to the following taxable year under §172.',
          'Determine the taxpayer\'s filing status to apply the correct threshold (MFJ: $' + (mfjThreshold / 1000).toFixed(0) + 'K / Single: $' + (singleThreshold / 1000).toFixed(0) + 'K). Compute the excess business loss and disallow it on the current year return. Carry the disallowed amount forward as an NOL under §172 (subject to the 80% taxable income limitation). Ensure the limitation is applied after the §469 passive activity rules.',
          excessMFJ
        ));
      } else if (netBusinessLoss > singleThreshold) {
        const excessSingle = netBusinessLoss - singleThreshold;
        findings.push(createFinding(
          data.engagementId,
          'IRS-EBL-001',
          'IRS',
          'medium',
          'Excess Business Loss May Be Limited — Filing Status Dependent',
          `Aggregate net business losses of $${(netBusinessLoss / 1000).toFixed(0)}K exceed the §461(l) threshold for single filers ($${(singleThreshold / 1000).toFixed(0)}K) but are within the married filing jointly threshold ($${(mfjThreshold / 1000).toFixed(0)}K). If the taxpayer files as single or separately, $${(excessSingle / 1000).toFixed(0)}K would be disallowed and treated as an NOL carryforward. Confirm the filing status to determine applicability.`,
          'IRC §461(l)(3)(A): Excess business loss means the excess of aggregate deductions attributable to trades or businesses over the sum of aggregate gross income from such trades or businesses plus a threshold amount ($' + (singleThreshold / 1000).toFixed(0) + 'K single / $' + (mfjThreshold / 1000).toFixed(0) + 'K MFJ for ' + taxYear + ').',
          'Confirm the taxpayer\'s filing status. If single, head of household, or married filing separately, compute the excess business loss and disallow the amount exceeding the threshold. The disallowed loss carries forward as an NOL. Document the computation on the workpapers.',
          excessSingle
        ));
      }

      return findings;
    },
  },
];
