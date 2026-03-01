'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Landmark, AlertTriangle, Wallet, Shield, BarChart3, Scale,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface AppropriationSummary {
  total: number;
  current: number;
  expired: number;
  cancelled: number;
  totalAuthority: number;
  totalObligated: number;
  totalDisbursed: number;
  unobligatedBalance: number;
}

interface AdaSummary {
  total: number;
  detected: number;
  underInvestigation: number;
  confirmed: number;
  resolved: number;
  totalAmount: number;
}

interface FmrComplianceSummary {
  totalRules: number;
  passed: number;
  failed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  passed: '#16a34a',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ADA_STATUS_COLORS = ['#fbbf24', '#f97316', '#ef4444', '#22c55e'];

export default function DoDFmrDashboard() {
  const { id: engagementId } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [appropriations, setAppropriations] = useState<AppropriationSummary>({
    total: 0, current: 0, expired: 0, cancelled: 0,
    totalAuthority: 0, totalObligated: 0, totalDisbursed: 0, unobligatedBalance: 0,
  });
  const [adaSummary, setAdaSummary] = useState<AdaSummary>({
    total: 0, detected: 0, underInvestigation: 0, confirmed: 0, resolved: 0, totalAmount: 0,
  });
  const [compliance, setCompliance] = useState<FmrComplianceSummary>({
    totalRules: 0, passed: 0, failed: 0, critical: 0, high: 0, medium: 0, low: 0,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [findings, setFindings] = useState<any[]>([]);

  useEffect(() => {
    if (!engagementId) return;

    async function loadData() {
      setLoading(true);
      try {
        // Load appropriations
        const appnRes = await fetch(`/api/dod/appropriations?engagementId=${engagementId}`);
        if (appnRes.ok) {
          const data = await appnRes.json();
          const appns = data.appropriations || [];
          setAppropriations({
            total: appns.length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            current: appns.filter((a: any) => a.status === 'current').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expired: appns.filter((a: any) => a.status === 'expired').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cancelled: appns.filter((a: any) => a.status === 'cancelled').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            totalAuthority: appns.reduce((s: number, a: any) => s + (a.totalAuthority || 0), 0),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            totalObligated: appns.reduce((s: number, a: any) => s + (a.obligated || 0), 0),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            totalDisbursed: appns.reduce((s: number, a: any) => s + (a.disbursed || 0), 0),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            unobligatedBalance: appns.reduce((s: number, a: any) => s + (a.unobligatedBalance || 0), 0),
          });
        }

        // Load ADA violations
        const adaRes = await fetch(`/api/dod/ada?engagementId=${engagementId}`);
        if (adaRes.ok) {
          const data = await adaRes.json();
          const violations = data.violations || [];
          setAdaSummary({
            total: violations.length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            detected: violations.filter((v: any) => v.investigationStatus === 'detected').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            underInvestigation: violations.filter((v: any) => v.investigationStatus === 'under_investigation').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            confirmed: violations.filter((v: any) => v.investigationStatus === 'confirmed').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolved: violations.filter((v: any) => v.investigationStatus === 'resolved').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            totalAmount: violations.reduce((s: number, v: any) => s + (v.amount || 0), 0),
          });
        }

        // Load DoD FMR findings
        const findingsRes = await fetch(`/api/findings?engagementId=${engagementId}&framework=DOD_FMR`);
        if (findingsRes.ok) {
          const data = await findingsRes.json();
          const fmrFindings = data.findings || [];
          setFindings(fmrFindings.slice(0, 10));
          setCompliance({
            totalRules: 130,
            passed: 130 - fmrFindings.length,
            failed: fmrFindings.length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            critical: fmrFindings.filter((f: any) => f.severity === 'critical').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            high: fmrFindings.filter((f: any) => f.severity === 'high').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            medium: fmrFindings.filter((f: any) => f.severity === 'medium').length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            low: fmrFindings.filter((f: any) => f.severity === 'low').length,
          });
        }
      } catch (error) {
        console.error('Failed to load DoD FMR data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [engagementId]);

  const executionRate = appropriations.totalAuthority > 0
    ? ((appropriations.totalObligated / appropriations.totalAuthority) * 100).toFixed(1)
    : '0.0';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const disbursementRate = appropriations.totalObligated > 0
    ? ((appropriations.totalDisbursed / appropriations.totalObligated) * 100).toFixed(1)
    : '0.0';

  const complianceScore = compliance.totalRules > 0
    ? ((compliance.passed / compliance.totalRules) * 100).toFixed(0)
    : '100';

  const executionChartData = [
    { name: 'Authority', value: appropriations.totalAuthority / 1_000_000 },
    { name: 'Obligated', value: appropriations.totalObligated / 1_000_000 },
    { name: 'Disbursed', value: appropriations.totalDisbursed / 1_000_000 },
    { name: 'Unobligated', value: appropriations.unobligatedBalance / 1_000_000 },
  ];

  const severityChartData = [
    { name: 'Critical', value: compliance.critical, color: SEVERITY_COLORS.critical },
    { name: 'High', value: compliance.high, color: SEVERITY_COLORS.high },
    { name: 'Medium', value: compliance.medium, color: SEVERITY_COLORS.medium },
    { name: 'Low', value: compliance.low, color: SEVERITY_COLORS.low },
  ].filter(d => d.value > 0);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const adaChartData = [
    { name: 'Detected', value: adaSummary.detected },
    { name: 'Investigating', value: adaSummary.underInvestigation },
    { name: 'Confirmed', value: adaSummary.confirmed },
    { name: 'Resolved', value: adaSummary.resolved },
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Loading DoD FMR Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Landmark className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DoD FMR Compliance Dashboard</h1>
          <p className="text-sm text-gray-500">DoD Financial Management Regulation (7000.14-R) - All 15 Volumes</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Compliance Score */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">FMR Compliance</span>
            <CheckCircle2 className={`h-5 w-5 ${Number(complianceScore) >= 90 ? 'text-green-500' : Number(complianceScore) >= 70 ? 'text-yellow-500' : 'text-red-500'}`} />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{complianceScore}%</p>
          <p className="text-xs text-gray-500">{compliance.passed} of {compliance.totalRules} rules passed</p>
        </div>

        {/* Execution Rate */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Fund Execution</span>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{executionRate}%</p>
          <p className="text-xs text-gray-500">${(appropriations.totalObligated / 1_000_000).toFixed(1)}M of ${(appropriations.totalAuthority / 1_000_000).toFixed(1)}M obligated</p>
        </div>

        {/* ADA Violations */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">ADA Violations</span>
            <AlertTriangle className={`h-5 w-5 ${adaSummary.total > 0 ? 'text-red-500' : 'text-green-500'}`} />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{adaSummary.total}</p>
          <p className="text-xs text-gray-500">
            {adaSummary.total === 0 ? 'No violations detected' :
              `${adaSummary.confirmed} confirmed, $${(adaSummary.totalAmount / 1_000_000).toFixed(2)}M impacted`}
          </p>
        </div>

        {/* Appropriations */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Appropriations</span>
            <Wallet className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{appropriations.total}</p>
          <p className="text-xs text-gray-500">{appropriations.current} current, {appropriations.expired} expired</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Fund Execution Chart */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Fund Execution Summary ($M)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={executionChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value: number | undefined) => `$${(value ?? 0).toFixed(2)}M`} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Findings by Severity */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Findings by Severity</h3>
          {severityChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={severityChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {severityChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-gray-400">
              No findings - all rules passed
            </div>
          )}
        </div>
      </div>

      {/* Recent Findings */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Recent DoD FMR Findings</h3>
        {findings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="pb-2 pr-4">Rule ID</th>
                  <th className="pb-2 pr-4">Title</th>
                  <th className="pb-2 pr-4">Severity</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Impact</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {findings.map((finding: any) => (
                  <tr key={finding.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono text-xs">{finding.ruleId}</td>
                    <td className="py-2 pr-4 max-w-xs truncate">{finding.title}</td>
                    <td className="py-2 pr-4">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${SEVERITY_COLORS[finding.severity]}20`,
                          color: SEVERITY_COLORS[finding.severity],
                        }}
                      >
                        {finding.severity}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        finding.status === 'open' ? 'bg-red-100 text-red-700' :
                        finding.status === 'resolved' ? 'bg-green-100 text-green-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {finding.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {finding.amountImpact ? `$${(finding.amountImpact / 1_000_000).toFixed(2)}M` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-gray-400">No DoD FMR findings for this engagement</p>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a href={`/engagements/${engagementId}/dod-fmr/appropriations`}
           className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50">
          <Wallet className="h-6 w-6 text-indigo-500" />
          <div>
            <p className="font-medium text-gray-900">Appropriations</p>
            <p className="text-xs text-gray-500">Manage fund lifecycle</p>
          </div>
        </a>
        <a href={`/engagements/${engagementId}/dod-fmr/ada`}
           className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50">
          <Shield className="h-6 w-6 text-red-500" />
          <div>
            <p className="font-medium text-gray-900">ADA Monitor</p>
            <p className="text-xs text-gray-500">Anti-Deficiency Act tracking</p>
          </div>
        </a>
        <a href={`/engagements/${engagementId}/dod-fmr/reports`}
           className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50">
          <BarChart3 className="h-6 w-6 text-blue-500" />
          <div>
            <p className="font-medium text-gray-900">Federal Reports</p>
            <p className="text-xs text-gray-500">SF-133, GTAS, Financial Statements</p>
          </div>
        </a>
        <a href={`/engagements/${engagementId}/dod-fmr/pay`}
           className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50">
          <Scale className="h-6 w-6 text-green-500" />
          <div>
            <p className="font-medium text-gray-900">Pay Compliance</p>
            <p className="text-xs text-gray-500">Military & civilian pay audit</p>
          </div>
        </a>
      </div>
    </div>
  );
}
