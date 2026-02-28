'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload, AlertTriangle, BookOpen, Receipt, Shield, BarChart3,
  FileText, ArrowRight, CheckCircle, XCircle, Clock
} from 'lucide-react';
import Link from 'next/link';

export default function EngagementOverviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const engagementId = params.id as string;
  const [engagement, setEngagement] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated' && engagementId) {
      Promise.all([
        fetch(`/api/engagements/${engagementId}`).then(r => r.json()),
        fetch(`/api/findings?engagementId=${engagementId}`).then(r => r.json()),
      ]).then(([engData, findData]) => {
        setEngagement(engData);
        setFindings(findData.findings || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [status, engagementId]);

  if (status !== 'authenticated' || loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  if (!engagement) {
    return <AppShell title="Not Found"><p>Engagement not found.</p></AppShell>;
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const resolvedCount = findings.filter(f => f.status === 'resolved').length;

  const sections = [
    { href: `/engagements/${engagementId}/upload`, icon: Upload, title: 'Upload Data', desc: 'Upload trial balance, journal entries, financial statements, tax returns', color: 'text-blue-500' },
    { href: `/engagements/${engagementId}/gaap`, icon: BookOpen, title: 'GAAP Analysis', desc: 'ASC codification compliance checks across 40+ rules', color: 'text-green-600' },
    { href: `/engagements/${engagementId}/tax`, icon: Receipt, title: 'Tax Compliance', desc: 'IRS guidance, deduction limits, Schedule M reconciliation', color: 'text-purple-600' },
    { href: `/engagements/${engagementId}/sox`, icon: Shield, title: 'SOX Controls', desc: 'SOX 302/404 control testing and deficiency tracking', color: 'text-orange-500' },
    { href: `/engagements/${engagementId}/analysis`, icon: BarChart3, title: 'Analysis', desc: "Ratio analysis, Benford's Law, anomaly detection, journal entry testing", color: 'text-cyan-600' },
    { href: `/engagements/${engagementId}/findings`, icon: AlertTriangle, title: 'All Findings', desc: 'View and manage all audit findings across frameworks', color: 'text-red-500' },
    { href: `/engagements/${engagementId}/reports`, icon: FileText, title: 'Reports & Export', desc: 'Generate PDF reports, Excel workpapers, audit summaries', color: 'text-gray-600' },
  ];

  return (
    <AppShell
      engagementId={engagementId}
      title={engagement.entityName}
      subtitle={engagement.name}
      userName={session?.user?.name || ''}
    >
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <div>
                <div className="text-2xl font-bold">{findings.length}</div>
                <div className="text-xs text-gray-500">Total Findings</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2"><XCircle className="h-5 w-5 text-red-600" /></div>
              <div>
                <div className="text-2xl font-bold">{criticalCount + highCount}</div>
                <div className="text-xs text-gray-500">Critical + High</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><CheckCircle className="h-5 w-5 text-green-600" /></div>
              <div>
                <div className="text-2xl font-bold">{resolvedCount}</div>
                <div className="text-xs text-gray-500">Resolved</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2"><Clock className="h-5 w-5 text-blue-600" /></div>
              <div>
                <div className="text-2xl font-bold capitalize">{engagement.status}</div>
                <div className="text-xs text-gray-500">Status</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Findings Severity Breakdown */}
      {findings.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Findings by Severity</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-5">
              {[
                { label: 'Critical', count: criticalCount, color: '#dc2626' },
                { label: 'High', count: highCount, color: '#ea580c' },
                { label: 'Medium', count: mediumCount, color: '#ca8a04' },
                { label: 'Low', count: findings.filter(f => f.severity === 'low').length, color: '#2563eb' },
                { label: 'Info', count: findings.filter(f => f.severity === 'info').length, color: '#6b7280' },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-sm font-bold">{s.count}</span>
                  </div>
                  <Progress value={findings.length > 0 ? (s.count / findings.length) * 100 : 0} color={s.color} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sections.map(section => (
          <Link key={section.href} href={section.href}>
            <Card className="transition-all hover:shadow-md hover:border-gray-300 cursor-pointer h-full">
              <CardContent className="pt-6">
                <section.icon className={`h-8 w-8 ${section.color} mb-3`} />
                <h3 className="font-semibold mb-1">{section.title}</h3>
                <p className="text-sm text-gray-500">{section.desc}</p>
                <div className="mt-3 flex items-center text-sm font-medium text-gray-900">
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
