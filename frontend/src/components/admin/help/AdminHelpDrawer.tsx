"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Compass,
  ExternalLink,
  Factory,
  Gauge,
  Landmark,
  Lightbulb,
  ListChecks,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Trophy,
  Truck,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";

import DrawerShell from "@/components/ui/DrawerShell";
import {
  ACTION_PLAYBOOKS,
  ADMIN_HELP_TOPICS,
  HELP_CATEGORIES,
  resolveHelpTopic,
  searchActionPlaybooks,
  searchHelpTopics,
  type AdminHelpTopic,
  type HelpCategory,
} from "@/config/admin-help-topics";
import { cn } from "@/lib/utils";

export const ADMIN_HELP_EVENT = "subidha:open-admin-help";

export type AdminHelpEventDetail = {
  topicId?: string;
  playbookId?: string;
};

/** Dispatch custom event so any button in the app can open the Help Drawer. */
export function openAdminHelp(topicId?: string, playbookId?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<AdminHelpEventDetail>(ADMIN_HELP_EVENT, {
        detail: { topicId, playbookId },
      })
    );
  }
}

const ICON_MAP = {
  boxes: Boxes,
  wallet: Wallet,
  shoppingCart: ShoppingCart,
  factory: Factory,
  landmark: Landmark,
  users: Users,
  truck: Truck,
  userCog: UserCog,
  trophy: Trophy,
  settings: Settings,
  gauge: Gauge,
  receipt: Receipt,
};

type DrawerTab = "playbooks" | "workflows" | "architecture" | "setup" | "directory";

export default function AdminHelpDrawer() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>("all");
  const [activeTab, setActiveTab] = useState<DrawerTab>("playbooks");

  // Determine current route's contextual topic
  const contextualTopic = useMemo(() => resolveHelpTopic(pathname), [pathname]);

  // When drawer opens without explicit topic, default to current page's topic
  const activeTopic: AdminHelpTopic = useMemo(() => {
    if (selectedTopicId) {
      const found = ADMIN_HELP_TOPICS.find((t) => t.id === selectedTopicId);
      if (found) return found;
    }
    return contextualTopic;
  }, [selectedTopicId, contextualTopic]);

  // Handle custom event from anywhere in the app
  const handleOpenEvent = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<AdminHelpEventDetail>;
    if (customEvent.detail?.topicId) {
      setSelectedTopicId(customEvent.detail.topicId);
      setActiveTab("workflows");
    }
    if (customEvent.detail?.playbookId) {
      setSelectedPlaybookId(customEvent.detail.playbookId);
      setActiveTab("playbooks");
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(ADMIN_HELP_EVENT, handleOpenEvent);
    return () => window.removeEventListener(ADMIN_HELP_EVENT, handleOpenEvent);
  }, [handleOpenEvent]);

  // Keyboard shortcut listener (F1 or Shift + ?)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
          return;
        }
      }

      if (e.key === "F1" || (e.shiftKey && e.key === "?")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtered topics for search or category filtering
  const filteredTopics = useMemo(() => {
    let result = ADMIN_HELP_TOPICS;
    if (selectedCategory !== "all") {
      result = result.filter((t) => t.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      result = searchHelpTopics(searchQuery);
    }
    return result;
  }, [selectedCategory, searchQuery]);

  // Filtered action playbooks
  const filteredPlaybooks = useMemo(() => {
    let result = ACTION_PLAYBOOKS;
    if (selectedCategory !== "all") {
      result = result.filter((pb) => pb.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      result = searchActionPlaybooks(searchQuery);
    }
    return result;
  }, [selectedCategory, searchQuery]);

  const IconComponent = ICON_MAP[activeTopic.iconName] || BookOpen;

  return (
    <DrawerShell
      open={open}
      onClose={() => setOpen(false)}
      title="Admin Business Workflows & Operations Guide"
      description="Step-by-step action playbooks, setup workflows, and financial rules across all 436 pages."
      size="wide"
    >
      <div className="flex h-full flex-col min-h-0 bg-background text-foreground">
        {/* Search & Topic Switcher Strip */}
        <div className="shrink-0 border-b border-border bg-muted/30 p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search actions ('make contract', 'collect EMI', 'PIM', 'BOM', 'GRN', 'opening stock')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-input bg-background pl-9 pr-8 py-2 text-xs sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedTopicId(null);
                setSelectedPlaybookId(null);
                setSearchQuery("");
                setActiveTab("workflows");
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 transition"
              title="Reset to current page's topic"
            >
              <Sparkles className="size-3.5 text-primary" />
              <span className="hidden sm:inline">Current Page</span>
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            {HELP_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    if (cat.id !== "all") {
                      const firstInCat = ADMIN_HELP_TOPICS.find((t) => t.category === cat.id);
                      if (firstInCat) setSelectedTopicId(firstInCat.id);
                    }
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 font-medium transition",
                    isActive
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Context Banner */}
        <div className="shrink-0 border-b border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-card-elevated)_92%,white_8%),color-mix(in_oklab,var(--surface-card-soft)_80%,var(--surface-muted)_20%))] px-4 py-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <IconComponent className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                    {activeTopic.title}
                  </h2>
                  <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {activeTopic.badge}
                  </span>
                  {activeTopic.id === contextualTopic.id ? (
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Active Route ({pathname})
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {activeTopic.summary}
                </p>
              </div>
            </div>

            {/* Quick Actions buttons */}
            {activeTopic.keyActions?.length > 0 ? (
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                {activeTopic.keyActions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      action.variant === "primary"
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-border bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    <span>{action.label}</span>
                    <ArrowRight className="size-3" />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {/* Drawer Tab Navigation */}
          <div className="mt-3 flex gap-1 border-t border-border/60 pt-2.5 overflow-x-auto no-scrollbar">
            {[
              { id: "playbooks", label: "I Want To... (Action Playbooks)", icon: Compass, count: filteredPlaybooks.length },
              { id: "workflows", label: "Workflows & Actions", icon: ListChecks },
              { id: "architecture", label: "Why Needed & How it Works", icon: Lightbulb },
              { id: "setup", label: "Setup & Rules", icon: AlertTriangle },
              { id: "directory", label: "All 14 Modules (436 Pages)", icon: BookOpen },
            ].map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as DrawerTab)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  <TabIcon className="size-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined ? (
                    <span className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px]",
                      isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Drawer Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 0: "I WANT TO..." ACTION PLAYBOOKS */}
          {activeTab === "playbooks" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Compass className="size-4 text-primary" />
                    Operational Action Chains &amp; Purpose Playbooks
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Exact step-by-step action chains for any business goal. Click any playbook to see the exact breadcrumb and open the action.
                  </p>
                </div>
                <span className="text-xs font-semibold text-primary shrink-0">
                  {filteredPlaybooks.length} playbooks
                </span>
              </div>

              <div className="space-y-4">
                {filteredPlaybooks.map((pb, pbIdx) => {
                  const isExpanded = selectedPlaybookId === pb.id;
                  return (
                    <div
                      key={pb.id}
                      className={cn(
                        "rounded-2xl border transition p-4 sm:p-5 space-y-3.5",
                        isExpanded
                          ? "border-primary bg-primary/[0.03] shadow-xs"
                          : "border-border bg-card hover:border-primary/40"
                      )}
                    >
                      {/* Playbook Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-xs">
                            {pbIdx + 1}
                          </span>
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedPlaybookId(isExpanded ? null : pb.id)}
                              className="text-left font-bold text-sm sm:text-base text-foreground hover:text-primary transition flex items-center gap-2"
                            >
                              <span>{pb.intent}</span>
                              <ChevronRight className={cn("size-4 transition-transform", isExpanded ? "rotate-90" : "")} />
                            </button>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {pb.category}
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {pb.routePrefix}
                              </span>
                            </div>
                          </div>
                        </div>

                        <Link
                          href={pb.actionHref}
                          onClick={() => setOpen(false)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs"
                        >
                          <span>{pb.actionLabel}</span>
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </div>

                      {/* Visual Action Chain Breadcrumb */}
                      <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap min-w-max">
                          <span className="font-semibold text-muted-foreground text-[11px] uppercase mr-1">
                            Action Chain:
                          </span>
                          {pb.breadcrumbSteps.map((stepLabel, sIdx) => (
                            <div key={sIdx} className="flex items-center gap-1.5">
                              {sIdx > 0 && <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />}
                              <span className={cn(
                                "rounded-md px-2 py-0.5 font-medium text-xs",
                                sIdx === pb.breadcrumbSteps.length - 1
                                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                  : "bg-background border border-border text-foreground"
                              )}>
                                {stepLabel}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Expanded Guide */}
                      {isExpanded && (
                        <div className="space-y-3 pt-2 border-t border-border/60">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Step-by-Step Instructions &amp; Inputs
                          </h5>
                          <div className="space-y-2">
                            {pb.stepByStepGuide.map((st) => (
                              <div
                                key={st.step}
                                className="flex items-start gap-3 rounded-xl border border-border/50 bg-background p-3 text-xs"
                              >
                                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                                  {st.step}
                                </span>
                                <div className="flex-1 space-y-1">
                                  <div className="font-bold text-foreground">{st.title}</div>
                                  <div className="text-muted-foreground leading-relaxed">{st.description}</div>
                                  {st.fieldDetails && (
                                    <div className="text-[11px] text-primary/80 font-mono bg-muted/40 p-1.5 rounded-lg border border-border/40">
                                      Fields: {st.fieldDetails}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Critical Rules */}
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5 text-xs">
                            <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                              <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
                              <span>Critical Business Rules &amp; Invariants:</span>
                            </div>
                            <ul className="space-y-1 text-amber-900/90 dark:text-amber-200/90 pl-5 list-disc">
                              {pb.criticalRules.map((rule, rIdx) => (
                                <li key={rIdx}>{rule}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 1: WORKFLOWS & STEP-BY-STEP ACTIONS (Domain Specific) */}
          {activeTab === "workflows" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Step-by-Step Business Workflows for {activeTopic.shortTitle}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {activeTopic.workflows.length} standard flows
                </span>
              </div>

              {activeTopic.workflows.map((wf, wfIdx) => (
                <div
                  key={wf.name}
                  className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-foreground">
                        {wfIdx + 1}. {wf.name}
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">{wf.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {wf.steps.map((st) => (
                      <div
                        key={st.step}
                        className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed"
                      >
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                          {st.step}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-foreground">{st.title}</span>
                            {st.actionHref ? (
                              <Link
                                href={st.actionHref}
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition"
                              >
                                <span>{st.actionLabel || "Open Action"}</span>
                                <ExternalLink className="size-2.5" />
                              </Link>
                            ) : null}
                          </div>
                          <p className="mt-1 text-muted-foreground text-xs leading-5">
                            {st.description}
                          </p>
                          {st.importantNote ? (
                            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] text-amber-800 dark:text-amber-200 font-medium">
                              <AlertTriangle className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
                              <span>{st.importantNote}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Common Questions */}
              {activeTopic.commonQuestions && activeTopic.commonQuestions.length > 0 ? (
                <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CircleHelp className="size-3.5 text-primary" />
                    Frequently Asked Questions
                  </h4>
                  <div className="space-y-3">
                    {activeTopic.commonQuestions.map((q, idx) => (
                      <div key={idx} className="rounded-xl border border-border bg-card p-3 space-y-1">
                        <div className="font-semibold text-xs text-foreground">{q.question}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                          {q.answer}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 2: WHY NEEDED & HOW IT WORKS */}
          {activeTab === "architecture" && (
            <div className="space-y-6">
              {/* Why this page is needed */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="size-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    Why this module is needed in furniture retail
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {activeTopic.whyNeeded}
                </p>
              </div>

              {/* How it works */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">How it Works &amp; Data Pipeline</h3>
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line bg-muted/30 p-4 rounded-xl border border-border/50">
                  {activeTopic.howItWorks}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SETUP & FINANCIAL INVARIANTS */}
          {activeTab === "setup" && (
            <div className="space-y-6">
              {/* Business Setup Prerequisites */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Settings className="size-4 text-primary" />
                    Prerequisites &amp; Business Setup Checklist
                  </h3>
                  <span className="text-xs text-muted-foreground">Required before live operations</span>
                </div>

                <div className="space-y-2.5">
                  {activeTopic.setupRequirements.map((req, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-foreground">{req.title}</div>
                        <div className="text-[11px] text-muted-foreground">{req.description}</div>
                      </div>
                      <Link
                        href={req.setupHref}
                        onClick={() => setOpen(false)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-primary hover:bg-muted transition"
                      >
                        <span>Configure</span>
                        <ExternalLink className="size-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strict Financial & Audit Invariants */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-amber-500/20 pb-2">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                    Strict Invariants &amp; System Guardrails (Zero-Tolerance)
                  </h3>
                </div>
                <ul className="space-y-2">
                  {activeTopic.invariants.map((inv, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs leading-5 text-amber-900/90 dark:text-amber-200/90"
                    >
                      <CheckCircle2 className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <span>{inv}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* TAB 4: DIRECTORY OF ALL 14 MODULES (436 PAGES) */}
          {activeTab === "directory" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    All 14 Business Domains &amp; 436 Admin Pages
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Complete sitemap covering every operational desk across all 74 top-level route segments.
                  </p>
                </div>
                <span className="text-xs font-semibold text-primary">
                  100% Mapped
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTopics.map((topic) => {
                  const TopicIcon = ICON_MAP[topic.iconName] || BookOpen;
                  const isCurrent = topic.id === activeTopic.id;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        setActiveTab("workflows");
                      }}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition",
                        isCurrent
                          ? "border-primary bg-primary/10 shadow-xs"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                      )}
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted border border-border text-foreground">
                        <TopicIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-foreground truncate">
                            {topic.shortTitle}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground shrink-0">
                            {topic.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                          {topic.summary}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground font-mono">
                          {topic.pathPrefixes.slice(0, 3).map((p) => (
                            <span key={p} className="rounded bg-background border px-1 py-0.2">
                              {p}
                            </span>
                          ))}
                          {topic.pathPrefixes.length > 3 && (
                            <span className="text-primary font-semibold">
                              +{topic.pathPrefixes.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-muted/40 px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono">
              F1
            </kbd>
            <span>or</span>
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono">
              Shift + ?
            </kbd>
            <span className="hidden sm:inline">to toggle this guide anywhere</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border bg-background px-3 py-1 font-semibold text-foreground hover:bg-muted transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
