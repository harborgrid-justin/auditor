'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface EngagementSummary {
  entityName: string;
  name: string;
  status: string;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export default function ClientPortalDashboard() {
  const params = useParams();
  const engagementId = params.engagementId as string;
  const [summary, setSummary] = useState<EngagementSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/findings?engagementId=${engagementId}`)
      .then((r) => r.json())
      .then((data) => {
        const findings = data.findings || [];
        setSummary({
          entityName: data.entityName || '',
          name: data.engagementName || '',
          status: data.status || '',
          totalFindings: findings.length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          critical: findings.filter((f: any) => f.severity === 'critical').length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          high: findings.filter((f: any) => f.severity === 'high').length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          medium: findings.filter((f: any) => f.severity === 'medium').length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          low: findings.filter((f: any) => f.severity === 'low').length,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [engagementId]);

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!summary) {
    return <div className="text-center py-12">Engagement not found</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{summary.entityName}</h2>
        <p className="text-gray-500">{summary.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard label="Total Findings" value={summary.totalFindings} />
        <SummaryCard label="Critical" value={summary.critical} color="text-red-600" />
        <SummaryCard label="High" value={summary.high} color="text-orange-600" />
        <SummaryCard label="Medium" value={summary.medium} color="text-yellow-600" />
        <SummaryCard label="Low" value={summary.low} color="text-blue-600" />
      </div>

      <Link
        href={`/portal/${engagementId}/findings`}
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
      >
        View All Findings
      </Link>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
