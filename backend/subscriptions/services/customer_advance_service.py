from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Q

from accounting.services.finance_posting_service import FinancePostingService
from branch_control.services.branch_service import assigned_counter_for_user, assert_user_branch_access, assert_user_counter_access
from subscriptions.models import AuditLog, Customer, CustomerAdvance, CustomerAdvanceStatus
from subscriptions.services.audit_service import log_audit


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _advance_matches(
    advance: CustomerAdvance,
    *,
    customer_id: int,
    amount: Decimal,
    finance_account_id: int,
    method: str,
    payment_date,
    branch_id: int | None,
) -> bool:
    branch_matches = True if branch_id is None else (advance.branch_id or None) == branch_id
    return all(
        [
            advance.customer_id == customer_id,
            _money(advance.amount) == amount,
            advance.finance_account_id == finance_account_id,
            (advance.method or "").strip().upper() == method,
            advance.payment_date == payment_date,
            branch_matches,
        ]
    )


class CustomerAdvanceService:
    @staticmethod
    def _resolve_branch_and_counter(*, actor, branch_id: int | None, cash_counter_id: int | None):
        from branch_control.models import CashCounter

        counter = None
        branch = None
        if cash_counter_id is not None:
            counter = CashCounter.objects.select_related("branch", "finance_account").filter(pk=cash_counter_id, is_active=True).first()
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
        idempotency_key: str | None = None,
    ):
        normalized_amount = _money(amount)
        if normalized_amount <= Decimal("0.00"):
            raise ValueError("Advance amount must be greater than zero.")

        customer = Customer.objects.get(pk=customer_id)
        resolved_branch_id, counter = cls._resolve_branch_and_counter(actor=collected_by, branch_id=branch_id, cash_counter_id=cash_counter_id)
        finance_account = FinancePostingService.resolve_operational_finance_account(finance_account_id=finance_account_id)
        if resolved_branch_id and finance_account.branch_id and resolved_branch_id != finance_account.branch_id:
            raise ValueError("Selected finance account does not belong to the advance branch.")

        normalized_method = (method or "CASH").strip().upper()
        normalized_reference = (reference_no or "").strip() or None
        normalized_idempotency = (idempotency_key or "").strip() or None
        if not normalized_reference and normalized_idempotency:
            normalized_reference = normalized_idempotency[:100]

        duplicate_filter = Q()
        if normalized_reference:
            duplicate_filter |= Q(reference_no=normalized_reference)
        if normalized_idempotency:
            duplicate_filter |= Q(allocation_metadata__source_idempotency_key=normalized_idempotency)
        if duplicate_filter:
            existing = CustomerAdvance.objects.select_for_update().filter(duplicate_filter).order_by("id").first()
            if existing is not None:
                if _advance_matches(existing, customer_id=customer.id, amount=normalized_amount, finance_account_id=finance_account.id, method=normalized_method, payment_date=payment_date, branch_id=resolved_branch_id):
                    return existing
                raise ValueError("Customer advance reference/idempotency key already exists with different source evidence.")

        advance = CustomerAdvance.objects.create(
            customer=customer,
            finance_account=finance_account,
            branch_id=resolved_branch_id,
            cash_counter=counter,
            amount=normalized_amount,
            unapplied_amount=normalized_amount,
            method=normalized_method,
            reference_no=normalized_reference,
            payment_date=payment_date,
            notes=(note or "").strip(),
            allocation_metadata={
                "collection_mode": "UNAPPLIED_ADVANCE",
                "source_contract_phase": "F19",
                "source_idempotency_key": normalized_idempotency,
                "finance_account_id": finance_account.id,
                "finance_account_name": finance_account.name,
                "finance_chart_account_id": finance_account.chart_account_id,
                "accounting_bridge_posting_deferred": True,
                "future_bridge_phase": "F20_CUSTOMER_ADVANCE_RECEIPT",
            },
            collected_by=collected_by,
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
                "source_contract_phase": "F19",
                "accounting_bridge_posting_deferred": True,
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
