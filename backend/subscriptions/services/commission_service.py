# subscriptions/services/commission_service.py

from decimal import Decimal
from django.core.exceptions import ValidationError
from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog, Commission


def generate_commission_for_emi(emi):
    """
    Create commission when EMI is fully paid.
    """

    subscription = emi.subscription
    partner = subscription.partner

    if not partner:
        return None  # No partner, no commission

    if hasattr(emi, "commission"):
        return emi.commission  # Idempotency safety

    # Commission formula:
    # commission_amount = emi.amount × (commission_percentage / 100)
    commission_percentage = Decimal("5.00")  # configurable later

    commission_amount = (
        emi.amount * commission_percentage / Decimal("100")
    ).quantize(Decimal("0.01"))

    commission = Commission.objects.create(
        partner=partner,
        emi=emi,
        commission_percentage=commission_percentage,
        commission_amount=commission_amount,
        status="PENDING",
    )
    log_audit(
        action_type=AuditLog.ActionType.COMMISSION_CREATED,
        instance=commission,
        metadata={
            "partner_id": commission.partner_id,
            "emi_id": commission.emi_id,
            "amount": str(commission.commission_amount),
        },

    )

    return commission