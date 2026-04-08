from __future__ import annotations

from django.db import IntegrityError, transaction

from accounting.models import AccountingBridgePosting, JournalEntryType
from accounting.services.journal_posting_service import (
    _log_accounting_event,
    create_journal_entry,
    post_journal_entry,
)


@transaction.atomic
def post_bridge_entry(
    *,
    source_instance,
    purpose: str,
    entry_date,
    memo: str,
    lines: list[dict],
    posted_by=None,
):
    source_model = source_instance.__class__.__name__
    source_id = str(source_instance.pk)
    purpose = (purpose or "").strip().upper()
    if not purpose:
        raise ValueError("Bridge posting purpose is required.")

    existing = AccountingBridgePosting.objects.select_for_update().filter(
        source_model=source_model,
        source_id=source_id,
        purpose=purpose,
    ).select_related("journal_entry").first()
    if existing is not None:
        return existing.journal_entry, False

    journal_entry = create_journal_entry(
        entry_date=entry_date,
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=memo,
        source_model=source_model,
        source_id=source_id,
        lines=lines,
    )
    posted_journal, _ = post_journal_entry(
        journal_entry_id=journal_entry.id,
        posted_by=posted_by,
    )

    try:
        bridge = AccountingBridgePosting.objects.create(
            source_model=source_model,
            source_id=source_id,
            purpose=purpose,
            journal_entry=posted_journal,
        )
    except IntegrityError:
        bridge = AccountingBridgePosting.objects.get(
            source_model=source_model,
            source_id=source_id,
            purpose=purpose,
        )
        return bridge.journal_entry, False

    _log_accounting_event(
        event="ACCOUNTING_BRIDGE_POSTED",
        instance=bridge,
        performed_by=posted_by,
        metadata={
            "source_model": source_model,
            "source_id": source_id,
            "purpose": purpose,
            "journal_entry_id": posted_journal.id,
            "journal_entry_no": posted_journal.entry_no,
        },
    )
    return posted_journal, True
