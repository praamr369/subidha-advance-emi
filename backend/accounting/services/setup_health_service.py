from __future__ import annotations

from collections import Counter
from typing import Any

from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounting.models import (
    AccountingBridgePosting,
    AccountingPostingProfile,
    ChartOfAccount,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from accounting.services.accounting_setup_catalog import (
    CANONICAL_CHART_ACCOUNT_BY_KEY,
    MANUAL_COLLECTION_CHART_ACCOUNTS,
    SYSTEM_POSTING_PROFILE_ACCOUNTS,
)
from accounting.services.finance_account_readiness import finance_account_readiness
from accounting.services.setup_defaults_service import (
    LEGACY_STANDARD_SETTLEMENT_ACCOUNT_NAMES,
    MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME,
    MAIN_CASH_FINANCE_ACCOUNT_NAME,
)

BANK_UPI_FINANCE_ACCOUNT_KEY = "BANK_UPI"
DIGITAL_COLLECTION_PURPOSES: tuple[str, ...] = (
    FinanceAccountMappingPurpose.BANK_COLLECTION,
    FinanceAccountMappingPurpose.UPI_COLLECTION,
    FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
)


def _norm_name(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _canonical_account_health() -> dict[str, Any]:
    present: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    claimable: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    for key, spec in CANONICAL_CHART_ACCOUNT_BY_KEY.items():
        by_system = ChartOfAccount.objects.filter(system_code=key).first()
        by_code = ChartOfAccount.objects.filter(code__iexact=spec.code).first()

        if by_system is not None:
            present.append(
                {
                    "key": key,
                    "id": by_system.id,
                    "code": by_system.code,
                    "name": by_system.name,
                    "is_active": by_system.is_active,
                    "is_legacy": getattr(by_system, "is_legacy", False),
                }
            )
            if by_system.code.strip().upper() != spec.code.strip().upper():
                conflicts.append(
                    {
                        "key": key,
                        "reason": "SYSTEM_CODE_CODE_MISMATCH",
                        "id": by_system.id,
                        "expected_code": spec.code,
                        "actual_code": by_system.code,
                    }
                )
            continue

        if by_code is not None:
            existing_system_code = (by_code.system_code or "").strip().upper() or None
            if existing_system_code is None:
                claimable.append(
                    {
                        "key": key,
                        "id": by_code.id,
                        "code": by_code.code,
                        "name": by_code.name,
                    }
                )
            elif existing_system_code != key:
                conflicts.append(
                    {
                        "key": key,
                        "reason": "CODE_SYSTEM_CODE_CONFLICT",
                        "id": by_code.id,
                        "code": by_code.code,
                        "existing_system_code": existing_system_code,
                        "expected_system_code": key,
                    }
                )
            continue

        missing.append({"key": key, "code": spec.code, "name": spec.name, "account_type": spec.account_type})

    return {"missing": missing, "present": present, "claimable": claimable, "conflicts": conflicts}


def _finance_account_row(account: FinanceAccount) -> dict[str, Any]:
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "chart_account_id": account.chart_account_id,
        "chart_account_code": getattr(account.chart_account, "code", None),
        "chart_account_name": getattr(account.chart_account, "name", None),
        "chart_account_is_active": getattr(account.chart_account, "is_active", None),
    }


def _finance_account_snapshot_for_name(name: str) -> dict[str, Any]:
    active = list(
        FinanceAccount.objects.filter(
            name__iexact=name,
            is_active=True,
            is_real_settlement_account=True,
        )
        .select_related("chart_account")
        .order_by("id")
    )
    linked_to_inactive = [
        account.id
        for account in active
        if getattr(account, "chart_account_id", None) and not getattr(account.chart_account, "is_active", True)
    ]
    return {
        "active_count": len(active),
        "active": [_finance_account_row(account) for account in active],
        "linked_to_inactive_coa_ids": linked_to_inactive,
    }


def _legacy_visible_snapshot() -> dict[str, Any]:
    legacy_names = [*LEGACY_STANDARD_SETTLEMENT_ACCOUNT_NAMES, "Cash Counter - Rent/Lease Collections"]
    active = list(
        FinanceAccount.objects.filter(
            name__in=legacy_names,
            is_active=True,
            is_real_settlement_account=True,
        )
        .select_related("chart_account")
        .order_by("name", "id")
    )
    return {
        "active_count": len(active),
        "active": [_finance_account_row(account) for account in active],
        "operator_note": "Non-canonical finance-account rows are kept out of operator-facing readiness. Only Main Cash Desk and Main UPI / Bank Account are go-live settlement containers.",
    }


def _collection_mapping_ready(finance_account: FinanceAccount, purpose: str) -> bool:
    return FinanceAccountCoaMapping.objects.filter(
        finance_account=finance_account,
        purpose=purpose,
        is_active=True,
        chart_account__is_active=True,
    ).exists()


def _journal_integrity_snapshot() -> dict[str, int]:
    posted = JournalEntry.objects.filter(status=JournalEntryStatus.POSTED)
    money_field = DecimalField(max_digits=12, decimal_places=2)
    money_zero = Value(0, output_field=money_field)
    posted = posted.annotate(
        line_count=Count("lines"),
        debit_sum=Coalesce(Sum("lines__debit_amount"), money_zero, output_field=money_field),
        credit_sum=Coalesce(Sum("lines__credit_amount"), money_zero, output_field=money_field),
    )
    posted_zero_line_count = posted.filter(line_count=0).count()
    posted_unbalanced_count = posted.filter(line_count__gt=0).exclude(debit_sum=F("credit_sum")).count()

    lines_to_inactive_accounts = JournalEntryLine.objects.filter(
        journal_entry__status=JournalEntryStatus.POSTED,
        chart_account__is_active=False,
    ).count()

    return {
        "posted_unbalanced_count": posted_unbalanced_count,
        "posted_zero_line_count": posted_zero_line_count,
        "lines_to_inactive_accounts": lines_to_inactive_accounts,
    }


def _coa_snapshot() -> dict[str, Any]:
    total = ChartOfAccount.objects.count()
    legacy_count = ChartOfAccount.objects.filter(is_legacy=True).count()

    names = list(ChartOfAccount.objects.filter(is_active=True).values_list("name", flat=True))
    normalized = [_norm_name(name) for name in names if _norm_name(name)]
    counts = Counter(normalized)
    duplicate_names = [name for name, count in counts.items() if count > 1][:50]

    system_code_conflicts: list[dict[str, Any]] = []
    for key, spec in CANONICAL_CHART_ACCOUNT_BY_KEY.items():
        by_code = ChartOfAccount.objects.filter(code__iexact=spec.code).first()
        if by_code is None:
            continue
        existing_system_code = (by_code.system_code or "").strip().upper() or None
        if existing_system_code and existing_system_code != key:
            system_code_conflicts.append(
                {
                    "code": by_code.code,
                    "id": by_code.id,
                    "expected_system_code": key,
                    "existing_system_code": existing_system_code,
                }
            )

    return {
        "total": total,
        "legacy_count": legacy_count,
        "duplicate_names": duplicate_names,
        "system_code_conflicts": system_code_conflicts,
    }


def _posting_profiles_snapshot() -> dict[str, Any]:
    missing: list[str] = []
    mapped: list[dict[str, Any]] = []
    legacy_mapped: list[dict[str, Any]] = []

    for spec in SYSTEM_POSTING_PROFILE_ACCOUNTS:
        profile = AccountingPostingProfile.objects.select_related("chart_account").filter(key=spec.key, is_active=True).first()
        if profile is None:
            missing.append(spec.key)
            continue
        row = {
            "id": profile.id,
            "key": profile.key,
            "label": profile.label,
            "chart_account_id": profile.chart_account_id,
            "chart_account_code": getattr(profile.chart_account, "code", None),
            "chart_account_name": getattr(profile.chart_account, "name", None),
            "chart_account_is_legacy": getattr(profile.chart_account, "is_legacy", False),
        }
        if getattr(profile.chart_account, "is_legacy", False):
            legacy_mapped.append(row)
        else:
            mapped.append(row)

    return {"missing": missing, "mapped": mapped, "legacy_mapped": legacy_mapped}


def _bridge_snapshot() -> dict[str, int]:
    missing_journal_count = AccountingBridgePosting.objects.filter(journal_entry__isnull=True).count()
    legacy_brg_collection_count = AccountingBridgePosting.objects.filter(
        purpose="PAYMENT_COLLECTION",
        journal_entry__lines__chart_account__code__istartswith="BRG-",
    ).distinct().count()
    return {
        "missing_journal_count": missing_journal_count,
        "legacy_brg_collection_count": legacy_brg_collection_count,
    }


def _issue(
    *,
    level: str,
    code: str,
    message: str,
    affected_ids: list[int] | None = None,
    repairable: bool = False,
    operator_action: str = "",
) -> dict[str, Any]:
    return {
        "level": level,
        "code": code,
        "message": message,
        "affected_ids": affected_ids or [],
        "repairable": repairable,
        "operator_action": operator_action,
    }


def get_accounting_setup_health() -> dict[str, Any]:
    """
    Go-live focused accounting readiness health.

    UPI and Bank are separate payment methods but they intentionally resolve to
    the same physical FinanceAccount container: Main UPI / Bank Account.
    """

    canonical_accounts = _canonical_account_health()
    finance_accounts = {
        FinanceAccountKind.CASH: _finance_account_snapshot_for_name(MAIN_CASH_FINANCE_ACCOUNT_NAME),
        FinanceAccountKind.BANK: _finance_account_snapshot_for_name(MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME),
        FinanceAccountKind.UPI: _finance_account_snapshot_for_name(MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME),
        BANK_UPI_FINANCE_ACCOUNT_KEY: _finance_account_snapshot_for_name(MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME),
        "LEGACY_HIDDEN": _legacy_visible_snapshot(),
    }
    posting_profiles = _posting_profiles_snapshot()
    journals = _journal_integrity_snapshot()
    coa = _coa_snapshot()
    bridges = _bridge_snapshot()

    blockers: list[Any] = []
    warnings: list[Any] = []
    infos: list[dict[str, Any]] = []

    cash_accounts = FinanceAccount.objects.select_related("chart_account").filter(
        name__iexact=MAIN_CASH_FINANCE_ACCOUNT_NAME,
        is_active=True,
        is_real_settlement_account=True,
    )
    bank_upi_accounts = FinanceAccount.objects.select_related("chart_account").filter(
        name__iexact=MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME,
        is_active=True,
        is_real_settlement_account=True,
    )

    if not cash_accounts.exists():
        blockers.append(
            _issue(
                level="ERROR",
                code="MISSING_ACTIVE_CASH_FINANCE_ACCOUNT",
                message="Missing active Main Cash Desk FinanceAccount.",
                operator_action="Apply Accounting Setup defaults to create or repair Main Cash Desk.",
            )
        )
    if not bank_upi_accounts.exists():
        blockers.append(
            _issue(
                level="ERROR",
                code="MISSING_ACTIVE_BANK_UPI_FINANCE_ACCOUNT",
                message="Missing active Main UPI / Bank Account FinanceAccount.",
                operator_action="Apply Accounting Setup defaults to create or repair the combined Bank/UPI finance account.",
            )
        )

    for account in [*cash_accounts, *bank_upi_accounts]:
        readiness = finance_account_readiness(account)
        if not readiness.selectable_for_collection:
            blockers.append(
                _issue(
                    level="ERROR",
                    code="CANONICAL_FINANCE_ACCOUNT_NOT_COLLECTION_READY",
                    message=f"{account.name} is not ready for payment collection.",
                    affected_ids=[account.id],
                    repairable=True,
                    operator_action=readiness.recommended_action or "Repair collection mapping for this canonical finance account.",
                )
            )
        if getattr(account, "chart_account_id", None) and not getattr(account.chart_account, "is_active", True):
            blockers.append(
                _issue(
                    level="ERROR",
                    code="CANONICAL_FINANCE_ACCOUNT_LINKED_TO_INACTIVE_COA",
                    message=f"{account.name} is linked to an inactive ChartOfAccount.",
                    affected_ids=[account.id],
                    repairable=True,
                    operator_action="Map the finance account to an active posting ASSET account.",
                )
            )

    bank_upi = bank_upi_accounts.order_by("id").first()
    if bank_upi is not None:
        missing_digital_purposes = [purpose for purpose in DIGITAL_COLLECTION_PURPOSES if not _collection_mapping_ready(bank_upi, purpose)]
        if missing_digital_purposes:
            blockers.append(
                _issue(
                    level="ERROR",
                    code="BANK_UPI_COLLECTION_MAPPING_INCOMPLETE",
                    message="Main UPI / Bank Account must carry Bank, UPI, and payment-gateway collection mappings.",
                    affected_ids=[bank_upi.id],
                    repairable=True,
                    operator_action="Apply Accounting Setup defaults so UPI and Bank methods use the same finance account with separate mapping purposes.",
                )
            )

    required_collection_keys = {spec.key for spec in MANUAL_COLLECTION_CHART_ACCOUNTS}
    required_profile_keys = {spec.key for spec in SYSTEM_POSTING_PROFILE_ACCOUNTS}

    missing_canonical_keys = {row["key"] for row in canonical_accounts["missing"]}
    if missing_canonical_keys & required_collection_keys:
        blockers.append("Missing required collection ChartOfAccount(s).")
    if missing_canonical_keys & required_profile_keys:
        blockers.append("Missing required posting-profile ChartOfAccount(s).")

    if canonical_accounts["conflicts"]:
        blockers.append("Canonical ChartOfAccount conflicts detected (code/system_code mismatches).")

    if journals["posted_unbalanced_count"] > 0:
        blockers.append("Posted unbalanced journals detected.")
    if journals["posted_zero_line_count"] > 0:
        blockers.append("Posted journals with zero lines detected.")

    if ChartOfAccount.objects.filter(code__istartswith="COA-").exists():
        warnings.append("Legacy generated COA-* accounts exist.")
    if ChartOfAccount.objects.filter(code__istartswith="BRG-").exists():
        warnings.append("Legacy BRG-* bridge collection accounts exist.")
    if canonical_accounts["claimable"]:
        warnings.append("Canonical codes exist without system_code (claimable).")
    if posting_profiles["legacy_mapped"]:
        warnings.append("Posting profiles mapped to legacy ChartOfAccount rows.")
    if coa["duplicate_names"]:
        warnings.append("Duplicate normalized ChartOfAccount names detected.")

    status = "OK"
    if blockers:
        status = "BLOCKED"
    elif warnings:
        status = "WARNING"

    return {
        "status": status,
        "blockers": blockers,
        "warnings": warnings,
        "infos": infos,
        "issues": [*blockers, *warnings, *infos],
        "generated_at": timezone.now().isoformat(),
        "finance_accounts": finance_accounts,
        "finance_account_model": {
            "operating_model": "TWO_REAL_SETTLEMENT_ACCOUNTS",
            "cash_account_name": MAIN_CASH_FINANCE_ACCOUNT_NAME,
            "digital_account_name": MAIN_BANK_UPI_FINANCE_ACCOUNT_NAME,
            "bank_and_upi_share_same_finance_account": True,
            "payment_method_split_is_preserved": True,
        },
        "canonical_accounts": canonical_accounts,
        "posting_profiles": posting_profiles,
        "coa": coa,
        "journals": journals,
        "bridges": bridges,
    }
