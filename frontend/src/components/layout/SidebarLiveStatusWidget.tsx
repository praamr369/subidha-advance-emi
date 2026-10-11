"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Activity, AlertTriangle, ShieldCheck, WifiOff, Zap } from "lucide-react";
import { API_BASE_URL } from "@/lib/env";

type HealthState = {
  status: "optimal" | "normal" | "slow" | "offline" | "checking";
  latencyMs: number | null;
  label: string;
  isHttps: boolean;
};

export default function SidebarLiveStatusWidget({
  isMobile = false,
  collapsed = false,
}: {
  isMobile?: boolean;
  collapsed?: boolean;
}) {
  const [pulse, setPulse] = useState(false);
  const [health, setHealth] = useState<HealthState>({
    status: "checking",
    latencyMs: null,
    label: "Checking...",
    isHttps: typeof window !== "undefined" ? window.location.protocol === "https:" : true,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const checkHealth = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const isHttps = typeof window !== "undefined" ? window.location.protocol === "https:" : true;
    const start = performance.now();

    try {
      // Ping canonical public health endpoint
      const res = await fetch(`${API_BASE_URL}/health/`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      const elapsed = Math.round(performance.now() - start);

      if (res.ok) {
        let label = "System Optimal";
        let status: HealthState["status"] = "optimal";

        if (elapsed > 600) {
          status = "slow";
          label = "High Latency";
        } else if (elapsed > 250) {
          status = "normal";
          label = "System Normal";
        }

        setHealth({
          status,
          latencyMs: elapsed,
          label,
          isHttps,
        });

        // Trigger heartbeat pulse on successful response
        setPulse(true);
        setTimeout(() => setPulse(false), 900);
      } else {
        setHealth({
          status: "offline",
          latencyMs: null,
          label: "Service Degraded",
          isHttps,
        });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      setHealth({
        status: "offline",
        latencyMs: null,
        label: "Offline",
        isHttps,
      });
    }
  }, []);

  useEffect(() => {
    const initialProbe = window.setTimeout(() => {
      void checkHealth();
    }, 0);

    const interval = setInterval(() => {
      // Avoid excessive pings when document is backgrounded
      if (typeof document !== "undefined" && document.hidden) return;
      void checkHealth();
    }, 15000);

    return () => {
      window.clearTimeout(initialProbe);
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [checkHealth]);

  const toneConfig = {
    optimal: {
      bg: "bg-emerald-500/[0.15]",
      ring: "ring-emerald-500/20",
      text: "text-emerald-500",
      pingBg: "bg-emerald-400",
      dotBg: "bg-emerald-500",
      icon: Activity,
    },
    normal: {
      bg: "bg-sky-500/[0.15]",
      ring: "ring-sky-500/20",
      text: "text-sky-500",
      pingBg: "bg-sky-400",
      dotBg: "bg-sky-500",
      icon: Activity,
    },
    slow: {
      bg: "bg-amber-500/[0.15]",
      ring: "ring-amber-500/20",
      text: "text-amber-500",
      pingBg: "bg-amber-400",
      dotBg: "bg-amber-500",
      icon: AlertTriangle,
    },
    offline: {
      bg: "bg-rose-500/[0.15]",
      ring: "ring-rose-500/20",
      text: "text-rose-500",
      pingBg: "bg-rose-400",
      dotBg: "bg-rose-500",
      icon: WifiOff,
    },
    checking: {
      bg: "bg-muted",
      ring: "ring-border",
      text: "text-muted-foreground",
      pingBg: "bg-muted-foreground",
      dotBg: "bg-muted-foreground",
      icon: Activity,
    },
  }[health.status];

  const Icon = toneConfig.icon;
  const latencyDisplay =
    health.latencyMs !== null
      ? `Latency: ${health.latencyMs}ms`
      : health.status === "checking"
        ? "Probing…"
        : "Unreachable";

  if (collapsed && !isMobile) {
    return (
      <div
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-card/4 ring-1 ring-inset ring-white/6 transition-all cursor-pointer"
        title={`${health.label} (${latencyDisplay})`}
        onClick={() => void checkHealth()}
      >
        <div className="relative flex h-3 w-3">
          {pulse ? (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${toneConfig.pingBg} opacity-75`} />
          ) : null}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${toneConfig.dotBg}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex w-full flex-col overflow-hidden rounded-2xl bg-linear-to-b from-card/8 to-card/2 p-3 ring-1 ring-inset ring-white/8 transition-all hover:bg-card/10">
      {/* 3D Glass shine effect */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px w-full bg-linear-to-r from-transparent via-white/20 to-transparent" />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneConfig.bg} ring-1 ring-inset ${toneConfig.ring}`}>
            <Icon className={`h-4 w-4 ${toneConfig.text}`} />
          </div>
          <div>
            <div className="text-[12px] font-semibold leading-none tracking-tight text-[var(--sidebar-foreground)]">
              {health.label}
            </div>
            <div className="mt-1 text-[10px] font-medium text-[var(--sidebar-item-muted)]">
              {latencyDisplay}
            </div>
          </div>
        </div>
        
        {/* Heartbeat dot */}
      <div
          className="relative flex h-2 w-2 cursor-pointer"
          title="Click to re-ping server"
          onClick={() => void checkHealth()}
        >
          {pulse ? (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${toneConfig.pingBg} opacity-75`} />
          ) : null}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${toneConfig.dotBg}`} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-black/20 px-2.5 py-1.5 shadow-inner">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className={`h-3 w-3 ${health.isHttps ? "text-emerald-500" : "text-amber-500"}`} />
          <span className="text-[10px] font-semibold text-[var(--sidebar-item-muted)]">
            {health.isHttps ? "Secure TLS" : "Active Session"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className={`h-3 w-3 ${health.status === "offline" ? "text-rose-500" : "text-amber-500"}`} />
          <span className="text-[10px] font-bold text-[var(--sidebar-foreground)]">
            {health.status === "offline" ? "Degraded" : "Active"}
          </span>
        </div>
      </div>
    </div>
  );
}
