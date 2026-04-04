from __future__ import annotations

from decimal import Decimal

from django.db.models import Prefetch

from subscriptions.models import (
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    LuckyDraw,
    MONEY_ZERO,
    Payment,
    Subscription,
    SubscriptionStatus,
    q2,
)
from subscriptions.services.delivery_service import get_subscription_delivery_prefetch
from subscriptions.services.subscription_status_service import (
    resolve_expected_subscription_status,
)
from subscriptions.services.winner_state_service import get_subscription_winner_evidence


CONSISTENCY_TOLERANCE = Decimal("0.01")


def _money(value: Decimal | str | int | None) -> str:
    return f"{q2(value or MONEY_ZERO):.2f}"


def _date(value) -> str | None:
    return value.isoformat() if value else None


def _is_close(left: Decimal, right: Decimal) -> bool:
    return abs(q2(left) - q2(right)) <= CONSISTENCY_TOLERANCE


def get_subscription_detail_queryset():
    return Subscription.objects.select_related(
        "customer",
        "product",
        "batch",
        "partner",
        "lucky_id",
    ).prefetch_related(
        Prefetch(
            "emis",
            queryset=Emi.objects.order_by("month_no", "id").prefetch_related(
                Prefetch(
                    "ledger_entries",
                    queryset=FinancialLedger.objects.order_by("created_at", "id"),
                ),
                Prefetch(
                    "payments",
                    queryset=Payment.objects.order_by("-payment_date", "-id"),
                ),
            ),
        ),
        Prefetch(
            "winning_draws",
            queryset=LuckyDraw.objects.order_by("-draw_month", "-id"),
        ),
        get_subscription_delivery_prefetch(),
    )


def build_subscription_financial_snapshot(subscription: Subscription) -> dict:
    is_emi_plan = subscription.plan_type == "EMI"
    emis = list(subscription.emis.all().order_by("month_no", "id"))
    total_amount = q2(subscription.total_amount)
    total_emi_amount = MONEY_ZERO
    paid_amount = MONEY_ZERO
    waived_amount = MONEY_ZERO
    reversed_amount = MONEY_ZERO
    pending_amount = MONEY_ZERO
    waiver_ledger_amount = MONEY_ZERO

    emi_count_paid = 0
    emi_count_waived = 0
    emi_count_pending = 0

    warnings: list[str] = []

    def add_warning(message: str):
        if message not in warnings:
            warnings.append(message)

    emi_rows: list[dict] = []

    for emi in emis:
        amount = q2(emi.amount)
        total_emi_amount = q2(total_emi_amount + amount)

        ledger_entries = list(emi.ledger_entries.all().order_by("created_at", "id"))

        emi_payment_total = MONEY_ZERO
        emi_reversal_total = MONEY_ZERO
        emi_waiver_ledger_total = MONEY_ZERO

        for entry in ledger_entries:
            entry_amount = q2(entry.amount)
            if entry.entry_type == LedgerEntryType.EMI_PAYMENT:
                emi_payment_total = q2(emi_payment_total + entry_amount)
            elif entry.entry_type == LedgerEntryType.PAYMENT_REVERSAL:
                emi_reversal_total = q2(emi_reversal_total + entry_amount)
            elif entry.entry_type == LedgerEntryType.EMI_WAIVER:
                emi_waiver_ledger_total = q2(emi_waiver_ledger_total + entry_amount)

        net_paid = q2(max(emi_payment_total - emi_reversal_total, MONEY_ZERO))
        balance_amount = q2(max(amount - net_paid, MONEY_ZERO))
        waived_row_amount = amount if emi.status == EmiStatus.WAIVED else MONEY_ZERO

        paid_amount = q2(paid_amount + net_paid)
        reversed_amount = q2(reversed_amount + emi_reversal_total)
        waived_amount = q2(waived_amount + waived_row_amount)
        waiver_ledger_amount = q2(waiver_ledger_amount + emi_waiver_ledger_total)

        if emi.status == EmiStatus.WAIVED:
            emi_count_waived += 1
            emi_balance = MONEY_ZERO
            derived_status = EmiStatus.WAIVED
        elif balance_amount <= MONEY_ZERO:
            emi_count_paid += 1
            emi_balance = MONEY_ZERO
            derived_status = EmiStatus.PAID
        else:
            emi_count_pending += 1
            emi_balance = balance_amount
            derived_status = EmiStatus.PENDING
            pending_amount = q2(pending_amount + emi_balance)

        row_warnings: list[str] = []

        if emi.status == EmiStatus.WAIVED and net_paid > MONEY_ZERO:
            row_warnings.append(
                "Waived EMI has recorded net paid amount. Future waiver should not rewrite past paid EMI."
            )
        if emi.status == EmiStatus.WAIVED and not _is_close(
            emi_waiver_ledger_total, waived_row_amount
        ):
            row_warnings.append(
                "Waiver ledger total does not match waived EMI amount."
            )
        if emi.status != EmiStatus.WAIVED and emi_waiver_ledger_total > MONEY_ZERO:
            row_warnings.append(
                "Waiver ledger entry exists on a non-waived EMI row."
            )
        if emi.status == EmiStatus.PAID and balance_amount > MONEY_ZERO:
            row_warnings.append(
                "EMI is marked paid but still has outstanding balance."
            )
        if emi.status == EmiStatus.PENDING and balance_amount <= MONEY_ZERO and net_paid > MONEY_ZERO:
            row_warnings.append(
                "EMI is still marked pending even though ledger shows it fully paid."
            )
        if net_paid > amount:
            row_warnings.append(
                "Net paid amount exceeds scheduled EMI amount."
            )

        for message in row_warnings:
            add_warning(f"EMI month {emi.month_no}: {message}")

        emi_rows.append(
            {
                "id": emi.id,
                "month_no": emi.month_no,
                "due_date": _date(emi.due_date),
                "amount": _money(amount),
                "status": emi.status,
                "derived_status": derived_status,
                "paid_amount": _money(net_paid),
                "total_paid": _money(net_paid),
                "reversed_amount": _money(emi_reversal_total),
                "waived_amount": _money(waived_row_amount),
                "waiver_ledger_amount": _money(emi_waiver_ledger_total),
                "balance_amount": _money(emi_balance),
                "is_overdue": bool(emi.status == EmiStatus.PENDING and emi.is_overdue()),
                "is_status_consistent": emi.status == derived_status,
                "warnings": row_warnings,
            }
        )

    remaining_amount = q2(max(total_amount - paid_amount - waived_amount, MONEY_ZERO))

    if not is_emi_plan and not emis:
        total_emi_amount = total_amount
        pending_amount = remaining_amount

    if is_emi_plan and not _is_close(total_amount, total_emi_amount):
        add_warning("Contract total does not match the sum of scheduled EMI amounts.")

    if not _is_close(q2(subscription.waived_amount), waived_amount):
        add_warning(
            "Stored subscription waived amount does not match waived EMI row total."
        )

    if not _is_close(waiver_ledger_amount, waived_amount):
        add_warning("Waiver ledger total does not match waived EMI row total.")

    pending_matches_remaining = _is_close(pending_amount, remaining_amount)
    if is_emi_plan and not pending_matches_remaining:
        add_warning(
            "Pending EMI total does not perfectly match contract-derived remaining amount. Review payment reversals and waiver history."
        )

    winner_evidence = get_subscription_winner_evidence(subscription)
    winning_draw = winner_evidence["winning_draw"]
    winner_month = winner_evidence["winner_month"]
    winner_status = "WON" if winner_evidence["is_winner"] else "NOT_WON"
    expected_subscription_status = winner_evidence.get(
        "expected_subscription_status"
    ) or resolve_expected_subscription_status(
        current_status=subscription.status,
        emi_statuses=(row["status"] for row in emi_rows),
        is_winner=winner_status == "WON",
    )

    if winner_status == "WON" and winner_month is None:
        add_warning("Winner markers exist but winner month is not recorded.")

    if winner_month is not None and subscription.status != expected_subscription_status:
        if expected_subscription_status == SubscriptionStatus.COMPLETED:
            add_warning(
                "Winner subscription is fully settled, but subscription status is not COMPLETED."
            )
        elif expected_subscription_status == SubscriptionStatus.WON:
            add_warning(
                "Winner subscription has unresolved EMI state, but subscription status is not WON."
            )

    if (
        winner_status == "WON"
        and subscription.lucky_id_id
        and getattr(subscription.lucky_id, "status", None) != "WON"
    ):
        add_warning("Winner markers exist, but Lucky ID status is not WON.")

    if (
        winning_draw is not None
        and winner_month is not None
        and winning_draw.draw_month != winner_month
    ):
        add_warning("Winner month does not match the revealed lucky draw month.")

    waived_before_winner = [
        row for row in emi_rows if row["status"] == EmiStatus.WAIVED and winner_month is not None and row["month_no"] <= winner_month
    ]
    if waived_before_winner:
        add_warning(
            "One or more waived EMI rows appear at or before the winner month. Waiver should apply to future EMI only."
        )

    if (
        winner_status == "WON"
        and winner_month is not None
        and winner_month < subscription.tenure_months
        and emi_count_waived == 0
    ):
        add_warning("Winner subscription has no future waived EMI rows.")

    is_financially_consistent = (
        _is_close(total_amount, total_emi_amount)
        and _is_close(q2(subscription.waived_amount), waived_amount)
        and _is_close(waiver_ledger_amount, waived_amount)
        and pending_matches_remaining
        and not any(row["warnings"] for row in emi_rows)
    )

    return {
        "subscription_id": subscription.id,
        "total_amount": _money(total_amount),
        "total_emi_amount": _money(total_emi_amount),
        "emi_total": _money(total_emi_amount),
        "paid_amount": _money(paid_amount),
        "waived_amount": _money(waived_amount),
        "stored_waived_amount": _money(q2(subscription.waived_amount)),
        "waiver_ledger_amount": _money(waiver_ledger_amount),
        "reversed_amount": _money(reversed_amount),
        "pending_amount": _money(pending_amount),
        "remaining_amount": _money(remaining_amount),
        "outstanding_amount": _money(remaining_amount),
        "emi_count_total": len(emi_rows),
        "emi_count_paid": emi_count_paid,
        "emi_count_waived": emi_count_waived,
        "emi_count_pending": emi_count_pending,
        "winner_status": winner_status,
        "winner_month": winner_month,
        "lucky_id": subscription.lucky_id_id,
        "lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
        "batch": {
            "id": subscription.batch_id,
            "batch_code": getattr(subscription.batch, "batch_code", None),
            "status": getattr(subscription.batch, "status", None),
        },
        "partner": {
            "id": subscription.partner_id,
            "username": getattr(subscription.partner, "username", None),
            "phone": getattr(subscription.partner, "phone", None),
            "commission_rate": _money(getattr(subscription.partner, "commission_rate", MONEY_ZERO))
            if subscription.partner_id
            else "0.00",
        },
        "has_reversal_history": reversed_amount > MONEY_ZERO,
        "has_waiver_history": waiver_ledger_amount > MONEY_ZERO or waived_amount > MONEY_ZERO,
        "pending_matches_remaining": pending_matches_remaining,
        "is_financially_consistent": is_financially_consistent,
        "warnings": warnings,
        "winner_summary": {
            "winner_status": winner_status,
            "winner_month": winner_month,
            "lucky_id": subscription.lucky_id_id,
            "lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
            "draw_id": getattr(winning_draw, "id", None),
            "draw_month": getattr(winning_draw, "draw_month", None),
            "draw_revealed_at": _date(getattr(winning_draw, "revealed_at", None)),
            "waiver_scope": "FUTURE_EMI_ONLY" if winner_status == "WON" else None,
            "waived_emi_count": emi_count_waived,
            "waived_amount": _money(waived_amount),
        },
        "emis": emi_rows,
    }
