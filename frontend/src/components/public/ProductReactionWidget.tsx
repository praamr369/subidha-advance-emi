"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Heart, Sparkles } from "lucide-react";
import { getProductReactions, reactToProduct, type ProductReactionSummary } from "@/lib/public-api";
import { getOrCreateVisitorId } from "./PublicVisitorTracker";

interface ProductReactionWidgetProps {
  productId: number;
  productName: string;
}

export default function ProductReactionWidget({
  productId,
  productName,
}: ProductReactionWidgetProps) {
  const [reactions, setReactions] = useState<ProductReactionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState<"LIKE" | "DISLIKE" | null>(null);

  useEffect(() => {
    const sessionId = getOrCreateVisitorId();
    getProductReactions(productId, sessionId)
      .then((data) => {
        setReactions(data);
        if (data.user_reaction) {
          setVoted(data.user_reaction);
        }
      })
      .catch(() => {
        // Silently ignore network failures on public reaction widgets
      });
  }, [productId]);

  const handleVote = async (isLike: boolean) => {
    const sessionId = getOrCreateVisitorId();
    if (!sessionId || loading) return;

    const voteType = isLike ? "LIKE" : "DISLIKE";
    const previousReaction = voted;
    setVoted(voteType);
    setLoading(true);

    // Optimistic state update
    if (reactions) {
      let likes = reactions.likes_count;
      let dislikes = reactions.dislikes_count;

      if (previousReaction === "LIKE" && !isLike) {
        likes = Math.max(0, likes - 1);
        dislikes += 1;
      } else if (previousReaction === "DISLIKE" && isLike) {
        dislikes = Math.max(0, dislikes - 1);
        likes += 1;
      } else if (!previousReaction) {
        if (isLike) likes += 1;
        else dislikes += 1;
      }

      const total = likes + dislikes;
      const like_percentage = total > 0 ? Math.round((likes / total) * 100) : 0;
      setReactions({
        ...reactions,
        likes_count: likes,
        dislikes_count: dislikes,
        total_reactions: total,
        like_percentage,
        user_reaction: voteType,
      });
    }

    try {
      const updated = await reactToProduct(productId, {
        session_id: sessionId,
        is_like: isLike,
      });
      setReactions(updated);
      setVoted(updated.user_reaction);
    } catch {
      // Revert on failure
      setVoted(previousReaction);
    } finally {
      setLoading(false);
    }
  };

  const likes = reactions?.likes_count ?? 0;
  const dislikes = reactions?.dislikes_count ?? 0;
  const total = reactions?.total_reactions ?? 0;
  const percentage = reactions?.like_percentage ?? (total > 0 ? Math.round((likes / total) * 100) : 100);

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition hover:shadow-md sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Heart className="h-4 w-4 text-rose-500 fill-rose-500/20" />
            <span>Do you like this product?</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Help other customers know if {productName} meets expectations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Like Button */}
          <button
            type="button"
            onClick={() => handleVote(true)}
            disabled={loading}
            aria-label="Like product"
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${
              voted === "LIKE"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            <ThumbsUp className={`h-4 w-4 ${voted === "LIKE" ? "fill-primary-foreground" : ""}`} />
            <span>Like</span>
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-foreground">
              {likes}
            </span>
          </button>

          {/* Dislike Button */}
          <button
            type="button"
            onClick={() => handleVote(false)}
            disabled={loading}
            aria-label="Dislike product"
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${
              voted === "DISLIKE"
                ? "bg-zinc-800 text-white shadow-sm dark:bg-zinc-200 dark:text-zinc-900"
                : "border border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            <ThumbsDown className={`h-4 w-4 ${voted === "DISLIKE" ? "fill-current" : ""}`} />
            <span>Dislike</span>
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
              {dislikes}
            </span>
          </button>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-3 flex items-center gap-3 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{percentage}% of customers like this item</span>
          </div>
          <span>•</span>
          <span>{total} total customer responses</span>
        </div>
      )}
    </div>
  );
}
