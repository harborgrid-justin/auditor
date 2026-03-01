import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const inventoryRules: AuditRule[] = [
  {
    id: 'GAAP-INV-001',
    name: 'Inventory Turnover Decline',
    framework: 'GAAP',
    category: 'Inventory (ASC 330)',
    description: 'Low inventory turnover may indicate obsolescence risk, requiring lower of cost or net realizable value assessment',
    citation: 'ASC 330-10-35-1B: Inventory measured at lower of cost and net realizable value',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const inventoryAccounts = data.accounts.filter(a => a.subType === 'inventory');
      const cogsAccounts = data.accounts.filter(a => a.subType === 'cost_of_goods_sold');

      const inventoryEnding = inventoryAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const inventoryBeginning = inventoryAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const totalCOGS = cogsAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (inventoryEnding > 0 && totalCOGS > 0) {
        const avgInventory = (inventoryBeginning + inventoryEnding) / 2;
        const turnoverRatio = totalCOGS / avgInventory;
        const daysInInventory = 365 / turnoverRatio;

        // Also compute prior period turnover if we have prior period data
        let priorTurnover: number | null = null;
        if (data.priorPeriodAccounts && data.priorPeriodAccounts.length > 0) {
          const priorInventory = data.priorPeriodAccounts
            .filter(a => a.subType === 'inventory')
            .reduce((sum, a) => sum + a.endingBalance, 0);
          const priorCOGS = data.priorPeriodAccounts
            .filter(a => a.subType === 'cost_of_goods_sold')
            .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
          if (priorInventory > 0 && priorCOGS > 0) {
            priorTurnover = priorCOGS / priorInventory;
          }
        }

        // Flag if turnover is below 4x annually (>91 days) which is generally slow
        if (turnoverRatio < 4.0) {
          const priorMsg = priorTurnover !== null
            ? ` Prior period turnover was ${priorTurnover.toFixed(1)}x.`
            : '';
          findings.push(createFinding(
            data.engagementId,
            'GAAP-INV-001',
            'GAAP',
            'medium',
            'Low Inventory Turnover Indicates Potential Obsolescence',
            `Inventory turnover is ${turnoverRatio.toFixed(1)}x (${daysInInventory.toFixed(0)} days in inventory), calculated from COGS of $${(totalCOGS / 1000000).toFixed(1)}M and average inventory of $${(avgInventory / 1000000).toFixed(2)}M.${priorMsg} A turnover below 4.0x may indicate slow-moving or obsolete inventory that requires a net realizable value assessment under ASC 330. Excess or obsolete inventory must be written down to NRV.`,
            'ASC 330-10-35-1B: A departure from the cost basis of pricing the inventory is required when the utility of the goods is no longer as great as its cost. Inventory shall be measured at the lower of cost and net realizable value.',
            'Perform an inventory aging analysis to identify slow-moving and obsolete items. Obtain management\'s NRV assessment and verify key assumptions. Review inventory reserve methodology and test the adequacy of any existing obsolescence reserve. Consider physical observation results.',
            null,
            inventoryAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-INV-002',
    name: 'Inventory Growth Exceeding Revenue Growth',
    framework: 'GAAP',
    category: 'Inventory (ASC 330)',
    description: 'Inventory growing faster than revenue may signal overproduction, demand issues, or potential overstatement',
    citation: 'ASC 330-10-35-1: Inventory pricing considerations',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const inventoryAccounts = data.accounts.filter(a => a.subType === 'inventory');
      const revenueAccounts = data.accounts.filter(a => a.accountType === 'revenue');

      const inventoryEnding = inventoryAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const inventoryBeginning = inventoryAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (inventoryBeginning > 0 && totalRevenue > 0) {
        const inventoryGrowthPct = (inventoryEnding - inventoryBeginning) / inventoryBeginning;

        // Compare with prior period to estimate revenue growth
        // Use financial statements if available for prior-period revenue
        let priorRevenue = 0;
        if (data.priorPeriodAccounts && data.priorPeriodAccounts.length > 0) {
          priorRevenue = data.priorPeriodAccounts
            .filter(a => a.accountType === 'revenue')
            .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        }

        // If we can't determine prior revenue, flag if inventory growth > 20% as it's concerning on its own
        const inventoryGrowthThreshold = priorRevenue > 0
          ? (totalRevenue - priorRevenue) / priorRevenue + 0.10 // flag if inventory grows 10%+ faster than revenue
          : 0.20;

        if (inventoryGrowthPct > inventoryGrowthThreshold) {
          const growthDelta = inventoryEnding - inventoryBeginning;
          findings.push(createFinding(
            data.engagementId,
            'GAAP-INV-002',
            'GAAP',
            'high',
            'Inventory Growth Significantly Exceeds Revenue Growth',
            `Inventory increased by ${(inventoryGrowthPct * 100).toFixed(1)}% ($${(growthDelta / 1000000).toFixed(2)}M) from $${(inventoryBeginning / 1000000).toFixed(2)}M to $${(inventoryEnding / 1000000).toFixed(2)}M.${priorRevenue > 0 ? ` Revenue grew by ${(((totalRevenue - priorRevenue) / priorRevenue) * 100).toFixed(1)}% over the same period.` : ''} Disproportionate inventory growth relative to revenue may indicate: (1) overproduction or excess purchasing, (2) declining demand or market shifts, (3) potential overstatement of inventory, or (4) channel stuffing in the supply chain. Under ASC 330, management must assess whether inventory costs are recoverable.`,
            'ASC 330-10-35-1B: Inventory shall be measured at the lower of cost and net realizable value.',
            'Investigate the drivers of inventory buildup by category (raw materials, WIP, finished goods). Review purchase orders and production plans relative to sales forecasts. Assess whether an inventory write-down is needed. Consider performing additional analytical procedures on gross margin by product line.',
            growthDelta,
            inventoryAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-INV-003',
    name: 'Negative or Zero Inventory Balances',
    framework: 'GAAP',
    category: 'Inventory (ASC 330)',
    description: 'Detects inventory accounts with negative or zero balances that may indicate recording errors or timing differences',
    citation: 'ASC 330-10-30-1: Inventory measurement at cost',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const inventoryAccounts = data.accounts.filter(a => a.subType === 'inventory');

      const negativeAccounts = inventoryAccounts.filter(a => a.endingBalance < 0);
      const zeroAccounts = inventoryAccounts.filter(
        a => a.endingBalance === 0 && a.beginningBalance > 0
      );

      if (negativeAccounts.length > 0) {
        const totalNegative = negativeAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
        findings.push(createFinding(
          data.engagementId,
          'GAAP-INV-003',
          'GAAP',
          'high',
          'Negative Inventory Balances Detected',
          `${negativeAccounts.length} inventory account(s) have negative ending balances totaling $${(totalNegative / 1000).toFixed(0)}K: ${negativeAccounts.map(a => `${a.accountName} ($${(a.endingBalance / 1000).toFixed(0)}K)`).join(', ')}. Negative inventory is physically impossible and typically indicates: (1) goods shipped but not yet received (timing/cutoff errors), (2) COGS recorded before purchase receipt, (3) data entry errors, or (4) inadequate perpetual inventory system controls.`,
          'ASC 330-10-30-1: The primary basis of accounting for inventories is cost.',
          'Investigate each negative balance by reviewing recent purchase orders, receipts, and shipments around period end. Verify proper cutoff procedures. Determine whether reclassification entries or adjustments are needed. Review the perpetual inventory system for posting errors.',
          Math.abs(totalNegative),
          negativeAccounts.map(a => a.accountNumber)
        ));
      }

      if (zeroAccounts.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-INV-003',
          'GAAP',
          'low',
          'Inventory Accounts Dropped to Zero Balance',
          `${zeroAccounts.length} inventory account(s) that had prior-period balances now show zero: ${zeroAccounts.map(a => `${a.accountName} (was $${(a.beginningBalance / 1000).toFixed(0)}K)`).join(', ')}. This may indicate a product line discontinuation, complete sell-through, or a reclassification. Verify that the write-off or sell-down is properly documented and that any related impairment or loss has been appropriately recognized.`,
          'ASC 330-10-35-1B: Inventory shall be measured at the lower of cost and net realizable value.',
          'Confirm whether the inventory was sold, written off, or transferred. If written off, ensure the charge is properly recorded in the income statement. If transferred, verify the reclassification is supported by documentation.',
          null,
          zeroAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
