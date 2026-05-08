from __future__ import annotations

from decimal import Decimal

from django.db.models import Q, Sum

from accounting.models import Vendor, VendorLedgerEntry
from billing.models import PurchaseReturn, PurchaseReturnStatus
from inventory.models import PurchaseBill, PurchaseBillStatus, PurchaseOrder, PurchaseOrderStatus, VendorPayment, VendorPaymentStatus


def get_vendor_ledger(vendor: Vendor, filters: dict | None = None) -> dict:
    filters = filters or {}
    qs = VendorLedgerEntry.objects.filter(vendor=vendor).order_by("-posted_at", "-id")
    entry_type = (filters.get("entry_type") or "").strip().upper()
    if entry_type:
        qs = qs.filter(entry_type=entry_type)
    date_from = filters.get("date_from")
    date_to = filters.get("date_to")
    if date_from:
        qs = qs.filter(posted_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(posted_at__date__lte=date_to)
    return {"count": qs.count(), "results": list(qs.values())}


def get_vendor_outstanding(vendor: Vendor) -> dict:
    def _entry_net(entry_type: str) -> Decimal:
        agg = VendorLedgerEntry.objects.filter(vendor=vendor, entry_type=entry_type).aggregate(
            debit_total=Sum("debit"), credit_total=Sum("credit")
        )
        return (agg.get("debit_total") or Decimal("0.00")) - (agg.get("credit_total") or Decimal("0.00"))

    def _entry_reduction(entry_type: str) -> Decimal:
        agg = VendorLedgerEntry.objects.filter(vendor=vendor, entry_type=entry_type).aggregate(
            debit_total=Sum("debit"), credit_total=Sum("credit")
        )
        return (agg.get("credit_total") or Decimal("0.00")) - (agg.get("debit_total") or Decimal("0.00"))

    opening = VendorLedgerEntry.objects.filter(vendor=vendor, entry_type="OPENING_BALANCE").aggregate(
        opening=Sum("debit") - Sum("credit")
    )["opening"] or Decimal("0.00")
    bill_entry_net = _entry_net("PURCHASE_BILL")
    payment_entry_reduction = _entry_reduction("PAYMENT_TO_VENDOR")
    return_entry_reduction = _entry_reduction("PURCHASE_RETURN")
    debit_note_reduction = _entry_reduction("DEBIT_NOTE")

    purchase_bills = bill_entry_net if bill_entry_net != Decimal("0.00") else (
        PurchaseBill.objects.filter(vendor=vendor, status__in=[PurchaseBillStatus.APPROVED, PurchaseBillStatus.POSTED]).aggregate(total=Sum("grand_total"))["total"]
        or Decimal("0.00")
    )
    vendor_payments = payment_entry_reduction if payment_entry_reduction != Decimal("0.00") else (
        VendorPayment.objects.filter(vendor=vendor, status=VendorPaymentStatus.POSTED).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    purchase_returns = return_entry_reduction if return_entry_reduction != Decimal("0.00") else (
        PurchaseReturn.objects.filter(vendor=vendor, status=PurchaseReturnStatus.POSTED).aggregate(total=Sum("grand_total"))["total"]
        or Decimal("0.00")
    )
    debit_notes = debit_note_reduction if debit_note_reduction != Decimal("0.00") else Decimal("0.00")
    adjustments = VendorLedgerEntry.objects.filter(vendor=vendor, entry_type__in=["CREDIT_ADJUSTMENT", "MANUAL_ADJUSTMENT"]).aggregate(
        debit_total=Sum("debit"), credit_total=Sum("credit")
    )
    adjustment_net = (adjustments.get("debit_total") or Decimal("0.00")) - (adjustments.get("credit_total") or Decimal("0.00"))
    outstanding = opening + purchase_bills - vendor_payments - purchase_returns - debit_notes + adjustment_net
    return {
        "vendor_id": vendor.id,
        "opening_balance": str(opening),
        "purchase_bills": str(purchase_bills),
        "vendor_payments": str(vendor_payments),
        "purchase_returns": str(purchase_returns),
        "debit_notes": str(debit_notes),
        "adjustments": str(adjustment_net),
        "outstanding": str(outstanding),
        "semantic_note": "This project treats vendor payable increases as debit and reductions as credit in vendor ledger snapshots.",
    }


def get_vendor_purchase_summary(vendor: Vendor) -> dict:
    bills = PurchaseBill.objects.filter(vendor=vendor).order_by("-bill_date", "-id")
    summary = bills.aggregate(
        draft=Sum("grand_total", filter=Q(status=PurchaseBillStatus.DRAFT)),
        approved=Sum("grand_total", filter=Q(status=PurchaseBillStatus.APPROVED)),
        posted=Sum("grand_total", filter=Q(status=PurchaseBillStatus.POSTED)),
    )
    payments = VendorPayment.objects.filter(vendor=vendor).order_by("-payment_date", "-id")
    purchase_orders = PurchaseOrder.objects.filter(vendor=vendor).exclude(status=PurchaseOrderStatus.CANCELLED).order_by("-po_date", "-id")
    return {
        "purchase_bills_count": bills.count(),
        "purchase_bills": list(
            bills.values(
                "id",
                "bill_no",
                "bill_date",
                "status",
                "grand_total",
                "tax_mode",
            )[:200]
        ),
        "purchase_orders_count": purchase_orders.count(),
        "purchase_orders": list(purchase_orders.values("id", "po_no", "po_date", "status", "expected_date")[:200]),
        "vendor_payments_count": payments.count(),
        "vendor_payments": list(payments.values("id", "payment_no", "payment_date", "status", "amount", "reference_no")[:200]),
        "summary": {
            "draft_total": str(summary.get("draft") or Decimal("0.00")),
            "approved_total": str(summary.get("approved") or Decimal("0.00")),
            "posted_total": str(summary.get("posted") or Decimal("0.00")),
        },
    }


def get_vendor_return_summary(vendor: Vendor) -> dict:
    rows = PurchaseReturn.objects.filter(vendor=vendor).order_by("-return_date", "-id")
    totals = rows.aggregate(
        draft=Sum("grand_total", filter=Q(status=PurchaseReturnStatus.DRAFT)),
        posted=Sum("grand_total", filter=Q(status=PurchaseReturnStatus.POSTED)),
        cancelled=Sum("grand_total", filter=Q(status=PurchaseReturnStatus.CANCELLED)),
    )
    return {
        "count": rows.count(),
        "results": list(rows.values("id", "return_no", "status", "return_date", "reason", "grand_total")[:200]),
        "summary": {
            "draft_total": str(totals.get("draft") or Decimal("0.00")),
            "posted_total": str(totals.get("posted") or Decimal("0.00")),
            "cancelled_total": str(totals.get("cancelled") or Decimal("0.00")),
        },
    }
