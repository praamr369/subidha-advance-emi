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
        "delivery_id",
        "advance_id",
        "lead_id",
        "request_id",
        "document_id",
        "draw_id",
        "ticket_id",
        "goods_receipt_id",
        "vendor_bill_id",
        "vendor_payment_id",
        "invoice_id",
        "credit_note_id",
        "debit_note_id",
        "refund_id",
        "day_close_id",
        "production_job_id",
        "partner_collection_request_id",
        "rental_asset_id",
        "reconciliation_run_id",
    }
    for key, value in kwargs.items():
        if value is None:
            continue
        if key in int_fields:
            try:
                data[key] = int(value)
            except (TypeError, ValueError):
                continue
        elif hasattr(value, "isoformat"):
            data[key] = value.isoformat()
        elif type(value).__name__ == "Decimal":
            data[key] = str(value)
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
    """Notify customer (and linked partner / collecting cashier / admins) after EMI payment commits."""

    def _run() -> None:
        try:
            from accounts.models import User, UserRole
            from system_jobs.services.broadcast import notify_all_active_admins
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

            notify_all_active_admins(
                module="payments",
                title="EMI payment collected",
                body=f"{subscription_label}: ₹{amount_str} recorded on account (Payment #{payment_id}).",
                dedupe_prefix=f"PAYMENT_POSTED:admin:{payment_id}",
                payload=_payload(
                    category="PAYMENT_POSTED",
                    severity="INFO",
                    payment_id=payment_id,
                    action_url="/admin/payments",
                    object_type="PAYMENT",
                ),
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
    """Notify registered customer, cashier, and store admins after a direct-sale receipt commits."""

    def _run() -> None:
        try:
            from accounts.models import User, UserRole
            from system_jobs.services.broadcast import notify_all_active_admins
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

            notify_all_active_admins(
                module="billing",
                title="Direct sale receipt collected",
                body=f"{label}: ₹{amount_str} collected for direct sale #{direct_sale_id}.",
                dedupe_prefix=f"RECEIPT_CREATED:admin:{receipt_id}",
                payload=_payload(
                    category="RECEIPT_CREATED",
                    severity="INFO",
                    receipt_id=receipt_id,
                    direct_sale_id=direct_sale_id,
                    action_url="/admin/billing/receipts",
                    object_type="RECEIPT",
                ),
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
                    action_url="/admin/deliveries",
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
                    action_url="/admin/requests/subscriptions",
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


def schedule_contract_signing_request_notification(
    *,
    subscription_id: int,
    customer_user_id: int | None,
    contract_ref: str,
    plan_type: str,
    product_name: str,
    signing_path: str,
) -> None:
    """Notify registered customer that their contract is ready for digital signature."""

    def _run() -> None:
        try:
            from accounts.models import User
            from system_jobs.services.notifications import emit_notification

            if customer_user_id:
                customer = User.objects.filter(pk=customer_user_id, is_active=True).first()
                if customer is not None:
                    emit_notification(
                        module="customer",
                        title="Contract Signature Required",
                        body=f"Your {plan_type} contract ({contract_ref}) for {product_name} is ready for digital signature.",
                        recipient=customer,
                        payload=_payload(
                            category="CONTRACT_SIGNING_REQUEST",
                            severity="INFO",
                            subscription_id=subscription_id,
                            action_url=signing_path,
                            object_type="CONTRACT",
                        ),
                        dedupe_key=f"CONTRACT_SIGN_REQUEST:{subscription_id}",
                    )
        except Exception:
            logger.exception("operational_notification.contract_signing_request_failed sub_id=%s", subscription_id)

    transaction.on_commit(_run)


def schedule_contract_signed_notification(
    *,
    subscription_id: int,
    customer_user_id: int | None,
    contract_ref: str,
    plan_type: str,
    product_name: str,
) -> None:
    """Notify registered customer and store admins when a contract is digitally signed."""

    def _run() -> None:
        try:
            from accounts.models import User
            from system_jobs.services.broadcast import notify_all_active_admins
            from system_jobs.services.notifications import emit_notification

            if customer_user_id:
                customer = User.objects.filter(pk=customer_user_id, is_active=True).first()
                if customer is not None:
                    emit_notification(
                        module="customer",
                        title="Contract Digitally Signed",
                        body=f"Your {plan_type} contract ({contract_ref}) for {product_name} has been digitally signed and saved to your account.",
                        recipient=customer,
                        payload=_payload(
                            category="CONTRACT_SIGNED",
                            severity="INFO",
                            subscription_id=subscription_id,
                            action_url=f"/customer/subscriptions/{subscription_id}",
                            object_type="CONTRACT",
                        ),
                        dedupe_key=f"CONTRACT_SIGNED:{subscription_id}",
                    )

            notify_all_active_admins(
                module="subscriptions",
                title="Contract digitally signed",
                body=f"{contract_ref} ({product_name}) was signed by customer.",
                dedupe_prefix=f"ADMIN_CONTRACT_SIGNED:{subscription_id}",
                payload=_payload(
                    category="CONTRACT_SIGNED",
                    severity="INFO",
                    subscription_id=subscription_id,
                    action_url=f"/admin/subscriptions/{subscription_id}",
                    object_type="CONTRACT",
                ),
            )
        except Exception:
            logger.exception("operational_notification.contract_signed_failed sub_id=%s", subscription_id)

    transaction.on_commit(_run)


def schedule_pod_handover_ready_notification(
    *,
    delivery_id: int,
    customer_user_id: int | None,
    product_name: str,
    delivery_ref: str,
    handover_url: str,
) -> None:
    """Notify customer when Proof of Delivery (POD) / handover is initiated."""

    def _run() -> None:
        try:
            from accounts.models import User
            from system_jobs.services.notifications import emit_notification

            if customer_user_id:
                customer = User.objects.filter(pk=customer_user_id, is_active=True).first()
                if customer is not None:
                    emit_notification(
                        module="customer",
                        title="Delivery Out for Handover (POD)",
                        body=f"Your delivery {delivery_ref} for {product_name} is out for delivery. Prepare for physical inspection and handover sign-off.",
                        recipient=customer,
                        payload=_payload(
                            category="POD_HANDOVER_READY",
                            severity="INFO",
                            delivery_id=delivery_id,
                            action_url=handover_url,
                            object_type="DELIVERY_POD",
                        ),
                        dedupe_key=f"POD_HANDOVER_READY:{delivery_id}",
                    )
        except Exception:
            logger.exception("operational_notification.pod_handover_ready_failed delivery_id=%s", delivery_id)

    transaction.on_commit(_run)


def schedule_pod_completed_notification(
    *,
    delivery_id: int,
    customer_user_id: int | None,
    product_name: str,
    delivery_ref: str,
    delivery_date_str: str,
) -> None:
    """Notify customer and admins when Proof of Delivery (POD) handover is completed."""

    def _run() -> None:
        try:
            from accounts.models import User
            from system_jobs.services.broadcast import notify_all_active_admins
            from system_jobs.services.notifications import emit_notification

            if customer_user_id:
                customer = User.objects.filter(pk=customer_user_id, is_active=True).first()
                if customer is not None:
                    emit_notification(
                        module="customer",
                        title="Furniture Handover Confirmed (POD)",
                        body=f"Proof of delivery for {product_name} ({delivery_ref}) was completed on {delivery_date_str}. Furniture is officially in your custody.",
                        recipient=customer,
                        payload=_payload(
                            category="POD_COMPLETED",
                            severity="INFO",
                            delivery_id=delivery_id,
                            action_url="/customer/deliveries",
                            object_type="DELIVERY_POD",
                        ),
                        dedupe_key=f"POD_COMPLETED:customer:{delivery_id}",
                    )

            notify_all_active_admins(
                module="delivery",
                title="Proof of Delivery (POD) confirmed",
                body=f"{delivery_ref}: Handover completed with photos and customer signature on {delivery_date_str}.",
                dedupe_prefix=f"POD_COMPLETED:admin:{delivery_id}",
                payload=_payload(
                    category="POD_COMPLETED",
                    severity="INFO",
                    delivery_id=delivery_id,
                    action_url="/admin/deliveries",
                    object_type="DELIVERY_POD",
                ),
            )
        except Exception:
            logger.exception("operational_notification.pod_completed_failed delivery_id=%s", delivery_id)

    transaction.on_commit(_run)


def schedule_customer_advance_notification(
    *,
    advance_id: int,
    customer_name: str,
    customer_user_id: int | None,
    amount_str: str,
    method: str,
    reference_no: str | None = None,
) -> None:
    """Notify customer and store admins when an unapplied customer advance is recorded."""

    def _run() -> None:
        try:
            from accounts.models import User
            from system_jobs.services.broadcast import notify_all_active_admins
            from system_jobs.services.notifications import emit_notification

            ref_text = f" (Ref: {reference_no})" if reference_no else ""
            if customer_user_id:
                customer = User.objects.filter(pk=customer_user_id, is_active=True).first()
                if customer is not None:
                    emit_notification(
                        module="customer",
                        title="Customer advance received",
                        body=f"₹{amount_str} unapplied advance recorded via {method}{ref_text}.",
                        recipient=customer,
                        payload=_payload(
                            category="ADVANCE_COLLECTED",
                            severity="INFO",
                            advance_id=advance_id,
                            action_url="/customer/advances",
                            object_type="CUSTOMER_ADVANCE",
                        ),
                        dedupe_key=f"ADVANCE_COLLECTED:customer:{advance_id}",
                    )

            notify_all_active_admins(
                module="payments",
                title="Customer advance collected",
                body=f"{customer_name}: ₹{amount_str} unapplied advance recorded via {method}{ref_text} (Advance #{advance_id}).",
                dedupe_prefix=f"ADVANCE_COLLECTED:admin:{advance_id}",
                payload=_payload(
                    category="ADVANCE_COLLECTED",
                    severity="INFO",
                    advance_id=advance_id,
                    action_url="/admin/customer-advances",
                    object_type="CUSTOMER_ADVANCE",
                ),
            )
        except Exception:
            logger.exception("operational_notification.customer_advance_failed advance_id=%s", advance_id)

    transaction.on_commit(_run)


def schedule_payment_reversal_notification(
    *,
    payment_id: int,
    reversal_ledger_id: int,
    amount_str: str,
    reason: str,
    reversed_by_username: str = "",
) -> None:
    """Notify store admins when a payment is reversed (high-impact financial event)."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            by_text = f" by {reversed_by_username}" if reversed_by_username else ""
            notify_all_active_admins(
                module="payments",
                title="Payment reversed",
                body=f"Payment #{payment_id} (₹{amount_str}) reversed{by_text}. Reason: {reason or 'Not specified'}.",
                dedupe_prefix=f"PAYMENT_REVERSED:admin:{reversal_ledger_id}",
                payload=_payload(
                    category="PAYMENT_REVERSED",
                    severity="WARNING",
                    payment_id=payment_id,
                    action_url="/admin/payments/reversals",
                    object_type="PAYMENT_REVERSAL",
                ),
            )
        except Exception:
            logger.exception("operational_notification.payment_reversal_failed payment_id=%s", payment_id)

    transaction.on_commit(_run)


def schedule_product_request_notification(
    *,
    request_id: int,
    requester_name: str,
    product_name: str,
    request_type: str,
    role: str = "customer",
) -> None:
    """Notify store admins when a customer or partner submits a product request."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            role_label = "Partner" if role.upper() == "PARTNER" else "Customer"
            notify_all_active_admins(
                module="products",
                title=f"New product request ({role_label})",
                body=f"{requester_name} submitted a {request_type} request for {product_name}.",
                dedupe_prefix=f"PRODUCT_REQUEST:{request_id}",
                payload=_payload(
                    category="PRODUCT_REQUEST_SUBMITTED",
                    severity="INFO",
                    request_id=request_id,
                    action_url="/admin/requests/product-requests",
                    object_type="PRODUCT_REQUEST",
                ),
            )
        except Exception:
            logger.exception("operational_notification.product_request_failed id=%s", request_id)

    transaction.on_commit(_run)


def schedule_online_request_notification(
    *,
    request_id: int,
    request_number: str,
    customer_name: str,
    product_name: str,
    request_type: str,
) -> None:
    """Notify store admins when an online request is submitted."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="subscriptions",
                title="New online request received",
                body=f"{customer_name} submitted online request {request_number} ({request_type}) for {product_name}.",
                dedupe_prefix=f"ONLINE_REQUEST:{request_id}",
                payload=_payload(
                    category="ONLINE_REQUEST_SUBMITTED",
                    severity="INFO",
                    request_id=request_id,
                    action_url="/admin/requests/online-requests",
                    object_type="ONLINE_REQUEST",
                ),
            )
        except Exception:
            logger.exception("operational_notification.online_request_failed id=%s", request_id)

    transaction.on_commit(_run)


def schedule_customer_kyc_submitted_notification(
    *,
    customer_id: int,
    customer_name: str,
    document_type: str,
    document_id: int,
) -> None:
    """Notify store admins when a customer uploads or submits a KYC document for review."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="crm",
                title="KYC document submitted",
                body=f"{customer_name} uploaded {document_type} for verification. Review pending.",
                dedupe_prefix=f"KYC_SUBMITTED:{document_id}",
                payload=_payload(
                    category="KYC_SUBMITTED",
                    severity="INFO",
                    document_id=document_id,
                    action_url="/admin/crm/kyc",
                    object_type="KYC_DOCUMENT",
                ),
            )
        except Exception:
            logger.exception("operational_notification.kyc_submitted_failed doc_id=%s", document_id)

    transaction.on_commit(_run)


def schedule_customer_support_request_notification(
    *,
    request_id: int,
    customer_name: str,
    category: str,
    message: str,
) -> None:
    """Notify store admins when a customer opens a support ticket or service case."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            snippet = (message or "").strip()[:80]
            if len(message or "") > 80:
                snippet += "…"
            body = (
                f"{customer_name} ({category}): {snippet}"
                if snippet
                else f"{customer_name} opened a support request for {category}."
            )

            notify_all_active_admins(
                module="support",
                title="New customer support ticket",
                body=body,
                dedupe_prefix=f"SUPPORT_REQUEST:{request_id}",
                payload=_payload(
                    category="SUPPORT_REQUEST_CREATED",
                    severity="INFO",
                    ticket_id=request_id,
                    action_url="/admin/service-desk/tickets",
                    object_type="SUPPORT_TICKET",
                ),
            )
        except Exception:
            logger.exception("operational_notification.support_request_failed id=%s", request_id)

    transaction.on_commit(_run)


def schedule_draw_winner_notifications(
    *,
    draw_id: int,
    batch_code: str,
    winner_customer_user_id: int | None,
    winner_customer_name: str,
    lucky_number: int,
    waived_amount_str: str,
    waived_count: int,
) -> None:
    """Notify winner customer and store admins when SFEMI monthly promotional benefit is selected."""

    def _run() -> None:
        try:
            from accounts.models import User
            from system_jobs.services.broadcast import notify_all_active_admins
            from system_jobs.services.notifications import emit_notification

            if winner_customer_user_id:
                customer = User.objects.filter(pk=winner_customer_user_id, is_active=True).first()
                if customer is not None:
                    emit_notification(
                        module="customer",
                        title="SFEMI Promotional Benefit Awarded!",
                        body=f"Congratulations! You received the promotional benefit for batch {batch_code}. {waived_count} future EMIs totaling ₹{waived_amount_str} have been waived.",
                        recipient=customer,
                        payload=_payload(
                            category="SFEMI_BENEFIT_AWARDED",
                            severity="SUCCESS",
                            draw_id=draw_id,
                            action_url="/customer/subscriptions",
                            object_type="SFEMI_BENEFIT",
                        ),
                        dedupe_key=f"SFEMI_BENEFIT:customer:{draw_id}",
                    )

            notify_all_active_admins(
                module="subscriptions",
                title="SFEMI promotional benefit selected",
                body=f"Batch {batch_code}: Winner is {winner_customer_name} (SFEMI ID #{lucky_number}). Waived ₹{waived_amount_str} ({waived_count} EMIs).",
                dedupe_prefix=f"SFEMI_BENEFIT:admin:{draw_id}",
                payload=_payload(
                    category="SFEMI_BENEFIT_AWARDED",
                    severity="INFO",
                    draw_id=draw_id,
                    action_url="/admin/lucky-draws",
                    object_type="SFEMI_BENEFIT",
                ),
            )
        except Exception:
            logger.exception("operational_notification.draw_winner_failed draw_id=%s", draw_id)

    transaction.on_commit(_run)


def schedule_goods_receipt_notification(
    *,
    receipt_id: int,
    receipt_no: str,
    vendor_name: str,
    po_no: str | None = None,
    items_count: int = 0,
) -> None:
    """Notify store admins when Goods Receipt (GRN) is posted and stock is increased."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            po_text = f" (PO: {po_no})" if po_no else ""
            item_text = f" ({items_count} line items)" if items_count else ""
            notify_all_active_admins(
                module="inventory",
                title="Goods receipt posted (GRN)",
                body=f"GRN {receipt_no}: Goods received from {vendor_name}{po_text}{item_text}. Physical inventory updated.",
                dedupe_prefix=f"GOODS_RECEIPT_POSTED:{receipt_id}",
                payload=_payload(
                    category="GOODS_RECEIPT_POSTED",
                    severity="INFO",
                    goods_receipt_id=receipt_id,
                    action_url="/admin/purchases/receipts",
                    object_type="GOODS_RECEIPT",
                ),
            )
        except Exception:
            logger.exception("operational_notification.goods_receipt_failed receipt_id=%s", receipt_id)

    transaction.on_commit(_run)


def schedule_vendor_payment_notification(
    *,
    payment_id: int,
    payment_no: str,
    vendor_name: str,
    amount_str: str,
    bill_no: str | None = None,
) -> None:
    """Notify store admins when vendor payment is posted from cash/bank/UPI."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            bill_text = f" for Bill #{bill_no}" if bill_no else ""
            notify_all_active_admins(
                module="accounting",
                title="Vendor payment posted",
                body=f"{payment_no}: ₹{amount_str} paid to {vendor_name}{bill_text}.",
                dedupe_prefix=f"VENDOR_PAYMENT_POSTED:{payment_id}",
                payload=_payload(
                    category="VENDOR_PAYMENT_POSTED",
                    severity="INFO",
                    vendor_payment_id=payment_id,
                    action_url="/admin/accounting/vendor-settlements",
                    object_type="VENDOR_PAYMENT",
                ),
            )
        except Exception:
            logger.exception("operational_notification.vendor_payment_failed payment_id=%s", payment_id)

    transaction.on_commit(_run)


def schedule_direct_sale_invoice_notification(
    *,
    invoice_id: int,
    invoice_number: str,
    customer_name: str,
    amount_str: str,
    sale_id: int,
) -> None:
    """Notify store admins when a direct sale invoice is approved and finalized."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="billing",
                title="Direct sale invoice finalized",
                body=f"{invoice_number}: ₹{amount_str} direct sale finalized for {customer_name}.",
                dedupe_prefix=f"DIRECT_SALE_INVOICE_FINALIZED:{invoice_id}",
                payload=_payload(
                    category="INVOICE_FINALIZED",
                    severity="INFO",
                    invoice_id=invoice_id,
                    direct_sale_id=sale_id,
                    action_url="/admin/billing/invoices",
                    object_type="INVOICE",
                ),
            )
        except Exception:
            logger.exception("operational_notification.direct_sale_invoice_failed invoice_id=%s", invoice_id)

    transaction.on_commit(_run)


def schedule_credit_debit_note_notification(
    *,
    note_id: int,
    note_no: str,
    note_type: str,
    amount_str: str,
    customer_name: str,
    reason: str = "",
) -> None:
    """Notify store admins when a credit or debit note is posted."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            is_credit = note_type.upper() == "CREDIT"
            title = "Credit note posted" if is_credit else "Debit note posted"
            url = "/admin/billing/credit-notes" if is_credit else "/admin/billing/debit-notes"
            reason_text = f" (Reason: {reason})" if reason else ""

            notify_all_active_admins(
                module="billing",
                title=title,
                body=f"{note_no}: ₹{amount_str} {note_type.lower()} note posted for {customer_name}{reason_text}.",
                dedupe_prefix=f"NOTE_POSTED:{note_type}:{note_id}",
                payload=_payload(
                    category=f"{note_type.upper()}_NOTE_POSTED",
                    severity="INFO",
                    credit_note_id=note_id if is_credit else None,
                    debit_note_id=note_id if not is_credit else None,
                    action_url=url,
                    object_type="BILLING_NOTE",
                ),
            )
        except Exception:
            logger.exception("operational_notification.note_posted_failed note_id=%s", note_id)

    transaction.on_commit(_run)


def schedule_customer_refund_notification(
    *,
    refund_id: int,
    refund_no: str,
    customer_name: str,
    amount_str: str,
    method: str,
) -> None:
    """Notify store admins when a customer refund payout is settled."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="billing",
                title="Customer refund paid",
                body=f"{refund_no}: ₹{amount_str} refund disbursed to {customer_name} via {method}.",
                dedupe_prefix=f"CUSTOMER_REFUND_PAID:{refund_id}",
                payload=_payload(
                    category="REFUND_PAID",
                    severity="INFO",
                    refund_id=refund_id,
                    action_url="/admin/refunds/process",
                    object_type="CUSTOMER_REFUND",
                ),
            )
        except Exception:
            logger.exception("operational_notification.customer_refund_failed refund_id=%s", refund_id)

    transaction.on_commit(_run)


def schedule_cashier_day_close_notification(
    *,
    day_close_id: int,
    cashier_username: str,
    business_date_str: str,
    counted_cash_str: str,
    variance_str: str,
    has_variance: bool,
) -> None:
    """Notify store admins when a cashier submits day close evidence."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            severity = "WARNING" if has_variance else "INFO"
            variance_tag = f" — Variance: ₹{variance_str}" if has_variance else " — Clean (Zero variance)"
            notify_all_active_admins(
                module="finance",
                title="Cashier Day Close submitted",
                body=f"Day close #{day_close_id} ({business_date_str}) submitted by {cashier_username}. Counted cash: ₹{counted_cash_str}{variance_tag}.",
                dedupe_prefix=f"CASHIER_DAY_CLOSE_SUBMITTED:{day_close_id}",
                payload=_payload(
                    category="CASHIER_DAY_CLOSE",
                    severity=severity,
                    day_close_id=day_close_id,
                    action_url="/admin/settlements/day-closes",
                    object_type="CASHIER_DAY_CLOSE",
                ),
            )
        except Exception:
            logger.exception("operational_notification.cashier_day_close_failed id=%s", day_close_id)

    transaction.on_commit(_run)


def schedule_production_job_completed_notification(
    *,
    job_id: int,
    job_no: str,
    product_name: str,
    completed_qty_str: str,
) -> None:
    """Notify store admins when a manufacturing / production job completes."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            notify_all_active_admins(
                module="inventory",
                title="Production job completed",
                body=f"Production Job {job_no}: {completed_qty_str} units of {product_name} manufactured and received into stock.",
                dedupe_prefix=f"PRODUCTION_JOB_COMPLETED:{job_id}",
                payload=_payload(
                    category="PRODUCTION_JOB_COMPLETED",
                    severity="INFO",
                    production_job_id=job_id,
                    action_url="/admin/operations",
                    object_type="PRODUCTION_JOB",
                ),
            )
        except Exception:
            logger.exception("operational_notification.production_job_failed id=%s", job_id)

    transaction.on_commit(_run)


def schedule_partner_collection_request_notification(
    *,
    request_id: int,
    partner_username: str,
    customer_name: str,
    amount_str: str,
    reference_no: str | None = None,
) -> None:
    """Notify store admins when a partner submits an EMI collection for approval."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            ref_text = f" (Ref: {reference_no})" if reference_no else ""
            notify_all_active_admins(
                module="partners",
                title="Partner collection request submitted",
                body=f"Partner {partner_username} reported collection of ₹{amount_str} for {customer_name}{ref_text}. Approval required.",
                dedupe_prefix=f"PARTNER_COLLECTION_REQUEST:{request_id}",
                payload=_payload(
                    category="PARTNER_COLLECTION_REQUEST",
                    severity="INFO",
                    partner_collection_request_id=request_id,
                    action_url="/admin/partners/collection-requests",
                    object_type="PARTNER_COLLECTION_REQUEST",
                ),
            )
        except Exception:
            logger.exception("operational_notification.partner_collection_request_failed id=%s", request_id)

    transaction.on_commit(_run)


def schedule_rental_asset_posture_notification(
    *,
    asset_id: int,
    asset_code: str,
    product_name: str,
    status_label: str,
    is_damaged: bool = False,
    notes: str = "",
) -> None:
    """Notify store admins when rental asset posture changes (return, damage, repair)."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            severity = "WARNING" if is_damaged else "INFO"
            note_text = f" Notes: {notes}" if notes else ""
            notify_all_active_admins(
                module="rent",
                title="Rental asset posture updated",
                body=f"Asset {asset_code} ({product_name}) status is now {status_label}.{note_text}",
                dedupe_prefix=f"RENTAL_ASSET_STATUS:{asset_id}:{status_label}",
                payload=_payload(
                    category="RENTAL_ASSET_UPDATED",
                    severity=severity,
                    rental_asset_id=asset_id,
                    action_url="/admin/rent-lease/assets",
                    object_type="RENTAL_ASSET",
                ),
            )
        except Exception:
            logger.exception("operational_notification.rental_asset_failed id=%s", asset_id)

    transaction.on_commit(_run)


def schedule_reconciliation_completed_notification(
    *,
    run_id: int,
    total_checked: int,
    total_matched: int,
    total_exceptions: int,
    high_risk_count: int,
) -> None:
    """Notify store admins when financial reconciliation run finishes."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            has_issues = total_exceptions > 0 or high_risk_count > 0
            severity = "WARNING" if has_issues else "INFO"
            title = "Reconciliation exception alert" if has_issues else "Reconciliation completed clean"
            body = (
                f"Reconciliation Run #{run_id}: {total_matched}/{total_checked} matched. "
                f"Found {total_exceptions} exceptions ({high_risk_count} high-risk)."
                if has_issues
                else f"Reconciliation Run #{run_id}: All {total_checked} financial records matched cleanly."
            )

            notify_all_active_admins(
                module="reconciliation",
                title=title,
                body=body,
                dedupe_prefix=f"RECONCILIATION_RUN_COMPLETED:{run_id}",
                payload=_payload(
                    category="RECONCILIATION_COMPLETED",
                    severity=severity,
                    reconciliation_run_id=run_id,
                    action_url="/admin/reports/reconciliation",
                    object_type="RECONCILIATION_RUN",
                ),
            )
        except Exception:
            logger.exception("operational_notification.reconciliation_failed id=%s", run_id)

    transaction.on_commit(_run)


def schedule_stock_adjustment_notification(
    *,
    ledger_id: int,
    product_name: str,
    movement_type: str,
    quantity_str: str,
    location_name: str,
    notes: str = "",
) -> None:
    """Notify store admins of manual stock adjustments, write-offs, or damage."""

    def _run() -> None:
        try:
            from system_jobs.services.broadcast import notify_all_active_admins

            is_loss = movement_type in {"DAMAGE", "ADJUSTMENT_OUT"}
            severity = "WARNING" if is_loss else "INFO"
            note_text = f" ({notes})" if notes else ""

            notify_all_active_admins(
                module="inventory",
                title="Stock adjustment recorded",
                body=f"{product_name}: {quantity_str} units ({movement_type}) at {location_name}.{note_text}",
                dedupe_prefix=f"STOCK_ADJUSTMENT:{ledger_id}",
                payload=_payload(
                    category="STOCK_ADJUSTMENT",
                    severity=severity,
                    action_url="/admin/inventory/workspace",
                    object_type="STOCK_LEDGER",
                ),
            )
        except Exception:
            logger.exception("operational_notification.stock_adjustment_failed ledger_id=%s", ledger_id)

    transaction.on_commit(_run)
