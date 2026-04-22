from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum

from accounting.models import FinanceAccount, MoneyMovement, MoneyMovementStatus
from subscriptions.models import (
    CustomerAdvance,
    CustomerAdvanceStatus,
    Payment,
    PaymentReconciliation,
    ReconciliationStatus,
)


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _active_payment_queryset():
    return Payment.objects.exclude(
        allocation_metadata__reversal__is_reversed=True
    )


class ReconciliationOverviewService:
    @classmethod
    def build_finance_account_operational_summary(cls):
        payment_rows = list(
            _active_payment_queryset()
            .values("finance_account_id")
            .annotate(total=Sum("amount"), count=Count("id"))
        )
        payment_by_account = {
            row["finance_account_id"]: {
                "payment_total": _money(row["total"]),
                "payment_count": row["count"],
            }
            for row in payment_rows
            if row["finance_account_id"]
        }

        advance_rows = list(
            CustomerAdvance.objects.values("finance_account_id").annotate(
                total=Sum("amount"),
                unapplied_total=Sum("unapplied_amount"),
                count=Count("id"),
            )
        )
        advance_by_account = {
            row["finance_account_id"]: {
                "advance_total": _money(row["total"]),
                "unapplied_total": _money(row["unapplied_total"]),
                "advance_count": row["count"],
            }
            for row in advance_rows
            if row["finance_account_id"]
        }

        outgoing_rows = list(
            MoneyMovement.objects.filter(status=MoneyMovementStatus.POSTED)
            .values("from_finance_account_id")
            .annotate(total=Sum("amount"), count=Count("id"))
        )
        outgoing_by_account = {
            row["from_finance_account_id"]: {
                "outgoing_total": _money(row["total"]),
                "outgoing_count": row["count"],
            }
            for row in outgoing_rows
            if row["from_finance_account_id"]
        }

        incoming_rows = list(
            MoneyMovement.objects.filter(status=MoneyMovementStatus.POSTED)
            .values("to_finance_account_id")
            .annotate(total=Sum("amount"), count=Count("id"))
        )
        incoming_by_account = {
            row["to_finance_account_id"]: {
                "incoming_total": _money(row["total"]),
                "incoming_count": row["count"],
            }
            for row in incoming_rows
            if row["to_finance_account_id"]
        }

        summaries = []
        for account in FinanceAccount.objects.select_related("chart_account", "branch").order_by("name", "id"):
            payments = payment_by_account.get(account.id, {})
            advances = advance_by_account.get(account.id, {})
            incoming = incoming_by_account.get(account.id, {})
            outgoing = outgoing_by_account.get(account.id, {})
            collected_total = _money(payments.get("payment_total")) + _money(advances.get("advance_total"))
            pending_settlement = collected_total - _money(outgoing.get("outgoing_total"))
            if pending_settlement < Decimal("0.00"):
                pending_settlement = Decimal("0.00")
            summaries.append(
                {
                    "finance_account_id": account.id,
                    "finance_account_name": account.name,
                    "kind": account.kind,
                    "branch_id": account.branch_id,
                    "branch_name": getattr(account.branch, "name", None),
                    "chart_account_id": account.chart_account_id,
                    "chart_account_code": account.chart_account.code,
                    "payment_total": f"{_money(payments.get('payment_total')):.2f}",
                    "payment_count": payments.get("payment_count", 0),
                    "advance_total": f"{_money(advances.get('advance_total')):.2f}",
                    "advance_count": advances.get("advance_count", 0),
                    "unapplied_advance_total": f"{_money(advances.get('unapplied_total')):.2f}",
                    "incoming_transfer_total": f"{_money(incoming.get('incoming_total')):.2f}",
                    "incoming_transfer_count": incoming.get("incoming_count", 0),
                    "outgoing_transfer_total": f"{_money(outgoing.get('outgoing_total')):.2f}",
                    "outgoing_transfer_count": outgoing.get("outgoing_count", 0),
                    "pending_settlement_amount": f"{pending_settlement:.2f}",
                    "reconciliation_status": (
                        "PENDING" if pending_settlement > Decimal("0.00") else "RECONCILED"
                    ),
                }
            )
        return {
            "results": summaries,
            "count": len(summaries),
        }

    @classmethod
    def build_overview(cls):
        finance_summary = cls.build_finance_account_operational_summary()["results"]
        pending_accounts = [row for row in finance_summary if row["pending_settlement_amount"] != "0.00"]
        flagged_reconciliations = PaymentReconciliation.objects.filter(
            Q(is_flagged=True)
            | Q(status__in=[
                ReconciliationStatus.MISMATCH,
                ReconciliationStatus.UNLINKED,
                ReconciliationStatus.FLAGGED,
            ])
        ).count()
        unapplied_total = (
            CustomerAdvance.objects.filter(
                status__in=[
                    CustomerAdvanceStatus.UNAPPLIED,
                    CustomerAdvanceStatus.PARTIALLY_APPLIED,
                ]
            ).aggregate(total=Sum("unapplied_amount"))["total"]
            or Decimal("0.00")
        )
        return {
            "pending_finance_accounts": len(pending_accounts),
            "pending_settlement_amount": f"{_money(sum(Decimal(row['pending_settlement_amount']) for row in pending_accounts)):.2f}",
            "unapplied_advance_total": f"{_money(unapplied_total):.2f}",
            "flagged_reconciliation_count": flagged_reconciliations,
            "pending_accounts": pending_accounts,
        }
