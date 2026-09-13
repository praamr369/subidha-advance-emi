"use client";
import { useI18n } from "@/components/i18n/I18nProvider";

import Link from "next/link";
import { useId, useState } from "react";

import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface EMICalculatorWidgetProps {
  className?: string;
}

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

const SLIDER_CLASS = cn(
  "h-2 w-full cursor-pointer [accent-color:var(--primary)] focus-visible:ring-offset-2",
  tone.focusRing
);

export default function EMICalculatorWidget({ className }: EMICalculatorWidgetProps) {
  const { t } = useI18n();
  const principalId = useId();
  const monthsId = useId();

  const [principal, setPrincipal] = useState(25000);
  const [months, setMonths] = useState(6);
  // Lucky Plan EMI is the plan value divided by the tenure.
  const emi = Math.round(principal / months);
  const monthsLabel = `${months} ${t("public.EMICalculatorWidget_text12")}`;

  return (
    <div
      className={cn(
        "grid gap-6 rounded-2xl border p-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:p-8",
        tone.surface,
        tone.line,
        className
      )}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className={cn("text-xl font-semibold tracking-tight", tone.text)}>{t("public.EMICalculatorWidget_text1")}</h3>
          <p className={cn("text-sm", tone.muted)}>{t("public.EMICalculatorWidget_text2")}</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={principalId} className={cn("text-sm font-semibold", tone.text)}>
              {t("public.EMICalculatorWidget_text3")}
            </label>
            <span className={cn("rounded-lg px-3 py-1 text-sm font-semibold tabular-nums", tone.fillSoft, tone.accentText)}>{inr(principal)}</span>
          </div>
          <input
            id={principalId}
            aria-valuetext={inr(principal)}
            type="range"
            min={5000}
            max={150000}
            step={1000}
            value={principal}
            onChange={(e) => setPrincipal(Number(e.target.value))}
            className={SLIDER_CLASS}
          />
          <div className={cn("flex justify-between text-[11px] font-medium", tone.muted)}>
            <span>{t("public.EMICalculatorWidget_text4")}</span>
            <span>{t("public.EMICalculatorWidget_text5")}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={monthsId} className={cn("text-sm font-semibold", tone.text)}>
              {t("public.EMICalculatorWidget_text6")}
            </label>
            <span className={cn("rounded-lg px-3 py-1 text-sm font-semibold tabular-nums", tone.fillSoft, tone.accentText)}>{monthsLabel}</span>
          </div>
          <input
            id={monthsId}
            aria-valuetext={monthsLabel}
            type="range"
            min={3}
            max={18}
            step={1}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className={SLIDER_CLASS}
          />
          <div className={cn("flex justify-between text-[11px] font-medium", tone.muted)}>
            <span>{t("public.EMICalculatorWidget_text8")}</span>
            <span>{t("public.EMICalculatorWidget_text9")}</span>
          </div>
        </div>
      </div>

      <div className={cn("flex flex-col justify-center rounded-2xl p-6", tone.fill)} aria-live="polite">
        <span className={cn("text-xs font-semibold uppercase tracking-[0.12em]", tone.onFillMuted)}>
          {t("public.EMICalculatorWidget_text10")}
        </span>
        <span className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{inr(emi)}</span>
        <span className={cn("mt-2 text-sm", tone.onFillMuted)}>
          {monthsLabel} · {inr(principal)} {t("public.EMICalculatorWidget_text13")}
        </span>
        <p className={cn("mt-4 border-t pt-4 text-xs leading-5", tone.onFillLine, tone.onFillMuted)}>
          {t("public.EMICalculatorWidget_text14")}
        </p>
        <Link
          href={ROUTES.public.apply}
          className={cn(
            "mt-5 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            tone.invertFill
          )}
        >
          {t("public.EMICalculatorWidget_text15")}
        </Link>
      </div>
    </div>
  );
}
