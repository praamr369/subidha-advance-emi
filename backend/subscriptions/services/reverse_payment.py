from django.core.exceptions import ValidationError


def reverse_payment(*, payment_id, reversed_by):
    raise ValidationError(
        "Payment reversal is temporarily disabled until aligned with the current payment and ledger schema."
    )