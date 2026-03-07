"use client";

import { type ReactNode } from "react";

type WizardShellProps = {
  step: number;
  totalSteps: number;
  title: string;
  children: ReactNode;
};

export default function WizardShell({ step, totalSteps, title, children }: WizardShellProps) {
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: "#4b5563" }}>
        Step {step} of {totalSteps}
      </p>
      {children}
    </section>
  );
}
