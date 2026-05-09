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

export default function AiQueryBox({ disabled = false, loading = false, onSubmit }: AiQueryBoxProps) {
  const [query, setQuery] = useState("");

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
      <FormField
        label="Ask internal docs"
        htmlFor="ai-query"
        helpText="Answers are limited to approved AI knowledge sources."
        disabled={disabled || loading}
      >
        <textarea
          id="ai-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled || loading}
          placeholder="How do I reset business data safely?"
          className="min-h-32 w-full resize-y rounded-xl bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">No customer or payment record is queried by this panel.</p>
        <ActionButton
          type="submit"
          variant="primary"
          loading={loading}
          disabled={disabled || !query.trim()}
          leftIcon={<Send className="h-4 w-4" />}
        >
          Ask
        </ActionButton>
      </div>
    </form>
  );
}
