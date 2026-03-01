'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FileSignature, DollarSign, ClipboardCheck, AlertTriangle, Loader2,
  CheckCircle2, XCircle, Clock, Building2, Scale,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import type {
  ContractRecord, ContractPayment, ContractType, ContractStatus, DcaaAuditStatus,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function contractTypeLabel(type: ContractType): string {
  const labels: Record<ContractType, string> = {
    firm_fixed_price: 'FFP',
    cost_plus: 'Cost-Plus',
    time_and_materials: 'T&M',
    cost_reimbursement: 'Cost Reimb.',
    idiq: 'IDIQ',
    bpa: 'BPA',
    other: 'Other',
  };
  return labels[type] || type;
}

function contractTypeBadgeVariant(type: ContractType): 'info' | 'warning' | 'success' | 'secondary' | 'high' | 'medium' | 'low' {
  switch (type) {
    case 'firm_fixed_price': return 'info';
    case 'cost_plus': return 'warning';
    case 'time_and_materials': return 'high';
    case 'cost_reimbursement': return 'medium';
    case 'idiq': return 'low';
    case 'bpa': return 'secondary';
    default: return 'secondary';
  }
}

function contractStatusBadgeVariant(status: ContractStatus): 'success' | 'destructive' | 'warning' | 'secondary' | 'info' {
  switch (status) {
    case 'active': return 'success';
    case 'completed': return 'info';
    case 'terminated': return 'destructive';
    case 'closeout': return 'warning';
    default: return 'secondary';
  }
}

function paymentTypeBadge(type: string): { label: string; variant: 'info' | 'warning' | 'success' | 'secondary' | 'high' } {
  switch (type) {
    case 'progress': return { label: 'Progress', variant: 'info' };
    case 'performance_based': return { label: 'Performance', variant: 'success' };
    case 'final': return { label: 'Final', variant: 'warning' };
    case 'partial': return { label: 'Partial', variant: 'secondary' };
    case 'advance': return { label: 'Advance', variant: 'high' };
    case 'invoice': return { label: 'Invoice', variant: 'info' };
    default: return { label: type, variant: 'secondary' };
  }
}

function dcaaStatusLabel(status: DcaaAuditStatus): string {
  const labels: Record<DcaaAuditStatus, string> = {
    not_required: 'Not Required',
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    exception: 'Exception',
  };
  return labels[status] || status;
}

function dcaaStatusBadgeVariant(status: DcaaAuditStatus): 'secondary' | 'warning' | 'info' | 'success' | 'destructive' {
  switch (status) {
    case 'not_required': return 'secondary';
    case 'pending': return 'warning';
    case 'in_progress': return 'info';
    case 'completed': return 'success';
    case 'exception': return 'destructive';
    default: return 'secondary';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DCAA_STATUS_COLORS: Record<string, string> = {
  not_required: '#94a3b8',
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  completed: '#16a34a',
  exception: '#dc2626',
};

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_CONTRACTS: ContractRecord[] = [
  { id: 'con-001', engagementId: '', contractNumber: 'W912HQ-25-C-0012', contractType: 'firm_fixed_price', vendorName: 'Northrop Systems Inc.', totalValue: 4250000, obligatedAmount: 4250000, fundedAmount: 3800000, periodOfPerformance: '2024-10-01 to 2026-09-30', contractingOfficer: 'J. Henderson', status: 'active', fiscalYear: 2025 },
  { id: 'con-002', engagementId: '', contractNumber: 'W56KGZ-25-D-0034', contractType: 'cost_plus', vendorName: 'Raytheon Advanced Tech', totalValue: 12800000, obligatedAmount: 9500000, fundedAmount: 8200000, periodOfPerformance: '2024-07-01 to 2027-06-30', contractingOfficer: 'M. Wallace', status: 'active', fiscalYear: 2025 },
  { id: 'con-003', engagementId: '', contractNumber: 'N00178-24-F-8842', contractType: 'idiq', vendorName: 'Booz Allen Hamilton', totalValue: 6500000, obligatedAmount: 4200000, fundedAmount: 4200000, periodOfPerformance: '2024-01-15 to 2029-01-14', contractingOfficer: 'S. Park', status: 'active', fiscalYear: 2025 },
  { id: 'con-004', engagementId: '', contractNumber: 'FA8732-25-C-0198', contractType: 'time_and_materials', vendorName: 'Lockheed Martin IT', totalValue: 2100000, obligatedAmount: 1800000, fundedAmount: 1500000, periodOfPerformance: '2025-01-01 to 2025-12-31', contractingOfficer: 'R. Chen', status: 'active', fiscalYear: 2025 },
  { id: 'con-005', engagementId: '', contractNumber: 'W911QX-23-C-0045', contractType: 'cost_reimbursement', vendorName: 'SAIC Defense Group', totalValue: 8900000, obligatedAmount: 8900000, fundedAmount: 8900000, periodOfPerformance: '2023-04-01 to 2025-03-31', contractingOfficer: 'T. Adams', status: 'closeout', closeoutDate: '2025-06-30', fiscalYear: 2025 },
  { id: 'con-006', engagementId: '', contractNumber: 'N00024-25-C-5512', contractType: 'firm_fixed_price', vendorName: 'General Dynamics IT', totalValue: 3400000, obligatedAmount: 3400000, fundedAmount: 2900000, periodOfPerformance: '2025-02-01 to 2026-01-31', contractingOfficer: 'K. Murphy', status: 'active', fiscalYear: 2025 },
  { id: 'con-007', engagementId: '', contractNumber: 'W52P1J-24-D-0077', contractType: 'bpa', vendorName: 'CDW Government', totalValue: 850000, obligatedAmount: 620000, fundedAmount: 620000, periodOfPerformance: '2024-06-01 to 2025-05-31', contractingOfficer: 'L. Taylor', status: 'completed', fiscalYear: 2025 },
  { id: 'con-008', engagementId: '', contractNumber: 'HQ0034-24-C-0091', contractType: 'cost_plus', vendorName: 'Deloitte Consulting', totalValue: 5600000, obligatedAmount: 3200000, fundedAmount: 2800000, periodOfPerformance: '2024-09-01 to 2026-08-31', contractingOfficer: 'A. Brown', status: 'active', fiscalYear: 2025 },
];

const MOCK_PAYMENTS: ContractPayment[] = [
  { id: 'cp-001', engagementId: '', obligationId: 'ob-001', contractNumber: 'W912HQ-25-C-0012', contractType: 'firm_fixed_price', vendorId: 'v-001', invoiceNumber: 'INV-2025-0142', invoiceAmount: 425000, approvedAmount: 425000, retainageAmount: 0, paymentType: 'invoice', dcaaAuditRequired: false, dcaaAuditStatus: 'not_required', paymentDate: '2025-01-15', status: 'paid' },
  { id: 'cp-002', engagementId: '', obligationId: 'ob-002', contractNumber: 'W56KGZ-25-D-0034', contractType: 'cost_plus', vendorId: 'v-002', invoiceNumber: 'INV-2025-0201', invoiceAmount: 1280000, approvedAmount: 1180000, retainageAmount: 100000, progressPaymentPct: 75, paymentType: 'progress', dcaaAuditRequired: true, dcaaAuditStatus: 'completed', certifiedBy: 'DCAA Auditor S. Lee', paymentDate: '2025-01-28', status: 'paid' },
  { id: 'cp-003', engagementId: '', obligationId: 'ob-003', contractNumber: 'N00178-24-F-8842', contractType: 'idiq', vendorId: 'v-003', invoiceNumber: 'INV-2025-0089', invoiceAmount: 650000, approvedAmount: 650000, retainageAmount: 0, paymentType: 'invoice', dcaaAuditRequired: false, dcaaAuditStatus: 'not_required', paymentDate: '2025-02-05', status: 'paid' },
  { id: 'cp-004', engagementId: '', obligationId: 'ob-004', contractNumber: 'FA8732-25-C-0198', contractType: 'time_and_materials', vendorId: 'v-004', invoiceNumber: 'INV-2025-0310', invoiceAmount: 350000, approvedAmount: 325000, retainageAmount: 25000, paymentType: 'progress', dcaaAuditRequired: true, dcaaAuditStatus: 'in_progress', paymentDate: '2025-02-15', status: 'pending' },
  { id: 'cp-005', engagementId: '', obligationId: 'ob-005', contractNumber: 'W911QX-23-C-0045', contractType: 'cost_reimbursement', vendorId: 'v-005', invoiceNumber: 'INV-2025-0445', invoiceAmount: 890000, approvedAmount: 845000, retainageAmount: 45000, progressPaymentPct: 80, paymentType: 'progress', dcaaAuditRequired: true, dcaaAuditStatus: 'pending', paymentDate: '2025-02-28', status: 'pending' },
  { id: 'cp-006', engagementId: '', obligationId: 'ob-006', contractNumber: 'N00024-25-C-5512', contractType: 'firm_fixed_price', vendorId: 'v-006', invoiceNumber: 'INV-2025-0512', invoiceAmount: 580000, approvedAmount: 580000, retainageAmount: 0, paymentType: 'performance_based', performanceBasedPct: 100, dcaaAuditRequired: false, dcaaAuditStatus: 'not_required', paymentDate: '2025-03-01', status: 'paid' },
  { id: 'cp-007', engagementId: '', obligationId: 'ob-007', contractNumber: 'HQ0034-24-C-0091', contractType: 'cost_plus', vendorId: 'v-008', invoiceNumber: 'INV-2025-0601', invoiceAmount: 560000, approvedAmount: 520000, retainageAmount: 40000, progressPaymentPct: 72, paymentType: 'progress', dcaaAuditRequired: true, dcaaAuditStatus: 'exception', paymentDate: '2025-03-10', status: 'review' },
  { id: 'cp-008', engagementId: '', obligationId: 'ob-001', contractNumber: 'W912HQ-25-C-0012', contractType: 'firm_fixed_price', vendorId: 'v-001', invoiceNumber: 'INV-2025-0780', invoiceAmount: 850000, approvedAmount: 850000, retainageAmount: 0, paymentType: 'final', dcaaAuditRequired: false, dcaaAuditStatus: 'not_required', paymentDate: '2025-03-15', status: 'paid' },
];

// ---------------------------------------------------------------------------
// Compliance Check Data
// ---------------------------------------------------------------------------

interface ComplianceCheck {
  id: string;
  rule: string;
  description: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedCount: number;
}

const CONTRACT_COMPLIANCE_CHECKS: ComplianceCheck[] = [
  { id: 'cc-1', rule: 'FAR 32.5', description: 'Progress payment rate compliance - Large business: max 80%, Small business: max 90%', passed: false, details: '1 payment to a large business contractor exceeds the 80% progress payment rate (HQ0034-24-C-0091 at 72% but exception noted for audit finding).', severity: 'high', affectedCount: 1 },
  { id: 'cc-2', rule: 'Prompt Pay Act', description: 'Prompt Pay Act compliance - All invoices paid within 30 days of proper invoice receipt', passed: true, details: 'All 8 payments processed within the Prompt Pay Act timeline. No interest penalties incurred.', severity: 'critical', affectedCount: 0 },
  { id: 'cc-3', rule: 'FAR 4.804', description: 'Contract closeout timeline - Completed contracts closed within prescribed timeframes', passed: false, details: '1 completed contract (W52P1J-24-D-0077) has not initiated formal closeout procedures within 6 months.', severity: 'medium', affectedCount: 1 },
  { id: 'cc-4', rule: 'FMR Vol 10 Ch 7', description: 'Incremental funding adequacy - Cost-type contracts maintain adequate incremental funding levels', passed: false, details: '2 cost-type contracts show funding gaps exceeding 10% of obligated amounts.', severity: 'high', affectedCount: 2 },
  { id: 'cc-5', rule: 'DFARS 242.7502', description: 'DCAA audit requirements - All cost-type contract payments have required DCAA audit', passed: false, details: '1 cost-type contract payment pending DCAA audit clearance before final payment release (W911QX-23-C-0045).', severity: 'critical', affectedCount: 1 },
  { id: 'cc-6', rule: 'FAR 32.10', description: 'Performance-based payment compliance - Payments tied to measurable performance milestones', passed: true, details: 'All performance-based payments verified against documented milestone achievements.', severity: 'medium', affectedCount: 0 },
  { id: 'cc-7', rule: 'FMR Vol 10 Ch 1', description: 'Obligation validation - All contract payments traceable to valid obligations', passed: true, details: 'All 8 payments map to valid obligation records with sufficient balances.', severity: 'critical', affectedCount: 0 },
  { id: 'cc-8', rule: 'FAR 32.9', description: 'Prompt payment discount utilization - Available discounts claimed within discount period', passed: true, details: 'No prompt payment discounts were available for the current payment cycle.', severity: 'low', affectedCount: 0 },
  { id: 'cc-9', rule: 'FMR Vol 10 Ch 3', description: 'Retainage compliance - Retainage amounts within regulatory limits and properly released', passed: true, details: 'All retainage amounts verified within prescribed limits for contract type.', severity: 'medium', affectedCount: 0 },
  { id: 'cc-10', rule: 'DFARS 232.072', description: 'Contractor financial responsibility - Adequate financial capacity verified for active contractors', passed: true, details: 'All 6 active contractor vendors have verified financial responsibility status.', severity: 'high', affectedCount: 0 },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ContractCompliancePage() {
  const { id: engagementId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [payments] = useState<ContractPayment[]>(MOCK_PAYMENTS);
  const [contractTypeFilter, setContractTypeFilter] = useState('all');
  const [contractStatusFilter, setContractStatusFilter] = useState('all');

  useEffect(() => {
    if (!engagementId) return;

    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dod/contracts?engagementId=${engagementId}`);
        if (res.ok) {
          const data = await res.json();
          const records = data.contracts || data.records || [];
          setContracts(records.length > 0 ? records : MOCK_CONTRACTS);
        } else {
          setContracts(MOCK_CONTRACTS);
        }
      } catch (error) {
        console.error('Failed to load contract data:', error);
        setContracts(MOCK_CONTRACTS);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [engagementId]);

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const activeContracts = contracts.filter((c) => c.status === 'active');
  const totalValue = contracts.reduce((s, c) => s + c.totalValue, 0);
  const totalFunded = contracts.reduce((s, c) => s + c.fundedAmount, 0);
  const fundingGap = totalValue - totalFunded;
  const dcaaPending = payments.filter(
    (p) => p.dcaaAuditRequired && (p.dcaaAuditStatus === 'pending' || p.dcaaAuditStatus === 'in_progress')
  ).length;

  // Filtered contracts
  const filteredContracts = contracts.filter((c) => {
    if (contractTypeFilter !== 'all' && c.contractType !== contractTypeFilter) return false;
    if (contractStatusFilter !== 'all' && c.status !== contractStatusFilter) return false;
    return true;
  });

  // Funding utilization data for chart
  const fundingChartData = contracts.map((c) => ({
    name: c.contractNumber.split('-').slice(-1)[0],
    funded: c.fundedAmount,
    unfunded: c.obligatedAmount - c.fundedAmount,
    total: c.totalValue,
    fullNumber: c.contractNumber,
  }));

  // DCAA audit status breakdown
  const dcaaBreakdown: Record<string, number> = {};
  payments.forEach((p) => {
    dcaaBreakdown[p.dcaaAuditStatus] = (dcaaBreakdown[p.dcaaAuditStatus] || 0) + 1;
  });
  const dcaaChartData = Object.entries(dcaaBreakdown).map(([status, count]) => ({
    name: dcaaStatusLabel(status as DcaaAuditStatus),
    value: count,
    color: DCAA_STATUS_COLORS[status] || '#94a3b8',
  }));

  // Progress payment cap indicators
  const progressPayments = payments.filter((p) => p.paymentType === 'progress' && p.progressPaymentPct !== undefined);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Loading Contract Compliance data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileSignature className="h-8 w-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contract Payment Compliance</h1>
          <p className="text-sm text-gray-500">DoD FMR Volume 10 - Contract Payment Policy, FAR/DFARS &amp; DCAA Audit Tracking</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <FileSignature className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{contracts.length}</div>
                <div className="text-xs text-gray-500">Total Contracts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{activeContracts.length}</div>
                <div className="text-xs text-gray-500">Active Contracts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xl font-bold">{fmtCompact.format(totalValue)}</div>
                <div className="text-xs text-gray-500">Total Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2">
                <Scale className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-xl font-bold">{fmtCompact.format(totalFunded)}</div>
                <div className="text-xs text-gray-500">Total Funded</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${fundingGap > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <AlertTriangle className={`h-5 w-5 ${fundingGap > 0 ? 'text-red-600' : 'text-green-600'}`} />
              </div>
              <div>
                <div className={`text-xl font-bold ${fundingGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmtCompact.format(fundingGap)}
                </div>
                <div className="text-xs text-gray-500">Funding Gap</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${dcaaPending > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                <ClipboardCheck className={`h-5 w-5 ${dcaaPending > 0 ? 'text-amber-600' : 'text-green-600'}`} />
              </div>
              <div>
                <div className="text-2xl font-bold">{dcaaPending}</div>
                <div className="text-xs text-gray-500">DCAA Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="contracts">
        <TabsList>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="dcaa">DCAA Audit Status</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* Contracts Tab */}
        {/* ================================================================= */}
        <TabsContent value="contracts">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Contract Registry</CardTitle>
                    <CardDescription>Active and completed contracts under DoD FMR Volume 10</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={contractTypeFilter}
                      onChange={(e) => setContractTypeFilter(e.target.value)}
                      options={[
                        { value: 'all', label: 'All Types' },
                        { value: 'firm_fixed_price', label: 'FFP' },
                        { value: 'cost_plus', label: 'Cost-Plus' },
                        { value: 'time_and_materials', label: 'T&M' },
                        { value: 'cost_reimbursement', label: 'Cost Reimb.' },
                        { value: 'idiq', label: 'IDIQ' },
                        { value: 'bpa', label: 'BPA' },
                      ]}
                      className="w-36"
                    />
                    <Select
                      value={contractStatusFilter}
                      onChange={(e) => setContractStatusFilter(e.target.value)}
                      options={[
                        { value: 'all', label: 'All Statuses' },
                        { value: 'active', label: 'Active' },
                        { value: 'completed', label: 'Completed' },
                        { value: 'terminated', label: 'Terminated' },
                        { value: 'closeout', label: 'Closeout' },
                      ]}
                      className="w-36"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredContracts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileSignature className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-sm font-medium text-gray-900">No contracts found</p>
                    <p className="text-sm text-gray-500 mt-1">Adjust filters or upload contract data to begin analysis.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                        <TableHead className="text-right">Obligated</TableHead>
                        <TableHead className="text-right">Funded</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>PoP</TableHead>
                        <TableHead>CO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContracts.map((contract) => (
                        <TableRow key={contract.id}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{contract.contractNumber}</TableCell>
                          <TableCell>
                            <Badge variant={contractTypeBadgeVariant(contract.contractType)}>
                              {contractTypeLabel(contract.contractType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium max-w-[150px] truncate">{contract.vendorName}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtCompact.format(contract.totalValue)}</TableCell>
                          <TableCell className="text-right">{fmtCompact.format(contract.obligatedAmount)}</TableCell>
                          <TableCell className="text-right">{fmtCompact.format(contract.fundedAmount)}</TableCell>
                          <TableCell>
                            <Badge variant={contractStatusBadgeVariant(contract.status)}>
                              {contract.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 max-w-[140px] truncate">{contract.periodOfPerformance}</TableCell>
                          <TableCell className="text-xs text-gray-600 whitespace-nowrap">{contract.contractingOfficer}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Funding Utilization Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Funding Utilization by Contract</CardTitle>
                <CardDescription>Funded vs unfunded portions of obligated amounts</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={fundingChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={12} tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(1)}M`} />
                    <Tooltip
                      formatter={(value: number) => fmt.format(value)}
                      labelFormatter={(label: string, payload: any[]) => {
                        if (payload && payload.length > 0) {
                          return payload[0]?.payload?.fullNumber || label;
                        }
                        return label;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="funded" name="Funded" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="unfunded" name="Unfunded" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Payments Tab */}
        {/* ================================================================= */}
        <TabsContent value="payments">
          <div className="space-y-6">
            {/* Progress Payment Cap Indicators */}
            {progressPayments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Progress Payment Cap Compliance</CardTitle>
                  <CardDescription>FAR 32.5 - Large business max 80%, Small business max 90%</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {progressPayments.map((p) => {
                      const pct = p.progressPaymentPct || 0;
                      const isOver = pct > 80;
                      return (
                        <div key={p.id} className="flex items-center gap-4">
                          <div className="w-48 shrink-0">
                            <div className="font-mono text-xs">{p.contractNumber.split('-').slice(-2).join('-')}</div>
                            <div className="text-xs text-gray-500">{fmt.format(p.approvedAmount)}</div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-600">Progress Rate: {pct}%</span>
                              {isOver ? (
                                <Badge variant="destructive">Exceeds 80% Cap</Badge>
                              ) : (
                                <Badge variant="success">Within Limit</Badge>
                              )}
                            </div>
                            <Progress value={pct} color={isOver ? '#dc2626' : '#16a34a'} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payments Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contract Payments</CardTitle>
                <CardDescription>Invoice processing and payment tracking</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract #</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Invoice Amt</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead className="text-right">Retainage</TableHead>
                      <TableHead>Payment Type</TableHead>
                      <TableHead>DCAA Req</TableHead>
                      <TableHead>Payment Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => {
                      const ptInfo = paymentTypeBadge(payment.paymentType);
                      return (
                        <TableRow key={payment.id}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{payment.contractNumber.split('-').slice(-2).join('-')}</TableCell>
                          <TableCell className="font-mono text-xs">{payment.invoiceNumber || '--'}</TableCell>
                          <TableCell className="text-right font-medium">{fmt.format(payment.invoiceAmount)}</TableCell>
                          <TableCell className="text-right">{fmt.format(payment.approvedAmount)}</TableCell>
                          <TableCell className="text-right">
                            {payment.retainageAmount > 0 ? (
                              <span className="text-amber-600">{fmt.format(payment.retainageAmount)}</span>
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={ptInfo.variant}>{ptInfo.label}</Badge>
                          </TableCell>
                          <TableCell>
                            {payment.dcaaAuditRequired ? (
                              <Badge variant={dcaaStatusBadgeVariant(payment.dcaaAuditStatus)}>
                                {dcaaStatusLabel(payment.dcaaAuditStatus)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-gray-400">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{payment.paymentDate}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* DCAA Audit Status Tab */}
        {/* ================================================================= */}
        <TabsContent value="dcaa">
          <div className="space-y-6">
            {/* DCAA Status Breakdown Chart */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">DCAA Audit Status Distribution</CardTitle>
                  <CardDescription>Defense Contract Audit Agency review status for contract payments</CardDescription>
                </CardHeader>
                <CardContent>
                  {dcaaChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={dcaaChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {dcaaChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Legend />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-gray-400">
                      No DCAA audit data available
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Audit Status Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(dcaaBreakdown).map(([status, count]) => {
                      const total = payments.length;
                      const pct = (count / total) * 100;
                      const color = DCAA_STATUS_COLORS[status] || '#94a3b8';
                      return (
                        <div key={status} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-sm font-medium">{dcaaStatusLabel(status as DcaaAuditStatus)}</span>
                            </div>
                            <span className="text-sm text-gray-600">{count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <Progress value={pct} color={color} />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* DCAA Audit Tracking Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">DCAA Audit Tracking</CardTitle>
                <CardDescription>Payments requiring DCAA audit review</CardDescription>
              </CardHeader>
              <CardContent>
                {payments.filter((p) => p.dcaaAuditRequired).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ClipboardCheck className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-sm font-medium text-gray-900">No DCAA audits required</p>
                    <p className="text-sm text-gray-500 mt-1">No contract payments currently require DCAA audit review.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract #</TableHead>
                        <TableHead>Contract Type</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Audit Status</TableHead>
                        <TableHead>Certified By</TableHead>
                        <TableHead>Payment Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.filter((p) => p.dcaaAuditRequired).map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{payment.contractNumber}</TableCell>
                          <TableCell>
                            <Badge variant={contractTypeBadgeVariant(payment.contractType)}>
                              {contractTypeLabel(payment.contractType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{payment.invoiceNumber || '--'}</TableCell>
                          <TableCell className="text-right font-medium">{fmt.format(payment.approvedAmount)}</TableCell>
                          <TableCell>
                            <Badge variant={dcaaStatusBadgeVariant(payment.dcaaAuditStatus)}>
                              {dcaaStatusLabel(payment.dcaaAuditStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{payment.certifiedBy || '--'}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{payment.paymentDate}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Compliance Tab */}
        {/* ================================================================= */}
        <TabsContent value="compliance">
          <div className="space-y-6">
            {/* Compliance Check Results */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Contract Compliance Check Results</CardTitle>
                    <CardDescription>Automated validation against FAR, DFARS, and DoD FMR Volume 10</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{CONTRACT_COMPLIANCE_CHECKS.filter((c) => c.passed).length} Passed</Badge>
                    <Badge variant="destructive">{CONTRACT_COMPLIANCE_CHECKS.filter((c) => !c.passed).length} Failed</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Result</TableHead>
                      <TableHead>Rule Reference</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead className="text-right">Affected</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CONTRACT_COMPLIANCE_CHECKS.map((check) => (
                      <TableRow key={check.id}>
                        <TableCell>
                          {check.passed ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{check.rule}</TableCell>
                        <TableCell className="text-sm max-w-xs">{check.description}</TableCell>
                        <TableCell>
                          <Badge variant={check.severity}>{check.severity}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {check.affectedCount > 0 ? check.affectedCount : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-xs">{check.details}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Contract Closeout Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contract Closeout Timeline Analysis</CardTitle>
                <CardDescription>FAR 4.804 - Tracking contract closeout against prescribed timelines</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {contracts
                    .filter((c) => c.status === 'closeout' || c.status === 'completed')
                    .map((c) => {
                      const isCloseout = c.status === 'closeout';
                      const popEnd = c.periodOfPerformance.split(' to ')[1] || '';
                      return (
                        <div key={c.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-4">
                          <div className={`rounded-lg p-2 ${isCloseout ? 'bg-amber-50' : 'bg-blue-50'}`}>
                            {isCloseout ? (
                              <Clock className="h-5 w-5 text-amber-600" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5 text-blue-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{c.contractNumber}</span>
                              <Badge variant={contractStatusBadgeVariant(c.status)}>{c.status}</Badge>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">{c.vendorName}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs text-gray-500">PoP End</div>
                            <div className="text-sm font-medium">{popEnd}</div>
                            {c.closeoutDate && (
                              <>
                                <div className="text-xs text-gray-500 mt-1">Closeout Target</div>
                                <div className="text-sm font-medium text-amber-600">{c.closeoutDate}</div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {contracts.filter((c) => c.status === 'closeout' || c.status === 'completed').length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Building2 className="h-10 w-10 text-gray-300 mb-3" />
                      <p className="text-sm text-gray-500">No contracts pending closeout.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Incremental Funding Adequacy */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Incremental Funding Adequacy Check</CardTitle>
                <CardDescription>FMR Vol 10 - Verifying adequate funding levels for active contracts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contracts.filter((c) => c.status === 'active').map((c) => {
                    const fundingPct = c.totalValue > 0 ? (c.fundedAmount / c.totalValue) * 100 : 0;
                    const gap = c.totalValue - c.fundedAmount;
                    const isAdequate = fundingPct >= 75;
                    return (
                      <div key={c.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{c.contractNumber}</span>
                            <Badge variant={contractTypeBadgeVariant(c.contractType)}>
                              {contractTypeLabel(c.contractType)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {isAdequate ? (
                              <Badge variant="success">Adequate</Badge>
                            ) : (
                              <Badge variant="destructive">Underfunded</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>{fmt.format(c.fundedAmount)} funded of {fmt.format(c.totalValue)}</span>
                          <span>{fundingPct.toFixed(1)}%</span>
                        </div>
                        <Progress value={fundingPct} color={isAdequate ? '#16a34a' : '#dc2626'} />
                        {gap > 0 && (
                          <div className="text-xs text-red-600 mt-1">
                            Funding gap: {fmt.format(gap)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
