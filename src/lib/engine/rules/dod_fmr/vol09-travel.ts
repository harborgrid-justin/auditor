import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const travelRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V09-001',
    name: 'Per Diem Rate Compliance',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Checks if actual travel amounts exceed authorized amounts on travel orders, indicating potential per diem rate non-compliance',
    citation: 'DoD FMR Vol 9, Ch 4; JTR Ch 2 - Per diem rates and allowances',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const order of data.dodData.travelOrders) {
        if (order.actualAmount > order.authorizedAmount) {
          const excess = order.actualAmount - order.authorizedAmount;
          const excessPct = (excess / order.authorizedAmount) * 100;

          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V09-001',
            'DOD_FMR',
            excessPct > 20 ? 'high' : 'medium',
            `Per Diem Actual Exceeds Authorized Amount`,
            `Travel order ${order.id} for traveler ${order.travelerId} (${order.orderType.toUpperCase()} to ${order.destinationLocation}): actual amount of $${order.actualAmount.toFixed(2)} exceeds authorized amount of $${order.authorizedAmount.toFixed(2)} by $${excess.toFixed(2)} (${excessPct.toFixed(1)}%). Travel reimbursement should not exceed the authorized amount without an amended travel order.`,
            'DoD FMR Vol 9, Ch 4; JTR Ch 2, Sec 0206 - Per diem reimbursement shall not exceed authorized rates. Amounts exceeding authorization require an amended travel order.',
            'Verify whether an amended travel order was issued to cover the excess. If not, disallow the unauthorized excess amount and notify the traveler. If expenses were legitimate and mission-related, process an amended order with proper authorization.',
            excess,
            ['Travel - Per Diem']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-002',
    name: 'Lodging Rate Validation',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Verifies that lodging costs on travel vouchers do not exceed the authorized lodging rate multiplied by the number of travel nights',
    citation: 'DoD FMR Vol 9, Ch 4; JTR Ch 2, Sec 0205 - Lodging rates',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const order of data.dodData.travelOrders) {
        const vouchers = data.dodData.travelVouchers.filter(v => v.travelOrderId === order.id);

        for (const voucher of vouchers) {
          if (voucher.lodgingCost <= 0) continue;

          const departDate = new Date(order.departDate);
          const returnDate = new Date(order.returnDate);
          const nights = Math.max(1, Math.ceil((returnDate.getTime() - departDate.getTime()) / (1000 * 60 * 60 * 24)));
          const maxLodging = order.lodgingRate * nights;

          if (voucher.lodgingCost > maxLodging && maxLodging > 0) {
            const excess = voucher.lodgingCost - maxLodging;
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V09-002',
              'DOD_FMR',
              'medium',
              `Lodging Cost Exceeds Authorized Rate`,
              `Voucher ${voucher.voucherNumber} for travel order ${order.id}: lodging cost of $${voucher.lodgingCost.toFixed(2)} for ${nights} night(s) exceeds the authorized lodging rate of $${order.lodgingRate.toFixed(2)}/night (max allowable: $${maxLodging.toFixed(2)}). Excess: $${excess.toFixed(2)}.`,
              'DoD FMR Vol 9, Ch 4; JTR Ch 2, Sec 0205 - Lodging reimbursement shall not exceed the locality rate unless actual expense authority is granted.',
              'Verify lodging receipts against the authorized rate. Check for actual expense authorization or conference lodging rate approval. Disallow unauthorized excess amounts and advise the traveler.',
              excess,
              ['Travel - Lodging']
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-003',
    name: 'M&IE Compliance',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Checks meals and incidental expenses (M&IE) reasonableness against the authorized M&IE rate for the travel destination',
    citation: 'DoD FMR Vol 9, Ch 4; JTR Ch 2, Sec 0206 - M&IE rates',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const order of data.dodData.travelOrders) {
        const vouchers = data.dodData.travelVouchers.filter(v => v.travelOrderId === order.id);

        for (const voucher of vouchers) {
          if (voucher.mealsCost <= 0) continue;

          const departDate = new Date(order.departDate);
          const returnDate = new Date(order.returnDate);
          const travelDays = Math.max(1, Math.ceil((returnDate.getTime() - departDate.getTime()) / (1000 * 60 * 60 * 24)));
          const maxMIE = order.mieRate * travelDays;

          if (voucher.mealsCost > maxMIE && maxMIE > 0) {
            const excess = voucher.mealsCost - maxMIE;
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V09-003',
              'DOD_FMR',
              'medium',
              `M&IE Cost Exceeds Authorized Rate`,
              `Voucher ${voucher.voucherNumber} for traveler to ${order.destinationLocation}: meals/incidental cost of $${voucher.mealsCost.toFixed(2)} for ${travelDays} day(s) exceeds the authorized M&IE rate of $${order.mieRate.toFixed(2)}/day (max allowable: $${maxMIE.toFixed(2)}). Excess: $${excess.toFixed(2)}.`,
              'DoD FMR Vol 9, Ch 4; JTR Ch 2, Sec 0206 - M&IE reimbursement shall not exceed the published rate for the TDY location. First and last travel days are reimbursed at 75% of the M&IE rate.',
              'Verify the M&IE rate for the destination against GSA/DoS rate tables. Confirm whether government-provided meals reduced the M&IE entitlement. Disallow unauthorized excess amounts.',
              excess,
              ['Travel - M&IE']
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-004',
    name: 'Travel Order Authorization',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Verifies that all travel orders have a designated authorizing official to establish proper travel authorization',
    citation: 'DoD FMR Vol 9, Ch 2; JTR Ch 1 - Travel order requirements and authorization',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const order of data.dodData.travelOrders) {
        if (!order.authorizingOfficial || order.authorizingOfficial.trim() === '') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V09-004',
            'DOD_FMR',
            'high',
            `Travel Order Missing Authorizing Official`,
            `Travel order ${order.id} for traveler ${order.travelerId} (${order.orderType.toUpperCase()} to ${order.destinationLocation}, authorized amount $${order.authorizedAmount.toFixed(2)}) does not have a designated authorizing official. A valid travel authorization requires approval by an authorized official before travel commences.`,
            'DoD FMR Vol 9, Ch 2; JTR Ch 1 - All travel must be authorized in advance by an official with delegated authority. Travel orders without proper authorization are not valid for reimbursement.',
            'Obtain retroactive authorization from the appropriate authorizing official with documented justification. Ensure future travel orders are properly authorized before travel begins. Review delegation of authority to confirm the approving official has proper authority level.',
            order.authorizedAmount,
            ['Travel - Authorization']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-005',
    name: 'Voucher Settlement Timeliness',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Checks the gap between voucher filing date and settlement date to ensure timely processing within regulatory standards',
    citation: 'DoD FMR Vol 9, Ch 2; JTR Ch 1 - Travel voucher settlement timelines',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const voucher of data.dodData.travelVouchers) {
        if (!voucher.filedDate) continue;

        const filedDate = new Date(voucher.filedDate);

        if (voucher.settledDate) {
          const settledDate = new Date(voucher.settledDate);
          const daysDiff = Math.ceil((settledDate.getTime() - filedDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff > 30) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V09-005',
              'DOD_FMR',
              daysDiff > 60 ? 'high' : 'medium',
              `Travel Voucher Settlement Delayed`,
              `Voucher ${voucher.voucherNumber}: filed on ${voucher.filedDate} but not settled until ${voucher.settledDate} (${daysDiff} days). DoD policy requires travel vouchers to be processed within 30 days of submission. Total claim: $${voucher.totalClaim.toFixed(2)}.`,
              'DoD FMR Vol 9, Ch 2; JTR Ch 1 - Travel vouchers should be settled within 30 calendar days of a properly filed claim. Prompt Payment Act timelines also apply to travel reimbursements.',
              'Investigate the cause of the settlement delay. Identify process bottlenecks in the review and approval chain. Implement priority processing for aged vouchers and ensure adequate staffing in the travel office.',
              null,
              ['Travel - Voucher Settlement']
            ));
          }
        } else if (voucher.status === 'submitted' || voucher.status === 'approved') {
          // Voucher filed but not yet settled - check age
          const now = new Date();
          const daysPending = Math.ceil((now.getTime() - filedDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysPending > 30) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V09-005',
              'DOD_FMR',
              daysPending > 60 ? 'high' : 'medium',
              `Travel Voucher Pending Settlement Beyond 30 Days`,
              `Voucher ${voucher.voucherNumber}: filed on ${voucher.filedDate} and has been pending for ${daysPending} days without settlement. Status: "${voucher.status}". Total claim: $${voucher.totalClaim.toFixed(2)}.`,
              'DoD FMR Vol 9, Ch 2; JTR Ch 1 - Travel vouchers should be settled within 30 calendar days of filing.',
              'Expedite processing of this voucher. Determine if additional documentation is required from the traveler. Ensure the voucher is properly queued for payment.',
              voucher.totalClaim,
              ['Travel - Voucher Settlement']
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-006',
    name: 'Travel Card Delinquency',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Checks travel card transactions for 60-day or 90-plus day delinquency status indicating non-compliance with travel card payment requirements',
    citation: 'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31 - Travel card delinquency management',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const delinquentStatuses = ['60_day', '90_plus', 'charge_off'];

      // Group delinquent transactions by traveler
      const delinquentByTraveler = new Map<string, { count: number; totalAmount: number; worstStatus: string }>();

      for (const txn of data.dodData.travelCardTransactions) {
        if (delinquentStatuses.includes(txn.delinquencyStatus)) {
          const existing = delinquentByTraveler.get(txn.travelerId) || { count: 0, totalAmount: 0, worstStatus: txn.delinquencyStatus };
          existing.count += 1;
          existing.totalAmount += txn.amount;
          if (delinquentStatuses.indexOf(txn.delinquencyStatus) > delinquentStatuses.indexOf(existing.worstStatus)) {
            existing.worstStatus = txn.delinquencyStatus;
          }
          delinquentByTraveler.set(txn.travelerId, existing);
        }
      }

      for (const [travelerId, info] of Array.from(delinquentByTraveler.entries())) {
        const severity = info.worstStatus === '90_plus' || info.worstStatus === 'charge_off' ? 'critical' : 'high';
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V09-006',
          'DOD_FMR',
          severity,
          `Travel Card Delinquency: ${info.worstStatus.replace(/_/g, ' ')}`,
          `Traveler ${travelerId} has ${info.count} delinquent travel card transaction(s) totaling $${info.totalAmount.toFixed(2)} with worst status of "${info.worstStatus.replace(/_/g, ' ')}". Delinquencies over 60 days require management notification and potential salary offset per DoD policy.`,
          'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31, Vol 3, Enc 5 - Delinquent accounts must be reported and managed through progressive discipline and salary offset procedures.',
          'Initiate delinquency management procedures: (1) issue written notice to the cardholder, (2) notify the supervisor and commander, (3) for 61+ day delinquencies, begin salary offset procedures per 37 U.S.C. 1007. Suspend travel card privileges if warranted.',
          info.totalAmount,
          ['Travel - Travel Card Delinquency']
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-007',
    name: 'Split Disbursement Compliance',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Verifies that split disbursement is applied when the Government Travel Charge Card is used, directing the GTCC-charged portion to the card vendor',
    citation: 'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31 - Split disbursement requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const voucher of data.dodData.travelVouchers) {
        if (voucher.travelCardUsed && !voucher.splitDisbursement && voucher.totalClaim > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V09-007',
            'DOD_FMR',
            'medium',
            `Split Disbursement Not Applied on Travel Card Voucher`,
            `Voucher ${voucher.voucherNumber} indicates the GTCC was used but split disbursement was not applied. When the GTCC is used, DoD policy requires split disbursement to direct the GTCC-charged portion directly to the card vendor to reduce delinquency risk. Voucher total: $${voucher.totalClaim.toFixed(2)}.`,
            'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31, Vol 3, Enc 4 - Split disbursement is mandatory when the GTCC is used for official travel expenses.',
            'Ensure the voucher is processed with split disbursement. Direct the GTCC-charged portion of the reimbursement to the travel card contractor and the remainder to the traveler. Update the disbursement instructions if needed.',
            null,
            ['Travel - Split Disbursement']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-008',
    name: 'Travel Card Mandatory Use',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Verifies that the Government Travel Charge Card is used for TDY travel orders as required by DoD policy',
    citation: 'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31 - Government Travel Charge Card mandatory use',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const order of data.dodData.travelOrders) {
        if (order.orderType !== 'tdy') continue;

        const vouchers = data.dodData.travelVouchers.filter(v => v.travelOrderId === order.id);

        for (const voucher of vouchers) {
          if (!voucher.travelCardUsed && voucher.totalClaim > 0) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V09-008',
              'DOD_FMR',
              'medium',
              `Government Travel Card Not Used for TDY Travel`,
              `Voucher ${voucher.voucherNumber} for traveler ${order.travelerId} (TDY to ${order.destinationLocation}) totaling $${voucher.totalClaim.toFixed(2)} did not use the Government Travel Charge Card (GTCC). DoD policy mandates GTCC use for all official TDY travel expenses unless an exemption has been granted.`,
              'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31, Vol 3 - The GTCC is mandatory for all official travel expenses during TDY travel.',
              'Verify whether the traveler has a valid GTCC exemption (e.g., mission-critical situation, remote location, new employee pending card issuance). If no exemption exists, counsel the traveler and report the non-compliance to the Agency Program Coordinator.',
              null,
              ['Travel - Travel Card']
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-009',
    name: 'Advance Reconciliation',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Compares travel advance amounts against total claims on vouchers to identify unreconciled advances and potential amounts owed to the government',
    citation: 'DoD FMR Vol 9, Ch 6 - Travel advance policy and reconciliation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const voucher of data.dodData.travelVouchers) {
        if (voucher.advanceAmount <= 0) continue;

        if (voucher.advanceAmount > voucher.totalClaim) {
          const amountOwed = voucher.advanceAmount - voucher.totalClaim;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V09-009',
            'DOD_FMR',
            'high',
            `Travel Advance Exceeds Total Claim - Amount Owed to Government`,
            `Voucher ${voucher.voucherNumber}: advance of $${voucher.advanceAmount.toFixed(2)} exceeds the total claim of $${voucher.totalClaim.toFixed(2)}. The traveler owes $${amountOwed.toFixed(2)} to the government. Excess advances must be returned promptly to avoid a potential Anti-Deficiency Act concern.`,
            'DoD FMR Vol 9, Ch 6 - Travel advances must be reconciled within 30 days of return from travel. Excess advances must be returned to the government.',
            'Initiate collection of the excess advance amount. If the traveler does not voluntarily repay, process a payroll deduction. Track the receivable until fully collected.',
            amountOwed,
            ['Travel - Advance']
          ));
        }

        // Flag large advances relative to claim (advance > 80% of claim may indicate over-advance)
        if (voucher.advanceAmount > voucher.totalClaim * 0.80 && voucher.advanceAmount <= voucher.totalClaim && voucher.status === 'submitted') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V09-009',
            'DOD_FMR',
            'low',
            `Travel Advance Approaching Total Claim Amount`,
            `Voucher ${voucher.voucherNumber}: advance of $${voucher.advanceAmount.toFixed(2)} is ${((voucher.advanceAmount / voucher.totalClaim) * 100).toFixed(1)}% of the total claim ($${voucher.totalClaim.toFixed(2)}). While within limits, this high advance-to-claim ratio should be monitored to ensure timely settlement.`,
            'DoD FMR Vol 9, Ch 6 - Travel advances should be limited to estimated out-of-pocket expenses.',
            'Monitor voucher settlement to ensure timely reconciliation. Review advance policies to ensure advances are limited to estimated out-of-pocket expenses.',
            null,
            ['Travel - Advance']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V09-010',
    name: 'Unreconciled Transactions',
    framework: 'DOD_FMR',
    category: 'Travel (Volume 9)',
    description: 'Checks travel card transactions where reconciledToVoucher is false, indicating transactions not matched to a travel voucher',
    citation: 'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31 - Travel card reconciliation',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Group unreconciled transactions by traveler
      const unreconciledByTraveler = new Map<string, { count: number; totalAmount: number; transactions: string[] }>();

      for (const txn of data.dodData.travelCardTransactions) {
        if (!txn.reconciledToVoucher) {
          const existing = unreconciledByTraveler.get(txn.travelerId) || { count: 0, totalAmount: 0, transactions: [] };
          existing.count += 1;
          existing.totalAmount += txn.amount;
          existing.transactions.push(`${txn.merchantName} ($${txn.amount.toFixed(2)}, ${txn.transactionDate})`);
          unreconciledByTraveler.set(txn.travelerId, existing);
        }
      }

      for (const [travelerId, info] of Array.from(unreconciledByTraveler.entries())) {
        const txnSummary = info.transactions.length > 3
          ? info.transactions.slice(0, 3).join('; ') + `; and ${info.transactions.length - 3} more`
          : info.transactions.join('; ');

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V09-010',
          'DOD_FMR',
          info.count >= 5 ? 'high' : 'medium',
          `Unreconciled Travel Card Transactions`,
          `Traveler ${travelerId} has ${info.count} travel card transaction(s) totaling $${info.totalAmount.toFixed(2)} not reconciled to any travel voucher. Transactions: ${txnSummary}. Unreconciled transactions may indicate personal use of the government travel card or missing travel vouchers.`,
          'DoD FMR Vol 9, Ch 3; DoD Instruction 5154.31 - All travel card transactions must be reconciled to an approved travel voucher. Unreconciled transactions must be investigated.',
          'Investigate each unreconciled transaction. Determine if the transaction was for official travel and match it to the appropriate voucher. If personal use is identified, initiate collection procedures. Counsel the cardholder on proper GTCC use.',
          info.totalAmount,
          ['Travel - Travel Card Reconciliation']
        ));
      }

      return findings;
    },
  },
];
