"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Component } from "react";

import ActionButton from "@/components/ui/ActionButton";

type ErrorBoundaryProps = {
  children: ReactNode;
  onError?: (error: Error, info: { componentStack: string }) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Something went wrong while rendering this section.",
    };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.props.onError?.(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-3">
            <p className="text-sm font-semibold">This section failed to load.</p>
            <p className="text-sm text-destructive/90">{this.state.message}</p>
            <ActionButton type="button" variant="outline" onClick={this.handleRetry}>
              Try again
            </ActionButton>
          </div>
        </div>
      </div>
    );
  }
}
