from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from billing.models import BillingDocumentStatus, BillingInvoice, DirectSale, ReceiptDocument
from subscriptions.models import (
    Emi,
    EmiStatus,
    MONEY_ZERO,
    Payment,
    PaymentReconciliation,
    PlanType,
    ReconciliationStatus,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    Subscription,
    SubscriptionDocument,
)
from subscriptions.services.rent_lease_billing_service import (
    build_deposit_snapshot,
    generate_rent_lease_demands,
)


def _q2(value: Decimal | None) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _money(value: Decimal | None) -> str:
    return f"{_q2(value):.2f}"


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _date_filtered(queryset, *, date_from: date | None, date_to: date | None, field: str):
    if date_from:
        queryset = queryset.filter(**{f"{field}__gte": date_from})
    if date_to:
        queryset = queryset.filter(**{f"{field}__lte": date_to})
    return queryset


@dataclass(frozen=True)
class FinanceFilter:
    date_from: date | None = None
    date_to: date | None = None
    payment_method: str = ""
    plan_type: str = ""
    status: str = ""
    branch_id: int | None = None

    @classmethod
    def from_query_params(cls, query_params):
        raw_branch = (query_params.get("branch") or "").strip()
        return cls(
            date_from=_parse_date((query_params.get("date_from") or "").strip()),
            date_to=_parse_date((query_params.get("date_to") or "").strip()),
            payment_method=(query_params.get("payment_method") or "").strip().upper(),
            plan_type=(query_params.get("contract_type") or "").strip().upper(),
            status=(query_params.get("status") or "").strip().upper(),
            branch_id=int(raw_branch) if raw_branch.isdigit() else None,
        )


def _apply_payment_filter(queryset, flt: FinanceFilter):
    queryset = _date_filtered(queryset, date_from=flt.date_from, date_to=flt.date_to, field="payment_date")
    if flt.payment_method:
        queryset = queryset.filter(method=flt.payment_method)
    if flt.plan_type:
        queryset = queryset.filter(subscription__plan_type=flt.plan_type)
    if flt.branch_id:
        queryset = queryset.filter(branch_id=flt.branch_id)
    return queryset


def _apply_invoice_filter(queryset, flt: FinanceFilter):
    queryset = _date_filtered(queryset, date_from=flt.date_from, date_to=flt.date_to, field="invoice_date")
    if flt.status:
        queryset = queryset.filter(status=flt.status)
    if flt.branch_id:
        queryset = queryset.filter(branch_id=flt.branch_id)
    if flt.plan_type:
        queryset = queryset.filter(subscription__plan_type=flt.plan_type)
    return queryset


def _apply_receipt_filter(queryset, flt: FinanceFilter):
    queryset = _date_filtered(queryset, date_from=flt.date_from, date_to=flt.date_to, field="receipt_date")
    if flt.status:
        queryset = queryset.filter(status=flt.status)
    if flt.branch_id:
        queryset = queryset.filter(branch_id=flt.branch_id)
    if flt.plan_type:
        queryset = queryset.filter(subscription__plan_type=flt.plan_type)
    return queryset


def _method_split_rows(payments) -> list[dict]:
    rows = (
        payments.values("method")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("method")
    )
    return [
        {
            "payment_method": row["method"],
            "count": row["count"],
            "amount": _money(row["total"]),
        }
        for row in rows
    ]


def build_admin_finance_dashboard(*, flt: FinanceFilter) -> dict:
    today = timezone.localdate()
    generate_rent_lease_demands(through_date=today)
    base_payments = Payment.objects.exclude(
        allocation_metadata__reversal__is_reversed=True
    ).select_related("subscription")
    base_payments = _apply_payment_filter(base_payments, flt)
    today_payments = base_payments.filter(payment_date=today)

    base_emis = Emi.objects.select_related("subscription", "subscription__product", "subscription__customer")
    if flt.plan_type:
        base_emis = base_emis.filter(subscription__plan_type=flt.plan_type)
    if flt.branch_id:
        base_emis = base_emis.filter(subscription__branch_id=flt.branch_id)

    pending_emis = base_emis.filter(status=EmiStatus.PENDING)
    overdue_emis = pending_emis.filter(due_date__lt=today)
    waived_emis = base_emis.filter(status=EmiStatus.WAIVED)

    invoices = _apply_invoice_filter(BillingInvoice.objects.all(), flt)
    receipts = _apply_receipt_filter(ReceiptDocument.objects.all(), flt)
    unreconciled = PaymentReconciliation.objects.filter(
        Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)
    )
    if flt.branch_id:
        unreconciled = unreconciled.filter(payment__branch_id=flt.branch_id)
    if flt.plan_type:
        unreconciled = unreconciled.filter(payment__subscription__plan_type=flt.plan_type)

    direct_sale_invoices = invoices.filter(direct_sale__isnull=False)
    direct_sale_paid = direct_sale_invoices.aggregate(total=Sum("received_total"))["total"]
    direct_sale_outstanding = direct_sale_invoices.aggregate(total=Sum("balance_total"))["total"]

    rent_lease_payments = base_payments.filter(subscription__plan_type__in=[PlanType.RENT, PlanType.LEASE])
    emi_payments = base_payments.filter(subscription__plan_type=PlanType.EMI)
    rent_lease_demands = RentLeaseBillingDemand.objects.filter(
        subscription__plan_type__in=[PlanType.RENT, PlanType.LEASE]
    )
    if flt.plan_type:
        rent_lease_demands = rent_lease_demands.filter(subscription__plan_type=flt.plan_type)
    if flt.branch_id:
        rent_lease_demands = rent_lease_demands.filter(subscription__branch_id=flt.branch_id)
    if flt.date_from:
        rent_lease_demands = rent_lease_demands.filter(due_date__gte=flt.date_from)
    if flt.date_to:
        rent_lease_demands = rent_lease_demands.filter(due_date__lte=flt.date_to)

    rent_monthly_pending = rent_lease_demands.filter(
        demand_type=RentLeaseDemandType.RENT_MONTHLY,
        status__in=["PENDING", "OVERDUE", "PARTIAL"],
    )
    lease_monthly_pending = rent_lease_demands.filter(
        demand_type=RentLeaseDemandType.LEASE_MONTHLY,
        status__in=["PENDING", "OVERDUE", "PARTIAL"],
    )
    overdue_rent_lease = rent_lease_demands.filter(
        demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
        status="OVERDUE",
    )
    deposit_demands = rent_lease_demands.filter(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)
    pending_refunds = RentLeaseDepositTransaction.objects.filter(
        transaction_type=RentLeaseDepositTransactionType.REFUND_APPROVED
    )
    if flt.branch_id:
        pending_refunds = pending_refunds.filter(subscription__branch_id=flt.branch_id)
    if flt.plan_type:
        pending_refunds = pending_refunds.filter(subscription__plan_type=flt.plan_type)
    deposit_deductions = RentLeaseDepositTransaction.objects.filter(
        transaction_type=RentLeaseDepositTransactionType.DEDUCTION
    )
    if flt.branch_id:
        deposit_deductions = deposit_deductions.filter(subscription__branch_id=flt.branch_id)
    if flt.plan_type:
        deposit_deductions = deposit_deductions.filter(subscription__plan_type=flt.plan_type)
    contracts_nearing_return_candidates = Subscription.objects.filter(
        plan_type__in=[PlanType.RENT, PlanType.LEASE],
        status__in=["ACTIVE", "APPROVED"],
        start_date__isnull=False,
    ).only("id", "start_date", "tenure_months")
    contracts_nearing_return_ids = []
    for row in contracts_nearing_return_candidates:
        projected_return_date = row.start_date + timedelta(days=int(row.tenure_months or 0) * 30)
        if projected_return_date <= today + timedelta(days=30):
            contracts_nearing_return_ids.append(row.id)
    contracts_nearing_return = Subscription.objects.filter(id__in=contracts_nearing_return_ids)

    method_split_today = _method_split_rows(today_payments)
    method_split_range = _method_split_rows(base_payments)

    cards = {
        "today_total_collection": _money(today_payments.aggregate(total=Sum("amount"))["total"]),
        "today_cash_collection": _money(today_payments.filter(method="CASH").aggregate(total=Sum("amount"))["total"]),
        "today_upi_collection": _money(today_payments.filter(method="UPI").aggregate(total=Sum("amount"))["total"]),
        "today_bank_collection": _money(today_payments.filter(method="BANK").aggregate(total=Sum("amount"))["total"]),
        "pending_dues": _money(pending_emis.aggregate(total=Sum("amount"))["total"]),
        "overdue_payments": _money(overdue_emis.aggregate(total=Sum("amount"))["total"]),
        "advance_emi_collection": _money(emi_payments.aggregate(total=Sum("amount"))["total"]),
        "rent_lease_monthly_collection": _money(rent_lease_payments.aggregate(total=Sum("amount"))["total"]),
        "rent_monthly_invoices_pending": rent_monthly_pending.count(),
        "lease_monthly_invoices_pending": lease_monthly_pending.count(),
        "rent_lease_overdue": overdue_rent_lease.count(),
        "deposits_held": _money(deposit_demands.aggregate(total=Sum("held_amount"))["total"]),
        "deposit_refunds_pending": _money(pending_refunds.aggregate(total=Sum("amount"))["total"]),
        "deposit_deductions": _money(deposit_deductions.aggregate(total=Sum("amount"))["total"]),
        "rent_lease_income": _money(rent_lease_payments.aggregate(total=Sum("amount"))["total"]),
        "upcoming_rent_lease_due_dates": rent_lease_demands.filter(
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
            due_date__gte=today,
            due_date__lte=today + timedelta(days=30),
            status__in=["PENDING", "PARTIAL"],
        ).count(),
        "contracts_nearing_return_date": contracts_nearing_return.count(),
        "return_inspections_pending": contracts_nearing_return.filter(
            return_inspection__status__in=["PENDING", "IN_PROGRESS", "COMPLETED"]
        ).count(),
        "waiver_loss_exposure": _money(waived_emis.aggregate(total=Sum("amount"))["total"]),
        "direct_sale_revenue": _money(direct_sale_paid),
        "direct_sale_outstanding": _money(direct_sale_outstanding),
        "unreconciled_transactions": unreconciled.count(),
        "receipts_generated_today": receipts.filter(receipt_date=today).count(),
        "invoices_pending": invoices.filter(status=BillingDocumentStatus.DRAFT).count(),
    }

    return {
        "filters_applied": {
            "date_from": flt.date_from,
            "date_to": flt.date_to,
            "payment_method": flt.payment_method or None,
            "contract_type": flt.plan_type or None,
            "status": flt.status or None,
            "branch_id": flt.branch_id,
        },
        "cards": cards,
        "payment_method_split_today": method_split_today,
        "payment_method_split_range": method_split_range,
        "overdue_aging": [
            {
                "bucket": "1-30",
                "count": overdue_emis.filter(due_date__gte=today - timedelta(days=30)).count(),
                "amount": _money(
                    overdue_emis.filter(due_date__gte=today - timedelta(days=30)).aggregate(total=Sum("amount"))["total"]
                ),
            },
            {
                "bucket": "31-60",
                "count": overdue_emis.filter(
                    due_date__lt=today - timedelta(days=30),
                    due_date__gte=today - timedelta(days=60),
                ).count(),
                "amount": _money(
                    overdue_emis.filter(
                        due_date__lt=today - timedelta(days=30),
                        due_date__gte=today - timedelta(days=60),
                    ).aggregate(total=Sum("amount"))["total"]
                ),
            },
            {
                "bucket": "61+",
                "count": overdue_emis.filter(due_date__lt=today - timedelta(days=60)).count(),
                "amount": _money(
                    overdue_emis.filter(due_date__lt=today - timedelta(days=60)).aggregate(total=Sum("amount"))["total"]
                ),
            },
        ],
    }


def list_admin_invoices(*, flt: FinanceFilter, limit: int = 200) -> dict:
    queryset = _apply_invoice_filter(
        BillingInvoice.objects.select_related("customer", "subscription", "direct_sale").order_by("-invoice_date", "-id"),
        flt,
    )
    rows = list(queryset[:limit])
    return {
        "count": queryset.count(),
        "results": [
            {
                "id": row.id,
                "invoice_no": row.document_no,
                "invoice_date": row.invoice_date,
                "status": row.status,
                "document_type": row.document_type,
                "customer_id": row.customer_id,
                "customer_name": row.customer_name_snapshot or (row.customer.name if row.customer_id else ""),
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", None) if row.subscription_id else None,
                "direct_sale_id": row.direct_sale_id,
                "direct_sale_no": getattr(row.direct_sale, "sale_no", None) if row.direct_sale_id else None,
                "grand_total": _money(row.grand_total),
                "received_total": _money(row.received_total),
                "balance_total": _money(row.balance_total),
                "billing_channel": row.billing_channel,
            }
            for row in rows
        ],
    }


def list_admin_receipts(*, flt: FinanceFilter, limit: int = 200) -> dict:
    queryset = _apply_receipt_filter(
        ReceiptDocument.objects.select_related("customer", "subscription", "billing_invoice", "direct_sale", "payment")
        .order_by("-receipt_date", "-id"),
        flt,
    )
    rows = list(queryset[:limit])
    return {
        "count": queryset.count(),
        "results": [
            {
                "id": row.id,
                "receipt_no": row.receipt_no,
                "receipt_date": row.receipt_date,
                "status": row.status,
                "receipt_type": row.receipt_type,
                "amount": _money(row.amount),
                "customer_id": row.customer_id,
                "customer_name": row.customer_name_snapshot or (row.customer.name if row.customer_id else ""),
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", None) if row.subscription_id else None,
                "invoice_id": row.billing_invoice_id,
                "invoice_no": getattr(row.billing_invoice, "document_no", None) if row.billing_invoice_id else None,
                "direct_sale_id": row.direct_sale_id,
                "direct_sale_no": getattr(row.direct_sale, "sale_no", None) if row.direct_sale_id else None,
                "payment_id": row.payment_id,
                "payment_method": getattr(row.payment, "method", None) if row.payment_id else None,
                "reference_no": row.source_reference,
            }
            for row in rows
        ],
    }


def list_admin_documents(*, subscription_id: int | None = None, limit: int = 200) -> dict:
    queryset = SubscriptionDocument.objects.select_related("subscription", "uploaded_by", "generated_by").order_by("-created_at", "-id")
    if subscription_id:
        queryset = queryset.filter(subscription_id=subscription_id)
    rows = list(queryset[:limit])
    return {
        "count": queryset.count(),
        "results": [
            {
                "id": row.id,
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", None),
                "document_type": row.document_type,
                "document_version": row.document_version,
                "verification_status": row.verification_status,
                "generated_by": getattr(row.generated_by, "username", None),
                "uploaded_by": getattr(row.uploaded_by, "username", None),
                "generated_at": row.created_at,
                "regeneration_reason": row.regeneration_reason,
                "file_name": row.file.name.split("/")[-1] if row.file else "",
                "file_url": row.file.url if row.file else None,
            }
            for row in rows
        ],
    }


def customer_finance_summary(*, customer) -> dict:
    generate_rent_lease_demands(through_date=timezone.localdate())
    payments = Payment.objects.filter(customer=customer).exclude(
        allocation_metadata__reversal__is_reversed=True
    )
    subscriptions = Subscription.objects.filter(customer=customer)
    emis = Emi.objects.filter(subscription__customer=customer)
    invoices = BillingInvoice.objects.filter(customer=customer)
    receipts = ReceiptDocument.objects.filter(customer=customer)
    rent_lease_subscriptions = subscriptions.filter(plan_type__in=[PlanType.RENT, PlanType.LEASE])
    rent_lease_demands = RentLeaseBillingDemand.objects.filter(subscription__customer=customer)
    deposit_rows = []
    for sub in rent_lease_subscriptions.select_related("rent_profile", "lease_profile"):
        snapshot = build_deposit_snapshot(subscription=sub)
        deposit_rows.append(
            {
                "subscription_id": sub.id,
                "subscription_number": getattr(sub, "subscription_number", None),
                "plan_type": sub.plan_type,
                "deposit_amount": _money(snapshot.deposit_amount),
                "collected_amount": _money(snapshot.collected_amount),
                "held_amount": _money(snapshot.held_amount),
                "refundable_amount": _money(snapshot.refundable_amount),
                "deducted_amount": _money(snapshot.deducted_amount),
                "refunded_amount": _money(snapshot.refunded_amount),
                "refund_status": snapshot.refund_status,
            }
        )

    next_due = (
        emis.filter(status=EmiStatus.PENDING, due_date__gte=timezone.localdate())
        .order_by("due_date", "id")
        .first()
    )

    return {
        "customer_id": customer.id,
        "summary": {
            "total_invoices": invoices.count(),
            "total_receipts": receipts.count(),
            "total_paid": _money(payments.aggregate(total=Sum("amount"))["total"]),
            "total_pending": _money(emis.filter(status=EmiStatus.PENDING).aggregate(total=Sum("amount"))["total"]),
            "total_overdue": _money(
                emis.filter(status=EmiStatus.PENDING, due_date__lt=timezone.localdate()).aggregate(total=Sum("amount"))["total"]
            ),
            "active_contracts": subscriptions.filter(status__in=["ACTIVE", "APPROVED"]).count(),
            "rent_lease_pending_invoices": rent_lease_demands.filter(
                demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
                status__in=["PENDING", "OVERDUE", "PARTIAL"],
            ).count(),
            "rent_lease_overdue": rent_lease_demands.filter(
                demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
                status="OVERDUE",
            ).count(),
            "direct_sale_purchases": DirectSale.objects.filter(customer=customer).count(),
            "last_payment_date": payments.order_by("-payment_date").values_list("payment_date", flat=True).first(),
            "next_due_date": getattr(next_due, "due_date", None),
            "next_due_amount": _money(getattr(next_due, "amount", MONEY_ZERO)),
        },
        "payment_method_split": _method_split_rows(payments),
        "deposit_summary": deposit_rows,
    }


def customer_invoice_list(*, customer, limit: int = 200) -> dict:
    generate_rent_lease_demands(through_date=timezone.localdate())
    rows = list(
        BillingInvoice.objects.filter(customer=customer)
        .select_related("subscription", "direct_sale")
        .order_by("-invoice_date", "-id")[:limit]
    )
    rent_lease_demands = list(
        RentLeaseBillingDemand.objects.filter(
            subscription__customer=customer,
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY, RentLeaseDemandType.SECURITY_DEPOSIT],
        )
        .select_related("subscription", "subscription__product")
        .order_by("-due_date", "-id")[:limit]
    )
    return {
        "count": len(rows) + len(rent_lease_demands),
        "results": [
            {
                "id": row.id,
                "invoice_no": row.document_no,
                "invoice_date": row.invoice_date,
                "status": row.status,
                "subscription_number": getattr(row.subscription, "subscription_number", None) if row.subscription_id else None,
                "direct_sale_no": getattr(row.direct_sale, "sale_no", None) if row.direct_sale_id else None,
                "grand_total": _money(row.grand_total),
                "received_total": _money(row.received_total),
                "balance_total": _money(row.balance_total),
            }
            for row in rows
        ] + [
            {
                "id": f"rl-{row.id}",
                "invoice_no": row.reference_key,
                "invoice_date": row.created_at.date(),
                "status": row.status,
                "subscription_number": getattr(row.subscription, "subscription_number", None),
                "direct_sale_no": None,
                "grand_total": _money(row.amount),
                "received_total": _money(row.collected_amount),
                "balance_total": _money(row.outstanding_amount()),
                "plan_type": row.subscription.plan_type,
                "product_name": getattr(row.subscription.product, "name", ""),
                "billing_period_start": row.billing_period_start,
                "billing_period_end": row.billing_period_end,
                "due_date": row.due_date,
                "demand_type": row.demand_type,
            }
            for row in rent_lease_demands
        ],
    }


def customer_receipt_list(*, customer, limit: int = 200) -> dict:
    rows = list(
        ReceiptDocument.objects.filter(customer=customer)
        .select_related("subscription", "billing_invoice", "payment")
        .order_by("-receipt_date", "-id")[:limit]
    )
    return {
        "count": len(rows),
        "results": [
            {
                "id": row.id,
                "receipt_no": row.receipt_no,
                "receipt_date": row.receipt_date,
                "status": row.status,
                "amount": _money(row.amount),
                "payment_method": getattr(row.payment, "method", None) if row.payment_id else None,
                "invoice_no": getattr(row.billing_invoice, "document_no", None) if row.billing_invoice_id else None,
                "subscription_number": getattr(row.subscription, "subscription_number", None) if row.subscription_id else None,
            }
            for row in rows
        ],
    }


def customer_document_list(*, customer, limit: int = 200) -> dict:
    rows = list(
        SubscriptionDocument.objects.filter(subscription__customer=customer)
        .select_related("subscription", "generated_by")
        .order_by("-created_at", "-id")[:limit]
    )
    return {
        "count": len(rows),
        "results": [
            {
                "id": row.id,
                "document_type": row.document_type,
                "document_version": row.document_version,
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", None),
                "generated_at": row.created_at,
                "generated_by": getattr(row.generated_by, "username", None),
                "file_url": row.file.url if row.file else None,
                "file_name": row.file.name.split("/")[-1] if row.file else "",
            }
            for row in rows
        ],
    }


def customer_payment_schedule(*, customer) -> dict:
    rows = list(
        Emi.objects.filter(subscription__customer=customer)
        .select_related("subscription", "subscription__product", "subscription__batch", "subscription__lucky_id")
        .order_by("due_date", "id")
    )
    return {
        "count": len(rows),
        "results": [
            {
                "emi_id": row.id,
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", None),
                "plan_type": row.subscription.plan_type,
                "product_name": getattr(row.subscription.product, "name", ""),
                "batch_code": getattr(row.subscription.batch, "batch_code", None) if row.subscription.batch_id else None,
                "lucky_number": getattr(row.subscription.lucky_id, "lucky_number", None)
                if row.subscription.lucky_id_id
                else None,
                "month_no": row.month_no,
                "due_date": row.due_date,
                "amount": _money(row.amount),
                "status": row.status,
                "paid_amount": _money(row.total_paid()),
                "outstanding_amount": _money(row.balance_amount()),
                "is_overdue": row.is_overdue(),
            }
            for row in rows
        ],
    }


def customer_account_statement(*, customer, flt: FinanceFilter) -> dict:
    payments = _apply_payment_filter(
        Payment.objects.filter(customer=customer).exclude(
            allocation_metadata__reversal__is_reversed=True
        ),
        flt,
    )
    receipts = _apply_receipt_filter(ReceiptDocument.objects.filter(customer=customer), flt)
    invoices = _apply_invoice_filter(BillingInvoice.objects.filter(customer=customer), flt)
    return {
        "summary": {
            "payments_total": _money(payments.aggregate(total=Sum("amount"))["total"]),
            "receipts_total": _money(receipts.aggregate(total=Sum("amount"))["total"]),
            "invoice_total": _money(invoices.aggregate(total=Sum("grand_total"))["total"]),
            "invoice_balance_total": _money(invoices.aggregate(total=Sum("balance_total"))["total"]),
        },
        "payments": [
            {
                "id": p.id,
                "date": p.payment_date,
                "amount": _money(p.amount),
                "method": p.method,
                "reference_no": p.reference_no,
                "subscription_number": getattr(p.subscription, "subscription_number", None),
            }
            for p in payments.select_related("subscription").order_by("-payment_date", "-id")[:200]
        ],
        "receipts": [
            {
                "id": r.id,
                "receipt_no": r.receipt_no,
                "date": r.receipt_date,
                "amount": _money(r.amount),
                "status": r.status,
            }
            for r in receipts.order_by("-receipt_date", "-id")[:200]
        ],
        "invoices": [
            {
                "id": i.id,
                "invoice_no": i.document_no,
                "date": i.invoice_date,
                "grand_total": _money(i.grand_total),
                "received_total": _money(i.received_total),
                "balance_total": _money(i.balance_total),
                "status": i.status,
            }
            for i in invoices.order_by("-invoice_date", "-id")[:200]
        ],
    }


def partner_finance_summary(*, partner) -> dict:
    generate_rent_lease_demands(through_date=timezone.localdate())
    payments = Payment.objects.filter(subscription__partner=partner).exclude(
        allocation_metadata__reversal__is_reversed=True
    )
    receipts = ReceiptDocument.objects.filter(subscription__partner=partner)
    commissions_total = Subscription.objects.filter(partner=partner).aggregate(
        total=Sum("commissions__commission_amount")
    )["total"]
    pending_dues = Emi.objects.filter(
        subscription__partner=partner, status=EmiStatus.PENDING
    ).aggregate(total=Sum("amount"))["total"]
    rent_lease_demands = RentLeaseBillingDemand.objects.filter(subscription__partner=partner)
    return {
        "summary": {
            "linked_customers": Subscription.objects.filter(partner=partner).values("customer").distinct().count(),
            "linked_contracts": Subscription.objects.filter(partner=partner).count(),
            "collections_total": _money(payments.aggregate(total=Sum("amount"))["total"]),
            "receipts_count": receipts.count(),
            "commission_total": _money(commissions_total),
            "pending_dues": _money(pending_dues),
            "rent_lease_contracts": Subscription.objects.filter(
                partner=partner,
                plan_type__in=[PlanType.RENT, PlanType.LEASE],
            ).count(),
            "linked_rent_lease_payment_status": {
                "pending": rent_lease_demands.filter(status="PENDING").count(),
                "partial": rent_lease_demands.filter(status="PARTIAL").count(),
                "overdue": rent_lease_demands.filter(status="OVERDUE").count(),
                "paid": rent_lease_demands.filter(status="PAID").count(),
            },
        },
        "payment_method_split": _method_split_rows(payments),
    }


def partner_linked_customer_payments(*, partner, limit: int = 200) -> dict:
    rows = list(
        Payment.objects.filter(subscription__partner=partner)
        .exclude(allocation_metadata__reversal__is_reversed=True)
        .select_related("customer", "subscription", "subscription__product")
        .order_by("-payment_date", "-id")[:limit]
    )
    return {
        "count": len(rows),
        "results": [
            {
                "id": row.id,
                "customer_id": row.customer_id,
                "customer_name": row.customer.name,
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", None),
                "product_name": getattr(row.subscription.product, "name", ""),
                "payment_date": row.payment_date,
                "amount": _money(row.amount),
                "method": row.method,
                "reference_no": row.reference_no,
            }
            for row in rows
        ],
    }


def partner_receipt_list(*, partner, limit: int = 200) -> dict:
    rows = list(
        ReceiptDocument.objects.filter(subscription__partner=partner)
        .select_related("customer", "subscription", "payment")
        .order_by("-receipt_date", "-id")[:limit]
    )
    return {
        "count": len(rows),
        "results": [
            {
                "id": row.id,
                "receipt_no": row.receipt_no,
                "receipt_date": row.receipt_date,
                "amount": _money(row.amount),
                "status": row.status,
                "customer_name": row.customer.name if row.customer_id else row.customer_name_snapshot,
                "subscription_number": getattr(row.subscription, "subscription_number", None) if row.subscription_id else None,
                "payment_method": getattr(row.payment, "method", None) if row.payment_id else None,
            }
            for row in rows
        ],
    }


def waiver_loss_report(*, flt: FinanceFilter) -> dict:
    emis = Emi.objects.filter(status=EmiStatus.WAIVED).select_related("subscription", "subscription__customer")
    if flt.date_from:
        emis = emis.filter(due_date__gte=flt.date_from)
    if flt.date_to:
        emis = emis.filter(due_date__lte=flt.date_to)
    if flt.plan_type:
        emis = emis.filter(subscription__plan_type=flt.plan_type)
    if flt.branch_id:
        emis = emis.filter(subscription__branch_id=flt.branch_id)

    grouped = (
        emis.values("subscription_id", "subscription__subscription_number", "subscription__customer__name")
        .annotate(count=Count("id"), total=Sum("amount"))
        .order_by("-total")
    )
    return {
        "waived_emi_count": emis.count(),
        "waiver_loss_exposure": _money(emis.aggregate(total=Sum("amount"))["total"]),
        "results": [
            {
                "subscription_id": row["subscription_id"],
                "subscription_number": row["subscription__subscription_number"],
                "customer_name": row["subscription__customer__name"],
                "waived_emi_count": row["count"],
                "waived_amount": _money(row["total"]),
            }
            for row in grouped[:200]
        ],
    }


def reconciliation_report(*, flt: FinanceFilter, limit: int = 200) -> dict:
    queryset = PaymentReconciliation.objects.select_related("payment", "payment__subscription", "matched_emi").order_by("-created_at", "-id")
    if flt.status:
        queryset = queryset.filter(status=flt.status)
    if flt.plan_type:
        queryset = queryset.filter(payment__subscription__plan_type=flt.plan_type)
    if flt.branch_id:
        queryset = queryset.filter(payment__branch_id=flt.branch_id)
    if flt.date_from:
        queryset = queryset.filter(payment__payment_date__gte=flt.date_from)
    if flt.date_to:
        queryset = queryset.filter(payment__payment_date__lte=flt.date_to)

    rows = list(queryset[:limit])
    return {
        "count": queryset.count(),
        "unreconciled_count": queryset.filter(Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)).count(),
        "results": [
            {
                "id": row.id,
                "payment_id": row.payment_id,
                "payment_date": row.payment.payment_date,
                "subscription_id": row.payment.subscription_id,
                "subscription_number": getattr(row.payment.subscription, "subscription_number", None),
                "status": row.status,
                "is_flagged": row.is_flagged,
                "is_locked": row.is_locked,
                "expected_amount": _money(row.expected_amount),
                "paid_amount": _money(row.paid_amount),
                "variance_amount": _money(row.variance_amount),
                "matched_emi_id": row.matched_emi_id,
            }
            for row in rows
        ],
    }
