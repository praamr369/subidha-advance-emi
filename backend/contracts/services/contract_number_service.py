"""Contract number generation service.

Generates immutable, sequential contract numbers per plan type and year.
Format:
  ADV-EMI-YYYY-NNNNNN   (Advance EMI / Lucky Plan)
  RENT-YYYY-NNNNNN       (Rent contract)
  LEASE-YYYY-NNNNNN      (Lease contract)
  SALE-YYYY-NNNNNN       (Direct sale)

Numbers are assigned once and never changed.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from subscriptions.models import PlanType, Subscription


_PREFIX_MAP = {
    PlanType.EMI: "ADV-EMI",
    PlanType.RENT: "RENT",
    PlanType.LEASE: "LEASE",
}
DIRECT_SALE_PREFIX = "SALE"


def get_subscription_prefix(subscription: Subscription) -> str:
    import re
    if subscription.plan_type == PlanType.EMI or str(subscription.plan_type).upper() == "EMI":
        batch_id = getattr(subscription, "batch_id", None)
        if batch_id and getattr(subscription, "batch", None):
            b_code = str(subscription.batch.batch_code).strip().upper()
            b_code_clean = re.sub(r'[^A-Z0-9]+', '', b_code)
            if b_code_clean:
                return f"EMI-{b_code_clean}"
        return "ADV-EMI"
    if subscription.plan_type in _PREFIX_MAP:
        return _PREFIX_MAP[subscription.plan_type]
    return "SUB"


def _next_seq(prefix: str, year: int) -> int:
    """Return the next available sequence number for prefix+year, under SELECT FOR UPDATE."""
    pattern = f"{prefix}-{year}-%"
    last = (
        Subscription.objects.filter(subscription_number__startswith=f"{prefix}-{year}-")
        .order_by("-subscription_number")
        .values_list("subscription_number", flat=True)
        .first()
    )
    if last is None:
        return 1
    try:
        return int(last.rsplit("-", 1)[-1]) + 1
    except (ValueError, IndexError):
        return 1


@transaction.atomic
def assign_subscription_number(subscription: Subscription) -> str:
    """Assign an immutable contract number to a Subscription.

    Idempotent: if number is already assigned, returns existing number.
    Raises ValueError if plan_type is not recognised.
    """
    if subscription.subscription_number:
        return subscription.subscription_number

    if subscription.plan_type not in _PREFIX_MAP and str(subscription.plan_type).upper() not in ["EMI", "RENT", "LEASE"]:
        raise ValueError(f"Cannot assign contract number for plan_type={subscription.plan_type!r}")

    prefix = get_subscription_prefix(subscription)
    year = timezone.localdate().year

    # Lock all subscriptions for this prefix/year to avoid race conditions.
    Subscription.objects.select_for_update().filter(
        subscription_number__startswith=f"{prefix}-{year}-"
    ).values_list("id", flat=True)

    seq = _next_seq(prefix, year)
    number = f"{prefix}-{year}-{seq:04d}"

    # Double-check uniqueness (defensive)
    while Subscription.objects.filter(subscription_number=number).exists():
        seq += 1
        number = f"{prefix}-{year}-{seq:04d}"

    Subscription.objects.filter(pk=subscription.pk).update(subscription_number=number)
    subscription.subscription_number = number
    return number


def get_or_assign_subscription_number(subscription: Subscription) -> str:
    """Return existing subscription_number, or lazily assign and return it if missing."""
    if not subscription:
        return ""
    if getattr(subscription, "subscription_number", None):
        return subscription.subscription_number
    if getattr(subscription, "contract_reference", None):
        return subscription.contract_reference
    try:
        return assign_subscription_number(subscription)
    except Exception:
        prefix = get_subscription_prefix(subscription)
        year = getattr(subscription, "start_date", None)
        year_val = year.year if year else timezone.localdate().year
        return f"{prefix}-{year_val}-{subscription.id:04d}"


@transaction.atomic
def assign_direct_sale_number(direct_sale) -> str:
    """Assign an immutable contract/sale number to a DirectSale instance.

    Idempotent: if sale_no is already set, returns the existing number unchanged.

    For new direct sales, delegates to the billing service's DocumentSequence
    mechanism (``billing.services.billing_service._ensure_direct_sale_sequence``)
    which is the canonical source of truth for sale numbering.  The resulting
    number format is ``SALE-{FY}-{NNNNN}`` (e.g. ``SALE-2025-26-00001``).

    This function is called as a *fallback* for legacy rows that were created
    before the DocumentSequence mechanism was in place (``sale_no=NULL``).  For
    all rows created via ``create_direct_sale``, ``sale_no`` is already populated
    and this function returns immediately without touching the database.

    Race safety: the underlying ``_issue_document_number`` uses SELECT FOR UPDATE
    on the DocumentSequence row, so concurrent calls are serialised correctly.
    """
    from billing.models import DirectSale  # noqa: F401 — import guard

    if getattr(direct_sale, "sale_no", None):
        return direct_sale.sale_no

    # Delegate to the billing service's canonical sequence mechanism.
    # This keeps the number format consistent with all other Direct Sale numbers
    # and avoids maintaining a parallel counter.
    from billing.services.billing_service import _ensure_direct_sale_sequence
    from accounting.services.gst_document_posting_service import _issue_document_number

    ref_date = getattr(direct_sale, "sale_date", None) or timezone.localdate()
    sequence = _ensure_direct_sale_sequence(ref_date)
    number = _issue_document_number(sequence)

    DirectSale.objects.filter(pk=direct_sale.pk).update(sale_no=number)
    direct_sale.sale_no = number
    return number
