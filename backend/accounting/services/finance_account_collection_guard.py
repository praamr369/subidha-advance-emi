"""
Guards for cash/bank/UPI receipt and EMI/direct-sale collection flows.

Operational FinanceAccount ↔ COA mappings can designate accounts for revenue,
receivables, liabilities, inventory, commissions, etc. Those wallets must not
appear as cashier/admin receipt destinations even though every FinanceAccount
is typed CASH/BANK/UPI at the structural layer.
"""

from __future__ import annotations

from django.db.models import Exists, OuterRef, QuerySet

from accounting.models import (
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)

PAYMENT_HOLDING_KINDS: frozenset[str] = frozenset(
    {
        FinanceAccountKind.CASH,
        FinanceAccountKind.BANK,
        FinanceAccountKind.UPI,
    }
)

_PURPOSES_BLOCKED_FOR_PAYMENT_RECEIPT: tuple[str, ...] = tuple(
    p.value
    for p in FinanceAccountMappingPurpose
    if p
    not in {
        FinanceAccountMappingPurpose.CASH_COLLECTION,
        FinanceAccountMappingPurpose.UPI_COLLECTION,
        FinanceAccountMappingPurpose.BANK_COLLECTION,
    }
)


def filter_finance_accounts_for_payment_collection(queryset: QuerySet[FinanceAccount]) -> QuerySet[FinanceAccount]:
    """Exclude finance accounts tied to non-collection operational mappings."""
    blocked = FinanceAccountCoaMapping.objects.filter(
        finance_account_id=OuterRef("pk"),
        is_active=True,
        purpose__in=_PURPOSES_BLOCKED_FOR_PAYMENT_RECEIPT,
    )
    return queryset.filter(kind__in=PAYMENT_HOLDING_KINDS).exclude(Exists(blocked))


def assert_finance_account_allowed_for_payment_collection(account: FinanceAccount) -> None:
    """Raise ValueError when the account must not receive physical/digital receipts."""
    kind = (account.kind or "").strip().upper()
    if kind not in PAYMENT_HOLDING_KINDS:
        raise ValueError(
            "Receipt collections must use a cash, bank, or UPI finance account.",
        )
    blocked = FinanceAccountCoaMapping.objects.filter(
        finance_account_id=account.pk,
        is_active=True,
        purpose__in=_PURPOSES_BLOCKED_FOR_PAYMENT_RECEIPT,
    ).exists()
    if blocked:
        raise ValueError(
            "This finance account is mapped for operational ledger purposes "
            "(revenue, receivable, liability, inventory, commissions, etc.) "
            "and cannot receive cash, bank, or UPI receipts. "
            "Choose a cash desk, bank, or UPI collection account.",
        )
