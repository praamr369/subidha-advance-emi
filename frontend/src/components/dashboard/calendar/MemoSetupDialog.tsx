import React from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import ModalShell from "@/components/ui/ModalShell";
import ActionButton from "@/components/ui/ActionButton";
import { createDashboardMemo, CreateMemoPayload } from "@/services/dashboard-calendar";

interface MemoSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  onSuccess: () => void;
}

const MEMO_PRESETS = [
  { label: "EMI Collection", title: "EMI Collection Due", color: "red", icon: "💰" },
  { label: "Outstanding", title: "Outstanding Follow-up", color: "red", icon: "⚠️" },
  { label: "Payment Reminder", title: "Payment Reminder", color: "orange", icon: "🔔" },
  { label: "Delivery", title: "Delivery Scheduled", color: "blue", icon: "🚚" },
  { label: "Purchase", title: "Purchase Required", color: "blue", icon: "📦" },
  { label: "Salary / Payroll", title: "Payroll Processing", color: "orange", icon: "💵" },
  { label: "Vendor Payment", title: "Vendor Payment Due", color: "orange", icon: "🏢" },
  { label: "Commission", title: "Commission Payout", color: "emerald", icon: "📊" },
  { label: "Rent / Lease", title: "Rent/Lease Due", color: "red", icon: "🏠" },
  { label: "Product Return", title: "Product Pickup/Return", color: "orange", icon: "↩️" },
  { label: "Lead Follow-up", title: "Lead Follow-up", color: "emerald", icon: "👤" },
  { label: "Warranty / Service", title: "Warranty Service Due", color: "red", icon: "🔧" },
  { label: "Production / BOM", title: "Production Schedule", color: "blue", icon: "🏭" },
  { label: "Custom", title: "", color: "slate", icon: "📝" },
] as const;

export function MemoSetupDialog({ open, onOpenChange, defaultDate, onSuccess }: MemoSetupDialogProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<CreateMemoPayload>();
  const [error, setError] = React.useState<string | null>(null);
  const [showPresets, setShowPresets] = React.useState(true);

  React.useEffect(() => {
    if (open && defaultDate) {
      reset({
        date: format(defaultDate, "yyyy-MM-dd"),
        color_code: "slate"
      });
      setError(null);
      setShowPresets(true);
    }
  }, [open, defaultDate, reset]);

  const applyPreset = (preset: typeof MEMO_PRESETS[number]) => {
    if (preset.label === "Custom") {
      setValue("title", "");
      setValue("color_code", "slate");
    } else {
      setValue("title", preset.title);
      setValue("color_code", preset.color);
    }
    setShowPresets(false);
  };

  const onSubmit = async (data: CreateMemoPayload) => {
    try {
      await createDashboardMemo(data);
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.readableMessage || e.message || "Failed to save memo");
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={() => onOpenChange(false)}
      title="Add Calendar Memo"
      panelClassName="sm:max-w-[480px] p-6"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Add Calendar Reminder</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {defaultDate ? format(defaultDate, "EEEE, MMM d, yyyy") : "Select a date"}
        </p>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-3 rounded-lg">{error}</div>}

      {showPresets ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Quick presets</p>
          <div className="grid grid-cols-2 gap-2">
            {MEMO_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm font-medium transition hover:bg-muted/60 hover:-translate-y-0.5 hover:shadow-sm"
              >
                <span className="text-base">{preset.icon}</span>
                <span className="text-foreground">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setShowPresets(true)}
              className="text-xs text-primary hover:underline"
            >
              ← Back to presets
            </button>
          </div>
          <div className="grid gap-2">
            <label htmlFor="date" className="text-sm font-medium">Date</label>
            <input
              id="date"
              type="date"
              required
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              {...register("date", { required: true })}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="title" className="text-sm font-medium">Title</label>
            <input
              id="title"
              required
              placeholder="e.g. Call supplier about delay"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              {...register("title", { required: true })}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="color_code" className="text-sm font-medium">Priority</label>
            <select
              id="color_code"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              {...register("color_code")}
            >
              <option value="slate">Normal (Gray)</option>
              <option value="red">Urgent (Red)</option>
              <option value="orange">Warning (Orange)</option>
              <option value="blue">Info (Blue)</option>
              <option value="emerald">Success (Green)</option>
            </select>
          </div>
          <div className="grid gap-2">
            <label htmlFor="description" className="text-sm font-medium">Notes (optional)</label>
            <textarea
              id="description"
              placeholder="Any additional details..."
              className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              {...register("description")}
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <ActionButton type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</ActionButton>
            <ActionButton type="submit" variant="primary" loading={isSubmitting}>
              Save Reminder
            </ActionButton>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
