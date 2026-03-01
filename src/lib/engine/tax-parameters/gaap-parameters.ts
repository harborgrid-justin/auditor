/**
 * GAAP Standard Effective Date Parameters
 *
 * Tracks adoption dates for major accounting standards that vary
 * by entity type (SEC filer vs. private company).
 */

import type { TaxParameter } from '@/types/tax-compliance';

export const GAAP_PARAMETERS: TaxParameter[] = [
  // ASC 606 — Revenue Recognition (effective for all entities)
  {
    code: 'ASC_606_EFFECTIVE',
    taxYear: 2018,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['all'],
    citation: 'ASC 606-10-65-1',
    notes: 'Effective for public entities 2018, private entities 2019',
  },

  // ASC 842 — Lease Accounting
  {
    code: 'ASC_842_EFFECTIVE',
    taxYear: 2019,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['c_corp'],
    citation: 'ASC 842-10-65-1',
    notes: 'Effective for SEC filers fiscal years beginning after 12/15/2018',
  },
  {
    code: 'ASC_842_EFFECTIVE',
    taxYear: 2022,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['s_corp', 'partnership', 'llc', 'nonprofit'],
    citation: 'ASC 842-10-65-1',
    notes: 'Effective for all other entities fiscal years beginning after 12/15/2021',
  },

  // ASC 326 — CECL (Current Expected Credit Losses)
  {
    code: 'CECL_EFFECTIVE',
    taxYear: 2020,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['c_corp'],
    citation: 'ASC 326-20-65-1',
    notes: 'Effective for SEC filers fiscal years beginning after 12/15/2019',
  },
  {
    code: 'CECL_EFFECTIVE',
    taxYear: 2023,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['s_corp', 'partnership', 'llc', 'nonprofit'],
    citation: 'ASC 326-20-65-1',
    notes: 'Effective for all other entities fiscal years beginning after 12/15/2022',
  },

  // ASC 740-10 — Income Tax Uncertain Tax Positions (FIN 48)
  {
    code: 'ASC_740_UTP_EFFECTIVE',
    taxYear: 2007,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['all'],
    citation: 'ASC 740-10-25-5 through 25-17',
    notes: 'Originally FIN 48, effective for fiscal years beginning after 12/15/2006',
  },

  // ASC 815 — Derivatives and Hedging (ASU 2017-12 simplification)
  {
    code: 'ASC_815_HEDGE_SIMPLIFICATION',
    taxYear: 2019,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['c_corp'],
    citation: 'ASU 2017-12',
    notes: 'Targeted improvements to hedge accounting, public entities 2019',
  },
  {
    code: 'ASC_815_HEDGE_SIMPLIFICATION',
    taxYear: 2021,
    value: 1,
    valueType: 'boolean',
    entityTypes: ['s_corp', 'partnership', 'llc', 'nonprofit'],
    citation: 'ASU 2017-12',
    notes: 'Targeted improvements to hedge accounting, all other entities 2021',
  },
];
