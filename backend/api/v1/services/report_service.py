from __future__ import annotations

from decimal import Decimal
from typing import Dict, List

from django.db.models import Sum

from api.v1.selectors.customer_selector import get_customer_by_phone
from api.v1.selectors.payment_selector import get_latest_payment_for_customer
from api.v1.selectors.subscription_selector import (
    get_latest_subscription_for_customer,
)
from api.v1.services.commission_service import get_commission_summary_for_partner
from subscriptions.models import Commission, FinancialLedger, Payment, Subscription
from subscriptions.services.winner_state_service import winner_history_q


def build_customer_subscription_report_for_user(user) -> List[Dict[str, str]]:
    """
    Return rows for the customer subscription PDF/report for the given authenticated user.
    """
    customer = get_customer_by_phone(user.phone)
    if not customer:
        return []

    subscription = get_latest_subscription_for_customer(customer)
    if not subscription:
        return []

    return [
        {"label": "Customer", "value": customer.name or user.username},
        {
            "label": "Batch",
            "value": subscription.batch.batch_code if subscription.batch else "N/A",
        },
        {
            "label": "Lucky ID",
            "value": (
                f"{subscription.lucky_id.lucky_number:02d}"
                if subscription.lucky_id
                else "N/A"
            ),
        },
        {"label": "Plan Status", "value": subscription.status},
    ]


def build_customer_payment_receipt_report_for_user(user) -> List[Dict[str, str]]:
    customer = get_customer_by_phone(user.phone)
    if not customer:
        return []

    payment = get_latest_payment_for_customer(customer)
    if not payment:
        return []

    return [
        {
            "label": "Receipt No",
            "value": payment.reference_no or f"AUTO-{payment.id}",
        },
        {"label": "Amount", "value": f"INR {payment.amount}"},
        {"label": "Payment Mode", "value": payment.method},
        {"label": "Collected On", "value": payment.payment_date.isoformat()},
    ]


def build_customer_emi_ledger_report_for_user(user) -> List[Dict[str, str]]:
    customer = get_customer_by_phone(user.phone)
    if not customer:
        total = Decimal("0.00")
    else:
        totals = Payment.objects.filter(customer=customer).aggregate(
            total=Sum("amount")
        )
        total = totals["total"] or Decimal("0.00")

    return [{"label": "Total Paid", "value": f"INR {total}"}]


def build_partner_registration_report(user) -> List[Dict[str, str]]:
    return [
        {
            "label": "Partner Name",
            "value": user.get_full_name() or user.username,
        },
        {"label": "Partner Code", "value": f"PT-{user.id:03d}"},
        {"label": "Commission Rate", "value": "5%"},
        {
            "label": "Status",
            "value": "ACTIVE" if user.is_active else "SUSPENDED",
        },
    ]


def build_partner_commission_ledger_report(user) -> List[Dict[str, str]]:
    summary = get_commission_summary_for_partner(user)
    return [
        {"label": "Total Earned", "value": f"INR {summary['total']}"},
        {"label": "Paid", "value": f"INR {summary['paid']}"},
        {"label": "Unpaid", "value": f"INR {summary['unpaid']}"},
    ]


def build_admin_collection_ledger_report() -> List[Dict[str, str]]:
    total_collected = Payment.objects.aggregate(total=Sum("amount"))["total"] or Decimal(
        "0.00"
    )
    overdue = FinancialLedger.objects.filter(entry_type="OVERDUE").aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0.00")

    return [
        {"label": "Total Collected", "value": f"INR {total_collected}"},
        {"label": "Overdue", "value": f"INR {overdue}"},
    ]


def build_admin_waiver_ledger_report() -> List[Dict[str, str]]:
    waived = FinancialLedger.objects.filter(entry_type="WAIVER").aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0.00")
    winners = Subscription.objects.filter(winner_history_q()).distinct().count()

    return [
        {"label": "Total Waived", "value": f"INR {waived}"},
        {"label": "Winner Count", "value": str(winners)},
    ]


def build_admin_partner_payout_ledger_report() -> List[Dict[str, str]]:
    payable = Commission.objects.exclude(status="PAID").aggregate(
        total=Sum("commission_amount")
    )["total"] or Decimal("0.00")
    settled = Commission.objects.filter(status="PAID").aggregate(
        total=Sum("commission_amount")
    )["total"] or Decimal("0.00")

    return [
        {"label": "Payable", "value": f"INR {payable}"},
        {"label": "Settled", "value": f"INR {settled}"},
    ]
