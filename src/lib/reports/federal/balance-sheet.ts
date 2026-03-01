/**
 * Federal Balance Sheet (Statement of Financial Position) Generator
 *
 * Generates the Balance Sheet per OMB Circular A-136, Section II.2. The
 * Balance Sheet is a principal financial statement that presents an entity's
 * financial position at a point in time, showing assets, liabilities, and
 * net position. Federal balance sheets require separation of
 * intragovernmental (transactions with other federal entities) and public
 * (transactions with non-federal entities) amounts.
 *
 * USSGL Account Series Mapping:
 *   1000-1999: Assets
 *   2000-2999: Liabilities
 *   3000-3999: Net Position
 *
 * References:
 *   - OMB Circular A-136, Section II.2 (Balance Sheet)
 *   - SFFAS 1: Accounting for Selected Assets and Liabilities
 *   - SFFAS 5: Accounting for Liabilities of the Federal Government
 *   - SFFAS 6: Accounting for Property, Plant, and Equipment
 *   - SFFAS 33: Pensions, Other Retirement Benefits, and Other Postemployment Benefits
 *   - SFFAS 54: Leases (effective FY2027)
 *   - DoD FMR 7000.14-R, Vol. 6B, Ch. 1: Form and Content
 *   - DoD FMR 7000.14-R, Vol. 4, Ch. 8: PP&E
 */

import type {
  USSGLAccount,
  DoDEngagementData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DoDComponentCode,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROUNDING_PRECISION = 2;

/**
 * USSGL account ranges for Balance Sheet classification.
 * Per USSGL TFM Supplement, Section III.
 */
const USSGL_RANGES = {
  assets: { min: 1000, max: 1999 },
  liabilities: { min: 2000, max: 2999 },
  netPosition: { min: 3000, max: 3999 },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single line on the Balance Sheet. */
export interface BalanceSheetLineItem {
  id: string;
  ussglPrefix: string;
  description: string;
  currentYear: number;
  priorYear: number;
}

/** Intragovernmental asset classification per OMB A-136, Section II.2. */
export interface IntragovernmentalAssets {
  fundBalanceWithTreasury: BalanceSheetLineItem;
  investments: BalanceSheetLineItem;
  accountsReceivable: BalanceSheetLineItem;
  interestReceivable: BalanceSheetLineItem;
  otherAssets: BalanceSheetLineItem;
  totalIntragovernmentalAssets: BalanceSheetLineItem;
}

/** Public (with the public) asset classification. */
export interface PublicAssets {
  cashAndOtherMonetaryAssets: BalanceSheetLineItem;
  accountsReceivableNet: BalanceSheetLineItem;
  loansReceivableNet: BalanceSheetLineItem;
  inventoryAndRelatedProperty: BalanceSheetLineItem;
  generalPPENet: BalanceSheetLineItem;
  leasedAssetsNet: BalanceSheetLineItem;
  otherAssets: BalanceSheetLineItem;
  totalPublicAssets: BalanceSheetLineItem;
}

/** Intragovernmental liability classification. */
export interface IntragovernmentalLiabilities {
  accountsPayable: BalanceSheetLineItem;
  debtHeldByGovernment: BalanceSheetLineItem;
  otherLiabilities: BalanceSheetLineItem;
  totalIntragovernmentalLiabilities: BalanceSheetLineItem;
}

/** Public (with the public) liability classification. */
export interface PublicLiabilities {
  accountsPayable: BalanceSheetLineItem;
  federalEmployeeBenefitsPayable: BalanceSheetLineItem;
  environmentalAndDisposalLiabilities: BalanceSheetLineItem;
  loanGuaranteeLiability: BalanceSheetLineItem;
  leaseLiabilities: BalanceSheetLineItem;
  otherLiabilities: BalanceSheetLineItem;
  totalPublicLiabilities: BalanceSheetLineItem;
}

/** Net position section per SFFAS 7. */
export interface NetPositionSection {
  unexpendedAppropriations: BalanceSheetLineItem;
  cumulativeResultsOfOperations: BalanceSheetLineItem;
  totalNetPosition: BalanceSheetLineItem;
}

/**
 * Complete Federal Balance Sheet.
 * Per OMB A-136, Section II.2.
 */
export interface BalanceSheetReport {
  id: string;
  fiscalYear: number;
  dodComponent: string;
  reportingDate: string;
  assets: {
    intragovernmental: IntragovernmentalAssets;
    public: PublicAssets;
    totalAssets: BalanceSheetLineItem;
  };
  liabilities: {
    intragovernmental: IntragovernmentalLiabilities;
    public: PublicLiabilities;
    totalLiabilities: BalanceSheetLineItem;
  };
  netPosition: NetPositionSection;
  balanceValidation: {
    assetsEqualLiabilitiesPlusNetPosition: boolean;
    difference: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * (10 ** ROUNDING_PRECISION)) / (10 ** ROUNDING_PRECISION);
}

function makeBalanceLine(
  ussglPrefix: string,
  description: string,
  currentYear: number,
  priorYear: number = 0,
): BalanceSheetLineItem {
  return {
    id: uuid(),
    ussglPrefix,
    description,
    currentYear: round2(currentYear),
    priorYear: round2(priorYear),
  };
}

/**
 * Sum the ending balances of USSGL accounts matching the given prefixes.
 */
function sumEnd(accounts: USSGLAccount[], prefixes: string[]): number {
  return accounts
    .filter(a => prefixes.some(p => a.accountNumber.startsWith(p)))
    .reduce((sum, a) => sum + a.endBalance, 0);
}

/**
 * Sum the beginning balances of USSGL accounts matching the given prefixes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function sumBegin(accounts: USSGLAccount[], prefixes: string[]): number {
  return accounts
    .filter(a => prefixes.some(p => a.accountNumber.startsWith(p)))
    .reduce((sum, a) => sum + a.beginBalance, 0);
}

/**
 * Determine if a USSGL account number falls within the intragovernmental range.
 * Per USSGL guidance, intragovernmental accounts are identified by specific
 * sub-ranges within each major category. For DoD, accounts ending in
 * patterns such as 1xxx00-1xxx99 with intra identifiers are used.
 * Simplified: accounts whose 4-digit number is in intra-specific ranges.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isIntragovernmentalAccount(accountNumber: string): boolean {
  const num = parseInt(accountNumber.substring(0, 4), 10);
  // Intragovernmental asset accounts: 1010-1099, 1310-1399, 1600-1699
  if (num >= 1010 && num <= 1099) return true;
  if (num >= 1310 && num <= 1399) return true;
  if (num >= 1600 && num <= 1699) return true;
  // Intragovernmental liability accounts: 2110-2199, 2310-2399, 2510-2599
  if (num >= 2110 && num <= 2199) return true;
  if (num >= 2310 && num <= 2399) return true;
  if (num >= 2510 && num <= 2599) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Federal Balance Sheet from DoD engagement data.
 *
 * This function produces a complete Statement of Financial Position
 * per OMB A-136, Section II.2, with intragovernmental and public separation
 * across all asset and liability categories.
 *
 * Assets are sourced from USSGL 1000-1999 series accounts:
 *   - Fund Balance with Treasury (USSGL 1010)
 *   - Investments (USSGL 1120-1199)
 *   - Accounts Receivable (USSGL 1310-1399)
 *   - General PP&E, Net (USSGL 1710-1759 less accumulated depreciation 1719-1759)
 *   - Other Assets (remaining 1xxx)
 *
 * Liabilities are sourced from USSGL 2000-2999 series:
 *   - Accounts Payable (USSGL 2110-2120)
 *   - Debt (USSGL 2510-2520)
 *   - Environmental Liabilities (USSGL 2910-2920)
 *   - Federal Employee Benefits (USSGL 2610-2620)
 *
 * Net Position from USSGL 3000-3999 series:
 *   - Unexpended Appropriations (USSGL 3100-3102)
 *   - Cumulative Results of Operations (USSGL 3310-3320)
 *
 * The function also pulls from engagement-level property records,
 * environmental liabilities, and actuarial liabilities for enhanced accuracy.
 *
 * @param data - Complete DoD engagement dataset
 * @returns BalanceSheetReport with intra/public separation and balance validation
 *
 * @see OMB A-136, Section II.2
 * @see SFFAS 1 (Assets and Liabilities)
 * @see SFFAS 5 (Liabilities)
 * @see SFFAS 6 (PP&E)
 */
export function generateBalanceSheet(data: DoDEngagementData): BalanceSheetReport {
  const { ussglAccounts, appropriations } = data;
  const fiscalYear = data.fiscalYear;

  const proprietaryAccounts = ussglAccounts.filter(a => a.accountType === 'proprietary');

  // -------------------------------------------------------------------------
  // Intragovernmental Assets
  // -------------------------------------------------------------------------
  const fbwt = sumEnd(proprietaryAccounts, ['1010']);
  const investments = sumEnd(proprietaryAccounts, ['112', '113', '114', '115', '116']);
  const arIntra = sumEnd(proprietaryAccounts, ['1310', '1320', '1330', '1340']);
  const interestReceivable = sumEnd(proprietaryAccounts, ['1341', '1342']);
  const otherAssetsIntra = sumEnd(proprietaryAccounts, ['1410', '1510', '1610', '1620']);
  const totalIntraAssets = fbwt + investments + arIntra + interestReceivable + otherAssetsIntra;

  // -------------------------------------------------------------------------
  // Public Assets
  // -------------------------------------------------------------------------
  const cashAndMonetary = sumEnd(proprietaryAccounts, ['1110', '1120']);
  const arPublicGross = sumEnd(proprietaryAccounts, ['1311', '1321', '1350', '1360']);
  const arAllowance = Math.abs(sumEnd(proprietaryAccounts, ['1319', '1329', '1359']));
  const arPublicNet = arPublicGross - arAllowance;
  const loansReceivable = sumEnd(proprietaryAccounts, ['1350', '1351']);
  const inventory = sumEnd(proprietaryAccounts, ['1511', '1512', '1513', '1521', '1522', '1523']);

  // General PP&E: acquisition cost less accumulated depreciation
  const ppeGross = sumEnd(proprietaryAccounts, ['1710', '1720', '1730', '1740', '1750', '1760']);
  const ppeAccumDepr = Math.abs(sumEnd(proprietaryAccounts, ['1719', '1729', '1739', '1749', '1759', '1769']));

  // Supplement with property records if available
  const propertyPPE = (data.propertyRecords ?? [])
    .filter(p => p.category === 'general_ppe' || p.category === 'internal_use_software')
    .reduce((s, p) => s + p.currentBookValue, 0);
  const ppNet = ppeGross > 0 ? (ppeGross - ppeAccumDepr) : propertyPPE;

  // Leased assets (SFFAS 54, effective FY2027)
  const leaseAssets = (data.leaseRecords ?? [])
    .reduce((s, l) => s + l.leaseAssetValue, 0);
  const leaseAssetsFromUSSGL = sumEnd(proprietaryAccounts, ['1770', '1771', '1779']);
  const leasedAssetsNet = leaseAssetsFromUSSGL > 0 ? leaseAssetsFromUSSGL : leaseAssets;

  const otherAssetsPublic = sumEnd(proprietaryAccounts, ['1810', '1820', '1830', '1910', '1990']);

  const totalPublicAssets = cashAndMonetary + arPublicNet + loansReceivable +
    inventory + ppNet + leasedAssetsNet + otherAssetsPublic;

  const totalAssets = totalIntraAssets + totalPublicAssets;

  // -------------------------------------------------------------------------
  // Intragovernmental Liabilities
  // -------------------------------------------------------------------------
  const apIntra = sumEnd(proprietaryAccounts, ['2110']);
  const debtIntra = sumEnd(proprietaryAccounts, ['2510', '2520', '2530']);
  const otherLiabIntra = sumEnd(proprietaryAccounts, ['2310', '2320', '2330', '2410', '2420']);
  const totalIntraLiab = apIntra + debtIntra + otherLiabIntra;

  // -------------------------------------------------------------------------
  // Public Liabilities
  // -------------------------------------------------------------------------
  const apPublic = sumEnd(proprietaryAccounts, ['2120', '2130']);

  // Federal employee benefits: from USSGL or actuarial liability records
  const employeeBenefitsUSSGL = sumEnd(proprietaryAccounts, ['2610', '2620', '2630', '2640']);
  const employeeBenefitsActuarial = (data.actuarialLiabilities ?? [])
    .reduce((s, a) => s + a.totalLiability, 0);
  const federalEmployeeBenefits = employeeBenefitsUSSGL > 0
    ? employeeBenefitsUSSGL : employeeBenefitsActuarial;

  // Environmental and disposal liabilities: from USSGL or environmental records
  const envLiabUSSGL = sumEnd(proprietaryAccounts, ['2910', '2920', '2930']);
  const envLiabRecords = (data.environmentalLiabilities ?? [])
    .reduce((s, e) => s + e.recordedLiability, 0);
  const environmentalLiab = envLiabUSSGL > 0 ? envLiabUSSGL : envLiabRecords;

  const loanGuarantee = sumEnd(proprietaryAccounts, ['2610', '2611']);
  const leaseLiabUSSGL = sumEnd(proprietaryAccounts, ['2770', '2771']);
  const leaseLiabRecords = (data.leaseRecords ?? [])
    .reduce((s, l) => s + l.leaseLiabilityBalance, 0);
  const leaseLiabilities = leaseLiabUSSGL > 0 ? leaseLiabUSSGL : leaseLiabRecords;

  const otherLiabPublic = sumEnd(proprietaryAccounts, ['2190', '2290', '2990', '2210', '2220']);
  const totalPublicLiab = apPublic + federalEmployeeBenefits + environmentalLiab +
    loanGuarantee + leaseLiabilities + otherLiabPublic;

  const totalLiabilities = totalIntraLiab + totalPublicLiab;

  // -------------------------------------------------------------------------
  // Net Position
  // -------------------------------------------------------------------------
  const unexpendedAppr = sumEnd(proprietaryAccounts, ['3100', '3101', '3102', '3103', '3104']);
  const cumulativeResults = sumEnd(proprietaryAccounts, ['3310', '3320', '3300']);

  // Fallback: derive from appropriation records if USSGL net position is zero
  const unexpendedFromAppropriations = appropriations.reduce(
    (s, a) => s + (a.totalAuthority - a.disbursed), 0,
  );
  const unexpendedFinal = unexpendedAppr !== 0 ? unexpendedAppr : unexpendedFromAppropriations;

  const totalNetPosition = unexpendedFinal + cumulativeResults;

  // -------------------------------------------------------------------------
  // Balance validation: Assets = Liabilities + Net Position
  // -------------------------------------------------------------------------
  const difference = round2(totalAssets - (totalLiabilities + totalNetPosition));

  return {
    id: uuid(),
    fiscalYear,
    dodComponent: data.dodComponent,
    reportingDate: `${fiscalYear}-09-30`,
    assets: {
      intragovernmental: {
        fundBalanceWithTreasury: makeBalanceLine('1010', 'Fund Balance with Treasury', fbwt),
        investments: makeBalanceLine('112x', 'Investments', investments),
        accountsReceivable: makeBalanceLine('131x', 'Accounts Receivable', arIntra),
        interestReceivable: makeBalanceLine('134x', 'Interest Receivable', interestReceivable),
        otherAssets: makeBalanceLine('14xx', 'Other Assets', otherAssetsIntra),
        totalIntragovernmentalAssets: makeBalanceLine('1xxx', 'Total Intragovernmental Assets', totalIntraAssets),
      },
      public: {
        cashAndOtherMonetaryAssets: makeBalanceLine('111x', 'Cash and Other Monetary Assets', cashAndMonetary),
        accountsReceivableNet: makeBalanceLine('131x', 'Accounts Receivable, Net', arPublicNet),
        loansReceivableNet: makeBalanceLine('135x', 'Loans Receivable, Net', loansReceivable),
        inventoryAndRelatedProperty: makeBalanceLine('151x', 'Inventory and Related Property, Net', inventory),
        generalPPENet: makeBalanceLine('17xx', 'General Property, Plant, and Equipment, Net', ppNet),
        leasedAssetsNet: makeBalanceLine('177x', 'Leased Assets, Net (SFFAS 54)', leasedAssetsNet),
        otherAssets: makeBalanceLine('18xx', 'Other Assets', otherAssetsPublic),
        totalPublicAssets: makeBalanceLine('1xxx', 'Total Assets - With the Public', totalPublicAssets),
      },
      totalAssets: makeBalanceLine('1xxx', 'Total Assets', totalAssets),
    },
    liabilities: {
      intragovernmental: {
        accountsPayable: makeBalanceLine('2110', 'Accounts Payable', apIntra),
        debtHeldByGovernment: makeBalanceLine('251x', 'Debt', debtIntra),
        otherLiabilities: makeBalanceLine('23xx', 'Other Liabilities (Intragovernmental)', otherLiabIntra),
        totalIntragovernmentalLiabilities: makeBalanceLine('2xxx', 'Total Intragovernmental Liabilities', totalIntraLiab),
      },
      public: {
        accountsPayable: makeBalanceLine('2120', 'Accounts Payable', apPublic),
        federalEmployeeBenefitsPayable: makeBalanceLine('261x', 'Federal Employee and Veteran Benefits Payable', federalEmployeeBenefits),
        environmentalAndDisposalLiabilities: makeBalanceLine('291x', 'Environmental and Disposal Liabilities', environmentalLiab),
        loanGuaranteeLiability: makeBalanceLine('261x', 'Loan Guarantee Liability', loanGuarantee),
        leaseLiabilities: makeBalanceLine('277x', 'Lease Liabilities (SFFAS 54)', leaseLiabilities),
        otherLiabilities: makeBalanceLine('29xx', 'Other Liabilities (With the Public)', otherLiabPublic),
        totalPublicLiabilities: makeBalanceLine('2xxx', 'Total Liabilities - With the Public', totalPublicLiab),
      },
      totalLiabilities: makeBalanceLine('2xxx', 'Total Liabilities', totalLiabilities),
    },
    netPosition: {
      unexpendedAppropriations: makeBalanceLine('310x', 'Unexpended Appropriations', unexpendedFinal),
      cumulativeResultsOfOperations: makeBalanceLine('331x', 'Cumulative Results of Operations', cumulativeResults),
      totalNetPosition: makeBalanceLine('3xxx', 'Total Net Position', totalNetPosition),
    },
    balanceValidation: {
      assetsEqualLiabilitiesPlusNetPosition: Math.abs(difference) < 0.01,
      difference,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Validates balance sheet account classifications against USSGL ranges.
 *
 * Ensures every proprietary account used in the balance sheet falls
 * within the correct USSGL range for its category. Returns a list
 * of any misclassified accounts.
 *
 * @param accounts - USSGL accounts to validate
 * @returns Array of classification errors (empty if all correct)
 *
 * @see USSGL TFM Supplement, Section III (Account Attributes)
 */
export function validateBalanceSheetClassifications(
  accounts: USSGLAccount[],
): Array<{ id: string; accountNumber: string; accountTitle: string; issue: string }> {
  const errors: Array<{ id: string; accountNumber: string; accountTitle: string; issue: string }> = [];

  for (const acct of accounts) {
    if (acct.accountType !== 'proprietary') continue;

    const num = parseInt(acct.accountNumber.substring(0, 4), 10);
    if (isNaN(num)) continue;

    if (num >= USSGL_RANGES.assets.min && num <= USSGL_RANGES.assets.max) {
      if (acct.category !== 'asset') {
        errors.push({
          id: uuid(),
          accountNumber: acct.accountNumber,
          accountTitle: acct.accountTitle,
          issue: `Account ${acct.accountNumber} is in asset range (1000-1999) but categorized as '${acct.category}'`,
        });
      }
    } else if (num >= USSGL_RANGES.liabilities.min && num <= USSGL_RANGES.liabilities.max) {
      if (acct.category !== 'liability') {
        errors.push({
          id: uuid(),
          accountNumber: acct.accountNumber,
          accountTitle: acct.accountTitle,
          issue: `Account ${acct.accountNumber} is in liability range (2000-2999) but categorized as '${acct.category}'`,
        });
      }
    } else if (num >= USSGL_RANGES.netPosition.min && num <= USSGL_RANGES.netPosition.max) {
      if (acct.category !== 'net_position') {
        errors.push({
          id: uuid(),
          accountNumber: acct.accountNumber,
          accountTitle: acct.accountTitle,
          issue: `Account ${acct.accountNumber} is in net position range (3000-3999) but categorized as '${acct.category}'`,
        });
      }
    }
  }

  return errors;
}
