from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.services.finance_posting_service import FinancePostingService
from subscriptions.models import (
    AuditLog,
    CustomerAdvance,
    CustomerAdvanceAllocation,
    Emi,
    FinancialLedger,
    LedgerEntryType,
    Payment,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_service import (
    _create_ledger_entry,
    _reconcile_after_payment,
    _sync_billing_best_effort,
    _upsert_payment_reconciliation,
    _emi_outstanding_amount,
)
from services.payments.allocate_payment import allocate_payment


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


class PaymentAllocationService:
    @classmethod
    @transaction.atomic
    def allocate_customer_advance(
        cls,
        *,
        customer_advance_id: int,
        emi_id: int,
        amount,
        allocated_by,
        note: str | None = None,
        reference_no: str | None = None,
        allocation_date=None,
    ):
        allocation_amount = _money(amount)
        if allocation_amount <= Decimal("0.00"):
            raise ValueError("Allocation amount must be greater than zero.")

        advance = (
            CustomerAdvance.objects.select_for_update()
            .select_related("customer", "finance_account", "cash_counter", "branch")
            .get(pk=customer_advance_id)
        )
        emi = (
            Emi.objects.select_for_update()
            .select_related("subscription", "subscription__customer")
            .get(pk=emi_id)
        )
        if emi.subscription.customer_id != advance.customer_id:
            raise ValueError("Advance can be allocated only to the same customer.")

        outstanding_before = _emi_outstanding_amount(emi)
        if allocation_amount > advance.unapplied_amount:
            raise ValueError("Allocation amount cannot exceed the unapplied advance balance.")
        if allocation_amount > outstanding_before:
            raise ValueError("Allocation amount cannot exceed the EMI outstanding balance.")

        payment = Payment.objects.create(
            customer=advance.customer,
            subscription=emi.subscription,
            emi=emi,
            amount=allocation_amount,
            branch=advance.branch,
            cash_counter=advance.cash_counter,
            finance_account=advance.finance_account,
            method=advance.method,
            reference_no=(reference_no or "").strip() or None,
            payment_date=allocation_date or timezone.localdate(),
            collected_by=allocated_by,
            allocation_metadata={
                "collection_mode": "ADVANCE_ALLOCATION",
                "customer_advance_id": advance.id,
                "finance_account_id": advance.finance_account_id,
            },
        )
        allocate_payment(payment)
        _create_ledger_entry(
            emi=emi,
            payment=payment,
            entry_type=LedgerEntryType.EMI_PAYMENT,
            amount=allocation_amount,
            entry_direction="CREDIT",
            allocation_context={
                "source": "CUSTOMER_ADVANCE",
                "customer_advance_id": advance.id,
            },
        )
        allocation = CustomerAdvanceAllocation.objects.create(
            advance=advance,
            subscription=emi.subscription,
            emi=emi,
            payment=payment,
            amount=allocation_amount,
            allocated_by=allocated_by,
            allocation_date=allocation_date or timezone.localdate(),
            notes=(note or "").strip(),
        )
        FinancePostingService.post_customer_advance_allocation(
            allocation=allocation,
            performed_by=allocated_by,
        )
        advance.unapplied_amount = _money(advance.unapplied_amount) - allocation_amount
        advance.save(update_fields=["unapplied_amount"])
        CustomerAdvanceService.refresh_status(advance)

        _reconcile_after_payment(emi.subscription, emi)
        reconciliation = _upsert_payment_reconciliation(
            payment=payment,
            expected_amount=outstanding_before,
            actor=allocated_by,
            note=f"Allocated from customer advance {advance.id}.",
        )
        _sync_billing_best_effort(
            subscription=emi.subscription,
            actor=allocated_by,
            source_model="Payment",
            source_id=payment.id,
            event_type="PAYMENT_POSTED",
        )
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=advance,
            performed_by=allocated_by,
            metadata={
                "event": "CUSTOMER_ADVANCE_ALLOCATED",
                "customer_advance_id": advance.id,
                "allocation_id": allocation.id,
                "payment_id": payment.id,
                "subscription_id": emi.subscription_id,
                "emi_id": emi.id,
                "amount": str(allocation_amount),
            },
        )
        return {
            "advance": advance,
            "allocation": allocation,
            "payment": payment,
            "emi": emi,
            "subscription": emi.subscription,
            "reconciliation": reconciliation,
        }
