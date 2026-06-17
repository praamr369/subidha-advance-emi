"""
P3D — Customer Timeline Service

Read-only aggregation of real operational events for a customer.
No synthetic events. No mutation of source records.
Sensitive KYC file URLs are never exposed in metadata.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from django.db.models import Min

from subscriptions.models import (
    AssetConditionSnapshot,
    AuditLog,
    ContractAmendment,
    ContractAmendmentStatus,
    Customer,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerRiskProfile,
    DrawEligibilitySnapshot,
    DocumentVerificationStatus,
    Emi,
    EmiStatus,
    KycStatus,
    LuckyDraw,
    Payment,
    ProductPossession,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
    RentLeaseReturnInspection,
    Subscription,
    SubscriptionDelivery,
    SubscriptionDocument,
    SubscriptionRequest,
    SubscriptionRequestStatus,
)

SEVERITY_INFO = "INFO"
SEVERITY_WARNING = "WARNING"
SEVERITY_HIGH = "HIGH"
SEVERITY_CRITICAL = "CRITICAL"

_UUID_NS = uuid.NAMESPACE_OID


def _event_id(source_model: str, source_id: Any, event_type: str) -> str:
    return str(uuid.uuid5(_UUID_NS, f"{source_model}:{source_id}:{event_type}"))


def _dt_str(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    if isinstance(dt, date):
        return f"{dt.isoformat()}T00:00:00"
    return str(dt)


def _make(
    *,
    event_type: str,
    event_date: Any,
    title: str,
    description: str,
    source_model: str,
    source_id: Any,
    status: str = "",
    severity: str = SEVERITY_INFO,
    action_url: str | None = None,
    metadata: dict | None = None,
) -> dict:
    return {
        "event_id": _event_id(source_model, source_id, event_type),
        "event_type": event_type,
        "event_date": _dt_str(event_date),
        "title": title,
        "description": description,
        "source_model": source_model,
        "source_id": source_id,
        "status": status,
        "severity": severity,
        "action_url": action_url,
        "metadata": metadata or {},
    }


def get_customer_timeline(
    customer: Customer,
    *,
    event_type: str | None = None,
    source_model: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int | None = None,
    ordering: str = "desc",
) -> dict:
    """
    Aggregate timeline events for *customer*.

    Returns {"customer_id": int, "count": int, "events": [...]}.
    Events are ordered newest-first by default; pass ordering="asc" for oldest-first.
    All filters are applied before ordering and limit.
    """
    events: list[dict] = []

    # ------------------------------------------------------------------
    # 1. Customer created
    # ------------------------------------------------------------------
    events.append(_make(
        event_type="CUSTOMER_CREATED",
        event_date=customer.created_at,
        title="Customer registered",
        description=f"Customer profile created for {customer.name}.",
        source_model="Customer",
        source_id=customer.pk,
        status="ACTIVE",
        severity=SEVERITY_INFO,
        metadata={"customer_code": customer.customer_code or ""},
    ))

    # ------------------------------------------------------------------
    # 2. KYC approval / rejection (customer-level review)
    # ------------------------------------------------------------------
    if customer.kyc_reviewed_at:
        if customer.kyc_status in (KycStatus.VERIFIED, KycStatus.APPROVED, KycStatus.EXCEPTION_APPROVED):
            events.append(_make(
                event_type="KYC_APPROVED",
                event_date=customer.kyc_reviewed_at,
                title="KYC approved",
                description="Customer KYC review passed.",
                source_model="Customer",
                source_id=customer.pk,
                status=customer.kyc_status,
                severity=SEVERITY_INFO,
            ))
        elif customer.kyc_status == KycStatus.REJECTED:
            events.append(_make(
                event_type="KYC_REJECTED",
                event_date=customer.kyc_reviewed_at,
                title="KYC rejected",
                description="Customer KYC review failed.",
                source_model="Customer",
                source_id=customer.pk,
                status=customer.kyc_status,
                severity=SEVERITY_WARNING,
            ))

    # ------------------------------------------------------------------
    # 3. KYC documents — upload and review events
    #    File URLs are intentionally excluded from metadata.
    # ------------------------------------------------------------------
    for doc in CustomerKycDocument.objects.filter(customer=customer).order_by("created_at", "id"):
        events.append(_make(
            event_type="DOCUMENT_UPLOADED",
            event_date=doc.created_at,
            title=f"KYC document uploaded: {doc.get_document_type_display()}",
            description=f"KYC document of type {doc.get_document_type_display()} submitted.",
            source_model="CustomerKycDocument",
            source_id=doc.pk,
            status=doc.status,
            severity=SEVERITY_INFO,
            metadata={
                "document_type": doc.document_type,
                "content_type": doc.content_type or "",
                "file_size": doc.file_size,
            },
        ))

        if doc.reviewed_at:
            if doc.status == CustomerKycDocumentStatus.APPROVED:
                events.append(_make(
                    event_type="DOCUMENT_VERIFIED",
                    event_date=doc.reviewed_at,
                    title=f"KYC document verified: {doc.get_document_type_display()}",
                    description="KYC document approved.",
                    source_model="CustomerKycDocument",
                    source_id=doc.pk,
                    status=doc.status,
                    severity=SEVERITY_INFO,
                    metadata={"document_type": doc.document_type},
                ))
            elif doc.status == CustomerKycDocumentStatus.REJECTED:
                events.append(_make(
                    event_type="DOCUMENT_REJECTED",
                    event_date=doc.reviewed_at,
                    title=f"KYC document rejected: {doc.get_document_type_display()}",
                    description="KYC document rejected.",
                    source_model="CustomerKycDocument",
                    source_id=doc.pk,
                    status=doc.status,
                    severity=SEVERITY_WARNING,
                    metadata={"document_type": doc.document_type},
                ))

    # ------------------------------------------------------------------
    # 4. Subscription requests (approval workflow)
    # ------------------------------------------------------------------
    for req in SubscriptionRequest.objects.filter(customer=customer).order_by("created_at", "id"):
        events.append(_make(
            event_type="APPROVAL_REQUESTED",
            event_date=req.created_at,
            title="Subscription request submitted",
            description=f"Request submitted for product #{req.product_id} in batch #{req.batch_id}.",
            source_model="SubscriptionRequest",
            source_id=req.pk,
            status=req.status,
            severity=SEVERITY_INFO,
            metadata={"batch_id": req.batch_id, "product_id": req.product_id},
        ))

        if req.reviewed_at:
            if req.status == SubscriptionRequestStatus.APPROVED:
                events.append(_make(
                    event_type="APPROVAL_APPROVED",
                    event_date=req.reviewed_at,
                    title="Subscription request approved",
                    description="Subscription request approved.",
                    source_model="SubscriptionRequest",
                    source_id=req.pk,
                    status=req.status,
                    severity=SEVERITY_INFO,
                ))
            elif req.status == SubscriptionRequestStatus.REJECTED:
                events.append(_make(
                    event_type="APPROVAL_REJECTED",
                    event_date=req.reviewed_at,
                    title="Subscription request rejected",
                    description="Subscription request rejected.",
                    source_model="SubscriptionRequest",
                    source_id=req.pk,
                    status=req.status,
                    severity=SEVERITY_WARNING,
                ))
            elif req.status == SubscriptionRequestStatus.CANCELLED:
                events.append(_make(
                    event_type="APPROVAL_CANCELLED",
                    event_date=req.reviewed_at,
                    title="Subscription request cancelled",
                    description="Subscription request cancelled.",
                    source_model="SubscriptionRequest",
                    source_id=req.pk,
                    status=req.status,
                    severity=SEVERITY_INFO,
                ))

    # ------------------------------------------------------------------
    # 5. Subscriptions / contracts
    # ------------------------------------------------------------------
    subscriptions = list(
        Subscription.objects.filter(customer=customer).order_by("created_at", "id")
    )
    sub_ids = [s.pk for s in subscriptions]

    for sub in subscriptions:
        events.append(_make(
            event_type="CONTRACT_CREATED",
            event_date=sub.created_at,
            title=f"Contract created ({sub.plan_type})",
            description=f"Subscription {sub.subscription_number or sub.pk} created.",
            source_model="Subscription",
            source_id=sub.pk,
            status=sub.status,
            severity=SEVERITY_INFO,
            metadata={
                "plan_type": sub.plan_type,
                "tenure_months": sub.tenure_months,
                "contract_reference": sub.contract_reference or "",
                "subscription_number": sub.subscription_number or "",
            },
        ))

        if sub.cancelled_at:
            events.append(_make(
                event_type="CONTRACT_CANCELLED",
                event_date=sub.cancelled_at,
                title="Contract cancelled",
                description=f"Subscription {sub.subscription_number or sub.pk} cancelled.",
                source_model="Subscription",
                source_id=sub.pk,
                status=sub.status,
                severity=SEVERITY_HIGH,
                metadata={"cancellation_reason": sub.cancellation_reason or ""},
            ))

    # ------------------------------------------------------------------
    # All subsequent sections query across the customer's subscription IDs.
    # Skip when customer has no subscriptions.
    # ------------------------------------------------------------------
    if sub_ids:
        # --------------------------------------------------------------
        # 6a. EMI schedule created — one aggregate event per subscription
        # --------------------------------------------------------------
        for row in (
            Emi.objects.filter(subscription_id__in=sub_ids)
            .values("subscription_id")
            .annotate(first_created=Min("created_at"))
        ):
            events.append(_make(
                event_type="EMI_SCHEDULE_CREATED",
                event_date=row["first_created"],
                title="EMI schedule created",
                description=f"EMI schedule generated for subscription #{row['subscription_id']}.",
                source_model="Subscription",
                source_id=row["subscription_id"],
                status="SCHEDULED",
                severity=SEVERITY_INFO,
                metadata={"subscription_id": row["subscription_id"]},
            ))

        # --------------------------------------------------------------
        # 6b. EMI paid — one event per payment linked to an EMI
        # --------------------------------------------------------------
        for payment in (
            Payment.objects.filter(customer=customer, emi__isnull=False)
            .select_related("emi")
            .order_by("payment_date", "id")
        ):
            events.append(_make(
                event_type="EMI_PAID",
                event_date=payment.payment_date,
                title="EMI payment received",
                description=f"EMI #{payment.emi.month_no} paid (₹{payment.amount}).",
                source_model="Payment",
                source_id=payment.pk,
                status=payment.emi.status,
                severity=SEVERITY_INFO,
                metadata={
                    "amount": str(payment.amount),
                    "method": payment.method,
                    "emi_month_no": payment.emi.month_no,
                    "subscription_id": payment.subscription_id,
                },
            ))

        # --------------------------------------------------------------
        # 6c. EMI waived — requires matching AuditLog entry for the date
        # --------------------------------------------------------------
        waived_emis = list(
            Emi.objects.filter(subscription_id__in=sub_ids, status=EmiStatus.WAIVED)
            .values("pk", "month_no", "amount", "subscription_id")
        )
        if waived_emis:
            waived_pks = [e["pk"] for e in waived_emis]
            waiver_dates = {
                log["object_id"]: log["created_at"]
                for log in AuditLog.objects.filter(
                    action_type=AuditLog.ActionType.EMI_WAIVED,
                    model_name="Emi",
                    object_id__in=waived_pks,
                ).values("object_id", "created_at")
            }
            for emi_data in waived_emis:
                waiver_date = waiver_dates.get(emi_data["pk"])
                if waiver_date is None:
                    continue  # no traceable date — omit per policy
                events.append(_make(
                    event_type="EMI_WAIVED",
                    event_date=waiver_date,
                    title="EMI waived",
                    description=f"EMI #{emi_data['month_no']} waived (₹{emi_data['amount']}).",
                    source_model="Emi",
                    source_id=emi_data["pk"],
                    status=EmiStatus.WAIVED,
                    severity=SEVERITY_INFO,
                    metadata={
                        "amount": str(emi_data["amount"]),
                        "month_no": emi_data["month_no"],
                        "subscription_id": emi_data["subscription_id"],
                    },
                ))

        # --------------------------------------------------------------
        # 7. Subscription documents (contract/support docs)
        #    File path/URL intentionally excluded.
        # --------------------------------------------------------------
        for doc in SubscriptionDocument.objects.filter(subscription_id__in=sub_ids).order_by("created_at", "id"):
            events.append(_make(
                event_type="SUBSCRIPTION_DOCUMENT_UPLOADED",
                event_date=doc.created_at,
                title=f"Document uploaded: {doc.get_document_type_display()}",
                description=f"Subscription document of type {doc.get_document_type_display()} added.",
                source_model="SubscriptionDocument",
                source_id=doc.pk,
                status=doc.verification_status,
                severity=SEVERITY_INFO,
                metadata={
                    "document_type": doc.document_type,
                    "subscription_id": doc.subscription_id,
                },
            ))

            if doc.verified_at:
                if doc.verification_status == DocumentVerificationStatus.VERIFIED:
                    events.append(_make(
                        event_type="SUBSCRIPTION_DOCUMENT_VERIFIED",
                        event_date=doc.verified_at,
                        title=f"Document verified: {doc.get_document_type_display()}",
                        description="Subscription document verified.",
                        source_model="SubscriptionDocument",
                        source_id=doc.pk,
                        status=doc.verification_status,
                        severity=SEVERITY_INFO,
                        metadata={
                            "document_type": doc.document_type,
                            "subscription_id": doc.subscription_id,
                        },
                    ))
                elif doc.verification_status == DocumentVerificationStatus.REJECTED:
                    events.append(_make(
                        event_type="SUBSCRIPTION_DOCUMENT_REJECTED",
                        event_date=doc.verified_at,
                        title=f"Document rejected: {doc.get_document_type_display()}",
                        description="Subscription document rejected.",
                        source_model="SubscriptionDocument",
                        source_id=doc.pk,
                        status=doc.verification_status,
                        severity=SEVERITY_WARNING,
                        metadata={
                            "document_type": doc.document_type,
                            "subscription_id": doc.subscription_id,
                        },
                    ))

        # --------------------------------------------------------------
        # 8. Deliveries
        # --------------------------------------------------------------
        for delivery in SubscriptionDelivery.objects.filter(subscription_id__in=sub_ids).order_by("created_at", "id"):
            def _dlv_meta(d: SubscriptionDelivery) -> dict:
                return {
                    "delivery_reference": d.delivery_reference,
                    "subscription_id": d.subscription_id,
                }

            events.append(_make(
                event_type="DELIVERY_CREATED",
                event_date=delivery.created_at,
                title="Delivery created",
                description=f"Delivery {delivery.delivery_reference} created.",
                source_model="SubscriptionDelivery",
                source_id=delivery.pk,
                status=delivery.status,
                severity=SEVERITY_INFO,
                metadata=_dlv_meta(delivery),
            ))

            if delivery.dispatched_at:
                events.append(_make(
                    event_type="DELIVERY_DISPATCHED",
                    event_date=delivery.dispatched_at,
                    title="Delivery dispatched",
                    description=f"Delivery {delivery.delivery_reference} dispatched.",
                    source_model="SubscriptionDelivery",
                    source_id=delivery.pk,
                    status=delivery.status,
                    severity=SEVERITY_INFO,
                    metadata=_dlv_meta(delivery),
                ))

            if delivery.delivered_at:
                events.append(_make(
                    event_type="DELIVERY_COMPLETED",
                    event_date=delivery.delivered_at,
                    title="Delivery completed",
                    description=f"Product delivered to {delivery.receiver_name or 'customer'}.",
                    source_model="SubscriptionDelivery",
                    source_id=delivery.pk,
                    status=delivery.status,
                    severity=SEVERITY_INFO,
                    metadata=_dlv_meta(delivery),
                ))

            if delivery.return_requested_at:
                events.append(_make(
                    event_type="DELIVERY_RETURN_REQUESTED",
                    event_date=delivery.return_requested_at,
                    title="Return requested",
                    description=f"Return requested for delivery {delivery.delivery_reference}.",
                    source_model="SubscriptionDelivery",
                    source_id=delivery.pk,
                    status=delivery.status,
                    severity=SEVERITY_WARNING,
                    metadata=_dlv_meta(delivery),
                ))

            if delivery.returned_at:
                events.append(_make(
                    event_type="DELIVERY_RETURNED",
                    event_date=delivery.returned_at,
                    title="Product returned",
                    description=f"Product returned for delivery {delivery.delivery_reference}.",
                    source_model="SubscriptionDelivery",
                    source_id=delivery.pk,
                    status=delivery.status,
                    severity=SEVERITY_WARNING,
                    metadata=_dlv_meta(delivery),
                ))

        # --------------------------------------------------------------
        # 9. Rent/lease billing demands
        # --------------------------------------------------------------
        for demand in RentLeaseBillingDemand.objects.filter(subscription_id__in=sub_ids).order_by("created_at", "id"):
            if demand.demand_type == RentLeaseDemandType.SECURITY_DEPOSIT:
                ev, ttl, desc = (
                    "DEPOSIT_DEMAND_CREATED",
                    "Security deposit demand raised",
                    f"Security deposit of ₹{demand.amount} demanded.",
                )
            else:
                ev, ttl, desc = (
                    "RENT_DEMAND_CREATED",
                    "Rent/lease demand created",
                    f"{demand.demand_type} demand of ₹{demand.amount} raised.",
                )

            events.append(_make(
                event_type=ev,
                event_date=demand.created_at,
                title=ttl,
                description=desc,
                source_model="RentLeaseBillingDemand",
                source_id=demand.pk,
                status=demand.status,
                severity=SEVERITY_INFO,
                metadata={
                    "demand_type": demand.demand_type,
                    "amount": str(demand.amount),
                    "due_date": str(demand.due_date),
                    "subscription_id": demand.subscription_id,
                },
            ))

        # --------------------------------------------------------------
        # 10. Contract amendments
        # --------------------------------------------------------------
        for amendment in ContractAmendment.objects.filter(subscription_id__in=sub_ids).order_by("created_at", "id"):
            events.append(_make(
                event_type="AMENDMENT_REQUESTED",
                event_date=amendment.created_at,
                title=f"Contract amendment requested: {amendment.amendment_type}",
                description=f"Amendment {amendment.amendment_type} requested.",
                source_model="ContractAmendment",
                source_id=amendment.pk,
                status=amendment.status,
                severity=SEVERITY_INFO,
                metadata={
                    "amendment_type": amendment.amendment_type,
                    "subscription_id": amendment.subscription_id,
                },
            ))

            if amendment.approved_at and amendment.status in (
                ContractAmendmentStatus.APPROVED,
                ContractAmendmentStatus.APPLIED,
            ):
                events.append(_make(
                    event_type="AMENDMENT_APPROVED",
                    event_date=amendment.approved_at,
                    title=f"Contract amendment approved: {amendment.amendment_type}",
                    description=f"Amendment {amendment.amendment_type} approved.",
                    source_model="ContractAmendment",
                    source_id=amendment.pk,
                    status=amendment.status,
                    severity=SEVERITY_INFO,
                    metadata={
                        "amendment_type": amendment.amendment_type,
                        "subscription_id": amendment.subscription_id,
                    },
                ))

            if amendment.applied_at and amendment.status == ContractAmendmentStatus.APPLIED:
                events.append(_make(
                    event_type="AMENDMENT_APPLIED",
                    event_date=amendment.applied_at,
                    title=f"Contract amendment applied: {amendment.amendment_type}",
                    description=f"Amendment {amendment.amendment_type} applied.",
                    source_model="ContractAmendment",
                    source_id=amendment.pk,
                    status=amendment.status,
                    severity=SEVERITY_INFO,
                    metadata={
                        "amendment_type": amendment.amendment_type,
                        "subscription_id": amendment.subscription_id,
                    },
                ))

        # --------------------------------------------------------------
        # 11. Return inspections
        # --------------------------------------------------------------
        for inspection in RentLeaseReturnInspection.objects.filter(subscription_id__in=sub_ids).order_by("created_at", "id"):
            events.append(_make(
                event_type="RETURN_INSPECTION_CREATED",
                event_date=inspection.created_at,
                title="Return inspection created",
                description=f"Return inspection initiated for subscription #{inspection.subscription_id}.",
                source_model="RentLeaseReturnInspection",
                source_id=inspection.pk,
                status=inspection.status,
                severity=SEVERITY_INFO,
                metadata={
                    "subscription_id": inspection.subscription_id,
                    "condition": inspection.condition_recorded,
                    "outcome": inspection.outcome or "",
                },
            ))

            if inspection.approved_at:
                events.append(_make(
                    event_type="RETURN_INSPECTION_APPROVED",
                    event_date=inspection.approved_at,
                    title="Return inspection approved",
                    description=f"Return inspection approved. Outcome: {inspection.outcome or 'N/A'}.",
                    source_model="RentLeaseReturnInspection",
                    source_id=inspection.pk,
                    status=inspection.status,
                    severity=SEVERITY_INFO,
                    metadata={
                        "subscription_id": inspection.subscription_id,
                        "outcome": inspection.outcome or "",
                        "damage_deduction_amount": str(inspection.damage_deduction_amount),
                        "deposit_refund_amount": str(inspection.deposit_refund_amount),
                    },
                ))

        # --------------------------------------------------------------
        # 12. Asset condition snapshots (rental lifecycle via subscription)
        # --------------------------------------------------------------
        _stage_map = {
            "BEFORE_HANDOVER": ("ASSET_CONDITION_BEFORE_HANDOVER", "Asset condition recorded before handover", SEVERITY_INFO),
            "AFTER_RETURN": ("ASSET_CONDITION_AFTER_RETURN", "Asset condition recorded after return", SEVERITY_INFO),
            "DAMAGE_REVIEW": ("ASSET_DAMAGE_REVIEW", "Asset damage review recorded", SEVERITY_HIGH),
            "MAINTENANCE_REVIEW": ("ASSET_MAINTENANCE_REVIEW", "Asset maintenance review recorded", SEVERITY_INFO),
        }
        for snap in AssetConditionSnapshot.objects.filter(subscription_id__in=sub_ids).order_by("assessed_at", "id"):
            mapping = _stage_map.get(snap.stage)
            if mapping is None:
                continue
            ev, ttl, severity_ = mapping
            events.append(_make(
                event_type=ev,
                event_date=snap.assessed_at,
                title=ttl,
                description=f"Asset condition: {snap.condition_grade} (score: {snap.condition_score}).",
                source_model="AssetConditionSnapshot",
                source_id=snap.pk,
                status=snap.condition_grade,
                severity=severity_,
                metadata={
                    "asset_id": snap.asset_id,
                    "stage": snap.stage,
                    "condition_grade": snap.condition_grade,
                    "condition_score": snap.condition_score,
                    "subscription_id": snap.subscription_id,
                },
            ))

        # --------------------------------------------------------------
        # 13. Lucky draw winner
        # --------------------------------------------------------------
        for draw in LuckyDraw.objects.filter(
            winner_subscription_id__in=sub_ids,
            is_revealed=True,
        ).order_by("revealed_at", "id"):
            events.append(_make(
                event_type="DRAW_WIN",
                event_date=draw.revealed_at,
                title="Lucky draw winner!",
                description=f"Won draw month {draw.draw_month}.",
                source_model="LuckyDraw",
                source_id=draw.pk,
                status="WINNER",
                severity=SEVERITY_INFO,
                metadata={
                    "draw_month": draw.draw_month,
                    "waived_amount": str(draw.waived_amount),
                    "waived_emi_count": draw.waived_emi_count,
                    "subscription_id": draw.winner_subscription_id,
                },
            ))

    # ------------------------------------------------------------------
    # 14. Rent/lease deposit transactions (direct customer FK)
    # ------------------------------------------------------------------
    _deposit_type_map = {
        RentLeaseDepositTransactionType.COLLECTED: ("DEPOSIT_COLLECTED", "Deposit collected", SEVERITY_INFO),
        RentLeaseDepositTransactionType.REFUND_APPROVED: ("DEPOSIT_REFUND_APPROVED", "Deposit refund approved", SEVERITY_INFO),
        RentLeaseDepositTransactionType.REFUNDED: ("DEPOSIT_REFUNDED", "Deposit refunded", SEVERITY_INFO),
        RentLeaseDepositTransactionType.DEDUCTION: ("DAMAGE_DEDUCTION", "Damage deduction applied", SEVERITY_HIGH),
    }
    for txn in RentLeaseDepositTransaction.objects.filter(
        customer=customer,
        status=RentLeaseDepositTransactionStatus.ACTIVE,
        transaction_type__in=list(_deposit_type_map.keys()),
    ).order_by("created_at", "id"):
        ev, ttl, severity_ = _deposit_type_map[txn.transaction_type]
        txn_date = txn.transaction_date if txn.transaction_date else txn.created_at
        events.append(_make(
            event_type=ev,
            event_date=txn_date,
            title=ttl,
            description=f"₹{txn.amount} — {txn.reason or txn.transaction_type}.",
            source_model="RentLeaseDepositTransaction",
            source_id=txn.pk,
            status=txn.status,
            severity=severity_,
            metadata={
                "transaction_number": txn.transaction_number,
                "transaction_type": txn.transaction_type,
                "amount": str(txn.amount),
                "subscription_id": txn.subscription_id,
            },
        ))

    # ------------------------------------------------------------------
    # 15. Lucky draw participation (DrawEligibilitySnapshot — customer FK)
    # ------------------------------------------------------------------
    for snap in (
        DrawEligibilitySnapshot.objects.filter(customer=customer)
        .select_related("batch")
        .order_by("created_at", "id")
    ):
        events.append(_make(
            event_type="DRAW_PARTICIPATED",
            event_date=snap.created_at,
            title="Lucky draw eligibility confirmed",
            description=f"Eligible for draw in batch {snap.batch.batch_code}.",
            source_model="DrawEligibilitySnapshot",
            source_id=snap.pk,
            status="ELIGIBLE",
            severity=SEVERITY_INFO,
            metadata={
                "batch_id": snap.batch_id,
                "batch_code": snap.batch.batch_code,
                "subscription_id": snap.subscription_id,
            },
        ))

    # ------------------------------------------------------------------
    # 16. Product possession (direct customer FK)
    # ------------------------------------------------------------------
    for possession in ProductPossession.objects.filter(customer=customer).order_by("created_at", "id"):
        if possession.handover_date:
            events.append(_make(
                event_type="PRODUCT_HANDOVER",
                event_date=possession.handover_date,
                title="Product handed over to customer",
                description=f"Product #{possession.product_id} handed over.",
                source_model="ProductPossession",
                source_id=possession.pk,
                status=possession.status,
                severity=SEVERITY_INFO,
                metadata={
                    "product_id": possession.product_id,
                    "subscription_id": possession.subscription_id,
                    "serial_number": possession.serial_number or "",
                },
            ))

        if possession.actual_return_date:
            events.append(_make(
                event_type="PRODUCT_RETURNED",
                event_date=possession.actual_return_date,
                title="Product returned by customer",
                description=f"Product #{possession.product_id} returned.",
                source_model="ProductPossession",
                source_id=possession.pk,
                status=possession.status,
                severity=SEVERITY_INFO,
                metadata={
                    "product_id": possession.product_id,
                    "subscription_id": possession.subscription_id,
                },
            ))

    # ------------------------------------------------------------------
    # 17. Risk profile recalculation (OneToOne via customer)
    # ------------------------------------------------------------------
    risk_profile = CustomerRiskProfile.objects.filter(customer=customer).first()
    if risk_profile and risk_profile.last_calculated_at:
        _band_severity = {
            "MEDIUM": SEVERITY_WARNING,
            "HIGH": SEVERITY_HIGH,
            "BLOCKED": SEVERITY_CRITICAL,
        }
        sev = _band_severity.get(risk_profile.risk_band, SEVERITY_INFO)
        events.append(_make(
            event_type="RISK_RECALCULATED",
            event_date=risk_profile.last_calculated_at,
            title=f"Risk profile updated: {risk_profile.risk_band}",
            description=f"Risk score {risk_profile.risk_score}, band {risk_profile.risk_band}.",
            source_model="CustomerRiskProfile",
            source_id=risk_profile.pk,
            status=risk_profile.risk_band,
            severity=sev,
            metadata={
                "risk_score": risk_profile.risk_score,
                "risk_band": risk_profile.risk_band,
                "reason_codes": risk_profile.reason_codes or [],
            },
        ))

    # ------------------------------------------------------------------
    # Post-processing: drop events without a traceable date
    # ------------------------------------------------------------------
    events = [e for e in events if e["event_date"] is not None]

    # Filters
    if event_type:
        events = [e for e in events if e["event_type"] == event_type]
    if source_model:
        events = [e for e in events if e["source_model"] == source_model]
    if date_from:
        cutoff = date_from.isoformat()
        events = [e for e in events if e["event_date"][:10] >= cutoff]
    if date_to:
        cutoff = date_to.isoformat()
        events = [e for e in events if e["event_date"][:10] <= cutoff]

    # Sort: stable tie-breaker is (source_model, source_id)
    reverse = ordering != "asc"
    events.sort(
        key=lambda e: (e["event_date"], e["source_model"], str(e["source_id"])),
        reverse=reverse,
    )

    if limit is not None and limit > 0:
        events = events[:limit]

    return {
        "customer_id": customer.pk,
        "count": len(events),
        "events": events,
    }
