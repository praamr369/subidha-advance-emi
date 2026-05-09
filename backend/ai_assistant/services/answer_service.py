from __future__ import annotations

import re
from dataclasses import dataclass

from ai_assistant.services.retrieval_service import RetrievedChunk


ACTION_PATTERNS = [
    r"\bcollect\b.*\bpayment\b",
    r"\breverse\b.*\bpayment\b",
    r"\bapprove\b.*\bwaiver\b",
    r"\brun\b.*\blucky\s*draw\b",
    r"\bapprove\b.*\bcommission\b.*\bpayout\b",
    r"\breconcile\b.*\bledger\b",
    r"\brefund\b.*\bdeposit\b",
    r"\bapprove\b.*\bkyc\b",
    r"\bcreate\b.*\bcontract\b",
    r"\bchange\b.*\bstock\b",
]


@dataclass(frozen=True)
class AIAnswer:
    answer: str
    citations: list[dict]
    confidence: str
    actionable_financial_instruction: bool = False


def is_financial_or_operational_action_request(query: str) -> bool:
    lowered = (query or "").lower()
    return any(re.search(pattern, lowered) for pattern in ACTION_PATTERNS)


def _excerpt(text: str, limit: int = 260) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "..."


def _citation(chunk: RetrievedChunk) -> dict:
    return {
        "source_id": chunk.source_id,
        "source_title": chunk.source_title,
        "chunk_id": chunk.chunk_id,
        "heading": chunk.heading,
        "excerpt": chunk.preview,
    }


def _summary_line(chunk: RetrievedChunk) -> str:
    label = chunk.heading or chunk.source_title
    return f"- {label}: {_excerpt(chunk.content, limit=220)}"


def _confidence(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "LOW"
    if chunks[0].score >= 80 or len(chunks) >= 3:
        return "HIGH"
    if chunks[0].score >= 25:
        return "MEDIUM"
    return "LOW"


def answer_query(*, query: str, retrieved_chunks: list[RetrievedChunk]) -> AIAnswer:
    if not retrieved_chunks:
        return AIAnswer(
            answer="I do not have enough approved source material to answer this.",
            citations=[],
            confidence="LOW",
        )

    citations = [_citation(chunk) for chunk in retrieved_chunks]
    if is_financial_or_operational_action_request(query):
        return AIAnswer(
            answer="I can explain the approved process, but I cannot perform or approve financial or operational actions.",
            citations=citations,
            confidence="MEDIUM",
            actionable_financial_instruction=True,
        )

    summary_lines = [_summary_line(chunk) for chunk in retrieved_chunks[:3]]
    answer = "Based on approved internal documents:\n" + "\n".join(summary_lines)
    return AIAnswer(
        answer=answer,
        citations=citations,
        confidence=_confidence(retrieved_chunks),
    )
