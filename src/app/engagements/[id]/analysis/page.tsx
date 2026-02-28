'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  BarChart3, Loader2, XCircle, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle, RefreshCw,
} from 'lucide-react';

// Dynamically import recharts with SSR disabled
const BenfordChart = dynamic(
  () => import('recharts').then((mod) => {
    const {
      BarChart, Bar, XAxis, YAxis, Tooltip,
      ResponsiveContainer, CartesianGrid, Legend, Cell,
    } = mod;

    return function BenfordChartInner({ data }: { data: BenfordDigit[] }) {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="digit"
              label={{ value: 'Leading Digit', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Frequency (%)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={((value: any, name: any) => [
                `${Number(value).toFixed(2)}%`,
                name === 'expected' ? 'Expected (Benford)' : 'Observed',
              ]) as any}
            />
            <Legend />
            <Bar
              dataKey="expected"
              name="Expected (Benford)"
              fill="#94a3b8"
              radius={[2, 2, 0, 0]}
            />
            <Bar dataKey="observed" name="Observed" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.suspicious ? '#ef4444' : '#3b82f6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    };
  }),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 flex items-center justify-center text-gray-500">
        Loading chart...
      </div>
    ),
  }
);

interface Ratio {
  name: string;
  value: number;
  benchmark: number | null;
  category: string;
  status: string;
  description: string;
  formula?: string;
  unit?: string;
}

interface BenfordDigit {
  digit: number;
  expected: number;
  observed: number;
  difference: number;
  suspicious: boolean;
}

interface JournalTest {
  id?: string;
  testName: string;
  description: string;
  entriesTotal?: number;
  entriesFlagged?: number;
  totalAmount?: number;
  flaggedAmount?: number;
  status?: string;
  riskLevel?: string;
  flaggedEntries?: any[];
}

interface TrendItem {
  accountName: string;
  accountNumber: string;
  accountType?: string;
  priorPeriod?: number;
  currentPeriod?: number;
  beginningBalance?: number;
  endingBalance?: number;
  change?: number;
  changeAmount?: number;
  changePercent: number;
  significant?: boolean;
  significance?: string;
}

const RATIO_CATEGORIES = ['liquidity', 'profitability', 'leverage', 'efficiency', 'coverage'];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

function formatRatioValue(ratio: Ratio): string {
  if (ratio.unit === '%') return `${(ratio.value * 100).toFixed(1)}%`;
  if (ratio.unit === 'days') return `${ratio.value.toFixed(0)} days`;
  return `${ratio.value.toFixed(2)}x`;
}

function formatBenchmark(ratio: Ratio): string {
  if (ratio.benchmark == null) return '--';
  if (ratio.unit === '%') return `${(ratio.benchmark * 100).toFixed(0)}%`;
  if (ratio.unit === 'days') return `${ratio.benchmark} days`;
  return `${ratio.benchmark}x`;
}

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export default function AnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const engagementId = params.id as string;

  // Ratio Analysis state
  const [ratios, setRatios] = useState<Ratio[]>([]);
  const [loadingRatios, setLoadingRatios] = useState(false);
  const [ratiosLoaded, setRatiosLoaded] = useState(false);

  // Benford's Law state
  const [benfordData, setBenfordData] = useState<any>(null);
  const [loadingBenford, setLoadingBenford] = useState(false);
  const [benfordLoaded, setBenfordLoaded] = useState(false);

  // Journal Entry Testing state
  const [journalTests, setJournalTests] = useState<JournalTest[]>([]);
  const [loadingJournalTests, setLoadingJournalTests] = useState(false);
  const [journalTestsLoaded, setJournalTestsLoaded] = useState(false);

  // Trend Analysis state
  const [trends, setTrends] = useState<any>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendsLoaded, setTrendsLoaded] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const loadRatios = useCallback(async (force = false) => {
    if (ratiosLoaded && !force) return;
    setLoadingRatios(true);
    try {
      const res = await fetch(`/api/analyze/ratios?engagementId=${engagementId}`);
      if (res.ok) {
        const data = await res.json();
        setRatios(data.ratios || []);
      }
    } catch {
      setError('Failed to load ratio analysis.');
    } finally {
      setLoadingRatios(false);
      setRatiosLoaded(true);
    }
  }, [engagementId, ratiosLoaded]);

  const loadBenford = useCallback(async (force = false) => {
    if (benfordLoaded && !force) return;
    setLoadingBenford(true);
    try {
      const res = await fetch(`/api/analyze/benford?engagementId=${engagementId}`);
      if (res.ok) {
        const data = await res.json();
        setBenfordData(data);
      }
    } catch {
      setError("Failed to load Benford's Law analysis.");
    } finally {
      setLoadingBenford(false);
      setBenfordLoaded(true);
    }
  }, [engagementId, benfordLoaded]);

  const loadJournalTests = useCallback(async (force = false) => {
    if (journalTestsLoaded && !force) return;
    setLoadingJournalTests(true);
    try {
      const res = await fetch(`/api/analyze/journal-tests?engagementId=${engagementId}`);
      if (res.ok) {
        const data = await res.json();
        setJournalTests(data.results || data.tests || []);
      }
    } catch {
      setError('Failed to load journal entry tests.');
    } finally {
      setLoadingJournalTests(false);
      setJournalTestsLoaded(true);
    }
  }, [engagementId, journalTestsLoaded]);

  const loadTrends = useCallback(async (force = false) => {
    if (trendsLoaded && !force) return;
    setLoadingTrends(true);
    try {
      const res = await fetch(`/api/analyze/trends?engagementId=${engagementId}`);
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch {
      setError('Failed to load trend analysis.');
    } finally {
      setLoadingTrends(false);
      setTrendsLoaded(true);
    }
  }, [engagementId, trendsLoaded]);

  // Load all on mount
  useEffect(() => {
    if (status === 'authenticated' && engagementId) {
      loadRatios();
      loadBenford();
      loadJournalTests();
      loadTrends();
    }
  }, [status, engagementId]);

  async function refreshAll() {
    setRefreshing(true);
    setError(null);
    setRatiosLoaded(false);
    setBenfordLoaded(false);
    setJournalTestsLoaded(false);
    setTrendsLoaded(false);
    try {
      await Promise.all([
        loadRatios(true),
        loadBenford(true),
        loadJournalTests(true),
        loadTrends(true),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  // Group ratios by category
  const ratiosByCategory: Record<string, Ratio[]> = {};
  ratios.forEach((r) => {
    if (!ratiosByCategory[r.category]) ratiosByCategory[r.category] = [];
    ratiosByCategory[r.category].push(r);
  });

  // Benford data extraction
  const benfordDigits: BenfordDigit[] = benfordData?.firstDigit?.results || benfordData?.digits || [];
  const benfordConforms = benfordData?.firstDigit?.conclusion
    ? benfordData.firstDigit.conclusion === 'pass'
    : benfordData?.conforms ?? null;

  // Trend data extraction
  const trendResults: TrendItem[] = trends?.results || trends?.trends || [];

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <AppShell
      engagementId={engagementId}
      title="Analysis"
      subtitle="Financial analysis, anomaly detection, and testing"
      userName={session?.user?.name || ''}
    >
      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <XCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
          <button className="ml-auto text-sm font-medium hover:underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end mb-4">
        <Button variant="outline" onClick={refreshAll} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>

      <Tabs defaultValue="ratios">
        <TabsList className="mb-6">
          <TabsTrigger value="ratios">Ratio Analysis</TabsTrigger>
          <TabsTrigger value="benford">{"Benford's Law"}</TabsTrigger>
          <TabsTrigger value="journal">Journal Entry Testing</TabsTrigger>
          <TabsTrigger value="trends">Trend Analysis</TabsTrigger>
        </TabsList>

        {/* ============== Tab 1: Ratio Analysis ============== */}
        <TabsContent value="ratios">
          {loadingRatios ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
                <span className="text-gray-500">Loading ratio analysis...</span>
              </CardContent>
            </Card>
          ) : ratios.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">No ratio data available</p>
                <p className="text-sm text-gray-500 mt-1">
                  Upload financial statements to compute financial ratios.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {RATIO_CATEGORIES.filter((cat) => ratiosByCategory[cat]?.length > 0).map((cat) => (
                <div key={cat}>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                    {categoryLabel(cat)} Ratios
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {ratiosByCategory[cat].map((ratio) => (
                      <Card key={ratio.name}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm font-medium text-gray-700">{ratio.name}</p>
                            <Badge
                              variant={
                                ratio.status === 'critical' || ratio.status === 'poor'
                                  ? 'critical'
                                  : ratio.status === 'warning'
                                  ? 'warning'
                                  : 'success'
                              }
                            >
                              {ratio.status}
                            </Badge>
                          </div>
                          <div className="text-3xl font-bold text-gray-900 mb-1">
                            {formatRatioValue(ratio)}
                          </div>
                          {ratio.benchmark != null && (
                            <p className="text-xs text-gray-500">
                              Benchmark: {formatBenchmark(ratio)}
                            </p>
                          )}
                          {ratio.formula && (
                            <p className="text-xs text-gray-400 mt-1 font-mono">{ratio.formula}</p>
                          )}
                          {ratio.description && (
                            <p className="text-xs text-gray-400 mt-2">{ratio.description}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============== Tab 2: Benford's Law ============== */}
        <TabsContent value="benford">
          {loadingBenford ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
                <span className="text-gray-500">Loading Benford&apos;s Law analysis...</span>
              </CardContent>
            </Card>
          ) : benfordDigits.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">No Benford&apos;s Law data available</p>
                <p className="text-sm text-gray-500 mt-1">
                  Upload journal entries or financial data with at least 50 monetary values to run digit analysis.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Conformity Banner */}
              {benfordConforms !== null && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      {benfordConforms ? (
                        <>
                          <CheckCircle className="h-6 w-6 text-green-600" />
                          <div>
                            <p className="font-semibold text-green-800">
                              Data conforms to Benford&apos;s Law
                            </p>
                            <p className="text-sm text-gray-500">
                              The first-digit distribution is consistent with expected patterns.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-6 w-6 text-red-600" />
                          <div>
                            <p className="font-semibold text-red-800">
                              Data does not conform to Benford&apos;s Law
                            </p>
                            <p className="text-sm text-gray-500">
                              Significant deviations detected. This may indicate data manipulation or anomalies requiring investigation.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Statistics */}
              {benfordData?.firstDigit && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-xs text-gray-500 mb-1">Chi-Square Statistic</p>
                      <p className="text-xl font-bold font-mono">
                        {benfordData.firstDigit.chiSquare?.toFixed(2) ?? '--'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-xs text-gray-500 mb-1">P-Value</p>
                      <p className="text-xl font-bold font-mono">
                        {benfordData.firstDigit.pValue?.toFixed(4) ?? '--'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-xs text-gray-500 mb-1">Values Tested</p>
                      <p className="text-xl font-bold font-mono">
                        {benfordData.firstDigit.totalNumbers?.toLocaleString() ?? '--'}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">First-Digit Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <BenfordChart data={benfordDigits} />
                  {benfordData?.firstDigit?.description && (
                    <p className="mt-4 text-sm text-gray-600">{benfordData.firstDigit.description}</p>
                  )}
                </CardContent>
              </Card>

              {/* Data Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Digit Analysis Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Digit</TableHead>
                        <TableHead>Expected (%)</TableHead>
                        <TableHead>Observed (%)</TableHead>
                        <TableHead>Difference</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {benfordDigits.map((d) => (
                        <TableRow key={d.digit}>
                          <TableCell className="font-bold text-lg">{d.digit}</TableCell>
                          <TableCell>{(typeof d.expected === 'number' ? d.expected : 0).toFixed(2)}%</TableCell>
                          <TableCell>{(typeof d.observed === 'number' ? d.observed : 0).toFixed(2)}%</TableCell>
                          <TableCell>
                            <span className={d.suspicious ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                              {d.difference > 0 ? '+' : ''}
                              {(typeof d.difference === 'number' ? d.difference : 0).toFixed(2)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            {d.suspicious ? (
                              <Badge variant="critical">Suspicious</Badge>
                            ) : (
                              <Badge variant="success">Normal</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ============== Tab 3: Journal Entry Testing ============== */}
        <TabsContent value="journal">
          {loadingJournalTests ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
                <span className="text-gray-500">Loading journal entry tests...</span>
              </CardContent>
            </Card>
          ) : journalTests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">No journal entry test results</p>
                <p className="text-sm text-gray-500 mt-1">
                  Upload journal entries to run automated testing.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {journalTests.map((test, idx) => (
                <Card key={test.id || idx}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{test.testName}</CardTitle>
                      <div className="flex items-center gap-2">
                        {test.status && (
                          <Badge
                            variant={
                              test.status === 'fail'
                                ? 'critical'
                                : test.status === 'warning'
                                ? 'warning'
                                : 'success'
                            }
                          >
                            {test.status === 'fail' ? 'Fail' : test.status === 'warning' ? 'Warning' : 'Pass'}
                          </Badge>
                        )}
                        {test.riskLevel && (
                          <Badge
                            variant={
                              test.riskLevel === 'high'
                                ? 'critical'
                                : test.riskLevel === 'medium'
                                ? 'warning'
                                : 'success'
                            }
                          >
                            {test.riskLevel} risk
                          </Badge>
                        )}
                        {(test.entriesFlagged != null && test.entriesFlagged > 0) && (
                          <span className="text-sm text-gray-500">
                            {test.entriesFlagged} flagged
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">{test.description}</p>
                  </CardHeader>
                  <CardContent>
                    {/* Summary stats if available */}
                    {(test.entriesTotal != null || test.totalAmount != null) && (
                      <div className="grid gap-4 md:grid-cols-4 mb-4">
                        {test.entriesTotal != null && (
                          <div className="text-sm">
                            <span className="text-gray-500">Total Entries:</span>{' '}
                            <span className="font-semibold">{test.entriesTotal.toLocaleString()}</span>
                          </div>
                        )}
                        {test.entriesFlagged != null && (
                          <div className="text-sm">
                            <span className="text-gray-500">Flagged:</span>{' '}
                            <span className={`font-semibold ${test.entriesFlagged > 0 ? 'text-red-600' : ''}`}>
                              {test.entriesFlagged.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {test.totalAmount != null && (
                          <div className="text-sm">
                            <span className="text-gray-500">Total Amount:</span>{' '}
                            <span className="font-semibold">{formatCurrency(test.totalAmount)}</span>
                          </div>
                        )}
                        {test.flaggedAmount != null && test.flaggedAmount > 0 && (
                          <div className="text-sm">
                            <span className="text-gray-500">Flagged Amount:</span>{' '}
                            <span className="font-semibold text-red-600">{formatCurrency(test.flaggedAmount)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Flagged entries table if available */}
                    {test.flaggedEntries && test.flaggedEntries.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Entry #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Posted By</TableHead>
                            <TableHead>Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {test.flaggedEntries.map((entry: any, j: number) => (
                            <TableRow key={j}>
                              <TableCell className="font-mono text-sm">{entry.entryNumber}</TableCell>
                              <TableCell className="text-sm">{entry.date}</TableCell>
                              <TableCell className="text-sm max-w-48 truncate">{entry.description}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {entry.amount != null ? formatCurrency(entry.amount) : '--'}
                              </TableCell>
                              <TableCell className="text-sm">{entry.postedBy}</TableCell>
                              <TableCell className="text-sm text-gray-500">{entry.reason}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============== Tab 4: Trend Analysis ============== */}
        <TabsContent value="trends">
          {loadingTrends ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
                <span className="text-gray-500">Loading trend analysis...</span>
              </CardContent>
            </Card>
          ) : trendResults.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">No trend data available</p>
                <p className="text-sm text-gray-500 mt-1">
                  Upload multi-period financial data to analyze account trends.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Changes</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Account #</TableHead>
                      {trendResults[0]?.accountType !== undefined && <TableHead>Type</TableHead>}
                      <TableHead className="text-right">Prior / Beginning</TableHead>
                      <TableHead className="text-right">Current / Ending</TableHead>
                      <TableHead className="text-right">Change ($)</TableHead>
                      <TableHead className="text-right">Change (%)</TableHead>
                      <TableHead>Significance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trendResults.slice(0, 50).map((t, idx) => {
                      const prior = t.priorPeriod ?? t.beginningBalance ?? 0;
                      const current = t.currentPeriod ?? t.endingBalance ?? 0;
                      const changeAmt = t.changeAmount ?? t.change ?? (current - prior);
                      const isSignificant = t.significant ?? (t.significance === 'material' || t.significance === 'significant');
                      const changePct = t.changePercent;

                      return (
                        <TableRow key={idx} className={isSignificant ? 'bg-yellow-50' : ''}>
                          <TableCell className="font-medium">{t.accountName}</TableCell>
                          <TableCell className="font-mono text-sm text-gray-500">
                            {t.accountNumber}
                          </TableCell>
                          {trendResults[0]?.accountType !== undefined && (
                            <TableCell>
                              <Badge variant="outline">{t.accountType}</Badge>
                            </TableCell>
                          )}
                          <TableCell className="text-right text-sm font-mono">
                            {formatCurrency(prior)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {formatCurrency(current)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {changeAmt > 0 ? (
                                <TrendingUp className="h-3 w-3 text-green-600" />
                              ) : changeAmt < 0 ? (
                                <TrendingDown className="h-3 w-3 text-red-600" />
                              ) : (
                                <Minus className="h-3 w-3 text-gray-400" />
                              )}
                              <span
                                className={`text-sm font-mono font-medium ${
                                  changeAmt > 0
                                    ? 'text-green-600'
                                    : changeAmt < 0
                                    ? 'text-red-600'
                                    : 'text-gray-500'
                                }`}
                              >
                                {formatCurrency(changeAmt)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`text-sm font-mono font-medium ${
                                Math.abs(changePct) > 0.2
                                  ? 'text-red-600'
                                  : Math.abs(changePct) > 0.1
                                  ? 'text-yellow-600'
                                  : 'text-gray-600'
                              }`}
                            >
                              {changePct > 0 ? '+' : ''}
                              {formatPercent(changePct)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {t.significance ? (
                              <Badge
                                variant={
                                  t.significance === 'material'
                                    ? 'critical'
                                    : t.significance === 'significant'
                                    ? 'warning'
                                    : 'secondary'
                                }
                              >
                                {t.significance}
                              </Badge>
                            ) : isSignificant ? (
                              <Badge variant="warning">Significant</Badge>
                            ) : (
                              <Badge variant="secondary">Normal</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
