'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Clock, Shield } from 'lucide-react';

interface LegislationRecord {
  id: string;
  name: string;
  shortName: string;
  publicLaw?: string;
  enactedDate: string;
  effectiveDate: string;
  sunsetDate?: string;
  status: string;
  affectedSections: string[];
  summary: string;
}

interface LegislativeAlert {
  legislationName: string;
  shortName: string;
  provisionDescription: string;
  ircSection?: string;
  alertType: string;
  severity: string;
  message: string;
  affectedRuleIds: string[];
  affectedParameterCodes: string[];
  sunsetDate?: string;
  taxYear: number;
}

interface EngagementBasic {
  fiscalYearEnd: string;
  entityType?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  info: 'bg-gray-100 text-gray-800 border-gray-200',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  partially_sunset: 'bg-amber-100 text-amber-800',
  fully_sunset: 'bg-red-100 text-red-800',
  superseded: 'bg-gray-100 text-gray-800',
};

export default function LegislationPage() {
  const params = useParams();
  const engagementId = params.id as string;
  const [legislation, setLegislation] = useState<LegislationRecord[]>([]);
  const [alerts, setAlerts] = useState<LegislativeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [engagement, setEngagement] = useState<EngagementBasic | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch engagement to get fiscal year
        const engRes = await fetch(`/api/engagements/${engagementId}`);
        const engData = await engRes.json();
        const eng = engData.engagement;
        setEngagement(eng);

        if (eng?.fiscalYearEnd) {
          const taxYear = new Date(eng.fiscalYearEnd).getFullYear();
          const legRes = await fetch(`/api/legislation?taxYear=${taxYear}`);
          const legData = await legRes.json();
          setLegislation(legData.legislation || []);
          setAlerts(legData.alerts || []);
        }
      } catch (error) {
        console.error('Failed to load legislation data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [engagementId]);

  const taxYear = engagement?.fiscalYearEnd
    ? new Date(engagement.fiscalYearEnd).getFullYear()
    : null;

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Legislative Compliance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tax year {taxYear} &mdash; Active legislation, sunset alerts, and rule impacts
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {legislation.length} Active Laws
        </Badge>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Legislative Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-medium">{alert.legislationName}</span>
                      {alert.ircSection && (
                        <span className="text-sm ml-2">IRC {alert.ircSection}</span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {alert.alertType.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm mt-1">{alert.message}</p>
                  {alert.affectedRuleIds.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {alert.affectedRuleIds.map(ruleId => (
                        <Badge key={ruleId} variant="secondary" className="text-xs">
                          {ruleId}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legislation Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Active Legislation for Tax Year {taxYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {legislation.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No legislation data available for this tax year.
            </p>
          ) : (
            <div className="space-y-4">
              {legislation.map(law => (
                <div
                  key={law.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {law.status === 'active' ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : law.status === 'partially_sunset' ? (
                        <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      )}
                      <div>
                        <h3 className="font-semibold">{law.name}</h3>
                        {law.publicLaw && (
                          <span className="text-sm text-gray-500">{law.publicLaw}</span>
                        )}
                      </div>
                    </div>
                    <Badge className={STATUS_COLORS[law.status] || STATUS_COLORS.active}>
                      {law.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-600 mt-2">{law.summary}</p>

                  <div className="flex gap-4 mt-3 text-xs text-gray-500">
                    <span>Enacted: {law.enactedDate}</span>
                    <span>Effective: {law.effectiveDate}</span>
                    {law.sunsetDate && (
                      <span className="text-amber-600 font-medium">
                        Sunset: {law.sunsetDate}
                      </span>
                    )}
                  </div>

                  {law.affectedSections.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {law.affectedSections.map(section => (
                        <Badge key={section} variant="outline" className="text-xs">
                          IRC {section}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
