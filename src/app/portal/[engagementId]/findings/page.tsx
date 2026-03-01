'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Finding {
  id: string;
  framework: string;
  severity: string;
  title: string;
  description: string;
  remediation: string;
  status: string;
}

export default function ClientFindingsPage() {
  const params = useParams();
  const engagementId = params.engagementId as string;
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/findings?engagementId=${engagementId}`)
      .then((r) => r.json())
      .then((data) => {
        setFindings(data.findings || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [engagementId]);

  if (loading) {
    return <div className="text-center py-12">Loading findings...</div>;
  }

  const severityColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-blue-100 text-blue-800',
    info: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Audit Findings</h2>
      <p className="text-sm text-gray-500">
        Review findings and provide responses below.
      </p>

      {findings.length === 0 ? (
        <p className="text-gray-400 py-8 text-center">No findings to display.</p>
      ) : (
        <div className="space-y-4">
          {findings.map((f) => (
            <div key={f.id} className="bg-white rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColors[f.severity] || ''}`}>
                  {f.severity.toUpperCase()}
                </span>
                <span className="text-xs text-gray-400">{f.framework}</span>
                <span className="text-xs text-gray-400">| {f.status}</span>
              </div>
              <h3 className="font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm text-gray-600">{f.description}</p>
              <div className="text-sm">
                <span className="font-medium text-gray-700">Recommendation: </span>
                <span className="text-gray-600">{f.remediation}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
