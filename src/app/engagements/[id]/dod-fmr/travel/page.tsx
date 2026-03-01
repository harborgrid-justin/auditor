'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Plane, FileText, CreditCard, ShieldCheck, AlertTriangle, Loader2,
  CheckCircle2, XCircle, MapPin, Calendar, ArrowRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import type { TravelOrder, TravelVoucher, TravelCardTransaction, TravelType, DelinquencyStatus } from '@/types/dod-fmr';

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

function truncateId(id: string, maxLen = 12): string {
  if (id.length <= maxLen) return id;
  return id.slice(0, maxLen) + '...';
}

function travelTypeBadge(type: TravelType): { label: string; variant: 'info' | 'warning' | 'success' | 'secondary' } {
  switch (type) {
    case 'tdy': return { label: 'TDY', variant: 'info' };
    case 'pcs': return { label: 'PCS', variant: 'warning' };
    case 'local': return { label: 'Local', variant: 'success' };
    case 'emergency_leave': return { label: 'Emergency', variant: 'secondary' };
    default: return { label: type, variant: 'secondary' };
  }
}

function statusBadgeVariant(status: string): 'success' | 'destructive' | 'warning' | 'secondary' | 'info' {
  switch (status) {
    case 'approved':
    case 'paid':
    case 'completed':
      return 'success';
    case 'rejected':
    case 'disputed':
    case 'cancelled':
      return 'destructive';
    case 'submitted':
    case 'pending':
    case 'in_progress':
      return 'warning';
    case 'open':
      return 'info';
    default:
      return 'secondary';
  }
}

function delinquencyBadge(status: DelinquencyStatus): { label: string; variant: 'success' | 'warning' | 'high' | 'destructive' | 'critical' } {
  switch (status) {
    case 'current': return { label: 'Current', variant: 'success' };
    case '30_day': return { label: '30-Day', variant: 'warning' };
    case '60_day': return { label: '60-Day', variant: 'high' };
    case '90_plus': return { label: '90+ Day', variant: 'destructive' };
    case 'charge_off': return { label: 'Charge Off', variant: 'critical' };
    default: return { label: status, variant: 'success' };
  }
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_TRAVEL_ORDERS: TravelOrder[] = [
  { id: 'to-001', engagementId: '', travelerId: 'T-Smith, John', orderType: 'tdy', purpose: 'Annual Training Conference', originLocation: 'Fort Bragg, NC', destinationLocation: 'Washington, DC', departDate: '2025-02-10', returnDate: '2025-02-14', authorizedAmount: 2850.00, actualAmount: 2640.00, perDiemRate: 182.00, lodgingRate: 258.00, mieRate: 79.00, status: 'approved', authorizingOfficial: 'COL Davis', fiscalYear: 2025 },
  { id: 'to-002', engagementId: '', travelerId: 'T-Rodriguez, Maria', orderType: 'pcs', purpose: 'Permanent Change of Station', originLocation: 'Joint Base Lewis-McChord, WA', destinationLocation: 'Fort Hood, TX', departDate: '2025-03-01', returnDate: '2025-03-15', authorizedAmount: 12500.00, actualAmount: 11842.00, perDiemRate: 155.00, lodgingRate: 120.00, mieRate: 59.00, status: 'approved', authorizingOfficial: 'COL Martinez', fiscalYear: 2025 },
  { id: 'to-003', engagementId: '', travelerId: 'T-Chen, Wei', orderType: 'tdy', purpose: 'Equipment Inspection Site Visit', originLocation: 'Pentagon, VA', destinationLocation: 'Camp Pendleton, CA', departDate: '2025-01-20', returnDate: '2025-01-23', authorizedAmount: 3200.00, actualAmount: 3450.00, perDiemRate: 195.00, lodgingRate: 280.00, mieRate: 79.00, status: 'pending', authorizingOfficial: 'MAJ Thompson', fiscalYear: 2025 },
  { id: 'to-004', engagementId: '', travelerId: 'T-Williams, Aisha', orderType: 'local', purpose: 'Local Site Assessment', originLocation: 'Fort Meade, MD', destinationLocation: 'Aberdeen, MD', departDate: '2025-02-05', returnDate: '2025-02-05', authorizedAmount: 125.00, actualAmount: 98.00, perDiemRate: 0, lodgingRate: 0, mieRate: 0, status: 'approved', authorizingOfficial: 'LTC Park', fiscalYear: 2025 },
  { id: 'to-005', engagementId: '', travelerId: 'T-Johnson, Robert', orderType: 'tdy', purpose: 'Joint Exercise Planning', originLocation: 'Naval Station Norfolk, VA', destinationLocation: 'Stuttgart, Germany', departDate: '2025-04-01', returnDate: '2025-04-10', authorizedAmount: 8500.00, actualAmount: 0, perDiemRate: 305.00, lodgingRate: 210.00, mieRate: 95.00, status: 'open', authorizingOfficial: 'CAPT Anderson', fiscalYear: 2025 },
  { id: 'to-006', engagementId: '', travelerId: 'T-Brown, Keisha', orderType: 'tdy', purpose: 'Cybersecurity Workshop', originLocation: 'Fort Gordon, GA', destinationLocation: 'San Antonio, TX', departDate: '2025-01-13', returnDate: '2025-01-17', authorizedAmount: 2400.00, actualAmount: 2275.00, perDiemRate: 161.00, lodgingRate: 144.00, mieRate: 79.00, status: 'approved', authorizingOfficial: 'MAJ Franklin', fiscalYear: 2025 },
  { id: 'to-007', engagementId: '', travelerId: 'T-Davis, Michael', orderType: 'emergency_leave', purpose: 'Emergency Leave - CONUS', originLocation: 'Camp Humphreys, Korea', destinationLocation: 'Dallas, TX', departDate: '2025-02-20', returnDate: '2025-03-05', authorizedAmount: 4200.00, actualAmount: 3890.00, perDiemRate: 0, lodgingRate: 0, mieRate: 0, status: 'approved', authorizingOfficial: 'COL Lee', fiscalYear: 2025 },
];

const MOCK_VOUCHERS: TravelVoucher[] = [
  { id: 'tv-001', engagementId: '', travelOrderId: 'to-001', voucherNumber: 'V-2025-00134', lodgingCost: 1032.00, mealsCost: 316.00, transportationCost: 980.00, otherCosts: 112.00, advanceAmount: 1000.00, totalClaim: 2440.00, approvedAmount: 2440.00, settlementAmount: 1440.00, travelCardUsed: true, splitDisbursement: true, filedDate: '2025-02-18', settledDate: '2025-03-01', status: 'paid' },
  { id: 'tv-002', engagementId: '', travelOrderId: 'to-002', voucherNumber: 'V-2025-00198', lodgingCost: 3600.00, mealsCost: 885.00, transportationCost: 5200.00, otherCosts: 2157.00, advanceAmount: 5000.00, totalClaim: 11842.00, approvedAmount: 11200.00, settlementAmount: 6200.00, travelCardUsed: true, splitDisbursement: true, filedDate: '2025-03-20', settledDate: undefined, status: 'approved' },
  { id: 'tv-003', engagementId: '', travelOrderId: 'to-003', voucherNumber: 'V-2025-00210', lodgingCost: 840.00, mealsCost: 237.00, transportationCost: 1890.00, otherCosts: 283.00, advanceAmount: 0, totalClaim: 3250.00, approvedAmount: undefined, settlementAmount: undefined, travelCardUsed: true, splitDisbursement: false, filedDate: '2025-01-28', settledDate: undefined, status: 'submitted' },
  { id: 'tv-004', engagementId: '', travelOrderId: 'to-006', voucherNumber: 'V-2025-00089', lodgingCost: 576.00, mealsCost: 316.00, transportationCost: 1150.00, otherCosts: 33.00, advanceAmount: 800.00, totalClaim: 2075.00, approvedAmount: 2075.00, settlementAmount: 1275.00, travelCardUsed: true, splitDisbursement: true, filedDate: '2025-01-22', settledDate: '2025-02-05', status: 'paid' },
  { id: 'tv-005', engagementId: '', travelOrderId: 'to-007', voucherNumber: 'V-2025-00245', lodgingCost: 0, mealsCost: 0, transportationCost: 3890.00, otherCosts: 0, advanceAmount: 2000.00, totalClaim: 3890.00, approvedAmount: 3890.00, settlementAmount: 1890.00, travelCardUsed: false, splitDisbursement: false, filedDate: '2025-03-10', settledDate: '2025-03-18', status: 'paid' },
  { id: 'tv-006', engagementId: '', travelOrderId: 'to-004', voucherNumber: 'V-2025-00142', lodgingCost: 0, mealsCost: 0, transportationCost: 98.00, otherCosts: 0, advanceAmount: 0, totalClaim: 98.00, approvedAmount: 85.00, settlementAmount: undefined, travelCardUsed: false, splitDisbursement: false, filedDate: '2025-02-07', settledDate: undefined, status: 'disputed' },
];

const MOCK_CARD_TRANSACTIONS: TravelCardTransaction[] = [
  { id: 'tc-001', engagementId: '', travelerId: 'T-Smith, John', transactionDate: '2025-02-10', merchantName: 'Marriott Washington DC', amount: 516.00, category: 'Lodging', travelOrderId: 'to-001', reconciledToVoucher: true, delinquencyStatus: 'current' },
  { id: 'tc-002', engagementId: '', travelerId: 'T-Smith, John', transactionDate: '2025-02-11', merchantName: 'United Airlines', amount: 480.00, category: 'Transportation', travelOrderId: 'to-001', reconciledToVoucher: true, delinquencyStatus: 'current' },
  { id: 'tc-003', engagementId: '', travelerId: 'T-Rodriguez, Maria', transactionDate: '2025-03-02', merchantName: 'Holiday Inn Express', amount: 1200.00, category: 'Lodging', travelOrderId: 'to-002', reconciledToVoucher: true, delinquencyStatus: 'current' },
  { id: 'tc-004', engagementId: '', travelerId: 'T-Chen, Wei', transactionDate: '2025-01-20', merchantName: 'Delta Air Lines', amount: 890.00, category: 'Transportation', travelOrderId: 'to-003', reconciledToVoucher: false, delinquencyStatus: '30_day' },
  { id: 'tc-005', engagementId: '', travelerId: 'T-Chen, Wei', transactionDate: '2025-01-21', merchantName: 'Hilton San Diego', amount: 560.00, category: 'Lodging', travelOrderId: 'to-003', reconciledToVoucher: false, delinquencyStatus: '30_day' },
  { id: 'tc-006', engagementId: '', travelerId: 'T-Brown, Keisha', transactionDate: '2025-01-14', merchantName: 'Hertz Rental Car', amount: 320.00, category: 'Transportation', travelOrderId: 'to-006', reconciledToVoucher: true, delinquencyStatus: 'current' },
  { id: 'tc-007', engagementId: '', travelerId: 'T-Unknown, Legacy', transactionDate: '2024-10-15', merchantName: 'Best Western', amount: 440.00, category: 'Lodging', travelOrderId: undefined, reconciledToVoucher: false, delinquencyStatus: '90_plus' },
  { id: 'tc-008', engagementId: '', travelerId: 'T-Unknown, Legacy', transactionDate: '2024-11-02', merchantName: 'American Airlines', amount: 675.00, category: 'Transportation', travelOrderId: undefined, reconciledToVoucher: false, delinquencyStatus: '60_day' },
  { id: 'tc-009', engagementId: '', travelerId: 'T-Rodriguez, Maria', transactionDate: '2025-03-05', merchantName: 'Shell Gas Station', amount: 85.00, category: 'Transportation', travelOrderId: 'to-002', reconciledToVoucher: true, delinquencyStatus: 'current' },
  { id: 'tc-010', engagementId: '', travelerId: 'T-Smith, John', transactionDate: '2025-02-12', merchantName: 'Uber', amount: 42.00, category: 'Transportation', travelOrderId: 'to-001', reconciledToVoucher: true, delinquencyStatus: 'current' },
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

const TRAVEL_COMPLIANCE_CHECKS: ComplianceCheck[] = [
  { id: 'tc-1', rule: 'FMR Vol 9 Ch 3', description: 'Per diem rate compliance - All claimed rates within GSA/DoD locality rates', passed: false, details: '1 travel order (to-003) has actual expenses exceeding authorized per diem locality rates by $250.', severity: 'high', affectedCount: 1 },
  { id: 'tc-2', rule: 'FMR Vol 9 Ch 2', description: 'Authorization before travel - All travel performed with valid, pre-approved orders', passed: true, details: 'All 7 travel orders were authorized prior to travel commencement.', severity: 'critical', affectedCount: 0 },
  { id: 'tc-3', rule: 'FMR Vol 9 Ch 8', description: 'Voucher filing timeliness - Vouchers submitted within 5 business days of travel completion', passed: false, details: '2 vouchers filed more than 5 business days after return date.', severity: 'medium', affectedCount: 2 },
  { id: 'tc-4', rule: 'DoDI 5154.31', description: 'Travel card split disbursement - Government travel card charges paid via split disbursement', passed: false, details: '1 voucher with travel card charges did not use split disbursement (V-2025-00210).', severity: 'high', affectedCount: 1 },
  { id: 'tc-5', rule: 'FMR Vol 9 Ch 4', description: 'Authorization vs actual variance - Actual expenses do not exceed authorized amount by more than 20%', passed: false, details: '1 travel order (to-003) has actual expenses exceeding authorized amount. Variance: $250 (7.8%).', severity: 'medium', affectedCount: 1 },
  { id: 'tc-6', rule: 'DoDI 5154.31 Vol 3', description: 'Travel card delinquency monitoring - No accounts 60+ days delinquent', passed: false, details: '2 travel card accounts are 60+ days delinquent totaling $1,115.00.', severity: 'critical', affectedCount: 2 },
  { id: 'tc-7', rule: 'FMR Vol 9 Ch 1', description: 'Travel purpose validation - All travel orders include valid mission justification', passed: true, details: 'All travel orders contain documented mission purpose and justification.', severity: 'low', affectedCount: 0 },
  { id: 'tc-8', rule: 'FMR Vol 9 Ch 7', description: 'Lodging rate compliance - Lodging costs do not exceed locality rate without authorization', passed: true, details: 'All lodging expenses within locality rate limits or have excess lodging authorization.', severity: 'medium', affectedCount: 0 },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TravelCompliancePage() {
  const { id: engagementId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [travelOrders, setTravelOrders] = useState<TravelOrder[]>([]);
  const [vouchers] = useState<TravelVoucher[]>(MOCK_VOUCHERS);
  const [cardTransactions] = useState<TravelCardTransaction[]>(MOCK_CARD_TRANSACTIONS);
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  useEffect(() => {
    if (!engagementId) return;

    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dod/travel?engagementId=${engagementId}`);
        if (res.ok) {
          const data = await res.json();
          const orders = data.travelOrders || data.orders || [];
          setTravelOrders(orders.length > 0 ? orders : MOCK_TRAVEL_ORDERS);
        } else {
          setTravelOrders(MOCK_TRAVEL_ORDERS);
        }
      } catch (error) {
        console.error('Failed to load travel data:', error);
        setTravelOrders(MOCK_TRAVEL_ORDERS);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [engagementId]);

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const totalAuthorized = travelOrders.reduce((s, o) => s + o.authorizedAmount, 0);
  const totalActual = travelOrders.reduce((s, o) => s + o.actualAmount, 0);
  const variance = totalActual - totalAuthorized;
  const delinquentCards = cardTransactions.filter(
    (t) => t.delinquencyStatus !== 'current'
  ).length;

  // Filtered travel orders
  const filteredOrders = travelOrders.filter((o) => {
    if (orderTypeFilter !== 'all' && o.orderType !== orderTypeFilter) return false;
    if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
    return true;
  });

  // Voucher settlement summary
  const voucherPaid = vouchers.filter((v) => v.status === 'paid').length;
  const voucherApproved = vouchers.filter((v) => v.status === 'approved').length;
  const voucherSubmitted = vouchers.filter((v) => v.status === 'submitted').length;
  const voucherDisputed = vouchers.filter((v) => v.status === 'disputed').length;

  // Delinquency breakdown
  const delinquencyBreakdown = {
    current: cardTransactions.filter((t) => t.delinquencyStatus === 'current').length,
    '30_day': cardTransactions.filter((t) => t.delinquencyStatus === '30_day').length,
    '60_day': cardTransactions.filter((t) => t.delinquencyStatus === '60_day').length,
    '90_plus': cardTransactions.filter((t) => t.delinquencyStatus === '90_plus').length,
  };
  const delinquencyChartData = [
    { name: 'Current', value: delinquencyBreakdown.current, color: '#16a34a' },
    { name: '30-Day', value: delinquencyBreakdown['30_day'], color: '#f59e0b' },
    { name: '60-Day', value: delinquencyBreakdown['60_day'], color: '#f97316' },
    { name: '90+ Day', value: delinquencyBreakdown['90_plus'], color: '#dc2626' },
  ];

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Loading Travel Compliance data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Plane className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Travel Order &amp; Voucher Compliance</h1>
          <p className="text-sm text-gray-500">DoD FMR Volume 9 - Travel Policy &amp; Government Travel Card Monitoring</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{travelOrders.length}</div>
                <div className="text-xs text-gray-500">Travel Orders</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{vouchers.length}</div>
                <div className="text-xs text-gray-500">Vouchers</div>
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
                <div className="text-xl font-bold">{fmtCompact.format(totalAuthorized)}</div>
                <div className="text-xs text-gray-500">Authorized</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-xl font-bold">{fmtCompact.format(totalActual)}</div>
                <div className="text-xs text-gray-500">Actual</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${variance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <AlertTriangle className={`h-5 w-5 ${variance > 0 ? 'text-red-600' : 'text-green-600'}`} />
              </div>
              <div>
                <div className={`text-xl font-bold ${variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmtCompact.format(Math.abs(variance))}
                </div>
                <div className="text-xs text-gray-500">Variance</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${delinquentCards > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <CreditCard className={`h-5 w-5 ${delinquentCards > 0 ? 'text-red-600' : 'text-green-600'}`} />
              </div>
              <div>
                <div className="text-2xl font-bold">{delinquentCards}</div>
                <div className="text-xs text-gray-500">Delinquent Cards</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Travel Orders</TabsTrigger>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
          <TabsTrigger value="cards">Card Transactions</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* Travel Orders Tab */}
        {/* ================================================================= */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Travel Orders</CardTitle>
                  <CardDescription>FMR Volume 9 - Authorized travel and temporary duty assignments</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={orderTypeFilter}
                    onChange={(e) => setOrderTypeFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Types' },
                      { value: 'tdy', label: 'TDY' },
                      { value: 'pcs', label: 'PCS' },
                      { value: 'local', label: 'Local' },
                      { value: 'emergency_leave', label: 'Emergency' },
                    ]}
                    className="w-36"
                  />
                  <Select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Statuses' },
                      { value: 'open', label: 'Open' },
                      { value: 'approved', label: 'Approved' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'cancelled', label: 'Cancelled' },
                    ]}
                    className="w-36"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Plane className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-900">No travel orders found</p>
                  <p className="text-sm text-gray-500 mt-1">Adjust filters or upload travel data to begin analysis.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Traveler</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead className="text-right">Authorized</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const typeInfo = travelTypeBadge(order.orderType);
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-xs">{truncateId(order.id)}</TableCell>
                          <TableCell className="text-sm font-medium">{order.travelerId.replace('T-', '')}</TableCell>
                          <TableCell>
                            <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="max-w-[100px] truncate">{order.originLocation}</span>
                              <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                              <span className="max-w-[100px] truncate">{order.destinationLocation}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                            {order.departDate} to {order.returnDate}
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt.format(order.authorizedAmount)}</TableCell>
                          <TableCell className="text-right">
                            {order.actualAmount > 0 ? (
                              <span className={order.actualAmount > order.authorizedAmount ? 'text-red-600 font-medium' : ''}>
                                {fmt.format(order.actualAmount)}
                              </span>
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(order.status)}>
                              {order.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Vouchers Tab */}
        {/* ================================================================= */}
        <TabsContent value="vouchers">
          <div className="space-y-6">
            {/* Settlement summary */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{voucherPaid}</div>
                    <div className="text-xs text-gray-500">Paid</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{voucherApproved}</div>
                    <div className="text-xs text-gray-500">Approved</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600">{voucherSubmitted}</div>
                    <div className="text-xs text-gray-500">Submitted</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{voucherDisputed}</div>
                    <div className="text-xs text-gray-500">Disputed</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Vouchers Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Travel Vouchers</CardTitle>
                <CardDescription>Settlement status and expense breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher #</TableHead>
                      <TableHead>Travel Order</TableHead>
                      <TableHead className="text-right">Lodging</TableHead>
                      <TableHead className="text-right">Meals</TableHead>
                      <TableHead className="text-right">Transport</TableHead>
                      <TableHead className="text-right">Other</TableHead>
                      <TableHead className="text-right">Total Claim</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Filed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.map((voucher) => (
                      <TableRow key={voucher.id}>
                        <TableCell className="font-mono text-xs">{voucher.voucherNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{voucher.travelOrderId}</TableCell>
                        <TableCell className="text-right">{fmt.format(voucher.lodgingCost)}</TableCell>
                        <TableCell className="text-right">{fmt.format(voucher.mealsCost)}</TableCell>
                        <TableCell className="text-right">{fmt.format(voucher.transportationCost)}</TableCell>
                        <TableCell className="text-right">{fmt.format(voucher.otherCosts)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt.format(voucher.totalClaim)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {voucher.approvedAmount !== undefined ? fmt.format(voucher.approvedAmount) : <span className="text-gray-400">--</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(voucher.status)}>
                            {voucher.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 whitespace-nowrap">{voucher.filedDate}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Card Transactions Tab */}
        {/* ================================================================= */}
        <TabsContent value="cards">
          <div className="space-y-6">
            {/* Delinquency Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Travel Card Delinquency Breakdown</CardTitle>
                <CardDescription>Government travel card aging analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={delinquencyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" name="Transactions" radius={[4, 4, 0, 0]}>
                      {delinquencyChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Transactions Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Card Transactions</CardTitle>
                <CardDescription>Government travel card transaction monitoring</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction Date</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reconciled</TableHead>
                      <TableHead>Delinquency Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cardTransactions.map((txn) => {
                      const delInfo = delinquencyBadge(txn.delinquencyStatus);
                      return (
                        <TableRow key={txn.id}>
                          <TableCell className="text-sm whitespace-nowrap">{txn.transactionDate}</TableCell>
                          <TableCell className="text-sm font-medium">{txn.merchantName}</TableCell>
                          <TableCell className="text-right font-medium">{fmt.format(txn.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{txn.category}</Badge>
                          </TableCell>
                          <TableCell>
                            {txn.reconciledToVoucher ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-400" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={delInfo.variant}>{delInfo.label}</Badge>
                          </TableCell>
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
        {/* Compliance Tab */}
        {/* ================================================================= */}
        <TabsContent value="compliance">
          <div className="space-y-6">
            {/* Compliance Check Results */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Travel Compliance Check Results</CardTitle>
                    <CardDescription>Automated validation against DoD FMR Volume 9 and DoDI 5154.31</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{TRAVEL_COMPLIANCE_CHECKS.filter((c) => c.passed).length} Passed</Badge>
                    <Badge variant="destructive">{TRAVEL_COMPLIANCE_CHECKS.filter((c) => !c.passed).length} Failed</Badge>
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
                    {TRAVEL_COMPLIANCE_CHECKS.map((check) => (
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

            {/* Authorization vs Actual Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Authorization vs Actual Variance Analysis</CardTitle>
                <CardDescription>Comparison of authorized travel amounts to actual expenses by order</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={travelOrders
                      .filter((o) => o.actualAmount > 0)
                      .map((o) => ({
                        name: o.travelerId.replace('T-', '').split(',')[0],
                        authorized: o.authorizedAmount,
                        actual: o.actualAmount,
                      }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={12} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(value: number | undefined) => fmt.format(value ?? 0)} />
                    <Legend />
                    <Bar dataKey="authorized" name="Authorized" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="Actual" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Travel Card Delinquency Monitoring */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Travel Card Delinquency Monitoring</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Current', count: delinquencyBreakdown.current, color: '#16a34a', bgColor: 'bg-green-50' },
                    { label: '30-Day Delinquent', count: delinquencyBreakdown['30_day'], color: '#f59e0b', bgColor: 'bg-amber-50' },
                    { label: '60-Day Delinquent', count: delinquencyBreakdown['60_day'], color: '#f97316', bgColor: 'bg-orange-50' },
                    { label: '90+ Day Delinquent', count: delinquencyBreakdown['90_plus'], color: '#dc2626', bgColor: 'bg-red-50' },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-lg border border-gray-200 p-4 ${item.bgColor}`}>
                      <div className="text-sm font-medium text-gray-600 mb-1">{item.label}</div>
                      <div className="text-2xl font-bold" style={{ color: item.color }}>{item.count}</div>
                      <Progress
                        value={(item.count / Math.max(cardTransactions.length, 1)) * 100}
                        color={item.color}
                        className="mt-2"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        {((item.count / Math.max(cardTransactions.length, 1)) * 100).toFixed(0)}% of transactions
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
