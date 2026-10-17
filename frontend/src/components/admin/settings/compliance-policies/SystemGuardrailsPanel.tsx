"use client";

import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  GitBranch,
  Database,
  Trash2,
  FolderPlus,
  Terminal,
  CheckCircle2,
  FileText,
  Radio,
} from "lucide-react";

export function SystemGuardrailsPanel() {
  const guardrails = [
    {
      id: 1,
      title: "No Execution Without Permission",
      description: "Agents and automated scripts cannot change system state, reboot services, or deploy without explicit operator approval.",
      badge: "STRICT PERMISSION",
      badgeTone: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900",
      icon: Terminal,
      enforcement: "Prompts & Antigravity / Claude / Cursor runtime gates",
      status: "ACTIVE",
    },
    {
      id: 2,
      title: "No Autonomous Git / GitHub Commands",
      description: "Zero autonomous git push, git commit, reset, or rebase by AI assistants. Remote changes require manual user review.",
      badge: "PRE-PUSH HOOK",
      badgeTone: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900",
      icon: GitBranch,
      enforcement: ".githooks/pre-push (blocks remote pushes without ALLOW_GIT_PUSH=true)",
      status: "ENFORCED",
    },
    {
      id: 3,
      title: "No Direct DB Mutation & Never DELETE",
      description: "Destructive SQL (DROP, TRUNCATE, DELETE, flush) is strictly forbidden. Financial records, EMIs, and payments are append-only.",
      badge: "APPEND-ONLY LEDGER",
      badgeTone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900",
      icon: Database,
      enforcement: ".githooks/pre-commit & Django Append-Only Ledger Services",
      status: "PROTECTED",
    },
    {
      id: 4,
      title: "Nothing Deleted Without Permission",
      description: "Files, routes, models, and tests cannot be deleted. Consolidations are additive (tab switcher) only so zero workflows are lost.",
      badge: "DELETION GUARD",
      badgeTone: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900",
      icon: Trash2,
      enforcement: ".githooks/pre-commit (blocks file deletions without ALLOW_FILE_DELETE=true)",
      status: "ENFORCED",
    },
    {
      id: 5,
      title: "Nothing Added Without Permission",
      description: "No unrequested npm packages, pip packages, routes, or microservices may be added. Changes must be minimal, reviewable diffs.",
      badge: "ZERO CODE SMELL",
      badgeTone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900",
      icon: FolderPlus,
      enforcement: "AGENTS.md, CLAUDE.md, .cursorrules & .github/copilot-instructions",
      status: "ACTIVE",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-900 dark:text-emerald-200">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Strict AI Agent Guardrails & Rulebook Active</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All AI coding agents (Antigravity, Gemini, Claude, Cursor, GitHub Copilot, Codex, Windsurf) share the canonical rulebook at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">docs/SUBIDHA_CORE_PROJECT_RULEBOOK.md</code> and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">docs/STRICT_GUARDRAILS.md</code>.
              Automated git actions and destructive database operations are blocked at the hook level.
            </p>
          </div>
        </div>
      </div>

      {/* 5 Guardrail Commandments Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {guardrails.map((g) => {
          const Icon = g.icon;
          return (
            <div
              key={g.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground">RULE {g.id}</span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${g.badgeTone}`}
                  >
                    {g.badge}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1.5">{g.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">{g.description}</p>
              </div>

              <div className="pt-3 border-t border-border/60">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Enforcement Mechanism
                </p>
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span className="truncate pr-2">{g.enforcement}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="h-3 w-3" /> {g.status}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Multi-Agent Live Hub Card */}
        <div className="flex flex-col justify-between rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/20 p-2 text-primary">
                  <Radio className="h-4 w-4 animate-pulse" />
                </div>
                <span className="text-xs font-bold text-primary">INTER-AGENT HUB</span>
              </div>
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                n8n Connected
              </span>
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1.5">Live Inter-Agent Sync</h4>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              When any AI agent updates schemas or business invariants, it synchronizes via{" "}
              <code className="rounded bg-muted px-1 font-mono text-[11px]">scripts/agent_sync.py</code> and dispatches events to the live n8n webhook.
            </p>
          </div>

          <div className="pt-3 border-t border-primary/20">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Active Sync Webhook
            </p>
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span className="truncate pr-2">.../n8n/webhook/agent-sync</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="h-3 w-3" /> ONLINE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Global Invariants & Rulebook Reference Box */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          Canonical Business Invariants Reference (Rulebook Summary)
        </div>
        <div className="grid gap-3 sm:grid-cols-2 text-xs text-muted-foreground">
          <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-1">
            <p className="font-semibold text-foreground">Append-Only Financial Truth</p>
            <p>
              Payments, receipts, invoices, and journal entries are immutable once settled. Adjustments require explicit reversal records or credit notes.
            </p>
          </div>
          <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-1">
            <p className="font-semibold text-foreground">Lucky Plan Determinism</p>
            <p>
              Draws waiver applies strictly to remaining future EMIs. Settled payments are never altered. Product base price defines contract value.
            </p>
          </div>
          <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-1">
            <p className="font-semibold text-foreground">Solopreneur Desktop Control</p>
            <p>
              The Admin Webapp provides friction-free access to all operational modules (finance, inventory, PIM, collections) under a single admin desk.
            </p>
          </div>
          <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-1">
            <p className="font-semibold text-foreground">Real Database Integrity</p>
            <p>
              The development database uses real operational records. No cosmetic or fabricated test data is permitted as it corrupts financial KPIs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

