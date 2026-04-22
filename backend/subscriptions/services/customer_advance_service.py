from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from accounting.services.finance_posting_service import FinancePostingService
from branch_control.services.branch_service import (
    assigned_counter_for_user,
    assert_user_branch_access,
    assert_user_counter_access,
)
from subscriptions.models import (
    AuditLog,
    Customer,
    CustomerAdvance,
    CustomerAdvanceStatus,
)
from subscriptions.services.audit_service import log_audit


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


class CustomerAdvanceService:
    @staticmethod
    def _resolve_branch_and_counter(
        *,
        actor,
        branch_id: int | None,
        cash_counter_id: int | None,
    ):
        from branch_control.models import CashCounter

        counter = None
        branch = None
        if cash_counter_id is not None:
            counter = (
                CashCounter.objects.select_related("branch", "finance_account")
                .filter(pk=cash_counter_id, is_active=True)
                .first()
            )
            if counter is None:
                raise ValueError("Selected cash counter is not active.")
            assert_user_counter_access(user=actor, counter=counter)
            branch = counter.branch
        elif getattr(actor, "role", "") == "CASHIER":
            counter = assigned_counter_for_user(actor)
            if counter is not None:
                assert_user_counter_access(user=actor, counter=counter)
                branch = counter.branch

        resolved_branch_id = branch_id or getattr(branch, "id", None)
        if resolved_branch_id:
            assert_user_branch_access(user=actor, branch_id=resolved_branch_id)
        return resolved_branch_id, counter

    @classmethod
    @transaction.atomic
    def collect_unapplied_advance(
        cls,
        *,
        customer_id: int,
        amount,
        collected_by,
        finance_account_id: int,
        method: str = "CASH",
        reference_no: str | None = None,
        note: str | None = None,
        payment_date,
        branch_id: int | None = None,
        cash_counter_id: int | None = None,
    ):
        normalized_amount = _money(amount)
        if normalized_amount <= Decimal("0.00"):
            raise ValueError("Advance amount must be greater than zero.")

        customer = Customer.objects.get(pk=customer_id)
        resolved_branch_id, counter = cls._resolve_branch_and_counter(
            actor=collected_by,
            branch_id=branch_id,
            cash_counter_id=cash_counter_id,
        )
        finance_account = FinancePostingService.resolve_operational_finance_account(
            finance_account_id=finance_account_id,
        )
        if resolved_branch_id and finance_account.branch_id and resolved_branch_id != finance_account.branch_id:
            raise ValueError("Selected finance account does not belong to the advance branch.")

        advance = CustomerAdvance.objects.create(
            customer=customer,
            finance_account=finance_account,
            branch_id=resolved_branch_id,
            cash_counter=counter,
            amount=normalized_amount,
            unapplied_amount=normalized_amount,
            method=(method or "CASH").strip().upper(),
            reference_no=(reference_no or "").strip() or None,
            payment_date=payment_date,
            notes=(note or "").strip(),
            allocation_metadata={
                "collection_mode": "UNAPPLIED_ADVANCE",
                "finance_account_id": finance_account.id,
                "finance_chart_account_id": finance_account.chart_account_id,
            },
            collected_by=collected_by,
        )
        FinancePostingService.post_customer_advance_collection(
            advance=advance,
            finance_account=finance_account,
            performed_by=collected_by,
        )
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=advance,
            performed_by=collected_by,
            metadata={
                "event": "CUSTOMER_ADVANCE_COLLECTED",
                "customer_advance_id": advance.id,
                "customer_id": customer.id,
                "finance_account_id": finance_account.id,
                "amount": str(advance.amount),
                "reference_no": advance.reference_no,
            },
        )
        return advance

    @staticmethod
    def refresh_status(advance: CustomerAdvance) -> CustomerAdvance:
        if advance.unapplied_amount <= Decimal("0.00"):
            advance.status = CustomerAdvanceStatus.FULLY_APPLIED
        elif advance.unapplied_amount < advance.amount:
            advance.status = CustomerAdvanceStatus.PARTIALLY_APPLIED
        else:
            advance.status = CustomerAdvanceStatus.UNAPPLIED
        advance.save(update_fields=["status"])
        return advance
