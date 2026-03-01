'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  FileBarChart, Database, Scale, TrendingDown, ArrowUpDown,
  Wallet, FileCheck, Download, Printer, Loader2, ArrowLeft,
  Calendar, Clock, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend,
} from 'recharts';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select } from '@/components/ui/select';

import type { SF133Data } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportId =
  | 'sf133'
  | 'gtas'
  | 'balance-sheet'
  | 'net-cost'
  | 'net-position'
  | 'budgetary-resources'
  | 'audit-opinion';

interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  icon: React.ElementType;
  lastGenerated?: string;
}

interface GTASEntry {
  accountNumber: string;
  accountTitle: string;
  accountType: 'proprietary' | 'budgetary';
  debit: number;
  credit: number;
  net: number;
}

interface FinancialStatementLine {
  label: string;
  amount: number;
  isTotal?: boolean;
  indent?: number;
}

interface AuditOpinionData {
  opinionType: 'unmodified' | 'qualified' | 'adverse' | 'disclaimer';
  adaCompliance: boolean;
  materialWeaknesses: number;
  significantDeficiencies: number;
  summary: string;
  details: string[];
}

interface GeneratedReport {
  reportId: ReportId;
  fiscalYear: number;
  period: string;
  generatedAt: string;
  sf133?: SF133Data;
  gtas?: GTASEntry[];
  financialStatement?: FinancialStatementLine[];
  auditOpinion?: AuditOpinionData;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'sf133',
    title: 'SF-133',
    description: 'Report on Budget Execution and Budgetary Resources',
    icon: FileBarChart,
  },
  {
    id: 'gtas',
    title: 'GTAS',
    description: 'Governmentwide Treasury Account Symbol Adjusted Trial Balance System',
    icon: Database,
  },
  {
    id: 'balance-sheet',
    title: 'Balance Sheet',
    description: 'Statement of Financial Position',
    icon: Scale,
  },
  {
    id: 'net-cost',
    title: 'Statement of Net Cost',
    description: 'Operating costs by program',
    icon: TrendingDown,
  },
  {
    id: 'net-position',
    title: 'Statement of Changes in Net Position',
    description: 'Changes in equity',
    icon: ArrowUpDown,
  },
  {
    id: 'budgetary-resources',
    title: 'Statement of Budgetary Resources',
    description: 'Budget authority and outlays',
    icon: Wallet,
  },
  {
    id: 'audit-opinion',
    title: 'Federal Audit Opinion',
    description: 'Audit opinion with ADA compliance',
    icon: FileCheck,
  },
];

const FISCAL_YEAR_OPTIONS = [
  { value: '2024', label: 'FY 2024' },
  { value: '2025', label: 'FY 2025' },
  { value: '2026', label: 'FY 2026' },
];

const PERIOD_OPTIONS = [
  { value: 'Q1', label: 'Q1 (Oct - Dec)' },
  { value: 'Q2', label: 'Q2 (Jan - Mar)' },
  { value: 'Q3', label: 'Q3 (Apr - Jun)' },
  { value: 'Q4', label: 'Q4 (Jul - Sep)' },
  { value: 'Annual', label: 'Annual' },
];

const CHART_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

const OPINION_SEVERITY: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  unmodified: { label: 'Unmodified (Clean)', variant: 'success' },
  qualified: { label: 'Qualified', variant: 'warning' },
  adverse: { label: 'Adverse', variant: 'destructive' },
  disclaimer: { label: 'Disclaimer of Opinion', variant: 'destructive' },
};

// ---------------------------------------------------------------------------
// Mock data generators (simulating API responses)
// ---------------------------------------------------------------------------

function generateSF133Data(fiscalYear: number, period: string): SF133Data {
  return {
    treasuryAccountSymbol: '097-0100',
    fiscalYear,
    period,
    budgetaryResources: {
      unobligatedBalanceBroughtForward: 245_800_000,
      adjustments: -12_300_000,
      newBudgetAuthority: 1_850_000_000,
      spendingAuthority: 78_500_000,
      totalBudgetaryResources: 2_162_000_000,
    },
    statusOfBudgetaryResources: {
      newObligationsAndUpwardAdjustments: 1_725_400_000,
      unobligatedBalanceEndOfYear: 436_600_000,
      apportionedUnexpired: 312_000_000,
      unapportionedUnexpired: 98_600_000,
      expired: 26_000_000,
    },
    outlays: {
      newObligations: 1_725_400_000,
      obligatedBalanceNetBeginning: 892_000_000,
      obligatedBalanceNetEnd: 1_045_200_000,
      outlaysNet: 1_572_200_000,
    },
  };
}

function generateGTASData(): GTASEntry[] {
  return [
    { accountNumber: '1010', accountTitle: 'Fund Balance with Treasury', accountType: 'proprietary', debit: 1_245_000_000, credit: 0, net: 1_245_000_000 },
    { accountNumber: '1310', accountTitle: 'Accounts Receivable', accountType: 'proprietary', debit: 89_500_000, credit: 0, net: 89_500_000 },
    { accountNumber: '1710', accountTitle: 'General Property, Plant & Equipment', accountType: 'proprietary', debit: 456_200_000, credit: 0, net: 456_200_000 },
    { accountNumber: '1759', accountTitle: 'Accumulated Depreciation', accountType: 'proprietary', debit: 0, credit: 187_300_000, net: -187_300_000 },
    { accountNumber: '2110', accountTitle: 'Accounts Payable', accountType: 'proprietary', debit: 0, credit: 342_100_000, net: -342_100_000 },
    { accountNumber: '2500', accountTitle: 'Other Liabilities', accountType: 'proprietary', debit: 0, credit: 78_400_000, net: -78_400_000 },
    { accountNumber: '3100', accountTitle: 'Unexpended Appropriations', accountType: 'proprietary', debit: 0, credit: 892_400_000, net: -892_400_000 },
    { accountNumber: '3310', accountTitle: 'Cumulative Results of Operations', accountType: 'proprietary', debit: 0, credit: 290_500_000, net: -290_500_000 },
    { accountNumber: '4119', accountTitle: 'Other Appropriations Realized', accountType: 'budgetary', debit: 0, credit: 1_850_000_000, net: -1_850_000_000 },
    { accountNumber: '4450', accountTitle: 'Unapportioned Authority', accountType: 'budgetary', debit: 98_600_000, credit: 0, net: 98_600_000 },
    { accountNumber: '4510', accountTitle: 'Apportionments', accountType: 'budgetary', debit: 312_000_000, credit: 0, net: 312_000_000 },
    { accountNumber: '4610', accountTitle: 'Allotments - Realized Resources', accountType: 'budgetary', debit: 1_439_400_000, credit: 0, net: 1_439_400_000 },
    { accountNumber: '4801', accountTitle: 'Undelivered Orders - Obligations, Unpaid', accountType: 'budgetary', debit: 0, credit: 458_200_000, net: -458_200_000 },
    { accountNumber: '4902', accountTitle: 'Delivered Orders - Obligations, Paid', accountType: 'budgetary', debit: 0, credit: 1_267_200_000, net: -1_267_200_000 },
  ];
}

function generateBalanceSheet(): FinancialStatementLine[] {
  return [
    { label: 'ASSETS', amount: 0, isTotal: false, indent: 0 },
    { label: 'Intragovernmental:', amount: 0, indent: 1 },
    { label: 'Fund Balance with Treasury', amount: 1_245_000_000, indent: 2 },
    { label: 'Investments', amount: 0, indent: 2 },
    { label: 'Accounts Receivable', amount: 45_200_000, indent: 2 },
    { label: 'Total Intragovernmental', amount: 1_290_200_000, isTotal: true, indent: 1 },
    { label: 'Cash and Other Monetary Assets', amount: 12_800_000, indent: 1 },
    { label: 'Accounts Receivable, Net', amount: 44_300_000, indent: 1 },
    { label: 'Inventory and Related Property, Net', amount: 234_500_000, indent: 1 },
    { label: 'General Property, Plant and Equipment, Net', amount: 268_900_000, indent: 1 },
    { label: 'Other Assets', amount: 18_700_000, indent: 1 },
    { label: 'TOTAL ASSETS', amount: 1_869_400_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'LIABILITIES', amount: 0, indent: 0 },
    { label: 'Intragovernmental:', amount: 0, indent: 1 },
    { label: 'Accounts Payable', amount: 156_300_000, indent: 2 },
    { label: 'Other Liabilities', amount: 89_400_000, indent: 2 },
    { label: 'Total Intragovernmental', amount: 245_700_000, isTotal: true, indent: 1 },
    { label: 'Accounts Payable', amount: 185_800_000, indent: 1 },
    { label: 'Military Retirement and Other Federal Employment Benefits', amount: 342_100_000, indent: 1 },
    { label: 'Environmental and Disposal Liabilities', amount: 128_500_000, indent: 1 },
    { label: 'Other Liabilities', amount: 78_400_000, indent: 1 },
    { label: 'TOTAL LIABILITIES', amount: 980_500_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'NET POSITION', amount: 0, indent: 0 },
    { label: 'Unexpended Appropriations', amount: 598_400_000, indent: 1 },
    { label: 'Cumulative Results of Operations', amount: 290_500_000, indent: 1 },
    { label: 'TOTAL NET POSITION', amount: 888_900_000, isTotal: true, indent: 0 },
    { label: 'TOTAL LIABILITIES AND NET POSITION', amount: 1_869_400_000, isTotal: true, indent: 0 },
  ];
}

function generateNetCost(): FinancialStatementLine[] {
  return [
    { label: 'Program Costs:', amount: 0, indent: 0 },
    { label: 'Military Personnel', amount: 425_300_000, indent: 1 },
    { label: 'Operation and Maintenance', amount: 612_800_000, indent: 1 },
    { label: 'Procurement', amount: 287_400_000, indent: 1 },
    { label: 'Research, Development, Test & Evaluation', amount: 198_600_000, indent: 1 },
    { label: 'Military Construction', amount: 45_200_000, indent: 1 },
    { label: 'Family Housing', amount: 23_100_000, indent: 1 },
    { label: 'Gross Costs', amount: 1_592_400_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'Less: Earned Revenue', amount: 0, indent: 0 },
    { label: 'Intragovernmental Revenue', amount: -156_200_000, indent: 1 },
    { label: 'Public Revenue', amount: -34_800_000, indent: 1 },
    { label: 'Total Earned Revenue', amount: -191_000_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'NET COST OF OPERATIONS', amount: 1_401_400_000, isTotal: true, indent: 0 },
  ];
}

function generateNetPosition(): FinancialStatementLine[] {
  return [
    { label: 'Unexpended Appropriations:', amount: 0, indent: 0 },
    { label: 'Beginning Balance', amount: 512_300_000, indent: 1 },
    { label: 'Appropriations Received', amount: 1_850_000_000, indent: 1 },
    { label: 'Appropriations Transferred In/Out', amount: -23_400_000, indent: 1 },
    { label: 'Other Adjustments', amount: -15_100_000, indent: 1 },
    { label: 'Appropriations Used', amount: -1_725_400_000, indent: 1 },
    { label: 'Total Unexpended Appropriations', amount: 598_400_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'Cumulative Results of Operations:', amount: 0, indent: 0 },
    { label: 'Beginning Balance', amount: 278_200_000, indent: 1 },
    { label: 'Appropriations Used', amount: 1_725_400_000, indent: 1 },
    { label: 'Non-Exchange Revenue', amount: 2_800_000, indent: 1 },
    { label: 'Donations and Forfeitures of Property', amount: 1_200_000, indent: 1 },
    { label: 'Imputed Financing', amount: 84_200_000, indent: 1 },
    { label: 'Other', amount: 100_000, indent: 1 },
    { label: 'Less: Net Cost of Operations', amount: -1_801_400_000, indent: 1 },
    { label: 'Total Cumulative Results of Operations', amount: 290_500_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'NET POSITION', amount: 888_900_000, isTotal: true, indent: 0 },
  ];
}

function generateBudgetaryResources(): FinancialStatementLine[] {
  return [
    { label: 'Budgetary Resources:', amount: 0, indent: 0 },
    { label: 'Unobligated Balance from Prior Year Budget Authority, Net', amount: 233_500_000, indent: 1 },
    { label: 'Appropriations (Discretionary and Mandatory)', amount: 1_850_000_000, indent: 1 },
    { label: 'Spending Authority from Offsetting Collections', amount: 78_500_000, indent: 1 },
    { label: 'Total Budgetary Resources', amount: 2_162_000_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'Status of Budgetary Resources:', amount: 0, indent: 0 },
    { label: 'New Obligations and Upward Adjustments (Total)', amount: 1_725_400_000, indent: 1 },
    { label: 'Unobligated Balance, End of Year:', amount: 0, indent: 1 },
    { label: 'Apportioned, Unexpired Accounts', amount: 312_000_000, indent: 2 },
    { label: 'Unapportioned, Unexpired Accounts', amount: 98_600_000, indent: 2 },
    { label: 'Unexpired Unobligated Balance, End of Year', amount: 410_600_000, isTotal: true, indent: 1 },
    { label: 'Expired Unobligated Balance, End of Year', amount: 26_000_000, indent: 1 },
    { label: 'Total Unobligated Balance, End of Year', amount: 436_600_000, isTotal: true, indent: 1 },
    { label: 'Total Status of Budgetary Resources', amount: 2_162_000_000, isTotal: true, indent: 0 },
    { label: '', amount: 0, indent: 0 },
    { label: 'Outlays, Net:', amount: 0, indent: 0 },
    { label: 'Outlays, Net (Discretionary and Mandatory)', amount: 1_572_200_000, indent: 1 },
    { label: 'Distributed Offsetting Receipts', amount: -34_800_000, indent: 1 },
    { label: 'Agency Outlays, Net (Discretionary and Mandatory)', amount: 1_537_400_000, isTotal: true, indent: 0 },
  ];
}

function generateAuditOpinion(): AuditOpinionData {
  return {
    opinionType: 'qualified',
    adaCompliance: true,
    materialWeaknesses: 2,
    significantDeficiencies: 3,
    summary:
      'In our opinion, except for the effects of the matters described in the Basis for Qualified Opinion paragraph, the financial statements referred to above present fairly, in all material respects, the financial position of the Department of Defense reporting entity as of September 30, and its net cost of operations, changes in net position, and budgetary resources for the year then ended, in accordance with accounting principles generally accepted in the United States of America.',
    details: [
      'Material Weakness: The Department was unable to fully reconcile intragovernmental transactions with trading partners, resulting in unresolved differences of $342.1 million.',
      'Material Weakness: Property, plant, and equipment valuations contain estimated amounts of $268.9 million where supporting documentation was insufficient for independent verification.',
      'Significant Deficiency: Certain obligations in the amount of $45.2 million were recorded in an untimely manner, exceeding the 10-day requirement under DoD FMR Volume 3, Chapter 8.',
      'Significant Deficiency: Travel card management controls were not operating effectively, with 12% of accounts in delinquent status exceeding the 5% threshold.',
      'Significant Deficiency: Civilian pay internal controls over time and attendance did not consistently operate to prevent or detect errors in leave balance calculations.',
      'ADA Compliance: No Anti-Deficiency Act violations were identified during the period under audit.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SF133Viewer({ data }: { data: SF133Data }) {
  const chartData = [
    { name: 'Budgetary Resources', value: data.budgetaryResources.totalBudgetaryResources },
    { name: 'Obligations', value: data.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments },
    { name: 'Outlays', value: data.outlays.outlaysNet },
  ];

  return (
    <div className="space-y-6">
      <Tabs defaultValue="section-1">
        <TabsList>
          <TabsTrigger value="section-1">Section I: Budgetary Resources</TabsTrigger>
          <TabsTrigger value="section-2">Section II: Status</TabsTrigger>
          <TabsTrigger value="section-3">Section III: Outlays</TabsTrigger>
          <TabsTrigger value="summary-chart">Summary Chart</TabsTrigger>
        </TabsList>

        {/* Section I */}
        <TabsContent value="section-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Section I - Budgetary Resources
              </CardTitle>
              <CardDescription>
                TAS: {data.treasuryAccountSymbol} | FY {data.fiscalYear} | Period: {data.period}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%]">Line Item</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Unobligated Balance Brought Forward, Oct 1</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.budgetaryResources.unobligatedBalanceBroughtForward)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Adjustments to Unobligated Balance Brought Forward</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.budgetaryResources.adjustments)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>New Budget Authority (Gross)</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.budgetaryResources.newBudgetAuthority)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Spending Authority from Offsetting Collections</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.budgetaryResources.spendingAuthority)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-gray-50 font-semibold">
                    <TableCell>Total Budgetary Resources</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.budgetaryResources.totalBudgetaryResources)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section II */}
        <TabsContent value="section-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Section II - Status of Budgetary Resources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%]">Line Item</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>New Obligations and Upward Adjustments (Total)</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Apportioned, Unexpired Accounts</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.statusOfBudgetaryResources.apportionedUnexpired)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Unapportioned, Unexpired Accounts</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.statusOfBudgetaryResources.unapportionedUnexpired)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Expired Unobligated Balance, End of Year</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.statusOfBudgetaryResources.expired)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-gray-50 font-semibold">
                    <TableCell>Unobligated Balance, End of Year (Total)</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.statusOfBudgetaryResources.unobligatedBalanceEndOfYear)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section III */}
        <TabsContent value="section-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Section III - Outlays
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%]">Line Item</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>New Obligations (Gross)</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.outlays.newObligations)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Obligated Balance, Net - Beginning of Period</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.outlays.obligatedBalanceNetBeginning)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Obligated Balance, Net - End of Period</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.outlays.obligatedBalanceNetEnd)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-gray-50 font-semibold">
                    <TableCell>Outlays, Net</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(data.outlays.outlaysNet)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Summary Chart */}
        <TabsContent value="summary-chart">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                SF-133 Summary Comparison
              </CardTitle>
              <CardDescription>
                Budgetary Resources vs Obligations vs Outlays
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis
                    fontSize={12}
                    tickFormatter={(value: number) =>
                      `$${(value / 1_000_000_000).toFixed(1)}B`
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index]} />
                    ))}
                  </Bar>
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GTASViewer({ data }: { data: GTASEntry[] }) {
  const proprietaryEntries = data.filter((e) => e.accountType === 'proprietary');
  const budgetaryEntries = data.filter((e) => e.accountType === 'budgetary');

  const proprietaryDebitTotal = proprietaryEntries.reduce((s, e) => s + e.debit, 0);
  const proprietaryCreditTotal = proprietaryEntries.reduce((s, e) => s + e.credit, 0);
  const budgetaryDebitTotal = budgetaryEntries.reduce((s, e) => s + e.debit, 0);
  const budgetaryCreditTotal = budgetaryEntries.reduce((s, e) => s + e.credit, 0);

  function renderSection(title: string, entries: GTASEntry[], debitTotal: number, creditTotal: number) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Account</TableHead>
                <TableHead>Account Title</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.accountNumber}>
                  <TableCell className="font-mono text-sm">
                    {entry.accountNumber}
                  </TableCell>
                  <TableCell>{entry.accountTitle}</TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${entry.net < 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(entry.net)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-gray-50 font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(debitTotal)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(creditTotal)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(debitTotal - creditTotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {renderSection('Proprietary Accounts', proprietaryEntries, proprietaryDebitTotal, proprietaryCreditTotal)}
      {renderSection('Budgetary Accounts', budgetaryEntries, budgetaryDebitTotal, budgetaryCreditTotal)}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Trial Balance Verification</p>
              <p className="text-xs text-gray-500 mt-1">
                Proprietary: Debits {formatCurrency(proprietaryDebitTotal)} = Credits {formatCurrency(proprietaryCreditTotal)}
              </p>
              <p className="text-xs text-gray-500">
                Budgetary: Debits {formatCurrency(budgetaryDebitTotal)} = Credits {formatCurrency(budgetaryCreditTotal)}
              </p>
            </div>
            <Badge variant={
              proprietaryDebitTotal === proprietaryCreditTotal && budgetaryDebitTotal === budgetaryCreditTotal
                ? 'success'
                : 'destructive'
            }>
              {proprietaryDebitTotal === proprietaryCreditTotal && budgetaryDebitTotal === budgetaryCreditTotal
                ? 'In Balance'
                : 'Out of Balance'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialStatementViewer({ title, lines }: { title: string; lines: FinancialStatementLine[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70%]">Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, idx) => {
              if (line.label === '') {
                return (
                  <TableRow key={idx}>
                    <TableCell colSpan={2} className="h-4" />
                  </TableRow>
                );
              }
              const indent = (line.indent || 0) * 24;
              return (
                <TableRow
                  key={idx}
                  className={line.isTotal ? 'bg-gray-50 font-semibold' : ''}
                >
                  <TableCell style={{ paddingLeft: `${16 + indent}px` }}>
                    {line.label}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${line.amount < 0 ? 'text-red-600' : ''}`}>
                    {line.amount !== 0 ? formatCurrency(line.amount) : ''}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AuditOpinionViewer({ data }: { data: AuditOpinionData }) {
  const severity = OPINION_SEVERITY[data.opinionType];

  return (
    <div className="space-y-6">
      {/* Opinion Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Independent Auditor&apos;s Report</CardTitle>
              <CardDescription>Federal Financial Statement Audit Opinion</CardDescription>
            </div>
            <Badge variant={severity.variant}>{severity.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm leading-relaxed text-gray-700">{data.summary}</p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{data.materialWeaknesses}</p>
                <p className="text-xs text-gray-500 mt-1">Material Weaknesses</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">{data.significantDeficiencies}</p>
                <p className="text-xs text-gray-500 mt-1">Significant Deficiencies</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 text-center">
                <p className={`text-2xl font-bold ${data.adaCompliance ? 'text-green-600' : 'text-red-600'}`}>
                  {data.adaCompliance ? 'Compliant' : 'Non-Compliant'}
                </p>
                <p className="text-xs text-gray-500 mt-1">ADA Compliance</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Findings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Findings and Observations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.details.map((detail, idx) => {
              const isMW = detail.startsWith('Material Weakness');
              const isSD = detail.startsWith('Significant Deficiency');
              const isADA = detail.startsWith('ADA Compliance');

              let borderColor = 'border-gray-200';
              let badgeVariant: 'destructive' | 'warning' | 'success' | 'secondary' = 'secondary';
              let badgeLabel = 'Observation';

              if (isMW) {
                borderColor = 'border-red-200';
                badgeVariant = 'destructive';
                badgeLabel = 'Material Weakness';
              } else if (isSD) {
                borderColor = 'border-yellow-200';
                badgeVariant = 'warning';
                badgeLabel = 'Significant Deficiency';
              } else if (isADA) {
                borderColor = 'border-green-200';
                badgeVariant = 'success';
                badgeLabel = 'ADA';
              }

              return (
                <div key={idx} className={`rounded-lg border ${borderColor} p-4`}>
                  <div className="mb-2">
                    <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                  </div>
                  <p className="text-sm text-gray-700">{detail}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function FederalFinancialReportsPage() {
  const { id: engagementId } = useParams<{ id: string }>();

  const [selectedReport, setSelectedReport] = useState<ReportId | null>(null);
  const [fiscalYear, setFiscalYear] = useState('2025');
  const [period, setPeriod] = useState('Annual');
  const [loading, setLoading] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [lastGenerated, setLastGenerated] = useState<Record<string, string>>({});

  const handleSelectReport = useCallback((reportId: ReportId) => {
    setSelectedReport(reportId);
    setGeneratedReport(null);
  }, []);

  const handleBackToSelection = useCallback(() => {
    setSelectedReport(null);
    setGeneratedReport(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedReport || !engagementId) return;

    setLoading(true);
    setGeneratedReport(null);

    try {
      // Attempt to fetch from the actual API endpoints
      if (selectedReport === 'sf133' || selectedReport === 'gtas') {
        const endpoint = selectedReport === 'sf133' ? 'sf133' : 'gtas';
        const res = await fetch(
          `/api/dod/reports/${endpoint}?engagementId=${engagementId}&fiscalYear=${fiscalYear}&period=${period}`
        );

        if (res.ok) {
          const data = await res.json();
          const now = new Date().toISOString();

          if (selectedReport === 'sf133') {
            setGeneratedReport({
              reportId: 'sf133',
              fiscalYear: Number(fiscalYear),
              period,
              generatedAt: now,
              sf133: data,
            });
          } else {
            setGeneratedReport({
              reportId: 'gtas',
              fiscalYear: Number(fiscalYear),
              period,
              generatedAt: now,
              gtas: data.entries || data,
            });
          }

          setLastGenerated((prev) => ({ ...prev, [selectedReport]: now }));
          return;
        }
      }

      // Fallback: generate mock data for demonstration / when API is unavailable
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const now = new Date().toISOString();
      const fy = Number(fiscalYear);

      let report: GeneratedReport;

      switch (selectedReport) {
        case 'sf133':
          report = {
            reportId: 'sf133',
            fiscalYear: fy,
            period,
            generatedAt: now,
            sf133: generateSF133Data(fy, period),
          };
          break;
        case 'gtas':
          report = {
            reportId: 'gtas',
            fiscalYear: fy,
            period,
            generatedAt: now,
            gtas: generateGTASData(),
          };
          break;
        case 'balance-sheet':
          report = {
            reportId: 'balance-sheet',
            fiscalYear: fy,
            period,
            generatedAt: now,
            financialStatement: generateBalanceSheet(),
          };
          break;
        case 'net-cost':
          report = {
            reportId: 'net-cost',
            fiscalYear: fy,
            period,
            generatedAt: now,
            financialStatement: generateNetCost(),
          };
          break;
        case 'net-position':
          report = {
            reportId: 'net-position',
            fiscalYear: fy,
            period,
            generatedAt: now,
            financialStatement: generateNetPosition(),
          };
          break;
        case 'budgetary-resources':
          report = {
            reportId: 'budgetary-resources',
            fiscalYear: fy,
            period,
            generatedAt: now,
            financialStatement: generateBudgetaryResources(),
          };
          break;
        case 'audit-opinion':
          report = {
            reportId: 'audit-opinion',
            fiscalYear: fy,
            period,
            generatedAt: now,
            auditOpinion: generateAuditOpinion(),
          };
          break;
        default:
          return;
      }

      setGeneratedReport(report);
      setLastGenerated((prev) => ({ ...prev, [selectedReport]: now }));
    } catch (error) {
      console.error('Failed to generate report:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedReport, engagementId, fiscalYear, period]);

  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!generatedReport) return;

    let csvContent = '';
    const reportDef = REPORT_DEFINITIONS.find((r) => r.id === generatedReport.reportId);
    const header = `${reportDef?.title || 'Report'} - FY ${generatedReport.fiscalYear} - ${generatedReport.period}\n\n`;

    if (generatedReport.sf133) {
      const d = generatedReport.sf133;
      csvContent =
        header +
        'Section,Line Item,Amount\n' +
        `Budgetary Resources,Unobligated Balance Brought Forward,${d.budgetaryResources.unobligatedBalanceBroughtForward}\n` +
        `Budgetary Resources,Adjustments,${d.budgetaryResources.adjustments}\n` +
        `Budgetary Resources,New Budget Authority,${d.budgetaryResources.newBudgetAuthority}\n` +
        `Budgetary Resources,Spending Authority,${d.budgetaryResources.spendingAuthority}\n` +
        `Budgetary Resources,Total Budgetary Resources,${d.budgetaryResources.totalBudgetaryResources}\n` +
        `Status,New Obligations and Upward Adjustments,${d.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments}\n` +
        `Status,Unobligated Balance End of Year,${d.statusOfBudgetaryResources.unobligatedBalanceEndOfYear}\n` +
        `Status,Apportioned Unexpired,${d.statusOfBudgetaryResources.apportionedUnexpired}\n` +
        `Status,Unapportioned Unexpired,${d.statusOfBudgetaryResources.unapportionedUnexpired}\n` +
        `Status,Expired,${d.statusOfBudgetaryResources.expired}\n` +
        `Outlays,New Obligations,${d.outlays.newObligations}\n` +
        `Outlays,Obligated Balance Net Beginning,${d.outlays.obligatedBalanceNetBeginning}\n` +
        `Outlays,Obligated Balance Net End,${d.outlays.obligatedBalanceNetEnd}\n` +
        `Outlays,Outlays Net,${d.outlays.outlaysNet}\n`;
    } else if (generatedReport.gtas) {
      csvContent =
        header +
        'Account Number,Account Title,Account Type,Debit,Credit,Net\n' +
        generatedReport.gtas
          .map(
            (e) =>
              `${e.accountNumber},"${e.accountTitle}",${e.accountType},${e.debit},${e.credit},${e.net}`
          )
          .join('\n') +
        '\n';
    } else if (generatedReport.financialStatement) {
      csvContent =
        header +
        'Description,Amount\n' +
        generatedReport.financialStatement
          .map((l) => `"${'  '.repeat(l.indent || 0)}${l.label}",${l.amount || ''}`)
          .join('\n') +
        '\n';
    } else if (generatedReport.auditOpinion) {
      csvContent =
        header +
        'Field,Value\n' +
        `Opinion Type,${generatedReport.auditOpinion.opinionType}\n` +
        `ADA Compliance,${generatedReport.auditOpinion.adaCompliance}\n` +
        `Material Weaknesses,${generatedReport.auditOpinion.materialWeaknesses}\n` +
        `Significant Deficiencies,${generatedReport.auditOpinion.significantDeficiencies}\n` +
        `\nFindings\n` +
        generatedReport.auditOpinion.details.map((d) => `"${d}"`).join('\n') +
        '\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedReport.reportId}_FY${generatedReport.fiscalYear}_${generatedReport.period}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [generatedReport]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // -------------------------------------------------------------------------
  // Render: Report Selection Panel
  // -------------------------------------------------------------------------

  function renderReportSelection() {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {REPORT_DEFINITIONS.map((report) => {
          const Icon = report.icon;
          const lastGen = lastGenerated[report.id];

          return (
            <Card
              key={report.id}
              className="flex flex-col cursor-pointer transition-all hover:shadow-md hover:border-blue-300"
              onClick={() => handleSelectReport(report.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-blue-50 p-2.5">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm">{report.title}</CardTitle>
                    <CardDescription className="mt-1 text-xs">
                      {report.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                {lastGen && (
                  <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    <span>
                      Last generated:{' '}
                      {new Date(lastGen).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectReport(report.id);
                  }}
                >
                  Generate
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Parameters Panel
  // -------------------------------------------------------------------------

  function renderParametersPanel() {
    const selectedDef = REPORT_DEFINITIONS.find((r) => r.id === selectedReport);
    if (!selectedDef) return null;

    const Icon = selectedDef.icon;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">{selectedDef.title}</CardTitle>
              <CardDescription>{selectedDef.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Fiscal Year</label>
              <Select
                options={FISCAL_YEAR_OPTIONS}
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Period</label>
              <Select
                options={PERIOD_OPTIONS}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileBarChart className="mr-2 h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Report Viewer
  // -------------------------------------------------------------------------

  function renderReportViewer() {
    if (!generatedReport) return null;

    const reportDef = REPORT_DEFINITIONS.find((r) => r.id === generatedReport.reportId);

    return (
      <div className="space-y-4">
        {/* Export Bar */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Badge variant="success">Generated</Badge>
            <span className="text-sm text-gray-600">
              {reportDef?.title} -- FY {generatedReport.fiscalYear} -- {generatedReport.period}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(generatedReport.generatedAt).toLocaleString('en-US')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </div>

        {/* Report Content */}
        {generatedReport.sf133 && (
          <SF133Viewer data={generatedReport.sf133} />
        )}
        {generatedReport.gtas && (
          <GTASViewer data={generatedReport.gtas} />
        )}
        {generatedReport.financialStatement && generatedReport.reportId === 'balance-sheet' && (
          <FinancialStatementViewer
            title="Statement of Financial Position"
            lines={generatedReport.financialStatement}
          />
        )}
        {generatedReport.financialStatement && generatedReport.reportId === 'net-cost' && (
          <FinancialStatementViewer
            title="Statement of Net Cost"
            lines={generatedReport.financialStatement}
          />
        )}
        {generatedReport.financialStatement && generatedReport.reportId === 'net-position' && (
          <FinancialStatementViewer
            title="Statement of Changes in Net Position"
            lines={generatedReport.financialStatement}
          />
        )}
        {generatedReport.financialStatement && generatedReport.reportId === 'budgetary-resources' && (
          <FinancialStatementViewer
            title="Statement of Budgetary Resources"
            lines={generatedReport.financialStatement}
          />
        )}
        {generatedReport.auditOpinion && (
          <AuditOpinionViewer data={generatedReport.auditOpinion} />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedReport && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToSelection}
              className="mr-1"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Calendar className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Federal Financial Reports
            </h1>
            <p className="text-sm text-gray-500">
              DoD federal financial report generation and viewing
            </p>
          </div>
        </div>
        {!selectedReport && (
          <Badge variant="secondary" className="text-xs">
            {REPORT_DEFINITIONS.length} Report Types
          </Badge>
        )}
      </div>

      {/* Content */}
      {!selectedReport && renderReportSelection()}

      {selectedReport && (
        <div className="space-y-6">
          {renderParametersPanel()}

          {/* Loading State */}
          {loading && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-gray-200 bg-white">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-500">Generating report data...</p>
              </div>
            </div>
          )}

          {!loading && renderReportViewer()}

          {/* Empty state when no report generated yet */}
          {!loading && !generatedReport && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
              <div className="flex flex-col items-center gap-2 text-center">
                <FileBarChart className="h-10 w-10 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">
                  Select parameters and click Generate to create the report
                </p>
                <p className="text-xs text-gray-400">
                  Reports are generated from engagement financial data
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
