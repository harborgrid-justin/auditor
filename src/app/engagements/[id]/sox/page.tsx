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
  Shield, Play, Loader2, XCircle, CheckCircle,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';

interface SoxControl {
  id: string;
  controlId: string;
  title: string;
  description: string;
  type: string;
  category: string;
  frequency: string;
  status: 'not_tested' | 'effective' | 'deficient' | 'significant_deficiency' | 'material_weakness';
}

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

type ControlStatusVariant = 'secondary' | 'success' | 'warning' | 'high' | 'critical';

const CONTROL_STATUS_MAP: Record<string, { label: string; variant: ControlStatusVariant }> = {
  not_tested: { label: 'Not Tested', variant: 'secondary' },
  effective: { label: 'Effective', variant: 'success' },
  deficient: { label: 'Deficient', variant: 'warning' },
  significant_deficiency: { label: 'Significant Deficiency', variant: 'high' },
  material_weakness: { label: 'Material Weakness', variant: 'critical' },
};

function formatCurrency(amount: number | null): string {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

export default function SoxPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const engagementId = params.id as string;

  const [controls, setControls] = useState<SoxControl[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loadingControls, setLoadingControls] = useState(true);
  const [loadingFindings, setLoadingFindings] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const loadControls = useCallback(async () => {
    try {
      const res = await fetch(`/api/engagements/${engagementId}/sox`);
      if (res.ok) {
        const data = await res.json();
        setControls(data.controls || []);
      }
    } catch {
      setError('Failed to load SOX controls.');
    } finally {
      setLoadingControls(false);
    }
  }, [engagementId]);

  const loadFindings = useCallback(async () => {
    try {
      const res = await fetch(`/api/findings?engagementId=${engagementId}&framework=SOX`);
      if (res.ok) {
        const data = await res.json();
        setFindings(data.findings || []);
      }
    } catch {
      // silently handle
    } finally {
      setLoadingFindings(false);
    }
  }, [engagementId]);

  useEffect(() => {
    if (status === 'authenticated' && engagementId) {
      loadControls();
      loadFindings();
    }
  }, [status, engagementId, loadControls, loadFindings]);

  async function runSoxAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagementId, frameworks: ['SOX'] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'SOX analysis failed');
      }
      await Promise.all([loadControls(), loadFindings()]);
    } catch (err: any) {
      setError(err.message || 'SOX analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  const effectiveCount = controls.filter((c) => c.status === 'effective').length;
  const deficientCount = controls.filter((c) =>
    ['deficient', 'significant_deficiency', 'material_weakness'].includes(c.status)
  ).length;
  const untestedCount = controls.filter((c) => c.status === 'not_tested').length;

  const isLoading = loadingControls || loadingFindings;

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
      title="SOX Controls"
      subtitle="SOX 302/404 control testing and deficiency tracking"
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
              <div className="rounded-lg bg-orange-50 p-2">
                <Shield className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{controls.length}</div>
                <div className="text-xs text-gray-500">Total Controls</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{effectiveCount}</div>
                <div className="text-xs text-gray-500">Effective</div>
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
                <div className="text-2xl font-bold">{deficientCount}</div>
                <div className="text-xs text-gray-500">Deficient</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 p-2">
                <Shield className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{untestedCount}</div>
                <div className="text-xs text-gray-500">Untested</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Run Analysis Button */}
      <div className="mb-6">
        <Button onClick={runSoxAnalysis} disabled={analyzing}>
          {analyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running SOX Analysis...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run SOX Analysis
            </>
          )}
        </Button>
      </div>

      {/* Control Matrix */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Control Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingControls ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500">Loading controls...</span>
            </div>
          ) : controls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">No controls defined</p>
              <p className="text-sm text-gray-500 mt-1">
                Run SOX analysis to generate the control matrix.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Control ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controls.map((control) => {
                  const statusInfo = CONTROL_STATUS_MAP[control.status] || { label: control.status, variant: 'secondary' as const };
                  return (
                    <TableRow key={control.id}>
                      <TableCell className="font-mono font-semibold text-sm">
                        {control.controlId}
                      </TableCell>
                      <TableCell className="font-medium">{control.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {control.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{control.category}</TableCell>
                      <TableCell className="text-sm text-gray-600 capitalize">{control.frequency}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SOX Findings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">SOX Findings</CardTitle>
            <Badge variant="secondary">{findings.length} finding{findings.length !== 1 ? 's' : ''}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFindings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500">Loading findings...</span>
            </div>
          ) : findings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No SOX findings. Run analysis to check controls.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Severity</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Citation</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((finding) => (
                  <React.Fragment key={finding.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedFindingId(
                          expandedFindingId === finding.id ? null : finding.id
                        )
                      }
                    >
                      <TableCell>
                        {expandedFindingId === finding.id ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={finding.severity}>{finding.severity}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{finding.title}</TableCell>
                      <TableCell className="text-sm text-gray-600 font-mono">
                        {finding.citation || '--'}
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
                    {expandedFindingId === finding.id && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-1">Description</h4>
                              <p className="text-sm text-gray-600">{finding.description || 'No description available.'}</p>
                            </div>
                            {finding.citation && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-1">SOX Reference</h4>
                                <div className="flex items-center gap-2 bg-white border border-orange-200 rounded-lg px-4 py-3">
                                  <Shield className="h-5 w-5 text-orange-500 shrink-0" />
                                  <span className="font-mono font-semibold text-orange-800">{finding.citation}</span>
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
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
