"use client";

import React, { useEffect, useState } from "react";
import { Activity, ShieldCheck, Zap } from "lucide-react";

export default function SidebarLiveStatusWidget({
  isMobile = false,
  collapsed = false,
}: {
  isMobile?: boolean;
  collapsed?: boolean;
}) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    // Simulate a subtle heartbeat/data refresh pulse every few seconds
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 800);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (collapsed && !isMobile) {
    return (
      <div 
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-card/[0.04] ring-1 ring-inset ring-white/[0.06] transition-all"
        title="System Optimal"
      >
        <div className="relative flex h-3 w-3">
          {pulse ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          ) : null}
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-card/[0.08] to-card/[0.02] p-3 ring-1 ring-inset ring-white/[0.08] transition-all hover:bg-card/[0.1]">
      {/* 3D Glass shine effect */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-white/[0.2] to-transparent" />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/[0.15] ring-1 ring-inset ring-emerald-500/20">
            <Activity className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-[12px] font-semibold leading-none tracking-tight text-[var(--sidebar-foreground)]">
              System Optimal
            </div>
            <div className="mt-1 text-[10px] font-medium text-[var(--sidebar-item-muted)]">
              Latency: 12ms
            </div>
          </div>
        </div>
        
        {/* Heartbeat dot */}
        <div className="relative flex h-2 w-2">
          {pulse ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          ) : null}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-black/20 px-2.5 py-1.5 shadow-inner">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-emerald-500" />
          <span className="text-[10px] font-semibold text-[var(--sidebar-item-muted)]">Secure Session</span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] font-bold text-[var(--sidebar-foreground)]">Active</span>
        </div>
      </div>
    </div>
  );
}
