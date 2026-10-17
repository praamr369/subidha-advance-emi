from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def is_n8n_ai_configured() -> bool:
    """Check if the n8n AI webhook endpoint is configured."""
    return bool(getattr(settings, "N8N_AI_WEBHOOK_URL", "").strip())


def query_n8n_ai(
    *,
    query: str,
    user: Any = None,
    scope: str | None = None,
) -> dict[str, Any] | None:
    """
    Forward user prompt to self-hosted/cloud n8n AI agent webhook.
    Returns parsed AI response dict or None if unconfigured/failed.
    Never raises an exception — designed for zero-disruption fallback.
    """
    webhook_url = getattr(settings, "N8N_AI_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return None

    timeout = getattr(settings, "N8N_AI_TIMEOUT_SECONDS", 15)
    auth_token = getattr(settings, "N8N_AI_AUTH_TOKEN", "").strip()

    user_data = {}
    if user and getattr(user, "is_authenticated", False):
        user_data = {
            "id": getattr(user, "id", None),
            "username": getattr(user, "username", "admin"),
            "name": getattr(user, "get_full_name", lambda: "")() or getattr(user, "username", "admin"),
            "role": getattr(user, "role", "ADMIN"),
        }

    erp_summary = {}
    metrics_summary = []
    try:
        from subscriptions.services.admin_erp_service import get_cached_admin_erp_summary
        erp_summary = get_cached_admin_erp_summary() or {}
        for item in erp_summary.get("business_health", []):
            label = item.get("label", item.get("key"))
            val = item.get("value")
            if val is not None:
                metrics_summary.append(f"- {label}: ₹{val} (count: {item.get('count', 0)})")
            else:
                metrics_summary.append(f"- {label}: {item.get('count', 0)}")
        for item in erp_summary.get("today_work", []):
            label = item.get("label", item.get("key"))
            cnt = item.get("count", 0)
            metrics_summary.append(f"- {label}: {cnt}")
    except Exception as exc:
        logger.warning("Could not fetch cached admin erp summary for n8n AI: %s", exc)

    live_metrics_text = "\n".join(metrics_summary) if metrics_summary else "No live summary available."

    payload = {
        "query": query,
        "scope": scope or "ALL",
        "user": user_data,
        "timestamp": timezone.now().isoformat(),
        "live_metrics_text": live_metrics_text,
        "live_erp_summary": erp_summary,
        "system_context": {
            "system_name": "SUBIDHA CORE - Furniture Retail & Lucky Plan EMI",
            "admin_mode": "Solopreneur Universal Control Center",
            "currency": "INR (₹)",
            "live_metrics_summary": live_metrics_text,
            "knowledge_guidelines": [
                "Read-only financial analysis; no silent data mutations",
                "Concise, actionable business summaries for store owner",
                "Always refer to the provided live metrics summary for current collections, dues, and overdue numbers",
            ],
        },
    }

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(webhook_url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "SUBIDHA-CORE-AI/1.0")

    if auth_token:
        req.add_header("Authorization", f"Bearer {auth_token}")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status not in (200, 201):
                logger.warning("n8n AI webhook returned non-200 status: %s", response.status)
                return None

            raw_body = response.read().decode("utf-8")
            data = json.loads(raw_body)

            # Support single object or array of objects from n8n output
            if isinstance(data, list) and data:
                data = data[0]

            if not isinstance(data, dict):
                logger.warning("n8n AI webhook returned non-dict payload: %s", raw_body[:200])
                return None

            # Extract answer text from various standard n8n / LangChain response keys
            answer = (
                data.get("answer")
                or data.get("output")
                or data.get("text")
                or data.get("response")
                or data.get("message")
            )

            if not answer or not isinstance(answer, str):
                logger.warning("n8n AI webhook payload missing answer text: %s", data)
                return None

            citations = data.get("citations")
            if not isinstance(citations, list):
                citations = []

            confidence = str(data.get("confidence", "HIGH")).upper()
            if confidence not in ("HIGH", "MEDIUM", "LOW"):
                confidence = "HIGH"

            return {
                "answer": answer.strip(),
                "citations": citations,
                "confidence": confidence,
                "engine": "n8n_ai",
                "model": data.get("model", "n8n-agent"),
            }

    except urllib.error.HTTPError as exc:
        logger.warning("n8n AI webhook HTTP error %s: %s", exc.code, exc.reason)
        return None
    except urllib.error.URLError as exc:
        logger.warning("n8n AI webhook URL error: %s", exc.reason)
        return None
    except TimeoutError:
        logger.warning("n8n AI webhook timed out after %s seconds", timeout)
        return None
    except Exception as exc:
        logger.exception("Unexpected error querying n8n AI webhook: %s", exc)
        return None

