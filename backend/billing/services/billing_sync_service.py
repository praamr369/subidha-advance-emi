from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from billing.models import (
    BillingActivationState,
    BillingInstallmentMirror,
    BillingProfile,
    BillingSyncEvent,
    BillingSyncEventStatus,
)
from subscriptions.models import EmiStatus, FulfillmentStatus, Subscription, SubscriptionStatus

MONEY_ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _invoice_eligibility(subscription: Subscription) -> tuple[str, bool]:
    fulfillment_status = (subscription.fulfillment_status or "").strip().upper()
    subscription_status = (subscription.status or "").strip().upper()

    if subscription_status == SubscriptionStatus.COMPLETED:
        return BillingActivationState.COMPLETED, False

    if fulfillment_status in {FulfillmentStatus.RETURN_REQUESTED, FulfillmentStatus.RETURNED}:
        return BillingActivationState.RETURN_HOLD, False

    if subscription_status == SubscriptionStatus.ACTIVE and fulfillment_status == FulfillmentStatus.DELIVERED:
        return BillingActivationState.ACTIVE, True

    if subscription_status == SubscriptionStatus.WON and fulfillment_status == FulfillmentStatus.DELIVERED:
        return BillingActivationState.ACTIVE, True

    if fulfillment_status == FulfillmentStatus.DELIVERED:
        return BillingActivationState.READY, True

    return BillingActivationState.PENDING_DELIVERY, False


def _last_non_reversed_payment_date(emi) -> object | None:
    payments = [
        payment
        for payment in emi.payments.all()
        if not ((payment.allocation_metadata or {}).get("reversal") or {}).get("is_reversed")
    ]
    if not payments:
        return None
    return max(payment.payment_date for payment in payments if payment.payment_date is not None)


def _get_due_row(subscription: Subscription):
    pending = [
        emi
        for emi in subscription.emis.all()
        if (emi.status or "").strip().upper() == EmiStatus.PENDING
    ]
    if not pending:
        return None
    pending.sort(key=lambda row: (row.due_date, row.month_no, row.id))
    return pending[0]


def _build_sync_payload(*, subscription: Subscription, profile: BillingProfile) -> dict:
    due_row = _get_due_row(subscription)
    return {
        "subscription_id": subscription.id,
        "customer_id": subscription.customer_id,
        "product_id": subscription.product_id,
        "activation_state": profile.activation_state,
        "invoice_eligible": profile.invoice_eligible,
        "delivery_gate_status": profile.delivery_gate_status,
        "contract_total": str(profile.contract_total),
        "monthly_amount": str(profile.monthly_amount),
        "paid_amount_snapshot": str(profile.paid_amount_snapshot),
        "waived_amount_snapshot": str(profile.waived_amount_snapshot),
        "remaining_amount_snapshot": str(profile.remaining_amount_snapshot),
        "next_due_date": due_row.due_date.isoformat() if due_row is not None else None,
        "next_due_amount": str(due_row.amount) if due_row is not None else "0.00",
    }


def _get_or_create_sync_event(
    *,
    billing_profile: BillingProfile,
    source_model: str,
    source_id: str,
    event_type: str,
    performed_by=None,
    idempotency_key: str | None = None,
    payload: dict | None = None,
) -> tuple[BillingSyncEvent, bool]:
    if idempotency_key:
        existing = (
            BillingSyncEvent.objects.select_for_update()
            .filter(idempotency_key=idempotency_key)
            .first()
        )
        if existing is not None:
            return existing, False

    try:
        event = BillingSyncEvent.objects.create(
            billing_profile=billing_profile,
            source_model=source_model,
            source_id=source_id,
            event_type=event_type,
            status=BillingSyncEventStatus.SYNCED,
            idempotency_key=idempotency_key,
            payload=payload or {},
            synced_at=timezone.now(),
            performed_by=performed_by,
        )
    except IntegrityError:
        if not idempotency_key:
            raise
        event = BillingSyncEvent.objects.get(idempotency_key=idempotency_key)
        return event, False
    return event, True


@transaction.atomic
def sync_subscription_billing_profile(
    *,
    subscription_id: int,
    source_model: str = "Subscription",
    source_id: str | None = None,
    event_type: str = "PROFILE_REFRESH",
    performed_by=None,
    idempotency_key: str | None = None,
) -> tuple[BillingProfile, BillingSyncEvent, bool]:
    subscription = (
        Subscription.objects.select_for_update()
        .select_related("customer", "product")
        .prefetch_related("emis", "emis__payments", "deliveries")
        .get(pk=subscription_id)
    )

    activation_state, invoice_eligible = _invoice_eligibility(subscription)
    next_due = _get_due_row(subscription)
    latest_delivery = max(
        (delivery for delivery in subscription.deliveries.all() if delivery.delivered_at),
        key=lambda delivery: delivery.delivered_at,
        default=None,
    )
    activated_at = latest_delivery.delivered_at if latest_delivery is not None else None

    profile, _ = BillingProfile.objects.get_or_create(
        subscription=subscription,
        defaults={
            "customer": subscription.customer,
            "product": subscription.product,
            "contract_start_date": subscription.start_date,
        },
    )
    profile.customer = subscription.customer
    profile.product = subscription.product
    profile.activation_state = activation_state
    profile.delivery_gate_required = subscription.plan_type == "EMI"
    profile.delivery_gate_status = subscription.fulfillment_status or ""
    profile.invoice_eligible = invoice_eligible
    profile.contract_reference_snapshot = subscription.contract_reference or ""
    profile.contract_start_date = subscription.start_date
    profile.tenure_months = subscription.tenure_months
    profile.contract_total = _money(subscription.total_amount)
    profile.monthly_amount = _money(subscription.monthly_amount)
    profile.paid_amount_snapshot = _money(subscription.total_paid())
    profile.waived_amount_snapshot = _money(subscription.waived_amount)
    profile.remaining_amount_snapshot = _money(subscription.remaining_contract_amount())
    profile.next_due_date = next_due.due_date if next_due is not None else None
    profile.next_due_amount = _money(next_due.amount if next_due is not None else MONEY_ZERO)
    profile.product_code_snapshot = subscription.product.product_code
    profile.product_name_snapshot = subscription.product.name
    if activated_at and profile.activated_at is None:
        profile.activated_at = activated_at
    elif activation_state == BillingActivationState.RETURN_HOLD and latest_delivery is not None:
        profile.activated_at = latest_delivery.delivered_at
    profile.last_synced_at = timezone.now()
    profile.last_synced_event = event_type
    profile.save()

    active_emi_ids: list[int] = []
    for emi in subscription.emis.all():
        active_emi_ids.append(emi.id)
        mirror, _ = BillingInstallmentMirror.objects.get_or_create(
            emi=emi,
            defaults={
                "billing_profile": profile,
                "month_no": emi.month_no,
                "due_date": emi.due_date,
                "amount": emi.amount,
                "status_snapshot": emi.status,
            },
        )
        mirror.billing_profile = profile
        mirror.month_no = emi.month_no
        mirror.due_date = emi.due_date
        mirror.amount = _money(emi.amount)
        mirror.status_snapshot = emi.status
        mirror.paid_amount_snapshot = _money(emi.net_paid_amount())
        mirror.waived_amount_snapshot = (
            _money(emi.amount) if (emi.status or "").strip().upper() == EmiStatus.WAIVED else MONEY_ZERO
        )
        mirror.outstanding_amount_snapshot = _money(emi.balance_amount())
        mirror.payment_count_snapshot = emi.payments.count()
        mirror.last_payment_date = _last_non_reversed_payment_date(emi)
        mirror.save()

    BillingInstallmentMirror.objects.filter(billing_profile=profile).exclude(emi_id__in=active_emi_ids).delete()

    payload = _build_sync_payload(subscription=subscription, profile=profile)
    event, created = _get_or_create_sync_event(
        billing_profile=profile,
        source_model=source_model,
        source_id=str(source_id or subscription.id),
        event_type=event_type,
        performed_by=performed_by,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return profile, event, created


def sync_payment_into_billing(*, payment_id: int, performed_by=None, event_type: str = "PAYMENT_POSTED"):
    from subscriptions.models import Payment

    payment = Payment.objects.select_related("subscription").get(pk=payment_id)
    return sync_subscription_billing_profile(
        subscription_id=payment.subscription_id,
        source_model="Payment",
        source_id=str(payment.id),
        event_type=event_type,
        performed_by=performed_by,
        idempotency_key=f"PAYMENT:{payment.id}:{event_type}",
    )


def sync_waiver_into_billing(*, subscription_id: int, performed_by=None):
    return sync_subscription_billing_profile(
        subscription_id=subscription_id,
        source_model="Subscription",
        source_id=str(subscription_id),
        event_type="WAIVER_APPLIED",
        performed_by=performed_by,
        idempotency_key=f"SUBSCRIPTION:{subscription_id}:WAIVER_APPLIED",
    )


def sync_delivery_into_billing(*, delivery, performed_by=None):
    return sync_subscription_billing_profile(
        subscription_id=delivery.subscription_id,
        source_model="SubscriptionDelivery",
        source_id=str(delivery.id),
        event_type=f"DELIVERY_{delivery.status}",
        performed_by=performed_by,
        idempotency_key=f"DELIVERY:{delivery.id}:{delivery.status}",
    )
