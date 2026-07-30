"use client";

import React, { useState } from "react";
import { Menu, X, Bell, User, Search, Settings, LogOut } from "lucide-react";

export interface ModernDashboardShellProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  children: React.ReactNode;
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  userMenu?: React.ReactNode;
  notifications?: number;
  onNotificationsClick?: () => void;
}

export const ModernDashboardShell: React.FC<ModernDashboardShellProps> = ({
  title,
  subtitle,
  breadcrumbs,
  children,
  header,
  sidebar,
  sidebarOpen = true,
  onSidebarToggle,
  userMenu,
  notifications,
  onNotificationsClick,
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Modern Top Navigation */}
      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Menu & Logo */}
            <div className="flex items-center gap-4">
              {onSidebarToggle && (
                <button
                  onClick={onSidebarToggle}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                  aria-label="Toggle menu"
                >
                  {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              )}
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
              </div>
            </div>

            {/* Center: Search */}
            <div className="hidden md:flex flex-1 max-w-md mx-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <button
                onClick={onNotificationsClick}
                className="relative p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                {notifications && notifications > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>

              {/* Settings */}
              <button
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>

              {/* User Menu */}
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">User</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Admin</p>
                </div>
                {userMenu || (
                  <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition">
                    <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-400">/</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-400">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar */}
        {sidebar && sidebarOpen && (
          <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 hidden md:block overflow-y-auto">
            {sidebar}
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {header && <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6">{header}</div>}

          <div className="p-6">
            {subtitle && (
              <p className="text-slate-600 dark:text-slate-400 mb-6">{subtitle}</p>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ModernDashboardShell;
