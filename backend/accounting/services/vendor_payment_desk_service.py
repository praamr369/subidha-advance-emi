"""Vendor payment desk: pay bills, pay advances, apply advances — from the vendor page.

All money moves through VendorSettlement + post_vendor_settlement (Dr Accounts
Payable / Cr the chosen Cash/Bank account), so the journal, vendor ledger and
outstanding stay on one path. Guards:

* a bill payment can't exceed that bill's outstanding;
* bill payments together can't exceed what the vendor is owed net of any
  unapplied advance (pay the rest by applying the advance);
* an advance is not capped — it leaves the vendor with a debit balance that
  future bills consume;
* applying an advance can't exceed the unapplied advance or the bill's
  outstanding, and moves no money.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.models import (
    MONEY_ZERO,
    FinanceAccount,
    Vendor,
    VendorAdvanceAllocation,
    VendorSettlement,
    VendorSettlementStatus,
)
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.vendor_ledger_service import get_vendor_outstanding
from accounting.services.vendor_settlement_service import post_vendor_settlement, purchase_bill_outstanding
from inventory.models import PurchaseBill, PurchaseBillStatus


def _money(value) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, "") else "0")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise ValidationError({"amount": f"'{value}' is not a valid amount."})


def advance_balance(vendor: Vendor) -> Decimal:
    paid = (
        VendorSettlement.objects.filter(vendor=vendor, is_advance=True, status=VendorSettlementStatus.POSTED)
        .aggregate(total=Sum("amount"))["total"]
        or MONEY_ZERO
    )
    applied = (
        VendorAdvanceAllocation.objects.filter(vendor=vendor).aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
    )
    return max(_money(paid) - _money(applied), MONEY_ZERO)


def _net_outstanding(vendor: Vendor) -> Decimal:
    return _money(get_vendor_outstanding(vendor)["outstanding"])


def _payout_accounts():
    return FinanceAccount.objects.filter(is_active=True, is_real_settlement_account=True).order_by("kind", "name")


def build_vendor_payment_desk(vendor: Vendor) -> dict:
    bills = []
    for bill in PurchaseBill.objects.filter(vendor=vendor, status=PurchaseBillStatus.POSTED).order_by("bill_date", "id"):
        outstanding = purchase_bill_outstanding(bill)
        if outstanding <= MONEY_ZERO:
            continue
        bills.append(
            {
                "id": bill.id,
                "bill_no": bill.bill_no,
                "bill_date": bill.bill_date.isoformat() if bill.bill_date else None,
                "grand_total": f"{_money(bill.grand_total):.2f}",
                "outstanding": f"{outstanding:.2f}",
                "type": "modern",
            }
        )
    # Fetch legacy vendor bills
    VendorBill = __import__("inventory.models", fromlist=["VendorBill"]).VendorBill
    VendorPayment = __import__("inventory.models", fromlist=["VendorPayment"]).VendorPayment
    for bill in VendorBill.objects.filter(vendor=vendor, status="POSTED").order_by("bill_date", "id"):
        paid = VendorPayment.objects.filter(vendor_bill_id=bill.id, status="POSTED").aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        outstanding = max(_money(bill.grand_total) - _money(paid), MONEY_ZERO)
        if outstanding <= MONEY_ZERO:
            continue
        bills.append(
            {
                "id": bill.id,
                "bill_no": bill.bill_no,
                "bill_date": bill.bill_date.isoformat() if bill.bill_date else None,
                "grand_total": f"{_money(bill.grand_total):.2f}",
                "outstanding": f"{outstanding:.2f}",
                "type": "legacy",
            }
        )
    bills.sort(key=lambda b: b["bill_date"] or "", reverse=True)

    net = _net_outstanding(vendor)
    recent = (
        VendorSettlement.objects.filter(vendor=vendor)
        .exclude(status=VendorSettlementStatus.CANCELLED)
        .select_related("purchase_bill", "finance_account", "posted_journal_entry")
        .order_by("-settlement_date", "-id")[:15]
    )
    return {
        "vendor_id": vendor.id,
        "net_outstanding": f"{net:.2f}",
        "payable_now": f"{max(net, MONEY_ZERO):.2f}",
        "advance_balance": f"{advance_balance(vendor):.2f}",
        "open_bills_total": f"{sum((Decimal(b['outstanding']) for b in bills), MONEY_ZERO):.2f}",
        "open_bills": bills,
        "finance_accounts": [
            {"id": fa.id, "name": fa.name, "kind": fa.kind} for fa in _payout_accounts()
        ],
        "recent_payments": [
            {
                "id": s.id,
                "settlement_no": s.settlement_no,
                "settlement_date": s.settlement_date.isoformat(),
                "amount": f"{_money(s.amount):.2f}",
                "is_advance": s.is_advance,
                "purchase_bill_no": getattr(s.purchase_bill, "bill_no", None),
                "finance_account_name": getattr(s.finance_account, "name", None),
                "status": s.status,
                "journal_entry_no": getattr(s.posted_journal_entry, "entry_no", None),
                "reference_no": s.reference_no or "",
            }
            for s in recent
        ],
    }


def _finance_account(finance_account_id) -> FinanceAccount:
    account = FinanceAccount.objects.filter(pk=finance_account_id or 0).first() if str(finance_account_id or "").isdigit() else None
    if account is None:
        raise ValidationError({"finance_account_id": "Pick the Cash/Bank account the payment is made from."})
    if not account.is_active or not account.is_real_settlement_account:
        raise ValidationError({"finance_account_id": "Pick an active cash, bank or UPI settlement account."})
    return account


def _date(value):
    if not value:
        return timezone.localdate()
    from datetime import date

    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ValidationError({"payment_date": "Use a YYYY-MM-DD date."})


def _clean_allocations(vendor: Vendor, allocations) -> list[tuple[object, Decimal, bool]]:
    rows = []
    seen = set()
    VendorBill = __import__("inventory.models", fromlist=["VendorBill"]).VendorBill
    VendorPayment = __import__("inventory.models", fromlist=["VendorPayment"]).VendorPayment
    for raw in allocations or []:
        amount = _money((raw or {}).get("amount"))
        if amount <= MONEY_ZERO:
            continue
        bill_id = int((raw or {}).get("purchase_bill_id") or (raw or {}).get("bill_id") or 0)
        is_legacy = (raw or {}).get("type") == "legacy"
        key = (bill_id, is_legacy)
        if key in seen:
            raise ValidationError({"allocations": "Each bill can appear once."})
        seen.add(key)
        if is_legacy:
            bill = VendorBill.objects.select_for_update().filter(pk=bill_id, vendor=vendor).first()
        else:
            bill = PurchaseBill.objects.select_for_update().filter(pk=bill_id, vendor=vendor).first()
        if bill is None:
            raise ValidationError({"allocations": f"Bill {bill_id} does not belong to this vendor."})
        if bill.status != "POSTED":
            raise ValidationError({"allocations": f"Bill {bill.bill_no} is not posted yet."})
        
        if is_legacy:
            paid = VendorPayment.objects.filter(vendor_bill_id=bill.id, status="POSTED").aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
            outstanding = max(_money(bill.grand_total) - _money(paid), MONEY_ZERO)
        else:
            outstanding = purchase_bill_outstanding(bill)
            
        if amount > outstanding:
            raise ValidationError(
                {"allocations": f"₹{amount:.2f} is more than bill {bill.bill_no}'s outstanding ₹{outstanding:.2f}."}
            )
        rows.append((bill, amount, is_legacy))
    if not rows:
        raise ValidationError({"allocations": "Enter an amount for at least one bill."})
    return rows


def _post(settlement: VendorSettlement, posted_by) -> VendorSettlement:
    try:
        settlement, _ = post_vendor_settlement(vendor_settlement_id=settlement.pk, posted_by=posted_by)
    except ValueError as exc:
        raise ValidationError({"detail": str(exc)}) from exc
    return settlement


@transaction.atomic
def pay_vendor_bills(
    *, vendor_id: int, allocations, finance_account_id, posted_by, payment_date=None, reference_no: str = "", notes: str = ""
) -> dict:
    vendor = Vendor.objects.select_for_update().get(pk=vendor_id)
    account = _finance_account(finance_account_id)
    rows = _clean_allocations(vendor, allocations)
    total = sum((amount for _, amount, _ in rows), MONEY_ZERO)
    payable = max(_net_outstanding(vendor), MONEY_ZERO)
    if total > payable:
        advance = advance_balance(vendor)
        hint = f" Apply the ₹{advance:.2f} advance to these bills instead." if advance > MONEY_ZERO else ""
        raise ValidationError(
            {"allocations": f"₹{total:.2f} is more than the ₹{payable:.2f} this vendor is owed.{hint}"}
        )
    when = _date(payment_date)
    posted = []
    VendorPayment = __import__("inventory.models", fromlist=["VendorPayment"]).VendorPayment
    post_vendor_payment = __import__("inventory.services.procurement_service", fromlist=["post_vendor_payment"]).post_vendor_payment

    for bill, amount, is_legacy in rows:
        if is_legacy:
            payment = VendorPayment.objects.create(
                vendor=vendor,
                vendor_bill=bill,
                payment_date=when,
                amount=amount,
                finance_account=account,
                reference_no=(reference_no or "").strip() or None,
                notes=(notes or "").strip() or f"Paid from vendor page against {bill.bill_no}.",
            )
            payment, _ = post_vendor_payment(vendor_payment_id=payment.id, posted_by=posted_by)
            posted.append({
                "id": payment.id, 
                "settlement_no": payment.payment_no, 
                "amount": f"{_money(payment.amount):.2f}",
                "journal_entry_no": getattr(payment.posted_journal_entry, "entry_no", None)
            })
        else:
            settlement = VendorSettlement.objects.create(
                vendor=vendor,
                purchase_bill=bill,
                settlement_date=when,
                amount=amount,
                finance_account=account,
                branch_id=account.branch_id,
                reference_no=(reference_no or "").strip() or None,
                notes=(notes or "").strip() or f"Paid from vendor page against {bill.bill_no}.",
            )
            settlement = _post(settlement, posted_by)
            posted.append({
                "id": settlement.id, 
                "settlement_no": settlement.settlement_no, 
                "amount": f"{_money(settlement.amount):.2f}",
                "journal_entry_no": getattr(settlement.posted_journal_entry, "entry_no", None)
            })
    return {
        "paid_total": f"{total:.2f}",
        "settlements": posted,
        "desk": build_vendor_payment_desk(vendor),
    }


@transaction.atomic
def pay_vendor_advance(
    *, vendor_id: int, amount, finance_account_id, posted_by, payment_date=None, reference_no: str = "", notes: str = ""
) -> dict:
    vendor = Vendor.objects.select_for_update().get(pk=vendor_id)
    account = _finance_account(finance_account_id)
    amount_q = _money(amount)
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Advance amount must be greater than zero."})
    settlement = VendorSettlement.objects.create(
        vendor=vendor,
        is_advance=True,
        settlement_date=_date(payment_date),
        amount=amount_q,
        finance_account=account,
        branch_id=account.branch_id,
        reference_no=(reference_no or "").strip() or None,
        notes=(notes or "").strip() or "Advance for future purchases (vendor page).",
    )
    settlement = _post(settlement, posted_by)
    return {
        "settlement_no": settlement.settlement_no,
        "amount": f"{amount_q:.2f}",
        "journal_entry_no": getattr(settlement.posted_journal_entry, "entry_no", None),
        "desk": build_vendor_payment_desk(vendor),
    }


@transaction.atomic
def apply_vendor_advance(*, vendor_id: int, allocations, performed_by, notes: str = "") -> dict:
    vendor = Vendor.objects.select_for_update().get(pk=vendor_id)
    rows = _clean_allocations(vendor, allocations)
    total = sum((amount for _, amount, _ in rows), MONEY_ZERO)
    available = advance_balance(vendor)
    if total > available:
        raise ValidationError({"allocations": f"₹{total:.2f} is more than the ₹{available:.2f} advance available."})

    for _, _, is_legacy in rows:
        if is_legacy:
            raise ValidationError({"allocations": "Applying advance to legacy Vendor Bills is not supported."})

    # Oldest advances are used first.
    pools = []
    for adv in VendorSettlement.objects.filter(
        vendor=vendor, is_advance=True, status=VendorSettlementStatus.POSTED
    ).order_by("settlement_date", "id"):
        used = adv.advance_allocations.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        left = _money(adv.amount) - _money(used)
        if left > MONEY_ZERO:
            pools.append([adv, left])

    today = timezone.localdate()
    created = []
    for bill, amount, _ in rows:
        remaining = amount
        for pool in pools:
            if remaining <= MONEY_ZERO:
                break
            take = min(pool[1], remaining)
            if take <= MONEY_ZERO:
                continue
            created.append(
                VendorAdvanceAllocation.objects.create(
                    vendor=vendor,
                    advance=pool[0],
                    purchase_bill=bill,
                    amount=take,
                    allocation_date=today,
                    notes=(notes or "").strip(),
                )
            )
            pool[1] -= take
            remaining -= take
    _log_accounting_event(
        event="ACCOUNTING_VENDOR_ADVANCE_APPLIED",
        instance=vendor,
        performed_by=performed_by,
        metadata={
            "vendor_id": vendor.id,
            "total": f"{total:.2f}",
            "allocation_ids": [a.id for a in created],
            "bills": [bill.bill_no for bill, _, _ in rows],
        },
    )
    return {"applied_total": f"{total:.2f}", "desk": build_vendor_payment_desk(vendor)}
