from decimal import Decimal, InvalidOperation
from typing import Any, Dict

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    CustomerOpeningOutstanding,
    FinanceAccount,
    JournalEntryType,
    LegacyReceivableCollection,
)
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from accounts.models import User


def _amount(value) -> Decimal:
    try:
        result = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValidationError("Enter a valid collection amount.") from exc
    if result <= Decimal("0.00"):
        raise ValidationError("Collection amount must be greater than zero.")
    return result


def _receivable_chart() -> ChartOfAccount:
    account = (
        ChartOfAccount.objects.filter(system_code="CUSTOMER_RECEIVABLE", is_active=True)
        .order_by("id")
        .first()
    )
    if account is None:
        account = (
            ChartOfAccount.objects.filter(code__iexact="AR-1000", is_active=True)
            .order_by("id")
            .first()
        )
    if account is None:
        raise ValidationError(
            "Missing active Accounts Receivable (CUSTOMER_RECEIVABLE) chart account. Run Accounting Setup defaults first."
        )
    return account


@transaction.atomic
def settle_legacy_receivable(
    *,
    receivable_id: int,
    amount: Decimal,
    payment_method: str,
    finance_account_id: int,
    performed_by: User,
    reference_no: str | None = None,
    notes: str | None = None,
    receipt_date: str | None = None,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    idempotency_key: str | None = None,
) -> Dict[str, Any]:
    """Collect a payment (full or partial) against a legacy opening receivable.

    Each collection posts a controlled journal entry:
        Dr  chosen cash/bank/UPI finance account  (money received)
        Cr  Accounts Receivable                   (clears the old debt slice)

    The receivable auto-settles once its running balance reaches zero, giving
    old-customer collections the same ledger footprint as new-customer ones.
    """
    try:
        receivable = CustomerOpeningOutstanding.objects.select_for_update().get(id=receivable_id)
    except CustomerOpeningOutstanding.DoesNotExist:
        raise ValidationError(f"Legacy receivable {receivable_id} not found.")

    if receivable.is_settled:
        raise ValidationError("This legacy receivable is already fully settled.")

    value = _amount(amount)
    remaining = receivable.balance_remaining
    if value > remaining:
        raise ValidationError(
            f"Collection {value} exceeds the remaining balance {remaining}."
        )

    finance_account = (
        FinanceAccount.objects.select_related("chart_account")
        .filter(pk=finance_account_id, is_active=True)
        .first()
    )
    if finance_account is None:
        raise ValidationError({"finance_account_id": "Active finance account was not found."})
    if finance_account.chart_account_id is None:
        raise ValidationError(
            {"finance_account_id": "Finance account is not mapped to a posting-ready chart account."}
        )

    settlement_date = timezone.localdate()
    if receipt_date:
        try:
            settlement_date = timezone.datetime.fromisoformat(str(receipt_date)).date()
        except (ValueError, TypeError):
            settlement_date = timezone.localdate()

    memo = f"Legacy receivable collection - {receivable.customer_name}"
    journal = create_journal_entry(
        entry_date=settlement_date,
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=memo,
        source_model="CustomerOpeningOutstanding",
        source_id=str(receivable.id),
        voucher_type="LEGACY_RECEIVABLE_COLLECTION",
        source_type="LEGACY_RECEIVABLE_COLLECTION",
        source_reference=f"LEGACY:COLLECT:{receivable.id}:{timezone.now().isoformat()}",
        lines=[
            {
                "chart_account": finance_account.chart_account,
                "debit_amount": value,
                "credit_amount": Decimal("0.00"),
                "description": memo,
            },
            {
                "chart_account": _receivable_chart(),
                "debit_amount": Decimal("0.00"),
                "credit_amount": value,
                "description": memo,
            },
        ],
    )
    posted_journal = post_journal_entry(journal_entry_id=journal.id, posted_by=performed_by)[0]

    collection = LegacyReceivableCollection.objects.create(
        receivable=receivable,
        amount=value,
        payment_method=(payment_method or "CASH").strip().upper(),
        finance_account=finance_account,
        posted_journal_entry=posted_journal,
        branch_id=branch_id,
        cash_counter_id=cash_counter_id,
        receipt_date=settlement_date,
        reference_no=(reference_no or "").strip(),
        notes=(notes or "").strip(),
        collected_by=performed_by,
    )

    collected_total = (
        receivable.collections.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    )
    receivable.collected_amount = collected_total
    fields = ["collected_amount", "updated_at"]
    if receivable.balance_remaining <= Decimal("0.00"):
        receivable.is_settled = True
        receivable.settled_at = timezone.now()
        fields += ["is_settled", "settled_at"]
    if notes:
        receivable.notes = f"{receivable.notes}\nCollection {collection.collection_no}: {notes}".strip()
        fields.append("notes")
    receivable.save(update_fields=fields)

    return {
        "created": True,
        "legacy_receivable": receivable,
        "legacy_settlement_id": collection.id,
        "collection_no": collection.collection_no,
        "receipt_id": collection.id,
        "amount": str(value),
        "collected_amount": str(receivable.collected_amount),
        "balance_remaining": str(receivable.balance_remaining),
        "is_settled": receivable.is_settled,
        "journal_entry": posted_journal,
        "journal_entry_id": posted_journal.id,
        "entry_no": getattr(posted_journal, "entry_no", None),
        "reconciliation": None,
        "message": (
            "Legacy receivable fully settled."
            if receivable.is_settled
            else "Partial legacy receivable collection posted."
        ),
    }
