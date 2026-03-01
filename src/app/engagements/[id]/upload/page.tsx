'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Upload, FileUp, File, CheckCircle, XCircle, Trash2, AlertTriangle,
} from 'lucide-react';

interface UploadedFile {
  id: string;
  fileName: string;
  dataType: string;
  fileSize: number;
  status: string;
  createdAt: string;
  rowCount?: number;
}

const DATA_TYPE_OPTIONS = [
  { value: 'trial_balance', label: 'Trial Balance' },
  { value: 'journal_entries', label: 'Journal Entries' },
  { value: 'financial_statements', label: 'Financial Statements' },
  { value: 'tax_returns', label: 'Tax Returns' },
];

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
];

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.pdf'];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDataType(dt: string): string {
  return dt
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function UploadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const engagementId = params.id as string;

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataType, setDataType] = useState('trial_balance');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/upload?engagementId=${engagementId}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    if (status === 'authenticated' && engagementId) {
      loadFiles();
    }
  }, [status, engagementId, loadFiles]);

  function isValidFile(file: File): boolean {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
  }

  async function handleUpload(selectedFiles: FileList | File[]) {
    const fileArray = Array.from(selectedFiles);
    if (fileArray.length === 0) return;

    const invalidFiles = fileArray.filter((f) => !isValidFile(f));
    if (invalidFiles.length > 0) {
      setMessage({
        type: 'error',
        text: `Invalid file type: ${invalidFiles.map((f) => f.name).join(', ')}. Accepted: CSV, Excel, PDF.`,
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setMessage(null);

    let completedCount = 0;

    for (const file of fileArray) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('engagementId', engagementId);
        formData.append('dataType', dataType);

        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const fileProgress = (e.loaded / e.total) * 100;
              const overallProgress =
                ((completedCount + fileProgress / 100) / fileArray.length) * 100;
              setUploadProgress(Math.round(overallProgress));
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              completedCount++;
              setUploadProgress(Math.round((completedCount / fileArray.length) * 100));
              resolve();
            } else {
              let errorMsg = `Failed to upload ${file.name}`;
              try {
                const resp = JSON.parse(xhr.responseText);
                if (resp.error) errorMsg = resp.error;
              } catch {
                // use default error message
              }
              reject(new Error(errorMsg));
            }
          });

          xhr.addEventListener('error', () => reject(new Error(`Network error uploading ${file.name}`)));
          xhr.open('POST', '/api/upload');
          xhr.send(formData);
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || 'Upload failed' });
        setUploading(false);
        setUploadProgress(0);
        return;
      }
    }

    setMessage({
      type: 'success',
      text: `Successfully uploaded ${fileArray.length} file${fileArray.length > 1 ? 's' : ''}.`,
    });
    setUploading(false);
    setUploadProgress(0);
    loadFiles();
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataType, engagementId]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
      e.target.value = '';
    }
  };

  async function handleDelete(fileId: string) {
    try {
      const res = await fetch(`/api/upload?id=${fileId}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        setMessage({ type: 'success', text: 'File deleted successfully.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to delete file.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete file.' });
    }
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
      title="Upload Data"
      subtitle="Upload financial data files for analysis"
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

      {/* Data Type Selector */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Data Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select the type of data you are uploading
            </label>
            <Select
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              options={DATA_TYPE_OPTIONS}
            />
          </div>
        </CardContent>
      </Card>

      {/* Drag and Drop Zone */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
              dragOver
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-300 hover:border-gray-400'
            } ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xls,.xlsx,.pdf"
              multiple
              onChange={handleFileSelect}
            />
            <div className="rounded-full bg-gray-100 p-4 mb-4">
              <FileUp className="h-8 w-8 text-gray-500" />
            </div>
            <p className="text-base font-medium text-gray-900 mb-1">
              {dragOver ? 'Drop files here' : 'Drag and drop files here'}
            </p>
            <p className="text-sm text-gray-500 mb-4">or click to browse</p>
            <p className="text-xs text-gray-400">
              Accepted formats: CSV, Excel (.xls, .xlsx), PDF
            </p>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">Uploading...</span>
                <span className="text-gray-500">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} color="#1f2937" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Previously Uploaded Files */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Uploaded Files</CardTitle>
            <Badge variant="secondary">{files.length} file{files.length !== 1 ? 's' : ''}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading files...</div>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Upload className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">No files uploaded yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Upload trial balances, journal entries, financial statements, or tax returns to begin analysis.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Data Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{file.fileName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatDataType(file.dataType)}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatFileSize(file.fileSize)}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {file.rowCount != null ? file.rowCount.toLocaleString() : '--'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          file.status === 'processed'
                            ? 'success'
                            : file.status === 'error'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {file.status === 'processed' ? 'Processed' : file.status === 'error' ? 'Error' : 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file.id)}
                        title="Delete file"
                      >
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Supported File Formats</p>
              <ul className="text-sm text-gray-500 space-y-1">
                <li><strong>CSV</strong> -- Trial balance exports, journal entry listings, chart of accounts</li>
                <li><strong>Excel (.xlsx/.xls)</strong> -- Financial statements, tax workpapers, supporting schedules</li>
                <li><strong>PDF</strong> -- Tax returns, audit reports, engagement letters</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
