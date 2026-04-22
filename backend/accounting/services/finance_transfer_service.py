from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from accounting.models import MoneyMovement
from accounting.services.finance_posting_service import FinancePostingService
from accounting.services.money_movement_service import post_money_movement


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


class FinanceTransferService:
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
    ):
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
        movement = MoneyMovement.objects.create(
            movement_date=movement_date,
            from_finance_account=from_finance_account,
            to_finance_account=to_finance_account,
            amount=normalized_amount,
            reference_no=(reference_no or "").strip() or None,
            notes=(notes or "").strip(),
        )
        movement, created = post_money_movement(
            money_movement_id=movement.id,
            posted_by=performed_by,
        )
        return movement, created
