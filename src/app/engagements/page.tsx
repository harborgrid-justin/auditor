'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Building2, ArrowRight, Calendar, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { EngagementSummary } from '@/types/engagement';

export default function EngagementsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [engagements, setEngagements] = useState<EngagementSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    entityName: '',
    fiscalYearEnd: '',
    materialityThreshold: '',
    industry: '',
    entityType: 'c_corp',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') loadEngagements();
  }, [status]);

  function loadEngagements() {
    fetch('/api/engagements')
      .then(r => r.json())
      .then(data => setEngagements(data.engagements || []))
      .catch(() => {});
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          materialityThreshold: form.materialityThreshold ? parseFloat(form.materialityThreshold) : 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreate(false);
        setForm({ name: '', entityName: '', fiscalYearEnd: '', materialityThreshold: '', industry: '', entityType: 'c_corp' });
        loadEngagements();
        router.push(`/engagements/${data.id}`);
      }
    } catch {
    } finally {
      setCreating(false);
    }
  }

  if (status !== 'authenticated') return null;

  return (
    <AppShell title="Engagements" subtitle="Manage audit engagements" userName={session?.user?.name || ''}>
      <div className="mb-6 flex items-center justify-between">
        <div />
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-4 w-4" /> New Engagement
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Create New Engagement</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Engagement Name</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="FY2025 Annual Audit" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity Name</label>
                <Input value={form.entityName} onChange={e => setForm({ ...form, entityName: e.target.value })}
                  placeholder="Acme Corporation" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year End</label>
                <Input type="date" value={form.fiscalYearEnd} onChange={e => setForm({ ...form, fiscalYearEnd: e.target.value })}
                  required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Materiality Threshold ($)</label>
                <Input type="number" value={form.materialityThreshold}
                  onChange={e => setForm({ ...form, materialityThreshold: e.target.value })}
                  placeholder="50000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })}
                  placeholder="Technology" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
                <select className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
                  value={form.entityType} onChange={e => setForm({ ...form, entityType: e.target.value })}>
                  <option value="c_corp">C Corporation</option>
                  <option value="s_corp">S Corporation</option>
                  <option value="partnership">Partnership</option>
                  <option value="llc">LLC</option>
                  <option value="nonprofit">Nonprofit</option>
                </select>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Engagement'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {engagements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No engagements yet</h3>
            <p className="text-gray-500 mb-4">Create your first audit engagement to get started</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Engagement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {engagements.map(eng => (
            <Link key={eng.id} href={`/engagements/${eng.id}`}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{eng.entityName}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">{eng.name}</p>
                    </div>
                    <Badge variant={
                      eng.status === 'completed' ? 'success' :
                      eng.status === 'fieldwork' ? 'warning' :
                      eng.status === 'review' ? 'high' : 'secondary'
                    }>{eng.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>FYE: {eng.fiscalYearEnd}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{eng.totalFindings} findings ({eng.criticalFindings} critical)</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center text-sm font-medium text-gray-900">
                    View Details <ArrowRight className="ml-1 h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
