"use client";

import { useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import {
  getRolePermissionMatrix,
  listUserCapabilityOverrides,
  updateRoleCapabilities,
  updateUserCapabilityOverrides,
  type MatrixRole,
  type RolePermissionMatrixResponse,
  type UserCapabilityOverrideRow,
} from "@/services/role-capabilities";

const ROLE_ORDER: MatrixRole[] = ["ADMIN", "CASHIER", "PARTNER", "CUSTOMER"];

export default function RolesPermissionsPage() {
  const [matrix, setMatrix] = useState<RolePermissionMatrixResponse | null>(null);
  const [users, setUsers] = useState<UserCapabilityOverrideRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<MatrixRole>("ADMIN");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [matrixPayload, usersPayload] = await Promise.all([
        getRolePermissionMatrix(),
        listUserCapabilityOverrides(),
      ]);
      setMatrix(matrixPayload);
      setUsers(usersPayload.results);
      setSelectedUserId((current) =>
        current ?? usersPayload.results[0]?.id ?? null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capability matrix.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const selectedUser = useMemo(
    () => users.find((row) => row.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  async function handleRoleToggle(code: string, next: boolean) {
    if (!matrix) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const nextMap = {
        ...(matrix.roles[selectedRole] || {}),
        [code]: next,
      };
      await updateRoleCapabilities(selectedRole, nextMap);
      await loadAll();
      setMessage(`Updated ${selectedRole} role capability matrix.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role capability.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUserOverrideToggle(code: string, next: boolean) {
    if (!selectedUser) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const nextMap = {
        ...(selectedUser.overrides || {}),
        [code]: next,
      };
      await updateUserCapabilityOverrides(selectedUser.id, nextMap, note);
      await loadAll();
      setMessage(`Updated overrides for ${selectedUser.username}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user override.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & capabilities"
        description="Additive capability matrix layered on top of existing role-based guards for stricter finance-critical access control."
      />

      {loading ? <div className="rounded-xl border border-border bg-card p-4 text-sm">Loading matrix...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div> : null}

      {matrix ? (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Capability matrix table</h2>
            <p className="mt-1 text-sm text-muted-foreground">Role policies remain additive and non-breaking. Toggle only explicit capability gates.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {ROLE_ORDER.map((role) => (
                <button
                  key={role}
                  type="button"
                  disabled={saving}
                  onClick={() => setSelectedRole(role)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    selectedRole === role ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Capability</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Allowed</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.capabilities.map((cap) => (
                    <tr key={cap.code} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{cap.code}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cap.description || cap.label}</td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(matrix.roles[selectedRole]?.[cap.code])}
                          disabled={saving}
                          onChange={(event) => void handleRoleToggle(cap.code, event.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">User override view</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <select
                value={selectedUserId ?? ""}
                onChange={(event) => setSelectedUserId(Number(event.target.value))}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {users.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.username} ({row.role})
                  </option>
                ))}
              </select>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Override note (optional)"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm md:col-span-2"
              />
            </div>
            {selectedUser ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Capability</th>
                      <th className="px-3 py-2">Override</th>
                      <th className="px-3 py-2">Effective</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.capabilities.map((cap) => (
                      <tr key={`${selectedUser.id}-${cap.code}`} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{cap.code}</td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedUser.overrides?.[cap.code])}
                            disabled={saving}
                            onChange={(event) => void handleUserOverrideToggle(cap.code, event.target.checked)}
                          />
                        </td>
                        <td className="px-3 py-2">{selectedUser.effective?.[cap.code] ? "Allowed" : "Denied"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
