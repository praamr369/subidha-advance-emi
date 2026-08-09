"use client";

import React from "react";
import { Package, Sofa, Zap } from "lucide-react";

interface BarcodePreset {
  name: string;
  icon: React.ReactNode;
  prefix: string;
  description: string;
  color: string;
}

interface BarcodePresetsProps {
  onSelectPreset: (prefix: string) => void;
  disabled?: boolean;
}

/**
 * Quick-select presets for common product categories.
 * Applies a category prefix to barcode generation for better organization.
 */
const BarcodePresets: React.FC<BarcodePresetsProps> = ({ onSelectPreset, disabled = false }) => {
  const presets: BarcodePreset[] = [
    {
      name: "Raw Material",
      icon: <Package className="h-5 w-5" />,
      prefix: "RM",
      description: "Raw materials & components",
      color: "bg-blue-100 border-blue-300 hover:bg-blue-200",
    },
    {
      name: "Furniture",
      icon: <Sofa className="h-5 w-5" />,
      prefix: "FG",
      description: "Finished goods furniture",
      color: "bg-green-100 border-green-300 hover:bg-green-200",
    },
    {
      name: "Electronics",
      icon: <Zap className="h-5 w-5" />,
      prefix: "EL",
      description: "Electronic items & parts",
      color: "bg-amber-100 border-amber-300 hover:bg-amber-200",
    },
  ];

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-gray-700">Quick Presets</label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.prefix}
            onClick={() => onSelectPreset(preset.prefix)}
            disabled={disabled}
            className={`p-3 rounded-lg border text-left transition ${preset.color} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-start gap-2">
              <div className="text-gray-700 flex-shrink-0 mt-1">{preset.icon}</div>
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-900">{preset.name}</div>
                <div className="text-xs text-gray-600">{preset.description}</div>
                <div className="text-xs font-mono font-bold text-gray-700 mt-1">
                  Prefix: {preset.prefix}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BarcodePresets;
