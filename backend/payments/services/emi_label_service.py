"""Operator-facing EMI installment labelling helpers.

These are display-only helpers. They never change EMI calculation, payment
posting, receipt generation, or primary keys — the real ``emi_id`` is always
used internally. The installment number is subscription-local (``month_no``),
never derived from the global database id.
"""
from __future__ import annotations


def ordinal(number: int) -> str:
    """Return the English ordinal for a positive integer (1 -> "1st")."""
    try:
        n = int(number)
    except (TypeError, ValueError):
        return str(number)
    if n <= 0:
        return str(n)
    if 10 <= (n % 100) <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def installment_label(installment_no, total_installments=None) -> str:
    """Build the short installment label, e.g. "1st EMI of 15".

    Falls back gracefully when ``total_installments`` is unknown.
    """
    if installment_no in (None, "") or int(installment_no) <= 0:
        return "EMI"
    base = f"{ordinal(installment_no)} EMI"
    if total_installments in (None, "") or int(total_installments) <= 0:
        return base
    return f"{base} of {int(total_installments)}"
