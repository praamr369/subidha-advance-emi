from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from products_core.models import Product, ProductRelationship
from subscriptions.models import (
    AuditLog,
    BatchStatus,
    LuckyId,
    LuckyIdStatus,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit
from lucky_plan.services.batch_service import transition_batch_status
from subscriptions.services.business_event_service import append_business_event
from payments.services.emi_engine import generate_emi_schedule
from payments.services.emi_reconciliation import reconcile_subscription_emis
from subscriptions.models import BusinessEventType


def _q2(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_subscription_selected_accessories(subscription) -> list[dict]:
    """Return normalized selected accessories stored on an EMI/single-product subscription."""
    snapshot = getattr(subscription, "product_snapshot", None)
    if not isinstance(snapshot, dict):
        return []
    raw = snapshot.get("selected_accessories")
    if not isinstance(raw, list):
        return []
    return [row for row in raw if isinstance(row, dict) and row.get("product_id")]


def normalize_emi_selected_accessories(parent_product, raw_accessories) -> tuple[list[dict], Decimal]:
    """Validate and price selected accessory variants for an EMI subscription bundle."""
    if not raw_accessories:
        return [], Decimal("0.00")

    requested_ids: list[int] = []
    for row in raw_accessories:
        if not isinstance(row, dict):
            raise ValidationError({"accessories": "Each accessory entry must be an object."})
        pid = row.get("product_id") or row.get("product")
        if pid in (None, ""):
            raise ValidationError({"accessories": "Each accessory entry must include product_id."})
        try:
            requested_ids.append(int(pid))
        except (TypeError, ValueError):
            raise ValidationError({"accessories": f"Invalid accessory product_id '{pid}'."})

    products_by_id = {
        p.id: p
        for p in Product.objects.filter(id__in=requested_ids, is_active=True)
    }
    missing = [pid for pid in requested_ids if pid not in products_by_id]
    if missing:
        raise ValidationError(
            {"accessories": f"Active accessory product(s) not found: {missing}"}
        )

    rel_map: dict[int, ProductRelationship] = {}
    if parent_product is not None:
        rel_map = {
            rel.related_product_id: rel
            for rel in ProductRelationship.objects.filter(
                product_id=parent_product.id,
                relationship_type="ACCESSORY",
                related_product_id__in=requested_ids,
            )
        }

    normalized: list[dict] = []
    accessories_total = Decimal("0.00")

    for row in raw_accessories:
        pid = int(row.get("product_id") or row.get("product"))
        acc_prod = products_by_id[pid]
        try:
            qty = int(row.get("quantity", 1) or 1)
        except (TypeError, ValueError):
            raise ValidationError({"accessories": f"Invalid quantity for accessory {acc_prod.name}."})
        if qty <= 0:
            raise ValidationError({"accessories": f"Quantity must be > 0 for accessory {acc_prod.name}."})

        rel = rel_map.get(pid)
        charge_mode = str(
            row.get("charge_mode")
            or (rel.charge_mode if rel else "")
            or "PAID"
        ).strip().upper()

        raw_unit_price = row.get("unit_base_price")
        if raw_unit_price not in (None, ""):
            try:
                unit_price = _q2(Decimal(str(raw_unit_price)))
            except Exception:
                raise ValidationError({"accessories": f"Invalid unit price for accessory {acc_prod.name}."})
        elif charge_mode in {"INCLUDED", "FREE"}:
            unit_price = Decimal("0.00")
        elif rel is not None and rel.sale_price is not None:
            unit_price = _q2(Decimal(str(rel.sale_price)))
        else:
            unit_price = _q2(Decimal(str(getattr(acc_prod, "base_price", 0) or 0)))

        if unit_price < Decimal("0.00"):
            raise ValidationError({"accessories": f"Unit price cannot be negative for {acc_prod.name}."})
        if charge_mode in {"INCLUDED", "FREE"}:
            unit_price = Decimal("0.00")

        line_total = _q2(unit_price * Decimal(qty))
        accessories_total += line_total
        normalized.append({
            "product_id": acc_prod.id,
            "product_name": acc_prod.name,
            "product_code": getattr(acc_prod, "product_code", "") or "",
            "sku": getattr(acc_prod, "sku", "") or "",
            "quantity": qty,
            "unit_base_price": str(unit_price),
            "total_base_price": str(line_total),
            "charge_mode": charge_mode,
            "is_accessory": True,
            "parent_product_id": getattr(parent_product, "id", None),
        })

    return normalized, _q2(accessories_total)


def build_emi_bundle_snapshots(
    *,
    product,
    tenure_months: int,
    total_amount: Decimal,
    monthly_amount: Decimal,
    selected_accessories: list[dict] | None = None,
    accessories_configured: bool = False,
) -> tuple[dict, dict]:
    """Build deterministic product_snapshot and pricing_snapshot for an EMI contract."""
    accessories_list = list(selected_accessories or [])
    accessories_total = _q2(
        sum(Decimal(str(item.get("total_base_price") or "0.00")) for item in accessories_list)
    )
    product_snapshot = {
        "product_id": product.id,
        "product_code": getattr(product, "product_code", "") or "",
        "name": getattr(product, "name", "") or "",
        "base_price": str(_q2(Decimal(str(product.base_price)))),
        "accessories_configured": bool(accessories_configured or accessories_list),
        "selected_accessories": accessories_list,
    }
    pricing_snapshot = {
        "plan_type": PlanType.EMI,
        "tenure_months": int(tenure_months),
        "product_base_price": str(_q2(Decimal(str(product.base_price)))),
        "accessories_total": str(accessories_total),
        "monthly_amount": str(_q2(monthly_amount)),
        "total_amount": str(_q2(total_amount)),
    }
    return product_snapshot, pricing_snapshot


@transaction.atomic
def create_emi_subscription(
    *,
    customer,
    product,
    batch,
    lucky_number: int,
    tenure_months: int,
    partner=None,
    start_date=None,
    performed_by=None,
):
    """Create an EMI subscription using deterministic installment generation."""

    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError("Tenure must be greater than zero.")

    if batch.status != BatchStatus.OPEN:
        raise ValidationError("Batch is not open for subscription.")

    lucky = (
        LuckyId.objects.select_for_update(of=("self",))
        .select_related("batch")
        .get(batch=batch, lucky_number=lucky_number)
    )

    if lucky.status != LuckyIdStatus.AVAILABLE:
        raise ValidationError("Lucky ID already assigned.")

    total_amount = Decimal(product.base_price).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    monthly_amount = (total_amount / tenure_months).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    total_from_base = monthly_amount * tenure_months
    rounding_difference = total_amount - total_from_base

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        partner=partner,
        batch=batch,
        lucky_id=lucky,
        plan_type=PlanType.EMI,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_amount,
        status=SubscriptionStatus.ACTIVE,
    )

    lucky.status = LuckyIdStatus.ASSIGNED
    lucky.save(update_fields=["status"])

    assigned_count = batch.lucky_ids.filter(status=LuckyIdStatus.ASSIGNED).count()
    if assigned_count >= batch.total_slots:
        transition_batch_status(batch, BatchStatus.FULL)

    generate_emi_schedule(subscription, rounding_difference=rounding_difference)
    reconcile_subscription_emis(subscription)

    # Assign immutable ADV-EMI contract number
    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "customer_id": customer.id,
            "batch_id": batch.id,
            "lucky_id": lucky.lucky_number,
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_amount),
            "tenure_months": tenure_months,
        },
    )
    append_business_event(
        event_type=BusinessEventType.CONTRACT_CREATED,
        source_module="subscriptions.services.subscription_service.create_emi_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        batch=batch,
        lucky_id=lucky,
        payload={
            "subscription_id": subscription.id,
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_amount),
            "total_amount": str(total_amount),
        },
    )
    append_business_event(
        event_type=BusinessEventType.EMI_CREATED,
        source_module="subscriptions.services.subscription_service.create_emi_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        batch=batch,
        lucky_id=lucky,
        payload={
            "subscription_id": subscription.id,
            "emi_count": subscription.emis.count(),
        },
    )

    # Important P0 hardening:
    # A sold-out batch must remain FULL and drawable.
    # Do not move to CLOSED just because all Lucky IDs are assigned.
    if not LuckyId.objects.filter(batch=batch, status=LuckyIdStatus.AVAILABLE).exists():
        if batch.status != BatchStatus.FULL:
            transition_batch_status(batch, BatchStatus.FULL)

    return subscription


@transaction.atomic
def create_rent_subscription(
    *,
    customer,
    product,
    monthly_rent_amount: Decimal,
    tenure_months: int = 12,
    partner=None,
    start_date=None,
    performed_by=None,
):
    """Create a RENT subscription."""

    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError("Tenure must be greater than zero.")

    monthly_rent = Decimal(monthly_rent_amount).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    total_amount = (monthly_rent * tenure_months).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        partner=partner,
        plan_type=PlanType.RENT,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_rent,
        status=SubscriptionStatus.ACTIVE,
    )

    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "customer_id": customer.id,
            "plan_type": "RENT",
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_rent),
            "tenure_months": tenure_months,
        },
    )
    append_business_event(
        event_type=BusinessEventType.CONTRACT_CREATED,
        source_module="subscriptions.services.subscription_service.create_rent_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        payload={
            "subscription_id": subscription.id,
            "plan_type": "RENT",
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_rent),
            "total_amount": str(total_amount),
        },
    )

    return subscription


@transaction.atomic
def create_lease_subscription(
    *,
    customer,
    product,
    monthly_lease_amount: Decimal,
    tenure_months: int = 24,
    partner=None,
    start_date=None,
    performed_by=None,
):
    """Create a LEASE subscription."""

    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError("Tenure must be greater than zero.")

    monthly_lease = Decimal(monthly_lease_amount).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    total_amount = (monthly_lease * tenure_months).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        partner=partner,
        plan_type=PlanType.LEASE,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_lease,
        status=SubscriptionStatus.ACTIVE,
    )

    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "customer_id": customer.id,
            "plan_type": "LEASE",
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_lease),
            "tenure_months": tenure_months,
        },
    )
    append_business_event(
        event_type=BusinessEventType.CONTRACT_CREATED,
        source_module="subscriptions.services.subscription_service.create_lease_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        payload={
            "subscription_id": subscription.id,
            "plan_type": "LEASE",
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_lease),
            "total_amount": str(total_amount),
        },
    )

    return subscription
