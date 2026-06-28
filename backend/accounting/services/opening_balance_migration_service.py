from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    CustomerOpeningOutstanding,
    FinanceAccount,
    JournalEntry,
    JournalEntryStatus,
    JournalEntryType,
    Vendor,
    VendorLedgerEntry,
)
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry, void_journal_entry


def _amount(value, *, allow_zero: bool = True) -> Decimal:
    try:
        result = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Enter a valid opening balance amount.") from exc
    if result < 0 or (not allow_zero and result == 0):
        raise ValueError("Opening balance must be positive." if not allow_zero else "Opening balance cannot be negative.")
    return result


def _chart(system_code: str) -> ChartOfAccount:
    account = ChartOfAccount.objects.filter(system_code=system_code, is_active=True).order_by("id").first()
    if account is None:
        raise ValueError(f"Missing active {system_code} chart account. Run Accounting Setup defaults first.")
    return account


def _void_existing(*, source_model: str, source_id: str, actor, reason: str) -> list[int]:
    voided: list[int] = []
    rows = JournalEntry.objects.select_for_update().filter(
        source_model=source_model,
        source_id=str(source_id),
        source_type="OPENING_BALANCE_MIGRATION",
        status=JournalEntryStatus.POSTED,
    )
    for row in rows:
        void_journal_entry(journal_entry_id=row.id, performed_by=actor, reason=reason)
        voided.append(row.id)
    return voided


def _post_opening_journal(*, entry_date: date, source_model: str, source_id: str, source_reference: str, memo: str, debit, credit, amount: Decimal, actor) -> JournalEntry:
    journal = create_journal_entry(
        entry_date=entry_date,
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=memo,
        source_model=source_model,
        source_id=str(source_id),
        voucher_type="OPENING_BALANCE",
        source_type="OPENING_BALANCE_MIGRATION",
        source_reference=source_reference,
        lines=[
            {"chart_account": debit, "debit_amount": amount, "credit_amount": Decimal("0.00"), "description": memo},
            {"chart_account": credit, "debit_amount": Decimal("0.00"), "credit_amount": amount, "description": memo},
        ],
    )
    return post_journal_entry(journal_entry_id=journal.id, posted_by=actor)[0]


@transaction.atomic
def set_finance_account_opening_balance(*, finance_account: FinanceAccount, amount, entry_date: date, actor) -> dict:
    finance_account = FinanceAccount.objects.select_for_update().select_related("chart_account").get(pk=finance_account.pk)
    value = _amount(amount)
    voided = _void_existing(
        source_model="FinanceAccount",
        source_id=str(finance_account.id),
        actor=actor,
        reason="Opening finance balance corrected during legacy-data migration.",
    )
    journal = None
    if value > 0:
        journal = _post_opening_journal(
            entry_date=entry_date,
            source_model="FinanceAccount",
            source_id=str(finance_account.id),
            source_reference=f"OPENING:FINANCE:{finance_account.id}:{entry_date.isoformat()}",
            memo=f"Opening balance migration - {finance_account.name}",
            debit=finance_account.chart_account,
            credit=_chart("RETAINED_EARNINGS"),
            amount=value,
            actor=actor,
        )
    finance_account.opening_balance = value
    finance_account.save(update_fields=["opening_balance", "updated_at"])
    return {"finance_account_id": finance_account.id, "opening_balance": str(value), "journal_entry_id": getattr(journal, "id", None), "entry_no": getattr(journal, "entry_no", None), "voided_journal_ids": voided}


@transaction.atomic
def set_vendor_opening_balance(*, vendor: Vendor, amount, entry_date: date, notes: str, actor) -> dict:
    vendor = Vendor.objects.select_for_update().get(pk=vendor.pk)
    target = _amount(amount)
    current = VendorLedgerEntry.objects.filter(vendor=vendor, entry_type="OPENING_BALANCE").aggregate(
        debit=Sum("debit"), credit=Sum("credit")
    )
    current_value = (current["debit"] or Decimal("0.00")) - (current["credit"] or Decimal("0.00"))
    delta = target - current_value
    entry = None
    if delta != 0:
        posted_at = timezone.make_aware(datetime.combine(entry_date, time.min))
        entry = VendorLedgerEntry.objects.create(
            vendor=vendor,
            entry_type="OPENING_BALANCE",
            source_type="LEGACY_MIGRATION_ADJUSTMENT",
            source_reference=f"OPENING:VENDOR:{vendor.id}:{timezone.now().isoformat()}",
            debit=max(delta, Decimal("0.00")),
            credit=max(-delta, Decimal("0.00")),
            balance_after=target,
            posted_at=posted_at,
            created_by=actor,
            notes=notes or "Opening payable migration adjustment; prior rows retained for audit.",
        )
    voided = _void_existing(source_model="Vendor", source_id=str(vendor.id), actor=actor, reason="Vendor opening payable corrected during legacy-data migration.")
    journal = None
    if target > 0:
        journal = _post_opening_journal(
            entry_date=entry_date,
            source_model="Vendor",
            source_id=str(vendor.id),
            source_reference=f"OPENING:VENDOR:{vendor.id}:{entry_date.isoformat()}",
            memo=f"Opening vendor payable migration - {vendor.name}",
            debit=_chart("RETAINED_EARNINGS"),
            credit=_chart("ACCOUNTS_PAYABLE"),
            amount=target,
            actor=actor,
        )
    return {"vendor_id": vendor.id, "opening_balance": str(target), "adjustment_entry_id": getattr(entry, "id", None), "journal_entry_id": getattr(journal, "id", None), "entry_no": getattr(journal, "entry_no", None), "voided_journal_ids": voided}


@transaction.atomic
def create_customer_opening_outstanding(*, customer_name: str, phone: str, amount, entry_date: date, notes: str, actor) -> CustomerOpeningOutstanding:
    value = _amount(amount, allow_zero=False)
    row = CustomerOpeningOutstanding.objects.create(
        customer_name=customer_name,
        phone=phone,
        outstanding_amount=value,
        entry_date=entry_date,
        notes=notes,
        created_by=actor,
    )
    journal = _post_opening_journal(
        entry_date=entry_date,
        source_model="CustomerOpeningOutstanding",
        source_id=str(row.id),
        source_reference=f"OPENING:CUSTOMER:{row.id}:{entry_date.isoformat()}",
        memo=f"Opening customer receivable migration - {row.customer_name}",
        debit=_chart("CUSTOMER_RECEIVABLE"),
        credit=_chart("RETAINED_EARNINGS"),
        amount=value,
        actor=actor,
    )
    row._journal_entry = journal
    return row
