"""
Guards for cash/bank/UPI receipt and EMI/direct-sale collection flows.

Operator-facing collections should use only real settlement accounts. A settlement
account may also carry diagnostic/default COA mapping rows; those rows must not
hide the account from collection selectors as long as the account has a valid
cash/bank/UPI collection-purpose mapping.
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

_COLLECTION_PURPOSES: tuple[str, ...] = (
    FinanceAccountMappingPurpose.CASH_COLLECTION,
    FinanceAccountMappingPurpose.UPI_COLLECTION,
    FinanceAccountMappingPurpose.BANK_COLLECTION,
    FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
)


def _collection_mapping_exists(account: FinanceAccount) -> bool:
    return FinanceAccountCoaMapping.objects.filter(
        finance_account_id=account.pk,
        is_active=True,
        purpose__in=_COLLECTION_PURPOSES,
        chart_account__is_active=True,
    ).exists()


def filter_finance_accounts_for_payment_collection(queryset: QuerySet[FinanceAccount]) -> QuerySet[FinanceAccount]:
    """Return only real settlement accounts that can receive receipts."""

    collection_mapping = FinanceAccountCoaMapping.objects.filter(
        finance_account_id=OuterRef("pk"),
        is_active=True,
        purpose__in=_COLLECTION_PURPOSES,
        chart_account__is_active=True,
    )
    return (
        queryset.filter(
            kind__in=PAYMENT_HOLDING_KINDS,
            is_active=True,
            is_real_settlement_account=True,
        )
        .exclude(name__iexact=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip())
        .filter(Exists(collection_mapping))
    )


def assert_finance_account_allowed_for_payment_collection(account: FinanceAccount) -> None:
    """Raise ValueError when the account must not receive physical/digital receipts."""

    kind = (account.kind or "").strip().upper()
    if kind not in PAYMENT_HOLDING_KINDS:
        raise ValueError(
            "Receipt collections must use a cash, bank, or UPI finance account.",
        )
    if not account.is_active:
        raise ValueError("Receipt collections must use an active finance account.")
    if not account.is_real_settlement_account:
        raise ValueError("System posting profiles cannot receive cash, bank, or UPI receipts.")
    if account.name.strip().lower() == LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip().lower():
        raise ValueError("System posting profiles cannot receive cash, bank, or UPI receipts.")
    if not _collection_mapping_exists(account):
        raise ValueError(
            "This finance account has no active cash, bank, UPI, or payment-gateway collection mapping. "
            "Run Accounting Setup defaults or repair collection mappings before collecting receipts.",
        )


def filter_finance_accounts_for_cash_counter(
    queryset: QuerySet[FinanceAccount],
    *,
    branch_id: int | None = None,
) -> QuerySet[FinanceAccount]:
    """
    Physical cashier counters must bind to real cash desks only.

    Excludes ledger-profile anchors, inactive/non-settlement rows, and bank/UPI
    desks. Cash desks remain valid even when they have additional diagnostic COA
    mappings, provided the CASH_COLLECTION mapping is active.
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
            "This finance account cannot be used as a cashier collection book. "
            "Choose an active cash desk with a CASH_COLLECTION mapping.",
        )
