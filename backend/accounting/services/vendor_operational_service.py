from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce

from accounting.models import Vendor, VendorSettlementStatus
from inventory.models import PurchaseBillStatus


def _money(value) -> str:
    return f"{Decimal(str(value or '0.00')).quantize(Decimal('0.01')):.2f}"


def build_vendor_operational_summary(vendor: Vendor) -> dict[str, object]:
    purchase_bills = (
        vendor.purchase_bills.select_related("branch", "finance_account")
        .annotate(
            settled_amount=Coalesce(
                Sum(
                    "vendor_settlements__amount",
                    filter=Q(vendor_settlements__status=VendorSettlementStatus.POSTED),
                ),
                Decimal("0.00"),
            )
        )
        .order_by("-bill_date", "-id")
    )
    settlements = (
        vendor.vendor_settlements.select_related("branch", "finance_account", "purchase_bill")
        .order_by("-settlement_date", "-id")
    )

    purchase_summary = purchase_bills.aggregate(
        total_count=Count("id"),
        draft_count=Count("id", filter=Q(status=PurchaseBillStatus.DRAFT)),
        approved_count=Count("id", filter=Q(status=PurchaseBillStatus.APPROVED)),
        posted_count=Count("id", filter=Q(status=PurchaseBillStatus.POSTED)),
        cancelled_count=Count("id", filter=Q(status=PurchaseBillStatus.CANCELLED)),
        gross_total=Sum("grand_total"),
        posted_total=Sum("grand_total", filter=Q(status=PurchaseBillStatus.POSTED)),
    )
    settlement_summary = settlements.aggregate(
        total_count=Count("id"),
        draft_count=Count("id", filter=Q(status=VendorSettlementStatus.DRAFT)),
        posted_count=Count("id", filter=Q(status=VendorSettlementStatus.POSTED)),
        cancelled_count=Count("id", filter=Q(status=VendorSettlementStatus.CANCELLED)),
        gross_total=Sum("amount"),
        posted_total=Sum("amount", filter=Q(status=VendorSettlementStatus.POSTED)),
    )

    posted_purchase_total = Decimal(str(purchase_summary["posted_total"] or "0.00"))
    posted_settlement_total = Decimal(str(settlement_summary["posted_total"] or "0.00"))
    outstanding_payable = posted_purchase_total - posted_settlement_total
    if outstanding_payable < Decimal("0.00"):
        outstanding_payable = Decimal("0.00")

    recent_purchase_bills = []
    for bill in purchase_bills[:10]:
        outstanding_amount = Decimal(str(bill.grand_total or "0.00")) - Decimal(
            str(getattr(bill, "settled_amount", "0.00") or "0.00")
        )
        if outstanding_amount < Decimal("0.00"):
            outstanding_amount = Decimal("0.00")
        recent_purchase_bills.append(
            {
                "id": bill.id,
                "bill_no": bill.bill_no,
                "bill_date": bill.bill_date,
                "status": bill.status,
                "branch_id": bill.branch_id,
                "branch_code": getattr(bill.branch, "code", None),
                "branch_name": getattr(bill.branch, "name", None),
                "finance_account_id": bill.finance_account_id,
                "finance_account_name": getattr(bill.finance_account, "name", None),
                "grand_total": _money(bill.grand_total),
                "settled_amount": _money(getattr(bill, "settled_amount", "0.00")),
                "outstanding_amount": _money(outstanding_amount),
            }
        )

    recent_settlements = [
        {
            "id": settlement.id,
            "settlement_no": settlement.settlement_no,
            "settlement_date": settlement.settlement_date,
            "status": settlement.status,
            "amount": _money(settlement.amount),
            "reference_no": settlement.reference_no,
            "branch_id": settlement.branch_id,
            "branch_code": getattr(settlement.branch, "code", None),
            "branch_name": getattr(settlement.branch, "name", None),
            "finance_account_id": settlement.finance_account_id,
            "finance_account_name": getattr(settlement.finance_account, "name", None),
            "purchase_bill_id": settlement.purchase_bill_id,
            "purchase_bill_no": getattr(settlement.purchase_bill, "bill_no", None),
        }
        for settlement in settlements[:10]
    ]

    timeline_rows = [
        {
            "kind": "PURCHASE_BILL",
            "date": bill["bill_date"],
            "reference_no": bill["bill_no"],
            "status": bill["status"],
            "amount": bill["grand_total"],
            "outstanding_amount": bill["outstanding_amount"],
            "linked_purchase_bill_id": bill["id"],
        }
        for bill in recent_purchase_bills
    ] + [
        {
            "kind": "SETTLEMENT",
            "date": settlement["settlement_date"],
            "reference_no": settlement["settlement_no"],
            "status": settlement["status"],
            "amount": settlement["amount"],
            "outstanding_amount": None,
            "linked_purchase_bill_id": settlement["purchase_bill_id"],
        }
        for settlement in recent_settlements
    ]
    timeline_rows.sort(
        key=lambda row: (row["date"], row["reference_no"] or ""),
        reverse=True,
    )

    return {
        "vendor": {
            "id": vendor.id,
            "name": vendor.name,
            "phone": vendor.phone,
            "email": vendor.email,
            "is_active": vendor.is_active,
            "gstin": vendor.gstin,
        },
        "summary": {
            "purchase_bill_count": purchase_summary["total_count"] or 0,
            "posted_purchase_bill_count": purchase_summary["posted_count"] or 0,
            "settlement_count": settlement_summary["total_count"] or 0,
            "posted_settlement_count": settlement_summary["posted_count"] or 0,
            "posted_purchase_total": _money(purchase_summary["posted_total"]),
            "posted_settlement_total": _money(settlement_summary["posted_total"]),
            "outstanding_payable_total": _money(outstanding_payable),
        },
        "purchase_bills": {
            "summary": {
                "total_count": purchase_summary["total_count"] or 0,
                "draft_count": purchase_summary["draft_count"] or 0,
                "approved_count": purchase_summary["approved_count"] or 0,
                "posted_count": purchase_summary["posted_count"] or 0,
                "cancelled_count": purchase_summary["cancelled_count"] or 0,
                "gross_total": _money(purchase_summary["gross_total"]),
                "posted_total": _money(purchase_summary["posted_total"]),
            },
            "rows": recent_purchase_bills,
        },
        "settlements": {
            "summary": {
                "total_count": settlement_summary["total_count"] or 0,
                "draft_count": settlement_summary["draft_count"] or 0,
                "posted_count": settlement_summary["posted_count"] or 0,
                "cancelled_count": settlement_summary["cancelled_count"] or 0,
                "gross_total": _money(settlement_summary["gross_total"]),
                "posted_total": _money(settlement_summary["posted_total"]),
            },
            "rows": recent_settlements,
        },
        "timeline": timeline_rows[:20],
    }
