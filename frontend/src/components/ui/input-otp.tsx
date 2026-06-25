"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";

import { cn } from "@/lib/utils";

function OtpDigitSlot(props: SlotProps) {
  return (
    <div
      className={cn(
        "relative flex h-12 w-10 items-center justify-center border-y border-r border-slate-300 bg-white text-base font-semibold tabular-nums text-foreground transition-all first:rounded-l-xl first:border-l last:rounded-r-xl",
        props.isActive &&
          "z-10 ring-2 ring-slate-500/40 ring-offset-2 ring-offset-white"
      )}
    >
      <span aria-hidden>{props.char ?? props.placeholderChar ?? ""}</span>
      {props.hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-px animate-caret-blink bg-slate-900" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

export type SixDigitNumericOtpProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * Accessible 6-digit numeric OTP entry (input-otp / shadcn-style slots).
 * Used only where the backend already verifies OTP (password reset).
 */
export function SixDigitNumericOtp({
  id,
  value,
  onChange,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SixDigitNumericOtpProps) {
  return (
    <div data-testid="password-reset-otp" className="w-full">
      <OTPInput
        id={id}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        containerClassName="group relative flex w-full justify-center has-[:disabled]:opacity-60"
        pushPasswordManagerStrategy="none"
        render={({ slots }) => (
          <div className="flex justify-center rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            {slots.map((slot, idx) => (
              <OtpDigitSlot key={idx} {...slot} />
            ))}
          </div>
        )}
      />
    </div>
  );
}
