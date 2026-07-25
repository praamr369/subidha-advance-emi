"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, Clock, AlertCircle, ChevronRight, UserPlus, ClipboardList, LifeBuoy, ShieldCheck, UserSearch, PackageOpen, ArrowRight } from "lucide-react";

import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { CrmWorkspacePayload, WorkbenchItem } from "@/services/admin-erp";
import EmptyState from "@/components/feedback/EmptyState";
import { WorkbenchFilterChips } from "@/components/workbench/WorkbenchFilterChips";

// Per-module presentation: each workbench task type routes to a different
// entity (customer / lead / ticket / request) and carries its own action verb.
const MODULE_META: Record<string, { label: string; badge: string; icon: typeof ShieldCheck; entityLabel: string }> = {
  KYC: { label: "KYC", badge: "bg-red-100 text-red-700 border-red-200", icon: ShieldCheck, entityLabel: "Customer" },
  LEAD: { label: "Enquiry", badge: "bg-blue-100 text-blue-700 border-blue-200", icon: UserSearch, entityLabel: "Lead" },
  SUPPORT: { label: "Support", badge: "bg-amber-100 text-amber-700 border-amber-200", icon: LifeBuoy, entityLabel: "Customer" },
  REQUEST: { label: "Request", badge: "bg-violet-100 text-violet-700 border-violet-200", icon: PackageOpen, entityLabel: "Request" },
};

function moduleMeta(module: string) {
  return MODULE_META[module] ?? { label: module, badge: "bg-muted text-muted-foreground border-border", icon: ClipboardList, entityLabel: "Record" };
}

export type CrmWorkspaceSectionCard = {
  key: string;
  label: string;
  purpose: string;
  href: string;
  count: number | null;
  status: "loading" | "ready" | "error";
  statusMessage: string;
};

type Props = {
  workspace: CrmWorkspacePayload | null;
  assignedTasks: WorkbenchItem[] | null;
  taskError: string | null;
};

export function CrmOperationalWorkspace({ workspace, assignedTasks, taskError }: Props) {
  const [activeTab, setActiveTab] = useState<"tasks" | "customers">("tasks");
  const [moduleFilter, setModuleFilter] = useState<string>("ALL");

  const customers = workspace?.customer_360 || [];
  const actionItems = workspace?.today_work || [];

  const moduleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (assignedTasks || []).forEach((t) => {
      counts[t.module] = (counts[t.module] || 0) + 1;
    });
    return counts;
  }, [assignedTasks]);

  const visibleTasks = useMemo(() => {
    if (!assignedTasks) return assignedTasks;
    return moduleFilter === "ALL" ? assignedTasks : assignedTasks.filter((t) => t.module === moduleFilter);
  }, [assignedTasks, moduleFilter]);

  const filterChips = useMemo(() => {
    const modules = Object.keys(moduleCounts).sort((a, b) => (moduleCounts[b] || 0) - (moduleCounts[a] || 0));
    return [
      { key: "ALL", label: "All", count: assignedTasks?.length ?? 0 },
      ...modules.map((m) => ({ key: m, label: moduleMeta(m).label, count: moduleCounts[m] })),
    ];
  }, [moduleCounts, assignedTasks]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Quick Actions & High Priority - Left Sidebar */}
      <div className="xl:col-span-3 space-y-6">
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-muted/30 p-4 border-b border-border">
            <h3 className="font-semibold text-sm">Quick Actions</h3>
          </div>
          <div className="p-2 space-y-1">
            <Link href={ROUTES.admin.crmLeads} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted text-sm font-medium transition-colors">
              <ClipboardList className="w-4 h-4 text-primary" />
              New Lead
            </Link>
            <Link href={ROUTES.admin.customers} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted text-sm font-medium transition-colors">
              <UserPlus className="w-4 h-4 text-blue-500" />
              Register Customer
            </Link>
            <Link href={ROUTES.admin.supportRequests} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted text-sm font-medium transition-colors">
              <LifeBuoy className="w-4 h-4 text-amber-500" />
              Log Support Case
            </Link>
          </div>
        </section>

        {/* Action Items (Today Work) */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-muted/30 p-4 border-b border-border flex justify-between items-center">
            <h3 className="font-semibold text-sm">Today's Radar</h3>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {actionItems.filter(i => i.count > 0).length} active
            </span>
          </div>
          <div className="p-0">
            {actionItems.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading action items...</div>
            ) : (
              <ul className="divide-y divide-border">
                {actionItems.map((item) => {
                  if (item.count === 0) return null;
                  return (
                    <li key={item.key}>
                      <Link href={item.deep_link} className="flex justify-between items-center p-4 hover:bg-muted/50 transition-colors">
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{item.source.split('.').pop()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-foreground">{item.count}</span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Main Workspace Area */}
      <div className="xl:col-span-9 space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-border px-2">
          <button
            className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === "tasks" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setActiveTab("tasks")}
          >
            Unified Workbench Tasks
          </button>
          <button
            className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === "customers" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setActiveTab("customers")}
          >
            Recent Customers (360)
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-card border border-border rounded-xl min-h-[500px]">
          {activeTab === "tasks" && (
            <div className="p-0">
              {taskError ? (
                <div className="p-6 text-sm text-red-600">{taskError}</div>
              ) : !assignedTasks ? (
                <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">Loading workbench tasks...</div>
              ) : assignedTasks.length === 0 ? (
                <div className="p-12">
                  <EmptyState title="No open tasks" description="Your unified workbench is clear." tone="info" />
                </div>
              ) : (
                <>
                  {/* Module filter — separates the different task types (KYC / Enquiry / Support / Request) */}
                  <WorkbenchFilterChips
                    chips={filterChips}
                    active={moduleFilter}
                    onSelect={setModuleFilter}
                    className="p-4 border-b border-border"
                  />

                  {(visibleTasks?.length ?? 0) === 0 ? (
                    <div className="p-12">
                      <EmptyState title="No tasks in this view" description="Try a different filter." tone="info" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider text-left">
                          <tr>
                            <th className="px-6 py-4 font-medium">Task / Title</th>
                            <th className="px-6 py-4 font-medium">Regarding</th>
                            <th className="px-6 py-4 font-medium">Priority</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(visibleTasks || []).map((task) => {
                            const meta = moduleMeta(task.module);
                            const Icon = meta.icon;
                            const actionHref = task.action_href || task.deep_link || "#";
                            const actionLabel = task.action_label || "Open";
                            return (
                              <tr key={task.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-6 py-4">
                                  <p className="font-medium text-foreground">{task.title}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-[320px] mt-1">{task.description}</p>
                                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 mt-2 rounded border text-[10px] font-semibold uppercase", meta.badge)}>
                                    <Icon className="w-3 h-3" /> {meta.label}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  {task.customer_name ? (
                                    <div>
                                      <p className="font-medium">{task.customer_name}</p>
                                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{meta.entityLabel}</span>
                                      {task.deep_link ? (
                                        <Link href={task.deep_link} className="block text-xs text-primary hover:underline">
                                          {task.entity_type === "customer" ? "View 360" : task.entity_type === "lead" ? "View enquiry" : "View detail"}
                                        </Link>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  {task.priority >= 80 ? (
                                    <span className="flex items-center gap-1 text-red-600 text-xs font-semibold"><AlertCircle className="w-3 h-3" /> High</span>
                                  ) : task.priority >= 50 ? (
                                    <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><Clock className="w-3 h-3" /> Medium</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">Low</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {task.status.replace(/_/g, " ")}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <Link
                                    href={actionHref}
                                    className="inline-flex items-center gap-1.5 justify-center rounded-md border border-primary bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/20 transition-colors"
                                  >
                                    {actionLabel} <ArrowRight className="w-3 h-3" />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "customers" && (
            <div className="p-0">
              {!workspace ? (
                <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">Loading recent customers...</div>
              ) : customers.length === 0 ? (
                <div className="p-12">
                  <EmptyState title="No recent customers" description="No customer activity detected." tone="info" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider text-left">
                      <tr>
                        <th className="px-6 py-4 font-medium">Customer</th>
                        <th className="px-6 py-4 font-medium">Contact</th>
                        <th className="px-6 py-4 font-medium">Activity</th>
                        <th className="px-6 py-4 font-medium">Status / Risk</th>
                        <th className="px-6 py-4 font-medium text-right">Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customers.map(c => (
                        <tr key={c.customer_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">ID: {c.customer_id}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-foreground">{c.phone}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2 text-xs">
                              <span title="Subscriptions" className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{c.subscription_count} Subs</span>
                              <span title="Payments" className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{c.payment_count} Pay</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 space-y-1">
                            <div className="flex items-center gap-2">
                              {c.kyc_status === 'VERIFIED' ? (
                                <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium"><CheckCircle className="w-3 h-3"/> KYC Verified</span>
                              ) : (
                                <span className="text-amber-600 text-xs font-medium">KYC {c.kyc_status}</span>
                              )}
                            </div>
                            {c.risk_status === 'HIGH' && (
                              <div className="text-red-600 text-[10px] font-bold uppercase flex items-center gap-1">
                                <AlertCircle className="w-3 h-3"/> High Risk
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link href={c.deep_link} className="inline-flex items-center justify-center rounded-md border border-primary bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/20 transition-colors">
                              Open 360
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
