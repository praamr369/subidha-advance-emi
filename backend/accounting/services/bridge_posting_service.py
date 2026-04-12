from __future__ import annotations

from datetime import date

from django.db import IntegrityError, transaction

from accounting.models import AccountingBridgePosting, JournalEntryType
from accounting.services.journal_posting_service import (
    _log_accounting_event,
    create_journal_entry,
    post_journal_entry,
)


def _clean_text(value) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_trace_metadata(metadata) -> dict:
    return metadata if isinstance(metadata, dict) else {}


def _source_branch_trace(source_instance) -> dict:
    payload: dict[str, object] = {}
    branch_id = getattr(source_instance, "branch_id", None)
    cash_counter_id = getattr(source_instance, "cash_counter_id", None)
    if branch_id:
        payload["branch_id"] = branch_id
    if cash_counter_id:
        payload["cash_counter_id"] = cash_counter_id
    return payload


def _infer_source_reference(source_instance) -> str | None:
    for attribute in (
        "document_no",
        "receipt_no",
        "note_no",
        "bill_no",
        "claim_no",
        "request_no",
        "sale_no",
        "settlement_no",
        "movement_no",
        "voucher_no",
        "batch_code",
        "reference_no",
        "entry_no",
        "asset_code",
    ):
        value = _clean_text(getattr(source_instance, attribute, None))
        if value:
            return value
    return str(getattr(source_instance, "pk", "") or "").strip() or None


def _infer_source_document_no(source_instance) -> str:
    return _infer_source_reference(source_instance) or ""


def _infer_source_event_date(source_instance, fallback) -> date | None:
    for attribute in (
        "invoice_date",
        "receipt_date",
        "note_date",
        "bill_date",
        "payment_date",
        "settlement_date",
        "movement_date",
        "expense_date",
        "adjustment_date",
        "payout_date",
        "entry_date",
    ):
        value = getattr(source_instance, attribute, None)
        if isinstance(value, date):
            return value
    return fallback if isinstance(fallback, date) else None


@transaction.atomic
def post_bridge_entry(
    *,
    source_instance,
    purpose: str,
    entry_date,
    memo: str,
    lines: list[dict],
    voucher_type: str | None = None,
    source_type: str | None = None,
    source_reference: str | None = None,
    source_document_no: str | None = None,
    source_event_date=None,
    trace_metadata: dict | None = None,
    posted_by=None,
):
    source_model = source_instance.__class__.__name__
    source_id = str(source_instance.pk)
    purpose = (purpose or "").strip().upper()
    if not purpose:
        raise ValueError("Bridge posting purpose is required.")

    resolved_voucher_type = _clean_text(voucher_type) or purpose
    resolved_source_type = _clean_text(source_type) or source_model.upper()
    resolved_source_reference = _clean_text(source_reference) or _infer_source_reference(source_instance)
    resolved_source_document_no = _clean_text(source_document_no) or _infer_source_document_no(source_instance) or ""
    resolved_source_event_date = source_event_date or _infer_source_event_date(
        source_instance,
        entry_date,
    )
    resolved_trace_metadata = {
        **_source_branch_trace(source_instance),
        **_normalize_trace_metadata(trace_metadata),
    }

    existing = AccountingBridgePosting.objects.select_for_update().filter(
        source_model=source_model,
        source_id=source_id,
        purpose=purpose,
    ).select_related("journal_entry").first()
    if existing is not None:
        _log_accounting_event(
            event="ACCOUNTING_BRIDGE_SKIPPED_DUPLICATE",
            instance=existing,
            performed_by=posted_by,
            metadata={
                "source_model": source_model,
                "source_id": source_id,
                "purpose": purpose,
                "journal_entry_id": existing.journal_entry_id,
            },
        )
        return existing.journal_entry, False

    journal_entry = create_journal_entry(
        entry_date=entry_date,
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=memo,
        source_model=source_model,
        source_id=source_id,
        voucher_type=resolved_voucher_type,
        source_type=resolved_source_type,
        source_reference=resolved_source_reference,
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
            voucher_type=resolved_voucher_type,
            source_type=resolved_source_type,
            source_reference=resolved_source_reference or "",
            source_document_no=resolved_source_document_no,
            source_event_date=resolved_source_event_date,
            trace_metadata=resolved_trace_metadata,
            journal_entry=posted_journal,
        )
    except IntegrityError:
        bridge = AccountingBridgePosting.objects.get(
            source_model=source_model,
            source_id=source_id,
            purpose=purpose,
        )
        _log_accounting_event(
            event="ACCOUNTING_BRIDGE_SKIPPED_DUPLICATE",
            instance=bridge,
            performed_by=posted_by,
            metadata={
                "source_model": source_model,
                "source_id": source_id,
                "purpose": purpose,
                "journal_entry_id": bridge.journal_entry_id,
            },
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
            "voucher_type": resolved_voucher_type,
            "source_type": resolved_source_type,
            "source_reference": resolved_source_reference,
            "journal_entry_id": posted_journal.id,
            "journal_entry_no": posted_journal.entry_no,
        },
    )
    return posted_journal, True
