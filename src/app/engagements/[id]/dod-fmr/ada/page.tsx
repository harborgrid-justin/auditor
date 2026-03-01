'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle, Shield, DollarSign, Users, Clock, Send,
  ChevronDown, ChevronRight, ArrowRight, Filter, Plus,
  CheckCircle2, XCircle, Search, FileWarning, Scale,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

import type { ADAViolation, ADAViolationType, ADAInvestigationStatus } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIOLATION_TYPE_LABELS: Record<ADAViolationType, string> = {
  over_obligation: 'Over-Obligation',
  over_expenditure: 'Over-Expenditure',
  unauthorized_purpose: 'Unauthorized Purpose',
  advance_without_authority: 'Advance w/o Authority',
  voluntary_service: 'Voluntary Service',
  time_violation: 'Time Violation',
};

const STATUS_LABELS: Record<ADAInvestigationStatus, string> = {
  detected: 'Detected',
  under_investigation: 'Under Investigation',
  confirmed: 'Confirmed',
  reported_to_president: 'Reported to President',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<ADAInvestigationStatus, string> = {
  detected: '#eab308',
  under_investigation: '#f97316',
  confirmed: '#ef4444',
  reported_to_president: '#a855f7',
  resolved: '#22c55e',
};

const STATUS_BADGE_CLASSES: Record<ADAInvestigationStatus, string> = {
  detected: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  under_investigation: 'bg-orange-100 text-orange-800 border-orange-200',
  confirmed: 'bg-red-100 text-red-800 border-red-200',
  reported_to_president: 'bg-purple-100 text-purple-800 border-purple-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
};

const TYPE_COLORS: Record<string, string> = {
  over_obligation: '#ef4444',
  over_expenditure: '#f97316',
  unauthorized_purpose: '#a855f7',
  advance_without_authority: '#3b82f6',
  voluntary_service: '#06b6d4',
  time_violation: '#eab308',
};

const STATUTORY_BASIS_OPTIONS = [
  { value: '', label: 'Select statutory basis...' },
  { value: '31 USC 1341(a)(1)(A)', label: '31 USC 1341(a)(1)(A) - Obligations exceeding amount available' },
  { value: '31 USC 1341(a)(1)(B)', label: '31 USC 1341(a)(1)(B) - Obligations before appropriation' },
  { value: '31 USC 1342', label: '31 USC 1342 - Voluntary services prohibition' },
  { value: '31 USC 1517(a)', label: '31 USC 1517(a) - Exceeding apportionment/allotment' },
];

const VIOLATION_TYPE_OPTIONS = [
  { value: '', label: 'Select violation type...' },
  { value: 'over_obligation', label: 'Over-Obligation' },
  { value: 'over_expenditure', label: 'Over-Expenditure' },
  { value: 'unauthorized_purpose', label: 'Unauthorized Purpose' },
  { value: 'advance_without_authority', label: 'Advance Without Authority' },
  { value: 'voluntary_service', label: 'Voluntary Service' },
  { value: 'time_violation', label: 'Time Violation' },
];

const FILTER_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  ...VIOLATION_TYPE_OPTIONS.filter(o => o.value !== ''),
];

const FILTER_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'detected', label: 'Detected' },
  { value: 'under_investigation', label: 'Under Investigation' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'reported_to_president', label: 'Reported to President' },
  { value: 'resolved', label: 'Resolved' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatCurrencyCompact = (amount: number): string => {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return formatCurrency(amount);
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const daysSince = (dateStr: string): number => {
  const now = new Date();
  const then = new Date(dateStr);
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
};

const truncateId = (id: string): string => id.length > 8 ? `${id.substring(0, 8)}...` : id;

// ---------------------------------------------------------------------------
// Mock appropriation risk data (for dashboard)
// ---------------------------------------------------------------------------

interface AppropriationRisk {
  name: string;
  utilization: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

const MOCK_APPROPRIATION_RISKS: AppropriationRisk[] = [
  { name: 'O&M Army (21-2020)', utilization: 98.2, riskLevel: 'critical' },
  { name: 'MILPERS Navy (17-1453)', utilization: 94.7, riskLevel: 'high' },
  { name: 'Procurement AF (57-3010)', utilization: 89.1, riskLevel: 'medium' },
  { name: 'RDT&E Defense-Wide (97-0400)', utilization: 85.3, riskLevel: 'medium' },
  { name: 'MILCON Army (21-2050)', utilization: 72.6, riskLevel: 'low' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ADAMonitoringPage() {
  const { id: engagementId } = useParams<{ id: string }>();

  // State
  const [violations, setViolations] = useState<ADAViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFiscalYear, setFilterFiscalYear] = useState('all');

  // Report form
  const [formData, setFormData] = useState({
    violationType: '' as string,
    statutoryBasis: '' as string,
    amount: '',
    description: '',
    responsibleOfficer: '',
    appropriationId: '',
    fiscalYear: new Date().getFullYear().toString(),
  });

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!engagementId) return;

    async function fetchViolations() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dod/ada?engagementId=${engagementId}`);
        if (res.ok) {
          const data = await res.json();
          setViolations(data.violations || []);
        }
      } catch (error) {
        console.error('Failed to fetch ADA violations:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchViolations();
  }, [engagementId]);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const activeViolations = useMemo(
    () => violations.filter((v: ADAViolation) => v.investigationStatus !== 'resolved'),
    [violations]
  );

  const totalAmountAtRisk = useMemo(
    () => activeViolations.reduce((sum: number, v: ADAViolation) => sum + v.amount, 0),
    [activeViolations]
  );

  const reportedToPresidentCount = useMemo(
    () => violations.filter((v: ADAViolation) => v.investigationStatus === 'reported_to_president').length,
    [violations]
  );

  const avgResolutionDays = useMemo(() => {
    const resolved = violations.filter((v: ADAViolation) => v.investigationStatus === 'resolved' && v.reportedDate);
    if (resolved.length === 0) return 0;
    const totalDays = resolved.reduce((sum: number, v: ADAViolation) => {
      const discovered = new Date(v.discoveredDate);
      const reported = new Date(v.reportedDate!);
      return sum + Math.floor((reported.getTime() - discovered.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    return Math.round(totalDays / resolved.length);
  }, [violations]);

  // Fiscal year options from violations
  const fiscalYearOptions = useMemo(() => {
    const yearSet = new Set<number>();
    violations.forEach((v: ADAViolation) => yearSet.add(v.fiscalYear));
    const years = Array.from(yearSet).sort((a: number, b: number) => b - a);
    return [
      { value: 'all', label: 'All Years' },
      ...years.map((y: number) => ({ value: y.toString(), label: `FY ${y}` })),
    ];
  }, [violations]);

  // Filtered violations
  const filteredViolations = useMemo(() => {
    return violations.filter((v: ADAViolation) => {
      if (filterType !== 'all' && v.violationType !== filterType) return false;
      if (filterStatus !== 'all' && v.investigationStatus !== filterStatus) return false;
      if (filterFiscalYear !== 'all' && v.fiscalYear.toString() !== filterFiscalYear) return false;
      return true;
    });
  }, [violations, filterType, filterStatus, filterFiscalYear]);

  // Chart data: violations by type
  const violationsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    violations.forEach((v: ADAViolation) => {
      counts[v.violationType] = (counts[v.violationType] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      name: VIOLATION_TYPE_LABELS[type as ADAViolationType] || type,
      value: count,
      fill: TYPE_COLORS[type] || '#6b7280',
    }));
  }, [violations]);

  // Chart data: violations by status (horizontal bar)
  const violationsByStatus = useMemo(() => {
    const statusOrder: ADAInvestigationStatus[] = [
      'detected', 'under_investigation', 'confirmed', 'reported_to_president', 'resolved',
    ];
    return statusOrder.map((status: ADAInvestigationStatus) => ({
      name: STATUS_LABELS[status],
      count: violations.filter((v: ADAViolation) => v.investigationStatus === status).length,
      fill: STATUS_COLORS[status],
    }));
  }, [violations]);

  // Chart data: monthly trend
  const monthlyTrend = useMemo(() => {
    const monthMap: Record<string, number> = {};
    violations.forEach((v: ADAViolation) => {
      const date = new Date(v.discoveredDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month,
        violations: count,
      }));
  }, [violations]);

  // Kanban columns
  const kanbanColumns: { status: ADAInvestigationStatus; violations: ADAViolation[] }[] = useMemo(() => {
    const statusOrder: ADAInvestigationStatus[] = [
      'detected', 'under_investigation', 'confirmed', 'reported_to_president', 'resolved',
    ];
    return statusOrder.map((status: ADAInvestigationStatus) => ({
      status,
      violations: violations.filter((v: ADAViolation) => v.investigationStatus === status),
    }));
  }, [violations]);

  // ---------------------------------------------------------------------------
  // Form Handlers
  // ---------------------------------------------------------------------------

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev: typeof formData) => ({ ...prev, [field]: value }));
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.violationType || !formData.statutoryBasis || !formData.amount || !formData.description) {
      setSubmitError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const payload = {
        engagementId,
        violationType: formData.violationType,
        statutoryBasis: formData.statutoryBasis,
        amount: parseFloat(formData.amount),
        description: formData.description,
        responsibleOfficer: formData.responsibleOfficer || undefined,
        appropriationId: formData.appropriationId || undefined,
        fiscalYear: parseInt(formData.fiscalYear, 10),
        discoveredDate: new Date().toISOString(),
        investigationStatus: 'detected' as ADAInvestigationStatus,
      };

      const res = await fetch('/api/dod/ada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to submit violation report.');
      }

      const data = await res.json();
      setViolations((prev: ADAViolation[]) => [data.violation || data, ...prev]);
      setSubmitSuccess(true);
      setFormData({
        violationType: '',
        statutoryBasis: '',
        amount: '',
        description: '',
        responsibleOfficer: '',
        appropriationId: '',
        fiscalYear: new Date().getFullYear().toString(),
      });
    } catch (error: any) {
      setSubmitError(error.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          Loading ADA violation data...
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {activeViolations.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              Anti-Deficiency Act Alert: {activeViolations.length} Active Violation{activeViolations.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-red-700">
              {formatCurrency(totalAmountAtRisk)} at risk.{' '}
              {violations.filter((v: ADAViolation) => v.investigationStatus === 'confirmed').length > 0 &&
                `${violations.filter((v: ADAViolation) => v.investigationStatus === 'confirmed').length} confirmed violation(s) require reporting per 31 U.S.C. 1351.`}
            </p>
          </div>
          <Badge className="bg-red-600 text-white border-red-600">
            {activeViolations.length} Active
          </Badge>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ADA Violation Monitoring</h1>
          <p className="text-sm text-gray-500">
            Anti-Deficiency Act (31 U.S.C. 1341-1342, 1351, 1517) Real-Time Monitoring
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <FileWarning className="h-3.5 w-3.5" />
              Total Violations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{violations.length}</p>
            <p className="mt-1 text-xs text-gray-500">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              Active Violations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${activeViolations.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {activeViolations.length}
            </p>
            <p className="mt-1 text-xs text-gray-500">Non-resolved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-amber-500" />
              Amount at Risk
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{formatCurrencyCompact(totalAmountAtRisk)}</p>
            <p className="mt-1 text-xs text-gray-500">Active violations only</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-purple-500" />
              Reported to President
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">{reportedToPresidentCount}</p>
            <p className="mt-1 text-xs text-gray-500">Per 31 U.S.C. 1351</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              Avg Resolution Time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{avgResolutionDays}</p>
            <p className="mt-1 text-xs text-gray-500">Days</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="dashboard">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="violations">Violations</TabsTrigger>
          <TabsTrigger value="workflow">Investigation Workflow</TabsTrigger>
          <TabsTrigger value="report">Report Violation</TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* Dashboard Tab */}
        {/* ================================================================= */}
        <TabsContent value="dashboard">
          <div className="space-y-6">
            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Violations by Type - Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Violations by Type</CardTitle>
                  <CardDescription>Distribution of ADA violation categories</CardDescription>
                </CardHeader>
                <CardContent>
                  {violationsByType.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={violationsByType}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          innerRadius={45}
                          paddingAngle={2}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {violationsByType.map((entry, i) => (
                            <Cell key={`type-cell-${i}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-gray-400">
                      <div className="text-center">
                        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-400" />
                        <p>No violations detected</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Violations by Status - Horizontal Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Violations by Status</CardTitle>
                  <CardDescription>Investigation pipeline overview</CardDescription>
                </CardHeader>
                <CardContent>
                  {violations.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={violationsByStatus} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={130} fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {violationsByStatus.map((entry, i) => (
                            <Cell key={`status-cell-${i}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-gray-400">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Monthly Trend - Line Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Monthly Violation Trend</CardTitle>
                  <CardDescription>Violations detected over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {monthlyTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="violations"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={{ fill: '#ef4444', r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-gray-400">
                      No trend data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Appropriations with ADA Risk */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Top Appropriations at ADA Risk</CardTitle>
                  <CardDescription>Appropriations nearing obligation limits</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {MOCK_APPROPRIATION_RISKS.map((appn, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{appn.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{appn.utilization}%</span>
                            <Badge
                              variant={
                                appn.riskLevel === 'critical' ? 'destructive' :
                                appn.riskLevel === 'high' ? 'warning' :
                                appn.riskLevel === 'medium' ? 'medium' : 'low'
                              }
                            >
                              {appn.riskLevel}
                            </Badge>
                          </div>
                        </div>
                        <Progress
                          value={appn.utilization}
                          color={
                            appn.riskLevel === 'critical' ? '#ef4444' :
                            appn.riskLevel === 'high' ? '#f97316' :
                            appn.riskLevel === 'medium' ? '#eab308' : '#22c55e'
                          }
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Violations Tab */}
        {/* ================================================================= */}
        <TabsContent value="violations">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">ADA Violations Register</CardTitle>
                  <CardDescription>
                    {filteredViolations.length} violation{filteredViolations.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <Select
                    options={FILTER_TYPE_OPTIONS}
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="w-44"
                  />
                  <Select
                    options={FILTER_STATUS_OPTIONS}
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-44"
                  />
                  <Select
                    options={fiscalYearOptions}
                    value={filterFiscalYear}
                    onChange={e => setFilterFiscalYear(e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredViolations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Discovered</TableHead>
                      <TableHead>Responsible Officer</TableHead>
                      <TableHead>Statutory Basis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredViolations.map(violation => (
                      <React.Fragment key={violation.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() =>
                            setExpandedRow(expandedRow === violation.id ? null : violation.id)
                          }
                        >
                          <TableCell className="w-8 px-2">
                            {expandedRow === violation.id ? (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-gray-600">
                            {truncateId(violation.id)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="text-xs"
                            >
                              {VIOLATION_TYPE_LABELS[violation.violationType]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                STATUS_BADGE_CLASSES[violation.investigationStatus]
                              }`}
                            >
                              {STATUS_LABELS[violation.investigationStatus]}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(violation.amount)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {formatDate(violation.discoveredDate)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {violation.responsibleOfficer || '---'}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-gray-600">
                            {violation.statutoryBasis}
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row Details */}
                        {expandedRow === violation.id && (
                          <TableRow className="bg-gray-50 hover:bg-gray-50">
                            <TableCell colSpan={8} className="p-0">
                              <div className="border-l-4 border-gray-300 px-6 py-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                  <div>
                                    <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
                                      Description
                                    </h4>
                                    <p className="text-sm text-gray-700">
                                      {violation.description}
                                    </p>
                                  </div>
                                  {violation.violationDetails && (
                                    <div>
                                      <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
                                        Violation Details
                                      </h4>
                                      <p className="text-sm text-gray-700">
                                        {violation.violationDetails}
                                      </p>
                                    </div>
                                  )}
                                  {violation.correctiveAction && (
                                    <div>
                                      <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
                                        Corrective Action
                                      </h4>
                                      <p className="text-sm text-gray-700">
                                        {violation.correctiveAction}
                                      </p>
                                    </div>
                                  )}
                                  <div>
                                    <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
                                      Additional Information
                                    </h4>
                                    <div className="space-y-1 text-sm text-gray-600">
                                      <p>
                                        <span className="font-medium">Fiscal Year:</span> FY {violation.fiscalYear}
                                      </p>
                                      {violation.appropriationId && (
                                        <p>
                                          <span className="font-medium">Appropriation ID:</span>{' '}
                                          <span className="font-mono text-xs">{violation.appropriationId}</span>
                                        </p>
                                      )}
                                      {violation.reportedDate && (
                                        <p>
                                          <span className="font-medium">Reported Date:</span>{' '}
                                          {formatDate(violation.reportedDate)}
                                        </p>
                                      )}
                                      <p>
                                        <span className="font-medium">Created:</span>{' '}
                                        {formatDate(violation.createdAt)}
                                      </p>
                                      <p>
                                        <span className="font-medium">Days Since Detection:</span>{' '}
                                        {daysSince(violation.discoveredDate)} days
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex h-48 items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Search className="mx-auto mb-2 h-8 w-8" />
                    <p>No violations match the current filters</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Investigation Workflow Tab */}
        {/* ================================================================= */}
        <TabsContent value="workflow">
          <div className="space-y-4">
            {/* 31 U.S.C. 1351 Compliance Banner */}
            {violations.filter((v: ADAViolation) => v.investigationStatus === 'confirmed').length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
                <Scale className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-600" />
                <div>
                  <p className="text-sm font-semibold text-purple-800">
                    31 U.S.C. 1351 Reporting Requirement
                  </p>
                  <p className="text-xs text-purple-700">
                    {violations.filter((v: ADAViolation) => v.investigationStatus === 'confirmed').length} confirmed
                    violation(s) must be reported to the President through the Director of OMB and to
                    Congress. Reporting must include the responsible officers, relevant facts, and
                    corrective actions taken.
                  </p>
                </div>
              </div>
            )}

            {/* Kanban Board */}
            <div className="flex gap-4 overflow-x-auto pb-4">
              {kanbanColumns.map((column, colIndex) => (
                <React.Fragment key={column.status}>
                  <div className="flex min-w-[240px] flex-1 flex-col">
                    {/* Column Header */}
                    <div
                      className="mb-3 rounded-t-lg border-b-2 px-3 py-2"
                      style={{ borderBottomColor: STATUS_COLORS[column.status] }}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">
                          {STATUS_LABELS[column.status]}
                        </h3>
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: STATUS_COLORS[column.status] }}
                        >
                          {column.violations.length}
                        </span>
                      </div>
                    </div>

                    {/* Column Cards */}
                    <div className="flex-1 space-y-2">
                      {column.violations.length > 0 ? (
                        column.violations.map(v => (
                          <div
                            key={v.id}
                            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                          >
                            <div className="mb-2 flex items-start justify-between">
                              <Badge
                                variant="secondary"
                                className="text-xs"
                              >
                                {VIOLATION_TYPE_LABELS[v.violationType]}
                              </Badge>
                              <span className="text-xs font-mono text-gray-400">
                                {truncateId(v.id)}
                              </span>
                            </div>
                            <p className="mb-2 text-lg font-bold text-gray-900">
                              {formatCurrency(v.amount)}
                            </p>
                            <p className="mb-2 line-clamp-2 text-xs text-gray-500">
                              {v.description}
                            </p>
                            <div className="flex items-center justify-between text-xs text-gray-400">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {daysSince(v.discoveredDate)}d
                              </div>
                              {v.responsibleOfficer && (
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {v.responsibleOfficer}
                                </div>
                              )}
                            </div>

                            {/* 1351 Compliance indicator for confirmed violations */}
                            {v.investigationStatus === 'confirmed' && (
                              <div className="mt-2 flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-2 py-1">
                                <Scale className="h-3 w-3 text-purple-600" />
                                <span className="text-xs font-medium text-purple-700">
                                  1351 Reporting Required
                                </span>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                          No violations
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Arrow between columns */}
                  {colIndex < kanbanColumns.length - 1 && (
                    <div className="flex items-center px-1 pt-12">
                      <ArrowRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Workflow Legend */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Investigation Workflow Stages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {kanbanColumns.map(col => (
                    <div
                      key={col.status}
                      className="rounded-lg border p-3"
                      style={{ borderLeftColor: STATUS_COLORS[col.status], borderLeftWidth: '4px' }}
                    >
                      <p className="text-xs font-semibold text-gray-700">
                        {STATUS_LABELS[col.status]}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {col.status === 'detected' && 'Potential violation identified by automated monitoring or manual review.'}
                        {col.status === 'under_investigation' && 'Formal investigation initiated to determine facts and responsible parties.'}
                        {col.status === 'confirmed' && 'Investigation confirms ADA violation occurred. 31 U.S.C. 1351 reporting initiated.'}
                        {col.status === 'reported_to_president' && 'Violation reported to the President via OMB and to Congress as required.'}
                        {col.status === 'resolved' && 'Corrective actions completed, funds restored or adjusted, and case closed.'}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Report Violation Tab */}
        {/* ================================================================= */}
        <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Plus className="h-4 w-4" />
                Report ADA Violation
              </CardTitle>
              <CardDescription>
                Manually report a suspected Anti-Deficiency Act violation for investigation.
                All required fields are marked with an asterisk (*).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitSuccess && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-medium text-green-800">
                    Violation reported successfully. It has been added to the Detected queue for investigation.
                  </p>
                </div>
              )}

              {submitError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm font-medium text-red-800">{submitError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Violation Type */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Violation Type <span className="text-red-500">*</span>
                    </label>
                    <Select
                      options={VIOLATION_TYPE_OPTIONS}
                      value={formData.violationType}
                      onChange={e => handleFormChange('violationType', e.target.value)}
                      required
                    />
                  </div>

                  {/* Statutory Basis */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Statutory Basis <span className="text-red-500">*</span>
                    </label>
                    <Select
                      options={STATUTORY_BASIS_OPTIONS}
                      value={formData.statutoryBasis}
                      onChange={e => handleFormChange('statutoryBasis', e.target.value)}
                      required
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Amount ($) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Enter violation amount"
                      value={formData.amount}
                      onChange={e => handleFormChange('amount', e.target.value)}
                      required
                    />
                  </div>

                  {/* Fiscal Year */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Fiscal Year <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min="2000"
                      max="2099"
                      placeholder="e.g. 2026"
                      value={formData.fiscalYear}
                      onChange={e => handleFormChange('fiscalYear', e.target.value)}
                      required
                    />
                  </div>

                  {/* Responsible Officer */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Responsible Officer
                    </label>
                    <Input
                      type="text"
                      placeholder="Name of responsible officer"
                      value={formData.responsibleOfficer}
                      onChange={e => handleFormChange('responsibleOfficer', e.target.value)}
                    />
                  </div>

                  {/* Appropriation ID */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Appropriation ID
                    </label>
                    <Input
                      type="text"
                      placeholder="Associated appropriation (optional)"
                      value={formData.appropriationId}
                      onChange={e => handleFormChange('appropriationId', e.target.value)}
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="flex min-h-[120px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Provide a detailed description of the suspected ADA violation, including relevant circumstances, amounts, and any supporting documentation references..."
                    value={formData.description}
                    onChange={e => handleFormChange('description', e.target.value)}
                    required
                  />
                </div>

                {/* Submit */}
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Violation Report
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-500">
                    Report will be submitted with status &quot;Detected&quot; for investigation.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
