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
    FinanceAccountKind,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from accounting.services.accounting_setup_catalog import (
    CANONICAL_CHART_ACCOUNT_BY_KEY,
    MANUAL_COLLECTION_CHART_ACCOUNTS,
    SYSTEM_POSTING_PROFILE_ACCOUNTS,
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


def _finance_kind_snapshot(kind: str) -> dict[str, Any]:
    active = list(
        FinanceAccount.objects.filter(
            kind=kind,
            is_active=True,
            is_real_settlement_account=True,
        )
        .select_related("chart_account")
        .order_by("id")
    )
    linked_to_inactive = [
        a.id for a in active if getattr(a, "chart_account_id", None) and not getattr(a.chart_account, "is_active", True)
    ]
    return {
        "active_count": len(active),
        "active": [
            {
                "id": a.id,
                "name": a.name,
                "chart_account_id": a.chart_account_id,
                "chart_account_code": getattr(a.chart_account, "code", None),
                "chart_account_name": getattr(a.chart_account, "name", None),
                "chart_account_is_active": getattr(a.chart_account, "is_active", None),
            }
            for a in active
        ],
        "linked_to_inactive_coa_ids": linked_to_inactive,
    }


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

    # Duplicate normalized names (active rows only)
    names = list(
        ChartOfAccount.objects.filter(is_active=True).values_list("name", flat=True)
    )
    normalized = [_norm_name(n) for n in names if _norm_name(n)]
    counts = Counter(normalized)
    duplicate_names = [name for name, c in counts.items() if c > 1][:50]

    # System code conflicts for canonical catalog keys
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


def get_accounting_setup_health() -> dict[str, Any]:
    """
    Go-live focused accounting readiness health.

    This intentionally does not mutate data. Use setup_defaults_service.apply_accounting_setup_defaults()
    to apply canonical defaults.
    """

    canonical_accounts = _canonical_account_health()
    finance_accounts = {
        FinanceAccountKind.CASH: _finance_kind_snapshot(FinanceAccountKind.CASH),
        FinanceAccountKind.BANK: _finance_kind_snapshot(FinanceAccountKind.BANK),
        FinanceAccountKind.UPI: _finance_kind_snapshot(FinanceAccountKind.UPI),
    }
    posting_profiles = _posting_profiles_snapshot()
    journals = _journal_integrity_snapshot()
    coa = _coa_snapshot()
    bridges = _bridge_snapshot()

    blockers: list[str] = []
    warnings: list[str] = []

    for kind, snapshot in finance_accounts.items():
        if snapshot["active_count"] == 0:
            blockers.append(f"Missing active {kind} FinanceAccount.")
        if snapshot["active_count"] > 1:
            blockers.append(f"Multiple active {kind} FinanceAccounts configured.")
        if snapshot["linked_to_inactive_coa_ids"]:
            blockers.append(f"{kind} FinanceAccount linked to inactive ChartOfAccount.")

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
        "generated_at": timezone.now().isoformat(),
        "finance_accounts": finance_accounts,
        "canonical_accounts": canonical_accounts,
        "posting_profiles": posting_profiles,
        "coa": coa,
        "journals": journals,
        "bridges": bridges,
    }
