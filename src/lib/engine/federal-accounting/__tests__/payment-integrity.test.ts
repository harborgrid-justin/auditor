import { describe, it, expect } from 'vitest';
import {
  performPaymentIntegrityAssessment,
  generatePIIAReportSection,
} from '@/lib/engine/federal-accounting/payment-integrity';
import type { DoDEngagementData } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyEngagementData(overrides: Partial<DoDEngagementData> = {}): DoDEngagementData {
  return {
    appropriations: [],
    obligations: [],
    ussglAccounts: [],
    ussglTransactions: [],
    disbursements: [],
    collections: [],
    militaryPayRecords: [],
    civilianPayRecords: [],
    travelOrders: [],
    travelVouchers: [],
    travelCardTransactions: [],
    contractPayments: [],
    contracts: [],
    interagencyAgreements: [],
    intragovernmentalTransactions: [],
    workingCapitalFunds: [],
    specialAccounts: [],
    nafAccounts: [],
    adaViolations: [],
    fiarAssessments: [],
    fundControls: [],
    budgetObjectCodes: [],
    sfisElements: [],
    fiscalYear: 2025,
    dodComponent: 'TEST-COMPONENT',
    ...overrides,
  };
}

// ===========================================================================
// performPaymentIntegrityAssessment
// ===========================================================================

describe('performPaymentIntegrityAssessment', () => {
  it('returns clean results when there are no improper payments', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-1',
          amount: 10000,
          disbursementDate: '2025-01-15',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-15T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-2',
          amount: 25000,
          disbursementDate: '2025-02-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-02-01T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.engagementId).toBe('eng-1');
    expect(result.fiscalYear).toBe(2025);
    expect(result.totalPaymentsReviewed).toBe(2);
    expect(result.totalPaymentAmount).toBe(35000);
    expect(result.improperPaymentCount).toBe(0);
    expect(result.improperPaymentAmount).toBe(0);
    expect(result.improperPaymentRate).toBe(0);
    expect(result.isSignificant).toBe(false);
    expect(result.duplicatePayments).toHaveLength(0);
    expect(result.overpayments).toHaveLength(0);
    expect(result.piiaCompliant).toBe(true);
  });

  it('detects duplicate disbursements with same payee, amount, within 30 days', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-03-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-03-01T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-03-05',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-03-05T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.duplicatePayments).toHaveLength(1);
    expect(result.duplicatePayments[0].category).toBe('duplicate_payment');
    expect(result.duplicatePayments[0].amount).toBe(5000);
    expect(result.duplicatePayments[0].vendorOrPayee).toBe('vendor-A');
    expect(result.duplicatePayments[0].detectionMethod).toBe('duplicate_detection');
    // 4 days apart -> high confidence (0.9)
    expect(result.duplicatePayments[0].confidence).toBe(0.9);
    expect(result.improperPaymentCount).toBe(1);
    expect(result.piiaCompliant).toBe(false);
  });

  it('does not flag disbursements beyond 30-day window as duplicates', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-01-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-03-15',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-03-15T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.duplicatePayments).toHaveLength(0);
  });

  it('does not flag cancelled or returned disbursements as duplicates', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-03-01',
          paymentMethod: 'eft',
          status: 'cancelled',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-03-01T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-03-05',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-03-05T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.duplicatePayments).toHaveLength(0);
  });

  it('detects duplicate contract payments with same contract/invoice/amount', () => {
    const data = emptyEngagementData({
      contractPayments: [
        {
          id: 'cp-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          contractNumber: 'W912HQ-25-C-0001',
          contractType: 'firm_fixed_price',
          vendorId: 'vendor-1',
          invoiceNumber: 'INV-100',
          invoiceAmount: 75000,
          approvedAmount: 75000,
          retainageAmount: 0,
          paymentType: 'invoice',
          dcaaAuditRequired: false,
          dcaaAuditStatus: 'not_required',
          paymentDate: '2025-02-01',
          status: 'paid',
        },
        {
          id: 'cp-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          contractNumber: 'W912HQ-25-C-0001',
          contractType: 'firm_fixed_price',
          vendorId: 'vendor-1',
          invoiceNumber: 'INV-100',
          invoiceAmount: 75000,
          approvedAmount: 75000,
          retainageAmount: 0,
          paymentType: 'invoice',
          dcaaAuditRequired: false,
          dcaaAuditStatus: 'not_required',
          paymentDate: '2025-02-15',
          status: 'paid',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.duplicatePayments).toHaveLength(1);
    expect(result.duplicatePayments[0].paymentType).toBe('contract');
    expect(result.duplicatePayments[0].amount).toBe(75000);
    expect(result.duplicatePayments[0].confidence).toBe(0.95);
    expect(result.duplicatePayments[0].description).toContain('W912HQ-25-C-0001');
    expect(result.duplicatePayments[0].description).toContain('INV-100');
  });

  it('detects overpayments where approved exceeds invoice amount', () => {
    const data = emptyEngagementData({
      contractPayments: [
        {
          id: 'cp-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          contractNumber: 'W912HQ-25-C-0002',
          contractType: 'cost_plus',
          vendorId: 'vendor-2',
          invoiceNumber: 'INV-200',
          invoiceAmount: 50000,
          approvedAmount: 60000, // $10k more than invoice
          retainageAmount: 0,
          paymentType: 'invoice',
          dcaaAuditRequired: true,
          dcaaAuditStatus: 'completed',
          paymentDate: '2025-04-01',
          status: 'paid',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.overpayments).toHaveLength(1);
    expect(result.overpayments[0].category).toBe('overpayment');
    expect(result.overpayments[0].estimatedImproperAmount).toBeCloseTo(10000, 0);
    expect(result.overpayments[0].description).toContain('exceeds invoice amount');
    expect(result.contractFindings).toBeGreaterThanOrEqual(1);
  });

  it('detects over-liquidation of obligations', () => {
    const data = emptyEngagementData({
      obligations: [
        {
          id: 'obl-1',
          engagementId: 'eng-1',
          appropriationId: 'app-1',
          obligationNumber: 'OBL-001',
          documentType: 'contract',
          vendorOrPayee: 'vendor-X',
          amount: 100000,
          obligatedDate: '2025-01-01',
          liquidatedAmount: 120000, // Over-liquidated by $20k
          unliquidatedBalance: -20000,
          adjustmentAmount: 0,
          status: 'partially_liquidated',
          fiscalYear: 2025,
          budgetObjectCode: '2500',
          createdBy: 'user-1',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-X',
          amount: 120000,
          disbursementDate: '2025-03-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-03-01T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    const overLiquidation = result.overpayments.find((f) =>
      f.description.includes('over-liquidated')
    );
    expect(overLiquidation).toBeDefined();
    expect(overLiquidation!.estimatedImproperAmount).toBeCloseTo(20000, 0);
    expect(overLiquidation!.paymentType).toBe('disbursement');
    expect(result.disbursementFindings).toBeGreaterThanOrEqual(1);
  });

  it('detects travel overpayments exceeding 10% of authorized amount', () => {
    const data = emptyEngagementData({
      travelOrders: [
        {
          id: 'to-1',
          engagementId: 'eng-1',
          travelerId: 'traveler-1',
          orderType: 'tdy',
          purpose: 'Conference attendance',
          originLocation: 'Fort Belvoir, VA',
          destinationLocation: 'San Antonio, TX',
          departDate: '2025-04-01',
          returnDate: '2025-04-05',
          authorizedAmount: 2000,
          actualAmount: 2500, // 25% over -> exceeds 10% threshold
          perDiemRate: 150,
          lodgingRate: 120,
          mieRate: 60,
          status: 'paid',
          authorizingOfficial: 'COL Smith',
          fiscalYear: 2025,
        },
        {
          id: 'to-2',
          engagementId: 'eng-1',
          travelerId: 'traveler-2',
          orderType: 'tdy',
          purpose: 'Training',
          originLocation: 'Pentagon, VA',
          destinationLocation: 'Huntsville, AL',
          departDate: '2025-05-01',
          returnDate: '2025-05-03',
          authorizedAmount: 1000,
          actualAmount: 1050, // 5% over -> within tolerance
          perDiemRate: 140,
          lodgingRate: 100,
          mieRate: 55,
          status: 'paid',
          authorizingOfficial: 'LTC Jones',
          fiscalYear: 2025,
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    // Only the first travel order should be flagged (25% over, >10%)
    const travelOverpayments = result.overpayments.filter((f) => f.paymentType === 'travel');
    expect(travelOverpayments).toHaveLength(1);
    expect(travelOverpayments[0].estimatedImproperAmount).toBeCloseTo(500, 0);
    expect(travelOverpayments[0].description).toContain('25.0%');
    expect(result.travelFindings).toBe(1);
  });

  it('calculates correct statistical rate', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-A',
          amount: 50000,
          disbursementDate: '2025-01-15',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-15T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-A',
          amount: 50000,
          disbursementDate: '2025-01-20',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-20T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    // One duplicate at $50k out of $100k total = 50% rate
    expect(result.improperPaymentAmount).toBe(50000);
    expect(result.totalPaymentAmount).toBe(100000);
    expect(result.improperPaymentRate).toBeCloseTo(50, 1);
  });

  it('flags as OMB significant when rate >= 1.5% and amount >= $10M', () => {
    // Create many disbursements so total is large enough
    const disbursements = [];
    // Two matching disbursements of $10M each to create a $10M duplicate
    disbursements.push({
      id: 'disb-dup-1',
      engagementId: 'eng-1',
      obligationId: 'obl-1',
      disbursementNumber: 'D-BIG-1',
      payeeId: 'mega-vendor',
      amount: 10_000_000,
      disbursementDate: '2025-01-01',
      paymentMethod: 'eft' as const,
      status: 'released' as const,
      discountAmount: 0,
      interestPenalty: 0,
      createdAt: '2025-01-01T00:00:00Z',
    });
    disbursements.push({
      id: 'disb-dup-2',
      engagementId: 'eng-1',
      obligationId: 'obl-2',
      disbursementNumber: 'D-BIG-2',
      payeeId: 'mega-vendor',
      amount: 10_000_000,
      disbursementDate: '2025-01-05',
      paymentMethod: 'eft' as const,
      status: 'released' as const,
      discountAmount: 0,
      interestPenalty: 0,
      createdAt: '2025-01-05T00:00:00Z',
    });
    // Total is $20M, duplicate is $10M -> rate = 50% >= 1.5%, amount $10M >= $10M -> significant
    const data = emptyEngagementData({ disbursements });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.isSignificant).toBe(true);
    expect(result.piiaCompliant).toBe(false);
    expect(result.complianceFindings.length).toBeGreaterThan(0);
    expect(result.correctiveActions.length).toBeGreaterThan(0);
    expect(result.correctiveActions.some((a) => a.includes('corrective action plan'))).toBe(true);
  });

  it('flags as OMB significant when amount >= $100M regardless of rate', () => {
    const disbursements = [];
    // Create two massive duplicates
    disbursements.push({
      id: 'disb-huge-1',
      engagementId: 'eng-1',
      obligationId: 'obl-1',
      disbursementNumber: 'D-HUGE-1',
      payeeId: 'giant-vendor',
      amount: 100_000_000,
      disbursementDate: '2025-01-01',
      paymentMethod: 'eft' as const,
      status: 'released' as const,
      discountAmount: 0,
      interestPenalty: 0,
      createdAt: '2025-01-01T00:00:00Z',
    });
    disbursements.push({
      id: 'disb-huge-2',
      engagementId: 'eng-1',
      obligationId: 'obl-2',
      disbursementNumber: 'D-HUGE-2',
      payeeId: 'giant-vendor',
      amount: 100_000_000,
      disbursementDate: '2025-01-10',
      paymentMethod: 'eft' as const,
      status: 'released' as const,
      discountAmount: 0,
      interestPenalty: 0,
      createdAt: '2025-01-10T00:00:00Z',
    });

    const data = emptyEngagementData({ disbursements });
    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.isSignificant).toBe(true);
    expect(result.improperPaymentAmount).toBeGreaterThanOrEqual(100_000_000);
  });

  it('assesses program risk levels when data is present', () => {
    const data = emptyEngagementData({
      militaryPayRecords: [
        {
          id: 'mp-1',
          engagementId: 'eng-1',
          memberId: 'member-1',
          payGrade: 'E-5',
          yearsOfService: 10,
          basicPay: 3500,
          bah: 1200,
          bas: 400,
          combatZoneExclusion: false,
          tspContribution: 175,
          tspMatchAmount: 175,
          separationPay: 0,
          retirementPay: 0,
          totalCompensation: 5100,
          fiscalYear: 2025,
          payPeriod: '2025-01',
          status: 'active',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      civilianPayRecords: [
        {
          id: 'civ-1',
          engagementId: 'eng-1',
          employeeId: 'emp-1',
          payPlan: 'GS',
          grade: '13',
          step: 5,
          locality: 'Washington-DC',
          basicPay: 8000,
          localityAdjustment: 2400,
          fehbContribution: 500,
          fegliContribution: 20,
          retirementContribution: 800,
          retirementPlan: 'fers',
          tspContribution: 400,
          tspMatchAmount: 400,
          premiumPay: 0,
          overtimePay: 0,
          leaveHoursAccrued: 8,
          totalCompensation: 12520,
          fiscalYear: 2025,
          payPeriod: '2025-01',
          status: 'active',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      travelOrders: [
        {
          id: 'to-1',
          engagementId: 'eng-1',
          travelerId: 'traveler-1',
          orderType: 'tdy',
          purpose: 'Conference',
          originLocation: 'Pentagon',
          destinationLocation: 'Huntsville',
          departDate: '2025-04-01',
          returnDate: '2025-04-03',
          authorizedAmount: 1000,
          actualAmount: 1000,
          perDiemRate: 150,
          lodgingRate: 100,
          mieRate: 55,
          status: 'paid',
          authorizingOfficial: 'COL Smith',
          fiscalYear: 2025,
        },
      ],
      contractPayments: [
        {
          id: 'cp-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          contractNumber: 'W912HQ-25-C-0003',
          contractType: 'firm_fixed_price',
          vendorId: 'vendor-3',
          invoiceNumber: 'INV-300',
          invoiceAmount: 50000,
          approvedAmount: 50000,
          retainageAmount: 0,
          paymentType: 'invoice',
          dcaaAuditRequired: false,
          dcaaAuditStatus: 'not_required',
          paymentDate: '2025-03-01',
          status: 'paid',
        },
      ],
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-3',
          amount: 50000,
          disbursementDate: '2025-03-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-03-01T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.programRiskLevels.length).toBeGreaterThanOrEqual(4);

    const milPay = result.programRiskLevels.find((p) => p.program.includes('Military Pay'));
    expect(milPay).toBeDefined();
    expect(milPay!.riskLevel).toBe('medium');

    const civPay = result.programRiskLevels.find((p) => p.program.includes('Civilian Pay'));
    expect(civPay).toBeDefined();
    expect(civPay!.riskLevel).toBe('medium');

    const travel = result.programRiskLevels.find((p) => p.program.includes('Travel'));
    expect(travel).toBeDefined();

    const contracts = result.programRiskLevels.find((p) => p.program.includes('Contract'));
    expect(contracts).toBeDefined();
  });

  it('flags travel program as high risk when >10% of orders exceed authorization', () => {
    // Create 10 travel orders, 2 that exceed by >5% to trigger high risk threshold
    const travelOrders = [];
    for (let i = 0; i < 10; i++) {
      travelOrders.push({
        id: `to-${i}`,
        engagementId: 'eng-1',
        travelerId: `traveler-${i}`,
        orderType: 'tdy' as const,
        purpose: 'Training',
        originLocation: 'Pentagon',
        destinationLocation: 'Huntsville',
        departDate: '2025-04-01',
        returnDate: '2025-04-03',
        authorizedAmount: 1000,
        // First 2 exceed by >5%; rest are at or under
        actualAmount: i < 2 ? 1200 : 1000,
        perDiemRate: 150,
        lodgingRate: 100,
        mieRate: 55,
        status: 'paid',
        authorizingOfficial: 'COL Smith',
        fiscalYear: 2025,
      });
    }

    const data = emptyEngagementData({ travelOrders });
    const result = performPaymentIntegrityAssessment('eng-1', data);

    const travelRisk = result.programRiskLevels.find((p) => p.program.includes('Travel'));
    expect(travelRisk).toBeDefined();
    // 2 out of 10 = 20% > 10% threshold -> high risk
    expect(travelRisk!.riskLevel).toBe('high');
  });

  it('counts findings by payment type correctly', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-01-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-A',
          amount: 5000,
          disbursementDate: '2025-01-05',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-05T00:00:00Z',
        },
      ],
      travelOrders: [
        {
          id: 'to-1',
          engagementId: 'eng-1',
          travelerId: 'traveler-1',
          orderType: 'tdy',
          purpose: 'Meeting',
          originLocation: 'Pentagon',
          destinationLocation: 'San Diego',
          departDate: '2025-02-01',
          returnDate: '2025-02-05',
          authorizedAmount: 1000,
          actualAmount: 1500, // 50% over
          perDiemRate: 150,
          lodgingRate: 100,
          mieRate: 55,
          status: 'paid',
          authorizingOfficial: 'COL Smith',
          fiscalYear: 2025,
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.disbursementFindings).toBeGreaterThanOrEqual(1);
    expect(result.travelFindings).toBe(1);
    expect(result.payrollFindings).toBe(0);
  });

  it('handles empty engagement data gracefully', () => {
    const data = emptyEngagementData();
    const result = performPaymentIntegrityAssessment('eng-empty', data);

    expect(result.totalPaymentsReviewed).toBe(0);
    expect(result.totalPaymentAmount).toBe(0);
    expect(result.improperPaymentCount).toBe(0);
    expect(result.improperPaymentRate).toBe(0);
    expect(result.isSignificant).toBe(false);
    expect(result.piiaCompliant).toBe(true);
    expect(result.duplicatePayments).toHaveLength(0);
    expect(result.overpayments).toHaveLength(0);
    expect(result.programRiskLevels).toHaveLength(0);
  });

  it('assigns higher confidence for duplicates within 7 days', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-Z',
          amount: 8000,
          disbursementDate: '2025-06-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-06-01T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-Z',
          amount: 8000,
          disbursementDate: '2025-06-03', // 2 days apart
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-06-03T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.duplicatePayments).toHaveLength(1);
    expect(result.duplicatePayments[0].confidence).toBe(0.9); // <= 7 days
  });

  it('assigns lower confidence for duplicates between 8-30 days', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-Z',
          amount: 8000,
          disbursementDate: '2025-06-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-06-01T00:00:00Z',
        },
        {
          id: 'disb-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-0002',
          payeeId: 'vendor-Z',
          amount: 8000,
          disbursementDate: '2025-06-20', // 19 days apart
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-06-20T00:00:00Z',
        },
      ],
    });

    const result = performPaymentIntegrityAssessment('eng-1', data);

    expect(result.duplicatePayments).toHaveLength(1);
    expect(result.duplicatePayments[0].confidence).toBe(0.7); // > 7 days
  });
});

// ===========================================================================
// generatePIIAReportSection
// ===========================================================================

describe('generatePIIAReportSection', () => {
  it('generates a compliant report section', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-0001',
          payeeId: 'vendor-1',
          amount: 10000,
          disbursementDate: '2025-01-15',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-15T00:00:00Z',
        },
      ],
    });

    const assessment = performPaymentIntegrityAssessment('eng-1', data);
    const report = generatePIIAReportSection(assessment);

    expect(report).toContain('PAYMENT INTEGRITY INFORMATION ACT (PIIA) ASSESSMENT');
    expect(report).toContain('Fiscal Year: 2025');
    expect(report).toContain('SUMMARY');
    expect(report).toContain('Improper Payment Rate:');
    expect(report).toContain('PIIA Compliant:             Yes');
    expect(report).toContain('OMB Significant:            No');
  });

  it('generates a non-compliant report with findings and corrective actions', () => {
    const data = emptyEngagementData({
      disbursements: [
        {
          id: 'disb-dup-1',
          engagementId: 'eng-1',
          obligationId: 'obl-1',
          disbursementNumber: 'D-BIG-1',
          payeeId: 'mega-vendor',
          amount: 10_000_000,
          disbursementDate: '2025-01-01',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'disb-dup-2',
          engagementId: 'eng-1',
          obligationId: 'obl-2',
          disbursementNumber: 'D-BIG-2',
          payeeId: 'mega-vendor',
          amount: 10_000_000,
          disbursementDate: '2025-01-05',
          paymentMethod: 'eft',
          status: 'released',
          discountAmount: 0,
          interestPenalty: 0,
          createdAt: '2025-01-05T00:00:00Z',
        },
      ],
    });

    const assessment = performPaymentIntegrityAssessment('eng-1', data);
    const report = generatePIIAReportSection(assessment);

    expect(report).toContain('PIIA Compliant:             NO');
    expect(report).toContain('OMB Significant:            YES');
    expect(report).toContain('FINDINGS');
    expect(report).toContain('CORRECTIVE ACTIONS');
    expect(report).toContain('corrective action plan');
  });

  it('includes program risk levels section when programs are present', () => {
    const data = emptyEngagementData({
      militaryPayRecords: [
        {
          id: 'mp-1',
          engagementId: 'eng-1',
          memberId: 'member-1',
          payGrade: 'E-5',
          yearsOfService: 10,
          basicPay: 3500,
          bah: 1200,
          bas: 400,
          combatZoneExclusion: false,
          tspContribution: 175,
          tspMatchAmount: 175,
          separationPay: 0,
          retirementPay: 0,
          totalCompensation: 5100,
          fiscalYear: 2025,
          payPeriod: '2025-01',
          status: 'active',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
    });

    const assessment = performPaymentIntegrityAssessment('eng-1', data);
    const report = generatePIIAReportSection(assessment);

    expect(report).toContain('PROGRAM RISK LEVELS');
    expect(report).toContain('Military Pay');
    expect(report).toContain('MEDIUM');
  });

  it('handles empty assessment data', () => {
    const data = emptyEngagementData();
    const assessment = performPaymentIntegrityAssessment('eng-empty', data);
    const report = generatePIIAReportSection(assessment);

    expect(report).toContain('Total Payments Reviewed:    0');
    expect(report).toContain('Improper Payments Found:    0');
    expect(report).toContain('PIIA Compliant:             Yes');
    // No program risk levels section since no programs
    expect(report).not.toContain('PROGRAM RISK LEVELS');
  });
});
