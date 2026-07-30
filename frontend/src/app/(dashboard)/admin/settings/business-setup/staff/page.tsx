"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, LogIn, Plus, User, Users } from "lucide-react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { ROUTES } from "@/lib/routes";
import {
  listAdminStaffIdentities,
  type AdminStaffIdentity,
} from "@/services/staff";
import { getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function badge(tone: "green" | "amber" | "red" | "blue" | "slate", label: string) {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-border bg-muted/50 text-muted-foreground",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${map[tone]}`}>
      {label}
    </span>
  );
}

function roleTone(role: string): "green" | "amber" | "blue" | "slate" {
  if (role === "ADMIN") return "red" as unknown as "amber";
  if (role === "CASHIER") return "blue";
  if (role === "PARTNER") return "green";
  return "slate";
}

function roleBadge(role: string) {
  const toneMap: Record<string, "green" | "amber" | "red" | "blue" | "slate"> = {
    ADMIN: "amber",
    CASHIER: "blue",
    PARTNER: "green",
    STAFF: "slate",
  };
  return badge(toneMap[role] ?? "slate", role);
}

type Tab = "users" | "hr" | "partners";

export default function StaffWorkbenchPage() {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [identities, setIdentities] = useState<AdminStaffIdentity[]>([]);
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [identPayload, checkPayload] = await Promise.all([
        listAdminStaffIdentities().catch(() => ({ results: [] as AdminStaffIdentity[] })),
        getSetupChecklist().catch(() => null),
      ]);
      setIdentities(identPayload.results);
      setChecklist(checkPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const admins = identities.filter((u) => u.username && !identities.find(() => false)); // all
  const cashierCount = Number(checklist?.counts?.cashier_users_active ?? 0);
  const partnerCount = Number(checklist?.counts?.partner_users_active ?? 0);
  const adminCount = identities.filter((u) => u.login_enabled).length;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "users", label: "System Users", icon: <LogIn className="h-4 w-4" /> },
    { key: "hr", label: "HR & Staff Profiles", icon: <User className="h-4 w-4" /> },
    { key: "partners", label: "Partners", icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & Roles Workbench"
        description="Manage system login users, HR staff profiles, cashier assignments, and partner accounts from one place."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.admin.settingsUsers} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold shadow-sm hover:bg-accent">
              System users
            </Link>
            <Link href={ROUTES.admin.hrStaff} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold shadow-sm hover:bg-accent">
              HR module
            </Link>
            <button onClick={() => void load()} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold shadow-sm hover:bg-accent">
              Refresh
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:w-64">
          <BusinessSetupLinks />
        </aside>

        <main className="flex-1 min-w-0 space-y-6">
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          ) : null}

          {/* KPI Cards */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">System users</div>
              <div className="mt-3 text-3xl font-bold text-foreground">{loading ? "—" : identities.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">Login accounts (Admin + Cashier)</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Active cashiers</div>
              <div className="mt-3 text-3xl font-bold text-foreground">{loading ? "—" : cashierCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Cashier-role users for collections</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Active partners</div>
              <div className="mt-3 text-3xl font-bold text-foreground">{loading ? "—" : partnerCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Partner login accounts</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Login enabled</div>
              <div className="mt-3 text-3xl font-bold text-foreground">{loading ? "—" : adminCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Staff with active login access</div>
            </div>
          </section>

          {/* Quick-create action cards */}
          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><LogIn className="h-4 w-4" /></div>
                <div className="text-sm font-bold text-foreground">Admin / Cashier User</div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Create a system login account for an admin or cashier. Cashiers can collect payments; admins can manage the full system.</p>
              <div className="flex flex-col gap-2">
                <Link href="/admin/settings/users/create" className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Create login user
                </Link>
                <Link href={ROUTES.admin.settingsUsers} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent text-center">
                  View all users →
                </Link>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><User className="h-4 w-4" /></div>
                <div className="text-sm font-bold text-foreground">HR Staff Profile</div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Add a staff member's HR record — designation, department, salary, attendance, leave. Separate from system login.</p>
              <div className="flex flex-col gap-2">
                <Link href={ROUTES.admin.hrStaff} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                  <Plus className="h-3.5 w-3.5" /> Add staff profile
                </Link>
                <Link href={ROUTES.admin.hrStaff} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent text-center">
                  Open HR module →
                </Link>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Users className="h-4 w-4" /></div>
                <div className="text-sm font-bold text-foreground">Partner Account</div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Add a business partner who refers customers, collects EMIs, or earns commissions. Partners get their own login portal.</p>
              <div className="flex flex-col gap-2">
                <Link href="/admin/settings/users/create" className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  <Plus className="h-3.5 w-3.5" /> Add partner
                </Link>
                <Link href={ROUTES.admin.partners} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent text-center">
                  Open partners →
                </Link>
              </div>
            </article>
          </section>

          {/* Tab navigator */}
          <div className="relative flex p-1.5 w-fit rounded-2xl bg-muted/40 shadow-[inset_0_1px_4px_rgba(0,0,0,0.05)] border border-border/50">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-background text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: System Users */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-border/50 bg-muted/10">
                  <div>
                    <h3 className="text-base font-bold text-foreground">System login register</h3>
                    <p className="mt-1 text-xs text-muted-foreground">All users with a login account (Admin, Cashier). Click a name to open their profile.</p>
                  </div>
                  <Link href="/admin/settings/users/create" className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90">
                    <Plus className="h-3.5 w-3.5" /> New user
                  </Link>
                </div>
                {loading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
                ) : identities.length === 0 ? (
                  <div className="p-10 flex flex-col items-center gap-3 text-center">
                    <p className="text-sm text-muted-foreground">No system users yet. Create an admin or cashier login account to get started.</p>
                    <Link href="/admin/settings/users/create" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                      Create first user →
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 border-b border-border/50">
                        <tr className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-5 py-3">Name / Username</th>
                          <th className="px-5 py-3">Employee</th>
                          <th className="px-5 py-3">Login</th>
                          <th className="px-5 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {identities.map((u) => (
                          <tr key={u.id} className="bg-background hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-4">
                              <div className="font-semibold text-foreground">{u.employee_name || u.username}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">@{u.username}</div>
                            </td>
                            <td className="px-5 py-4 text-muted-foreground">
                              {u.employee_code
                                ? <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{u.employee_code}</span>
                                : <span className="text-muted-foreground/50 text-xs">No HR profile</span>}
                            </td>
                            <td className="px-5 py-4">
                              {u.login_enabled
                                ? badge("green", "Login enabled")
                                : badge("slate", "Login disabled")}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  href={`/admin/settings/users/${u.user_id}`}
                                  className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-accent"
                                >
                                  Edit user
                                </Link>
                                {u.employee && (
                                  <Link
                                    href={`${ROUTES.admin.hrStaff}/${u.employee}`}
                                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                                  >
                                    Staff profile →
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-bold mb-2">Cashier setup checklist</div>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                  <li>Create a system user with role <strong>CASHIER</strong> here or in System Users.</li>
                  <li>Create a branch at <Link href={ROUTES.admin.branches} className="underline font-semibold">Branch master</Link>.</li>
                  <li>Create a cash counter at <Link href={ROUTES.admin.counters} className="underline font-semibold">Counters</Link> and assign this cashier to it.</li>
                  <li>The cashier logs in at <code className="bg-amber-100 px-1 rounded">/cashier</code> to collect payments and close their shift.</li>
                </ol>
              </section>
            </div>
          )}

          {/* Tab: HR & Staff Profiles */}
          {activeTab === "hr" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">HR Staff Profiles</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      Staff profiles store HR data — designation, department, salary, attendance, leave, and documents.
                      A staff member can exist as an HR profile without a system login, or be linked to a login account.
                    </p>
                  </div>
                  <Building2 className="h-8 w-8 text-muted-foreground/40 shrink-0 mt-1" />
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {[
                    { label: "Staff register", desc: "View all employee records — name, code, designation, branch, salary.", href: ROUTES.admin.hrStaff, color: "primary" },
                    { label: "Add staff member", desc: "Create a new HR profile with designation, department and joining date.", href: ROUTES.admin.hrStaff, color: "primary" },
                    { label: "Attendance", desc: "Mark and review daily attendance for all staff.", href: ROUTES.admin.hrAttendance, color: "secondary" },
                    { label: "Payroll & Salary", desc: "Run monthly payroll, generate payslips, and process salary payments.", href: ROUTES.admin.hrPayroll, color: "secondary" },
                    { label: "Leave management", desc: "Approve or reject leave requests, view leave balance.", href: ROUTES.admin.hrLeave, color: "secondary" },
                    { label: "Staff documents", desc: "Store ID proofs, appointment letters, contracts for each employee.", href: ROUTES.admin.hrStaffDocuments, color: "secondary" },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group flex flex-col gap-1 rounded-xl border border-border bg-background p-4 shadow-sm transition hover:shadow-md hover:border-primary/20"
                    >
                      <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{item.label} →</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <div className="font-bold mb-1">HR vs System user — what's the difference?</div>
                <p className="text-xs leading-relaxed">
                  An <strong>HR profile</strong> is your internal employment record (attendance, payroll, leave).
                  A <strong>system user</strong> is the login account. You can link them — or keep them separate.
                  A driver, delivery person, or cleaner may need an HR profile but never a system login.
                  A cashier needs both: an HR profile for payroll and a system login to use the cashier dashboard.
                </p>
              </section>
            </div>
          )}

          {/* Tab: Partners */}
          {activeTab === "partners" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Partner Accounts</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      Partners are external agents who refer customers, collect EMI payments on your behalf, and earn commissions.
                      Each partner gets their own login at <code className="bg-muted px-1 py-0.5 rounded text-xs">/partner</code>.
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-muted-foreground/40 shrink-0 mt-1" />
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {[
                    { label: "Partner register", desc: "View all partners, their status, commission rate, and collection activity.", href: ROUTES.admin.partners },
                    { label: "Add partner", desc: "Create a new partner profile and set their commission and collection permissions.", href: "/admin/settings/users/create" },
                    { label: "Collection requests", desc: "Approve or reject partner-initiated payment collection requests.", href: ROUTES.admin.partnersCollectionRequests },
                    { label: "Partner profiles hub", desc: "Detailed profile view with KYC, party linkage and activity summary.", href: ROUTES.admin.profilesPartners },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group flex flex-col gap-1 rounded-xl border border-border bg-background p-4 shadow-sm transition hover:shadow-md hover:border-primary/20"
                    >
                      <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{item.label} →</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-bold mb-1">Partner vs Cashier — what's the difference?</div>
                <p className="text-xs leading-relaxed">
                  A <strong>cashier</strong> is your own staff member collecting at your shop counter (in-person, logged in as <code>/cashier</code>).
                  A <strong>partner</strong> is an external agent — typically operating from their own location — who collects on your behalf and earns a commission per transaction.
                  Never give a partner admin or cashier system access.
                </p>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
