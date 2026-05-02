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
    for key, value in kwargs.items():
        if value is None:
            continue
        if key in {"subscription_id", "emi_id", "payment_id", "direct_sale_id", "receipt_id"}:
            try:
                data[key] = int(value)
            except (TypeError, ValueError):
                continue
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
