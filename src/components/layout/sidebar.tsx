'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Upload, AlertTriangle, BookOpen,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Receipt, Shield, BarChart3, FileText, Settings, LogOut, ChevronLeft,
  ChevronRight, Scale, Landmark, Gavel, Wallet, ClipboardList
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DOD_ENTITY_TYPES = new Set([
  'dod_component', 'defense_agency', 'combatant_command', 'working_capital_fund', 'naf_entity',
]);

interface SidebarProps {
  engagementId?: string;
  entityType?: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ engagementId, entityType, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const mainNav = [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/engagements', icon: Building2, label: 'Engagements' },
  ];

  const engagementNav = engagementId ? [
    { href: `/engagements/${engagementId}`, icon: LayoutDashboard, label: 'Overview' },
    { href: `/engagements/${engagementId}/upload`, icon: Upload, label: 'Upload Data' },
    { href: `/engagements/${engagementId}/findings`, icon: AlertTriangle, label: 'Findings' },
    { href: `/engagements/${engagementId}/gaap`, icon: BookOpen, label: 'GAAP Analysis' },
    { href: `/engagements/${engagementId}/tax`, icon: Receipt, label: 'Tax Compliance' },
    { href: `/engagements/${engagementId}/sox`, icon: Shield, label: 'SOX Controls' },
    { href: `/engagements/${engagementId}/analysis`, icon: BarChart3, label: 'Analysis' },
    { href: `/engagements/${engagementId}/reports`, icon: FileText, label: 'Reports' },
  ] : [];

  const dodNav = engagementId && entityType && DOD_ENTITY_TYPES.has(entityType) ? [
    { href: `/engagements/${engagementId}/dod-fmr`, icon: Landmark, label: 'DoD FMR' },
    { href: `/engagements/${engagementId}/dod-fmr/appropriations`, icon: Wallet, label: 'Appropriations' },
    { href: `/engagements/${engagementId}/dod-fmr/ada`, icon: Gavel, label: 'ADA Monitor' },
    { href: `/engagements/${engagementId}/dod-fmr/reports`, icon: ClipboardList, label: 'Federal Reports' },
  ] : [];

  return (
    <aside className={cn(
      'fixed left-0 top-0 z-40 h-screen border-r border-gray-200 bg-white transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Scale className="h-6 w-6 text-gray-900" />
          {!collapsed && <span className="text-lg font-bold text-gray-900">AuditPro</span>}
        </Link>
        <button
          onClick={onToggle}
          className={cn('ml-auto rounded-md p-1 hover:bg-gray-100', collapsed && 'mx-auto ml-0')}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {!collapsed && <span className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Navigation</span>}
        {mainNav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            {!collapsed && item.label}
          </Link>
        ))}

        {engagementNav.length > 0 && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {!collapsed && <span className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Engagement</span>}
            {engagementNav.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && item.label}
              </Link>
            ))}
          </>
        )}

        {dodNav.length > 0 && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {!collapsed && <span className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">DoD FMR</span>}
            {dodNav.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === item.href || pathname?.startsWith(item.href + '/')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="absolute bottom-0 w-full border-t border-gray-200 p-2">
        <Link
          href="/api/auth/signout"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sign Out'}
        </Link>
      </div>
    </aside>
  );
}
