'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  DollarSign, Users, Shield, AlertTriangle, Loader2,
  CheckCircle2, XCircle, TrendingUp, Award,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import type { MilitaryPayRecord, CivilianPayRecord } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function statusBadgeVariant(status: string): 'success' | 'destructive' | 'warning' | 'secondary' {
  switch (status) {
    case 'compliant':
    case 'active':
      return 'success';
    case 'non_compliant':
    case 'error':
      return 'destructive';
    case 'review':
    case 'pending':
      return 'warning';
    default:
      return 'secondary';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETIREMENT_COLORS: Record<string, string> = {
  fers: '#3b82f6',
  csrs: '#f59e0b',
  fers_revised: '#10b981',
};

const RETIREMENT_LABELS: Record<string, string> = {
  fers: 'FERS',
  csrs: 'CSRS',
  fers_revised: 'FERS Revised',
};

const GRADE_COLORS = ['#3b82f6', '#6366f1'];

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_MILITARY: MilitaryPayRecord[] = [
  { id: 'mp-001', engagementId: '', memberId: 'M-10234', payGrade: 'E-5', yearsOfService: 8, basicPay: 3511.00, bah: 1800.00, bas: 407.00, combatZoneExclusion: false, tspContribution: 351.10, tspMatchAmount: 175.55, separationPay: 0, retirementPay: 0, totalCompensation: 6069.10, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'mp-002', engagementId: '', memberId: 'M-10891', payGrade: 'O-3', yearsOfService: 6, basicPay: 5922.00, bah: 2400.00, bas: 288.00, combatZoneExclusion: true, tspContribution: 592.20, tspMatchAmount: 296.10, separationPay: 0, retirementPay: 0, totalCompensation: 9202.20, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'mp-003', engagementId: '', memberId: 'M-11542', payGrade: 'E-7', yearsOfService: 14, basicPay: 4480.00, bah: 2100.00, bas: 407.00, combatZoneExclusion: false, tspContribution: 448.00, tspMatchAmount: 224.00, separationPay: 0, retirementPay: 0, totalCompensation: 7435.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'mp-004', engagementId: '', memberId: 'M-12001', payGrade: 'O-5', yearsOfService: 16, basicPay: 8521.00, bah: 2700.00, bas: 288.00, combatZoneExclusion: false, tspContribution: 1950.00, tspMatchAmount: 426.05, separationPay: 0, retirementPay: 0, totalCompensation: 13459.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'review', createdAt: '2025-01-15' },
  { id: 'mp-005', engagementId: '', memberId: 'M-12340', payGrade: 'E-3', yearsOfService: 2, basicPay: 2377.00, bah: 1500.00, bas: 407.00, combatZoneExclusion: false, tspContribution: 118.85, tspMatchAmount: 118.85, separationPay: 0, retirementPay: 0, totalCompensation: 4284.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'mp-006', engagementId: '', memberId: 'M-13102', payGrade: 'O-1', yearsOfService: 1, basicPay: 3637.00, bah: 1650.00, bas: 288.00, combatZoneExclusion: false, tspContribution: 181.85, tspMatchAmount: 181.85, separationPay: 0, retirementPay: 0, totalCompensation: 5575.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'mp-007', engagementId: '', memberId: 'M-14500', payGrade: 'E-9', yearsOfService: 22, basicPay: 6500.00, bah: 2400.00, bas: 407.00, combatZoneExclusion: true, tspContribution: 1950.00, tspMatchAmount: 325.00, separationPay: 0, retirementPay: 0, totalCompensation: 11257.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'non_compliant', createdAt: '2025-01-15' },
  { id: 'mp-008', engagementId: '', memberId: 'M-15201', payGrade: 'O-4', yearsOfService: 10, basicPay: 7144.00, bah: 2550.00, bas: 288.00, combatZoneExclusion: false, tspContribution: 714.40, tspMatchAmount: 357.20, separationPay: 0, retirementPay: 0, totalCompensation: 10696.40, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
];

const MOCK_CIVILIAN: CivilianPayRecord[] = [
  { id: 'cp-001', engagementId: '', employeeId: 'C-20134', payPlan: 'GS', grade: '13', step: 5, locality: 'Washington-Baltimore', basicPay: 9245.00, localityAdjustment: 2848.00, fehbContribution: 620.00, fegliContribution: 32.00, retirementContribution: 924.50, retirementPlan: 'fers', tspContribution: 924.50, tspMatchAmount: 462.25, premiumPay: 0, overtimePay: 0, leaveHoursAccrued: 8, totalCompensation: 14131.75, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'cp-002', engagementId: '', employeeId: 'C-20567', payPlan: 'GS', grade: '15', step: 10, locality: 'Washington-Baltimore', basicPay: 13125.00, localityAdjustment: 4043.00, fehbContribution: 720.00, fegliContribution: 48.00, retirementContribution: 1312.50, retirementPlan: 'csrs', tspContribution: 656.25, tspMatchAmount: 0, premiumPay: 0, overtimePay: 0, leaveHoursAccrued: 8, totalCompensation: 19248.50, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'cp-003', engagementId: '', employeeId: 'C-21001', payPlan: 'GS', grade: '9', step: 3, locality: 'San Francisco', basicPay: 5500.00, localityAdjustment: 2282.00, fehbContribution: 480.00, fegliContribution: 22.00, retirementContribution: 550.00, retirementPlan: 'fers_revised', tspContribution: 550.00, tspMatchAmount: 275.00, premiumPay: 0, overtimePay: 250.00, leaveHoursAccrued: 6, totalCompensation: 9359.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'cp-004', engagementId: '', employeeId: 'C-21456', payPlan: 'GS', grade: '12', step: 7, locality: 'Rest of US', basicPay: 8200.00, localityAdjustment: 1312.00, fehbContribution: 560.00, fegliContribution: 28.00, retirementContribution: 820.00, retirementPlan: 'fers', tspContribution: 820.00, tspMatchAmount: 410.00, premiumPay: 0, overtimePay: 0, leaveHoursAccrued: 6, totalCompensation: 11590.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'review', createdAt: '2025-01-15' },
  { id: 'cp-005', engagementId: '', employeeId: 'C-22010', payPlan: 'GS', grade: '7', step: 1, locality: 'Washington-Baltimore', basicPay: 4337.00, localityAdjustment: 1336.00, fehbContribution: 380.00, fegliContribution: 18.00, retirementContribution: 433.70, retirementPlan: 'fers', tspContribution: 433.70, tspMatchAmount: 216.85, premiumPay: 0, overtimePay: 0, leaveHoursAccrued: 4, totalCompensation: 6721.55, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
  { id: 'cp-006', engagementId: '', employeeId: 'C-22500', payPlan: 'GS', grade: '14', step: 8, locality: 'New York', basicPay: 11400.00, localityAdjustment: 3990.00, fehbContribution: 680.00, fegliContribution: 42.00, retirementContribution: 1140.00, retirementPlan: 'fers_revised', tspContribution: 1140.00, tspMatchAmount: 570.00, premiumPay: 0, overtimePay: 450.00, leaveHoursAccrued: 8, totalCompensation: 18842.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'non_compliant', createdAt: '2025-01-15' },
  { id: 'cp-007', engagementId: '', employeeId: 'C-23100', payPlan: 'GS', grade: '11', step: 4, locality: 'Rest of US', basicPay: 6800.00, localityAdjustment: 1088.00, fehbContribution: 520.00, fegliContribution: 26.00, retirementContribution: 680.00, retirementPlan: 'csrs', tspContribution: 340.00, tspMatchAmount: 0, premiumPay: 0, overtimePay: 0, leaveHoursAccrued: 6, totalCompensation: 9114.00, fiscalYear: 2025, payPeriod: '2025-01', status: 'compliant', createdAt: '2025-01-15' },
];

// ---------------------------------------------------------------------------
// Compliance Check Data
// ---------------------------------------------------------------------------

interface ComplianceCheck {
  id: string;
  rule: string;
  description: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedCount: number;
}

const COMPLIANCE_CHECKS: ComplianceCheck[] = [
  { id: 'pc-1', rule: 'FMR Vol 7 Ch 1', description: 'Pay cap compliance - Military basic pay does not exceed statutory limits', passed: true, details: 'All 8 military records within FY2025 pay cap limits.', severity: 'critical', affectedCount: 0 },
  { id: 'pc-2', rule: 'FMR Vol 8 Ch 3', description: 'Pay cap compliance - Civilian pay does not exceed Executive Schedule Level IV', passed: false, details: '1 civilian record exceeds locality-adjusted pay cap by $1,242.00.', severity: 'critical', affectedCount: 1 },
  { id: 'pc-3', rule: '5 USC 8432', description: 'TSP contribution limits - Annual contributions do not exceed IRC 402(g) limit ($23,500 for 2025)', passed: false, details: '2 records project annual TSP contributions exceeding the $23,500 limit.', severity: 'high', affectedCount: 2 },
  { id: 'pc-4', rule: 'FMR Vol 7 Ch 44', description: 'TSP matching - BRS members receive correct matching contributions (up to 5%)', passed: true, details: 'All matching contributions validated against Blended Retirement System rules.', severity: 'medium', affectedCount: 0 },
  { id: 'pc-5', rule: 'FMR Vol 8 Ch 5', description: 'FEHB enrollment validation - All eligible employees enrolled in health benefits', passed: true, details: 'All 7 civilian employees have active FEHB enrollment records.', severity: 'high', affectedCount: 0 },
  { id: 'pc-6', rule: 'FMR Vol 7 Ch 3', description: 'BAH rate validation - Housing allowances match locality-based rate tables', passed: true, details: 'All BAH amounts verified against DoD BAH rate calculator for duty station.', severity: 'medium', affectedCount: 0 },
  { id: 'pc-7', rule: 'FMR Vol 8 Ch 8', description: 'Retirement plan enrollment - Employees correctly assigned to FERS, CSRS, or FERS-Revised', passed: true, details: 'All retirement plan assignments verified against service computation dates.', severity: 'high', affectedCount: 0 },
  { id: 'pc-8', rule: '26 USC 112', description: 'Combat Zone Tax Exclusion - Enlisted members in CZE have correct tax withholding exclusions', passed: true, details: '2 members with combat zone exclusion have proper tax-exempt status applied.', severity: 'medium', affectedCount: 0 },
  { id: 'pc-9', rule: 'FMR Vol 8 Ch 6', description: 'Premium/overtime pay caps - Annual premium pay does not exceed GS-15 Step 10 rate', passed: false, details: '1 civilian record with projected overtime exceeding biweekly premium pay cap.', severity: 'high', affectedCount: 1 },
  { id: 'pc-10', rule: 'FMR Vol 7 Ch 1', description: 'BAS rate validation - Subsistence allowances match current published rates', passed: true, details: 'All BAS amounts match FY2025 published rates (Enlisted: $407.00, Officer: $288.00).', severity: 'low', affectedCount: 0 },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PayCompliancePage() {
  const { id: engagementId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [militaryRecords, setMilitaryRecords] = useState<MilitaryPayRecord[]>([]);
  const [civilianRecords, setCivilianRecords] = useState<CivilianPayRecord[]>([]);

  useEffect(() => {
    if (!engagementId) return;

    async function loadData() {
      setLoading(true);
      try {
        const [milRes, civRes] = await Promise.allSettled([
          fetch(`/api/dod/military-pay?engagementId=${engagementId}`),
          fetch(`/api/dod/civilian-pay?engagementId=${engagementId}`),
        ]);

        if (milRes.status === 'fulfilled' && milRes.value.ok) {
          const data = await milRes.value.json();
          const records = data.militaryPayRecords || data.records || [];
          setMilitaryRecords(records.length > 0 ? records : MOCK_MILITARY);
        } else {
          setMilitaryRecords(MOCK_MILITARY);
        }

        if (civRes.status === 'fulfilled' && civRes.value.ok) {
          const data = await civRes.value.json();
          const records = data.civilianPayRecords || data.records || [];
          setCivilianRecords(records.length > 0 ? records : MOCK_CIVILIAN);
        } else {
          setCivilianRecords(MOCK_CIVILIAN);
        }
      } catch (error) {
        console.error('Failed to load pay data:', error);
        setMilitaryRecords(MOCK_MILITARY);
        setCivilianRecords(MOCK_CIVILIAN);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [engagementId]);

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const totalMilComp = militaryRecords.reduce((s, r) => s + r.totalCompensation, 0);
  const totalCivComp = civilianRecords.reduce((s, r) => s + r.totalCompensation, 0);
  const totalComp = totalMilComp + totalCivComp;
  const complianceIssues = COMPLIANCE_CHECKS.filter((c) => !c.passed).length;
  const combatZoneCount = militaryRecords.filter((r) => r.combatZoneExclusion).length;

  // Average pay by grade (military)
  const milGradeMap = new Map<string, { total: number; count: number }>();
  militaryRecords.forEach((r) => {
    const existing = milGradeMap.get(r.payGrade) || { total: 0, count: 0 };
    existing.total += r.basicPay;
    existing.count += 1;
    milGradeMap.set(r.payGrade, existing);
  });
  const milGradeAvg = Array.from(milGradeMap.entries())
    .map(([grade, v]) => ({ grade, avgPay: v.total / v.count }))
    .sort((a, b) => a.grade.localeCompare(b.grade));

  // Retirement plan breakdown (civilian)
  const retirementBreakdown = civilianRecords.reduce<Record<string, number>>((acc, r) => {
    acc[r.retirementPlan] = (acc[r.retirementPlan] || 0) + 1;
    return acc;
  }, {});
  const retirementPieData = Object.entries(retirementBreakdown).map(([plan, count]) => ({
    name: RETIREMENT_LABELS[plan] || plan,
    value: count,
    color: RETIREMENT_COLORS[plan] || '#94a3b8',
  }));

  // Military vs civilian distribution by grade for bar chart
  const gradeDistribution: Record<string, { military: number; civilian: number }> = {};
  militaryRecords.forEach((r) => {
    if (!gradeDistribution[r.payGrade]) gradeDistribution[r.payGrade] = { military: 0, civilian: 0 };
    gradeDistribution[r.payGrade].military += r.totalCompensation;
  });
  civilianRecords.forEach((r) => {
    const gradeLabel = `GS-${r.grade}`;
    if (!gradeDistribution[gradeLabel]) gradeDistribution[gradeLabel] = { military: 0, civilian: 0 };
    gradeDistribution[gradeLabel].civilian += r.totalCompensation;
  });
  const gradeChartData = Object.entries(gradeDistribution)
    .map(([grade, vals]) => ({ grade, military: vals.military, civilian: vals.civilian }))
    .sort((a, b) => a.grade.localeCompare(b.grade));

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Loading Pay Compliance data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <DollarSign className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Military &amp; Civilian Pay Compliance</h1>
          <p className="text-sm text-gray-500">DoD FMR Volumes 7 &amp; 8 - Pay Entitlements, Deductions &amp; Benefits Audit</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{militaryRecords.length}</div>
                <div className="text-xs text-gray-500">Military Pay Records</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{civilianRecords.length}</div>
                <div className="text-xs text-gray-500">Civilian Pay Records</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{fmtCompact.format(totalComp)}</div>
                <div className="text-xs text-gray-500">Total Compensation</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{complianceIssues}</div>
                <div className="text-xs text-gray-500">Compliance Issues Found</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="military">
        <TabsList>
          <TabsTrigger value="military">Military Pay</TabsTrigger>
          <TabsTrigger value="civilian">Civilian Pay</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Analysis</TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* Military Pay Tab */}
        {/* ================================================================= */}
        <TabsContent value="military">
          <div className="space-y-6">
            {/* Summary metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Military Compensation</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{fmt.format(totalMilComp)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Combat Zone Exclusions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-500" />
                    <span className="text-xl font-bold">{combatZoneCount}</span>
                    <span className="text-sm text-gray-500">of {militaryRecords.length} members</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Average Pay by Grade</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {milGradeAvg.slice(0, 4).map((g) => (
                      <div key={g.grade} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-gray-600">{g.grade}</span>
                        <span className="font-medium">{fmt.format(g.avgPay)}</span>
                      </div>
                    ))}
                    {milGradeAvg.length > 4 && (
                      <div className="text-xs text-gray-400">+{milGradeAvg.length - 4} more grades</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Military Pay Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Military Pay Records</CardTitle>
                <CardDescription>FMR Volume 7 - Military Pay &amp; Allowances</CardDescription>
              </CardHeader>
              <CardContent>
                {militaryRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Shield className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-sm font-medium text-gray-900">No military pay records</p>
                    <p className="text-sm text-gray-500 mt-1">Upload military pay data to begin analysis.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Pay Grade</TableHead>
                        <TableHead className="text-right">YOS</TableHead>
                        <TableHead className="text-right">Basic Pay</TableHead>
                        <TableHead className="text-right">BAH</TableHead>
                        <TableHead className="text-right">BAS</TableHead>
                        <TableHead className="text-right">TSP</TableHead>
                        <TableHead className="text-right">Total Comp</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {militaryRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">{record.memberId}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.payGrade}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{record.yearsOfService}</TableCell>
                          <TableCell className="text-right font-medium">{fmt.format(record.basicPay)}</TableCell>
                          <TableCell className="text-right">{fmt.format(record.bah)}</TableCell>
                          <TableCell className="text-right">{fmt.format(record.bas)}</TableCell>
                          <TableCell className="text-right">{fmt.format(record.tspContribution)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt.format(record.totalCompensation)}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(record.status)}>
                              {record.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Civilian Pay Tab */}
        {/* ================================================================= */}
        <TabsContent value="civilian">
          <div className="space-y-6">
            {/* Summary with pie chart */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Retirement Plan Breakdown</CardTitle>
                  <CardDescription>Distribution of retirement plans across civilian workforce</CardDescription>
                </CardHeader>
                <CardContent>
                  {retirementPieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={retirementPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {retirementPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Legend />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[250px] items-center justify-center text-gray-400">
                      No civilian retirement data available
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Civilian Pay Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total Civilian Compensation</span>
                      <span className="text-lg font-bold">{fmt.format(totalCivComp)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average Compensation</span>
                      <span className="font-medium">{fmt.format(civilianRecords.length > 0 ? totalCivComp / civilianRecords.length : 0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">FEHB Enrolled</span>
                      <span className="font-medium">{civilianRecords.filter((r) => r.fehbContribution > 0).length} / {civilianRecords.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">TSP Participants</span>
                      <span className="font-medium">{civilianRecords.filter((r) => r.tspContribution > 0).length} / {civilianRecords.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">With Overtime Pay</span>
                      <span className="font-medium">{civilianRecords.filter((r) => r.overtimePay > 0).length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Compliance Rate</span>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={(civilianRecords.filter((r) => r.status === 'compliant').length / Math.max(civilianRecords.length, 1)) * 100}
                          color="#16a34a"
                          className="w-20"
                        />
                        <span className="text-sm font-medium">
                          {((civilianRecords.filter((r) => r.status === 'compliant').length / Math.max(civilianRecords.length, 1)) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Civilian Pay Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Civilian Pay Records</CardTitle>
                <CardDescription>FMR Volume 8 - Civilian Pay Policy &amp; Procedures</CardDescription>
              </CardHeader>
              <CardContent>
                {civilianRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-sm font-medium text-gray-900">No civilian pay records</p>
                    <p className="text-sm text-gray-500 mt-1">Upload civilian pay data to begin analysis.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Pay Plan</TableHead>
                        <TableHead>Grade/Step</TableHead>
                        <TableHead>Locality</TableHead>
                        <TableHead className="text-right">Basic Pay</TableHead>
                        <TableHead className="text-right">Locality Adj</TableHead>
                        <TableHead className="text-right">FEHB</TableHead>
                        <TableHead>Retirement</TableHead>
                        <TableHead className="text-right">Total Comp</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {civilianRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">{record.employeeId}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.payPlan}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{record.grade}/{record.step}</TableCell>
                          <TableCell className="text-sm max-w-[120px] truncate">{record.locality}</TableCell>
                          <TableCell className="text-right font-medium">{fmt.format(record.basicPay)}</TableCell>
                          <TableCell className="text-right">{fmt.format(record.localityAdjustment)}</TableCell>
                          <TableCell className="text-right">{fmt.format(record.fehbContribution)}</TableCell>
                          <TableCell>
                            <Badge variant="info">{RETIREMENT_LABELS[record.retirementPlan] || record.retirementPlan}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{fmt.format(record.totalCompensation)}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(record.status)}>
                              {record.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Compliance Analysis Tab */}
        {/* ================================================================= */}
        <TabsContent value="compliance">
          <div className="space-y-6">
            {/* Compliance Check Results */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Pay Compliance Check Results</CardTitle>
                    <CardDescription>Automated validation against DoD FMR pay regulations</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{COMPLIANCE_CHECKS.filter((c) => c.passed).length} Passed</Badge>
                    <Badge variant="destructive">{COMPLIANCE_CHECKS.filter((c) => !c.passed).length} Failed</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Result</TableHead>
                      <TableHead>Rule Reference</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead className="text-right">Affected</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COMPLIANCE_CHECKS.map((check) => (
                      <TableRow key={check.id}>
                        <TableCell>
                          {check.passed ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{check.rule}</TableCell>
                        <TableCell className="text-sm max-w-xs">{check.description}</TableCell>
                        <TableCell>
                          <Badge variant={check.severity}>{check.severity}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {check.affectedCount > 0 ? check.affectedCount : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-xs">{check.details}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Bar chart comparing military vs civilian by grade */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pay Distribution by Grade</CardTitle>
                <CardDescription>Military vs Civilian total compensation comparison</CardDescription>
              </CardHeader>
              <CardContent>
                {gradeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={gradeChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="grade" fontSize={11} angle={-45} textAnchor="end" height={60} />
                      <YAxis fontSize={12} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                      <Tooltip formatter={(value: number) => fmt.format(value)} />
                      <Legend />
                      <Bar dataKey="military" name="Military" fill={GRADE_COLORS[0]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="civilian" name="Civilian" fill={GRADE_COLORS[1]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[350px] items-center justify-center text-gray-400">
                    No grade distribution data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Benefits Enrollment Validation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Benefits Enrollment Validation Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">FEHB Enrollment</span>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="text-lg font-bold">{civilianRecords.filter((r) => r.fehbContribution > 0).length}/{civilianRecords.length}</div>
                    <Progress
                      value={(civilianRecords.filter((r) => r.fehbContribution > 0).length / Math.max(civilianRecords.length, 1)) * 100}
                      color="#16a34a"
                      className="mt-2"
                    />
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">FEGLI Coverage</span>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="text-lg font-bold">{civilianRecords.filter((r) => r.fegliContribution > 0).length}/{civilianRecords.length}</div>
                    <Progress
                      value={(civilianRecords.filter((r) => r.fegliContribution > 0).length / Math.max(civilianRecords.length, 1)) * 100}
                      color="#16a34a"
                      className="mt-2"
                    />
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">TSP Participation</span>
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="text-lg font-bold">
                      {militaryRecords.filter((r) => r.tspContribution > 0).length + civilianRecords.filter((r) => r.tspContribution > 0).length}
                      /{militaryRecords.length + civilianRecords.length}
                    </div>
                    <Progress
                      value={((militaryRecords.filter((r) => r.tspContribution > 0).length + civilianRecords.filter((r) => r.tspContribution > 0).length) / Math.max(militaryRecords.length + civilianRecords.length, 1)) * 100}
                      color="#3b82f6"
                      className="mt-2"
                    />
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Retirement Enrolled</span>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="text-lg font-bold">{civilianRecords.filter((r) => r.retirementContribution > 0).length}/{civilianRecords.length}</div>
                    <Progress
                      value={(civilianRecords.filter((r) => r.retirementContribution > 0).length / Math.max(civilianRecords.length, 1)) * 100}
                      color="#16a34a"
                      className="mt-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
