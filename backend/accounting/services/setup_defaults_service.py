from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass
from typing import Any

from django.db import connection, transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from accounting.models import (
    AccountingPostingProfile,
    ChartOfAccount,
    DocumentSequence,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    JournalEntryLine,
    RentLeaseAccountingAccountMapping,
)
from accounting.services.accounting_setup_catalog import (
    CANONICAL_CHART_ACCOUNT_BY_CODE,
    CANONICAL_CHART_ACCOUNT_BY_KEY,
    MANUAL_COLLECTION_CHART_ACCOUNTS,
    SYSTEM_POSTING_PROFILE_ACCOUNTS,
)
from accounting.services.accounting_setup_service import (
    LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
)
from accounting.services.document_sequence_service import (
    DocumentNumberingSetupError,
    DocumentType,
    get_or_create_sequence_for_document_type,
)
from accounting.services.system_accounts_service import ensure_system_account


def _norm(text: str | None) -> str:
    return " ".join((text or "").strip().lower().split())


def _is_generated_coa_code(code: str | None) -> bool:
    c = (code or "").strip().upper()
    return c.startswith("COA-") or c == "COA"


@dataclass(frozen=True)
class PreviewAction:
    kind: str
    payload: dict[str, Any]


def _canonical_account_scan() -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {"create": [], "claim": [], "present": [], "conflicts": [], "inactive": []}
    for key, spec in CANONICAL_CHART_ACCOUNT_BY_KEY.items():
        by_system = ChartOfAccount.objects.filter(system_code=key).first()
        by_code = ChartOfAccount.objects.filter(code__iexact=spec.code).first()
        if by_system is not None:
            groups["present"].append({"key": key, "id": by_system.id, "code": by_system.code, "name": by_system.name, "account_type": by_system.account_type, "is_active": by_system.is_active, "allow_manual_posting": by_system.allow_manual_posting})
            if not by_system.is_active:
                groups["inactive"].append({"key": key, "id": by_system.id, "code": by_system.code, "name": by_system.name})
            if by_system.code.strip().upper() != spec.code.strip().upper():
                groups["conflicts"].append({"key": key, "reason": "SYSTEM_CODE_CODE_MISMATCH", "id": by_system.id, "expected_code": spec.code, "actual_code": by_system.code})
            continue
        if by_code is not None:
            existing_system_code = (by_code.system_code or "").strip().upper() or None
            if existing_system_code is None:
                groups["claim"].append({"key": key, "id": by_code.id, "code": by_code.code, "name": by_code.name, "account_type": by_code.account_type, "allow_manual_posting": by_code.allow_manual_posting})
            elif existing_system_code != key:
                groups["conflicts"].append({"key": key, "reason": "CODE_SYSTEM_CODE_CONFLICT", "id": by_code.id, "code": by_code.code, "existing_system_code": existing_system_code, "expected_system_code": key})
            continue
        groups["create"].append({"key": key, "code": spec.code, "name": spec.name, "account_type": spec.account_type, "allow_manual_posting": spec.allow_manual_posting})
    return groups


def _default_finance_account_plan() -> dict[str, Any]:
    return {
        "CASH": {"name": "Main Cash Desk", "kind": FinanceAccountKind.CASH, "chart_key": "CASH_COLLECTION", "active_by_default": True},
        "BANK": {"name": "Main Bank Account", "kind": FinanceAccountKind.BANK, "chart_key": "BANK_COLLECTION", "active_by_default": True},
        "UPI": {"name": "UPI Account", "kind": FinanceAccountKind.UPI, "chart_key": "UPI_COLLECTION", "active_by_default": True},
        "PGW": {"name": "Payment Gateway Settlement Account", "kind": FinanceAccountKind.BANK, "chart_key": "PAYMENT_GATEWAY_COLLECTION", "active_by_default": False},
    }


def _finance_account_duplicate_snapshot() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for kind in (FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI):
        active = list(FinanceAccount.objects.filter(kind=kind, is_active=True, is_real_settlement_account=True).select_related("chart_account").order_by("id"))
        out[kind] = {"active_count": len(active), "active": [{"id": a.id, "name": a.name, "chart_account_id": a.chart_account_id, "chart_account_code": getattr(a.chart_account, "code", None), "chart_account_name": getattr(a.chart_account, "name", None)} for a in active]}
    return out


def _legacy_duplicate_candidates() -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    canonical_by_norm: dict[str, str] = {}
    for spec in CANONICAL_CHART_ACCOUNT_BY_KEY.values():
        canonical_by_norm[_norm(spec.name)] = spec.key
    qs = ChartOfAccount.objects.filter(is_legacy=False).only("id", "code", "name", "system_code", "account_type").order_by("id")
    for row in qs.iterator():
        if not _is_generated_coa_code(row.code):
            continue
        key = canonical_by_norm.get(_norm(row.name))
        if not key:
            continue
        canonical = ChartOfAccount.objects.filter(system_code=key).only("id", "code", "name").first()
        if canonical is None or canonical.id == row.id:
            continue
        candidates.append({"id": row.id, "code": row.code, "name": row.name, "account_type": row.account_type, "reason": f"Duplicate of canonical {canonical.code} ({key})", "superseded_by_id": canonical.id, "superseded_by_code": canonical.code, "superseded_by_name": canonical.name})
    return candidates


def preview_accounting_setup_defaults() -> dict[str, Any]:
    canonical = _canonical_account_scan()
    finance_plan = _default_finance_account_plan()
    finance_dupes = _finance_account_duplicate_snapshot()
    finance_to_create: list[dict[str, Any]] = []
    for spec in finance_plan.values():
        if not FinanceAccount.objects.filter(name__iexact=spec["name"]).exists():
            finance_to_create.append(spec)
    posting_profiles_create: list[dict[str, Any]] = []
    posting_profiles_update: list[dict[str, Any]] = []
    for spec in SYSTEM_POSTING_PROFILE_ACCOUNTS:
        chart = ChartOfAccount.objects.filter(system_code=spec.key).first()
        if chart is None:
            continue
        profile = AccountingPostingProfile.objects.filter(key=spec.key).first()
        if profile is None:
            posting_profiles_create.append({"key": spec.key, "label": spec.name, "chart_account_id": chart.id, "chart_account_code": chart.code, "chart_account_name": chart.name})
        elif profile.chart_account_id != chart.id or (profile.label or "").strip() != spec.name.strip():
            posting_profiles_update.append({"id": profile.id, "key": profile.key, "current_chart_account_id": profile.chart_account_id, "target_chart_account_id": chart.id, "current_label": profile.label, "target_label": spec.name})
    manual_review: list[str] = []
    for kind, snapshot in finance_dupes.items():
        if snapshot["active_count"] > 1:
            manual_review.append(f"Multiple active {kind} finance accounts detected; defaults will preserve all active accounts.")
    if canonical["conflicts"]:
        manual_review.append("Canonical COA conflicts detected (code/system_code mismatches).")
    return {"generated_at": timezone.now().isoformat(), "canonical_accounts": canonical, "finance_accounts": {"to_create": finance_to_create, "duplicates": finance_dupes}, "posting_profiles": {"to_create": posting_profiles_create, "to_update": posting_profiles_update}, "legacy_candidates": {"coa_duplicates_to_mark_legacy": _legacy_duplicate_candidates()}, "manual_review": manual_review}


def _ensure_ledger_anchor_finance_account(*, bank_chart: ChartOfAccount) -> FinanceAccount:
    ledger_name = LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip()
    existing = FinanceAccount.objects.filter(name__iexact=ledger_name).order_by("id").first()
    if existing is not None:
        updates: dict[str, Any] = {}
        if not existing.is_active:
            updates["is_active"] = True
        if existing.chart_account_id != bank_chart.id:
            updates["chart_account"] = bank_chart
        if existing.kind != FinanceAccountKind.BANK:
            updates["kind"] = FinanceAccountKind.BANK
        if existing.is_real_settlement_account:
            updates["is_real_settlement_account"] = False
        if updates:
            for field, value in updates.items():
                setattr(existing, field, value)
            existing.save(update_fields=[*updates.keys(), "updated_at"])
        return existing
    return FinanceAccount.objects.create(name=ledger_name, kind=FinanceAccountKind.BANK, chart_account=bank_chart, opening_balance="0.00", is_real_settlement_account=False, is_active=True, notes="System posting profiles anchor (do not use for receipts).")


def _ensure_finance_account(*, name: str, kind: str, chart_account: ChartOfAccount, active_by_default: bool) -> FinanceAccount:
    existing = FinanceAccount.objects.filter(name__iexact=name).order_by("id").first()
    if existing is not None:
        updates: dict[str, Any] = {}
        if existing.kind != kind:
            updates["kind"] = kind
        if existing.chart_account_id != chart_account.id:
            updates["chart_account"] = chart_account
        if not existing.is_real_settlement_account:
            updates["is_real_settlement_account"] = True
        if active_by_default and not existing.is_active:
            updates["is_active"] = True
        if updates:
            for field, value in updates.items():
                setattr(existing, field, value)
            existing.save(update_fields=[*updates.keys(), "updated_at"])
        return existing
    return FinanceAccount.objects.create(name=name, kind=kind, chart_account=chart_account, opening_balance="0.00", is_real_settlement_account=True, is_active=bool(active_by_default), notes="Seeded by accounting setup defaults.")


def _finance_account_has_posted_usage(finance_account: FinanceAccount) -> bool:
    return JournalEntryLine.objects.filter(journal_entry__status="POSTED", chart_account_id=finance_account.chart_account_id).exists()


def _deactivate_duplicate_finance_accounts_if_safe(*, kind: str) -> list[dict[str, Any]]:
    active = list(FinanceAccount.objects.filter(kind=kind, is_active=True, is_real_settlement_account=True).order_by("id"))
    if len(active) <= 1:
        return []
    return [{"kind": kind, "status": "PRESERVED_MULTIPLE_ACTIVE_ACCOUNTS", "reason": "Multiple active finance accounts are supported and evaluated independently; defaults did not deactivate or remap them.", "active_finance_account_ids": [row.id for row in active]}]


def _ensure_journal_entry_numbering_profile() -> dict[str, Any]:
    try:
        before = DocumentSequence.objects.count()
        sequence = get_or_create_sequence_for_document_type(DocumentType.JOURNAL_ENTRY, timezone.localdate())
    except DocumentNumberingSetupError as exc:
        return {"created": False, "blocked": True, "detail": str(exc)}
    return {
        "created": DocumentSequence.objects.count() > before,
        "blocked": False,
        "id": sequence.id,
        "document_type": sequence.document_type,
        "series_code": sequence.series_code,
        "financial_year": sequence.financial_year,
        "next_number": sequence.next_number,
    }


def _ensure_collection_mappings(*, performed_by=None, finance_accounts: dict[str, FinanceAccount], chart_accounts: dict[str, ChartOfAccount], ledger_anchor: FinanceAccount) -> dict[str, Any]:
    purpose_to_target_chart_key: dict[str, str] = {
        FinanceAccountMappingPurpose.CASH_COLLECTION: "CASH_COLLECTION",
        FinanceAccountMappingPurpose.BANK_COLLECTION: "BANK_COLLECTION",
        FinanceAccountMappingPurpose.UPI_COLLECTION: "UPI_COLLECTION",
        FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION: "PAYMENT_GATEWAY_COLLECTION",
        FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE: "CUSTOMER_RECEIVABLE",
        FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY: "SECURITY_DEPOSIT_LIABILITY",
        FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE: "CUSTOMER_ADVANCE_UNEARNED_REVENUE",
        FinanceAccountMappingPurpose.EMI_INCOME: "EMI_INCOME",
        FinanceAccountMappingPurpose.RENT_INCOME: "RENT_INCOME",
        FinanceAccountMappingPurpose.LEASE_INCOME: "LEASE_INCOME",
        FinanceAccountMappingPurpose.DIRECT_SALE_INCOME: "SALES_REVENUE",
        FinanceAccountMappingPurpose.DELIVERY_CHARGES_INCOME: "DELIVERY_CHARGES_INCOME",
        FinanceAccountMappingPurpose.WAIVER_LOSS: "EMI_WAIVER_EXPENSE",
        FinanceAccountMappingPurpose.COMMISSION_PAYABLE: "PARTNER_COMMISSION_PAYABLE",
        FinanceAccountMappingPurpose.COMMISSION_EXPENSE: "PARTNER_COMMISSION_EXPENSE",
        FinanceAccountMappingPurpose.DAMAGE_RECOVERY: "DAMAGE_RECOVERY",
        FinanceAccountMappingPurpose.DELIVERY_EXPENSE: "DELIVERY_EXPENSE",
        FinanceAccountMappingPurpose.SALARY_EXPENSE: "SALARY_EXPENSE",
        FinanceAccountMappingPurpose.INVENTORY_ASSET: "INVENTORY_ASSET",
    }
    created: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []
    for purpose, chart_key in purpose_to_target_chart_key.items():
        target_chart = chart_accounts.get(chart_key) or ChartOfAccount.objects.filter(system_code=chart_key).first()
        if target_chart is None:
            continue
        if purpose in {FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.BANK_COLLECTION, FinanceAccountMappingPurpose.UPI_COLLECTION, FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION}:
            target_finance = finance_accounts["CASH"] if purpose == FinanceAccountMappingPurpose.CASH_COLLECTION else finance_accounts["BANK"] if purpose == FinanceAccountMappingPurpose.BANK_COLLECTION else finance_accounts["UPI"] if purpose == FinanceAccountMappingPurpose.UPI_COLLECTION else finance_accounts["PGW"]
        else:
            target_finance = ledger_anchor
        mapping = FinanceAccountCoaMapping.objects.filter(finance_account=target_finance, purpose=purpose, is_active=True).first()
        if mapping is None:
            mapping = FinanceAccountCoaMapping.objects.filter(purpose=purpose, is_default=True, is_active=True).first()
        if mapping is None:
            mapping = FinanceAccountCoaMapping.objects.create(finance_account=target_finance, chart_account=target_chart, purpose=purpose, is_default=True, is_active=True, created_by=performed_by, updated_by=performed_by, notes="Seeded by accounting setup defaults.")
            created.append({"id": mapping.id, "purpose": purpose, "finance_account_id": target_finance.id})
        else:
            changes = {}
            if mapping.finance_account_id == target_finance.id and mapping.chart_account_id != target_chart.id:
                changes["chart_account"] = target_chart
            if (
                not mapping.is_default
                and not FinanceAccountCoaMapping.objects.filter(
                    purpose=purpose,
                    is_active=True,
                    is_default=True,
                ).exclude(pk=mapping.pk).exists()
            ):
                changes["is_default"] = True
            if changes:
                for field, value in changes.items():
                    setattr(mapping, field, value)
                mapping.updated_by = performed_by
                mapping.notes = (mapping.notes or "").strip()
                mapping.save()
                updated.append({"id": mapping.id, "purpose": purpose})
    for account in FinanceAccount.objects.filter(is_active=True, is_real_settlement_account=True).select_related("chart_account"):
        if account.kind == FinanceAccountKind.CASH:
            purpose = FinanceAccountMappingPurpose.CASH_COLLECTION
        elif account.kind == FinanceAccountKind.UPI:
            purpose = FinanceAccountMappingPurpose.UPI_COLLECTION
        else:
            purpose = FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION if "PAYMENT GATEWAY" in (account.name or "").strip().upper() else FinanceAccountMappingPurpose.BANK_COLLECTION
        if FinanceAccountCoaMapping.objects.filter(finance_account=account, purpose=purpose, is_active=True).exists():
            continue
        mapped_chart = account.chart_account
        if mapped_chart is None or not mapped_chart.is_active:
            continue
        mapping = FinanceAccountCoaMapping.objects.create(finance_account=account, chart_account=mapped_chart, purpose=purpose, is_default=not FinanceAccountCoaMapping.objects.filter(purpose=purpose, is_active=True, is_default=True).exists(), is_active=True, created_by=performed_by, updated_by=performed_by, notes="Seeded by accounting setup defaults (settlement account coverage).")
        created.append({"id": mapping.id, "purpose": purpose, "finance_account_id": account.id})
    return {"created": created, "updated": updated}


def _ensure_rent_lease_account_mapping(
    *,
    chart_accounts: dict[str, ChartOfAccount],
    finance_accounts: dict[str, FinanceAccount],
) -> dict[str, Any]:
    required = {
        "monthly_income_account": "RENT_INCOME",
        "rent_income_account": "RENT_INCOME",
        "lease_income_account": "LEASE_INCOME",
        "deposit_liability_account": "SECURITY_DEPOSIT_LIABILITY",
        "deposit_refund_account": "CASH_COLLECTION",
        "damage_recovery_income_account": "DAMAGE_RECOVERY",
        "customer_advance_liability_account": "CUSTOMER_ADVANCE_UNEARNED_REVENUE",
    }
    missing = [key for key in required.values() if key not in chart_accounts]
    settlement = finance_accounts.get("CASH") or finance_accounts.get("UPI") or finance_accounts.get("BANK")
    if settlement is None:
        missing.append("settlement_finance_account")
    if missing:
        return {"status": "SKIPPED", "missing": sorted(set(missing))}

    mapping = RentLeaseAccountingAccountMapping.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    created = mapping is None
    if mapping is None:
        mapping = RentLeaseAccountingAccountMapping(is_active=True)
    mapping.monthly_income_account = chart_accounts["RENT_INCOME"]
    mapping.deposit_liability_account = chart_accounts["SECURITY_DEPOSIT_LIABILITY"]
    mapping.deposit_refund_account = chart_accounts["CASH_COLLECTION"]
    mapping.damage_recovery_income_account = chart_accounts["DAMAGE_RECOVERY"]
    mapping.settlement_finance_account = settlement
    mapping.notes = "Auto-synced by accounting setup defaults from canonical COA/FA system codes."
    mapping.full_clean()
    mapping.save()

    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE accounting_rent_lease_account_mappings
            SET customer_advance_liability_account_id = %s,
                rent_income_account_id = %s,
                lease_income_account_id = %s,
                updated_at = %s
            WHERE id = %s
            """,
            [
                chart_accounts["CUSTOMER_ADVANCE_UNEARNED_REVENUE"].id,
                chart_accounts["RENT_INCOME"].id,
                chart_accounts["LEASE_INCOME"].id,
                timezone.now(),
                mapping.id,
            ],
        )
    return {"status": "CREATED" if created else "UPDATED", "mapping_id": mapping.id, "settlement_finance_account_id": settlement.id}


@transaction.atomic
def apply_accounting_setup_defaults(*, performed_by=None) -> dict[str, Any]:
    canonical_results: dict[str, dict[str, Any]] = {}
    chart_accounts: dict[str, ChartOfAccount] = {}
    canonical_conflicts: list[dict[str, Any]] = []
    for spec in CANONICAL_CHART_ACCOUNT_BY_KEY.values():
        result = ensure_system_account(system_code=spec.key, code=spec.code, name=spec.name, account_type=spec.account_type, allow_manual_posting=spec.allow_manual_posting, reactivate=True, performed_by=performed_by)
        code_mismatch = result.account.code.strip().upper() != spec.code.strip().upper()
        conflict = bool(result.conflict or code_mismatch)
        canonical_results[spec.key] = {"created": result.created, "claimed": result.claimed, "conflict": conflict, "id": result.account.id, "code": result.account.code, "name": result.account.name, "is_active": result.account.is_active, "allow_manual_posting": result.account.allow_manual_posting}
        if conflict:
            canonical_conflicts.append({"key": spec.key, "id": result.account.id, "code": result.account.code, "expected_code": spec.code, "system_code": result.account.system_code})
        else:
            chart_accounts[spec.key] = result.account
    if canonical_conflicts:
        return {"applied_at": timezone.now().isoformat(), "status": "BLOCKED", "blockers": ["Canonical ChartOfAccount conflicts detected; refusing to apply defaults beyond account creation/claims."], "canonical_accounts": canonical_results, "conflicts": canonical_conflicts}
    ledger_anchor = _ensure_ledger_anchor_finance_account(bank_chart=chart_accounts["BANK_COLLECTION"])
    finance_plan = _default_finance_account_plan()
    finance_accounts: dict[str, FinanceAccount] = {}
    for key, spec in finance_plan.items():
        chart = chart_accounts[spec["chart_key"]]
        finance_accounts[key] = _ensure_finance_account(name=spec["name"], kind=spec["kind"], chart_account=chart, active_by_default=spec["active_by_default"])
    duplicate_actions: list[dict[str, Any]] = []
    for kind in (FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI):
        duplicate_actions.extend(_deactivate_duplicate_finance_accounts_if_safe(kind=kind))
    profiles_created: list[dict[str, Any]] = []
    profiles_updated: list[dict[str, Any]] = []
    for spec in SYSTEM_POSTING_PROFILE_ACCOUNTS:
        chart = chart_accounts.get(spec.key)
        if chart is None:
            continue
        profile, created = AccountingPostingProfile.objects.get_or_create(key=spec.key, defaults={"label": spec.name, "chart_account": chart, "is_system_only": True, "is_active": True, "description": "Canonical system posting profile."})
        if created:
            profiles_created.append({"id": profile.id, "key": profile.key})
        else:
            updates = {}
            if profile.chart_account_id != chart.id:
                updates["chart_account"] = chart
            if (profile.label or "").strip() != spec.name.strip():
                updates["label"] = spec.name
            if not profile.is_active:
                updates["is_active"] = True
            if updates:
                for field, value in updates.items():
                    setattr(profile, field, value)
                profile.save()
                profiles_updated.append({"id": profile.id, "key": profile.key})
    mappings_result = _ensure_collection_mappings(performed_by=performed_by, finance_accounts=finance_accounts, chart_accounts=chart_accounts, ledger_anchor=ledger_anchor)
    rent_lease_mapping = _ensure_rent_lease_account_mapping(chart_accounts=chart_accounts, finance_accounts=finance_accounts)
    journal_numbering = _ensure_journal_entry_numbering_profile()
    legacy_marked: list[dict[str, Any]] = []
    for cand in _legacy_duplicate_candidates():
        ChartOfAccount.objects.filter(pk=cand["id"]).update(is_legacy=True, legacy_reason=cand["reason"], superseded_by_id=cand["superseded_by_id"])
        legacy_marked.append({"id": cand["id"], "superseded_by_id": cand["superseded_by_id"]})
    return {"applied_at": timezone.now().isoformat(), "canonical_accounts": canonical_results, "finance_accounts": {"seeded": {k: {"id": v.id, "name": v.name, "kind": v.kind, "is_active": v.is_active} for k, v in finance_accounts.items()}, "duplicate_actions": duplicate_actions, "ledger_anchor_id": ledger_anchor.id}, "posting_profiles": {"created": profiles_created, "updated": profiles_updated}, "document_numbering": {"journal_entry": journal_numbering}, "mappings": mappings_result, "rent_lease_mapping": rent_lease_mapping, "legacy": {"marked": legacy_marked}}
