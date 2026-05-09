import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const variants = {
  /** Long-form public policy and marketing copy */
  public:
    "max-w-none text-sm leading-7 text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1.5 [&_p+p]:mt-3",
  /** Compact helper text inside dashboards */
  panel: "max-w-none text-sm leading-6 text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_code]:rounded-md [&_code]:border [&_code]:border-border [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]",
};

export type TypographyProps = ComponentProps<"div"> & {
  variant?: keyof typeof variants;
};

/** Semantic prose wrapper for policy pages and in-app help (no typography plugin required). */
export function Typography({ className, variant = "public", ...props }: TypographyProps) {
  return <div className={cn(variants[variant], className)} data-slot="typography" {...props} />;
}
