"use client";

import React from "react";
import { Loader } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success" | "warning";
export type ButtonSize = "sm" | "md" | "lg";

export interface ModernButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-700",
  secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300 active:bg-slate-400 dark:bg-slate-700 dark:text-white",
  outline: "border-2 border-slate-300 text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-white",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 dark:bg-red-700",
  success: "bg-green-600 text-white hover:bg-green-700 active:bg-green-800 dark:bg-green-700",
  warning: "bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 dark:bg-amber-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-base rounded-lg",
  lg: "px-6 py-3 text-lg rounded-lg",
};

export const ModernButton: React.FC<ModernButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  disabled = false,
  children,
  className,
  ...props
}) => {
  return (
    <button
      className={`font-medium transition-all flex items-center gap-2 ${
        fullWidth ? "w-full justify-center" : ""
      } ${sizeClasses[size]} ${variantClasses[variant]} ${
        disabled || loading ? "opacity-50 cursor-not-allowed" : ""
      } ${className || ""}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader className="w-4 h-4 animate-spin" />
      ) : (
        icon && iconPosition === "left" && icon
      )}
      {children}
      {icon && iconPosition === "right" && !loading && icon}
    </button>
  );
};

export default ModernButton;
