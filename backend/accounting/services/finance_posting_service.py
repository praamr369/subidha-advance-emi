from __future__ import annotations

from decimal import Decimal

from accounting.models import FinanceAccount
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from subscriptions.models import BusinessEventType
from subscriptions.services.business_event_service import append_business_event


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


class FinancePostingService:
    @staticmethod
    def resolve_operational_finance_account(*, finance_account_id: int) -> FinanceAccount:
        finance_account = (
            FinanceAccount.objects.select_related("chart_account")
            .filter(pk=finance_account_id)
            .first()
        )
        if finance_account is None:
            raise ValueError("Selected finance account was not found.")
        if not finance_account.is_active:
            raise ValueError("Selected finance account is not active.")

        chart_account = finance_account.chart_account
        if not chart_account.is_active:
            raise ValueError("Selected finance account is linked to an inactive chart account.")
        if not chart_account.allow_manual_posting:
            raise ValueError("Selected finance account is linked to a non-posting chart account.")
        if chart_account.children.exists():
            raise ValueError("Selected finance account is linked to a group chart account.")
        return finance_account

    @classmethod
    def post_subscription_collection(
        cls,
        *,
        payment,
        finance_account: FinanceAccount,
        performed_by,
        purpose: str = "PAYMENT_COLLECTION",
    ):
        accounts = ensure_phase3_system_accounts()
        entry = post_bridge_entry(
            source_instance=payment,
            purpose=purpose,
            entry_date=payment.payment_date,
            memo=f"Subscription collection {payment.reference_no or payment.id}",
            lines=[
                {
                    "chart_account": finance_account.chart_account,
                    "description": payment.reference_no or f"PAY-{payment.id}",
                    "debit_amount": _money(payment.amount),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                    "description": payment.reference_no or f"SUB-{payment.subscription_id}",
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": _money(payment.amount),
                },
            ],
            voucher_type=purpose,
            source_type="SUBSCRIPTION_PAYMENT",
            source_reference=payment.reference_no or f"PAY-{payment.id}",
            trace_metadata={
                "payment_id": payment.id,
                "subscription_id": payment.subscription_id,
                "emi_id": payment.emi_id,
                "finance_account_id": finance_account.id,
                "finance_chart_account_id": finance_account.chart_account_id,
            },
            posted_by=performed_by,
        )
        append_business_event(
            event_type=BusinessEventType.LEDGER_POSTED,
            source_module="accounting.services.finance_posting_service.post_subscription_collection",
            actor_user=performed_by,
            customer=getattr(payment, "customer", None),
            subscription=getattr(payment, "subscription", None),
            payment=payment,
            batch=getattr(getattr(payment, "subscription", None), "batch", None),
            lucky_id=getattr(getattr(payment, "subscription", None), "lucky_id", None),
            ledger_reference=str(getattr(entry, "id", "") or ""),
            payload={
                "purpose": purpose,
                "payment_id": payment.id,
                "entry_id": getattr(entry, "id", None),
            },
        )
        return entry

    @classmethod
    def post_customer_advance_collection(
        cls,
        *,
        advance,
        finance_account: FinanceAccount,
        performed_by,
    ):
        accounts = ensure_phase3_system_accounts()
        return post_bridge_entry(
            source_instance=advance,
            purpose="CUSTOMER_ADVANCE_COLLECTION",
            entry_date=advance.payment_date,
            memo=f"Customer advance {advance.reference_no or advance.id}",
            lines=[
                {
                    "chart_account": finance_account.chart_account,
                    "description": advance.reference_no or f"ADV-{advance.id}",
                    "debit_amount": _money(advance.amount),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["CUSTOMER_ADVANCES"],
                    "description": advance.reference_no or f"CUST-{advance.customer_id}",
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": _money(advance.amount),
                },
            ],
            voucher_type="CUSTOMER_ADVANCE_COLLECTION",
            source_type="CUSTOMER_ADVANCE",
            source_reference=advance.reference_no or f"ADV-{advance.id}",
            trace_metadata={
                "customer_advance_id": advance.id,
                "customer_id": advance.customer_id,
                "finance_account_id": finance_account.id,
                "finance_chart_account_id": finance_account.chart_account_id,
            },
            posted_by=performed_by,
        )

    @classmethod
    def post_customer_advance_allocation(
        cls,
        *,
        allocation,
        performed_by,
    ):
        accounts = ensure_phase3_system_accounts()
        return post_bridge_entry(
            source_instance=allocation,
            purpose="CUSTOMER_ADVANCE_ALLOCATION",
            entry_date=allocation.allocation_date,
            memo=f"Advance allocation {allocation.id}",
            lines=[
                {
                    "chart_account": accounts["CUSTOMER_ADVANCES"],
                    "description": allocation.advance.reference_no or f"ADV-{allocation.advance_id}",
                    "debit_amount": _money(allocation.amount),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                    "description": f"SUB-{allocation.subscription_id}",
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": _money(allocation.amount),
                },
            ],
            voucher_type="CUSTOMER_ADVANCE_ALLOCATION",
            source_type="CUSTOMER_ADVANCE_ALLOCATION",
            source_reference=allocation.advance.reference_no or f"ADV-ALLOC-{allocation.id}",
            trace_metadata={
                "customer_advance_id": allocation.advance_id,
                "allocation_id": allocation.id,
                "payment_id": allocation.payment_id,
                "subscription_id": allocation.subscription_id,
                "emi_id": allocation.emi_id,
            },
            posted_by=performed_by,
        )
