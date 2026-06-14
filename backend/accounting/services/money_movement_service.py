from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from accounting.models import ChartOfAccountType, MoneyMovement, MoneyMovementStatus, JournalEntryType, MONEY_ZERO
from accounting.services.journal_posting_service import (
    _log_accounting_event,
    create_journal_entry,
    post_journal_entry,
)


def _validate_finance_account_for_movement(account, *, label: str) -> None:
    if account is None:
        raise ValueError(f"{label} finance account is required.")
    if not account.is_active:
        raise ValueError(f"{label} finance account must be active.")
    if not account.is_real_settlement_account:
        raise ValueError(f"{label} finance account must be a real settlement account, not a system posting profile.")
    chart = getattr(account, "chart_account", None)
    if chart is None:
        raise ValueError(f"{label} finance account must be mapped to a chart account.")
    if not chart.is_active:
        raise ValueError(f"{label} finance account chart account must be active.")
    if chart.account_type != ChartOfAccountType.ASSET:
        raise ValueError(f"{label} finance account must map to an ASSET chart account.")
    if not chart.allow_manual_posting:
        raise ValueError(f"{label} finance account chart account must allow posting.")


def validate_money_movement_for_posting(movement: MoneyMovement) -> None:
    amount = Decimal(movement.amount or MONEY_ZERO)
    if amount <= MONEY_ZERO:
        raise ValueError("Money movement amount must be greater than zero.")
    if movement.from_finance_account_id == movement.to_finance_account_id:
        raise ValueError("Source and destination finance accounts must be different.")
    _validate_finance_account_for_movement(movement.from_finance_account, label="Source")
    _validate_finance_account_for_movement(movement.to_finance_account, label="Destination")


@transaction.atomic
def post_money_movement(*, money_movement_id: int, posted_by):
    movement = (
        MoneyMovement.objects.select_for_update()
        .select_related(
            "from_finance_account",
            "from_finance_account__chart_account",
            "to_finance_account",
            "to_finance_account__chart_account",
        )
        .get(pk=money_movement_id)
    )

    if movement.status == MoneyMovementStatus.POSTED and movement.posted_journal_entry_id:
        return movement, False

    if movement.status == MoneyMovementStatus.CANCELLED:
        raise ValueError("Cancelled money movements cannot be posted.")

    validate_money_movement_for_posting(movement)

    journal_entry = create_journal_entry(
        entry_date=movement.movement_date,
        entry_type=JournalEntryType.MONEY_MOVEMENT,
        memo=movement.notes or movement.reference_no or movement.movement_no,
        source_model="MoneyMovement",
        source_id=str(movement.id),
        lines=[
            {
                "chart_account": movement.to_finance_account.chart_account,
                "description": movement.movement_no,
                "debit_amount": movement.amount,
                "credit_amount": 0,
            },
            {
                "chart_account": movement.from_finance_account.chart_account,
                "description": movement.movement_no,
                "debit_amount": 0,
                "credit_amount": movement.amount,
            },
        ],
    )
    posted_journal, _ = post_journal_entry(
        journal_entry_id=journal_entry.id,
        posted_by=posted_by,
    )

    movement.posted_journal_entry = posted_journal
    movement.status = MoneyMovementStatus.POSTED
    movement.save(update_fields=["posted_journal_entry", "status", "updated_at"])

    _log_accounting_event(
        event="ACCOUNTING_MONEY_MOVEMENT_POSTED",
        instance=movement,
        performed_by=posted_by,
        metadata={
            "money_movement_id": movement.id,
            "movement_no": movement.movement_no,
            "journal_entry_id": posted_journal.id,
        },
    )
    return movement, True
