from datetime import date

from subscriptions.services.subscription_service import create_emi_subscription


def create_subscription(*, customer, product, batch, lucky_number: int, tenure_months: int, partner=None, start_date: date | None = None, performed_by=None):
    """Create a Lucky Plan EMI subscription with audited service-layer safeguards."""
    return create_emi_subscription(
        customer=customer,
        product=product,
        batch=batch,
        lucky_number=lucky_number,
        tenure_months=tenure_months,
        partner=partner,
        start_date=start_date,
        performed_by=performed_by,
    )
