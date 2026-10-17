"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import FormField from "@/components/ui/FormField";

type AiQueryBoxProps = {
  disabled?: boolean;
  loading?: boolean;
  onSubmit: (query: string) => void;
};

const PROMPT_TEMPLATES = [
  { label: "📊 Today's Collections", prompt: "Summarize today's business collections, targets, and pending receipts." },
  { label: "⚠️ Overdue EMIs", prompt: "List customers with overdue EMIs and highest collection risk." },
  { label: "📦 Low Stock Check", prompt: "Check warehouse inventory items running low on stock and need reordering." },
  { label: "🏆 Lucky Plan Batches", prompt: "What is the enrollment and draw status of active Lucky Plan batches?" },
];

export default function AiQueryBox({ disabled = false, loading = false, onSubmit }: AiQueryBoxProps) {
  const [query, setQuery] = useState("");

  const handleSelectTemplate = (prompt: string) => {
    setQuery(prompt);
    onSubmit(prompt);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        if (!trimmed || disabled || loading) return;
        onSubmit(trimmed);
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Quick Solopreneur Prompts
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.label}
              type="button"
              disabled={disabled || loading}
              onClick={() => handleSelectTemplate(tmpl.prompt)}
              className="rounded-lg border border-border bg-muted/60 hover:bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition disabled:opacity-50"
            >
              {tmpl.label}
            </button>
          ))}
        </div>
      </div>

      <FormField
        label="Ask SUBIDHA AI Assistant"
        htmlFor="ai-query"
        helpText="Powered by n8n AI agent with internal knowledge fallback. Read-only financial analysis."
        disabled={disabled || loading}
      >
        <textarea
          id="ai-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled || loading}
          placeholder="e.g. How much collection is due today? Or ask about any product, scheme, or process..."
          className="min-h-28 w-full resize-y rounded-xl bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Automated reasoning with zero silent financial mutations.</p>
        <ActionButton
          type="submit"
          variant="primary"
          loading={loading}
          disabled={disabled || !query.trim()}
          leftIcon={<Send className="h-4 w-4" />}
        >
          Ask Assistant
        </ActionButton>
      </div>
    </form>
  );
}
