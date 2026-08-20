from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction

from accounting.models import AccountingBridgePosting
from accounting.services import accounting_bridge_candidate_service as base
from accounting.services.bridge_posting_service import post_bridge_entry

SOURCE_MODEL = "AdvanceForfeiture"
EVENT_KEY = "advance_forfeiture"
SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit customer advance, forfeiture, or finance-account records."
)


def _ref(row) -> str:
    return f"FORF-CA-{row.advance_id}"


def _lines(row, event_key: str):
    from payments.models import AdvanceForfeitureStatus

    warnings: list[str] = []
    if row.status != AdvanceForfeitureStatus.FORFEITED:
        return [], [f"Forfeiture is {row.status}, not FORFEITED."], None

    amount = base._money(row.forfeited_amount)
    if amount <= Decimal("0.00"):
        warnings.append("Forfeited amount must be greater than zero.")

    liability_account = base._posting_profile_account("CUSTOMER_ADVANCE_UNEARNED_REVENUE")
    income_account = base._posting_profile_account("ADVANCE_FORFEITURE_INCOME")

    if not liability_account:
        warnings.append("CUSTOMER_ADVANCE_UNEARNED_REVENUE posting profile is not mapped.")
    if not income_account:
        warnings.append("ADVANCE_FORFEITURE_INCOME posting profile is not mapped.")

    if warnings:
        return [], warnings, None

    lines = [
        base._line(
            account=liability_account,
            debit=amount,
            credit=Decimal("0.00"),
            narration=f"Advance forfeiture — clear liability CA#{row.advance_id}",
        ),
        base._line(
            account=income_account,
            debit=Decimal("0.00"),
            credit=amount,
            narration=f"Advance forfeiture income — Limitation Act s.3 dormancy CA#{row.advance_id}",
        ),
    ]
    return lines, warnings, None


def list_bridge_candidates(filters=None) -> list[dict]:
    from payments.models import AdvanceForfeiture, AdvanceForfeitureStatus

    qs = (
        AdvanceForfeiture.objects
        .filter(status=AdvanceForfeitureStatus.FORFEITED)
        .select_related("advance__customer", "advance__finance_account")
        .order_by("-forfeiture_date", "-id")
    )

    already_posted = set(
        AccountingBridgePosting.objects
        .filter(source_model=SOURCE_MODEL)
        .values_list("source_id", flat=True)
    )

    candidates = []
    for row in qs[:200]:
        if str(row.id) in already_posted:
            continue
        lines, warnings, _ = _lines(row, EVENT_KEY)
        candidates.append({
            "candidate_id": f"advanceforfeiture:{row.id}:{EVENT_KEY}",
            "source_model": SOURCE_MODEL,
            "source_id": str(row.id),
            "event_key": EVENT_KEY,
            "reference": _ref(row),
            "amount": str(row.forfeited_amount),
            "date": str(row.forfeiture_date),
            "customer_name": getattr(row.advance.customer, "name", None) if row.advance.customer_id else None,
            "lines": [{"account": l["account"].name, "debit": str(l["debit"]), "credit": str(l["credit"]), "narration": l["narration"]} for l in lines] if lines else [],
            "warnings": warnings,
            "can_post": len(lines) > 0 and len(warnings) == 0,
        })
    return candidates
