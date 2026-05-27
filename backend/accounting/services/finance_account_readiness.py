from __future__ import annotations

from dataclasses import dataclass

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind


COLLECTION_FINANCE_ACCOUNT_KINDS: frozenset[str] = frozenset(
    {
        FinanceAccountKind.CASH,
        FinanceAccountKind.BANK,
        FinanceAccountKind.UPI,
    }
)


@dataclass(frozen=True)
class FinanceAccountReadiness:
    collection_ready: bool
    collection_blocker_reason: str | None
    recommended_action: str | None


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


def finance_account_readiness(
    finance_account: FinanceAccount,
    *,
    allowed_kinds: set[str] | frozenset[str] | None = None,
) -> FinanceAccountReadiness:
    allowed = allowed_kinds or COLLECTION_FINANCE_ACCOUNT_KINDS
    kind = (finance_account.kind or "").strip().upper()
    chart_account = getattr(finance_account, "chart_account", None)

    if not finance_account.is_active:
        return FinanceAccountReadiness(
            collection_ready=False,
            collection_blocker_reason="Finance account is inactive.",
            recommended_action="Activate the finance account or choose another active cash, bank, or UPI account.",
        )
    if kind not in allowed:
        return FinanceAccountReadiness(
            collection_ready=False,
            collection_blocker_reason="Finance account kind is not valid for this collection method.",
            recommended_action="Choose a CASH, BANK, or UPI finance account for payment collection.",
        )
    if chart_account is None:
        return FinanceAccountReadiness(
            collection_ready=False,
            collection_blocker_reason="No chart account mapped.",
            recommended_action="Map this finance account to an active posting-enabled ASSET chart account.",
        )
    if not chart_account.is_active:
        return FinanceAccountReadiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is inactive.",
            recommended_action="Map this finance account to an active posting-enabled ASSET chart account.",
        )
    if chart_account.account_type != ChartOfAccountType.ASSET:
        return FinanceAccountReadiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is not an asset account.",
            recommended_action="Map collection finance accounts to posting-enabled ASSET chart accounts only.",
        )
    if not chart_account.allow_manual_posting:
        return FinanceAccountReadiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is a group/control account, not a posting account.",
            recommended_action="Choose a posting-enabled leaf ASSET chart account in Accounting Setup.",
        )
    if chart_account.children.exists():
        return FinanceAccountReadiness(
            collection_ready=False,
            collection_blocker_reason="Mapped chart account is a group/control account, not a posting account.",
            recommended_action="Choose a leaf ASSET chart account with no child accounts.",
        )
    return FinanceAccountReadiness(
        collection_ready=True,
        collection_blocker_reason=None,
        recommended_action=None,
    )


def raise_if_finance_account_not_ready(finance_account: FinanceAccount) -> None:
    readiness = finance_account_readiness(finance_account)
    if readiness.collection_ready:
        return
    raise FinanceAccountPostingReadinessError(
        readiness.collection_blocker_reason or "Selected finance account is not posting-ready.",
        finance_account_id=finance_account.id,
        mapped_chart_account_id=finance_account.chart_account_id,
        recommended_action=readiness.recommended_action,
    )
