"""
Guards for cash/bank/UPI receipt and EMI/direct-sale collection flows.

Operational FinanceAccount ↔ COA mappings can designate accounts for revenue,
receivables, liabilities, inventory, commissions, etc. Those wallets must not
appear as cashier/admin receipt destinations even though every FinanceAccount
is typed CASH/BANK/UPI at the structural layer.
"""

from __future__ import annotations

from django.db.models import Exists, OuterRef, Q, QuerySet

from accounting.models import (
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)
from accounting.services.accounting_setup_service import LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME

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


def filter_finance_accounts_for_cash_counter(
    queryset: QuerySet[FinanceAccount],
    *,
    branch_id: int | None = None,
) -> QuerySet[FinanceAccount]:
    """
    Physical cashier counters must bind to real cash desks only.

    Excludes ledger-profile anchors, inactive/non-settlement rows, bank/UPI/gateway desks,
    and finance accounts blocked for mixed operational mappings (same signal as receipts).
    """
    qs = queryset.filter(
        kind=FinanceAccountKind.CASH,
        is_active=True,
        is_real_settlement_account=True,
    ).exclude(name__iexact=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip())
    qs = filter_finance_accounts_for_payment_collection(qs)
    if branch_id is not None:
        qs = qs.filter(Q(branch_id=branch_id) | Q(branch_id__isnull=True))
    return qs


def validate_finance_account_for_cash_counter(*, finance_account: FinanceAccount, branch_id: int) -> None:
    """Raise ValueError when the finance account must not back a CashCounter."""
    ledger_name = LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip().lower()
    if finance_account.name.strip().lower() == ledger_name:
        raise ValueError("System posting profiles cannot be assigned to cashier counters.")
    if not finance_account.is_active:
        raise ValueError("Cash counters must use an active cash-desk finance account.")
    if not finance_account.is_real_settlement_account:
        raise ValueError("System posting profiles cannot be assigned to cashier counters.")
    kind = (finance_account.kind or "").strip().upper()
    if kind != FinanceAccountKind.CASH:
        raise ValueError("Cash counters must use an active cash-desk finance account.")
    finance_branch_id = getattr(finance_account, "branch_id", None)
    if finance_branch_id and finance_branch_id != branch_id:
        raise ValueError("Selected finance account belongs to a different branch.")
    scoped = filter_finance_accounts_for_cash_counter(
        FinanceAccount.objects.filter(pk=finance_account.pk),
        branch_id=branch_id,
    )
    if not scoped.exists():
        raise ValueError(
            "This finance account cannot be used as a cashier collection book "
            "(operational ledger mappings detected). Choose an active cash desk finance account.",
        )
