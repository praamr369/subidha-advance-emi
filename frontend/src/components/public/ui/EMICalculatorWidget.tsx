"use client";
import { useI18n } from "@/components/i18n/I18nProvider";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface EMICalculatorWidgetProps {
  className?: string;
}

export default function EMICalculatorWidget({ className }: EMICalculatorWidgetProps) {
  const { t } = useI18n();

  const [principal, setPrincipal] = useState(25000);
  const [months, setMonths] = useState(6);
  // Simple advance EMI logic: 0% interest for lucky plan, just divided by months
  const emi = Math.round(principal / months);

  return (
    <div className={cn("flex flex-col gap-6 rounded-[2rem] border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card)_95%,transparent)] p-6 md:p-8 shadow-[0_24px_54px_-24px_rgba(15,23,42,0.4)] dark:shadow-[0_24px_54px_-24px_rgba(0,0,0,0.6)]", className)}>
      
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-bold tracking-tight text-foreground">{t('public.EMICalculatorWidget_text1')}</h3>
        <p className="text-sm text-muted-foreground">{t('public.EMICalculatorWidget_text2')}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          {/* Principal Slider */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">{t('public.EMICalculatorWidget_text3')}</label>
              <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                ₹{principal.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={5000}
              max={150000}
              step={1000}
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
              className="w-full accent-primary h-2 bg-muted rounded-full appearance-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
              <span>{t('public.EMICalculatorWidget_text4')}</span>
              <span>{t('public.EMICalculatorWidget_text5')}</span>
            </div>
          </div>

          {/* Tenure Slider */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">{t('public.EMICalculatorWidget_text6')}</label>
              <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                {months} Months
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={18}
              step={1}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full accent-primary h-2 bg-muted rounded-full appearance-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
              <span>{t('public.EMICalculatorWidget_text8')}</span>
              <span>{t('public.EMICalculatorWidget_text9')}</span>
            </div>
          </div>
        </div>

        {/* 3D Flip Card Result */}
        <div className="relative flex items-center justify-center [perspective:1000px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={emi}
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: -90, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="flex w-full max-w-[280px] flex-col items-center justify-center gap-2 rounded-2xl bg-primary p-6 text-primary-foreground shadow-2xl absolute"
              style={{
                transformStyle: "preserve-3d",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 20px 40px -10px rgba(0,0,0,0.5)"
              }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/80">
                Monthly Payment
              </span>
              <div className="text-4xl font-extrabold tracking-tight">
                ₹{emi.toLocaleString()}
              </div>
              <span className="mt-2 text-[10px] font-medium text-primary-foreground/70">
                0% Interest Applied
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
