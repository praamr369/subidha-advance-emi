"""
Unified Payable Service
Aggregates every outgoing-money obligation into one queue and provides
authoritative execute paths that respect the model state machines.

Payable types:
  salary            — SalarySheet (APPROVED needs accrual post first, then payment)
  vendor_settlement — VendorSettlement (DRAFT → POSTED via post_vendor_settlement)
  commission        — Commission (PENDING → SETTLED + journals partner payable)
  expense_claim     — EmployeeExpenseClaim (APPROVED → POSTED accrual → PAID)
  credit_refund     — CustomerRefund (APPROVED/PENDING → DISBURSED + journal)
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


def _dec(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


# ──────────────────────────────────────────────────────────────────────────────
# READ — list all pending payables
# ──────────────────────────────────────────────────────────────────────────────

def _salary_payables() -> list[dict[str, Any]]:
    """
    Include APPROVED sheets (need accrual posting first) and
    POSTED/PAID_PARTIAL sheets (ready for direct payment).
    Both show up so admin can pay in one click.
    """
    from accounting.models import SalarySheet, SalarySheetStatus, SalaryPayment
    from django.db.models import Sum

    sheets = (
        SalarySheet.objects
        .select_related("employee")
        .filter(status__in=[
            SalarySheetStatus.APPROVED,
            SalarySheetStatus.POSTED,
            SalarySheetStatus.PAID_PARTIAL,
        ])
        .order_by("-year", "-month", "-id")
    )
    rows = []
    for sheet in sheets:
        paid = (
            SalaryPayment.objects
            .filter(salary_sheet_id=sheet.id)
            .aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )
        outstanding = _dec(sheet.net_amount) - _dec(paid)
        if outstanding <= MONEY_ZERO:
            continue
        emp = sheet.employee
        needs_posting = sheet.status == SalarySheetStatus.APPROVED
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
            "needs_posting": needs_posting,
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
    return [
        {
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
            "needs_posting": False,
            "date": str(s.settlement_date),
            "journal_posted": s.posted_journal_entry_id is not None,
            "notes": s.notes or "",
        }
        for s in qs
    ]


def _commission_payables() -> list[dict[str, Any]]:
    try:
        from subscriptions.models import Commission, CommissionStatus
    except ImportError:
        return []

    qs = (
        Commission.objects
        .select_related("partner", "subscription")
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
            "party_name": (party.get_full_name() or party.username) if party else "—",
            "party_type": "Partner",
            "amount": _money(getattr(c, "commission_amount", 0)),
            "outstanding": _money(getattr(c, "commission_amount", 0)),
            "status": c.status,
            "needs_posting": False,
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
        .filter(status__in=[
            ExpenseClaimStatus.APPROVED,
            ExpenseClaimStatus.POSTED,
            ExpenseClaimStatus.PAID_PARTIAL,
        ])
        .order_by("-expense_date", "-id")
    )
    rows = []
    for claim in qs:
        paid = (
            EmployeeExpenseClaimPayment.objects
            .filter(expense_claim_id=claim.id)
            .aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )
        outstanding = _dec(claim.approved_amount) - _dec(paid)
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
            "needs_posting": claim.status == ExpenseClaimStatus.APPROVED,
            "date": str(claim.expense_date),
            "journal_posted": claim.posted_journal_entry_id is not None,
            "notes": claim.notes or "",
        })
    return rows


def _credit_refund_payables() -> list[dict[str, Any]]:
    rows = []
    try:
        from billing.models import CustomerRefund
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
                "needs_posting": False,
                "date": str(getattr(r, "created_at", "")).split("T")[0],
                "journal_posted": False,
                "notes": getattr(r, "reason", "") or "",
            })
    except Exception:
        pass
    return rows


def _payout_batch_payables() -> list[dict[str, Any]]:
    """
    Include finalized payout batches that are READY (not yet PAID/CANCELLED).
    These represent bulk partner commission payouts ready for disbursement.
    """
    try:
        from subscriptions.models import CommissionPayoutBatch, CommissionPayoutBatchStatus
    except ImportError:
        return []

    qs = (
        CommissionPayoutBatch.objects
        .filter(status=CommissionPayoutBatchStatus.FINALIZED)
        .order_by("-created_at")[:100]
    )
    rows = []
    for batch in qs:
        rows.append({
            "id": f"payout_batch:{batch.id}",
            "payable_type": "payout_batch",
            "payable_type_label": "Partner Payout Batch",
            "payable_id": batch.id,
            "reference": getattr(batch, "batch_no", f"BATCH-{batch.id}"),
            "party_name": f"Batch of {getattr(batch, 'partner_count', '?')} partners",
            "party_type": "Partner Batch",
            "amount": _money(getattr(batch, "total_amount", 0)),
            "outstanding": _money(getattr(batch, "total_amount", 0)),
            "status": batch.status,
            "needs_posting": False,
            "date": str(getattr(batch, "created_at", "")).split("T")[0],
            "journal_posted": getattr(batch, "journal_entry_id", None) is not None,
            "notes": f"{getattr(batch, 'line_count', 0)} commission lines",
            "source_url": f"/admin/batches/{batch.id}",
        })
    return rows


def build_unified_payable_list(
    *,
    payable_type: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    collectors = {
        "salary": _salary_payables,
        "vendor_settlement": _vendor_settlement_payables,
        "commission": _commission_payables,
        "expense_claim": _expense_claim_payables,
        "credit_refund": _credit_refund_payables,
        "payout_batch": _payout_batch_payables,
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

    total_outstanding = sum(_dec(r["outstanding"]) for r in all_rows)
    needs_posting_count = sum(1 for r in all_rows if r.get("needs_posting"))

    type_summary: dict[str, dict] = {}
    for r in all_rows:
        t = r["payable_type"]
        if t not in type_summary:
            type_summary[t] = {"label": r["payable_type_label"], "count": 0, "total": MONEY_ZERO}
        type_summary[t]["count"] += 1
        type_summary[t]["total"] += _dec(r["outstanding"])

    return {
        "total_items": len(all_rows),
        "total_outstanding": _money(total_outstanding),
        "needs_posting_count": needs_posting_count,
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
    finance_account_id: int | None,
    amount,
    payment_date=None,
    reference_no: str = "",
    notes: str = "",
    executed_by=None,
) -> dict[str, Any]:
    date = payment_date or timezone.localdate()
    amt = _dec(amount)
    if amt <= MONEY_ZERO:
        raise ValueError("Payment amount must be greater than zero.")

    dispatch = {
        "salary": _execute_salary,
        "vendor_settlement": _execute_vendor_settlement,
        "commission": _execute_commission,
        "expense_claim": _execute_expense_claim,
        "credit_refund": _execute_credit_refund,
        "payout_batch": _execute_payout_batch,
    }
    fn = dispatch.get(payable_type)
    if fn is None:
        raise ValueError(f"Unknown payable_type: {payable_type!r}")

    return fn(
        payable_id=payable_id,
        finance_account_id=finance_account_id,
        amount=amt,
        payment_date=date,
        reference_no=reference_no,
        notes=notes,
        executed_by=executed_by,
    )


# ── Salary ────────────────────────────────────────────────────────────────────

def _execute_salary(*, payable_id, finance_account_id, amount, payment_date, reference_no, notes, executed_by):
    from accounting.models import SalarySheet, SalarySheetStatus
    from accounting.services.salary_posting_service import (
        post_salary_sheet,
        post_salary_payment,
    )

    # Auto-post accrual journal if sheet is still APPROVED
    sheet = SalarySheet.objects.select_related("employee").get(pk=payable_id)
    if sheet.status == SalarySheetStatus.APPROVED:
        sheet, _ = post_salary_sheet(salary_sheet_id=payable_id, posted_by=executed_by)

    salary_payment = post_salary_payment(
        salary_sheet_id=payable_id,
        payment_date=payment_date,
        amount=amount,
        finance_account_id=finance_account_id,
        reference_no=reference_no,
        posted_by=executed_by,
    )
    return {
        "success": True,
        "payable_type": "salary",
        "payable_id": payable_id,
        "amount_paid": _money(amount),
        "journal_entry_id": getattr(salary_payment, "posted_journal_entry_id", None),
        "accrual_journal_posted": True,
        "message": f"Salary payment ₹{amount:.2f} posted. Journal entry created for both accrual and payment.",
    }


# ── Vendor Settlement ─────────────────────────────────────────────────────────

def _execute_vendor_settlement(*, payable_id, finance_account_id, amount, payment_date, reference_no, notes, executed_by):
    from accounting.models import VendorSettlement
    from accounting.services.vendor_settlement_service import post_vendor_settlement

    # Update mutable fields before posting (inside the same transaction lock)
    VendorSettlement.objects.filter(pk=payable_id, status="DRAFT").update(
        finance_account_id=finance_account_id,
        amount=amount,
        reference_no=reference_no or "",
        settlement_date=payment_date,
    )
    settlement, _ = post_vendor_settlement(
        vendor_settlement_id=payable_id,
        posted_by=executed_by,
    )
    return {
        "success": True,
        "payable_type": "vendor_settlement",
        "payable_id": payable_id,
        "amount_paid": _money(amount),
        "journal_entry_id": settlement.posted_journal_entry_id,
        "message": f"Vendor settlement ₹{amount:.2f} posted. AP account debited, finance account credited.",
    }


# ── Commission ────────────────────────────────────────────────────────────────

def _execute_commission(*, payable_id, finance_account_id, amount, payment_date, reference_no, notes, executed_by):
    """
    Marks commission settled and posts the journal:
      DR  Partner Commission Payable (liability cleared)
      CR  Finance Account (cash/bank/UPI paid out)
    If no finance_account provided the commission is just marked settled (no accounting entry).
    """
    from subscriptions.services.commission_service import settle_commission
    from subscriptions.models import Commission

    result = settle_commission(
        commission_id=payable_id,
        settled_by=executed_by,
        settlement_date=payment_date,
        settlement_metadata={"reference_no": reference_no, "notes": notes},
    )
    commission = result.get("commission") or Commission.objects.get(pk=payable_id)
    commission_amount = _dec(getattr(commission, "commission_amount", None) or amount)

    journal_id = None
    if finance_account_id:
        from accounting.models import FinanceAccount
        from accounting.services.bridge_posting_service import post_bridge_entry
        from accounting.services.operational_accounts_service import ensure_phase3_system_accounts

        finance_account = FinanceAccount.objects.select_related("chart_account").get(pk=finance_account_id)
        accounts = ensure_phase3_system_accounts()
        posted_journal, _ = post_bridge_entry(
            source_instance=commission,
            purpose="COMMISSION_PAYOUT",
            entry_date=payment_date,
            memo=f"Commission payout #{payable_id}",
            voucher_type="COMMISSION_PAYOUT",
            source_type="COMMISSION_PAYOUT",
            source_reference=reference_no or f"COMPAY-{payable_id}",
            trace_metadata={
                "commission_id": payable_id,
                "amount": f"{commission_amount:.2f}",
                "reference_no": reference_no,
            },
            lines=[
                {
                    "chart_account": accounts["PARTNER_COMMISSION_PAYABLE"],
                    "description": f"Commission #{payable_id} settled",
                    "debit_amount": commission_amount,
                    "credit_amount": MONEY_ZERO,
                },
                {
                    "chart_account": finance_account.chart_account,
                    "description": reference_no or f"Commission payout {payable_id}",
                    "debit_amount": MONEY_ZERO,
                    "credit_amount": commission_amount,
                },
            ],
        )
        journal_id = posted_journal.id

    return {
        "success": True,
        "payable_type": "commission",
        "payable_id": payable_id,
        "amount_paid": _money(commission_amount),
        "journal_entry_id": journal_id,
        "message": f"Commission ₹{commission_amount:.2f} settled."
        + (" Journal: DR Partner Commission Payable / CR Finance Account." if journal_id else " (No journal — no finance account selected.)"),
    }


# ── Expense Claim ─────────────────────────────────────────────────────────────

def _execute_expense_claim(*, payable_id, finance_account_id, amount, payment_date, reference_no, notes, executed_by):
    """
    Correct two-step flow:
      Step 1 (if APPROVED): accrual journal DR Expense / CR Accounts Payable
                            → claim.posted_journal_entry set, status APPROVED→POSTED
      Step 2: payment journal DR Accounts Payable / CR Finance Account
              → EmployeeExpenseClaimPayment created, claim status POSTED→PAID/PAID_PARTIAL
    """
    from accounting.models import (
        EmployeeExpenseClaim,
        EmployeeExpenseClaimPayment,
        ExpenseClaimStatus,
        FinanceAccount,
    )
    from accounting.services.bridge_posting_service import post_bridge_entry
    from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
    from django.db.models import Sum as DSum

    # NB: "branch" is a nullable FK — joining it under select_for_update() breaks
    # on Postgres (FOR UPDATE cannot lock the nullable side of an outer join),
    # so lock only this row.
    claim = (
        EmployeeExpenseClaim.objects
        .select_for_update(of=("self",))
        .select_related("employee", "expense_account")
        .get(pk=payable_id)
    )
    finance_account = FinanceAccount.objects.select_related("chart_account").get(pk=finance_account_id)
    accounts = ensure_phase3_system_accounts()

    if claim.status in {ExpenseClaimStatus.PAID, ExpenseClaimStatus.REJECTED, ExpenseClaimStatus.CANCELLED}:
        raise ValueError(f"Cannot pay an expense claim in status {claim.status}.")
    if claim.status == ExpenseClaimStatus.DRAFT:
        raise ValueError("Expense claim must be approved before payment.")

    # Outstanding check
    paid_so_far = (
        EmployeeExpenseClaimPayment.objects
        .filter(expense_claim_id=claim.id)
        .aggregate(total=DSum("amount"))["total"] or MONEY_ZERO
    )
    outstanding = _dec(claim.approved_amount) - _dec(paid_so_far)
    if amount > outstanding + Decimal("0.01"):
        raise ValueError(f"Payment ₹{amount:.2f} exceeds outstanding ₹{outstanding:.2f}.")

    # ── Step 1: Accrual (APPROVED → POSTED) ──────────────────────────────────
    if claim.status == ExpenseClaimStatus.APPROVED:
        accrual_journal, _ = post_bridge_entry(
            source_instance=claim,
            purpose="EXPENSE_CLAIM_ACCRUAL",
            entry_date=claim.expense_date,
            memo=f"Expense claim {claim.claim_no} accrual — {claim.employee.name}",
            voucher_type="EXPENSE_CLAIM_ACCRUAL",
            source_type="EXPENSE_CLAIM_ACCRUAL",
            source_reference=claim.claim_no,
            trace_metadata={
                "expense_claim_id": claim.id,
                "employee_id": claim.employee_id,
                "approved_amount": f"{_dec(claim.approved_amount):.2f}",
            },
            lines=[
                {
                    "chart_account": claim.expense_account,
                    "description": f"{claim.claim_no} — {claim.category or 'expense'}",
                    "debit_amount": _dec(claim.approved_amount),
                    "credit_amount": MONEY_ZERO,
                },
                {
                    "chart_account": accounts["ACCOUNTS_PAYABLE"],
                    "description": claim.employee.name,
                    "debit_amount": MONEY_ZERO,
                    "credit_amount": _dec(claim.approved_amount),
                },
            ],
        )
        # APPROVED → POSTED: this is an allowed transition
        EmployeeExpenseClaim.objects.filter(pk=claim.id).update(
            status=ExpenseClaimStatus.POSTED,
            posted_journal_entry_id=accrual_journal.id,
        )
        claim.status = ExpenseClaimStatus.POSTED
        claim.posted_journal_entry_id = accrual_journal.id

    # ── Step 2: Payment (POSTED → PAID / PAID_PARTIAL) ───────────────────────
    payment = EmployeeExpenseClaimPayment.objects.create(
        expense_claim=claim,
        payment_date=payment_date,
        amount=amount,
        finance_account=finance_account,
        reference_no=reference_no or None,
        branch=claim.branch,
    )

    payment_journal, _ = post_bridge_entry(
        source_instance=payment,
        purpose="EXPENSE_CLAIM_PAYMENT",
        entry_date=payment_date,
        memo=f"Expense claim {claim.claim_no} payment — {claim.employee.name}",
        voucher_type="EXPENSE_CLAIM_PAYMENT",
        source_type="EXPENSE_CLAIM_PAYMENT",
        source_reference=reference_no or f"EXPPAY-{payment.id}",
        trace_metadata={
            "expense_claim_id": claim.id,
            "employee_id": claim.employee_id,
            "payment_amount": f"{amount:.2f}",
        },
        lines=[
            {
                "chart_account": accounts["ACCOUNTS_PAYABLE"],
                "description": f"{claim.claim_no} — {claim.employee.name}",
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
    EmployeeExpenseClaimPayment.objects.filter(pk=payment.id).update(
        posted_journal_entry_id=payment_journal.id
    )

    # Status transition: POSTED → PAID or PAID_PARTIAL
    new_total_paid = _dec(paid_so_far) + amount
    final_status = (
        ExpenseClaimStatus.PAID
        if new_total_paid >= _dec(claim.approved_amount)
        else ExpenseClaimStatus.PAID_PARTIAL
    )
    EmployeeExpenseClaim.objects.filter(pk=claim.id).update(status=final_status)

    return {
        "success": True,
        "payable_type": "expense_claim",
        "payable_id": payable_id,
        "amount_paid": _money(amount),
        "journal_entry_id": payment_journal.id,
        "message": (
            f"Expense claim ₹{amount:.2f} paid. "
            "Accrual (DR Expense/CR AP) + Payment (DR AP/CR Finance Account) journals posted."
        ),
    }


# ── Credit Refund ─────────────────────────────────────────────────────────────

def _execute_credit_refund(*, payable_id, finance_account_id, amount, payment_date, reference_no, notes, executed_by):
    """
    Disburses a customer refund and posts journal:
      DR  Customer Advance / AR (liability cleared)
      CR  Finance Account (cash/bank/UPI paid out)
    """
    try:
        from billing.models import CustomerRefund
        refund = CustomerRefund.objects.get(pk=payable_id)
        refund_amount = _dec(getattr(refund, "amount", amount))
    except Exception as exc:
        raise ValueError(f"Refund not found: {exc}") from exc

    journal_id = None
    if finance_account_id:
        from accounting.models import FinanceAccount
        from accounting.services.bridge_posting_service import post_bridge_entry
        from accounting.services.operational_accounts_service import ensure_phase3_system_accounts

        finance_account = FinanceAccount.objects.select_related("chart_account").get(pk=finance_account_id)
        accounts = ensure_phase3_system_accounts()
        posted_journal, _ = post_bridge_entry(
            source_instance=refund,
            purpose="CUSTOMER_REFUND_DISBURSEMENT",
            entry_date=payment_date,
            memo=f"Customer refund disbursement #{payable_id}",
            voucher_type="CUSTOMER_REFUND",
            source_type="CUSTOMER_REFUND",
            source_reference=reference_no or f"REFUND-{payable_id}",
            trace_metadata={
                "refund_id": payable_id,
                "amount": f"{refund_amount:.2f}",
                "reference_no": reference_no,
            },
            lines=[
                {
                    "chart_account": accounts["CUSTOMER_RECEIVABLE"],
                    "description": f"Refund #{payable_id} — customer credit cleared",
                    "debit_amount": refund_amount,
                    "credit_amount": MONEY_ZERO,
                },
                {
                    "chart_account": finance_account.chart_account,
                    "description": reference_no or f"Refund disbursement {payable_id}",
                    "debit_amount": MONEY_ZERO,
                    "credit_amount": refund_amount,
                },
            ],
        )
        journal_id = posted_journal.id

    CustomerRefund.objects.filter(pk=payable_id).update(status="DISBURSED")
    return {
        "success": True,
        "payable_type": "credit_refund",
        "payable_id": payable_id,
        "amount_paid": _money(refund_amount),
        "journal_entry_id": journal_id,
        "message": f"Customer refund ₹{refund_amount:.2f} disbursed."
        + (" Journal: DR Customer Receivable / CR Finance Account." if journal_id else ""),
    }


# ── Payout Batch ──────────────────────────────────────────────────────────────

def _execute_payout_batch(*, payable_id, finance_account_id, amount, payment_date, reference_no, notes, executed_by):
    """
    Marks a finalized CommissionPayoutBatch as PAID and posts the journal:
      DR  Partner Commission Payable  (clears the liability)
      CR  Finance Account             (cash / bank / UPI disbursed)
    """
    try:
        from subscriptions.models import CommissionPayoutBatch, CommissionPayoutBatchStatus
        batch = CommissionPayoutBatch.objects.get(pk=payable_id)
    except Exception as exc:
        raise ValueError(f"Payout batch not found: {exc}") from exc

    if batch.status != CommissionPayoutBatchStatus.FINALIZED:
        raise ValueError(f"Batch {payable_id} is in status {batch.status!r}, not FINALIZED.")

    journal_id = None
    if finance_account_id:
        from accounting.models import FinanceAccount
        from accounting.services.bridge_posting_service import post_bridge_entry
        from accounting.services.operational_accounts_service import ensure_phase3_system_accounts

        finance_account = FinanceAccount.objects.select_related("chart_account").get(pk=finance_account_id)
        accounts = ensure_phase3_system_accounts()
        batch_amount = _dec(getattr(batch, "total_amount", amount))

        posted_journal, _ = post_bridge_entry(
            source_instance=batch,
            purpose="PARTNER_PAYOUT_BATCH_DISBURSEMENT",
            entry_date=payment_date,
            memo=f"Partner payout batch #{payable_id} — {getattr(batch, 'batch_no', f'BATCH-{payable_id}')}",
            voucher_type="PARTNER_PAYOUT",
            source_type="PAYOUT_BATCH",
            source_reference=reference_no or getattr(batch, "batch_no", f"BATCH-{payable_id}"),
            trace_metadata={
                "batch_id": payable_id,
                "amount": f"{batch_amount:.2f}",
                "reference_no": reference_no,
            },
            lines=[
                {
                    "chart_account": accounts.get("PARTNER_COMMISSION_PAYABLE") or accounts.get("ACCOUNTS_PAYABLE"),
                    "description": f"Payout batch #{payable_id} — partner commission liability cleared",
                    "debit_amount": batch_amount,
                    "credit_amount": MONEY_ZERO,
                },
                {
                    "chart_account": finance_account.chart_account,
                    "description": reference_no or f"Payout batch disbursement {payable_id}",
                    "debit_amount": MONEY_ZERO,
                    "credit_amount": batch_amount,
                },
            ],
        )
        journal_id = posted_journal.id

    CommissionPayoutBatch.objects.filter(pk=payable_id).update(status=CommissionPayoutBatchStatus.PAID)
    return {
        "success": True,
        "payable_type": "payout_batch",
        "payable_id": payable_id,
        "amount_paid": _money(amount),
        "journal_entry_id": journal_id,
        "message": f"Partner payout batch ₹{_dec(amount):.2f} disbursed."
        + (" Journal: DR Partner Commission Payable / CR Finance Account." if journal_id else ""),
    }
