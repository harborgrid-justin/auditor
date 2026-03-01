'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Wallet, DollarSign, TrendingUp, AlertTriangle, Clock, Plus,
  ArrowUpDown, ArrowUp, ArrowDown, Search, CheckCircle2, XCircle,
  CalendarClock, BarChart3, PieChart as PieChartIcon, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';

import type {
  Appropriation,
  AppropriationType,
  AppropriationStatus,
  BudgetCategory,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE_MAP: Record<AppropriationStatus, { variant: 'success' | 'warning' | 'destructive'; label: string }> = {
  current: { variant: 'success', label: 'Current' },
  expired: { variant: 'warning', label: 'Expired' },
  cancelled: { variant: 'destructive', label: 'Cancelled' },
};

const APPROPRIATION_TYPE_LABELS: Record<AppropriationType, string> = {
  one_year: 'One-Year',
  multi_year: 'Multi-Year',
  no_year: 'No-Year',
  revolving: 'Revolving',
  trust: 'Trust',
  special: 'Special',
  naf: 'NAF',
};

const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  milpers: 'MILPERS',
  om: 'O&M',
  procurement: 'Procurement',
  rdte: 'RDT&E',
  milcon: 'MILCON',
  family_housing: 'Family Housing',
  brac: 'BRAC',
  working_capital: 'Working Capital',
  naf: 'NAF',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  milpers: '#3b82f6',
  om: '#22c55e',
  procurement: '#f59e0b',
  rdte: '#8b5cf6',
  milcon: '#ec4899',
  family_housing: '#06b6d4',
  brac: '#f97316',
  working_capital: '#6366f1',
  naf: '#14b8a6',
  other: '#94a3b8',
};

const LIFECYCLE_COLORS = {
  current: '#22c55e',
  expired: '#f59e0b',
  cancelled: '#ef4444',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyFormatterCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatCurrencyCompact(value: number): string {
  return currencyFormatterCompact.format(value);
}

function computeExecutionRate(appn: Appropriation): number {
  if (appn.totalAuthority === 0) return 0;
  return (appn.obligated / appn.totalAuthority) * 100;
}

interface LifecycleItem extends Appropriation {
  fyStart: number;
  fyEnd: number;
  expYear: number;
  cancelYear: number;
  nearingExpiration: boolean;
  executionRate: number;
}

type SortField =
  | 'treasuryAccountSymbol'
  | 'appropriationTitle'
  | 'appropriationType'
  | 'budgetCategory'
  | 'fiscalYearStart'
  | 'status'
  | 'totalAuthority'
  | 'obligated'
  | 'unobligatedBalance'
  | 'executionRate';

type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// TAS Validation
// ---------------------------------------------------------------------------

const TAS_REGEX = /^\d{3}-\d{4}\/\d{4}-\d{4}-\d{3}$/;

function validateTAS(value: string): boolean {
  return TAS_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function AppropriationManagementPage() {
  const { id: engagementId } = useParams<{ id: string }>();

  // Data state
  const [appropriations, setAppropriations] = useState<Appropriation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort state
  const [sortField, setSortField] = useState<SortField>('treasuryAccountSymbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Create form state
  const [formData, setFormData] = useState({
    treasuryAccountSymbol: '',
    appropriationTitle: '',
    appropriationType: 'one_year' as AppropriationType,
    budgetCategory: 'om' as BudgetCategory,
    fiscalYearStart: '',
    fiscalYearEnd: '',
    expirationDate: '',
    cancellationDate: '',
    totalAuthority: '',
    apportioned: '',
    allotted: '',
    committed: '',
    obligated: '',
    disbursed: '',
    unobligatedBalance: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!engagementId) return;

    async function loadAppropriations() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/dod/appropriations?engagementId=${engagementId}`);
        if (!res.ok) throw new Error('Failed to load appropriations');
        const data = await res.json();
        setAppropriations(data.appropriations || []);
      } catch (err: any) {
        console.error('Failed to load appropriations:', err);
        setError(err.message || 'Failed to load appropriations');
      } finally {
        setLoading(false);
      }
    }

    loadAppropriations();
  }, [engagementId]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const filteredAppropriations = useMemo(() => {
    let result = [...appropriations];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((a) => a.budgetCategory === categoryFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.treasuryAccountSymbol.toLowerCase().includes(q) ||
          a.appropriationTitle.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'executionRate':
          aVal = computeExecutionRate(a);
          bVal = computeExecutionRate(b);
          break;
        case 'totalAuthority':
        case 'obligated':
        case 'unobligatedBalance':
          aVal = a[sortField];
          bVal = b[sortField];
          break;
        default:
          aVal = String(a[sortField] ?? '').toLowerCase();
          bVal = String(b[sortField] ?? '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [appropriations, statusFilter, categoryFilter, searchQuery, sortField, sortDirection]);

  const summaryStats = useMemo(() => {
    const totalAuthority = appropriations.reduce((s: number, a: Appropriation) => s + a.totalAuthority, 0);
    const totalObligated = appropriations.reduce((s: number, a: Appropriation) => s + a.obligated, 0);
    const totalUnobligated = appropriations.reduce((s: number, a: Appropriation) => s + a.unobligatedBalance, 0);
    const avgExecutionRate =
      appropriations.length > 0
        ? appropriations.reduce((s: number, a: Appropriation) => s + computeExecutionRate(a), 0) / appropriations.length
        : 0;

    return {
      count: appropriations.length,
      totalAuthority,
      totalObligated,
      totalUnobligated,
      avgExecutionRate,
    };
  }, [appropriations]);

  // ---------------------------------------------------------------------------
  // Sort handler
  // ---------------------------------------------------------------------------

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((d: SortDirection) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-gray-400" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3 text-gray-700" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3 text-gray-700" />
    );
  }

  // ---------------------------------------------------------------------------
  // Create form handlers
  // ---------------------------------------------------------------------------

  function handleFormChange(field: string, value: string) {
    setFormData((prev: typeof formData) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors((prev: Record<string, string>) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!formData.treasuryAccountSymbol.trim()) {
      errors.treasuryAccountSymbol = 'TAS is required';
    } else if (!validateTAS(formData.treasuryAccountSymbol.trim())) {
      errors.treasuryAccountSymbol = 'TAS must match format: XXX-XXXX/XXXX-XXXX-XXX';
    }

    if (!formData.appropriationTitle.trim()) {
      errors.appropriationTitle = 'Title is required';
    }

    if (!formData.fiscalYearStart.trim()) {
      errors.fiscalYearStart = 'Fiscal year start is required';
    }

    if (!formData.fiscalYearEnd.trim()) {
      errors.fiscalYearEnd = 'Fiscal year end is required';
    }

    if (!formData.totalAuthority.trim() || isNaN(Number(formData.totalAuthority))) {
      errors.totalAuthority = 'Valid total authority amount is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitSuccess(false);

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const payload = {
        engagementId,
        treasuryAccountSymbol: formData.treasuryAccountSymbol.trim(),
        appropriationTitle: formData.appropriationTitle.trim(),
        appropriationType: formData.appropriationType,
        budgetCategory: formData.budgetCategory,
        fiscalYearStart: formData.fiscalYearStart.trim(),
        fiscalYearEnd: formData.fiscalYearEnd.trim(),
        expirationDate: formData.expirationDate.trim() || undefined,
        cancellationDate: formData.cancellationDate.trim() || undefined,
        totalAuthority: Number(formData.totalAuthority),
        apportioned: Number(formData.apportioned) || 0,
        allotted: Number(formData.allotted) || 0,
        committed: Number(formData.committed) || 0,
        obligated: Number(formData.obligated) || 0,
        disbursed: Number(formData.disbursed) || 0,
        unobligatedBalance: Number(formData.unobligatedBalance) || 0,
      };

      const res = await fetch('/api/dod/appropriations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create appropriation');
      }

      const created = await res.json();
      setAppropriations((prev: Appropriation[]) => [...prev, created.appropriation || created]);
      setSubmitSuccess(true);
      setFormData({
        treasuryAccountSymbol: '',
        appropriationTitle: '',
        appropriationType: 'one_year',
        budgetCategory: 'om',
        fiscalYearStart: '',
        fiscalYearEnd: '',
        expirationDate: '',
        cancellationDate: '',
        totalAuthority: '',
        apportioned: '',
        allotted: '',
        committed: '',
        obligated: '',
        disbursed: '',
        unobligatedBalance: '',
      });
      setFormErrors({});
    } catch (err: any) {
      setFormErrors({ _form: err.message || 'Submission failed' });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Chart data
  // ---------------------------------------------------------------------------

  // Waterfall data for Fund Execution tab
  const waterfallData = useMemo(() => {
    const totalAuthority = appropriations.reduce((s: number, a: Appropriation) => s + a.totalAuthority, 0);
    const totalApportioned = appropriations.reduce((s: number, a: Appropriation) => s + a.apportioned, 0);
    const totalAllotted = appropriations.reduce((s: number, a: Appropriation) => s + a.allotted, 0);
    const totalCommitted = appropriations.reduce((s: number, a: Appropriation) => s + a.committed, 0);
    const totalObligated = appropriations.reduce((s: number, a: Appropriation) => s + a.obligated, 0);
    const totalDisbursed = appropriations.reduce((s: number, a: Appropriation) => s + a.disbursed, 0);
    const totalUnobligated = appropriations.reduce((s: number, a: Appropriation) => s + a.unobligatedBalance, 0);

    return [
      { name: 'Total Authority', value: totalAuthority, fill: '#3b82f6' },
      { name: 'Apportioned', value: totalApportioned, fill: '#6366f1' },
      { name: 'Allotted', value: totalAllotted, fill: '#8b5cf6' },
      { name: 'Committed', value: totalCommitted, fill: '#a855f7' },
      { name: 'Obligated', value: totalObligated, fill: '#22c55e' },
      { name: 'Disbursed', value: totalDisbursed, fill: '#14b8a6' },
      { name: 'Unobligated', value: totalUnobligated, fill: '#f59e0b' },
    ];
  }, [appropriations]);

  // Per-appropriation execution rate data
  const executionRateData = useMemo(() => {
    return appropriations
      .map((a: Appropriation) => ({
        name: a.appropriationTitle.length > 20
          ? a.appropriationTitle.substring(0, 20) + '...'
          : a.appropriationTitle,
        rate: Math.round(computeExecutionRate(a) * 10) / 10,
        tas: a.treasuryAccountSymbol,
      }))
      .sort((a: { rate: number }, b: { rate: number }) => b.rate - a.rate);
  }, [appropriations]);

  // Budget category breakdown for pie chart
  const categoryBreakdownData = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    appropriations.forEach((a: Appropriation) => {
      const cat = BUDGET_CATEGORY_LABELS[a.budgetCategory] || a.budgetCategory;
      categoryMap[cat] = (categoryMap[cat] || 0) + a.totalAuthority;
    });
    return Object.entries(categoryMap)
      .map(([name, value]) => ({
        name,
        value,
        color: CATEGORY_COLORS[
          Object.entries(BUDGET_CATEGORY_LABELS).find(([, label]) => label === name)?.[0] || 'other'
        ] || '#94a3b8',
      }))
      .sort((a, b) => b.value - a.value);
  }, [appropriations]);

  // Lifecycle timeline data
  const lifecycleData = useMemo(() => {
    return appropriations.map((a: Appropriation): LifecycleItem => {
      const fyStart = parseInt(a.fiscalYearStart) || 2020;
      const fyEnd = parseInt(a.fiscalYearEnd) || fyStart;
      const currentFY = new Date().getFullYear();

      // Calculate lifecycle phases
      const expYear = a.expirationDate ? new Date(a.expirationDate).getFullYear() : fyEnd;
      const cancelYear = a.cancellationDate
        ? new Date(a.cancellationDate).getFullYear()
        : expYear + 5;

      // Determine if nearing expiration (within 1 year)
      const nearingExpiration =
        a.status === 'current' && expYear - currentFY <= 1 && expYear >= currentFY;

      return {
        ...a,
        fyStart,
        fyEnd,
        expYear,
        cancelYear,
        nearingExpiration,
        executionRate: computeExecutionRate(a),
      };
    });
  }, [appropriations]);

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Loading Appropriation Management...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <XCircle className="h-8 w-8 text-red-400" />
        <p className="text-red-600">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Wallet className="h-8 w-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appropriation Management</h1>
          <p className="text-sm text-gray-500">
            DoD FMR (7000.14-R) - Fund lifecycle, execution tracking, and compliance
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              Total Appropriations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{summaryStats.count}</p>
            <p className="mt-1 text-xs text-gray-500">
              {appropriations.filter((a: Appropriation) => a.status === 'current').length} current,{' '}
              {appropriations.filter((a: Appropriation) => a.status === 'expired').length} expired
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Total Authority
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrencyCompact(summaryStats.totalAuthority)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {formatCurrency(summaryStats.totalAuthority)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              Total Obligated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-700">
              {formatCurrencyCompact(summaryStats.totalObligated)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {formatCurrency(summaryStats.totalObligated)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Unobligated Balance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">
              {formatCurrencyCompact(summaryStats.totalUnobligated)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {formatCurrency(summaryStats.totalUnobligated)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              Avg Execution Rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-700">
              {summaryStats.avgExecutionRate.toFixed(1)}%
            </p>
            <Progress
              value={summaryStats.avgExecutionRate}
              color={
                summaryStats.avgExecutionRate >= 80
                  ? '#22c55e'
                  : summaryStats.avgExecutionRate >= 50
                    ? '#f59e0b'
                    : '#ef4444'
              }
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="execution">Fund Execution</TabsTrigger>
          <TabsTrigger value="create">Create New</TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* OVERVIEW TAB                                                     */}
        {/* ================================================================ */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                All Appropriations
              </CardTitle>
              <CardDescription>
                Comprehensive listing of all appropriations for this engagement
              </CardDescription>

              {/* Filters */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search TAS or title..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select
                  value={statusFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'current', label: 'Current' },
                    { value: 'expired', label: 'Expired' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                  className="w-40"
                />

                <Select
                  value={categoryFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Categories' },
                    ...Object.entries(BUDGET_CATEGORY_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ]}
                  className="w-48"
                />

                <span className="ml-auto text-sm text-gray-500">
                  {filteredAppropriations.length} of {appropriations.length} appropriations
                </span>
              </div>
            </CardHeader>

            <CardContent>
              {filteredAppropriations.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  {appropriations.length === 0
                    ? 'No appropriations found. Create one using the "Create New" tab.'
                    : 'No appropriations match the current filters.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => handleSort('treasuryAccountSymbol')}
                        >
                          TAS <SortIcon field="treasuryAccountSymbol" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => handleSort('appropriationTitle')}
                        >
                          Title <SortIcon field="appropriationTitle" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => handleSort('appropriationType')}
                        >
                          Type <SortIcon field="appropriationType" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => handleSort('budgetCategory')}
                        >
                          Category <SortIcon field="budgetCategory" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => handleSort('fiscalYearStart')}
                        >
                          FY <SortIcon field="fiscalYearStart" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => handleSort('status')}
                        >
                          Status <SortIcon field="status" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap text-right"
                          onClick={() => handleSort('totalAuthority')}
                        >
                          Authority <SortIcon field="totalAuthority" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap text-right"
                          onClick={() => handleSort('obligated')}
                        >
                          Obligated <SortIcon field="obligated" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap text-right"
                          onClick={() => handleSort('unobligatedBalance')}
                        >
                          Unobligated <SortIcon field="unobligatedBalance" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap text-right"
                          onClick={() => handleSort('executionRate')}
                        >
                          Execution <SortIcon field="executionRate" />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAppropriations.map((appn: Appropriation) => {
                        const execRate = computeExecutionRate(appn);
                        const statusInfo = STATUS_BADGE_MAP[appn.status];
                        return (
                          <TableRow key={appn.id}>
                            <TableCell className="whitespace-nowrap font-mono text-xs">
                              {appn.treasuryAccountSymbol}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={appn.appropriationTitle}>
                              {appn.appropriationTitle}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {APPROPRIATION_TYPE_LABELS[appn.appropriationType]}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {BUDGET_CATEGORY_LABELS[appn.budgetCategory]}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {appn.fiscalYearStart}
                              {appn.fiscalYearEnd && appn.fiscalYearEnd !== appn.fiscalYearStart
                                ? `/${appn.fiscalYearEnd}`
                                : ''}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium">
                              {formatCurrency(appn.totalAuthority)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              {formatCurrency(appn.obligated)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              {formatCurrency(appn.unobligatedBalance)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Progress
                                  value={execRate}
                                  color={
                                    execRate >= 80
                                      ? '#22c55e'
                                      : execRate >= 50
                                        ? '#f59e0b'
                                        : '#ef4444'
                                  }
                                  className="w-16"
                                />
                                <span className="w-12 text-right text-xs font-medium">
                                  {execRate.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* LIFECYCLE TAB                                                    */}
        {/* ================================================================ */}
        <TabsContent value="lifecycle">
          <div className="space-y-6">
            {/* Expiration Warnings */}
            {lifecycleData.some((a: LifecycleItem) => a.nearingExpiration) && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-800">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    Expiration Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {lifecycleData
                      .filter((a: LifecycleItem) => a.nearingExpiration)
                      .map((a: LifecycleItem) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm"
                        >
                          <div>
                            <span className="font-mono text-xs text-gray-500">
                              {a.treasuryAccountSymbol}
                            </span>
                            <span className="ml-2 font-medium text-gray-900">
                              {a.appropriationTitle}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-amber-500" />
                            <span className="text-amber-700">
                              Expires: {a.expirationDate || `FY${a.fyEnd}`}
                            </span>
                            <Badge variant="warning">Nearing Expiration</Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lifecycle Timeline (Gantt-style) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarClock className="h-5 w-5 text-blue-600" />
                  Appropriation Lifecycle Timeline
                </CardTitle>
                <CardDescription>
                  Gantt-style view showing fiscal year ranges and lifecycle phases (Current, Expired, Cancelled)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {appropriations.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    No appropriations to display
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Legend */}
                    <div className="mb-4 flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <div
                          className="h-3 w-3 rounded"
                          style={{ backgroundColor: LIFECYCLE_COLORS.current }}
                        />
                        <span className="text-gray-600">Current</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className="h-3 w-3 rounded"
                          style={{ backgroundColor: LIFECYCLE_COLORS.expired }}
                        />
                        <span className="text-gray-600">Expired</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className="h-3 w-3 rounded"
                          style={{ backgroundColor: LIFECYCLE_COLORS.cancelled }}
                        />
                        <span className="text-gray-600">Cancelled</span>
                      </div>
                    </div>

                    {/* Timeline rows */}
                    {(() => {
                      // Calculate global min/max years for the timeline
                      const allYears = lifecycleData.flatMap((a: LifecycleItem) => [
                        a.fyStart,
                        a.cancelYear,
                      ]);
                      const minYear = Math.min(...allYears, new Date().getFullYear() - 2);
                      const maxYear = Math.max(...allYears, new Date().getFullYear() + 3);
                      const totalSpan = maxYear - minYear + 1;

                      // Year axis
                      const yearLabels = [];
                      for (let y = minYear; y <= maxYear; y++) {
                        yearLabels.push(y);
                      }

                      return (
                        <div>
                          {/* Year axis header */}
                          <div className="mb-2 flex">
                            <div className="w-56 shrink-0" />
                            <div className="flex flex-1">
                              {yearLabels.map((yr) => (
                                <div
                                  key={yr}
                                  className="text-center text-[10px] text-gray-400"
                                  style={{ width: `${100 / totalSpan}%` }}
                                >
                                  {yr}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Rows */}
                          {lifecycleData.map((a: LifecycleItem) => {
                            const currentWidth =
                              ((Math.min(a.expYear, maxYear) - a.fyStart) / totalSpan) * 100;
                            const expiredWidth =
                              ((Math.min(a.cancelYear, maxYear) - a.expYear) / totalSpan) * 100;
                            const leftOffset =
                              ((a.fyStart - minYear) / totalSpan) * 100;

                            return (
                              <div
                                key={a.id}
                                className="flex items-center border-b border-gray-100 py-1.5"
                              >
                                {/* Label */}
                                <div className="w-56 shrink-0 pr-3">
                                  <div
                                    className="truncate text-xs font-medium text-gray-900"
                                    title={a.appropriationTitle}
                                  >
                                    {a.appropriationTitle}
                                  </div>
                                  <div className="font-mono text-[10px] text-gray-400">
                                    {a.treasuryAccountSymbol}
                                  </div>
                                </div>

                                {/* Bar area */}
                                <div className="relative flex-1">
                                  <div className="flex h-6 items-center">
                                    <div
                                      className="absolute flex h-5"
                                      style={{ left: `${leftOffset}%` }}
                                    >
                                      {/* Current phase */}
                                      {currentWidth > 0 && (
                                        <div
                                          className="h-full rounded-l"
                                          style={{
                                            width: `${currentWidth}%`,
                                            minWidth: currentWidth > 0 ? '4px' : 0,
                                            backgroundColor: LIFECYCLE_COLORS.current,
                                          }}
                                          title={`Current: FY${a.fyStart} - FY${a.expYear}`}
                                        />
                                      )}
                                      {/* Expired phase */}
                                      {expiredWidth > 0 && a.status !== 'current' && (
                                        <div
                                          className="h-full"
                                          style={{
                                            width: `${expiredWidth}%`,
                                            minWidth: expiredWidth > 0 ? '4px' : 0,
                                            backgroundColor:
                                              a.status === 'cancelled'
                                                ? LIFECYCLE_COLORS.cancelled
                                                : LIFECYCLE_COLORS.expired,
                                          }}
                                          title={`${a.status === 'cancelled' ? 'Cancelled' : 'Expired'}: FY${a.expYear} - FY${a.cancelYear}`}
                                        />
                                      )}
                                      {expiredWidth > 0 && a.status === 'current' && (
                                        <div
                                          className="h-full rounded-r border border-dashed border-amber-300 bg-amber-50"
                                          style={{
                                            width: `${expiredWidth}%`,
                                            minWidth: expiredWidth > 0 ? '4px' : 0,
                                          }}
                                          title={`Future expired phase: FY${a.expYear} - FY${a.cancelYear}`}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Status badge */}
                                <div className="ml-2 w-24 shrink-0 text-right">
                                  <Badge variant={STATUS_BADGE_MAP[a.status].variant} className="text-[10px]">
                                    {STATUS_BADGE_MAP[a.status].label}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* FUND EXECUTION TAB                                               */}
        {/* ================================================================ */}
        <TabsContent value="execution">
          <div className="space-y-6">
            {/* Waterfall Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Fund Flow Waterfall
                </CardTitle>
                <CardDescription>
                  Progression from Total Authority through Disbursed with Unobligated Balance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {appropriations.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    No appropriation data to chart
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={11} angle={-15} textAnchor="end" height={60} />
                      <YAxis
                        fontSize={11}
                        tickFormatter={(val: number) => formatCurrencyCompact(val)}
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {waterfallData.map((entry: { name: string; value: number; fill: string }, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Per-Appropriation Execution Rate */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-green-600" />
                    Execution Rate by Appropriation
                  </CardTitle>
                  <CardDescription>
                    Obligation rate as percentage of total authority
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {executionRateData.length === 0 ? (
                    <div className="py-12 text-center text-gray-400">
                      No data available
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(250, executionRateData.length * 35)}>
                      <BarChart
                        data={executionRateData}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} fontSize={11} unit="%" />
                        <YAxis
                          type="category"
                          dataKey="name"
                          fontSize={10}
                          width={130}
                          tick={{ fill: '#6b7280' }}
                        />
                        <Tooltip
                          formatter={(value: number) => `${value.toFixed(1)}%`}
                          labelFormatter={(label: string) => {
                            const item = executionRateData.find((d: { name: string; rate: number; tas: string }) => d.name === label);
                            return item ? `${label} (${item.tas})` : label;
                          }}
                        />
                        <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                          {executionRateData.map((entry: { name: string; rate: number; tas: string }, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                entry.rate >= 80
                                  ? '#22c55e'
                                  : entry.rate >= 50
                                    ? '#f59e0b'
                                    : '#ef4444'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Budget Category Pie */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <PieChartIcon className="h-5 w-5 text-purple-600" />
                    Budget Category Breakdown
                  </CardTitle>
                  <CardDescription>
                    Total authority distribution across budget categories
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryBreakdownData.length === 0 ? (
                    <div className="py-12 text-center text-gray-400">
                      No data available
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <PieChart>
                        <Pie
                          data={categoryBreakdownData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          innerRadius={50}
                          paddingAngle={2}
                          label={({ name, percent }: { name: string; percent: number }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine
                        >
                          {categoryBreakdownData.map((entry: { name: string; value: number; color: string }, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* CREATE NEW TAB                                                   */}
        {/* ================================================================ */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5 text-blue-600" />
                Create New Appropriation
              </CardTitle>
              <CardDescription>
                Add a new appropriation record for DoD FMR tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitSuccess && (
                <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Appropriation created successfully.
                </div>
              )}

              {formErrors._form && (
                <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <XCircle className="h-4 w-4" />
                  {formErrors._form}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Identity Section */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">Identification</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Treasury Account Symbol (TAS) <span className="text-red-500">*</span>
                      </label>
                      <Input
                        placeholder="XXX-XXXX/XXXX-XXXX-XXX"
                        value={formData.treasuryAccountSymbol}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('treasuryAccountSymbol', e.target.value)}
                      />
                      {formErrors.treasuryAccountSymbol && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.treasuryAccountSymbol}</p>
                      )}
                      <p className="mt-1 text-[11px] text-gray-400">
                        Format: XXX-XXXX/XXXX-XXXX-XXX (e.g., 097-0100/0100-4930-001)
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Appropriation Title <span className="text-red-500">*</span>
                      </label>
                      <Input
                        placeholder="e.g., Operation and Maintenance, Army"
                        value={formData.appropriationTitle}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('appropriationTitle', e.target.value)}
                      />
                      {formErrors.appropriationTitle && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.appropriationTitle}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Appropriation Type
                      </label>
                      <Select
                        value={formData.appropriationType}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          handleFormChange('appropriationType', e.target.value)
                        }
                        options={Object.entries(APPROPRIATION_TYPE_LABELS).map(
                          ([value, label]) => ({ value, label })
                        )}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Budget Category
                      </label>
                      <Select
                        value={formData.budgetCategory}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          handleFormChange('budgetCategory', e.target.value)
                        }
                        options={Object.entries(BUDGET_CATEGORY_LABELS).map(
                          ([value, label]) => ({ value, label })
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Period Section */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">Period of Availability</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Fiscal Year Start <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g., 2025"
                        value={formData.fiscalYearStart}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('fiscalYearStart', e.target.value)}
                      />
                      {formErrors.fiscalYearStart && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.fiscalYearStart}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Fiscal Year End <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g., 2025"
                        value={formData.fiscalYearEnd}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('fiscalYearEnd', e.target.value)}
                      />
                      {formErrors.fiscalYearEnd && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.fiscalYearEnd}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Expiration Date
                      </label>
                      <Input
                        type="date"
                        value={formData.expirationDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('expirationDate', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Cancellation Date
                      </label>
                      <Input
                        type="date"
                        value={formData.cancellationDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('cancellationDate', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Financial Section */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">Financial Amounts ($)</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Total Authority <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.totalAuthority}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('totalAuthority', e.target.value)}
                      />
                      {formErrors.totalAuthority && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.totalAuthority}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Apportioned
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.apportioned}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('apportioned', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Allotted
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.allotted}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('allotted', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Committed
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.committed}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('committed', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Obligated
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.obligated}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('obligated', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Disbursed
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.disbursed}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('disbursed', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Unobligated Balance
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.unobligatedBalance}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => handleFormChange('unobligatedBalance', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create Appropriation'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFormData({
                        treasuryAccountSymbol: '',
                        appropriationTitle: '',
                        appropriationType: 'one_year',
                        budgetCategory: 'om',
                        fiscalYearStart: '',
                        fiscalYearEnd: '',
                        expirationDate: '',
                        cancellationDate: '',
                        totalAuthority: '',
                        apportioned: '',
                        allotted: '',
                        committed: '',
                        obligated: '',
                        disbursed: '',
                        unobligatedBalance: '',
                      });
                      setFormErrors({});
                      setSubmitSuccess(false);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
