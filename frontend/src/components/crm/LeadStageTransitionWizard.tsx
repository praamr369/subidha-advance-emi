"use client";

import React, { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, X } from "lucide-react";
import type { LeadStage } from "./LeadStageWorkbench";

interface TransitionStep {
  id: string;
  label: string;
  description: string;
  required: boolean;
  completed: boolean;
}

interface LeadStageTransitionWizardProps {
  currentStage: LeadStage;
  targetStage: LeadStage;
  onConfirm: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Multi-step wizard for lead stage transitions with validation.
 * Ensures required information is collected before allowing transition.
 */
const LeadStageTransitionWizard: React.FC<LeadStageTransitionWizardProps> = ({
  currentStage,
  targetStage,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Define steps based on transition
  const getSteps = (): TransitionStep[] => {
    const baseSteps: TransitionStep[] = [
      {
        id: "review",
        label: "Review Stage Change",
        description: `Moving lead from ${currentStage} to ${targetStage}`,
        required: true,
        completed: true,
      },
    ];

    if (targetStage === "QUALIFIED") {
      baseSteps.push(
        {
          id: "contact",
          label: "Verify Contact Info",
          description: "Ensure phone/email is correct",
          required: true,
          completed: !!formData.contact,
        },
        {
          id: "budget",
          label: "Confirm Budget",
          description: "Budget range or approval",
          required: false,
          completed: false,
        }
      );
    } else if (targetStage === "NEGOTIATION") {
      baseSteps.push(
        {
          id: "proposal",
          label: "Send Proposal",
          description: "Formal proposal delivered",
          required: true,
          completed: !!formData.proposal,
        },
        {
          id: "timeline",
          label: "Agree Timeline",
          description: "Expected decision date",
          required: true,
          completed: !!formData.timeline,
        }
      );
    } else if (targetStage === "WON") {
      baseSteps.push(
        {
          id: "contract",
          label: "Contract Signed",
          description: "All parties have signed",
          required: true,
          completed: !!formData.contract,
        },
        {
          id: "amount",
          label: "Deal Amount",
          description: "Final contract value",
          required: true,
          completed: !!formData.amount,
        }
      );
    } else if (targetStage === "LOST") {
      baseSteps.push({
        id: "reason",
        label: "Loss Reason",
        description: "Why did we lose this deal?",
        required: true,
        completed: !!formData.reason,
      });
    }

    return baseSteps;
  };

  const steps = getSteps();
  const step = steps[currentStep];
  const allRequired = steps.filter((s) => s.required);
  const allCompleted = allRequired.every((s) => s.completed);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleConfirm = () => {
    if (allCompleted) {
      onConfirm(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="border-b p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Stage Transition</h2>
            <p className="text-sm text-gray-600 mt-1">
              Step {currentStep + 1} of {steps.length}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex gap-2">
            {steps.map((s, idx) => (
              <div
                key={s.id}
                className={`flex-1 h-2 rounded-full transition ${
                  idx <= currentStep ? "bg-blue-500" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 space-y-6">
          {/* Step Header */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              {step.completed && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {step.label}
              {step.required && <span className="text-red-500 text-lg">*</span>}
            </h3>
            <p className="text-sm text-gray-600 mt-1">{step.description}</p>
          </div>

          {/* Input Fields */}
          <div className="space-y-4">
            {step.id === "review" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  You are about to transition this lead from <strong>{currentStage}</strong> to{" "}
                  <strong>{targetStage}</strong>. This action is logged in the audit trail.
                </p>
              </div>
            )}

            {step.id === "contact" && (
              <input
                type="text"
                placeholder="Verified phone or email"
                value={formData.contact || ""}
                onChange={(e) => handleInputChange("contact", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}

            {step.id === "budget" && (
              <input
                type="text"
                placeholder="e.g., $50K - $100K"
                value={formData.budget || ""}
                onChange={(e) => handleInputChange("budget", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}

            {step.id === "proposal" && (
              <input
                type="text"
                placeholder="Proposal ID or description"
                value={formData.proposal || ""}
                onChange={(e) => handleInputChange("proposal", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}

            {step.id === "timeline" && (
              <input
                type="date"
                value={formData.timeline || ""}
                onChange={(e) => handleInputChange("timeline", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}

            {step.id === "contract" && (
              <input
                type="text"
                placeholder="Contract ID or reference"
                value={formData.contract || ""}
                onChange={(e) => handleInputChange("contract", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}

            {step.id === "amount" && (
              <input
                type="number"
                placeholder="Contract amount (USD)"
                value={formData.amount || ""}
                onChange={(e) => handleInputChange("amount", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}

            {step.id === "reason" && (
              <select
                value={formData.reason || ""}
                onChange={(e) => handleInputChange("reason", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select reason...</option>
                <option value="budget">Budget constraints</option>
                <option value="timeline">Timeline mismatch</option>
                <option value="competitor">Lost to competitor</option>
                <option value="fit">Poor product fit</option>
                <option value="other">Other</option>
              </select>
            )}
          </div>

          {/* Required Fields Warning */}
          {!allCompleted && targetStage !== "LOST" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Complete all required fields to proceed with the transition.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex gap-3 justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="px-4 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>

            {currentStep < steps.length - 1 ? (
              <button
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={!allCompleted || isLoading}
                className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? "Transitioning..." : "Confirm Transition"}
                {!isLoading && <CheckCircle2 className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadStageTransitionWizard;
