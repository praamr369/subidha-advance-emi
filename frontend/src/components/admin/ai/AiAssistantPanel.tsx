"use client";

import { useState } from "react";

import AiAnswerCard from "@/components/admin/ai/AiAnswerCard";
import AiCitationList from "@/components/admin/ai/AiCitationList";
import AiFeedbackButtons from "@/components/admin/ai/AiFeedbackButtons";
import AiQueryBox from "@/components/admin/ai/AiQueryBox";
import AiSafetyBanner from "@/components/admin/ai/AiSafetyBanner";
import ErrorState from "@/components/feedback/ErrorState";
import Card from "@/components/ui/card";
import { isAiDisabledError, queryAI, type AiQueryResponse } from "@/services/admin-ai";

export default function AiAssistantPanel() {
  const [response, setResponse] = useState<AiQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const nextResponse = await queryAI(query);
      setResponse(nextResponse);
      setDisabled(false);
    } catch (err) {
      if (isAiDisabledError(err)) {
        setDisabled(true);
        setResponse(null);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "AI assistant query failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <AiSafetyBanner disabled={disabled} />
      {error ? <ErrorState title="AI assistant unavailable" description={error} /> : null}
      {disabled ? (
        <Card variant="bordered" title="AI assistant is disabled">
          <p className="text-sm leading-6 text-muted-foreground">
            The backend feature flag is off. Query input is hidden until the AI assistant is enabled by an administrator.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card variant="bordered" title="Query Panel">
            <AiQueryBox loading={loading} onSubmit={runQuery} />
          </Card>
          <div className="flex flex-col gap-5">
            <AiAnswerCard response={response} />
            <AiCitationList citations={response?.citations ?? []} />
            <AiFeedbackButtons queryLogId={response?.queryLogId ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}
