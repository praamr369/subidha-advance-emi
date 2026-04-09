from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    MONEY_ZERO,
    ChartOfAccount,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.period_service import assert_accounting_period_open
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _log_accounting_event(*, event: str, instance, performed_by=None, metadata=None):
    payload = {"event": event}
    if isinstance(metadata, dict):
        payload.update(metadata)
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=instance,
        performed_by=performed_by,
        metadata=payload,
    )


def _validate_line_payloads(lines: list[dict], *, entry_type: str):
    if not lines:
        raise ValueError("At least one journal line is required.")

    total_debits = MONEY_ZERO
    total_credits = MONEY_ZERO

    for line in lines:
        chart_account = line["chart_account"]
        debit_amount = _money(line.get("debit_amount"))
        credit_amount = _money(line.get("credit_amount"))

        if chart_account is None or not isinstance(chart_account, ChartOfAccount):
            raise ValueError("Each journal line must reference a valid chart account.")

        if entry_type == JournalEntryType.MANUAL and not chart_account.allow_manual_posting:
            raise ValueError(
                f"Chart account {chart_account.code} does not allow manual posting."
            )

        debit_positive = debit_amount > MONEY_ZERO
        credit_positive = credit_amount > MONEY_ZERO
        if debit_positive == credit_positive:
            raise ValueError(
                "Each journal line must have exactly one positive side."
            )

        if not chart_account.is_active:
            raise ValueError(f"Chart account {chart_account.code} is inactive.")

        total_debits += debit_amount
        total_credits += credit_amount

    if total_debits != total_credits:
        raise ValueError("Journal entry is unbalanced.")


def _replace_lines(journal_entry: JournalEntry, lines: list[dict]):
    journal_entry.lines.all().delete()
    JournalEntryLine.objects.bulk_create(
        [
            JournalEntryLine(
                journal_entry=journal_entry,
                chart_account=line["chart_account"],
                description=line.get("description", ""),
                debit_amount=_money(line.get("debit_amount")),
                credit_amount=_money(line.get("credit_amount")),
            )
            for line in lines
        ]
    )


@transaction.atomic
def create_journal_entry(
    *,
    entry_date,
    entry_type: str,
    memo: str = "",
    source_model: str | None = None,
    source_id: str | None = None,
    voucher_type: str | None = None,
    source_type: str | None = None,
    source_reference: str | None = None,
    lines: list[dict] | None = None,
) -> JournalEntry:
    if lines:
        _validate_line_payloads(lines, entry_type=entry_type)

    journal_entry = JournalEntry.objects.create(
        entry_date=entry_date,
        entry_type=entry_type,
        memo=memo,
        source_model=source_model,
        source_id=str(source_id) if source_id is not None else None,
        voucher_type=voucher_type,
        source_type=source_type,
        source_reference=source_reference,
    )

    if lines:
        _replace_lines(journal_entry, lines)

    return journal_entry


@transaction.atomic
def update_draft_journal_entry(
    *,
    journal_entry_id: int,
    entry_date=None,
    memo: str | None = None,
    lines: list[dict] | None = None,
) -> JournalEntry:
    journal_entry = JournalEntry.objects.select_for_update().get(pk=journal_entry_id)
    if journal_entry.status != JournalEntryStatus.DRAFT:
        raise ValueError("Only draft journal entries can be edited.")

    if entry_date is not None:
        journal_entry.entry_date = entry_date
    if memo is not None:
        journal_entry.memo = memo
    journal_entry.save()

    if lines is not None:
        _validate_line_payloads(lines, entry_type=journal_entry.entry_type)
        _replace_lines(journal_entry, lines)

    return journal_entry


@transaction.atomic
def post_journal_entry(*, journal_entry_id: int, posted_by) -> tuple[JournalEntry, bool]:
    journal_entry = (
        JournalEntry.objects.select_for_update()
        .prefetch_related("lines", "lines__chart_account")
        .get(pk=journal_entry_id)
    )

    if journal_entry.status == JournalEntryStatus.POSTED:
        return journal_entry, False

    if journal_entry.status == JournalEntryStatus.VOID:
        raise ValueError("Void journal entries cannot be posted.")

    assert_accounting_period_open(
        reference_date=journal_entry.entry_date,
        performed_by=posted_by,
        instance=journal_entry,
        event="ACCOUNTING_JOURNAL_POST_BLOCKED",
    )

    line_payloads = [
        {
            "chart_account": line.chart_account,
            "debit_amount": line.debit_amount,
            "credit_amount": line.credit_amount,
        }
        for line in journal_entry.lines.all()
    ]
    _validate_line_payloads(line_payloads, entry_type=journal_entry.entry_type)

    journal_entry.status = JournalEntryStatus.POSTED
    journal_entry.posted_by = posted_by
    journal_entry.posted_at = timezone.now()
    if journal_entry.approved_by_id is None:
        journal_entry.approved_by = posted_by
        journal_entry.approved_at = journal_entry.posted_at
    journal_entry.save(
        update_fields=[
            "status",
            "posted_by",
            "posted_at",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
    )

    _log_accounting_event(
        event="ACCOUNTING_JOURNAL_POSTED",
        instance=journal_entry,
        performed_by=posted_by,
        metadata={
            "journal_entry_id": journal_entry.id,
            "entry_no": journal_entry.entry_no,
            "entry_type": journal_entry.entry_type,
        },
    )
    return journal_entry, True


@transaction.atomic
def void_journal_entry(*, journal_entry_id: int, performed_by, reason: str) -> tuple[JournalEntry, bool]:
    journal_entry = JournalEntry.objects.select_for_update().get(pk=journal_entry_id)

    if journal_entry.status == JournalEntryStatus.VOID:
        return journal_entry, False

    if journal_entry.status != JournalEntryStatus.POSTED:
        raise ValueError("Only posted journal entries can be voided.")

    assert_accounting_period_open(
        reference_date=journal_entry.entry_date,
        performed_by=performed_by,
        instance=journal_entry,
        event="ACCOUNTING_JOURNAL_VOID_BLOCKED",
    )

    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Void reason is required.")

    journal_entry.status = JournalEntryStatus.VOID
    journal_entry.void_reason = reason
    journal_entry.save(update_fields=["status", "void_reason", "updated_at"])

    _log_accounting_event(
        event="ACCOUNTING_JOURNAL_VOIDED",
        instance=journal_entry,
        performed_by=performed_by,
        metadata={
            "journal_entry_id": journal_entry.id,
            "entry_no": journal_entry.entry_no,
            "reason": reason,
        },
    )
    return journal_entry, True
