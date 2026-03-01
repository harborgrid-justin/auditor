import type { AuditRule, EngagementData, AuditFinding } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

/**
 * SFFAS 54 – Federal Lease Accounting Rules
 *
 * These rules implement audit checks for SFFAS 54 "Leases" which becomes
 * effective for reporting periods beginning after September 30, 2026
 * (i.e., FY2027 and beyond). They cover lessee recognition, lessor
 * accounting, intragovernmental lease consistency, disclosure requirements,
 * liability amortization, and the short-term lease exception.
 *
 * Lease data is accessed via (data.dodData as any).leaseRecords for
 * forward compatibility until the DoDEngagementData type is extended.
 */

export const federalLeaseRules: AuditRule[] = [
  // ─────────────────────────────────────────────────────────────────────
  // DOD-FMR-V04-LEASE-001: Lessee Lease Recognition
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'DOD-FMR-V04-LEASE-001',
    name: 'Lessee Lease Recognition',
    framework: 'DOD_FMR',
    category: 'federal_lease_accounting',
    description:
      'For FY2027+, verifies that lease assets and liabilities are recognized for leases exceeding 24 months and above the capitalization threshold per SFFAS 54',
    citation: 'SFFAS 54 \u00b618-26; DoD FMR Vol 4, Ch 6',
    defaultSeverity: 'high',
    enabled: true,
    effectiveDate: '2026-10-01',
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      if (data.taxYear < 2027) return [];

      const findings: AuditFinding[] = [];
      const leaseRecords: any[] = (data.dodData as any).leaseRecords ?? [];

      if (leaseRecords.length === 0) return findings;

      const capThreshold = getParameter('DOD_LEASE_CAPITALIZATION_THRESHOLD', data.taxYear, undefined, 100000);
      const termThresholdMonths = getParameter('DOD_LEASE_TERM_THRESHOLD_MONTHS', data.taxYear, undefined, 24);

      const capitalizableLeases = leaseRecords.filter(
        (lr: any) =>
          lr.leaseTermMonths > termThresholdMonths &&
          lr.totalLeasePayments > capThreshold &&
          lr.role === 'lessee'
      );

      const missingAsset = capitalizableLeases.filter(
        (lr: any) => !lr.leaseAssetRecognized
      );

      const missingLiability = capitalizableLeases.filter(
        (lr: any) => !lr.leaseLiabilityRecognized
      );

      if (missingAsset.length > 0) {
        const totalImpact = missingAsset.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-001',
            'DOD_FMR',
            'high',
            'Lease Assets Not Recognized for Capitalizable Leases',
            `${missingAsset.length} lease(s) exceeding the ${termThresholdMonths}-month term threshold and $${capThreshold.toLocaleString('en-US')} capitalization threshold do not have a corresponding lease asset recognized. SFFAS 54 requires lessees to recognize a right-of-use lease asset at the commencement date for all leases other than short-term leases and intragovernmental leases. Total unrecognized lease payments: $${(totalImpact / 1000000).toFixed(2)}M.`,
            'SFFAS 54, Paragraphs 18-26: A lessee shall recognize a lease asset and a lease liability at the commencement of the lease term. DoD FMR Volume 4, Chapter 6.',
            'Identify all leases meeting the capitalization criteria and record right-of-use lease assets at the present value of lease payments. Ensure the lease asset is reported in the appropriate USSGL account (e.g., 1830 "Lease Assets").',
            totalImpact,
            missingAsset.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      if (missingLiability.length > 0) {
        const totalImpact = missingLiability.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-001',
            'DOD_FMR',
            'high',
            'Lease Liabilities Not Recognized for Capitalizable Leases',
            `${missingLiability.length} lease(s) exceeding the ${termThresholdMonths}-month term threshold and $${capThreshold.toLocaleString('en-US')} capitalization threshold do not have a corresponding lease liability recognized. SFFAS 54 requires lessees to recognize a lease liability measured at the present value of payments to be made during the lease term. Total unrecognized lease payments: $${(totalImpact / 1000000).toFixed(2)}M.`,
            'SFFAS 54, Paragraphs 18-26: A lessee shall recognize a lease liability at the commencement of the lease term. DoD FMR Volume 4, Chapter 6.',
            'Record lease liabilities at the present value of lease payments for all capitalizable leases. Use the appropriate discount rate per SFFAS 54 guidance. Report in USSGL liability accounts (e.g., 2940 "Lease Liabilities").',
            totalImpact,
            missingLiability.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      return findings;
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOD-FMR-V04-LEASE-002: Lessor Lease Accounting
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'DOD-FMR-V04-LEASE-002',
    name: 'Lessor Lease Accounting',
    framework: 'DOD_FMR',
    category: 'federal_lease_accounting',
    description:
      'Verifies that lessor accounting entries exist for DoD-owned property leased to others, including lease receivable recognition per SFFAS 54',
    citation: 'SFFAS 54 \u00b640-50; DoD FMR Vol 4, Ch 6',
    defaultSeverity: 'high',
    enabled: true,
    effectiveDate: '2026-10-01',
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      if (data.taxYear < 2027) return [];

      const findings: AuditFinding[] = [];
      const leaseRecords: any[] = (data.dodData as any).leaseRecords ?? [];

      const lessorLeases = leaseRecords.filter((lr: any) => lr.role === 'lessor');

      if (lessorLeases.length === 0) return findings;

      const missingReceivable = lessorLeases.filter(
        (lr: any) => !lr.leaseReceivableRecognized
      );

      const missingDeferredRevenue = lessorLeases.filter(
        (lr: any) => !lr.deferredRevenueRecognized
      );

      if (missingReceivable.length > 0) {
        const totalImpact = missingReceivable.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-002',
            'DOD_FMR',
            'high',
            'Lessor Lease Receivable Not Recognized',
            `${missingReceivable.length} lease(s) where DoD acts as lessor do not have lease receivables recognized. SFFAS 54 requires lessors to recognize a lease receivable at the commencement of the lease term for property leased to non-federal entities. Total unrecognized receivables: $${(totalImpact / 1000000).toFixed(2)}M.`,
            'SFFAS 54, Paragraphs 40-50: A lessor shall recognize a lease receivable and deferred revenue at the commencement of the lease term. DoD FMR Volume 4, Chapter 6.',
            'Record lease receivables for all lessor leases at the present value of expected lease payments. Classify in appropriate USSGL receivable accounts.',
            totalImpact,
            missingReceivable.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      if (missingDeferredRevenue.length > 0) {
        const totalImpact = missingDeferredRevenue.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-002',
            'DOD_FMR',
            'medium',
            'Lessor Deferred Revenue Not Recognized',
            `${missingDeferredRevenue.length} lease(s) where DoD acts as lessor do not have deferred revenue recognized. SFFAS 54 requires lessors to recognize deferred revenue corresponding to the lease receivable at lease commencement. Total unrecognized deferred revenue: $${(totalImpact / 1000000).toFixed(2)}M.`,
            'SFFAS 54, Paragraphs 40-50: A lessor shall recognize deferred revenue at the commencement of the lease term. DoD FMR Volume 4, Chapter 6.',
            'Record deferred revenue for all lessor leases. Recognize revenue over the lease term as it is earned. Report in appropriate USSGL deferred revenue accounts.',
            totalImpact,
            missingDeferredRevenue.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      return findings;
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOD-FMR-V04-LEASE-003: Intragovernmental Lease Consistency
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'DOD-FMR-V04-LEASE-003',
    name: 'Intragovernmental Lease Consistency',
    framework: 'DOD_FMR',
    category: 'federal_lease_accounting',
    description:
      'Checks that intragovernmental leases have matching buyer/seller entries to ensure proper elimination on government-wide financial statements',
    citation: 'SFFAS 54 \u00b651-55; DoD FMR Vol 4, Ch 6',
    defaultSeverity: 'high',
    enabled: true,
    effectiveDate: '2026-10-01',
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      if (data.taxYear < 2027) return [];

      const findings: AuditFinding[] = [];
      const leaseRecords: any[] = (data.dodData as any).leaseRecords ?? [];

      const intragovLeases = leaseRecords.filter(
        (lr: any) => lr.isIntragovernmental === true
      );

      if (intragovLeases.length === 0) return findings;

      const unmatchedLeases = intragovLeases.filter(
        (lr: any) => !lr.tradingPartnerMatched
      );

      if (unmatchedLeases.length > 0) {
        const totalImpact = unmatchedLeases.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        const tradingPartners = Array.from(
          new Set(unmatchedLeases.map((lr: any) => lr.tradingPartnerAgency).filter(Boolean))
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-003',
            'DOD_FMR',
            'high',
            'Intragovernmental Leases Missing Matching Entries',
            `${unmatchedLeases.length} intragovernmental lease(s) totaling $${(totalImpact / 1000000).toFixed(2)}M do not have confirmed matching entries with trading partner agencies${tradingPartners.length > 0 ? `: ${tradingPartners.join(', ')}` : ''}. SFFAS 54 requires that intragovernmental leases be reported consistently by both the lessee and lessor agencies to enable proper elimination on the government-wide financial statements.`,
            'SFFAS 54, Paragraphs 51-55: Intragovernmental leases must have consistent buyer/seller accounting. DoD FMR Volume 4, Chapter 6; Treasury Financial Manual, Federal Intragovernmental Transactions.',
            'Coordinate with each trading partner agency to reconcile lease terms, payment amounts, and accounting treatments. Ensure both parties classify the lease consistently and that amounts agree for elimination purposes.',
            totalImpact,
            unmatchedLeases.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      const inconsistentTerms = intragovLeases.filter(
        (lr: any) =>
          lr.tradingPartnerMatched &&
          lr.tradingPartnerTermMismatch === true
      );

      if (inconsistentTerms.length > 0) {
        const totalImpact = inconsistentTerms.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-003',
            'DOD_FMR',
            'medium',
            'Intragovernmental Lease Terms Inconsistent Between Agencies',
            `${inconsistentTerms.length} intragovernmental lease(s) totaling $${(totalImpact / 1000000).toFixed(2)}M have been matched with trading partners but show inconsistencies in lease terms, payment schedules, or classification. Both agencies must use consistent assumptions for lease term, discount rate, and payment amounts.`,
            'SFFAS 54, Paragraphs 51-55: Intragovernmental lease terms must be reported consistently by both parties. DoD FMR Volume 4, Chapter 6.',
            'Review the specific areas of inconsistency with each trading partner. Agree on common lease terms, discount rates, and payment schedules. Update records in both agencies to achieve consistency.',
            totalImpact,
            inconsistentTerms.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      return findings;
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOD-FMR-V04-LEASE-004: Lease Disclosure Requirements
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'DOD-FMR-V04-LEASE-004',
    name: 'Lease Disclosure Requirements',
    framework: 'DOD_FMR',
    category: 'federal_lease_accounting',
    description:
      'Verifies that required SFFAS 54 note disclosures exist for lease assets, liabilities, and related activity',
    citation: 'SFFAS 54 \u00b660-70; DoD FMR Vol 4, Ch 6',
    defaultSeverity: 'medium',
    enabled: true,
    effectiveDate: '2026-10-01',
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      if (data.taxYear < 2027) return [];

      const findings: AuditFinding[] = [];
      const leaseRecords: any[] = (data.dodData as any).leaseRecords ?? [];

      if (leaseRecords.length === 0) return findings;

      const leaseDisclosures: any = (data.dodData as any).leaseDisclosures;

      if (!leaseDisclosures) {
        const totalLeasePayments = leaseRecords.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-004',
            'DOD_FMR',
            'medium',
            'SFFAS 54 Lease Note Disclosures Missing',
            `The entity has ${leaseRecords.length} lease(s) totaling $${(totalLeasePayments / 1000000).toFixed(2)}M but no SFFAS 54 lease note disclosures were found. SFFAS 54 requires detailed note disclosures including general description of leasing arrangements, total lease assets and accumulated amortization, total lease liabilities, and future minimum lease payment schedules.`,
            'SFFAS 54, Paragraphs 60-70: Lessees and lessors must provide detailed note disclosures. DoD FMR Volume 4, Chapter 6.',
            'Prepare SFFAS 54 lease note disclosures including: (1) general description of leasing arrangements, (2) lease asset balances by major class with accumulated amortization, (3) lease liability balances, (4) future minimum payment schedule, (5) impairment losses recognized, and (6) intragovernmental vs. non-federal lease breakdowns.',
            null,
            leaseRecords.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
        return findings;
      }

      const requiredDisclosures: Array<{ key: string; label: string }> = [
        { key: 'generalDescription', label: 'general description of leasing arrangements' },
        { key: 'leaseAssetSummary', label: 'lease asset balances by major class with accumulated amortization' },
        { key: 'leaseLiabilitySummary', label: 'lease liability balances' },
        { key: 'futureMinimumPayments', label: 'future minimum lease payment schedule' },
        { key: 'impairmentDisclosure', label: 'lease impairment losses recognized during the period' },
        { key: 'intragovernmentalBreakdown', label: 'intragovernmental vs. non-federal lease breakdown' },
      ];

      const missingDisclosures = requiredDisclosures.filter(
        (rd) => !leaseDisclosures[rd.key]
      );

      if (missingDisclosures.length > 0) {
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-004',
            'DOD_FMR',
            'medium',
            'Incomplete SFFAS 54 Lease Note Disclosures',
            `${missingDisclosures.length} required SFFAS 54 lease disclosure(s) are missing: ${missingDisclosures.map((d) => d.label).join('; ')}. Complete note disclosures are required for fair presentation of the financial statements and compliance with federal accounting standards.`,
            'SFFAS 54, Paragraphs 60-70: Complete lease disclosures must be provided. DoD FMR Volume 4, Chapter 6.',
            `Prepare the missing disclosure(s): ${missingDisclosures.map((d) => d.label).join('; ')}. Ensure disclosures are consistent with the underlying lease data and presented in the notes to the financial statements.`,
            null,
            []
          )
        );
      }

      return findings;
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOD-FMR-V04-LEASE-005: Lease Liability Amortization
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'DOD-FMR-V04-LEASE-005',
    name: 'Lease Liability Amortization',
    framework: 'DOD_FMR',
    category: 'federal_lease_accounting',
    description:
      'Validates that lease liabilities are properly amortized with each payment allocated between principal reduction and interest expense per SFFAS 54',
    citation: 'SFFAS 54 \u00b627-35; DoD FMR Vol 4, Ch 6',
    defaultSeverity: 'high',
    enabled: true,
    effectiveDate: '2026-10-01',
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      if (data.taxYear < 2027) return [];

      const findings: AuditFinding[] = [];
      const leaseRecords: any[] = (data.dodData as any).leaseRecords ?? [];

      const capitalizedLesseeLeases = leaseRecords.filter(
        (lr: any) =>
          lr.role === 'lessee' &&
          lr.leaseLiabilityRecognized === true
      );

      if (capitalizedLesseeLeases.length === 0) return findings;

      const missingAmortization = capitalizedLesseeLeases.filter(
        (lr: any) => !lr.amortizationScheduleExists
      );

      if (missingAmortization.length > 0) {
        const totalImpact = missingAmortization.reduce(
          (sum: number, lr: any) => sum + (lr.leaseLiabilityBalance ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-005',
            'DOD_FMR',
            'high',
            'Lease Liability Amortization Schedule Missing',
            `${missingAmortization.length} capitalized lease(s) with recognized liabilities totaling $${(totalImpact / 1000000).toFixed(2)}M do not have an amortization schedule. SFFAS 54 requires that lease liabilities be reduced by the principal portion of each lease payment, with the interest portion recognized as interest expense. Without an amortization schedule, the liability reduction and interest expense allocation cannot be properly determined.`,
            'SFFAS 54, Paragraphs 27-35: Lease liabilities shall be amortized using the interest method. DoD FMR Volume 4, Chapter 6.',
            'Prepare an amortization schedule for each capitalized lease that allocates payments between principal and interest. Ensure the discount rate used is consistent with SFFAS 54 guidance. Record principal reductions and interest expense each period.',
            totalImpact,
            missingAmortization.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      const improperAmortization = capitalizedLesseeLeases.filter(
        (lr: any) =>
          lr.amortizationScheduleExists === true &&
          lr.amortizationVariance != null &&
          Math.abs(lr.amortizationVariance) > 1000
      );

      if (improperAmortization.length > 0) {
        const totalVariance = improperAmortization.reduce(
          (sum: number, lr: any) => sum + Math.abs(lr.amortizationVariance ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-005',
            'DOD_FMR',
            'medium',
            'Lease Liability Amortization Variance Detected',
            `${improperAmortization.length} lease(s) show variances between the amortization schedule and recorded amounts totaling $${(totalVariance / 1000000).toFixed(2)}M. The recorded lease liability balance does not agree with the expected balance per the amortization schedule. This may indicate errors in payment recording, incorrect discount rate application, or missed adjustments for lease modifications.`,
            'SFFAS 54, Paragraphs 27-35: Lease liabilities must be accurately measured and reported each period. DoD FMR Volume 4, Chapter 6.',
            'Reconcile the recorded lease liability to the amortization schedule for each identified lease. Investigate and correct variances. Update amortization schedules if lease terms have been modified.',
            totalVariance,
            improperAmortization.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      return findings;
    },
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOD-FMR-V04-LEASE-006: Short-Term Lease Exception
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'DOD-FMR-V04-LEASE-006',
    name: 'Short-Term Lease Exception',
    framework: 'DOD_FMR',
    category: 'federal_lease_accounting',
    description:
      'Verifies that short-term leases (24 months or less) are properly expensed rather than capitalized per the SFFAS 54 short-term lease exception',
    citation: 'SFFAS 54 \u00b615-17; DoD FMR Vol 4, Ch 6',
    defaultSeverity: 'medium',
    enabled: true,
    effectiveDate: '2026-10-01',
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      if (data.taxYear < 2027) return [];

      const findings: AuditFinding[] = [];
      const leaseRecords: any[] = (data.dodData as any).leaseRecords ?? [];

      if (leaseRecords.length === 0) return findings;

      const termThresholdMonths = getParameter('DOD_LEASE_TERM_THRESHOLD_MONTHS', data.taxYear, undefined, 24);

      const shortTermLeases = leaseRecords.filter(
        (lr: any) =>
          lr.role === 'lessee' &&
          lr.leaseTermMonths != null &&
          lr.leaseTermMonths <= termThresholdMonths
      );

      if (shortTermLeases.length === 0) return findings;

      const improperlyCapitalized = shortTermLeases.filter(
        (lr: any) =>
          lr.leaseAssetRecognized === true || lr.leaseLiabilityRecognized === true
      );

      if (improperlyCapitalized.length > 0) {
        const totalImpact = improperlyCapitalized.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-006',
            'DOD_FMR',
            'medium',
            'Short-Term Leases Improperly Capitalized',
            `${improperlyCapitalized.length} short-term lease(s) with terms of ${termThresholdMonths} months or less have been capitalized (lease asset or liability recognized) totaling $${(totalImpact / 1000000).toFixed(2)}M. SFFAS 54 provides a short-term lease exception: leases with a maximum possible term of ${termThresholdMonths} months or less (including options) should be expensed over the lease term rather than capitalized. Capitalizing these leases overstates both assets and liabilities on the Balance Sheet.`,
            'SFFAS 54, Paragraphs 15-17: Short-term leases with a maximum possible term of 24 months or less are exempt from capitalization. Lease payments shall be recognized as expense based on the payment provisions of the lease. DoD FMR Volume 4, Chapter 6.',
            'Remove the lease asset and lease liability for each improperly capitalized short-term lease. Reclassify the lease payments as period expense recognized over the lease term. Adjust the financial statements and related disclosures accordingly.',
            totalImpact,
            improperlyCapitalized.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      const notExpensed = shortTermLeases.filter(
        (lr: any) =>
          !lr.leaseAssetRecognized &&
          !lr.leaseLiabilityRecognized &&
          !lr.expenseRecognized
      );

      if (notExpensed.length > 0) {
        const totalImpact = notExpensed.reduce(
          (sum: number, lr: any) => sum + (lr.totalLeasePayments ?? 0),
          0
        );
        findings.push(
          createFinding(
            data.engagementId,
            'DOD-FMR-V04-LEASE-006',
            'DOD_FMR',
            'medium',
            'Short-Term Lease Expense Not Recognized',
            `${notExpensed.length} short-term lease(s) totaling $${(totalImpact / 1000000).toFixed(2)}M have neither been capitalized nor expensed. Short-term leases qualifying for the SFFAS 54 exception must still have their payments recognized as expense over the lease term. Failure to recognize any lease expense understates costs on the Statement of Net Cost.`,
            'SFFAS 54, Paragraphs 15-17: Short-term lease payments shall be recognized as expense. DoD FMR Volume 4, Chapter 6.',
            'Record lease expense for each short-term lease based on the payment provisions. Recognize expense on a straight-line basis or per the payment schedule over the lease term.',
            totalImpact,
            notExpensed.map((lr: any) => lr.leaseId ?? lr.id)
          )
        );
      }

      return findings;
    },
  },
];
