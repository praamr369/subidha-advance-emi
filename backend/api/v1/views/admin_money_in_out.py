"""Consolidated 'Money In vs Out by method' report (Cash / UPI / Bank / Card).

Read-only admin report.

- Money In  = customer Payments, grouped by Payment.method.
- Money Out = posted Expense vouchers + posted Vendor payments + Salary
              payments, grouped by the paying finance account's kind.

This is a reporting view over authoritative records; it does not post or mutate
anything.
"""

from __future__ import annotations

from decimal import Decimal

from django.apps import apps
from django.db.models import Sum
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin

MONEY_ZERO = Decimal("0.00")
BUCKET_ORDER = ("CASH", "UPI", "BANK", "CARD")


def _q2(value) -> str:
    return str((Decimal(str(value or 0))).quantize(Decimal("0.01")))


class AdminMoneyInOutView(APIView):
    """GET /api/v1/admin/reports/money-in-out/?date_from=&date_to="""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        date_from = (request.query_params.get("date_from") or "").strip() or None
        date_to = (request.query_params.get("date_to") or "").strip() or None

        Payment = apps.get_model("subscriptions", "Payment")
        ExpenseVoucher = apps.get_model("accounting", "ExpenseVoucher")
        VendorPayment = apps.get_model("inventory", "VendorPayment")
        SalaryPayment = apps.get_model("accounting", "SalaryPayment")

        money_in: dict[str, Decimal] = {}
        money_out: dict[str, Decimal] = {}

        # ---- Money In: customer payments by method --------------------------
        in_qs = Payment.objects.all()
        if date_from:
            in_qs = in_qs.filter(payment_date__gte=date_from)
        if date_to:
            in_qs = in_qs.filter(payment_date__lte=date_to)
        for row in in_qs.values("method").annotate(total=Sum("amount")):
            method = (row["method"] or "OTHER").upper()
            money_in[method] = money_in.get(method, MONEY_ZERO) + (row["total"] or MONEY_ZERO)

        # ---- Money Out: posted outflows by finance-account kind ------------
        def _accumulate_out(qs, date_field, amount_field):
            if date_from:
                qs = qs.filter(**{f"{date_field}__gte": date_from})
            if date_to:
                qs = qs.filter(**{f"{date_field}__lte": date_to})
            for row in qs.values("finance_account__kind").annotate(total=Sum(amount_field)):
                kind = (row["finance_account__kind"] or "OTHER").upper()
                money_out[kind] = money_out.get(kind, MONEY_ZERO) + (row["total"] or MONEY_ZERO)

        _accumulate_out(ExpenseVoucher.objects.filter(status="POSTED"), "expense_date", "net_amount")
        _accumulate_out(VendorPayment.objects.filter(status="POSTED"), "payment_date", "amount")
        _accumulate_out(SalaryPayment.objects.all(), "payment_date", "amount")

        methods = list(BUCKET_ORDER) + sorted(
            set(money_in) | set(money_out) - set(BUCKET_ORDER)
        )
        seen: set[str] = set()
        buckets = []
        total_in = MONEY_ZERO
        total_out = MONEY_ZERO
        for method in methods:
            if method in seen:
                continue
            seen.add(method)
            m_in = money_in.get(method, MONEY_ZERO)
            m_out = money_out.get(method, MONEY_ZERO)
            if m_in == MONEY_ZERO and m_out == MONEY_ZERO and method not in BUCKET_ORDER:
                continue
            total_in += m_in
            total_out += m_out
            buckets.append(
                {
                    "method": method,
                    "money_in": _q2(m_in),
                    "money_out": _q2(m_out),
                    "net": _q2(m_in - m_out),
                }
            )

        return Response(
            {
                "date_from": date_from,
                "date_to": date_to,
                "buckets": buckets,
                "totals": {
                    "money_in": _q2(total_in),
                    "money_out": _q2(total_out),
                    "net": _q2(total_in - total_out),
                },
                "sources": {
                    "money_in": ["subscriptions.Payment (by method)"],
                    "money_out": [
                        "accounting.ExpenseVoucher (POSTED, net_amount)",
                        "inventory.VendorPayment (POSTED, amount)",
                        "accounting.SalaryPayment (amount)",
                    ],
                    "note": "Money-out is grouped by the paying finance account's kind (Cash/UPI/Bank).",
                },
            },
            status=status.HTTP_200_OK,
        )
