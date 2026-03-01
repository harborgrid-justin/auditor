export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type AccountSubType =
  | 'cash' | 'accounts_receivable' | 'inventory' | 'prepaid' | 'fixed_asset'
  | 'intangible' | 'other_asset' | 'rou_asset'
  | 'accounts_payable' | 'accrued_liabilities' | 'short_term_debt'
  | 'long_term_debt' | 'lease_liability' | 'deferred_revenue' | 'other_liability'
  | 'common_stock' | 'retained_earnings' | 'aoci' | 'treasury_stock' | 'other_equity'
  | 'operating_revenue' | 'non_operating_revenue' | 'other_revenue'
  | 'cost_of_goods_sold' | 'operating_expense' | 'depreciation' | 'amortization'
  | 'interest_expense' | 'tax_expense' | 'other_expense'
  | 'nol_carryforward' | 'derivative_asset' | 'derivative_liability'
  | 'construction_in_progress' | 'treasury_stock_asset' | 'restructuring_charge'
  | 'foreign_currency_translation' | 'hedge_instrument' | 'charitable_contribution'
  | 'installment_receivable' | 'bonus_depreciation' | 'rd_expense';

export interface Account {
  id: string;
  engagementId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  subType: AccountSubType | null;
  beginningBalance: number;
  endingBalance: number;
  period: string;
}

export interface TrialBalanceEntry {
  id: string;
  engagementId: string;
  accountId: string;
  debit: number;
  credit: number;
  period: string;
  sourceFile: string;
}

export interface JournalEntry {
  id: string;
  engagementId: string;
  entryNumber: string;
  date: string;
  description: string;
  postedBy: string;
  approvedBy: string | null;
  source: string;
  lines: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountName?: string;
  debit: number;
  credit: number;
  description: string;
}

export interface FinancialStatement {
  id: string;
  engagementId: string;
  statementType: 'BS' | 'IS' | 'CF';
  period: string;
  data: Record<string, number>;
}

export interface TaxData {
  id: string;
  engagementId: string;
  formType: string;
  schedule: string;
  lineNumber: string;
  description: string;
  amount: number;
  period: string;
}

export interface ParsedFileData {
  accounts?: Account[];
  trialBalance?: TrialBalanceEntry[];
  journalEntries?: JournalEntry[];
  financialStatements?: FinancialStatement[];
  taxData?: TaxData[];
  warnings: string[];
  errors: string[];
}

export interface ColumnMapping {
  accountNumber?: string;
  accountName?: string;
  debit?: string;
  credit?: string;
  amount?: string;
  date?: string;
  description?: string;
  period?: string;
  postedBy?: string;
  approvedBy?: string;
  entryNumber?: string;
}
