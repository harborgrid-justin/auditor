'use client';

import React from 'react';
import { Bell, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  userName?: string;
}

export function Header({ title, subtitle, userName }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-6">
      <div className="flex-1">
        {title && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search findings, accounts..."
            className="w-64 pl-9"
          />
        </div>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
          <User className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{userName || 'User'}</span>
        </div>
      </div>
    </header>
  );
}
