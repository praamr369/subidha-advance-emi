"""
Best-effort in-app notifications for operational events.

Finance posting and EMI allocation must never depend on this module.
Failures are swallowed after logging so core money flows stay unchanged.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

logger = logging.getLogger(__name__)


def _payload(*, category: str, severity: str = "INFO", **kwargs: Any) -> dict:
    data: dict[str, Any] = {"category": category, "severity": severity}
    int_fields = {
        "subscription_id",
        "emi_id",
        "payment_id",
        "direct_sale_id",
        "receipt_id",
        "purchase_need_id",
        "service_case_id",
    }
    for key, value in kwargs.items():
        if value is None:
            continue
        if key in int_fields:
            try:
                data[key] = int(value)
            except (TypeError, ValueError):
                continue
        else:
            data[key] = value
    return data


def schedule_emi_payment_posted_notifications(
    *,
    payment_id: int,
    customer_user_id: int,
    partner_user_id: int | None,
    cashier_user_id: int | None,
    subscription_label: str,
    amount_str: str,
) -> None:
    """Notify customer (and linked partner / collecting cashier) after EMI payment commits."""

    def _run() -> None:
        try:
            from accounts.models import User, UserRole
            from system_jobs.services.notifications import emit_notification

            customer = User.objects.filter(pk=customer_user_id, is_active=True).first()
            if customer is not None:
                emit_notification(
                    module="customer",
                    title="EMI payment recorded",
                    body=f"{subscription_label}: ₹{amount_str} recorded on your account.",
                    recipient=customer,
                    payload=_payload(category="PAYMENT_POSTED", payment_id=payment_id),
                    dedupe_key=f"PAYMENT_POSTED:customer:{payment_id}",
                )

            if partner_user_id and int(partner_user_id) != int(customer_user_id):
                partner = User.objects.filter(pk=partner_user_id, is_active=True).first()
                if partner is not None:
                    emit_notification(
                        module="partner",
                        title="Customer EMI collected",
                        body=f"{subscription_label}: ₹{amount_str} collected for a linked customer.",
                        recipient=partner,
                        payload=_payload(category="PAYMENT_POSTED", payment_id=payment_id),
                        dedupe_key=f"PAYMENT_POSTED:partner:{payment_id}",
                    )

            if cashier_user_id and int(cashier_user_id) != int(customer_user_id):
                cashier = User.objects.filter(pk=cashier_user_id, is_active=True).first()
                if cashier is not None and getattr(cashier, "role", None) == UserRole.CASHIER:
                    emit_notification(
                        module="cashier",
                        title="Collection posted",
                        body=f"{subscription_label}: ₹{amount_str} posted successfully.",
                        recipient=cashier,
                        payload=_payload(category="PAYMENT_POSTED", payment_id=payment_id),
                        dedupe_key=f"PAYMENT_POSTED:cashier:{payment_id}",
                    )
        except Exception:
            logger.exception("operational_notification.emi_payment_posted_failed payment_id=%s", payment_id)

    transaction.on_commit(_run)


def schedule_direct_sale_collection_notifications(
    *,
    receipt_id: int,
    direct_sale_id: int,
    customer_user_id: int | None,
    amount_str: str,
    receipt_no: str | None,
    cashier_user_id: int | None,
) -> None:
    """Notify registered customer and cashier after a direct-sale receipt commits."""

    def _run() -> None:
        try:
            from accounts.models import User, UserRole
            from system_jobs.services.notifications import emit_notification

            label = (receipt_no or "").strip() or f"Receipt #{receipt_id}"

            if customer_user_id:
                customer = User.objects.filter(pk=customer_user_id, is_active=True).first()
                if customer is not None:
                    emit_notification(
                        module="customer",
                        title="Direct sale receipt issued",
                        body=f"₹{amount_str} collected. {label} (direct sale #{direct_sale_id}).",
                        recipient=customer,
                        payload=_payload(
                            category="RECEIPT_CREATED",
                            receipt_id=receipt_id,
                            direct_sale_id=direct_sale_id,
                        ),
                        dedupe_key=f"RECEIPT_CREATED:customer:{receipt_id}",
                    )

            if cashier_user_id:
                cashier = User.objects.filter(pk=cashier_user_id, is_active=True).first()
                if cashier is not None and getattr(cashier, "role", None) == UserRole.CASHIER:
                    emit_notification(
                        module="cashier",
                        title="Direct sale receipt posted",
                        body=f"{label}: ₹{amount_str} for direct sale #{direct_sale_id}.",
                        recipient=cashier,
                        payload=_payload(
                            category="RECEIPT_CREATED",
                            receipt_id=receipt_id,
                            direct_sale_id=direct_sale_id,
                        ),
                        dedupe_key=f"RECEIPT_CREATED:cashier:{receipt_id}",
                    )
        except Exception:
            logger.exception(
                "operational_notification.direct_sale_receipt_failed receipt_id=%s",
                receipt_id,
            )

    transaction.on_commit(_run)


def schedule_direct_sale_stock_requirement_notifications(
    *,
    purchase_need_id: int,
    sale_no: str,
    product_name: str,
    shortage_quantity: str,
) -> None:
    """Notify admins/inventory when a direct-sale purchase need is created or refreshed."""

    def _run() -> None:
        try:
            from decimal import Decimal

            from system_jobs.services.broadcast import notify_all_active_admins

            short = Decimal(str(shortage_quantity or "0"))
            severity = "WARNING" if short > Decimal("0") else "INFO"
            label = (sale_no or "").strip() or f"sale-{purchase_need_id}"
            notify_all_active_admins(
                module="inventory",
                title="Stock requirement created",
                body=f"{label}: {product_name or 'Product'} — review pending inventory requirements.",
                dedupe_prefix=f"STOCK_REQUIREMENT_CREATED:{purchase_need_id}",
                payload=_payload(
                    category="STOCK_REQUIREMENT_CREATED",
                    severity=severity,
                    purchase_need_id=purchase_need_id,
                    object_type="DIRECT_SALE_REQUIREMENT",
                    action_url="/admin/inventory/workspace",
                ),
            )
        except Exception:
            logger.exception(
                "operational_notification.direct_sale_stock_requirement_failed purchase_need_id=%s",
                purchase_need_id,
            )

    transaction.on_commit(_run)


def schedule_direct_sale_delivery_ready_notifications(
    *,
    direct_sale_id: int,
    sale_no: str,
    service_case_id: int,
) -> None:
    """Notify admins/delivery desk once a paid direct sale becomes dispatch-ready."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            label = (sale_no or "").strip() or f"SALE-{direct_sale_id}"
            notify_all_active_admins(
                module="delivery",
                title="Direct sale ready for delivery",
                body=f"{label} is fully paid and ready for dispatch (when stock allows).",
                dedupe_prefix=f"DIRECT_SALE_DELIVERY_READY:{direct_sale_id}",
                payload=_payload(
                    category="DIRECT_SALE_DELIVERY_READY",
                    severity="INFO",
                    direct_sale_id=direct_sale_id,
                    service_case_id=service_case_id,
                    object_type="DIRECT_SALE_DELIVERY",
                    action_url="/admin/delivery/workspace",
                ),
            )
        except Exception:
            logger.exception(
                "operational_notification.direct_sale_delivery_ready_failed direct_sale_id=%s",
                direct_sale_id,
            )

    transaction.on_commit(_run)


def schedule_subscription_request_notification(
    *,
    request_id: int,
    customer_name: str,
    product_name: str,
) -> None:
    """Notify admins when a new subscription request is submitted."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="subscriptions",
                title="New subscription request",
                body=f"{customer_name} requested {product_name}. Review and approve.",
                dedupe_prefix=f"SUBSCRIPTION_REQUEST:{request_id}",
                payload=_payload(
                    category="SUBSCRIPTION_REQUEST_SUBMITTED",
                    severity="INFO",
                    action_url="/admin/subscription-requests",
                ),
            )
        except Exception:
            logger.exception("operational_notification.subscription_request_failed id=%s", request_id)

    transaction.on_commit(_run)


def schedule_lead_created_notification(
    *,
    lead_id: int,
    lead_name: str,
    source: str = "",
) -> None:
    """Notify admins when a new lead is created."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            body = f"New lead: {lead_name}"
            if source:
                body += f" (via {source})"
            notify_all_active_admins(
                module="crm",
                title="New lead received",
                body=body,
                dedupe_prefix=f"LEAD_CREATED:{lead_id}",
                payload=_payload(
                    category="LEAD_CREATED",
                    severity="INFO",
                    action_url="/admin/crm/leads",
                ),
            )
        except Exception:
            logger.exception("operational_notification.lead_created_failed id=%s", lead_id)

    transaction.on_commit(_run)


def schedule_outstanding_alert_notification(
    *,
    customer_name: str,
    outstanding_amount: str,
    customer_id: int | None = None,
) -> None:
    """Notify admins of high outstanding balance."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="finance",
                title="Outstanding balance alert",
                body=f"{customer_name}: ₹{outstanding_amount} outstanding.",
                dedupe_prefix=f"OUTSTANDING_ALERT:{customer_id or customer_name}",
                payload=_payload(
                    category="OUTSTANDING_ALERT",
                    severity="WARNING",
                    action_url="/admin/outstandings",
                ),
            )
        except Exception:
            logger.exception("operational_notification.outstanding_alert_failed customer=%s", customer_name)

    transaction.on_commit(_run)


def schedule_vendor_bill_notification(
    *,
    bill_id: int,
    vendor_name: str,
    amount: str,
) -> None:
    """Notify admins when a vendor bill needs review."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="purchasing",
                title="Vendor bill pending",
                body=f"{vendor_name}: ₹{amount} bill awaiting review.",
                dedupe_prefix=f"VENDOR_BILL_PENDING:{bill_id}",
                payload=_payload(
                    category="VENDOR_BILL_PENDING",
                    severity="INFO",
                    action_url="/admin/accounting/purchase-bills",
                ),
            )
        except Exception:
            logger.exception("operational_notification.vendor_bill_failed id=%s", bill_id)

    transaction.on_commit(_run)
