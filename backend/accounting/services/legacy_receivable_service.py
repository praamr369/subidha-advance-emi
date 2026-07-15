from decimal import Decimal
from typing import Any, Dict

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from accounting.models import CustomerOpeningOutstanding
from accounts.models import User

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
    """
    Settles a legacy CustomerOpeningOutstanding record.
    Returns standard unified collection dictionary payload.
    """
    try:
        receivable = CustomerOpeningOutstanding.objects.get(id=receivable_id)
    except CustomerOpeningOutstanding.DoesNotExist:
        raise ValidationError(f"Legacy receivable {receivable_id} not found.")

    if receivable.is_settled:
        raise ValidationError("This legacy receivable is already settled.")

    if amount != receivable.outstanding_amount:
        # For MVP, we require full exact settlement to close it
        raise ValidationError(f"Amount {amount} does not match outstanding {receivable.outstanding_amount}.")

    receivable.is_settled = True
    receivable.settled_at = timezone.now()
    if notes:
        receivable.notes = f"{receivable.notes}\nSettled Note: {notes}".strip()
    receivable.save(update_fields=["is_settled", "settled_at", "notes"])

    # Attempt to post to the accounting bridge
    # The rulebook notes that bridge posting is handled in a later phase for some new ops.
    # For now, we return None for journal_entry to let the system know it's deferred.
    journal_entry = None

    return {
        "legacy_receivable": receivable,
        "payment": {
            "id": receivable.id,
            "amount": amount,
            "method": payment_method,
            "reference": reference_no,
        },
        "reconciliation": None,
        "journal_entry": journal_entry,
        "message": "Legacy receivable settled successfully.",
    }
