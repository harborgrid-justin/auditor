'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertTriangle, Play, ChevronDown, ChevronRight,
  CheckCircle, Eye, XCircle, Loader2, Filter,
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
  createdAt: string;
}

const FRAMEWORK_OPTIONS = [
  { value: '', label: 'All Frameworks' },
  { value: 'GAAP', label: 'GAAP' },
  { value: 'IRS', label: 'IRS' },
  { value: 'SOX', label: 'SOX' },
  { value: 'PCAOB', label: 'PCAOB' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_review'],
  in_review: ['resolved', 'accepted'],
  resolved: [],
  accepted: [],
};

function formatCurrency(amount: number | null): string {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeVariant(status: string): 'destructive' | 'warning' | 'success' | 'secondary' | 'default' {
  switch (status) {
    case 'open': return 'destructive';
    case 'in_review': return 'warning';
    case 'resolved': return 'success';
    case 'accepted': return 'secondary';
    default: return 'default';
  }
}

export default function FindingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const engagementId = params.id as string;

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [frameworkFilter, setFrameworkFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const loadFindings = useCallback(async () => {
    try {
      const res = await fetch(`/api/findings?engagementId=${engagementId}`);
      if (res.ok) {
        const data = await res.json();
        setFindings(data.findings || []);
      }
    } catch {
      setError('Failed to load findings.');
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    if (status === 'authenticated' && engagementId) {
      loadFindings();
    }
  }, [status, engagementId, loadFindings]);

  async function runAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagementId,
          frameworks: ['GAAP', 'IRS', 'SOX', 'PCAOB'],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Analysis failed');
      }
      await loadFindings();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function updateStatus(findingId: string, newStatus: string) {
    setUpdatingStatus(findingId);
    try {
      const res = await fetch('/api/findings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: findingId, status: newStatus }),
      });
      if (res.ok) {
        setFindings((prev) =>
          prev.map((f) => (f.id === findingId ? { ...f, status: newStatus } : f))
        );
      }
    } catch {
      setError('Failed to update status.');
    } finally {
      setUpdatingStatus(null);
    }
  }

  const filteredFindings = findings.filter((f) => {
    if (frameworkFilter && f.framework !== frameworkFilter) return false;
    if (severityFilter && f.severity !== severityFilter) return false;
    return true;
  });

  const severityCounts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

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
      title="Audit Findings"
      subtitle="All findings across compliance frameworks"
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
      <div className="grid gap-4 md:grid-cols-6 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{findings.length}</div>
            <div className="text-xs text-gray-500">Total</div>
          </CardContent>
        </Card>
        {(
          [
            { key: 'critical', label: 'Critical', variant: 'critical' },
            { key: 'high', label: 'High', variant: 'high' },
            { key: 'medium', label: 'Medium', variant: 'medium' },
            { key: 'low', label: 'Low', variant: 'low' },
            { key: 'info', label: 'Info', variant: 'info' },
          ] as const
        ).map((s) => (
          <Card key={s.key}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Badge variant={s.variant}>{s.label}</Badge>
                <span className="text-2xl font-bold">{severityCounts[s.key]}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Button onClick={runAnalysis} disabled={analyzing}>
          {analyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run Analysis
            </>
          )}
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <Filter className="h-4 w-4 text-gray-400" />
          <Select
            value={frameworkFilter}
            onChange={(e) => setFrameworkFilter(e.target.value)}
            options={FRAMEWORK_OPTIONS}
            className="w-40"
          />
          <Select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            options={SEVERITY_OPTIONS}
            className="w-40"
          />
        </div>
      </div>

      {/* Findings Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500">Loading findings...</span>
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">
                {findings.length === 0 ? 'No findings yet' : 'No findings match the current filters'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {findings.length === 0
                  ? 'Upload data and run an analysis to generate findings.'
                  : 'Try adjusting the framework or severity filters.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Severity</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Framework</TableHead>
                  <TableHead>Citation</TableHead>
                  <TableHead>Amount Impact</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFindings.map((finding) => (
                  <React.Fragment key={finding.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === finding.id ? null : finding.id)
                      }
                    >
                      <TableCell>
                        {expandedId === finding.id ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={finding.severity}>{finding.severity}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{finding.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{finding.framework}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 font-mono">
                        {finding.citation || '--'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatCurrency(finding.amountImpact)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(finding.status)}>
                          {statusLabel(finding.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>

                    {/* Expanded Detail Row */}
                    {expandedId === finding.id && (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                            {/* Description */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-1">Description</h4>
                              <p className="text-sm text-gray-600">{finding.description || 'No description available.'}</p>
                            </div>

                            {/* Citation */}
                            {finding.citation && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-1">Citation</h4>
                                <p className="text-sm text-gray-600 font-mono bg-white border rounded px-3 py-2">
                                  {finding.citation}
                                </p>
                              </div>
                            )}

                            {/* Remediation */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-1">Remediation</h4>
                              <p className="text-sm text-gray-600">
                                {finding.remediation || 'No remediation steps provided.'}
                              </p>
                            </div>

                            {/* Category & Amount */}
                            <div className="flex flex-wrap gap-6">
                              {finding.category && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Category</h4>
                                  <p className="text-sm text-gray-700">{finding.category}</p>
                                </div>
                              )}
                              {finding.amountImpact != null && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Amount Impact</h4>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {formatCurrency(finding.amountImpact)}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Status Actions */}
                            <div className="flex items-center gap-2 pt-2 border-t">
                              <span className="text-sm text-gray-500 mr-2">Change status:</span>
                              {(STATUS_TRANSITIONS[finding.status] || []).map((nextStatus) => (
                                <Button
                                  key={nextStatus}
                                  size="sm"
                                  variant={
                                    nextStatus === 'resolved'
                                      ? 'success'
                                      : nextStatus === 'in_review'
                                      ? 'warning'
                                      : 'outline'
                                  }
                                  disabled={updatingStatus === finding.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateStatus(finding.id, nextStatus);
                                  }}
                                >
                                  {nextStatus === 'in_review' && <Eye className="mr-1 h-3 w-3" />}
                                  {nextStatus === 'resolved' && <CheckCircle className="mr-1 h-3 w-3" />}
                                  {statusLabel(nextStatus)}
                                </Button>
                              ))}
                              {(STATUS_TRANSITIONS[finding.status] || []).length === 0 && (
                                <span className="text-sm text-gray-400 italic">No further transitions available</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
