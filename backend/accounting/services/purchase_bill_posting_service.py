from __future__ import annotations

from django.db import transaction

from accounting.services.journal_posting_service import _log_accounting_event
from inventory.models import PurchaseBill, PurchaseBillStatus
from inventory.services.stock_service import post_purchase_bill


@transaction.atomic
def approve_purchase_bill(*, purchase_bill_id: int, approved_by):
    purchase_bill = PurchaseBill.objects.select_for_update().get(pk=purchase_bill_id)
    if purchase_bill.status == PurchaseBillStatus.APPROVED:
        return purchase_bill, False
    if purchase_bill.status in {PurchaseBillStatus.POSTED, PurchaseBillStatus.CANCELLED}:
        raise ValueError("Only draft purchase bills can be approved.")

    purchase_bill.status = PurchaseBillStatus.APPROVED
    purchase_bill.save(update_fields=["status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_PURCHASE_BILL_APPROVED",
        instance=purchase_bill,
        performed_by=approved_by,
        metadata={
            "purchase_bill_id": purchase_bill.id,
            "bill_no": purchase_bill.bill_no,
        },
    )
    return purchase_bill, True


@transaction.atomic
def post_purchase_bill_from_accounting(*, purchase_bill_id: int, posted_by):
    return post_purchase_bill(purchase_bill_id=purchase_bill_id, posted_by=posted_by)


@transaction.atomic
def cancel_purchase_bill(*, purchase_bill_id: int, performed_by, reason: str = ""):
    purchase_bill = PurchaseBill.objects.select_for_update().get(pk=purchase_bill_id)
    if purchase_bill.status == PurchaseBillStatus.CANCELLED:
        return purchase_bill, False
    if purchase_bill.status == PurchaseBillStatus.POSTED:
        raise ValueError("Posted purchase bills cannot be cancelled.")
    purchase_bill.status = PurchaseBillStatus.CANCELLED
    purchase_bill.notes = "\n".join(
        filter(
            None,
            [
                (purchase_bill.notes or "").strip(),
                (reason or "").strip(),
            ],
        )
    )
    purchase_bill.save(update_fields=["status", "notes", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_PURCHASE_BILL_CANCELLED",
        instance=purchase_bill,
        performed_by=performed_by,
        metadata={
            "purchase_bill_id": purchase_bill.id,
            "bill_no": purchase_bill.bill_no,
        },
    )
    return purchase_bill, True
