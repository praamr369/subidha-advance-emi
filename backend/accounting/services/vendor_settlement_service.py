from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from accounting.models import MONEY_ZERO, VendorSettlement, VendorSettlementStatus
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


@transaction.atomic
def post_vendor_settlement(*, vendor_settlement_id: int, posted_by):
    settlement = (
        VendorSettlement.objects.select_for_update()
        .select_related(
            "vendor",
            "finance_account",
            "finance_account__chart_account",
            "posted_journal_entry",
            "purchase_bill",
        )
        .get(pk=vendor_settlement_id)
    )
    if settlement.status == VendorSettlementStatus.POSTED and settlement.posted_journal_entry_id:
        return settlement, False
    if settlement.status == VendorSettlementStatus.CANCELLED:
        raise ValueError("Cancelled settlements cannot be posted.")

    accounts = ensure_phase3_system_accounts()
    payable_account = accounts["ACCOUNTS_PAYABLE"]
    posted_journal, _ = post_bridge_entry(
        source_instance=settlement,
        purpose="VENDOR_SETTLEMENT",
        entry_date=settlement.settlement_date,
        memo=f"Vendor settlement {settlement.settlement_no}",
        lines=[
            {
                "chart_account": payable_account,
                "description": settlement.vendor.name,
                "debit_amount": settlement.amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": settlement.finance_account.chart_account,
                "description": settlement.settlement_no,
                "debit_amount": Decimal("0.00"),
                "credit_amount": settlement.amount,
            },
        ],
        posted_by=posted_by,
    )
    settlement.posted_journal_entry = posted_journal
    settlement.status = VendorSettlementStatus.POSTED
    settlement.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_VENDOR_SETTLEMENT_POSTED",
        instance=settlement,
        performed_by=posted_by,
        metadata={
            "vendor_settlement_id": settlement.id,
            "settlement_no": settlement.settlement_no,
            "journal_entry_id": posted_journal.id,
        },
    )
    return settlement, True


@transaction.atomic
def cancel_vendor_settlement(*, vendor_settlement_id: int, performed_by, reason: str = ""):
    settlement = VendorSettlement.objects.select_for_update().get(pk=vendor_settlement_id)
    if settlement.status == VendorSettlementStatus.CANCELLED:
        return settlement, False
    if settlement.status == VendorSettlementStatus.POSTED:
        raise ValueError("Posted settlements cannot be cancelled.")
    settlement.status = VendorSettlementStatus.CANCELLED
    settlement.save(update_fields=["status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_VENDOR_SETTLEMENT_CANCELLED",
        instance=settlement,
        performed_by=performed_by,
        metadata={
            "vendor_settlement_id": settlement.id,
            "settlement_no": settlement.settlement_no,
            "reason": (reason or "").strip(),
        },
    )
    return settlement, True
