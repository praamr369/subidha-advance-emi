from __future__ import annotations

from collections.abc import Iterable

from subscriptions.models import EmiStatus, SubscriptionStatus


def _safe_enum_value(value):
    return getattr(value, "value", value)


SETTLED_EMI_STATUSES = {
    _safe_enum_value(getattr(EmiStatus, "PAID", "PAID")),
    _safe_enum_value(getattr(EmiStatus, "WAIVED", "WAIVED")),
}


def resolve_expected_subscription_status(
    *,
    current_status,
    emi_statuses: Iterable[object],
    is_winner: bool = False,
):
    current_status = _safe_enum_value(current_status)
    active_status = _safe_enum_value(getattr(SubscriptionStatus, "ACTIVE", "ACTIVE"))
    won_status = _safe_enum_value(getattr(SubscriptionStatus, "WON", "WON"))
    completed_status = _safe_enum_value(
        getattr(SubscriptionStatus, "COMPLETED", "COMPLETED")
    )
    defaulted_status = _safe_enum_value(
        getattr(SubscriptionStatus, "DEFAULTED", "DEFAULTED")
    )

    normalized_emi_statuses = {
        _safe_enum_value(status)
        for status in emi_statuses
        if _safe_enum_value(status) is not None
    }

    if current_status == defaulted_status:
        return defaulted_status

    # Winner check runs before the empty-EMI guard so that a winner with no
    # recorded EMI rows (e.g. subscription created without explicit EMI rows)
    # is treated as fully settled and gets COMPLETED rather than falling
    # through to the "return current_status" default.
    if is_winner:
        if normalized_emi_statuses.issubset(SETTLED_EMI_STATUSES):
            # Empty set is always a subset — no EMIs means fully settled.
            return completed_status
        return won_status

    if not normalized_emi_statuses:
        return current_status or active_status

    if normalized_emi_statuses.issubset(SETTLED_EMI_STATUSES):
        return completed_status

    return active_status
