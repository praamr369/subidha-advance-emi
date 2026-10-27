from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounting.services.non_gst_document_service import build_non_gst_snapshot
from subscriptions.models import (
    MONEY_ZERO,
    AuditLog,
    ContractItem,
    ContractRefundStatus,
    ContractReturnConditionStatus,
    LeaseSubscriptionProfile,
    PlanType,
    RentLeaseDemandStatus,
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
        "- Rent arrears exceeding 45 days trigger repossession; unpaid rent and recovery costs are deducted from security deposit.\n"
        "- This document is an operational template for internal use and lawyer review.\n"
        "- It does not claim legal enforceability.\n"
    )


def _normalize_contract_items(
    *,
    plan_type: str,
    product=None,
    items: list[dict] | None = None,
    default_monthly_yield_percent: Decimal = Decimal("5.00"),
    default_security_deposit_percent: Decimal = Decimal("20.00"),
) -> list[dict]:
    from products_core.models import Product

    raw_items = list(items or [])
    if not raw_items:
        if not product:
            raise ValidationError({"product": "A product or items list is required."})
        raw_items = [
            {
                "product": product,
                "quantity": 1,
                "unit_base_price": getattr(product, "base_price", None),
                "monthly_yield_percent": default_monthly_yield_percent,
                "security_deposit_percent": default_security_deposit_percent,
            }
        ]

    normalized = []
    for idx, it in enumerate(raw_items, start=1):
        prod = it.get("product")
        if isinstance(prod, (int, str)):
            try:
                prod = Product.objects.get(pk=int(prod))
            except (Product.DoesNotExist, ValueError):
                raise ValidationError({"items": f"Item {idx}: Product not found."})
        elif not prod:
            raise ValidationError({"items": f"Item {idx}: Product is required."})

        if plan_type == PlanType.RENT and not getattr(prod, "is_rent_enabled", False):
            raise ValidationError(
                {"items": f"Product '{getattr(prod, 'name', prod)}' is not enabled for RENT contracts."}
            )
        elif plan_type == PlanType.LEASE and not getattr(prod, "is_lease_enabled", False):
            raise ValidationError(
                {"items": f"Product '{getattr(prod, 'name', prod)}' is not enabled for LEASE contracts."}
            )

        qty = int(it.get("quantity") or 1)
        if qty <= 0:
            raise ValidationError({"items": f"Item {idx}: Quantity must be greater than zero."})

        unit_price = it.get("unit_base_price")
        if unit_price is None or str(unit_price).strip() == "":
            unit_price = getattr(prod, "base_price", MONEY_ZERO)
        unit_price_d = Decimal(str(unit_price)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if unit_price_d < Decimal("0.00"):
            raise ValidationError({"items": f"Item {idx}: Unit base price cannot be negative."})

        yield_pct = it.get("monthly_yield_percent")
        if yield_pct is None or str(yield_pct).strip() == "":
            yield_pct = default_monthly_yield_percent
        yield_pct_d = Decimal(str(yield_pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if yield_pct_d <= Decimal("0.00"):
            raise ValidationError({"items": f"Item {idx}: Yield rate must be greater than zero."})

        total_base = (unit_price_d * Decimal(qty)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        monthly_amt = (total_base * yield_pct_d / Decimal("100.00")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

        deposit_pct = it.get("security_deposit_percent")
        if deposit_pct is None or str(deposit_pct).strip() == "":
            deposit_pct = default_security_deposit_percent
        deposit_pct_d = Decimal(str(deposit_pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if deposit_pct_d < Decimal("0.00"):
            raise ValidationError({"items": f"Item {idx}: Security deposit percent cannot be negative."})

        deposit_amt = it.get("security_deposit_amount")
        if deposit_amt is not None and str(deposit_amt).strip() != "":
            deposit_amt_d = Decimal(str(deposit_amt)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if deposit_amt_d < Decimal("0.00"):
                raise ValidationError({"items": f"Item {idx}: Security deposit amount cannot be negative."})
        else:
            deposit_amt_d = (total_base * deposit_pct_d / Decimal("100.00")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        normalized.append(
            {
                "product": prod,
                "quantity": qty,
                "unit_base_price": unit_price_d,
                "total_base_price": total_base,
                "monthly_yield_percent": yield_pct_d,
                "monthly_amount": monthly_amt,
                "security_deposit_percent": deposit_pct_d,
                "security_deposit_amount": deposit_amt_d,
            }
        )

    return normalized


@transaction.atomic
def create_rent_contract(
    *,
    customer,
    product=None,
    items: list[dict] | None = None,
    tenure_months: int,
    start_date=None,
    security_deposit_percent: Decimal,
    monthly_yield_percent: Decimal = Decimal("5.00"),
    performed_by=None,
    handover_notes: str = "",
    contract_terms_snapshot: str = "",
    save_as_draft: bool = False,
    deposit_payment_option: str = "FULL",
    deposit_buffer_days: int = 30,
    deposit_due_date: date | None = None,
    initial_deposit_payment: Decimal | None = None,
    deposit_finance_account_id: int | None = None,
    deposit_payment_method: str = "CASH",
) -> Subscription:
    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError({"tenure_months": "Tenure must be greater than zero."})

    monthly_yield_percent = Decimal(str(monthly_yield_percent)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if monthly_yield_percent <= Decimal("0.00"):
        raise ValidationError({"monthly_yield_percent": "Yield rate must be greater than zero."})

    normalized_items = _normalize_contract_items(
        plan_type=PlanType.RENT,
        product=product,
        items=items,
        default_monthly_yield_percent=monthly_yield_percent,
        default_security_deposit_percent=security_deposit_percent,
    )

    primary_product = normalized_items[0]["product"]
    product_value = sum((it["total_base_price"] for it in normalized_items), MONEY_ZERO)
    monthly_amount = sum((it["monthly_amount"] for it in normalized_items), MONEY_ZERO)
    total_amount = (monthly_amount * Decimal(tenure_months)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    deposit_amount = sum((it["security_deposit_amount"] for it in normalized_items), MONEY_ZERO)
    effective_deposit_percent = (
        (deposit_amount * Decimal("100.00") / product_value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if product_value > MONEY_ZERO
        else Decimal(str(security_deposit_percent or "20.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    )

    today = timezone.localdate()
    deposit_buffer_days = int(deposit_buffer_days or 30)
    if deposit_buffer_days < 0 or deposit_buffer_days > 90:
        deposit_buffer_days = 30
    if deposit_due_date is not None:
        deposit_due_date = deposit_due_date
    elif deposit_payment_option == "PARTIAL":
        deposit_due_date = min(today + timedelta(days=deposit_buffer_days), start_date)
    else:
        # Full upfront deposit: due at contract activation/creation (today) or on start_date if earlier
        deposit_due_date = min(today, start_date)

    # Drafts are always allowed. Activating (the default) goes through the
    # additive KYC/document gate (no-op unless KYC gating is enabled).
    contract_status = SubscriptionStatus.DRAFT if save_as_draft else SubscriptionStatus.ACTIVE
    if not save_as_draft:
        from customers.services.kyc_readiness_service import enforce_contract_kyc_gate

        enforce_contract_kyc_gate(
            customer=customer, plan_type=PlanType.RENT, stage="activate"
        )

    terms_snapshot = (contract_terms_snapshot or "").strip() or _default_terms_snapshot(plan_type="RENT")

    items_snapshot = [
        {
            "product_id": it["product"].id,
            "product_name": it["product"].name,
            "product_code": getattr(it["product"], "product_code", ""),
            "quantity": it["quantity"],
            "unit_base_price": str(it["unit_base_price"]),
            "total_base_price": str(it["total_base_price"]),
            "monthly_yield_percent": str(it["monthly_yield_percent"]),
            "monthly_amount": str(it["monthly_amount"]),
            "security_deposit_percent": str(it["security_deposit_percent"]),
            "security_deposit_amount": str(it["security_deposit_amount"]),
        }
        for it in normalized_items
    ]

    subscription = Subscription.objects.create(
        customer=customer,
        product=primary_product,
        plan_type=PlanType.RENT,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_amount,
        status=contract_status,
        product_snapshot={
            "product_id": primary_product.id,
            "product_code": getattr(primary_product, "product_code", ""),
            "name": getattr(primary_product, "name", ""),
            "base_price": str(getattr(primary_product, "base_price", MONEY_ZERO)),
            "items_count": len(normalized_items),
            "items": items_snapshot,
        },
        pricing_snapshot={
            "plan_type": PlanType.RENT,
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_amount),
            "total_amount": str(total_amount),
            "total_product_value": str(product_value),
            "items_count": len(normalized_items),
            "security_deposit_percent": str(effective_deposit_percent),
            "security_deposit_amount": str(deposit_amount),
            "deposit_payment_option": deposit_payment_option,
            "deposit_buffer_days": deposit_buffer_days,
            "initial_deposit_payment": str(initial_deposit_payment or MONEY_ZERO),
            "deposit_due_date": deposit_due_date.isoformat() if deposit_due_date else None,
        },
        tax_profile_snapshot=build_non_gst_snapshot(
            document_type="RENT_CONTRACT",
            document_date=start_date,
            party_type="CUSTOMER",
            party_id=getattr(customer, "id", None),
            product_id=getattr(primary_product, "id", None),
        ),
    )

    RentSubscriptionProfile.objects.create(
        subscription=subscription,
        security_deposit_percent=effective_deposit_percent,
        monthly_yield_percent=monthly_yield_percent,
        security_deposit_amount=deposit_amount,
        refundable_security_deposit=deposit_amount,
        return_condition_status=ContractReturnConditionStatus.NOT_ASSESSED,
        deduction_amount=MONEY_ZERO,
        refund_amount=deposit_amount,
        refund_status=ContractRefundStatus.PENDING,
        handover_notes=handover_notes or "",
        contract_terms_snapshot=terms_snapshot,
    )

    # Persist contract items
    for it in normalized_items:
        ContractItem.objects.create(
            subscription=subscription,
            product=it["product"],
            quantity=it["quantity"],
            unit_base_price=it["unit_base_price"],
            total_base_price=it["total_base_price"],
            monthly_yield_percent=it["monthly_yield_percent"],
            monthly_amount=it["monthly_amount"],
            security_deposit_percent=it["security_deposit_percent"],
            security_deposit_amount=it["security_deposit_amount"],
        )

    # Assign immutable contract number
    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    # Create possession record
    from deliveries.services.product_possession_service import create_possession_record
    create_possession_record(subscription=subscription, performed_by=performed_by)

    # Initialize security deposit demand
    from contracts.services.rent_lease_billing_service import ensure_security_deposit_demand
    deposit_demand = ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    if deposit_demand and deposit_due_date and deposit_demand.due_date != deposit_due_date and deposit_demand.collected_amount <= MONEY_ZERO:
        deposit_demand.due_date = deposit_due_date
        deposit_demand.save(update_fields=["due_date", "updated_at"])

    # If upfront deposit collection was provided
    if initial_deposit_payment is not None and Decimal(str(initial_deposit_payment)) > MONEY_ZERO:
        init_amount = q2(Decimal(str(initial_deposit_payment)))
        if deposit_finance_account_id:
            try:
                from contracts.services.rent_lease_collection_workflow_service import collect_security_deposit_with_metadata
                collect_security_deposit_with_metadata(
                    subscription=subscription,
                    amount=init_amount,
                    performed_by=performed_by,
                    finance_account_id=deposit_finance_account_id,
                    payment_method=deposit_payment_method or "CASH",
                    payment_date=start_date,
                    note=f"Security deposit collected at contract creation ({deposit_payment_option})",
                )
            except Exception:
                pass
        else:
            deposit_demand.refresh_from_db()
            deposit_demand.collected_amount = min(init_amount, deposit_demand.amount)
            deposit_demand.held_amount = deposit_demand.collected_amount
            deposit_demand.refundable_amount = deposit_demand.collected_amount
            deposit_demand.status = (
                RentLeaseDemandStatus.PAID
                if deposit_demand.collected_amount >= deposit_demand.amount
                else RentLeaseDemandStatus.PARTIAL
            )
            deposit_demand.save(update_fields=["collected_amount", "held_amount", "refundable_amount", "status", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "RENT_CONTRACT_CREATED",
            "subscription_id": subscription.id,
            "customer_id": getattr(customer, "id", None),
            "product_id": getattr(primary_product, "id", None),
            "items_count": len(normalized_items),
            "product_ids": [it["product"].id for it in normalized_items],
            "total_product_value": str(product_value),
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_amount),
            "tenure_months": tenure_months,
            "security_deposit_percent": str(effective_deposit_percent),
            "security_deposit_amount": str(deposit_amount),
            "deposit_payment_option": deposit_payment_option,
            "deposit_buffer_days": deposit_buffer_days,
            "initial_deposit_payment": str(initial_deposit_payment or MONEY_ZERO),
            "deposit_due_date": deposit_due_date.isoformat() if deposit_due_date else None,
        },
    )

    if subscription.status == SubscriptionStatus.ACTIVE:
        from contracts.services.rent_lease_billing_service import generate_monthly_demands_for_subscription
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=performed_by)

    return subscription


@transaction.atomic
def create_lease_contract(
    *,
    customer,
    product=None,
    items: list[dict] | None = None,
    tenure_months: int,
    start_date=None,
    security_deposit_percent: Decimal,
    monthly_yield_percent: Decimal = Decimal("5.00"),
    buyout_amount: Decimal | None = None,
    ownership_transfer_allowed: bool = False,
    performed_by=None,
    handover_notes: str = "",
    contract_terms_snapshot: str = "",
    save_as_draft: bool = False,
    deposit_payment_option: str = "FULL",
    deposit_buffer_days: int = 30,
    deposit_due_date: date | None = None,
    initial_deposit_payment: Decimal | None = None,
    deposit_finance_account_id: int | None = None,
    deposit_payment_method: str = "CASH",
) -> Subscription:
    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError({"tenure_months": "Tenure must be greater than zero."})

    monthly_yield_percent = Decimal(str(monthly_yield_percent)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if monthly_yield_percent <= Decimal("0.00"):
        raise ValidationError({"monthly_yield_percent": "Yield rate must be greater than zero."})

    normalized_items = _normalize_contract_items(
        plan_type=PlanType.LEASE,
        product=product,
        items=items,
        default_monthly_yield_percent=monthly_yield_percent,
        default_security_deposit_percent=security_deposit_percent,
    )

    primary_product = normalized_items[0]["product"]
    product_value = sum((it["total_base_price"] for it in normalized_items), MONEY_ZERO)
    monthly_amount = sum((it["monthly_amount"] for it in normalized_items), MONEY_ZERO)
    total_amount = (monthly_amount * Decimal(tenure_months)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    deposit_amount = sum((it["security_deposit_amount"] for it in normalized_items), MONEY_ZERO)
    effective_deposit_percent = (
        (deposit_amount * Decimal("100.00") / product_value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if product_value > MONEY_ZERO
        else Decimal(str(security_deposit_percent or "20.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    )

    today = timezone.localdate()
    deposit_buffer_days = int(deposit_buffer_days or 30)
    if deposit_buffer_days < 0 or deposit_buffer_days > 90:
        deposit_buffer_days = 30
    if deposit_due_date is not None:
        deposit_due_date = deposit_due_date
    elif deposit_payment_option == "PARTIAL":
        deposit_due_date = min(today + timedelta(days=deposit_buffer_days), start_date)
    else:
        # Full upfront deposit: due at contract activation/creation (today) or on start_date if earlier
        deposit_due_date = min(today, start_date)

    # Drafts are always allowed. Activating (the default) goes through the
    # additive KYC/document gate (no-op unless KYC gating is enabled).
    contract_status = SubscriptionStatus.DRAFT if save_as_draft else SubscriptionStatus.ACTIVE
    if not save_as_draft:
        from customers.services.kyc_readiness_service import enforce_contract_kyc_gate

        enforce_contract_kyc_gate(
            customer=customer, plan_type=PlanType.LEASE, stage="activate"
        )

    terms_snapshot = (contract_terms_snapshot or "").strip() or _default_terms_snapshot(plan_type="LEASE")

    normalized_buyout = None
    if buyout_amount is not None and str(buyout_amount).strip() != "":
        normalized_buyout = q2(Decimal(str(buyout_amount)))
        if normalized_buyout < MONEY_ZERO:
            raise ValidationError({"buyout_amount": "Buyout amount cannot be negative."})

    items_snapshot = [
        {
            "product_id": it["product"].id,
            "product_name": it["product"].name,
            "product_code": getattr(it["product"], "product_code", ""),
            "quantity": it["quantity"],
            "unit_base_price": str(it["unit_base_price"]),
            "total_base_price": str(it["total_base_price"]),
            "monthly_yield_percent": str(it["monthly_yield_percent"]),
            "monthly_amount": str(it["monthly_amount"]),
            "security_deposit_percent": str(it["security_deposit_percent"]),
            "security_deposit_amount": str(it["security_deposit_amount"]),
        }
        for it in normalized_items
    ]

    subscription = Subscription.objects.create(
        customer=customer,
        product=primary_product,
        plan_type=PlanType.LEASE,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_amount,
        status=contract_status,
        product_snapshot={
            "product_id": primary_product.id,
            "product_code": getattr(primary_product, "product_code", ""),
            "name": getattr(primary_product, "name", ""),
            "base_price": str(getattr(primary_product, "base_price", MONEY_ZERO)),
            "items_count": len(normalized_items),
            "items": items_snapshot,
        },
        pricing_snapshot={
            "plan_type": PlanType.LEASE,
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_amount),
            "total_amount": str(total_amount),
            "total_product_value": str(product_value),
            "items_count": len(normalized_items),
            "security_deposit_percent": str(effective_deposit_percent),
            "security_deposit_amount": str(deposit_amount),
            "deposit_payment_option": deposit_payment_option,
            "deposit_buffer_days": deposit_buffer_days,
            "initial_deposit_payment": str(initial_deposit_payment or MONEY_ZERO),
            "deposit_due_date": deposit_due_date.isoformat() if deposit_due_date else None,
        },
        tax_profile_snapshot=build_non_gst_snapshot(
            document_type="LEASE_CONTRACT",
            document_date=start_date,
            party_type="CUSTOMER",
            party_id=getattr(customer, "id", None),
            product_id=getattr(primary_product, "id", None),
        ),
    )

    LeaseSubscriptionProfile.objects.create(
        subscription=subscription,
        security_deposit_percent=effective_deposit_percent,
        monthly_yield_percent=monthly_yield_percent,
        security_deposit_amount=deposit_amount,
        refundable_security_deposit=deposit_amount,
        buyout_amount=normalized_buyout,
        ownership_transfer_allowed=bool(ownership_transfer_allowed),
        return_condition_status=ContractReturnConditionStatus.NOT_ASSESSED,
        deduction_amount=MONEY_ZERO,
        refund_amount=deposit_amount,
        refund_status=ContractRefundStatus.PENDING,
        handover_notes=handover_notes or "",
        contract_terms_snapshot=terms_snapshot,
    )

    # Persist contract items
    for it in normalized_items:
        ContractItem.objects.create(
            subscription=subscription,
            product=it["product"],
            quantity=it["quantity"],
            unit_base_price=it["unit_base_price"],
            total_base_price=it["total_base_price"],
            monthly_yield_percent=it["monthly_yield_percent"],
            monthly_amount=it["monthly_amount"],
            security_deposit_percent=it["security_deposit_percent"],
            security_deposit_amount=it["security_deposit_amount"],
        )

    # Assign immutable contract number
    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    # Create possession record
    from deliveries.services.product_possession_service import create_possession_record
    create_possession_record(subscription=subscription, performed_by=performed_by)

    # Initialize security deposit demand
    from contracts.services.rent_lease_billing_service import ensure_security_deposit_demand
    deposit_demand = ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    if deposit_demand and deposit_due_date and deposit_demand.due_date != deposit_due_date and deposit_demand.collected_amount <= MONEY_ZERO:
        deposit_demand.due_date = deposit_due_date
        deposit_demand.save(update_fields=["due_date", "updated_at"])

    # If upfront deposit collection was provided
    if initial_deposit_payment is not None and Decimal(str(initial_deposit_payment)) > MONEY_ZERO:
        init_amount = q2(Decimal(str(initial_deposit_payment)))
        if deposit_finance_account_id:
            try:
                from contracts.services.rent_lease_collection_workflow_service import collect_security_deposit_with_metadata
                collect_security_deposit_with_metadata(
                    subscription=subscription,
                    amount=init_amount,
                    performed_by=performed_by,
                    finance_account_id=deposit_finance_account_id,
                    payment_method=deposit_payment_method or "CASH",
                    payment_date=start_date,
                    note=f"Security deposit collected at contract creation ({deposit_payment_option})",
                )
            except Exception:
                pass
        else:
            deposit_demand.refresh_from_db()
            deposit_demand.collected_amount = min(init_amount, deposit_demand.amount)
            deposit_demand.held_amount = deposit_demand.collected_amount
            deposit_demand.refundable_amount = deposit_demand.collected_amount
            deposit_demand.status = (
                RentLeaseDemandStatus.PAID
                if deposit_demand.collected_amount >= deposit_demand.amount
                else RentLeaseDemandStatus.PARTIAL
            )
            deposit_demand.save(update_fields=["collected_amount", "held_amount", "refundable_amount", "status", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "LEASE_CONTRACT_CREATED",
            "subscription_id": subscription.id,
            "customer_id": getattr(customer, "id", None),
            "product_id": getattr(primary_product, "id", None),
            "items_count": len(normalized_items),
            "product_ids": [it["product"].id for it in normalized_items],
            "total_product_value": str(product_value),
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_amount),
            "tenure_months": tenure_months,
            "security_deposit_percent": str(effective_deposit_percent),
            "security_deposit_amount": str(deposit_amount),
            "deposit_payment_option": deposit_payment_option,
            "deposit_buffer_days": deposit_buffer_days,
            "initial_deposit_payment": str(initial_deposit_payment or MONEY_ZERO),
            "deposit_due_date": deposit_due_date.isoformat() if deposit_due_date else None,
            "buyout_amount": str(normalized_buyout) if normalized_buyout is not None else None,
            "ownership_transfer_allowed": bool(ownership_transfer_allowed),
        },
    )

    if subscription.status == SubscriptionStatus.ACTIVE:
        from contracts.services.rent_lease_billing_service import generate_monthly_demands_for_subscription
        generate_monthly_demands_for_subscription(subscription=subscription, performed_by=performed_by)

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
