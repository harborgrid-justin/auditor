'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  engagementId?: string;
  title?: string;
  subtitle?: string;
  userName?: string;
}

export function AppShell({ children, engagementId, title, subtitle, userName }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        engagementId={engagementId}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <div className={cn('transition-all duration-300', collapsed ? 'ml-16' : 'ml-64')}>
        <Header title={title} subtitle={subtitle} userName={userName} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
