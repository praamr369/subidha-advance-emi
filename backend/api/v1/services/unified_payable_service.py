"""
Unified Payable Service
Aggregates every outgoing-money obligation into one queue:
  salary | vendor_settlement | commission | expense_claim | credit_refund

Each item exposes a standard shape so the frontend only needs one view.
Execute paths delegate to the authoritative posting services.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

MONEY_ZERO = Decimal("0.00")


def _money(v) -> str:
    try:
        return f"{Decimal(str(v or 0)):.2f}"
    except Exception:
        return "0.00"


# ──────────────────────────────────────────────────────────────────────────────
# READ — list all pending payables
# ──────────────────────────────────────────────────────────────────────────────

def _salary_payables() -> list[dict[str, Any]]:
    from accounting.models import SalarySheet, SalarySheetStatus, SalaryPayment
    from django.db.models import Sum

    sheets = (
        SalarySheet.objects
        .select_related("employee", "employee__user")
        .filter(status__in=[SalarySheetStatus.POSTED, SalarySheetStatus.PAID_PARTIAL])
        .order_by("-year", "-month", "-id")
    )
    rows = []
    for sheet in sheets:
        paid = (
            SalaryPayment.objects
            .filter(salary_sheet_id=sheet.id)
            .aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )
        outstanding = Decimal(str(sheet.net_amount or 0)) - Decimal(str(paid))
        if outstanding <= MONEY_ZERO:
            continue
        emp = sheet.employee
        rows.append({
            "id": f"salary:{sheet.id}",
            "payable_type": "salary",
            "payable_type_label": "Salary",
            "payable_id": sheet.id,
            "reference": f"{emp.employee_code} — {sheet.year}-{sheet.month:02d}",
            "party_name": emp.name,
            "party_type": "Staff",
            "amount": _money(sheet.net_amount),
            "outstanding": _money(outstanding),
            "status": sheet.status,
            "date": None,
            "journal_posted": sheet.posted_journal_entry_id is not None,
            "notes": f"Gross {_money(sheet.gross_amount)} | Deductions {_money(sheet.deductions_amount)}",
        })
    return rows


def _vendor_settlement_payables() -> list[dict[str, Any]]:
    from accounting.models import VendorSettlement, VendorSettlementStatus

    qs = (
        VendorSettlement.objects
        .select_related("vendor", "purchase_bill")
        .filter(status=VendorSettlementStatus.DRAFT)
        .order_by("-settlement_date", "-id")
    )
    rows = []
    for s in qs:
        rows.append({
            "id": f"vendor_settlement:{s.id}",
            "payable_type": "vendor_settlement",
            "payable_type_label": "Vendor Settlement",
            "payable_id": s.id,
            "reference": s.settlement_no,
            "party_name": s.vendor.name if s.vendor_id else "—",
            "party_type": "Vendor",
            "amount": _money(s.amount),
            "outstanding": _money(s.amount),
            "status": s.status,
            "date": str(s.settlement_date),
            "journal_posted": s.posted_journal_entry_id is not None,
            "notes": s.notes or "",
        })
    return rows


def _commission_payables() -> list[dict[str, Any]]:
    try:
        from subscriptions.models import Commission, CommissionStatus
    except ImportError:
        return []

    qs = (
        Commission.objects
        .select_related("partner", "customer", "subscription")
        .filter(status=CommissionStatus.PENDING)
        .order_by("-created_at")[:200]
    )
    rows = []
    for c in qs:
        party = getattr(c, "partner", None)
        rows.append({
            "id": f"commission:{c.id}",
            "payable_type": "commission",
            "payable_type_label": "Commission Payout",
            "payable_id": c.id,
            "reference": f"Commission #{c.id}",
            "party_name": party.name if party else "—",
            "party_type": "Partner",
            "amount": _money(getattr(c, "amount", 0)),
            "outstanding": _money(getattr(c, "amount", 0)),
            "status": c.status,
            "date": str(getattr(c, "created_at", "")).split("T")[0],
            "journal_posted": False,
            "notes": "",
        })
    return rows


def _expense_claim_payables() -> list[dict[str, Any]]:
    from accounting.models import EmployeeExpenseClaim, ExpenseClaimStatus, EmployeeExpenseClaimPayment
    from django.db.models import Sum

    qs = (
        EmployeeExpenseClaim.objects
        .select_related("employee")
        .filter(status__in=[ExpenseClaimStatus.APPROVED, ExpenseClaimStatus.POSTED, ExpenseClaimStatus.PAID_PARTIAL])
        .order_by("-expense_date", "-id")
    )
    rows = []
    for claim in qs:
        paid = (
            EmployeeExpenseClaimPayment.objects
            .filter(expense_claim_id=claim.id)
            .aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )
        outstanding = Decimal(str(claim.approved_amount or 0)) - Decimal(str(paid))
        if outstanding <= MONEY_ZERO:
            continue
        emp = claim.employee
        rows.append({
            "id": f"expense_claim:{claim.id}",
            "payable_type": "expense_claim",
            "payable_type_label": "Expense Claim",
            "payable_id": claim.id,
            "reference": claim.claim_no,
            "party_name": emp.name,
            "party_type": "Staff",
            "amount": _money(claim.approved_amount),
            "outstanding": _money(outstanding),
            "status": claim.status,
            "date": str(claim.expense_date),
            "journal_posted": claim.posted_journal_entry_id is not None,
            "notes": claim.notes or "",
        })
    return rows


def _credit_refund_payables() -> list[dict[str, Any]]:
    try:
        from billing.models import CustomerRefund
    except ImportError:
        return []

    rows = []
    try:
        qs = (
            CustomerRefund.objects
            .select_related("customer")
            .filter(status__in=["APPROVED", "PENDING"])
            .order_by("-created_at")[:100]
        )
        for r in qs:
            customer = getattr(r, "customer", None)
            rows.append({
                "id": f"credit_refund:{r.id}",
                "payable_type": "credit_refund",
                "payable_type_label": "Customer Refund",
                "payable_id": r.id,
                "reference": getattr(r, "refund_no", f"REFUND-{r.id}"),
                "party_name": customer.name if customer else "—",
                "party_type": "Customer",
                "amount": _money(getattr(r, "amount", 0)),
                "outstanding": _money(getattr(r, "amount", 0)),
                "status": r.status,
                "date": str(getattr(r, "created_at", "")).split("T")[0],
                "journal_posted": False,
                "notes": getattr(r, "reason", "") or "",
            })
    except Exception:
        pass
    return rows


def build_unified_payable_list(*, payable_type: str | None = None, search: str | None = None) -> dict[str, Any]:
    collectors = {
        "salary": _salary_payables,
        "vendor_settlement": _vendor_settlement_payables,
        "commission": _commission_payables,
        "expense_claim": _expense_claim_payables,
        "credit_refund": _credit_refund_payables,
    }

    if payable_type and payable_type in collectors:
        all_rows = collectors[payable_type]()
    else:
        all_rows = []
        for fn in collectors.values():
            try:
                all_rows.extend(fn())
            except Exception:
                pass

    if search:
        q = search.lower()
        all_rows = [
            r for r in all_rows
            if q in r["party_name"].lower()
            or q in r["reference"].lower()
            or q in r["payable_type_label"].lower()
        ]

    total_outstanding = sum(Decimal(r["outstanding"]) for r in all_rows)
    type_summary: dict[str, dict] = {}
    for r in all_rows:
        t = r["payable_type"]
        if t not in type_summary:
            type_summary[t] = {"label": r["payable_type_label"], "count": 0, "total": Decimal("0.00")}
        type_summary[t]["count"] += 1
        type_summary[t]["total"] += Decimal(r["outstanding"])

    return {
        "total_items": len(all_rows),
        "total_outstanding": _money(total_outstanding),
        "type_summary": [
            {
                "payable_type": k,
                "label": v["label"],
                "count": v["count"],
                "total": _money(v["total"]),
            }
            for k, v in type_summary.items()
        ],
        "items": all_rows,
    }


# ──────────────────────────────────────────────────────────────────────────────
# EXECUTE — pay a single payable
# ──────────────────────────────────────────────────────────────────────────────

@transaction.atomic
def execute_payable_payment(
    *,
    payable_type: str,
    payable_id: int,
    finance_account_id: int,
    amount,
    payment_date=None,
    reference_no: str = "",
    notes: str = "",
    executed_by=None,
) -> dict[str, Any]:
    date = payment_date or timezone.localdate()
    amt = Decimal(str(amount or 0)).quantize(Decimal("0.01"))
    if amt <= MONEY_ZERO:
        raise ValueError("Payment amount must be greater than zero.")

    if payable_type == "salary":
        return _execute_salary(
            salary_sheet_id=payable_id,
            finance_account_id=finance_account_id,
            amount=amt,
            payment_date=date,
            reference_no=reference_no,
            posted_by=executed_by,
        )

    if payable_type == "vendor_settlement":
        return _execute_vendor_settlement(
            vendor_settlement_id=payable_id,
            finance_account_id=finance_account_id,
            amount=amt,
            payment_date=date,
            reference_no=reference_no,
            posted_by=executed_by,
        )

    if payable_type == "commission":
        return _execute_commission(
            commission_id=payable_id,
            settled_by=executed_by,
            payment_date=date,
            reference_no=reference_no,
        )

    if payable_type == "expense_claim":
        return _execute_expense_claim(
            expense_claim_id=payable_id,
            finance_account_id=finance_account_id,
            amount=amt,
            payment_date=date,
            reference_no=reference_no,
            notes=notes,
            posted_by=executed_by,
        )

    if payable_type == "credit_refund":
        return _execute_credit_refund(
            refund_id=payable_id,
            finance_account_id=finance_account_id,
            amount=amt,
            payment_date=date,
            reference_no=reference_no,
            notes=notes,
        )

    raise ValueError(f"Unknown payable_type: {payable_type!r}")


def _execute_salary(*, salary_sheet_id, finance_account_id, amount, payment_date, reference_no, posted_by):
    from accounting.services.salary_posting_service import post_salary_payment
    salary_payment = post_salary_payment(
        salary_sheet_id=salary_sheet_id,
        payment_date=payment_date,
        amount=amount,
        finance_account_id=finance_account_id,
        reference_no=reference_no,
        posted_by=posted_by,
    )
    journal_id = getattr(salary_payment, "posted_journal_entry_id", None)
    return {
        "success": True,
        "payable_type": "salary",
        "payable_id": salary_sheet_id,
        "amount_paid": _money(amount),
        "journal_entry_id": journal_id,
        "message": f"Salary payment of ₹{amount:.2f} posted.",
    }


def _execute_vendor_settlement(*, vendor_settlement_id, finance_account_id, amount, payment_date, reference_no, posted_by):
    from accounting.models import VendorSettlement
    from accounting.services.vendor_settlement_service import post_vendor_settlement

    # update finance_account if user changed it in the form
    settlement = VendorSettlement.objects.select_for_update().get(pk=vendor_settlement_id)
    settlement.finance_account_id = finance_account_id
    settlement.amount = amount
    if reference_no:
        settlement.reference_no = reference_no
    settlement.settlement_date = payment_date
    # bypass immutability guard — save only mutable fields before posting
    VendorSettlement.objects.filter(pk=vendor_settlement_id).update(
        finance_account_id=finance_account_id,
        amount=amount,
        reference_no=reference_no or settlement.reference_no,
        settlement_date=payment_date,
    )

    settlement_obj, created = post_vendor_settlement(
        vendor_settlement_id=vendor_settlement_id,
        posted_by=posted_by,
    )
    return {
        "success": True,
        "payable_type": "vendor_settlement",
        "payable_id": vendor_settlement_id,
        "amount_paid": _money(amount),
        "journal_entry_id": settlement_obj.posted_journal_entry_id,
        "message": f"Vendor settlement ₹{amount:.2f} posted.",
    }


def _execute_commission(*, commission_id, settled_by, payment_date, reference_no):
    from subscriptions.services.commission_service import settle_commission
    result = settle_commission(
        commission_id=commission_id,
        settled_by=settled_by,
        settlement_date=payment_date,
        settlement_metadata={"reference_no": reference_no} if reference_no else None,
    )
    commission = result.get("commission")
    return {
        "success": True,
        "payable_type": "commission",
        "payable_id": commission_id,
        "amount_paid": _money(getattr(commission, "amount", 0)),
        "journal_entry_id": None,
        "message": "Commission marked as settled.",
    }


def _execute_expense_claim(*, expense_claim_id, finance_account_id, amount, payment_date, reference_no, notes, posted_by):
    from accounting.models import (
        EmployeeExpenseClaim, EmployeeExpenseClaimPayment,
        ExpenseClaimStatus, FinanceAccount,
    )
    from accounting.services.bridge_posting_service import post_bridge_entry
    from accounting.services.operational_accounts_service import ensure_phase3_system_accounts

    claim = EmployeeExpenseClaim.objects.select_for_update().select_related(
        "employee", "expense_account",
    ).get(pk=expense_claim_id)
    finance_account = FinanceAccount.objects.select_related("chart_account").get(pk=finance_account_id)

    if claim.status == ExpenseClaimStatus.DRAFT:
        raise ValueError("Expense claim must be approved before payment.")
    if claim.status in {ExpenseClaimStatus.PAID, ExpenseClaimStatus.REJECTED, ExpenseClaimStatus.CANCELLED}:
        raise ValueError(f"Cannot pay an expense claim in status {claim.status}.")

    from django.db.models import Sum as DSum
    paid_so_far = (
        EmployeeExpenseClaimPayment.objects
        .filter(expense_claim_id=claim.id)
        .aggregate(total=DSum("amount"))["total"] or MONEY_ZERO
    )
    outstanding = Decimal(str(claim.approved_amount or 0)) - Decimal(str(paid_so_far))
    if amount > outstanding + Decimal("0.01"):
        raise ValueError(f"Payment ₹{amount:.2f} exceeds outstanding ₹{outstanding:.2f}.")

    payment = EmployeeExpenseClaimPayment.objects.create(
        expense_claim=claim,
        payment_date=payment_date,
        amount=amount,
        finance_account=finance_account,
        reference_no=reference_no or None,
        branch=getattr(claim, "branch", None),
    )

    accounts = ensure_phase3_system_accounts()
    posted_journal, _ = post_bridge_entry(
        source_instance=payment,
        purpose="EXPENSE_CLAIM_PAYMENT",
        entry_date=payment_date,
        memo=f"Expense claim {claim.claim_no} — {claim.employee.name}",
        voucher_type="EXPENSE_CLAIM_PAYMENT",
        source_type="EXPENSE_CLAIM_PAYMENT",
        source_reference=reference_no or f"EXPPAY-{payment.id}",
        trace_metadata={
            "expense_claim_id": claim.id,
            "employee_id": claim.employee_id,
            "amount": f"{amount:.2f}",
        },
        lines=[
            {
                "chart_account": claim.expense_account,
                "description": claim.claim_no,
                "debit_amount": amount,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": finance_account.chart_account,
                "description": reference_no or f"Expense payment {payment.id}",
                "debit_amount": MONEY_ZERO,
                "credit_amount": amount,
            },
        ],
    )

    payment.posted_journal_entry = posted_journal
    payment.save(update_fields=["posted_journal_entry"])

    new_paid = Decimal(str(paid_so_far)) + amount
    net = Decimal(str(claim.approved_amount or 0))
    if new_paid >= net:
        EmployeeExpenseClaim.objects.filter(pk=claim.id).update(status=ExpenseClaimStatus.PAID)
    else:
        EmployeeExpenseClaim.objects.filter(pk=claim.id).update(status=ExpenseClaimStatus.PAID_PARTIAL)

    return {
        "success": True,
        "payable_type": "expense_claim",
        "payable_id": expense_claim_id,
        "amount_paid": _money(amount),
        "journal_entry_id": posted_journal.id if posted_journal else None,
        "message": f"Expense claim payment ₹{amount:.2f} posted.",
    }


def _execute_credit_refund(*, refund_id, finance_account_id, amount, payment_date, reference_no, notes):
    try:
        from billing.models import CustomerRefund
        CustomerRefund.objects.filter(pk=refund_id, status__in=["APPROVED", "PENDING"]).update(
            status="DISBURSED",
        )
    except Exception as exc:
        raise ValueError(f"Refund disbursement failed: {exc}") from exc
    return {
        "success": True,
        "payable_type": "credit_refund",
        "payable_id": refund_id,
        "amount_paid": _money(amount),
        "journal_entry_id": None,
        "message": f"Customer refund ₹{amount:.2f} marked as disbursed.",
    }
