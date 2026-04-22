from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum

from billing.models import DirectSale, ReceiptDocument
from subscriptions.models import Customer
from subscriptions.models import FinancialLedger, Payment, SubscriptionDocument
from subscriptions.services.subscription_financial_service import (
    build_customer_dashboard_summary,
    get_subscription_detail_queryset,
)


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

    return {
        "total_subscriptions": summary["subscription_count"],
        "active_subscriptions": summary["active_subscriptions"],
        "won_subscriptions": summary["winner_subscriptions"],
        "completed_subscriptions": summary["completed_subscriptions"],
        "pending_emis": summary["pending_emis"],
        "paid_emis": summary["paid_emis"],
        "waived_emis": summary["waived_emis"],
        "total_paid_amount": summary["total_paid_amount"],
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
            },
            "receipts": recent_receipts,
            "documents": recent_documents,
        },
        "partner_linkages": {
            "count": len(partner_rows),
            "rows": list(partner_rows.values()),
        },
    }
