// frontend/src/components/ui/card.tsx
import { cn } from "@/lib/utils";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: ReactNode;
  variant?: "default" | "bordered" | "ghost";
  size?: "sm" | "md" | "lg";
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, title, children, variant = "default", size = "md", ...props }, ref) => {
    const sizeClasses = {
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
    };

    const variantClasses = {
      default: "surface-panel border border-border bg-card shadow-sm",
      bordered: "surface-panel border border-border bg-card",
      ghost: "border-0 bg-transparent shadow-none",
    };

    return (
      <section
        ref={ref}
        className={cn(
          "rounded-2xl",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {title && (
          <h3 className="mb-3 text-lg font-semibold text-card-foreground">
            {title}
          </h3>
        )}
        {children}
      </section>
    );
  }
);

Card.displayName = "Card";

export default Card;
