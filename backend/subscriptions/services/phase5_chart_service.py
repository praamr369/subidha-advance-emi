from __future__ import annotations

from datetime import date


def build_chart_payload(
    *,
    labels: list[str],
    series: list[dict],
    totals: dict,
    source: str,
    date_from: date | None = None,
    date_to: date | None = None,
    empty_reason: str | None = None,
    ignored_filters: list[dict[str, str]] | None = None,
) -> dict:
    return {
        "labels": labels,
        "series": series,
        "totals": totals,
        "meta": {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "source": source,
            "empty_reason": empty_reason,
            "ignored_filters": ignored_filters or [],
        },
    }

