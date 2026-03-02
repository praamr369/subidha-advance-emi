from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from subscriptions.models import Payment, FinancialLedger


@transaction.atomic
def reverse_payment(*, payment_id, reversed_by):

    payment = Payment.objects.select_for_update().get(pk=payment_id)

    if payment.is_reversed:
        raise ValidationError("Payment already reversed.")

    # Mark payment reversed
    payment.is_reversed = True
    payment.save(update_fields=["is_reversed"])

    # Create ledger reversal
    FinancialLedger.objects.create(
        payment=payment,
        emi=payment.emi,
        amount=payment.amount,
        entry_type="DEBIT_REVERSAL",
    )

    return payment