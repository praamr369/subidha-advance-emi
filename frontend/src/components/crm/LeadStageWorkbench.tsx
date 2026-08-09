"use client";

import React from "react";
import { CheckCircle2, Circle, XCircle, ChevronRight } from "lucide-react";

export type LeadStage = "PROSPECT" | "QUALIFIED" | "NEGOTIATION" | "WON" | "LOST";

interface StageNode {
  id: LeadStage;
  label: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}

interface LeadStageWorkbenchProps {
  currentStage: LeadStage;
  onStageClick: (stage: LeadStage) => void;
  disabled?: boolean;
}

/**
 * Visual lead stage timeline with color-coded progression.
 * Shows current stage, completed stages, and available transitions.
 */
const LeadStageWorkbench: React.FC<LeadStageWorkbenchProps> = ({
  currentStage,
  onStageClick,
  disabled = false,
}) => {
  const stages: StageNode[] = [
    {
      id: "PROSPECT",
      label: "Prospect",
      description: "Initial lead",
      color: "bg-gray-100 border-gray-300 text-gray-700",
      icon: <Circle className="h-5 w-5" />,
    },
    {
      id: "QUALIFIED",
      label: "Qualified",
      description: "Verified potential",
      color: "bg-blue-100 border-blue-300 text-blue-700",
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      id: "NEGOTIATION",
      label: "Negotiation",
      description: "Active discussion",
      color: "bg-amber-100 border-amber-300 text-amber-700",
      icon: <Circle className="h-5 w-5" />,
    },
    {
      id: "WON",
      label: "Won",
      description: "Deal closed",
      color: "bg-green-100 border-green-300 text-green-700",
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      id: "LOST",
      label: "Lost",
      description: "Deal lost",
      color: "bg-red-100 border-red-300 text-red-700",
      icon: <XCircle className="h-5 w-5" />,
    },
  ];

  const getStageStatus = (stage: LeadStage): "completed" | "current" | "pending" | "lost" => {
    const stageOrder: Record<LeadStage, number> = {
      PROSPECT: 0,
      QUALIFIED: 1,
      NEGOTIATION: 2,
      WON: 3,
      LOST: 3,
    };

    if (stage === "LOST") return currentStage === "LOST" ? "current" : "pending";
    if (stageOrder[stage] < stageOrder[currentStage]) return "completed";
    if (stage === currentStage) return "current";
    return "pending";
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg border">
      {/* Timeline Header */}
      <div>
        <h3 className="text-lg font-bold text-gray-900">Lead Stage Timeline</h3>
        <p className="text-sm text-gray-600 mt-1">Click a stage to transition</p>
      </div>

      {/* Visual Timeline */}
      <div className="flex items-center gap-2 overflow-x-auto py-4">
        {stages.map((stage, idx) => {
          const status = getStageStatus(stage.id);
          const isClickable = status === "current" || status === "pending";

          return (
            <React.Fragment key={stage.id}>
              {/* Stage Node */}
              <button
                onClick={() => isClickable && onStageClick(stage.id)}
                disabled={disabled || !isClickable}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition whitespace-nowrap
                  ${
                    status === "current"
                      ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-500 shadow-lg"
                      : status === "completed"
                        ? "bg-green-50 border-green-300"
                        : status === "lost"
                          ? "bg-red-50 border-red-300"
                          : "bg-gray-50 border-gray-300 hover:border-gray-400"
                  }
                  ${disabled || !isClickable ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                <div
                  className={`p-2 rounded-full ${stage.color} ${
                    status === "current" ? "ring-4 ring-blue-200" : ""
                  }`}
                >
                  {stage.icon}
                </div>
                <div>
                  <div className="font-semibold text-sm">{stage.label}</div>
                  <div className="text-xs text-gray-600">{stage.description}</div>
                </div>
              </button>

              {/* Connector */}
              {idx < stages.length - 1 && (
                <div
                  className={`flex-shrink-0 h-1 w-6 rounded ${
                    getStageStatus(stages[idx + 1].id) === "completed" ||
                    getStageStatus(stages[idx + 1].id) === "current"
                      ? "bg-green-400"
                      : "bg-gray-300"
                  }`}
                >
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Stage Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 text-sm mb-2">Current Stage</h4>
        <p className="text-sm text-blue-800">
          {stages.find((s) => s.id === currentStage)?.label}:{" "}
          {stages.find((s) => s.id === currentStage)?.description}
        </p>
      </div>

      {/* Available Actions */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 text-sm mb-2">Available Transitions</h4>
        <p className="text-xs text-gray-600">
          Click a stage above to initiate the transition. A validation wizard will guide you through
          required steps.
        </p>
      </div>
    </div>
  );
};

export default LeadStageWorkbench;
