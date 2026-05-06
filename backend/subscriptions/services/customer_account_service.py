from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from billing.models import BillingInvoice, DirectSale, ReceiptDocument
from subscriptions.models import Customer, PublicLead, PublicLeadStatus
from subscriptions.models import (
    ContractReference,
    DeliveryStatus,
    EmiStatus,
    FinancialLedger,
    Payment,
    PlanType,
    SubscriptionDelivery,
    SupportRequestStatus,
    SubscriptionDocument,
)
from subscriptions.services.contract_reference_service import build_receivable_result
from subscriptions.services.subscription_financial_service import (
    build_customer_dashboard_summary,
    get_subscription_detail_queryset,
)
from subscriptions.services.winner_state_service import get_subscription_winner_evidence


def _money(value) -> str:
    return f"{Decimal(str(value or '0.00')).quantize(Decimal('0.01')):.2f}"


def sync_customer_login_identity(
    customer: Customer,
    *,
    name: str,
    phone: str,
    email: str,
    address: str,
    city: str,
) -> Customer:
    normalized_name = (name or "").strip()
    normalized_phone = (phone or "").strip()
    normalized_email = (email or "").strip()
    normalized_address = (address or "").strip()
    normalized_city = (city or "").strip()

    customer.name = normalized_name
    customer.phone = normalized_phone
    customer.address = normalized_address
    customer.city = normalized_city
    customer.save()

    user = customer.user
    user.phone = normalized_phone
    user.email = normalized_email
    user.first_name = normalized_name
    user.save()
    return customer


def build_customer_profile_summary(customer: Customer) -> dict[str, object]:
    subscriptions = list(
        get_subscription_detail_queryset()
        .filter(customer=customer)
        .order_by("-created_at", "-id")
    )
    summary = build_customer_dashboard_summary(subscriptions)

    lucky_plan_draw = []
    for sub in subscriptions:
        if sub.plan_type != PlanType.EMI or not sub.batch_id:
            continue
        evidence = get_subscription_winner_evidence(sub)
        winning_draw = evidence.get("winning_draw")
        if not winning_draw or not getattr(winning_draw, "is_revealed", False):
            continue
        dc = getattr(winning_draw, "draw_commit", None)
        public_hash = (
            dc.public_commit_hash if dc else winning_draw.committed_hash
        )
        lucky_plan_draw.append(
            {
                "subscription_id": sub.id,
                "batch_code": sub.batch.batch_code if sub.batch_id else None,
                "winner_lucky_number": getattr(sub.lucky_id, "lucky_number", None),
                "draw_month": winning_draw.draw_month,
                "draw_date": winning_draw.draw_date,
                "revealed_at": winning_draw.revealed_at,
                "public_commit_hash": public_hash,
                "verification_status": "coordinated" if dc else "legacy",
                "waived_emi_count": sub.emis.filter(status=EmiStatus.WAIVED).count(),
                "waived_amount": _money(sub.waived_amount),
            }
        )

    return {
        "total_subscriptions": summary["subscription_count"],
        "active_subscriptions": summary["active_subscriptions"],
        "won_subscriptions": summary["winner_subscriptions"],
        "completed_subscriptions": summary["completed_subscriptions"],
        "pending_emis": summary["pending_emis"],
        "paid_emis": summary["paid_emis"],
        "waived_emis": summary["waived_emis"],
        "total_paid_amount": summary["total_paid_amount"],
        "lucky_plan_draw": lucky_plan_draw,
    }


def build_customer_operational_profile(customer: Customer) -> dict[str, object]:
    subscriptions = list(
        get_subscription_detail_queryset()
        .filter(customer=customer)
        .order_by("-created_at", "-id")
    )
    subscription_summary = build_customer_dashboard_summary(subscriptions)

    direct_sales_qs = (
        DirectSale.objects.select_related("branch", "cash_counter", "finance_account")
        .filter(customer=customer)
        .order_by("-sale_date", "-id")
    )
    direct_sales_totals = direct_sales_qs.aggregate(
        total_count=Count("id"),
        invoiced_count=Count("id", filter=Q(status="INVOICED")),
        outstanding_count=Count("id", filter=Q(balance_total__gt=Decimal("0.00"))),
        gross_total=Sum("grand_total"),
        received_total=Sum("received_total"),
        outstanding_total=Sum("balance_total"),
    )

    payment_qs = (
        Payment.objects.select_related("subscription", "subscription__partner")
        .filter(customer=customer)
        .order_by("-payment_date", "-id")
    )
    active_payment_qs = payment_qs.exclude(
        allocation_metadata__reversal__is_reversed=True
    )
    payment_totals = payment_qs.aggregate(
        total_count=Count("id"),
        reversed_count=Count(
            "id",
            filter=Q(allocation_metadata__reversal__is_reversed=True),
        ),
        total_amount=Sum("amount"),
    )

    receipt_qs = (
        ReceiptDocument.objects.select_related("finance_account", "billing_invoice")
        .filter(customer=customer)
        .order_by("-receipt_date", "-id")
    )
    receipt_totals = receipt_qs.aggregate(
        total_count=Count("id"),
        total_amount=Sum("amount"),
    )
    invoice_qs = (
        BillingInvoice.objects.select_related("branch", "direct_sale")
        .filter(customer=customer)
        .order_by("-invoice_date", "-id")
    )
    invoice_totals = invoice_qs.aggregate(
        total_count=Count("id"),
        posted_count=Count("id", filter=Q(status="POSTED")),
        grand_total=Sum("grand_total"),
        outstanding_total=Sum("balance_total"),
    )

    lead_filters = Q(converted_customer=customer)
    if customer.phone:
        lead_filters = lead_filters | Q(phone=customer.phone)
    customer_email = (getattr(customer.user, "email", "") or "").strip()
    if customer_email:
        lead_filters = lead_filters | Q(email__iexact=customer_email)

    lead_qs = (
        PublicLead.objects.select_related(
            "product",
            "assigned_to",
            "converted_subscription",
            "converted_direct_sale",
            "converted_by",
        )
        .filter(lead_filters)
        .distinct()
        .order_by("-created_at", "-id")
    )
    lead_totals = lead_qs.aggregate(
        total_count=Count("id"),
        open_count=Count(
            "id",
            filter=Q(
                status__in=[
                    PublicLeadStatus.NEW,
                    PublicLeadStatus.IN_PROGRESS,
                    PublicLeadStatus.CONTACTED,
                ]
            ),
        ),
        converted_count=Count("id", filter=Q(status=PublicLeadStatus.CONVERTED)),
        quotation_count=Count("id", filter=Q(intent="QUOTATION")),
        estimate_count=Count("id", filter=Q(intent="ESTIMATE")),
        follow_up_required_count=Count("id", filter=Q(follow_up_required=True)),
        follow_up_due_count=Count(
            "id",
            filter=Q(
                follow_up_required=True,
                follow_up_on__isnull=False,
                follow_up_on__lte=timezone.localdate(),
            )
            & ~Q(status__in=[PublicLeadStatus.CONVERTED, PublicLeadStatus.CLOSED]),
        ),
    )

    document_qs = (
        SubscriptionDocument.objects.select_related("subscription")
        .filter(subscription__customer=customer)
        .order_by("-created_at", "-id")
    )
    ledger_qs = FinancialLedger.objects.filter(emi__subscription__customer=customer)
    ledger_summary = ledger_qs.aggregate(
        entry_count=Count("id"),
        total_credits=Sum("amount", filter=Q(entry_direction="CREDIT")),
        total_debits=Sum("amount", filter=Q(entry_direction="DEBIT")),
    )

    partner_rows = {}
    for subscription in subscriptions:
        partner = getattr(subscription, "partner", None)
        if partner is None:
            continue
        existing = partner_rows.get(partner.id)
        if existing is None:
            partner_rows[partner.id] = {
                "partner_id": partner.id,
                "partner_name": getattr(partner, "name", "") or f"Partner {partner.id}",
                "subscription_count": 1,
            }
            continue
        existing["subscription_count"] += 1

    recent_direct_sales = [
        {
            "id": sale.id,
            "sale_no": sale.sale_no,
            "sale_date": sale.sale_date,
            "status": sale.status,
            "branch_id": sale.branch_id,
            "branch_code": getattr(sale.branch, "code", None),
            "branch_name": getattr(sale.branch, "name", None),
            "cash_counter_id": sale.cash_counter_id,
            "cash_counter_code": getattr(sale.cash_counter, "code", None),
            "cash_counter_name": getattr(sale.cash_counter, "name", None),
            "finance_account_id": sale.finance_account_id,
            "finance_account_name": getattr(sale.finance_account, "name", None),
            "grand_total": _money(sale.grand_total),
            "received_total": _money(sale.received_total),
            "balance_total": _money(sale.balance_total),
            "billing_invoice_id": sale.billing_invoices.order_by("-id").values_list("id", flat=True).first(),
            "billing_invoice_no": sale.billing_invoices.order_by("-id").values_list("document_no", flat=True).first(),
            "billing_invoice_status": sale.billing_invoices.order_by("-id").values_list("status", flat=True).first(),
            "delivery_required": sale.delivery_required,
        }
        for sale in direct_sales_qs[:10]
    ]

    recent_subscriptions = [
        {
            "id": subscription.id,
            "subscription_number": f"SUB-{subscription.id}",
            "status": subscription.status,
            "plan_type": subscription.plan_type,
            "product_name": getattr(subscription.product, "name", "") if getattr(subscription, "product", None) else "",
            "batch_code": getattr(subscription.batch, "batch_code", None),
            "lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
            "total_amount": _money(subscription.total_amount),
            "monthly_amount": _money(subscription.monthly_amount),
            "next_due_date": next(
                (emi.due_date for emi in subscription.emis.all() if getattr(emi, "status", "") == "PENDING"),
                None,
            ),
            "next_due_amount": _money(
                next(
                    (emi.amount for emi in subscription.emis.all() if getattr(emi, "status", "") == "PENDING"),
                    Decimal("0.00"),
                )
            ),
            "partner_id": getattr(subscription.partner, "id", None),
            "partner_name": getattr(subscription.partner, "name", None),
        }
        for subscription in subscriptions[:10]
    ]

    recent_payments = [
        {
            "id": payment.id,
            "subscription_id": payment.subscription_id,
            "subscription_number": f"SUB-{payment.subscription_id}",
            "amount": _money(payment.amount),
            "method": payment.method,
            "reference_no": payment.reference_no,
            "payment_date": payment.payment_date,
            "is_reversed": bool(
                (getattr(payment, "allocation_metadata", {}) or {})
                .get("reversal", {})
                .get("is_reversed")
            ),
            "partner_name": getattr(getattr(payment.subscription, "partner", None), "name", None),
        }
        for payment in payment_qs[:15]
    ]

    recent_receipts = [
        {
            "id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "receipt_type": receipt.receipt_type,
            "status": receipt.status,
            "receipt_date": receipt.receipt_date,
            "amount": _money(receipt.amount),
            "direct_sale_id": receipt.direct_sale_id,
            "billing_invoice_id": receipt.billing_invoice_id,
            "payment_id": receipt.payment_id,
            "finance_account_name": getattr(receipt.finance_account, "name", None),
            "source_reference": receipt.source_reference,
        }
        for receipt in receipt_qs[:10]
    ]
    recent_invoices = [
        {
            "id": invoice.id,
            "document_no": invoice.document_no,
            "invoice_date": invoice.invoice_date,
            "status": invoice.status,
            "billing_channel": invoice.billing_channel,
            "branch_id": invoice.branch_id,
            "branch_code": getattr(invoice.branch, "code", None),
            "branch_name": getattr(invoice.branch, "name", None),
            "direct_sale_id": invoice.direct_sale_id,
            "direct_sale_no": getattr(invoice.direct_sale, "sale_no", None),
            "subscription_id": invoice.subscription_id,
            "grand_total": _money(invoice.grand_total),
            "received_total": _money(invoice.received_total),
            "balance_total": _money(invoice.balance_total),
        }
        for invoice in invoice_qs[:10]
    ]

    recent_documents = [
        {
            "id": document.id,
            "subscription_id": document.subscription_id,
            "subscription_number": f"SUB-{document.subscription_id}",
            "document_type": document.document_type,
            "verification_status": document.verification_status,
            "created_at": document.created_at,
        }
        for document in document_qs[:10]
    ]
    recent_leads = [
        {
            "id": lead.id,
            "name": lead.name,
            "phone": lead.phone,
            "email": lead.email,
            "city": lead.city,
            "status": lead.status,
            "intent": lead.intent,
            "source": lead.source,
            "interested_product": lead.interested_product,
            "preferred_emi_amount": (
                _money(lead.preferred_emi_amount)
                if lead.preferred_emi_amount is not None
                else None
            ),
            "follow_up_required": lead.follow_up_required,
            "follow_up_on": lead.follow_up_on,
            "follow_up_note": lead.follow_up_note,
            "notes": lead.notes,
            "admin_notes": lead.admin_notes,
            "assigned_to_id": lead.assigned_to_id,
            "assigned_to_username": getattr(lead.assigned_to, "username", None),
            "converted_customer_id": lead.converted_customer_id,
            "converted_subscription_id": lead.converted_subscription_id,
            "converted_direct_sale_id": lead.converted_direct_sale_id,
            "converted_direct_sale_no": getattr(lead.converted_direct_sale, "sale_no", None),
            "created_at": lead.created_at,
            "converted_at": lead.converted_at,
        }
        for lead in lead_qs[:15]
    ]
    quotation_estimate_rows = [
        row for row in recent_leads if row["intent"] in {"QUOTATION", "ESTIMATE"}
    ]
    contract_reference_rows = list(
        ContractReference.objects.select_related(
            "subscription",
            "subscription__customer",
            "subscription__product",
            "subscription__batch",
            "subscription__lucky_id",
            "direct_sale",
            "invoice",
        )
        .filter(customer=customer)
        .order_by("-source_created_at", "-id")[:25]
    )
    contract_reference_payload = [
        build_receivable_result(reference, audience="admin")
        for reference in contract_reference_rows
    ]

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "address": customer.address,
            "city": customer.city,
            "kyc_status": customer.kyc_status,
            "user_is_active": getattr(customer.user, "is_active", False),
        },
        "overview": {
            "subscription_count": subscription_summary["subscription_count"],
            "active_subscriptions": subscription_summary["active_subscriptions"],
            "completed_subscriptions": subscription_summary["completed_subscriptions"],
            "winner_subscriptions": subscription_summary["winner_subscriptions"],
            "total_subscription_paid": subscription_summary["total_paid_amount"],
            "subscription_outstanding_amount": subscription_summary["outstanding_amount"],
            "direct_sale_count": direct_sales_totals["total_count"] or 0,
            "direct_sale_outstanding_count": direct_sales_totals["outstanding_count"] or 0,
            "direct_sale_outstanding_total": _money(direct_sales_totals["outstanding_total"]),
            "receipt_count": receipt_totals["total_count"] or 0,
            "receipt_total": _money(receipt_totals["total_amount"]),
            "invoice_count": invoice_totals["total_count"] or 0,
            "invoice_outstanding_total": _money(invoice_totals["outstanding_total"]),
            "lead_count": lead_totals["total_count"] or 0,
            "lead_open_count": lead_totals["open_count"] or 0,
            "quotation_estimate_count": (lead_totals["quotation_count"] or 0)
            + (lead_totals["estimate_count"] or 0),
        },
        "direct_sales": {
            "summary": {
                "total_count": direct_sales_totals["total_count"] or 0,
                "invoiced_count": direct_sales_totals["invoiced_count"] or 0,
                "outstanding_count": direct_sales_totals["outstanding_count"] or 0,
                "gross_total": _money(direct_sales_totals["gross_total"]),
                "received_total": _money(direct_sales_totals["received_total"]),
                "outstanding_total": _money(direct_sales_totals["outstanding_total"]),
            },
            "rows": recent_direct_sales,
        },
        "subscriptions": {
            "summary": build_customer_profile_summary(customer),
            "rows": recent_subscriptions,
        },
        "contract_references": {
            "summary": {
                "total_count": len(contract_reference_payload),
                "advance_emi_count": sum(
                    1
                    for row in contract_reference_payload
                    if row["source_type"] == "ADVANCE_EMI"
                ),
                "rent_count": sum(
                    1 for row in contract_reference_payload if row["source_type"] == "RENT"
                ),
                "lease_count": sum(
                    1 for row in contract_reference_payload if row["source_type"] == "LEASE"
                ),
                "direct_sale_count": sum(
                    1
                    for row in contract_reference_payload
                    if row["source_type"] == "DIRECT_SALE"
                ),
            },
            "rows": contract_reference_payload,
        },
        "payments": {
            "summary": {
                "total_count": payment_totals["total_count"] or 0,
                "active_count": active_payment_qs.count(),
                "reversed_count": payment_totals["reversed_count"] or 0,
                "total_amount": _money(payment_totals["total_amount"]),
            },
            "rows": recent_payments,
        },
        "ledger_summary": {
            "entry_count": ledger_summary["entry_count"] or 0,
            "total_credits": _money(ledger_summary["total_credits"]),
            "total_debits": _money(ledger_summary["total_debits"]),
            "net_subscription_collections": _money(
                Decimal(str(ledger_summary["total_credits"] or "0.00"))
                - Decimal(str(ledger_summary["total_debits"] or "0.00"))
            ),
            "direct_sale_receivable_total": _money(direct_sales_totals["outstanding_total"]),
        },
        "receipts_documents": {
            "summary": {
                "receipt_count": receipt_totals["total_count"] or 0,
                "receipt_total": _money(receipt_totals["total_amount"]),
                "document_count": document_qs.count(),
                "invoice_count": invoice_totals["total_count"] or 0,
                "invoice_posted_count": invoice_totals["posted_count"] or 0,
                "invoice_total": _money(invoice_totals["grand_total"]),
                "invoice_outstanding_total": _money(invoice_totals["outstanding_total"]),
            },
            "receipts": recent_receipts,
            "invoices": recent_invoices,
            "documents": recent_documents,
        },
        "leads": {
            "summary": {
                "total_count": lead_totals["total_count"] or 0,
                "open_count": lead_totals["open_count"] or 0,
                "converted_count": lead_totals["converted_count"] or 0,
                "quotation_count": lead_totals["quotation_count"] or 0,
                "estimate_count": lead_totals["estimate_count"] or 0,
                "follow_up_required_count": lead_totals["follow_up_required_count"] or 0,
                "follow_up_due_count": lead_totals["follow_up_due_count"] or 0,
            },
            "rows": recent_leads,
        },
        "quotation_estimates": {
            "summary": {
                "total_count": (lead_totals["quotation_count"] or 0)
                + (lead_totals["estimate_count"] or 0),
                "quotation_count": lead_totals["quotation_count"] or 0,
                "estimate_count": lead_totals["estimate_count"] or 0,
            },
            "rows": quotation_estimate_rows,
        },
        "partner_linkages": {
            "count": len(partner_rows),
            "rows": list(partner_rows.values()),
        },
    }


def build_customer_operational_summary(customer: Customer) -> dict[str, object]:
    profile = build_customer_operational_profile(customer)
    overview = profile.get("overview", {})
    subscriptions = profile.get("subscriptions", {})
    direct_sales = profile.get("direct_sales", {})
    payments = profile.get("payments", {})

    active_subscriptions = int(overview.get("active_subscriptions", 0) or 0)
    overdue_emi_count = int(subscriptions.get("summary", {}).get("pending_emis", 0) or 0)
    pending_delivery_count = SubscriptionDelivery.objects.filter(
        subscription__customer=customer,
        status__in=[
            DeliveryStatus.PENDING,
            DeliveryStatus.SCHEDULED,
            DeliveryStatus.DISPATCHED,
            DeliveryStatus.OUT_FOR_DELIVERY,
            DeliveryStatus.RETURN_REQUESTED,
            DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE,
        ],
    ).count()
    open_service_count = customer.support_requests.filter(
        status__in=[SupportRequestStatus.SUBMITTED, SupportRequestStatus.UNDER_REVIEW]
    ).count()
    last_payment_date = next(
        (
            row.get("payment_date")
            for row in payments.get("rows", [])
            if not row.get("is_reversed")
        ),
        None,
    )

    risk_status = "GOOD"
    if open_service_count > 0:
        risk_status = "SERVICE_OPEN"
    if pending_delivery_count > 0:
        risk_status = "DELIVERY_PENDING"
    if overdue_emi_count > 0:
        risk_status = "OVERDUE"
    elif active_subscriptions > 0 and Decimal(str(overview.get("subscription_outstanding_amount") or "0.00")) > Decimal("0.00"):
        risk_status = "DUE"

    contract_reference_rows = profile.get("contract_references", {}).get("rows", [])
    rent_lease_contracts = [
        row
        for row in contract_reference_rows
        if str(row.get("source_type", "")).upper() in {"RENT", "LEASE"}
    ]

    return {
        "customer": {
            "id": profile.get("customer", {}).get("id"),
            "name": profile.get("customer", {}).get("name"),
            "phone": profile.get("customer", {}).get("phone"),
            "kyc_id": profile.get("customer", {}).get("kyc_status"),
            "status": "ACTIVE" if bool(profile.get("customer", {}).get("user_is_active")) else "INACTIVE",
        },
        "summary": {
            "active_subscriptions": active_subscriptions,
            "subscription_outstanding": _money(overview.get("subscription_outstanding_amount")),
            "direct_sale_outstanding": _money(
                direct_sales.get("summary", {}).get("outstanding_total")
            ),
            "rent_lease_outstanding": "0.00",
            "overdue_emi_count": overdue_emi_count,
            "pending_delivery_count": pending_delivery_count,
            "open_service_count": open_service_count,
            "last_payment_date": last_payment_date,
            "risk_status": risk_status,
        },
        "subscriptions": subscriptions.get("rows", []),
        "direct_sales": direct_sales.get("rows", []),
        "rent_lease_contracts": rent_lease_contracts,
        "deliveries": list(
            SubscriptionDelivery.objects.filter(subscription__customer=customer)
            .select_related("subscription")
            .order_by("-created_at", "-id")
            .values(
                "id",
                "subscription_id",
                "delivery_reference",
                "status",
                "scheduled_date",
                "delivered_at",
                "created_at",
            )[:10]
        ),
        "service_tickets": list(
            customer.support_requests.order_by("-created_at", "-id").values(
                "id",
                "status",
                "category",
                "subject",
                "created_at",
                "resolved_at",
            )[:10]
        ),
        "recent_activity": (
            payments.get("rows", [])[:5]
            + direct_sales.get("rows", [])[:5]
            + subscriptions.get("rows", [])[:5]
        )[:12],
    }
