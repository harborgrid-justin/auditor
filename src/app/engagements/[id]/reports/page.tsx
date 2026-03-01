'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  FileText, Download, Loader2, CheckCircle, XCircle,
  FileSpreadsheet, File, Clock,
} from 'lucide-react';

interface ReportType {
  id: string;
  title: string;
  description: string;
  pdfType: string;
  excelType: string;
  icon: React.ReactNode;
}

interface GenerationJob {
  reportId: string;
  format: 'pdf' | 'excel';
  status: 'generating' | 'completed' | 'error';
  progress: number;
  error?: string;
}

const REPORT_TYPES: ReportType[] = [
  {
    id: 'summary',
    title: 'Executive Summary',
    description:
      'High-level overview of the audit engagement including key findings, risk assessments, and material items requiring management attention.',
    pdfType: 'summary',
    excelType: 'summary',
    icon: <FileText className="h-8 w-8 text-blue-500" />,
  },
  {
    id: 'findings',
    title: 'Detailed Findings Report',
    description:
      'Comprehensive report of all audit findings organized by framework (GAAP, IRS, SOX, PCAOB), with severity, citations, remediation steps, and financial impact.',
    pdfType: 'findings',
    excelType: 'findings',
    icon: <FileText className="h-8 w-8 text-red-500" />,
  },
  {
    id: 'sox',
    title: 'SOX Control Matrix',
    description:
      'Complete SOX 302/404 control matrix with control IDs, testing status, deficiencies, and management responses. Includes control walkthroughs and evidence.',
    pdfType: 'sox',
    excelType: 'sox',
    icon: <FileText className="h-8 w-8 text-orange-500" />,
  },
  {
    id: 'workpapers',
    title: 'Analysis Report',
    description:
      'Audit workpapers including ratio analysis, Benford\'s Law results, journal entry testing, trend analysis, and supporting schedules.',
    pdfType: 'analysis',
    excelType: 'workpapers',
    icon: <FileText className="h-8 w-8 text-green-600" />,
  },
];

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const engagementId = params.id as string;

  const [jobs, setJobs] = useState<Map<string, GenerationJob>>(new Map());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  function getJobKey(reportId: string, format: string): string {
    return `${reportId}-${format}`;
  }

  function getJob(reportId: string, format: string): GenerationJob | undefined {
    return jobs.get(getJobKey(reportId, format));
  }

  function setJob(reportId: string, format: 'pdf' | 'excel', job: GenerationJob) {
    setJobs((prev) => {
      const next = new Map(prev);
      next.set(getJobKey(reportId, format), job);
      return next;
    });
  }

  async function generateReport(report: ReportType, format: 'pdf' | 'excel') {
    const jobKey = getJobKey(report.id, format);
    const existingJob = jobs.get(jobKey);
    if (existingJob?.status === 'generating') return;

    setMessage(null);
    setJob(report.id, format, {
      reportId: report.id,
      format,
      status: 'generating',
      progress: 0,
    });

    // Simulate progress while waiting for response
    const progressInterval = setInterval(() => {
      setJobs((prev) => {
        const next = new Map(prev);
        const current = next.get(jobKey);
        if (current && current.status === 'generating' && current.progress < 90) {
          next.set(jobKey, { ...current, progress: current.progress + 10 });
        }
        return next;
      });
    }, 300);

    try {
      const type = format === 'pdf' ? report.pdfType : report.excelType;
      const url = `/api/export?engagementId=${engagementId}&format=${format}&type=${type}`;
      const res = await fetch(url);

      clearInterval(progressInterval);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to generate ${format.toUpperCase()} report`);
      }

      // Handle file download
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let fileName = `${report.title.replace(/\s+/g, '_')}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
        if (match) fileName = match[1];
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setJob(report.id, format, {
        reportId: report.id,
        format,
        status: 'completed',
        progress: 100,
      });

      setMessage({
        type: 'success',
        text: `${report.title} (${format.toUpperCase()}) generated and downloaded successfully.`,
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      clearInterval(progressInterval);
      setJob(report.id, format, {
        reportId: report.id,
        format,
        status: 'error',
        progress: 0,
        error: err.message,
      });
      setMessage({
        type: 'error',
        text: err.message || `Failed to generate ${report.title}`,
      });
    }
  }

  function renderJobStatus(reportId: string, format: 'pdf' | 'excel') {
    const job = getJob(reportId, format);
    if (!job) return null;

    if (job.status === 'generating') {
      return (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Generating {format.toUpperCase()}...</span>
            <span>{job.progress}%</span>
          </div>
          <Progress value={job.progress} color="#1f2937" />
        </div>
      );
    }

    if (job.status === 'completed') {
      return (
        <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
          <CheckCircle className="h-3 w-3" />
          <span>Downloaded</span>
        </div>
      );
    }

    if (job.status === 'error') {
      return (
        <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
          <XCircle className="h-3 w-3" />
          <span>{job.error || 'Generation failed'}</span>
        </div>
      );
    }

    return null;
  }

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
      title="Reports & Export"
      subtitle="Generate audit reports and export workpapers"
      userName={session?.user?.name || ''}
    >
      {/* Message Banner */}
      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-lg border p-4 ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="text-sm">{message.text}</span>
          <button
            className="ml-auto text-sm font-medium hover:underline"
            onClick={() => setMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quick Export Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Quick Export</CardTitle>
          <CardDescription>
            Download complete audit packages in a single click
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => generateReport(REPORT_TYPES[0], 'pdf')}
              disabled={getJob('summary', 'pdf')?.status === 'generating'}
            >
              {getJob('summary', 'pdf')?.status === 'generating' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <File className="mr-2 h-4 w-4 text-red-500" />
              )}
              Executive Summary PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => generateReport(REPORT_TYPES[3], 'excel')}
              disabled={getJob('workpapers', 'excel')?.status === 'generating'}
            >
              {getJob('workpapers', 'excel')?.status === 'generating' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
              )}
              Workpapers Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {REPORT_TYPES.map((report) => {
          const pdfJob = getJob(report.id, 'pdf');
          const excelJob = getJob(report.id, 'excel');
          const isGeneratingPdf = pdfJob?.status === 'generating';
          const isGeneratingExcel = excelJob?.status === 'generating';

          return (
            <Card key={report.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="shrink-0 mt-1">{report.icon}</div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base mb-1">{report.title}</CardTitle>
                    <CardDescription>{report.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-end">
                {/* Export Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => generateReport(report, 'pdf')}
                    disabled={isGeneratingPdf}
                  >
                    {isGeneratingPdf ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateReport(report, 'excel')}
                    disabled={isGeneratingExcel}
                  >
                    {isGeneratingExcel ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                    )}
                    Excel
                  </Button>
                </div>

                {/* Generation Status */}
                {renderJobStatus(report.id, 'pdf')}
                {renderJobStatus(report.id, 'excel')}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Card */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Clock className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Report Generation</p>
              <ul className="text-sm text-gray-500 space-y-1">
                <li>
                  <strong>PDF reports</strong> -- Formatted documents suitable for client delivery, including cover pages, table of contents, and professional formatting.
                </li>
                <li>
                  <strong>Excel exports</strong> -- Detailed workpapers with supporting data, formulas, and multiple worksheets for audit documentation.
                </li>
                <li>
                  Reports reflect the current state of all findings, controls, and analyses. Re-generate after making changes to include the latest data.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
