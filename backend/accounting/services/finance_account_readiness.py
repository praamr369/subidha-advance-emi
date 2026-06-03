from __future__ import annotations

from dataclasses import dataclass

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
    SYSTEM_LEDGER_POSTING_PROFILE_NAME,
)


COLLECTION_FINANCE_ACCOUNT_KINDS: frozenset[str] = frozenset(
    {
        FinanceAccountKind.CASH,
        FinanceAccountKind.BANK,
        FinanceAccountKind.UPI,
    }
)

SYSTEM_POSTING_PROFILE_DIAGNOSTIC_BLOCKER = (
    "System posting profile diagnostic only; not a customer collection destination."
)

COLLECTION_MAPPING_PURPOSE_BY_KIND: dict[str, str] = {
    FinanceAccountKind.CASH: FinanceAccountMappingPurpose.CASH_COLLECTION,
    FinanceAccountKind.BANK: FinanceAccountMappingPurpose.BANK_COLLECTION,
    FinanceAccountKind.UPI: FinanceAccountMappingPurpose.UPI_COLLECTION,
}


@dataclass(frozen=True)
class FinanceAccountReadiness:
    collection_ready: bool
    collection_blocker_reason: str | None
    recommended_action: str | None
    operational_collection_account: bool
    system_posting_profile: bool
    diagnostic_only: bool
    selectable_for_collection: bool


class FinanceAccountPostingReadinessError(ValueError):
    code = "FINANCE_ACCOUNT_NOT_POSTING_READY"

    def __init__(
        self,
        message: str,
        *,
        finance_account_id: int | None = None,
        mapped_chart_account_id: int | None = None,
        recommended_action: str | None = None,
    ):
        super().__init__(message)
        self.finance_account_id = finance_account_id
        self.mapped_chart_account_id = mapped_chart_account_id
        self.recommended_action = recommended_action

    def as_payload(self) -> dict[str, object | None]:
        return {
            "code": self.code,
            "message": str(self),
            "finance_account_id": self.finance_account_id,
            "mapped_chart_account_id": self.mapped_chart_account_id,
            "recommended_action": self.recommended_action,
        }


def finance_account_is_system_posting_profile(finance_account: FinanceAccount) -> bool:
    return (finance_account.name or "").strip().lower() == SYSTEM_LEDGER_POSTING_PROFILE_NAME


def finance_account_is_diagnostic_only(finance_account: FinanceAccount) -> bool:
    return bool(
        finance_account_is_system_posting_profile(finance_account)
        or not getattr(finance_account, "is_real_settlement_account", True)
    )


def _readiness(
    *,
    collection_ready: bool,
    collection_blocker_reason: str | None,
    recommended_action: str | None,
    operational_collection_account: bool,
    system_posting_profile: bool,
    diagnostic_only: bool,
) -> FinanceAccountReadiness:
    return FinanceAccountReadiness(
        collection_ready=collection_ready,
        collection_blocker_reason=collection_blocker_reason,
        recommended_action=recommended_action,
        operational_collection_account=operational_collection_account,
        system_posting_profile=system_posting_profile,
        diagnostic_only=diagnostic_only,
        selectable_for_collection=bool(collection_ready and operational_collection_account and not diagnostic_only),
    )


def chart_account_is_posting_ready(chart_account: ChartOfAccount | None) -> bool:
    if chart_account is None:
        return False
    if not chart_account.is_active:
        return False
    if not chart_account.allow_manual_posting:
        return False
    return not chart_account.children.exists()


def chart_account_allowed_for_collection(chart_account: ChartOfAccount | None, *, kind: str | None = None) -> bool:
    return bool(
        chart_account_is_posting_ready(chart_account)
        and chart_account is not None
        and chart_account.account_type == ChartOfAccountType.ASSET
    )


def finance_account_has_collection_mapping(finance_account: FinanceAccount) -> bool:
    purpose = COLLECTION_MAPPING_PURPOSE_BY_KIND.get((finance_account.kind or "").strip().upper())
    if not purpose:
        return False
    chart_account_id = getattr(finance_account, "chart_account_id", None)
    if not chart_account_id:
        return False
    return FinanceAccountCoaMapping.objects.filter(
        finance_account_id=finance_account.pk,
        chart_account_id=chart_account_id,
        purpose=purpose,
        is_active=True,
        chart_account__is_active=True,
        chart_account__account_type=ChartOfAccountType.ASSET,
    ).exists()


def finance_account_readiness(
    finance_account: FinanceAccount,
    *,
    allowed_kinds: set[str] | frozenset[str] | None = None,
) -> FinanceAccountReadiness:
    allowed = allowed_kinds or COLLECTION_FINANCE_ACCOUNT_KINDS
    kind = (finance_account.kind or "").strip().upper()
    chart_account = getattr(finance_account, "chart_account", None)
    system_posting_profile = finance_account_is_system_posting_profile(finance_account)
    diagnostic_only = finance_account_is_diagnostic_only(finance_account)
    operational_collection_account = not diagnostic_only

    if diagnostic_only:
        return _readiness(
            collection_ready=False,
            collection_blocker_reason=SYSTEM_POSTING_PROFILE_DIAGNOSTIC_BLOCKER,
            recommended_action="Review this row in System Posting Profiles, not in customer collection selectors.",
            operational_collection_account=False,
            system_posting_profile=system_posting_profile,
            diagnostic_only=True,
        )

    if not finance_account.is_active:
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="Finance account is inactive.",
            recommended_action="Activate the finance account or choose another active cash, bank, or UPI account.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    if kind not in allowed:
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="Finance account kind is not valid for this collection method.",
            recommended_action="Choose a CASH, BANK, or UPI finance account for payment collection.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    if chart_account is None:
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="No chart account mapped.",
            recommended_action="Map this finance account to an active posting-enabled ASSET chart account.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    if not chart_account.is_active:
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is inactive.",
            recommended_action="Map this finance account to an active posting-enabled ASSET chart account.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    if chart_account.account_type != ChartOfAccountType.ASSET:
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is not an asset account.",
            recommended_action="Map collection finance accounts to posting-enabled ASSET chart accounts only.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    if not chart_account.allow_manual_posting:
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is a group/control account, not a posting account.",
            recommended_action="Choose a posting-enabled leaf ASSET chart account in Accounting Setup.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    if chart_account.children.exists():
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is a group/control account, not a posting account.",
            recommended_action="Choose a leaf ASSET chart account with no child accounts.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    if not finance_account_has_collection_mapping(finance_account):
        return _readiness(
            collection_ready=False,
            collection_blocker_reason="No active collection-purpose COA mapping is configured for this finance account.",
            recommended_action="Repair blocked collection mappings or add a matching CASH/BANK/UPI collection mapping.",
            operational_collection_account=operational_collection_account,
            system_posting_profile=system_posting_profile,
            diagnostic_only=diagnostic_only,
        )
    return _readiness(
        collection_ready=True,
        collection_blocker_reason=None,
        recommended_action=None,
        operational_collection_account=True,
        system_posting_profile=False,
        diagnostic_only=False,
    )


def raise_if_finance_account_not_ready(finance_account: FinanceAccount) -> None:
    readiness = finance_account_readiness(finance_account)
    if readiness.selectable_for_collection:
        return
    raise FinanceAccountPostingReadinessError(
        readiness.collection_blocker_reason or "Selected finance account is not posting-ready.",
        finance_account_id=finance_account.id,
        mapped_chart_account_id=finance_account.chart_account_id,
        recommended_action=readiness.recommended_action,
    )
