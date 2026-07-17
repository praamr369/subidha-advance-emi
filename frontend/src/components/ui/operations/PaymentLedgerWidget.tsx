"use client";

import React from "react";
import { CheckCircle2, Circle, ArrowRightLeft, Clock, FileText } from "lucide-react";

function money(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

type PaymentTimelineEvent = {
  kind: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
};

export type PaymentLedgerWidgetProps = {
  paymentId: number;
  amount: string | number;
  isReversed: boolean;
  timelineEvents: PaymentTimelineEvent[];
};

export default function PaymentLedgerWidget({
  paymentId,
  amount,
  isReversed,
  timelineEvents,
}: PaymentLedgerWidgetProps) {
  // Simple heuristic for mapping generic timeline events to a visual flow
  const hasCreated = timelineEvents.some((e) => e.kind === "PAYMENT_CREATED");
  const hasVerified = timelineEvents.some((e) => e.kind === "PAYMENT_VERIFIED");
  const hasAllocated = timelineEvents.some((e) => e.kind === "PAYMENT_ALLOCATED" || e.kind === "EMI_ALLOCATION_POSTED");
  
  const steps = [
    {
      id: "created",
      label: "Collected",
      completed: hasCreated,
      icon: Clock,
    },
    {
      id: "verified",
      label: "Verified",
      completed: hasVerified,
      icon: FileText,
    },
    {
      id: "allocated",
      label: "Ledger Allocated",
      completed: hasAllocated,
      icon: CheckCircle2,
    }
  ];

  if (isReversed) {
    steps.push({
      id: "reversed",
      label: "Reversed",
      completed: true,
      icon: ArrowRightLeft,
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md mb-6">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-blue-500/5 blur-3xl"></div>

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {/* Left Side: Highlights */}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Payment Control
            </h3>
            {isReversed && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                REVERSED
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {money(amount)}
            </span>
            <span className="text-sm text-muted-foreground">ID #{paymentId}</span>
          </div>
        </div>

        {/* Right Side: Flow Visualization */}
        <div className="flex-1 md:ml-12 md:max-w-md pb-6 md:pb-0">
          <div className="relative flex items-center justify-between">
            {/* Connecting Line */}
            <div className="absolute left-0 top-1/2 -z-10 h-[2px] w-full -translate-y-1/2 bg-border">
              <div 
                className="h-full bg-primary transition-all duration-1000"
                style={{ 
                  width: `${(steps.filter(s => s.completed).length - 1) / (steps.length - 1) * 100}%` 
                }}
              />
            </div>

            {/* Nodes */}
            {steps.map((step, idx) => {
              const StepIcon = step.completed ? step.icon : Circle;
              const isLastAndReversed = isReversed && idx === steps.length - 1;
              return (
                <div key={step.id} className="relative flex flex-col items-center">
                  <div 
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-4 border-card transition-colors ${
                      step.completed 
                        ? isLastAndReversed
                          ? "bg-red-500 text-white" 
                          : "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <StepIcon className="h-4 w-4" />
                  </div>
                  <div className={`mt-3 absolute top-full text-center text-xs font-medium w-24 -ml-7 ${step.completed ? (isLastAndReversed ? "text-red-600" : "text-foreground") : "text-muted-foreground"}`}>
                    {step.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
