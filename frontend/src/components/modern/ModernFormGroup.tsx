"use client";

import React from "react";
import { AlertCircle, CheckCircle, Info } from "lucide-react";

export interface ModernFormGroupProps {
  label?: string;
  description?: string;
  error?: string;
  info?: string;
  required?: boolean;
  children: React.ReactNode;
  success?: boolean;
  disabled?: boolean;
}

export const ModernFormGroup: React.FC<ModernFormGroupProps> = ({
  label,
  description,
  error,
  info,
  required = false,
  children,
  success = false,
  disabled = false,
}) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      )}

      <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
        {children}
      </div>

      {/* Messages */}
      <div className="space-y-1">
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {success && !error && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>Looking good!</span>
          </div>
        )}

        {info && !error && !success && (
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <Info className="w-4 h-4" />
            <span>{info}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModernFormGroup;
