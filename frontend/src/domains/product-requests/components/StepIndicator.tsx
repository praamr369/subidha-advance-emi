"use client";

interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: string;
  onStepClick?: (stepId: string) => void;
  allowBacktrack?: boolean;
}

export default function StepIndicator({
  steps,
  currentStep,
  onStepClick,
  allowBacktrack = false,
}: StepIndicatorProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="w-full">
      {/* Visual step line */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = index < currentIndex;
          const isNext = index > currentIndex;

          return (
            <div key={step.id} className="flex flex-1 items-center">
              {/* Step circle */}
              <button
                type="button"
                onClick={() => {
                  if (allowBacktrack && (isCompleted || isActive) && onStepClick) {
                    onStepClick(step.id);
                  }
                }}
                disabled={!allowBacktrack || (isNext && !onStepClick)}
                className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full font-semibold transition ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg ring-2 ring-primary ring-offset-2"
                    : isCompleted
                      ? "bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700"
                      : "bg-muted text-muted-foreground cursor-default"
                }`}
              >
                {isCompleted ? (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  index + 1
                )}
              </button>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`h-1 flex-1 transition ${
                    isCompleted ? "bg-emerald-600" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step labels */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {steps.map((step) => {
          const isActive = step.id === currentStep;
          const isCompleted = steps.findIndex((s) => s.id === currentStep) > steps.findIndex((s) => s.id === step.id);

          return (
            <div key={step.id} className="text-center">
              <div className={`text-sm font-semibold transition ${isActive ? "text-primary" : isCompleted ? "text-emerald-600" : "text-muted-foreground"}`}>
                {step.label}
              </div>
              {step.description && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {step.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
