'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  BookOpen, Play, Loader2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight,
} from 'lucide-react';

interface Finding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  framework: string;
  citation: string;
  amountImpact: number | null;
  status: string;
  category: string;
  remediation: string;
}

const GAAP_CATEGORIES = [
  'Revenue Recognition',
  'Lease Accounting',
  'Financial Instruments',
  'Income Taxes',
  'Inventory',
  'Intangible Assets',
  'Consolidation',
  'Fair Value Measurement',
  'Compensation',
  'Contingencies',
  'Subsequent Events',
  'Other',
];

function formatCurrency(amount: number | null): string {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

export default function GaapPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const engagementId = params.id as string;

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const loadFindings = useCallback(async () => {
    try {
      const res = await fetch(`/api/findings?engagementId=${engagementId}&framework=GAAP`);
      if (res.ok) {
        const data = await res.json();
        setFindings(data.findings || []);
      }
    } catch {
      setError('Failed to load GAAP findings.');
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    if (status === 'authenticated' && engagementId) {
      loadFindings();
    }
  }, [status, engagementId, loadFindings]);

  async function runGaapAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagementId, frameworks: ['GAAP'] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'GAAP analysis failed');
      }
      await loadFindings();
    } catch (err: any) {
      setError(err.message || 'GAAP analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleCategory(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  // Group findings by category
  const groupedFindings: Record<string, Finding[]> = {};
  findings.forEach((f) => {
    const cat = GAAP_CATEGORIES.includes(f.category) ? f.category : 'Other';
    if (!groupedFindings[cat]) groupedFindings[cat] = [];
    groupedFindings[cat].push(f);
  });

  // Sort categories by number of findings (descending)
  const sortedCategories = Object.keys(groupedFindings).sort(
    (a, b) => groupedFindings[b].length - groupedFindings[a].length
  );

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;

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
      title="GAAP Analysis"
      subtitle="ASC codification compliance checks"
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <BookOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{findings.length}</div>
                <div className="text-xs text-gray-500">Total GAAP Findings</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Badge variant="critical">Critical</Badge>
              <span className="text-2xl font-bold">{criticalCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Badge variant="high">High</Badge>
              <span className="text-2xl font-bold">{highCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Badge variant="medium">Medium</Badge>
              <span className="text-2xl font-bold">{mediumCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Run Analysis Button */}
      <div className="mb-6">
        <Button onClick={runGaapAnalysis} disabled={analyzing}>
          {analyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running GAAP Analysis...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run GAAP Analysis
            </>
          )}
        </Button>
      </div>

      {/* Findings by Category */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
            <span className="text-gray-500">Loading GAAP findings...</span>
          </CardContent>
        </Card>
      ) : findings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-900">No GAAP findings yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Upload financial data and run GAAP analysis to check ASC codification compliance.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map((category) => {
            const catFindings = groupedFindings[category];
            const isCollapsed = collapsedCategories.has(category);
            const catCritical = catFindings.filter((f) => f.severity === 'critical').length;
            const catHigh = catFindings.filter((f) => f.severity === 'high').length;

            return (
              <Card key={category}>
                <CardHeader
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isCollapsed ? (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                      <CardTitle className="text-base">{category}</CardTitle>
                      <Badge variant="secondary">{catFindings.length} finding{catFindings.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {catCritical > 0 && <Badge variant="critical">{catCritical} critical</Badge>}
                      {catHigh > 0 && <Badge variant="high">{catHigh} high</Badge>}
                    </div>
                  </div>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Severity</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>ASC Citation</TableHead>
                          <TableHead>Amount Impact</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catFindings.map((finding) => (
                          <React.Fragment key={finding.id}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() =>
                                setExpandedId(expandedId === finding.id ? null : finding.id)
                              }
                            >
                              <TableCell>
                                <Badge variant={finding.severity}>{finding.severity}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">{finding.title}</TableCell>
                              <TableCell>
                                {finding.citation ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-green-50 border border-green-200 px-2 py-1 text-xs font-mono font-semibold text-green-800">
                                    <BookOpen className="h-3 w-3" />
                                    {finding.citation}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">--</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatCurrency(finding.amountImpact)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    finding.status === 'resolved'
                                      ? 'success'
                                      : finding.status === 'open'
                                      ? 'destructive'
                                      : 'warning'
                                  }
                                >
                                  {finding.status.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                            </TableRow>
                            {expandedId === finding.id && (
                              <TableRow>
                                <TableCell colSpan={5}>
                                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-900 mb-1">Description</h4>
                                      <p className="text-sm text-gray-600">{finding.description || 'No description available.'}</p>
                                    </div>
                                    {finding.citation && (
                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-900 mb-1">ASC Codification Reference</h4>
                                        <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-4 py-3">
                                          <BookOpen className="h-5 w-5 text-green-600 shrink-0" />
                                          <span className="font-mono font-semibold text-green-800">{finding.citation}</span>
                                        </div>
                                      </div>
                                    )}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-900 mb-1">Remediation</h4>
                                      <p className="text-sm text-gray-600">{finding.remediation || 'No remediation steps provided.'}</p>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
