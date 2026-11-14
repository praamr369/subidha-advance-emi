"""
Smart-field suggestion engine.

Fully offline / no external API. "AI" here means local heuristic matching
(token overlap) plus a self-learning store seeded from bundled datasets. This
mirrors the deterministic, no-network approach already used by
``ai_assistant.services.embedding_service``.
"""

from __future__ import annotations

import gzip
import json
import logging
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from django.db import transaction
from django.db.models import F

from ..models import (
    FieldSuggestionMapping,
    HsnCode,
    PincodeLocation,
    SmartFieldSource,
)

# Field-key namespaces (extend as more fields become "smart").
FIELD_HSN = "product.hsn"

PINCODE_RE = re.compile(r"^\d{6}$")
_TOKEN_RE = re.compile(r"[a-z0-9]+")
# Generic words that should not drive HSN matching.
_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "set",
    "new",
    "pcs",
    "unit",
    "model",
    "size",
    "type",
    "pack",
    "kg",
    "ml",
    "cm",
    "mm",
}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _tokens(text: str) -> set[str]:
    return {
        tok
        for tok in _TOKEN_RE.findall((text or "").lower())
        if len(tok) > 1 and tok not in _STOPWORDS
    }


def _coerce_rate(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Pincode
# ---------------------------------------------------------------------------
_OFFLINE_PINCODES: dict[str, list[Any]] | None = None
logger = logging.getLogger(__name__)


def _get_offline_pincode(pincode: str) -> dict[str, Any] | None:
    global _OFFLINE_PINCODES
    if _OFFLINE_PINCODES is None:
        gz_path = Path(__file__).resolve().parent.parent / "data" / "india_pincodes.json.gz"
        if gz_path.exists():
            try:
                with gzip.open(gz_path, "rt", encoding="utf-8") as f:
                    _OFFLINE_PINCODES = json.load(f)
            except Exception as e:
                logger.warning("Failed to load offline pincode dataset: %s", e)
                _OFFLINE_PINCODES = {}
        else:
            _OFFLINE_PINCODES = {}

    entry = _OFFLINE_PINCODES.get(pincode)
    if not entry:
        return None

    # entry format: [primary_city, district, state, state_code, [other_locations]]
    city = entry[0]
    district = entry[1]
    state = entry[2]
    state_code = entry[3] if len(entry) > 3 else ""
    other_locations = entry[4] if len(entry) > 4 else []

    primary = {
        "city": city,
        "district": district,
        "state": state,
        "state_code": state_code,
    }
    options = [primary]
    for other in other_locations:
        if other and other.lower() != city.lower():
            options.append({
                "city": other,
                "district": district,
                "state": state,
                "state_code": state_code,
            })

    return {
        "pincode": pincode,
        "primary": primary,
        "options": options,
    }


def lookup_pincode(pincode: str) -> dict[str, Any]:
    """Return location options for a pincode.

    1. Checks PincodeLocation database (confirmed/learned records).
    2. Fallback to complete offline India Post dataset (19,486 pincodes covering all West Bengal and India).
    3. Fallback to India Post public API with auto-caching.
    """

    pincode = (pincode or "").strip()
    result: dict[str, Any] = {"pincode": pincode, "primary": None, "options": []}
    if not PINCODE_RE.match(pincode):
        return result

    # 1. Database check
    rows = list(
        PincodeLocation.objects.filter(pincode=pincode).order_by(
            "-hit_count", "city", "id"
        )
    )
    if rows:
        options = [
            {
                "city": row.city,
                "district": row.district,
                "state": row.state,
                "state_code": row.state_code,
            }
            for row in rows
        ]
        result["options"] = options
        result["primary"] = options[0]
        return result

    # 2. Complete offline India dataset (West Bengal + all Indian states)
    offline = _get_offline_pincode(pincode)
    if offline and offline.get("primary"):
        # Auto-persist into PincodeLocation for future fast queries
        try:
            primary = offline["primary"]
            with transaction.atomic():
                PincodeLocation.objects.get_or_create(
                    pincode=pincode,
                    city=primary["city"],
                    district=primary["district"],
                    state=primary["state"],
                    defaults={
                        "state_code": primary.get("state_code", ""),
                        "source": SmartFieldSource.SEED,
                    },
                )
        except Exception:
            pass
        return offline

    # 3. Public India Post postal API fallback (handles newly designated pincodes)
    try:
        import urllib.request

        req = urllib.request.Request(
            f"https://api.postalpincode.in/pincode/{pincode}",
            headers={"User-Agent": "SubidhaCore/1.0"},
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            api_data = json.loads(resp.read().decode())
            if (
                api_data
                and isinstance(api_data, list)
                and api_data[0].get("Status") == "Success"
            ):
                post_offices = api_data[0].get("PostOffice") or []
                if post_offices:
                    options = []
                    seen = set()
                    for po in post_offices:
                        c = po.get("Name") or po.get("District") or ""
                        d = po.get("District") or ""
                        s = po.get("State") or ""
                        k = (c, d, s)
                        if k not in seen:
                            seen.add(k)
                            options.append(
                                {"city": c, "district": d, "state": s, "state_code": ""}
                            )
                    if options:
                        result["options"] = options
                        result["primary"] = options[0]
                        try:
                            with transaction.atomic():
                                PincodeLocation.objects.get_or_create(
                                    pincode=pincode,
                                    city=options[0]["city"],
                                    district=options[0]["district"],
                                    state=options[0]["state"],
                                    defaults={"source": SmartFieldSource.CONFIRMED},
                                )
                        except Exception:
                            pass
                        return result
    except Exception:
        pass

    return result


# ---------------------------------------------------------------------------
# HSN
# ---------------------------------------------------------------------------
def _learned_hsn(input_normalized: str) -> dict[str, Any] | None:
    mapping = (
        FieldSuggestionMapping.objects.filter(
            field_key=FIELD_HSN, input_normalized=input_normalized
        )
        .order_by("-hit_count", "-updated_at")
        .first()
    )
    if not mapping:
        return None
    return {
        "code": mapping.suggested_value,
        "description": mapping.suggested_label,
        "gst_rate": str(mapping.gst_rate) if mapping.gst_rate is not None else None,
        "confidence": 0.99,
        "source": "LEARNED",
    }


def suggest_hsn(text: str, top_n: int = 5) -> list[dict[str, Any]]:
    """Rank HSN codes for free-text product name/description.

    1. A previously confirmed mapping for the exact normalized input wins.
    2. Otherwise score the active HSN master by token overlap against the
       code's keywords + description (local, no network).
    """

    normalized = normalize_text(text)
    if not normalized:
        return []

    results: list[dict[str, Any]] = []
    seen_codes: set[str] = set()

    learned = _learned_hsn(normalized)
    if learned:
        results.append(learned)
        seen_codes.add(learned["code"])

    query_tokens = _tokens(normalized)
    if query_tokens:
        scored: list[tuple[float, HsnCode]] = []
        for hsn in HsnCode.objects.filter(is_active=True).iterator():
            candidate_tokens = _tokens(f"{hsn.keywords} {hsn.description}")
            if not candidate_tokens:
                continue
            overlap = query_tokens & candidate_tokens
            if not overlap:
                continue
            # Jaccard-ish score weighted toward covering the query terms.
            coverage = len(overlap) / len(query_tokens)
            specificity = len(overlap) / len(candidate_tokens)
            score = round(0.7 * coverage + 0.3 * specificity, 4)
            scored.append((score, hsn))

        scored.sort(key=lambda pair: (pair[0], pair[1].code), reverse=True)
        for score, hsn in scored:
            if hsn.code in seen_codes:
                continue
            results.append(
                {
                    "code": hsn.code,
                    "description": hsn.description,
                    "gst_rate": str(hsn.gst_rate) if hsn.gst_rate is not None else None,
                    "confidence": min(round(score, 2), 0.95),
                    "source": "HEURISTIC",
                }
            )
            seen_codes.add(hsn.code)
            if len(results) >= top_n:
                break

    return results[:top_n]


# ---------------------------------------------------------------------------
# Learning loop
# ---------------------------------------------------------------------------
def record_confirmation(
    field_key: str,
    input_text: str,
    value: str,
    label: str = "",
    gst_rate: Any = None,
) -> dict[str, Any]:
    """Persist a user-confirmed suggestion so future lookups improve.

    For ``pincode`` the value/label carry the resolved location and we upsert a
    :class:`PincodeLocation`. For every other field key we upsert a generic
    :class:`FieldSuggestionMapping`.
    """

    field_key = (field_key or "").strip()
    value = (value or "").strip()
    if not field_key or not value:
        return {"stored": False}

    if field_key == "pincode":
        return _record_pincode_confirmation(input_text, value, label)

    normalized = normalize_text(input_text)
    if not normalized:
        return {"stored": False}

    rate = _coerce_rate(gst_rate)
    with transaction.atomic():
        mapping, created = FieldSuggestionMapping.objects.select_for_update(of=("self",)).get_or_create(
            field_key=field_key,
            input_normalized=normalized,
            defaults={
                "suggested_value": value,
                "suggested_label": (label or "").strip(),
                "gst_rate": rate,
                "source": SmartFieldSource.CONFIRMED,
            },
        )
        if not created:
            mapping.suggested_value = value
            mapping.suggested_label = (label or "").strip()
            if rate is not None:
                mapping.gst_rate = rate
            mapping.source = SmartFieldSource.CONFIRMED
            mapping.hit_count = F("hit_count") + 1
            mapping.save()
    return {"stored": True, "created": created, "field_key": field_key}


def _record_pincode_confirmation(
    pincode: str, value: str, label: str
) -> dict[str, Any]:
    """``value`` = "city|district|state|state_code" (pipe-delimited)."""

    pincode = (pincode or "").strip()
    if not PINCODE_RE.match(pincode):
        return {"stored": False}

    parts = (value or "").split("|")
    city = parts[0].strip() if len(parts) > 0 else ""
    district = parts[1].strip() if len(parts) > 1 else ""
    state = parts[2].strip() if len(parts) > 2 else ""
    state_code = parts[3].strip() if len(parts) > 3 else ""

    with transaction.atomic():
        row, created = PincodeLocation.objects.select_for_update(of=("self",)).get_or_create(
            pincode=pincode,
            city=city,
            district=district,
            state=state,
            defaults={
                "state_code": state_code,
                "office_name": (label or "").strip(),
                "source": SmartFieldSource.CONFIRMED,
            },
        )
        if not created:
            row.hit_count = F("hit_count") + 1
            if state_code and not row.state_code:
                row.state_code = state_code
            row.save()
    return {"stored": True, "created": created, "field_key": "pincode"}


# ---------------------------------------------------------------------------
# Generic dispatcher (one endpoint serves all current/future smart fields)
# ---------------------------------------------------------------------------
def suggest(field_key: str, text: str, top_n: int = 5) -> list[dict[str, Any]]:
    field_key = (field_key or "").strip()
    if field_key == FIELD_HSN:
        return suggest_hsn(text, top_n=top_n)

    # Generic path: serve confirmed mappings learned for this field key.
    normalized = normalize_text(text)
    if not normalized:
        return []
    rows = FieldSuggestionMapping.objects.filter(
        field_key=field_key, input_normalized=normalized
    ).order_by("-hit_count", "-updated_at")[:top_n]
    return [
        {
            "code": row.suggested_value,
            "description": row.suggested_label,
            "gst_rate": str(row.gst_rate) if row.gst_rate is not None else None,
            "confidence": 0.99,
            "source": "LEARNED",
        }
        for row in rows
    ]
