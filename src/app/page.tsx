'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, Building2, CheckCircle, Shield, TrendingUp,
  FileText, BarChart3, Plus, ArrowRight, BookOpen, Receipt, Scale
} from 'lucide-react';
import Link from 'next/link';
import type { EngagementSummary } from '@/types/engagement';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [engagements, setEngagements] = useState<EngagementSummary[]>([]);
  const [stats, setStats] = useState({
    totalEngagements: 0,
    activeEngagements: 0,
    totalFindings: 0,
    criticalFindings: 0,
    resolvedFindings: 0,
    avgRiskScore: 0,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/engagements')
        .then(r => r.json())
        .then(data => {
          setEngagements(data.engagements || []);
          setStats(data.stats || stats);
        })
        .catch(() => {});
    }
  }, [status]);

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  if (status === 'unauthenticated') return null;

  const userName = session?.user?.name || 'User';

  return (
    <AppShell title="Dashboard" subtitle="Financial Audit Compliance Overview" userName={userName}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Active Engagements</CardTitle>
            <Building2 className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeEngagements}</div>
            <p className="text-xs text-gray-500">{stats.totalEngagements} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Findings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalFindings}</div>
            <p className="text-xs text-red-600">{stats.criticalFindings} critical</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.resolvedFindings}</div>
            <p className="text-xs text-gray-500">findings addressed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Avg Risk Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgRiskScore || '--'}</div>
            <p className="text-xs text-gray-500">across engagements</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Engagements</CardTitle>
              <Link href="/engagements">
                <Button variant="outline" size="sm">View All <ArrowRight className="ml-1 h-3 w-3" /></Button>
              </Link>
            </CardHeader>
            <CardContent>
              {engagements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Building2 className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 mb-3">No engagements yet. Create one to get started.</p>
                  <Link href="/engagements">
                    <Button size="sm"><Plus className="mr-1 h-3 w-3" /> Create Engagement</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {engagements.slice(0, 5).map(eng => (
                    <Link key={eng.id} href={`/engagements/${eng.id}`}
                      className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-gray-50">
                      <div>
                        <div className="font-medium">{eng.entityName}</div>
                        <div className="text-sm text-gray-500">{eng.name}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={
                          eng.status === 'completed' ? 'success' :
                          eng.status === 'fieldwork' ? 'warning' :
                          eng.status === 'review' ? 'high' : 'secondary'
                        }>{eng.status}</Badge>
                        {eng.totalFindings > 0 && (
                          <span className="text-sm text-gray-500">{eng.totalFindings} findings</span>
                        )}
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Link href="/engagements" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="mr-2 h-4 w-4" /> New Engagement
                </Button>
              </Link>
              {engagements[0] && (
                <>
                  <Link href={`/engagements/${engagements[0].id}/upload`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <FileText className="mr-2 h-4 w-4" /> Upload Data
                    </Button>
                  </Link>
                  <Link href={`/engagements/${engagements[0].id}/findings`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <AlertTriangle className="mr-2 h-4 w-4" /> View Findings
                    </Button>
                  </Link>
                  <Link href={`/engagements/${engagements[0].id}/analysis`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <BarChart3 className="mr-2 h-4 w-4" /> Run Analysis
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Compliance Frameworks</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'GAAP (ASC)', icon: BookOpen, desc: '40+ rules' },
                { label: 'IRS / Tax Code', icon: Receipt, desc: '30+ rules' },
                { label: 'SOX 302/404', icon: Shield, desc: '25+ controls' },
                { label: 'PCAOB Standards', icon: BarChart3, desc: '15+ checks' },
              ].map(fw => (
                <div key={fw.label} className="flex items-center gap-3">
                  <fw.icon className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{fw.label}</div>
                    <div className="text-xs text-gray-500">{fw.desc}</div>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
