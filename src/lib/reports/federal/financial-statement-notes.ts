/**
 * Notes to Financial Statements Generator
 *
 * Generates required note disclosures per OMB A-136 Section II.5.
 * Notes provide additional detail and context beyond the face of the
 * principal financial statements.
 *
 * References:
 *   - OMB Circular A-136, Section II.5
 *   - SFFAS 1, 5, 6, 7, 47
 *   - DoD FMR Vol 6A, Ch 4
 */

import type { EngagementData } from '@/types/findings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FinancialStatementNote {
  noteNumber: number;
  title: string;
  content: string;
  subNotes: Array<{ subtitle: string; content: string }>;
  requiredByStandard: string;
  applicable: boolean;
}

export interface NotesPackage {
  fiscalYear: number;
  agencyName: string;
  notes: FinancialStatementNote[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate Notes to Financial Statements from engagement data.
 * Dynamically includes/excludes notes based on data presence.
 */
export function generateFinancialStatementNotes(data: EngagementData): NotesPackage {
  const dodData = data.dodData;
  const fy = data.taxYear;
  const notes: FinancialStatementNote[] = [];

  // Note 1: Summary of Significant Accounting Policies
  notes.push({
    noteNumber: 1,
    title: 'Summary of Significant Accounting Policies',
    content: `The accompanying financial statements have been prepared in conformity ` +
      `with accounting principles generally accepted in the United States as ` +
      `promulgated by the Federal Accounting Standards Advisory Board (FASAB). ` +
      `The reporting entity applies SFFAS standards for recognition, measurement, ` +
      `and disclosure of financial transactions.`,
    subNotes: [
      {
        subtitle: 'Basis of Accounting',
        content: 'Both proprietary and budgetary accounting is maintained using the ' +
          'United States Standard General Ledger (USSGL) at the transaction level. ' +
          'Proprietary accounting uses the accrual basis; budgetary accounting uses ' +
          'the modified accrual basis.',
      },
      {
        subtitle: 'Basis of Presentation',
        content: 'Financial statements are presented in accordance with OMB Circular A-136. ' +
          'Intragovernmental and public amounts are separately disclosed.',
      },
      {
        subtitle: 'Fund Balance with Treasury',
        content: 'Fund Balance with Treasury represents the aggregate amount of funds ' +
          'in the entity\'s accounts with the U.S. Treasury from which the entity is ' +
          'authorized to make expenditures and pay liabilities. FBWT is reconciled ' +
          'monthly to Treasury records.',
      },
    ],
    requiredByStandard: 'OMB A-136 §II.5.1; SFFAS 1',
    applicable: true,
  });

  // Note 2: Fund Balance with Treasury
  const hasAppropriations = dodData && dodData.appropriations.length > 0;
  notes.push({
    noteNumber: 2,
    title: 'Fund Balance with Treasury',
    content: hasAppropriations
      ? `As of September 30, ${fy}, the entity's Fund Balance with Treasury ` +
        `consists of appropriated funds, revolving funds, and other fund types.`
      : 'No Fund Balance with Treasury data available for the current period.',
    subNotes: hasAppropriations ? [
      {
        subtitle: 'Fund Balance Composition',
        content: `Appropriated Funds: Available across ${dodData!.appropriations.length} ` +
          `Treasury Account Symbols. Total authority: $${dodData!.appropriations.reduce((s, a) => s + a.totalAuthority, 0).toLocaleString()}.`,
      },
      {
        subtitle: 'Status of FBWT',
        content: `Unobligated Balance Available: $${dodData!.appropriations.reduce((s, a) => s + a.unobligatedBalance, 0).toLocaleString()}. ` +
          `Obligated Balance Not Yet Disbursed: $${dodData!.appropriations.reduce((s, a) => s + (a.obligated - a.disbursed), 0).toLocaleString()}.`,
      },
    ] : [],
    requiredByStandard: 'SFFAS 1 ¶¶19-24',
    applicable: !!hasAppropriations,
  });

  // Note 3: Accounts Receivable
  notes.push({
    noteNumber: 3,
    title: 'Accounts Receivable, Net',
    content: 'Accounts receivable represent amounts owed to the entity from other ' +
      'federal agencies (intragovernmental) and non-federal sources (public). ' +
      'An allowance for uncollectible accounts is established for public receivables.',
    subNotes: [],
    requiredByStandard: 'SFFAS 1 ¶¶25-33',
    applicable: true,
  });

  // Note 4: Other Assets
  notes.push({
    noteNumber: 4,
    title: 'Other Assets',
    content: 'Other assets include advances to contractors, travel advances, ' +
      'and prepaid expenses recognized in accordance with SFFAS 1.',
    subNotes: [],
    requiredByStandard: 'SFFAS 1 ¶¶34-41',
    applicable: true,
  });

  // Note 5: Liabilities Not Covered by Budgetary Resources
  const hasLiabilities = dodData?.actuarialLiabilities && dodData.actuarialLiabilities.length > 0;
  notes.push({
    noteNumber: 5,
    title: 'Liabilities Not Covered by Budgetary Resources',
    content: 'Liabilities not covered by budgetary resources represent amounts owed ' +
      'by the entity for which congressional action is needed before budgetary ' +
      'resources can be provided. These include unfunded employee benefit liabilities, ' +
      'environmental cleanup costs, and other unfunded liabilities.',
    subNotes: hasLiabilities ? [
      {
        subtitle: 'Federal Employee Benefits',
        content: `Total actuarial liabilities: $${dodData!.actuarialLiabilities!.reduce((s, a) => s + a.totalLiability, 0).toLocaleString()}. ` +
          `Unfunded portion: $${dodData!.actuarialLiabilities!.reduce((s, a) => s + a.unfundedPortion, 0).toLocaleString()}.`,
      },
    ] : [],
    requiredByStandard: 'SFFAS 5; OMB A-136 §II.5.5',
    applicable: true,
  });

  // Note 6: Environmental and Disposal Liabilities
  const hasEnvLiabilities = dodData?.environmentalLiabilities && dodData.environmentalLiabilities.length > 0;
  notes.push({
    noteNumber: 6,
    title: 'Environmental and Disposal Liabilities',
    content: hasEnvLiabilities
      ? `The entity has recognized environmental cleanup and disposal liabilities ` +
        `for ${dodData!.environmentalLiabilities!.length} sites totaling ` +
        `$${dodData!.environmentalLiabilities!.reduce((s, e) => s + e.recordedLiability, 0).toLocaleString()}.`
      : 'Environmental and disposal liabilities are recognized when environmental ' +
        'cleanup costs are probable and reasonably estimable per SFFAS 5 and SFFAS 6.',
    subNotes: hasEnvLiabilities ? [
      {
        subtitle: 'Cleanup Cost Estimates',
        content: `Total estimated cleanup costs: $${dodData!.environmentalLiabilities!.reduce((s, e) => s + e.estimatedCost, 0).toLocaleString()}.`,
      },
    ] : [],
    requiredByStandard: 'SFFAS 5 ¶¶36-48; SFFAS 6 ¶¶96-107',
    applicable: true,
  });

  // Note 7: Commitments and Contingencies
  notes.push({
    noteNumber: 7,
    title: 'Commitments and Contingencies',
    content: 'The entity is a party to various legal actions and claims. Contingent ' +
      'liabilities are recognized when the loss is probable and the amount is ' +
      'reasonably estimable. Contingencies that are reasonably possible are disclosed.',
    subNotes: [],
    requiredByStandard: 'SFFAS 5 ¶¶25-35',
    applicable: true,
  });

  // Note 8: General PP&E
  const hasProperty = dodData?.propertyRecords && dodData.propertyRecords.length > 0;
  notes.push({
    noteNumber: 8,
    title: 'General Property, Plant, and Equipment, Net',
    content: hasProperty
      ? `The entity maintains ${dodData!.propertyRecords!.length} property records. ` +
        `General PP&E is capitalized at historical cost and depreciated using the ` +
        `straight-line method over estimated useful lives.`
      : 'General PP&E is capitalized at historical cost when the acquisition cost ' +
        'meets the capitalization threshold and depreciated using the straight-line method.',
    subNotes: hasProperty ? [
      {
        subtitle: 'PP&E Composition',
        content: `Total acquisition cost: $${dodData!.propertyRecords!.reduce((s, p) => s + p.acquisitionCost, 0).toLocaleString()}. ` +
          `Accumulated depreciation: $${dodData!.propertyRecords!.reduce((s, p) => s + p.accumulatedDepreciation, 0).toLocaleString()}. ` +
          `Net book value: $${dodData!.propertyRecords!.reduce((s, p) => s + p.currentBookValue, 0).toLocaleString()}.`,
      },
    ] : [],
    requiredByStandard: 'SFFAS 6; OMB A-136 §II.5.8',
    applicable: true,
  });

  // Note 9: Stewardship PP&E
  notes.push({
    noteNumber: 9,
    title: 'Stewardship PP&E',
    content: 'National defense PP&E consists of weapons systems, vehicles, and ' +
      'military equipment that are expensed on acquisition per SFFAS 6. Heritage ' +
      'assets and stewardship land are reported in required supplementary information.',
    subNotes: [],
    requiredByStandard: 'SFFAS 6 ¶¶52-95; SFFAS 29',
    applicable: true,
  });

  // Note 10: Other Disclosures
  const hasADA = dodData && dodData.adaViolations.length > 0;
  notes.push({
    noteNumber: 10,
    title: 'Other Disclosures',
    content: 'This note consolidates required disclosures including Anti-Deficiency ' +
      'Act violations, subsequent events, and related party transactions.',
    subNotes: [
      ...(hasADA ? [{
        subtitle: 'Anti-Deficiency Act Violations',
        content: `${dodData!.adaViolations.length} ADA violation(s) reported during FY${fy}. ` +
          `Total amount: $${dodData!.adaViolations.reduce((s, v) => s + v.amount, 0).toLocaleString()}.`,
      }] : []),
      {
        subtitle: 'Subsequent Events',
        content: 'Management has evaluated subsequent events through the date of the ' +
          'auditor\'s report. No material subsequent events were identified that ' +
          'require adjustment or disclosure.',
      },
    ],
    requiredByStandard: 'OMB A-136 §II.5.10',
    applicable: true,
  });

  // Note 11: Leases (conditional on FY2027+ and SFFAS 54)
  if (fy >= 2027 && dodData?.leaseRecords && dodData.leaseRecords.length > 0) {
    notes.push({
      noteNumber: 11,
      title: 'Leases',
      content: `Effective FY2027, the entity applies SFFAS 54 for lease accounting. ` +
        `The entity has ${dodData.leaseRecords.length} lease agreements. ` +
        `Total lease assets: $${dodData.leaseRecords.reduce((s, l) => s + l.leaseAssetValue, 0).toLocaleString()}. ` +
        `Total lease liabilities: $${dodData.leaseRecords.reduce((s, l) => s + l.leaseLiabilityBalance, 0).toLocaleString()}.`,
      subNotes: [
        {
          subtitle: 'Lessee Arrangements',
          content: `The entity is lessee in ${dodData.leaseRecords.filter(l => l.leaseClassification !== 'operating').length} capital leases ` +
            `and ${dodData.leaseRecords.filter(l => l.leaseClassification === 'operating').length} operating leases.`,
        },
      ],
      requiredByStandard: 'SFFAS 54',
      applicable: true,
    });
  }

  // Note 12: Debt Management (conditional)
  if (dodData?.debtRecords && dodData.debtRecords.length > 0) {
    const totalDebt = dodData.debtRecords.reduce((s, d) => s + d.amount, 0);
    const delinquent = dodData.debtRecords.filter(d => d.status === 'delinquent');
    notes.push({
      noteNumber: 12,
      title: 'Non-Federal Receivables and Debt Management',
      content: `The entity manages ${dodData.debtRecords.length} debt accounts ` +
        `totaling $${totalDebt.toLocaleString()}. ${delinquent.length} debts ` +
        `are currently delinquent per DoD FMR Vol 16 and DCIA requirements.`,
      subNotes: [],
      requiredByStandard: '31 U.S.C. Ch 37; OMB A-129',
      applicable: true,
    });
  }

  return {
    fiscalYear: fy,
    agencyName: dodData?.dodComponent ?? 'Department of Defense',
    notes,
    generatedAt: new Date().toISOString(),
  };
}
