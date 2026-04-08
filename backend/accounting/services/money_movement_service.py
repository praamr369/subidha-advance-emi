from __future__ import annotations

from django.db import transaction

from accounting.models import MoneyMovement, MoneyMovementStatus, JournalEntryType
from accounting.services.journal_posting_service import (
    _log_accounting_event,
    create_journal_entry,
    post_journal_entry,
)


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

