"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import FormField from "@/components/ui/FormField";
import { submitFeedback, type SubmitAiFeedbackInput } from "@/services/admin-ai";

type AiFeedbackButtonsProps = {
  queryLogId: number | null;
};

export default function AiFeedbackButtons({ queryLogId }: AiFeedbackButtonsProps) {
  const [comment, setComment] = useState("");
  const [submittedRating, setSubmittedRating] = useState<string | null>(null);
  const [loadingRating, setLoadingRating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (rating: SubmitAiFeedbackInput["rating"]) => {
    if (!queryLogId || loadingRating) return;
    setLoadingRating(rating);
    setError(null);
    try {
      await submitFeedback({ queryLog: queryLogId, rating, comment });
      setSubmittedRating(rating);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback could not be submitted.");
    } finally {
      setLoadingRating(null);
    }
  };

  if (!queryLogId) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Feedback</p>
          <p className="mt-1 text-xs text-muted-foreground">Feedback is logged against this AI query only.</p>
        </div>
        <FormField label="Comment" htmlFor="ai-feedback-comment">
          <textarea
            id="ai-feedback-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Optional note"
            className="min-h-20 w-full resize-y rounded-xl bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            variant="secondary"
            size="sm"
            loading={loadingRating === "HELPFUL"}
            disabled={Boolean(loadingRating)}
            leftIcon={<ThumbsUp className="h-4 w-4" />}
            onClick={() => void submit("HELPFUL")}
          >
            Helpful
          </ActionButton>
          <ActionButton
            variant="outline"
            size="sm"
            loading={loadingRating === "NOT_HELPFUL"}
            disabled={Boolean(loadingRating)}
            leftIcon={<ThumbsDown className="h-4 w-4" />}
            onClick={() => void submit("NOT_HELPFUL")}
          >
            Not Helpful
          </ActionButton>
        </div>
        {submittedRating ? (
          <p className="text-xs font-semibold text-emerald-700">Feedback recorded: {submittedRating.replace("_", " ")}</p>
        ) : null}
        {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
