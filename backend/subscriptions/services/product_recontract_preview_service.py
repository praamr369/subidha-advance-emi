"""Preview-only product recontract calculations for contract amendments.

This service intentionally does not mutate Subscription, EMI, Payment, Receipt,
Accounting, Reconciliation, Stock, Delivery, Commission, Payout, Waiver,
Lucky Draw, Rent/Lease demand, or Deposit records.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from subscriptions.models import AuditLog, ContractAmendment, ContractRecontractEvent, EmiStatus, MONEY_ZERO, Product, Subscription
from subscriptions.services.audit_service import log_audit

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


def _date(value):
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value
    return parse_date(str(value))


def _event_preview_summary(event: ContractRecontractEvent | None) -> dict | None:
    if not event:
        return None
    return {
        "id": event.pk,
        "status": event.status,
        "impact_type": event.impact_type,
        "old_product_id": event.old_product_id,
        "old_product_name": event.old_product.name if event.old_product_id else "",
        "old_product_code": event.old_product.product_code if event.old_product_id else "",
        "new_product_id": event.new_product_id,
        "new_product_name": event.new_product.name if event.new_product_id else "",
        "new_product_code": event.new_product.product_code if event.new_product_id else "",
        "old_contract_total": _money(event.old_contract_total),
        "new_contract_total": _money(event.new_contract_total),
        "price_difference": _money(event.price_difference),
        "amount_already_paid": _money(event.amount_already_paid),
        "old_remaining_balance": _money(event.old_remaining_balance),
        "proposed_new_remaining_balance": _money(event.new_remaining_balance),
        "current_tenure_months": event.current_tenure_months,
        "preview_tenure_months": event.preview_tenure_months,
        "current_monthly_amount": _money(event.current_monthly_amount),
        "proposed_monthly_amount": _money(event.proposed_monthly_amount),
        "pending_emi_count": event.pending_emi_count,
        "effective_date_preview": event.effective_date_preview.isoformat() if event.effective_date_preview else None,
        "warnings": event.warnings or [],
        "customer_consent_status": event.customer_consent_status,
        "customer_consented_at": event.customer_consented_at.isoformat() if event.customer_consented_at else None,
        "customer_consent_note": event.customer_consent_note or "",
        "source_record_mutation": False,
    }


def latest_product_recontract_preview_summary(amendment: ContractAmendment) -> dict | None:
    event = (
        ContractRecontractEvent.objects.filter(amendment=amendment, status=ContractRecontractEvent.Status.PREVIEWED)
        .select_related("old_product", "new_product")
        .order_by("-created_at", "-id")
        .first()
    )
    return _event_preview_summary(event)


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


def create_product_recontract_preview_snapshot(
    *,
    amendment: ContractAmendment,
    requested_by=None,
    preview_tenure_months: int | None = None,
    effective_date=None,
) -> ContractRecontractEvent:
    """Persist one backend-calculated product recontract preview as audit evidence only."""
    with transaction.atomic():
        locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
        preview = preview_product_recontract(
            amendment=locked_amendment,
            preview_tenure_months=preview_tenure_months,
            effective_date=effective_date,
        )
        if preview.get("preview_status") != "READY":
            raise ValidationError({"detail": preview.get("blocked_reason") or "Product recontract preview is blocked."})

        source = locked_amendment.source_contract()
        if not source:
            raise ValidationError({"detail": "Source subscription is required for product recontract preview persistence."})

        ContractRecontractEvent.objects.select_for_update().filter(
            amendment=locked_amendment,
            status=ContractRecontractEvent.Status.PREVIEWED,
        ).update(status=ContractRecontractEvent.Status.SUPERSEDED, updated_at=timezone.now())

        event = ContractRecontractEvent.objects.create(
            amendment=locked_amendment,
            subscription=source,
            old_product_id=preview.get("old_product_id"),
            new_product_id=preview.get("new_product_id"),
            old_contract_total=_q2(preview.get("old_contract_total")),
            new_contract_total=_q2(preview.get("new_contract_total")),
            price_difference=_q2(preview.get("price_difference")),
            amount_already_paid=_q2(preview.get("amount_already_paid")),
            old_remaining_balance=_q2(preview.get("old_remaining_balance")),
            new_remaining_balance=_q2(preview.get("proposed_new_remaining_balance")),
            current_tenure_months=int(preview.get("current_tenure_months") or 0),
            preview_tenure_months=int(preview.get("preview_tenure_months") or 0),
            current_monthly_amount=_q2(preview.get("current_monthly_amount")),
            proposed_monthly_amount=_q2(preview.get("proposed_monthly_amount")),
            pending_emi_count=int(preview.get("pending_emi_count") or 0),
            impact_type=preview.get("impact_type") or ContractRecontractEvent.ImpactType.SAME_PRICE_REFERENCE_CORRECTION,
            effective_date_preview=_date(preview.get("effective_date_preview")),
            preview_snapshot=preview,
            warnings=preview.get("warnings") or [],
            blocked_reason=preview.get("blocked_reason") or "",
            source_record_mutation=False,
            created_by=requested_by,
            metadata={
                "phase": "PHASE_6A_PREVIEW_SNAPSHOT_ONLY",
                "source": "product_recontract_preview_service",
                "source_record_mutation": False,
            },
        )

        metadata = locked_amendment.metadata or {}
        metadata["latest_product_recontract_event_id"] = event.pk
        metadata["latest_product_recontract_event_status"] = event.status
        metadata["latest_product_recontract_event_created_at"] = event.created_at.isoformat()
        locked_amendment.metadata = metadata
        locked_amendment.save(update_fields=["metadata", "updated_at"])

        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
            instance=locked_amendment,
            performed_by=requested_by,
            metadata={
                "event": "CONTRACT_RECONTRACT_PREVIEW_CREATED",
                "phase": "PHASE_6A_PREVIEW_SNAPSHOT_ONLY",
                "amendment_id": locked_amendment.pk,
                "recontract_event_id": event.pk,
                "subscription_id": source.pk,
                "impact_type": event.impact_type,
                "source_record_mutation": False,
            },
        )
        return event


def record_product_recontract_customer_consent(
    *,
    amendment: ContractAmendment,
    customer_user,
    decision: str,
    note: str = "",
) -> ContractRecontractEvent:
    """Record customer consent/rejection against the latest saved preview only."""
    decision = (decision or "").strip().upper()
    if decision not in {
        ContractRecontractEvent.CustomerConsentStatus.ACCEPTED,
        ContractRecontractEvent.CustomerConsentStatus.REJECTED,
    }:
        raise ValidationError({"decision": "Decision must be ACCEPTED or REJECTED."})

    customer = getattr(customer_user, "customer_profile", None)
    if not customer:
        raise ValidationError({"detail": "Customer profile not found."})
    if amendment.customer_id != customer.id:
        raise ValidationError({"detail": "You can consent only to your own amendment."})

    with transaction.atomic():
        locked_amendment = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
        if locked_amendment.customer_id != customer.id:
            raise ValidationError({"detail": "You can consent only to your own amendment."})

        event = (
            ContractRecontractEvent.objects.select_for_update()
            .select_related("old_product", "new_product", "subscription")
            .filter(amendment=locked_amendment)
            .order_by("-created_at", "-id")
            .first()
        )
        if not event:
            raise ValidationError({"detail": "No saved product recontract preview exists for this amendment."})
        if event.status != ContractRecontractEvent.Status.PREVIEWED:
            raise ValidationError({"detail": "Customer consent requires the latest saved preview to be active and PREVIEWED."})
        if event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.PENDING:
            raise ValidationError({"detail": "Customer consent has already been recorded for this preview."})

        consented_at = timezone.now()
        snapshot = _event_preview_summary(event) or {}
        snapshot.update(
            {
                "decision": decision,
                "note": note or "",
                "consented_by": customer_user.pk,
                "consented_at": consented_at.isoformat(),
                "phase": "PHASE_6B_CUSTOMER_CONSENT_ONLY",
                "source_record_mutation": False,
            }
        )

        event.customer_consent_status = decision
        event.customer_consented_by = customer_user
        event.customer_consented_at = consented_at
        event.customer_consent_note = note or ""
        event.customer_consent_snapshot = snapshot
        metadata = event.metadata or {}
        metadata["customer_consent_status"] = decision
        metadata["customer_consent_recorded_at"] = event.customer_consented_at.isoformat()
        metadata["phase"] = "PHASE_6B_CUSTOMER_CONSENT_ONLY"
        metadata["source_record_mutation"] = False
        event.metadata = metadata
        event.save(
            update_fields=[
                "customer_consent_status",
                "customer_consented_by",
                "customer_consented_at",
                "customer_consent_note",
                "customer_consent_snapshot",
                "metadata",
                "updated_at",
            ]
        )

        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
            instance=locked_amendment,
            performed_by=customer_user,
            metadata={
                "event": "CONTRACT_RECONTRACT_CUSTOMER_CONSENT_RECORDED",
                "phase": "PHASE_6B_CUSTOMER_CONSENT_ONLY",
                "amendment_id": locked_amendment.pk,
                "recontract_event_id": event.pk,
                "subscription_id": event.subscription_id,
                "decision": decision,
                "source_record_mutation": False,
            },
        )
        return event
