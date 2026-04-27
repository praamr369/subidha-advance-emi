from __future__ import annotations

from datetime import date

from django.db.models import Min, Q
from django.utils import timezone

from subscriptions.models import (
    Emi,
    EmiStatus,
    CustomerSupportRequest,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    DeliveryStatus,
    SubscriptionDelivery,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
    PaymentReconciliation,
    ReconciliationStatus,
    RentLeaseReturnInspection,
    SupportRequestStatus,
    Subscription,
    SubscriptionRequest,
    SubscriptionRequestStatus,
)


def _queue_payload(*, key: str, count: int, oldest_date: date | None, detail_url: str, badge_source: str) -> dict:
    severity = "INFO"
    if count > 0:
        severity = "HIGH"
    return {
        "key": key,
        "count": count,
        "severity": severity,
        "oldest_pending_date": oldest_date.isoformat() if oldest_date else None,
        "detail_url": detail_url,
        "badge_source": badge_source,
        "empty_state": "No pending records." if count == 0 else None,
    }


def build_admin_queue_summary() -> dict:
    today = timezone.localdate()
    partner_payment_qs = PartnerCollectionRequest.objects.filter(status=PartnerCollectionRequestStatus.SUBMITTED)
    subscription_requests_qs = SubscriptionRequest.objects.filter(status=SubscriptionRequestStatus.SUBMITTED)
    kyc_qs = CustomerKycDocument.objects.filter(status__in=[CustomerKycDocumentStatus.SUBMITTED, CustomerKycDocumentStatus.PENDING])
    return_inspection_qs = RentLeaseReturnInspection.objects.filter(status__in=["PENDING", "IN_PROGRESS"])
    reconciliation_qs = PaymentReconciliation.objects.filter(Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True))
    contract_approval_qs = Subscription.objects.filter(status="PENDING_APPROVAL")
    contract_activation_qs = Subscription.objects.filter(status="APPROVED")
    overdue_payment_qs = Emi.objects.filter(status=EmiStatus.PENDING, due_date__lt=today)
    support_qs = CustomerSupportRequest.objects.filter(status__in=[SupportRequestStatus.SUBMITTED, SupportRequestStatus.UNDER_REVIEW])
    blocked_delivery_qs = SubscriptionDelivery.objects.filter(status=DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE)

    queues = [
        _queue_payload(
            key="partner_payment_requests_pending",
            count=partner_payment_qs.count(),
            oldest_date=partner_payment_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/partner-payment-requests",
            badge_source="queue.partner_payment_requests_pending",
        ),
        _queue_payload(
            key="partner_collection_requests_pending",
            count=partner_payment_qs.count(),
            oldest_date=partner_payment_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/partner-payment-requests",
            badge_source="queue.partner_collection_requests_pending",
        ),
        _queue_payload(
            key="subscription_requests_pending",
            count=subscription_requests_qs.count(),
            oldest_date=subscription_requests_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/subscription-requests",
            badge_source="queue.subscription_requests_pending",
        ),
        _queue_payload(
            key="customer_kyc_pending",
            count=kyc_qs.count(),
            oldest_date=kyc_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/customers",
            badge_source="queue.customer_kyc_pending",
        ),
        _queue_payload(
            key="contract_approvals_pending",
            count=contract_approval_qs.count(),
            oldest_date=contract_approval_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/subscriptions",
            badge_source="queue.contract_approvals_pending",
        ),
        _queue_payload(
            key="contract_activation_pending",
            count=contract_activation_qs.count(),
            oldest_date=contract_activation_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/subscriptions",
            badge_source="queue.contract_activation_pending",
        ),
        _queue_payload(
            key="return_inspections_pending",
            count=return_inspection_qs.count(),
            oldest_date=return_inspection_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/operations/command-center",
            badge_source="queue.return_inspections_pending",
        ),
        _queue_payload(
            key="deposit_refunds_pending",
            count=RentLeaseReturnInspection.objects.filter(deposit_refund_approved=False, deposit_refund_amount__gt=0).count(),
            oldest_date=RentLeaseReturnInspection.objects.filter(deposit_refund_approved=False, deposit_refund_amount__gt=0).aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/finance/deposits",
            badge_source="queue.deposit_refunds_pending",
        ),
        _queue_payload(
            key="reconciliation_pending",
            count=reconciliation_qs.count(),
            oldest_date=reconciliation_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/accounting/reconciliation",
            badge_source="queue.reconciliation_pending",
        ),
        _queue_payload(
            key="overdue_payments",
            count=overdue_payment_qs.count(),
            oldest_date=overdue_payment_qs.aggregate(oldest=Min("due_date"))["oldest"],
            detail_url="/admin/emis/overdue",
            badge_source="queue.overdue_payments",
        ),
        _queue_payload(
            key="delivery_blocked",
            count=blocked_delivery_qs.count(),
            oldest_date=blocked_delivery_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/deliveries",
            badge_source="queue.delivery_blocked",
        ),
        _queue_payload(
            key="support_requests_pending",
            count=support_qs.count(),
            oldest_date=support_qs.aggregate(oldest=Min("created_at"))["oldest"],
            detail_url="/admin/support-requests",
            badge_source="queue.support_requests_pending",
        ),
    ]
    return {
        "as_of": today.isoformat(),
        "count": len(queues),
        "results": queues,
    }


def list_partner_payment_requests() -> dict:
    rows = (
        PartnerCollectionRequest.objects.select_related("partner", "customer", "subscription")
        .filter(status=PartnerCollectionRequestStatus.SUBMITTED)
        .order_by("created_at", "id")
    )
    return {
        "count": rows.count(),
        "results": [
            {
                "id": row.id,
                "partner_id": row.partner_id,
                "partner_name": row.partner.get_full_name() or row.partner.username,
                "customer_name": row.customer.name,
                "subscription_number": row.subscription.subscription_number,
                "amount": str(row.amount),
                "payment_method": row.payment_method,
                "payment_date": row.payment_date.isoformat(),
                "reference_no": row.reference_no,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows[:200]
        ],
    }
