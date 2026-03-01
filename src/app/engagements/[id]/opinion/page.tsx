'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface OpinionReadiness {
  engagement: {
    id: string;
    entityName: string;
    fiscalYearEnd: string;
    materialityThreshold: number;
    status: string;
  };
  opinion: {
    opinionType: string;
    opinionLabel: string;
    rationale: string;
    draftText: string;
    readyForIssuance: boolean;
    blockingConditions: Array<{
      category: string;
      description: string;
      severity: string;
      resolution: string;
    }>;
    emphasisOfMatter: Array<{
      title: string;
      paragraph: string;
    }>;
    criticalAuditMatters: Array<{
      title: string;
      description: string;
    }>;
    factors: Record<string, boolean | number | string>;
  };
  modules: {
    sud: { conclusion: string; aggregateImpactOnIncome: number; materialityThreshold: number };
    goingConcern: { conclusion: string; opinionImpact: string } | null;
    scopeLimitations: { opinionImpact: string; unresolvedCount: number };
    assertionCoverage: { coverageRate: number; gaps: number; readyForOpinion: boolean };
    sampling: { totalPlans: number; unsupported: number; pending: number };
    checklist: { completionRate: number; blocking: number; readyForOpinion: boolean };
    independence: { confirmed: number; total: number; allConfirmed: boolean };
    subsequentEvents: { eventsIdentified: number; proceduresComplete: boolean; readyForOpinion: boolean };
    relatedParties: { partiesIdentified: number; transactions: number; allDisclosed: boolean };
  };
}

function StatusBadge({ status }: { status: 'ready' | 'warning' | 'blocked' | 'pending' }) {
  const colors = {
    ready: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    blocked: 'bg-red-100 text-red-800 border-red-200',
    pending: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const labels = { ready: 'Ready', warning: 'Warning', blocked: 'Blocked', pending: 'Pending' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function ModuleCard({
  title,
  status,
  details,
  metric,
}: {
  title: string;
  status: 'ready' | 'warning' | 'blocked' | 'pending';
  details: string;
  metric?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <StatusBadge status={status} />
      </div>
      <p className="text-xs text-gray-600">{details}</p>
      {metric && <p className="text-lg font-bold text-gray-900 mt-2">{metric}</p>}
    </div>
  );
}

export default function OpinionReadinessPage() {
  const params = useParams();
  const engagementId = params.id as string;
  const [data, setData] = useState<OpinionReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDraft, setShowDraft] = useState(false);

  useEffect(() => {
    fetch(`/api/engagements/${engagementId}/opinion-readiness`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [engagementId]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-red-600">Failed to load opinion readiness data.</div>;
  }

  const { opinion, modules, engagement } = data;

  const opinionColor = {
    unqualified: 'text-green-700 bg-green-50 border-green-200',
    qualified: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    adverse: 'text-red-700 bg-red-50 border-red-200',
    disclaimer: 'text-red-700 bg-red-50 border-red-200',
  }[opinion.opinionType] || 'text-gray-700 bg-gray-50';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Opinion Readiness Dashboard</h1>
        <p className="text-sm text-gray-600 mt-1">
          {engagement.entityName} — FYE {engagement.fiscalYearEnd} — Materiality: ${Math.round(engagement.materialityThreshold).toLocaleString()}
        </p>
      </div>

      {/* Opinion Summary */}
      <div className={`rounded-lg border-2 p-6 ${opinionColor}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{opinion.opinionLabel}</h2>
            <p className="text-sm mt-1">{opinion.rationale}</p>
          </div>
          <div className="text-right">
            <StatusBadge status={opinion.readyForIssuance ? 'ready' : 'blocked'} />
            <p className="text-xs mt-1">
              {opinion.readyForIssuance ? 'Ready for issuance' : `${opinion.blockingConditions.length} blocking condition(s)`}
            </p>
          </div>
        </div>
      </div>

      {/* Blocking Conditions */}
      {opinion.blockingConditions.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-red-800 mb-3">Blocking Conditions</h3>
          <div className="space-y-2">
            {opinion.blockingConditions.map((bc, i) => (
              <div key={i} className="bg-white rounded p-3 border border-red-100">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${bc.severity === 'blocker' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {bc.category}
                  </span>
                </div>
                <p className="text-sm text-gray-800 mt-1">{bc.description}</p>
                <p className="text-xs text-gray-500 mt-1">Resolution: {bc.resolution}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module Status Grid */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Module Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ModuleCard
            title="Unadjusted Differences (SUD)"
            status={modules.sud.conclusion === 'acceptable' ? 'ready' : modules.sud.conclusion === 'requires_attention' ? 'warning' : 'blocked'}
            details={`Aggregate impact: $${Math.round(modules.sud.aggregateImpactOnIncome).toLocaleString()} vs materiality $${Math.round(modules.sud.materialityThreshold).toLocaleString()}`}
            metric={modules.sud.conclusion.replace(/_/g, ' ').toUpperCase()}
          />

          <ModuleCard
            title="Going Concern (ASC 205-40)"
            status={
              !modules.goingConcern ? 'pending'
              : modules.goingConcern.conclusion === 'no_substantial_doubt' ? 'ready'
              : modules.goingConcern.conclusion === 'substantial_doubt_mitigated' ? 'warning'
              : 'blocked'
            }
            details={modules.goingConcern?.conclusion.replace(/_/g, ' ') ?? 'Assessment not yet performed'}
            metric={modules.goingConcern?.opinionImpact.replace(/_/g, ' ').toUpperCase() ?? 'PENDING'}
          />

          <ModuleCard
            title="Scope Limitations"
            status={modules.scopeLimitations.opinionImpact === 'none' ? 'ready' : 'blocked'}
            details={`${modules.scopeLimitations.unresolvedCount} unresolved limitation(s)`}
            metric={modules.scopeLimitations.opinionImpact.toUpperCase()}
          />

          <ModuleCard
            title="Assertion Coverage"
            status={modules.assertionCoverage.readyForOpinion ? 'ready' : modules.assertionCoverage.gaps > 0 ? 'blocked' : 'pending'}
            details={`${modules.assertionCoverage.gaps} gap(s) in material accounts`}
            metric={`${(modules.assertionCoverage.coverageRate * 100).toFixed(0)}%`}
          />

          <ModuleCard
            title="Sampling Plans"
            status={
              modules.sampling.unsupported > 0 ? 'blocked'
              : modules.sampling.pending > 0 ? 'warning'
              : modules.sampling.totalPlans > 0 ? 'ready'
              : 'pending'
            }
            details={`${modules.sampling.totalPlans} plan(s): ${modules.sampling.unsupported} unsupported, ${modules.sampling.pending} pending`}
          />

          <ModuleCard
            title="Completion Checklist"
            status={modules.checklist.readyForOpinion ? 'ready' : 'blocked'}
            details={`${modules.checklist.blocking} required item(s) remaining`}
            metric={`${(modules.checklist.completionRate * 100).toFixed(0)}%`}
          />

          <ModuleCard
            title="Independence"
            status={modules.independence.allConfirmed ? 'ready' : 'blocked'}
            details={`${modules.independence.confirmed}/${modules.independence.total} team members confirmed`}
          />

          <ModuleCard
            title="Subsequent Events (AU-C 560)"
            status={modules.subsequentEvents.readyForOpinion ? 'ready' : 'blocked'}
            details={`${modules.subsequentEvents.eventsIdentified} event(s) identified, procedures ${modules.subsequentEvents.proceduresComplete ? 'complete' : 'incomplete'}`}
          />

          <ModuleCard
            title="Related Parties (ASC 850)"
            status={modules.relatedParties.allDisclosed ? 'ready' : modules.relatedParties.partiesIdentified === 0 ? 'pending' : 'warning'}
            details={`${modules.relatedParties.partiesIdentified} parties, ${modules.relatedParties.transactions} transactions`}
          />
        </div>
      </div>

      {/* Emphasis of Matter */}
      {opinion.emphasisOfMatter.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-blue-800 mb-3">Emphasis of Matter Paragraphs</h3>
          {opinion.emphasisOfMatter.map((eom, i) => (
            <div key={i} className="bg-white rounded p-3 border border-blue-100 mb-2">
              <p className="text-sm font-semibold text-blue-800">{eom.title}</p>
              <p className="text-xs text-gray-700 mt-1">{eom.paragraph}</p>
            </div>
          ))}
        </div>
      )}

      {/* Critical Audit Matters */}
      {opinion.criticalAuditMatters.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-purple-800 mb-3">Critical Audit Matters (PCAOB)</h3>
          {opinion.criticalAuditMatters.map((cam, i) => (
            <div key={i} className="bg-white rounded p-3 border border-purple-100 mb-2">
              <p className="text-sm font-semibold text-purple-800">{cam.title}</p>
              <p className="text-xs text-gray-700 mt-1">{cam.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Draft Opinion Text */}
      <div className="border border-gray-200 rounded-lg">
        <button
          onClick={() => setShowDraft(!showDraft)}
          className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <span className="text-sm font-semibold text-gray-900">Draft Opinion Text</span>
          <span className="text-gray-400">{showDraft ? '▲' : '▼'}</span>
        </button>
        {showDraft && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
              {opinion.draftText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
