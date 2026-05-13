from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounting.services.non_gst_document_service import build_non_gst_snapshot
from subscriptions.models import (
    MONEY_ZERO,
    AuditLog,
    ContractRefundStatus,
    ContractReturnConditionStatus,
    LeaseSubscriptionProfile,
    PlanType,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionStatus,
    q2,
)
from subscriptions.services.audit_service import log_audit


@dataclass(frozen=True)
class DepositBreakdown:
    percent: Decimal
    amount: Decimal


def calculate_security_deposit(*, contract_value: Decimal, percent: Decimal) -> DepositBreakdown:
    if percent is None:
        raise ValidationError({"security_deposit_percent": "Security deposit percent is required."})

    normalized = Decimal(str(percent)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if normalized < Decimal("20.00") or normalized > Decimal("30.00"):
        raise ValidationError({"security_deposit_percent": "Security deposit percent must be between 20 and 30."})

    contract_value_q = q2(Decimal(str(contract_value or MONEY_ZERO)))
    amount = q2(contract_value_q * normalized / Decimal("100.00"))
    return DepositBreakdown(percent=normalized, amount=amount)


def _default_terms_snapshot(*, plan_type: str) -> str:
    today = timezone.localdate().strftime("%d %b %Y")
    return (
        "SUBIDHA CORE\n"
        f"Operational {plan_type} contract template (generated {today}).\n\n"
        "Key clauses summary:\n"
        "- Security deposit is refundable subject to return-condition assessment and deductions.\n"
        "- Final refund amount depends on documented inspection notes and recorded deductions.\n"
        "- This document is an operational template for internal use and lawyer review.\n"
        "- It does not claim legal enforceability.\n"
    )


@transaction.atomic
def create_rent_contract(
    *,
    customer,
    product,
    tenure_months: int,
    start_date=None,
    security_deposit_percent: Decimal,
    performed_by=None,
    handover_notes: str = "",
    contract_terms_snapshot: str = "",
) -> Subscription:
    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError({"tenure_months": "Tenure must be greater than zero."})

    if not getattr(product, "is_rent_enabled", False):
        raise ValidationError({"product": "Selected product is not enabled for RENT contracts."})

    total_amount = Decimal(product.base_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monthly_amount = (total_amount / Decimal(tenure_months)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    deposit = calculate_security_deposit(contract_value=total_amount, percent=security_deposit_percent)
    terms_snapshot = (contract_terms_snapshot or "").strip() or _default_terms_snapshot(plan_type="RENT")

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        plan_type=PlanType.RENT,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_amount,
        status=SubscriptionStatus.ACTIVE,
        tax_profile_snapshot=build_non_gst_snapshot(
            document_type="ADVANCE_EMI_CONTRACT",
            document_date=start_date,
            party_type="CUSTOMER",
            party_id=getattr(customer, "id", None),
            product_id=getattr(product, "id", None),
        ),
    )

    RentSubscriptionProfile.objects.create(
        subscription=subscription,
        security_deposit_percent=deposit.percent,
        security_deposit_amount=deposit.amount,
        refundable_security_deposit=deposit.amount,
        return_condition_status=ContractReturnConditionStatus.NOT_ASSESSED,
        deduction_amount=MONEY_ZERO,
        refund_amount=deposit.amount,
        refund_status=ContractRefundStatus.PENDING,
        handover_notes=handover_notes or "",
        contract_terms_snapshot=terms_snapshot,
    )

    # Assign immutable contract number
    from subscriptions.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from subscriptions.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    # Create possession record
    from subscriptions.services.product_possession_service import create_possession_record
    create_possession_record(subscription=subscription, performed_by=performed_by)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "RENT_CONTRACT_CREATED",
            "subscription_id": subscription.id,
            "customer_id": getattr(customer, "id", None),
            "product_id": getattr(product, "id", None),
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_amount),
            "tenure_months": tenure_months,
            "security_deposit_percent": str(deposit.percent),
            "security_deposit_amount": str(deposit.amount),
        },
    )

    return subscription


@transaction.atomic
def create_lease_contract(
    *,
    customer,
    product,
    tenure_months: int,
    start_date=None,
    security_deposit_percent: Decimal,
    buyout_amount: Decimal | None = None,
    ownership_transfer_allowed: bool = False,
    performed_by=None,
    handover_notes: str = "",
    contract_terms_snapshot: str = "",
) -> Subscription:
    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError({"tenure_months": "Tenure must be greater than zero."})

    if not getattr(product, "is_lease_enabled", False):
        raise ValidationError({"product": "Selected product is not enabled for LEASE contracts."})

    total_amount = Decimal(product.base_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monthly_amount = (total_amount / Decimal(tenure_months)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    deposit = calculate_security_deposit(contract_value=total_amount, percent=security_deposit_percent)
    terms_snapshot = (contract_terms_snapshot or "").strip() or _default_terms_snapshot(plan_type="LEASE")

    normalized_buyout = None
    if buyout_amount is not None and str(buyout_amount).strip() != "":
        normalized_buyout = q2(Decimal(str(buyout_amount)))
        if normalized_buyout < MONEY_ZERO:
            raise ValidationError({"buyout_amount": "Buyout amount cannot be negative."})

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        plan_type=PlanType.LEASE,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_amount,
        status=SubscriptionStatus.ACTIVE,
        tax_profile_snapshot=build_non_gst_snapshot(
            document_type="ADVANCE_EMI_CONTRACT",
            document_date=start_date,
            party_type="CUSTOMER",
            party_id=getattr(customer, "id", None),
            product_id=getattr(product, "id", None),
        ),
    )

    LeaseSubscriptionProfile.objects.create(
        subscription=subscription,
        security_deposit_percent=deposit.percent,
        security_deposit_amount=deposit.amount,
        refundable_security_deposit=deposit.amount,
        buyout_amount=normalized_buyout,
        ownership_transfer_allowed=bool(ownership_transfer_allowed),
        return_condition_status=ContractReturnConditionStatus.NOT_ASSESSED,
        deduction_amount=MONEY_ZERO,
        refund_amount=deposit.amount,
        refund_status=ContractRefundStatus.PENDING,
        handover_notes=handover_notes or "",
        contract_terms_snapshot=terms_snapshot,
    )

    # Assign immutable contract number
    from subscriptions.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from subscriptions.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    # Create possession record
    from subscriptions.services.product_possession_service import create_possession_record
    create_possession_record(subscription=subscription, performed_by=performed_by)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "LEASE_CONTRACT_CREATED",
            "subscription_id": subscription.id,
            "customer_id": getattr(customer, "id", None),
            "product_id": getattr(product, "id", None),
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_amount),
            "tenure_months": tenure_months,
            "security_deposit_percent": str(deposit.percent),
            "security_deposit_amount": str(deposit.amount),
            "buyout_amount": str(normalized_buyout) if normalized_buyout is not None else None,
            "ownership_transfer_allowed": bool(ownership_transfer_allowed),
        },
    )

    return subscription


@transaction.atomic
def assess_return_and_calculate_refund(
    *,
    subscription: Subscription,
    return_condition_status: str,
    deduction_amount: Decimal,
    notes: str = "",
    performed_by=None,
) -> dict:
    if subscription.plan_type == PlanType.RENT:
        profile = subscription.rent_profile
    elif subscription.plan_type == PlanType.LEASE:
        profile = subscription.lease_profile
    else:
        raise ValidationError({"subscription": "Return assessment is supported only for RENT/LEASE contracts."})

    normalized_deduction = q2(Decimal(str(deduction_amount or MONEY_ZERO)))
    if normalized_deduction < MONEY_ZERO:
        raise ValidationError({"deduction_amount": "Deduction amount cannot be negative."})

    base_refundable = q2(Decimal(str(profile.security_deposit_amount or MONEY_ZERO)))
    refund_amount = q2(max(base_refundable - normalized_deduction, MONEY_ZERO))

    profile.return_condition_status = return_condition_status
    profile.deduction_amount = normalized_deduction
    profile.refund_amount = refund_amount
    profile.refund_status = ContractRefundStatus.PARTIAL if normalized_deduction > MONEY_ZERO else ContractRefundStatus.REFUNDED
    profile.return_inspection_notes = (notes or "").strip()
    profile.refundable_security_deposit = base_refundable
    profile.save()

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "CONTRACT_RETURN_ASSESSED",
            "subscription_id": subscription.id,
            "plan_type": subscription.plan_type,
            "return_condition_status": return_condition_status,
            "security_deposit_amount": str(base_refundable),
            "deduction_amount": str(normalized_deduction),
            "refund_amount": str(refund_amount),
        },
    )

    return {
        "subscription_id": subscription.id,
        "plan_type": subscription.plan_type,
        "security_deposit_amount": str(base_refundable),
        "deduction_amount": str(normalized_deduction),
        "refund_amount": str(refund_amount),
        "refund_status": profile.refund_status,
    }
