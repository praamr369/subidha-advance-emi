from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Any

from django.db import transaction

from accounting.models import MoneyMovement
from accounting.services.finance_posting_service import FinancePostingService
from accounting.services.money_movement_service import post_money_movement


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _idempotency_marker(idempotency_key: str) -> str:
    return f"[finance_transfer_idempotency_key:{idempotency_key}]"


def strip_finance_transfer_idempotency_marker(notes: str | None) -> str:
    value = notes or ""
    marker_start = value.find("[finance_transfer_idempotency_key:")
    if marker_start == -1:
        return value.strip()
    return value[:marker_start].strip()


def _account_payload(account) -> dict[str, Any]:
    chart = getattr(account, "chart_account", None)
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "is_active": account.is_active,
        "chart_account": {
            "id": getattr(chart, "id", None),
            "code": getattr(chart, "code", None),
            "name": getattr(chart, "name", None),
            "account_type": getattr(chart, "account_type", None),
            "is_active": getattr(chart, "is_active", None),
        }
        if chart
        else None,
    }


def _canonical_transfer_key(
    *,
    movement_date,
    from_finance_account_id: int,
    to_finance_account_id: int,
    amount,
    reference_no: str | None = None,
) -> str:
    normalized = "|".join(
        [
            str(movement_date),
            str(from_finance_account_id),
            str(to_finance_account_id),
            f"{_money(amount):.2f}",
            (reference_no or "").strip(),
        ]
    )
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
    return f"finance-transfer-{digest}"


class FinanceTransferService:
    @classmethod
    def preview_transfer(
        cls,
        *,
        movement_date,
        from_finance_account_id: int,
        to_finance_account_id: int,
        amount,
        reference_no: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        normalized_amount = _money(amount)
        if normalized_amount <= Decimal("0.00"):
            raise ValueError("Transfer amount must be greater than zero.")
        if from_finance_account_id == to_finance_account_id:
            raise ValueError("Source and destination finance accounts must be different.")

        from_finance_account = FinancePostingService.resolve_operational_finance_account(
            finance_account_id=from_finance_account_id,
        )
        to_finance_account = FinancePostingService.resolve_operational_finance_account(
            finance_account_id=to_finance_account_id,
        )
        idempotency_key = _canonical_transfer_key(
            movement_date=movement_date,
            from_finance_account_id=from_finance_account_id,
            to_finance_account_id=to_finance_account_id,
            amount=normalized_amount,
            reference_no=reference_no,
        )
        marker = _idempotency_marker(idempotency_key)
        existing = MoneyMovement.objects.filter(notes__contains=marker).select_related(
            "from_finance_account",
            "to_finance_account",
            "posted_journal_entry",
        ).first()
        return {
            "can_post": True,
            "idempotency_key": idempotency_key,
            "movement_date": str(movement_date),
            "amount": f"{normalized_amount:.2f}",
            "reference_no": (reference_no or "").strip() or None,
            "notes": (notes or "").strip(),
            "from_finance_account": _account_payload(from_finance_account),
            "to_finance_account": _account_payload(to_finance_account),
            "lines": [
                {
                    "chart_account": _account_payload(to_finance_account)["chart_account"],
                    "description": "Finance transfer destination debit",
                    "debit_amount": f"{normalized_amount:.2f}",
                    "credit_amount": "0.00",
                },
                {
                    "chart_account": _account_payload(from_finance_account)["chart_account"],
                    "description": "Finance transfer source credit",
                    "debit_amount": "0.00",
                    "credit_amount": f"{normalized_amount:.2f}",
                },
            ],
            "total_debit": f"{normalized_amount:.2f}",
            "total_credit": f"{normalized_amount:.2f}",
            "is_balanced": True,
            "already_posted": bool(existing and existing.posted_journal_entry_id),
            "existing_transfer_id": getattr(existing, "id", None),
            "existing_movement_no": getattr(existing, "movement_no", None),
            "safety_text": "Preview is read-only. Posting requires confirm=true and the exact idempotency_key returned by this preview.",
        }

    @classmethod
    @transaction.atomic
    def create_transfer(
        cls,
        *,
        movement_date,
        from_finance_account_id: int,
        to_finance_account_id: int,
        amount,
        performed_by,
        reference_no: str | None = None,
        notes: str | None = None,
        idempotency_key: str | None = None,
    ):
        normalized_amount = _money(amount)
        expected_key = _canonical_transfer_key(
            movement_date=movement_date,
            from_finance_account_id=from_finance_account_id,
            to_finance_account_id=to_finance_account_id,
            amount=normalized_amount,
            reference_no=reference_no,
        )
        candidate_key = (idempotency_key or "").strip()
        if not candidate_key:
            raise ValueError("idempotency_key is required.")
        if candidate_key != expected_key:
            raise ValueError("idempotency_key does not match the current finance transfer preview.")

        preview = cls.preview_transfer(
            movement_date=movement_date,
            from_finance_account_id=from_finance_account_id,
            to_finance_account_id=to_finance_account_id,
            amount=normalized_amount,
            reference_no=reference_no,
            notes=notes,
        )
        marker = _idempotency_marker(candidate_key)
        existing = (
            MoneyMovement.objects.select_for_update()
            .select_related("from_finance_account", "to_finance_account", "posted_journal_entry")
            .filter(notes__contains=marker)
            .first()
        )
        if existing is not None:
            if (
                existing.movement_date != movement_date
                or existing.from_finance_account_id != from_finance_account_id
                or existing.to_finance_account_id != to_finance_account_id
                or _money(existing.amount) != normalized_amount
                or (existing.reference_no or "") != ((reference_no or "").strip() or None or "")
            ):
                raise ValueError("Existing finance transfer idempotency key belongs to a different transfer.")
            movement, posted = post_money_movement(money_movement_id=existing.id, posted_by=performed_by)
            return movement, posted

        from_finance_account = FinancePostingService.resolve_operational_finance_account(
            finance_account_id=from_finance_account_id,
        )
        to_finance_account = FinancePostingService.resolve_operational_finance_account(
            finance_account_id=to_finance_account_id,
        )
        public_notes = (notes or "").strip()
        audit_notes = f"{public_notes}\n{marker}".strip()
        movement = MoneyMovement.objects.create(
            movement_date=movement_date,
            from_finance_account=from_finance_account,
            to_finance_account=to_finance_account,
            amount=normalized_amount,
            reference_no=(reference_no or "").strip() or None,
            notes=audit_notes,
        )
        movement, created = post_money_movement(
            money_movement_id=movement.id,
            posted_by=performed_by,
        )
        movement.finance_transfer_preview = preview
        return movement, created
