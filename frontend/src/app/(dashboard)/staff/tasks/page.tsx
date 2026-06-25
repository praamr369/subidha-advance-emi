"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getStaffTasks,
  completeStaffTask,
  type StaffTask,
} from "@/services/staff";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-muted text-muted-foreground",
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default function StaffTasksPage() {
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getStaffTasks();
      setTasks(payload.results ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = useCallback(
    async (taskId: number, status: "IN_PROGRESS" | "DONE") => {
      setBusyId(taskId);
      try {
        await completeStaffTask(taskId, { status });
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update task.");
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "open")
      return tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
    return tasks.filter((t) => t.status === filter.toUpperCase());
  }, [tasks, filter]);

  const counts = useMemo(
    () => ({
      total: tasks.length,
      open: tasks.filter((t) => t.status === "OPEN").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      done: tasks.filter((t) => t.status === "DONE").length,
    }),
    [tasks]
  );

  return (
    <div className="space-y-6 p-1">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Tasks assigned to you. Mark progress or completion as you go.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: counts.total },
          { label: "Open", value: counts.open },
          { label: "In progress", value: counts.inProgress },
          { label: "Done", value: counts.done },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {card.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {card.value}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {["all", "open", "done", "cancelled"].map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition ${
              filter === key
                ? "bg-blue-100 text-blue-700"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No tasks for this filter.
        </p>
      ) : (
        <section className="space-y-3">
          {filtered.map((task) => {
            const closed =
              task.status === "DONE" || task.status === "CANCELLED";
            return (
              <article
                key={task.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {task.title}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          PRIORITY_STYLE[task.priority] ?? ""
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[task.status] ?? ""
                        }`}
                      >
                        {task.status.replace("_", " ")}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Due: {formatDate(task.due_date)}
                    </p>
                  </div>

                  {!closed && (
                    <div className="flex shrink-0 gap-2">
                      {task.status === "OPEN" && (
                        <button
                          onClick={() => handleAction(task.id, "IN_PROGRESS")}
                          disabled={busyId === task.id}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        >
                          Start
                        </button>
                      )}
                      <button
                        onClick={() => handleAction(task.id, "DONE")}
                        disabled={busyId === task.id}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {busyId === task.id ? "Saving…" : "Mark done"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
