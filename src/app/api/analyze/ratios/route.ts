import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { calculateRatios } from '@/lib/engine/analysis/ratio-analysis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    if (!engagementId) return NextResponse.json({ error: 'engagementId required' }, { status: 400 });

    const accounts = db.select().from(schema.accounts).where(eq(schema.accounts.engagementId, engagementId)).all();
    const fsRaw = db.select().from(schema.financialStatements).where(eq(schema.financialStatements.engagementId, engagementId)).all();

    const isData = fsRaw.find(fs => fs.statementType === 'IS');
    const bsData = fsRaw.find(fs => fs.statementType === 'BS');
    const cfData = fsRaw.find(fs => fs.statementType === 'CF');

    const is = isData ? JSON.parse(isData.dataJson) : {};
    const bs = bsData ? JSON.parse(bsData.dataJson) : {};
    const cf = cfData ? JSON.parse(cfData.dataJson) : {};

    const cash = accounts.filter(a => a.subType === 'cash').reduce((s, a) => s + a.endingBalance, 0);
    const ar = accounts.filter(a => a.subType === 'accounts_receivable' && a.endingBalance > 0).reduce((s, a) => s + a.endingBalance, 0);
    const inventory = accounts.filter(a => a.subType === 'inventory').reduce((s, a) => s + a.endingBalance, 0);
    const currentAssets = cash + ar + inventory + accounts.filter(a => a.subType === 'prepaid').reduce((s, a) => s + a.endingBalance, 0);
    const totalAssets = bs.totalAssets || accounts.filter(a => a.accountType === 'asset').reduce((s, a) => s + a.endingBalance, 0);
    const ap = accounts.filter(a => a.subType === 'accounts_payable').reduce((s, a) => s + Math.abs(a.endingBalance), 0);
    const accrued = accounts.filter(a => a.subType === 'accrued_liabilities').reduce((s, a) => s + Math.abs(a.endingBalance), 0);
    const currentLiabilities = ap + accrued + accounts.filter(a => a.subType === 'short_term_debt').reduce((s, a) => s + Math.abs(a.endingBalance), 0)
      + accounts.filter(a => a.subType === 'deferred_revenue').reduce((s, a) => s + Math.abs(a.endingBalance), 0);
    const totalLiabilities = bs.totalLiabilities || accounts.filter(a => a.accountType === 'liability').reduce((s, a) => s + Math.abs(a.endingBalance), 0);
    const totalEquity = bs.totalEquity || accounts.filter(a => a.accountType === 'equity').reduce((s, a) => s + a.endingBalance, 0);
    const totalDebt = accounts.filter(a => a.subType === 'short_term_debt' || a.subType === 'long_term_debt').reduce((s, a) => s + Math.abs(a.endingBalance), 0);

    const ratios = calculateRatios({
      cash,
      accountsReceivable: ar,
      inventory,
      currentAssets,
      totalAssets,
      currentLiabilities,
      totalLiabilities,
      totalEquity,
      revenue: is.totalRevenue || accounts.filter(a => a.accountType === 'revenue').reduce((s, a) => s + Math.abs(a.endingBalance), 0),
      cogs: is.costOfGoodsSold || accounts.filter(a => a.subType === 'cost_of_goods_sold').reduce((s, a) => s + Math.abs(a.endingBalance), 0),
      grossProfit: is.grossProfit || 0,
      operatingIncome: is.operatingIncome || 0,
      netIncome: is.netIncome || 0,
      interestExpense: is.interestExpense || accounts.filter(a => a.subType === 'interest_expense').reduce((s, a) => s + Math.abs(a.endingBalance), 0),
      depreciation: accounts.filter(a => a.subType === 'depreciation').reduce((s, a) => s + Math.abs(a.endingBalance), 0),
      operatingCashFlow: cf.operatingCashFlow || 0,
      totalDebt,
    });

    return NextResponse.json({ ratios });
  } catch (error) {
    console.error('Ratio analysis error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
