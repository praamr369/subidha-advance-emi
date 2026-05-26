"""Preview-only product recontract calculations for contract amendments.

This service intentionally does not mutate Subscription, EMI, Payment, Receipt,
Accounting, Reconciliation, Stock, Delivery, Commission, Payout, Waiver,
Lucky Draw, Rent/Lease demand, or Deposit records.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.utils import timezone

from subscriptions.models import ContractAmendment, EmiStatus, MONEY_ZERO, Product, Subscription

_PREVIEW_ALLOWED_STATUSES = {"REQUESTED", "UNDER_REVIEW", "APPROVED"}
_TARGET_PRODUCT_ID_KEYS = ("approved_product_id", "target_product_id", "new_product_id", "product_id")
_PREVIEW_WARNINGS = [
    "Preview only — no source records are mutated.",
    "No contract, EMI, payment, receipt, accounting, reconciliation, stock, delivery, commission, payout, waiver, rent/lease demand, or deposit records are changed.",
    "Accounting and reconciliation are not posted by this preview.",
    "Final execution requires a later approved financial implementation phase.",
]


def _q2(value: Decimal | int | str | None) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _money(value: Decimal | int | str | None) -> str:
    return str(_q2(value))


def _values_for(amendment: ContractAmendment) -> dict:
    values = amendment.approved_values or amendment.requested_values or amendment.new_values or {}
    if not isinstance(values, dict):
        raise ValidationError({"detail": "Product recontract preview values must be a JSON object."})
    return values


def _target_product_id(values: dict) -> int:
    for key in _TARGET_PRODUCT_ID_KEYS:
        raw_value = values.get(key)
        if raw_value not in (None, ""):
            try:
                return int(raw_value)
            except (TypeError, ValueError):
                raise ValidationError({"detail": f"{key} must be a valid product id."})
    raise ValidationError({"detail": "Product recontract preview requires approved_product_id or target_product_id."})


def _product_payload(product: Product | None, prefix: str) -> dict:
    return {
        f"{prefix}_product_id": product.pk if product else None,
        f"{prefix}_product_name": product.name if product else "",
        f"{prefix}_product_code": product.product_code if product else "",
    }


def _impact_type(price_difference: Decimal) -> str:
    if price_difference > MONEY_ZERO:
        return "UPGRADE_EXTRA_PAYABLE"
    if price_difference < MONEY_ZERO:
        return "DOWNGRADE_CREDIT_REQUIRED"
    return "SAME_PRICE_REFERENCE_CORRECTION"


def _preview_tenure(values: dict, current_tenure: int, explicit_tenure_months: int | None = None) -> int:
    raw = explicit_tenure_months or values.get("preview_tenure_months") or values.get("proposed_tenure_months")
    if raw in (None, ""):
        return int(current_tenure)
    try:
        tenure = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({"detail": "Preview tenure must be a valid positive integer."})
    if tenure <= 0:
        raise ValidationError({"detail": "Preview tenure must be greater than zero."})
    return tenure


def preview_product_recontract(*, amendment: ContractAmendment, preview_tenure_months: int | None = None, effective_date=None) -> dict:
    if amendment.amendment_type != "PRODUCT_CHANGE":
        raise ValidationError({"detail": "Product recontract preview is supported only for PRODUCT_CHANGE amendments."})
    if amendment.status not in _PREVIEW_ALLOWED_STATUSES:
        raise ValidationError({"detail": "Product recontract preview requires REQUESTED, UNDER_REVIEW, or APPROVED status."})

    values = _values_for(amendment)
    target_product_id = _target_product_id(values)

    source = amendment.source_contract()
    if not source:
        raise ValidationError({"detail": "Source subscription is required for product recontract preview."})

    source = Subscription.objects.select_related("product", "batch", "lucky_id", "customer", "partner").get(pk=source.pk)

    try:
        target_product = Product.objects.get(pk=target_product_id)
    except Product.DoesNotExist:
        raise ValidationError({"detail": "Target product does not exist."})

    old_contract_total = _q2(source.total_amount)
    new_contract_total = _q2(target_product.base_price)
    price_difference = _q2(new_contract_total - old_contract_total)

    try:
        amount_already_paid = _q2(source.total_paid())
    except Exception as exc:
        return {
            "preview_status": "BLOCKED",
            "impact_type": "UNKNOWN",
            "blocked_reason": f"Payment truth is not safely computable: {exc}",
            "warnings": _PREVIEW_WARNINGS,
            "source_record_mutation": False,
        }

    current_tenure = int(source.tenure_months)
    proposed_tenure = _preview_tenure(values, current_tenure, preview_tenure_months)
    old_remaining_balance = _q2(max(old_contract_total - amount_already_paid - _q2(source.waived_amount), MONEY_ZERO))
    proposed_new_remaining_balance = _q2(max(new_contract_total - amount_already_paid - _q2(source.waived_amount), MONEY_ZERO))
    proposed_monthly_amount = _q2(new_contract_total / Decimal(proposed_tenure))
    pending_emi_count = source.emis.filter(status=EmiStatus.PENDING).count()

    preview_effective_date = effective_date or values.get("effective_date") or values.get("preview_effective_date") or timezone.localdate()
    if hasattr(preview_effective_date, "isoformat"):
        preview_effective_date = preview_effective_date.isoformat()

    return {
        "preview_status": "READY",
        "impact_type": _impact_type(price_difference),
        "blocked_reason": "",
        "source_record_mutation": False,
        **_product_payload(source.product, "old"),
        **_product_payload(target_product, "new"),
        "subscription_id": source.pk,
        "subscription_number": source.subscription_number,
        "old_contract_total": _money(old_contract_total),
        "new_contract_total": _money(new_contract_total),
        "price_difference": _money(price_difference),
        "amount_already_paid": _money(amount_already_paid),
        "old_remaining_balance": _money(old_remaining_balance),
        "proposed_new_remaining_balance": _money(proposed_new_remaining_balance),
        "current_tenure_months": current_tenure,
        "preview_tenure_months": proposed_tenure,
        "current_monthly_amount": _money(source.monthly_amount),
        "proposed_monthly_amount": _money(proposed_monthly_amount),
        "pending_emi_count": pending_emi_count,
        "effective_date_preview": preview_effective_date,
        "warnings": _PREVIEW_WARNINGS,
    }
