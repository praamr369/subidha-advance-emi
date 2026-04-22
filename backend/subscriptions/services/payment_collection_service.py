from __future__ import annotations

from subscriptions.services.payment_service import record_emi_payment


class PaymentCollectionService:
    @staticmethod
    def collect_emi_payment(
        *,
        emi_id: int,
        amount,
        collected_by,
        method: str,
        finance_account_id: int,
        reference_no: str | None = None,
        note: str | None = None,
        payment_date=None,
        branch_id: int | None = None,
        cash_counter_id: int | None = None,
    ):
        return record_emi_payment(
            emi_id=emi_id,
            amount=amount,
            collected_by=collected_by,
            method=method,
            finance_account_id=finance_account_id,
            reference_no=reference_no,
            note=note,
            payment_date=payment_date,
            branch_id=branch_id,
            cash_counter_id=cash_counter_id,
        )
