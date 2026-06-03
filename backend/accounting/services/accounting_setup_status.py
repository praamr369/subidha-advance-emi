"""
Canonical accounting master + setup readiness metrics for admin UIs.

All chart/finance counts and readiness flags for Business Setup and Accounting
screens should derive from this module so totals cannot drift between pages.
"""

from __future__ import annotations

from typing import Any

from accounting.models import ChartOfAccount, FinanceAccount
from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_readiness_summary
from accounting.services.accounting_setup_service import (
    READINESS_INFORMATIONAL_WARNING_CODES,
    REQUIRED_COA_SYSTEM_CODES,
    REQUIRED_MAPPING_PURPOSES,
    AccountingSetupService,
)
from accounting.services.setup_health_service import get_accounting_setup_health


def compute_accounting_master_metrics() -> dict[str, int]:
    """Pure COA / finance account counts (ChartOfAccount vs FinanceAccount only)."""
    coa = ChartOfAccount.objects.all()
    coa_active = coa.filter(is_active=True)
    fa = FinanceAccount.objects.all()
    fa_active = fa.filter(is_active=True)
    return {
        "chart_accounts_total": coa.count(),
        "chart_accounts_active": coa_active.count(),
        "chart_accounts_inactive": coa.filter(is_active=False).count(),
        "chart_accounts_root": coa.filter(parent_id__isnull=True).count(),
        "chart_accounts_child": coa.exclude(parent_id__isnull=True).count(),
        "chart_accounts_active_root": coa_active.filter(parent_id__isnull=True).count(),
        "chart_accounts_active_child": coa_active.exclude(parent_id__isnull=True).count(),
        "finance_accounts_total": fa.count(),
        "finance_accounts_active": fa_active.count(),
        "finance_accounts_inactive": fa.filter(is_active=False).count(),
    }


def _blocking_warnings(warnings: list[dict[str, str]]) -> list[dict[str, str]]:
    return [w for w in warnings if w.get("code") not in READINESS_INFORMATIONAL_WARNING_CODES]


def build_blocking_reasons(*, validation: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    missing_coa = validation.get("missing_required_accounts") or []
    missing_map = validation.get("missing_required_mappings") or []
    if missing_coa:
        preview = ", ".join(missing_coa[:8])
        suffix = "…" if len(missing_coa) > 8 else ""
        reasons.append(f"Missing {len(missing_coa)} required system chart account(s): {preview}{suffix}")
    if missing_map:
        preview = ", ".join(missing_map[:8])
        suffix = "…" if len(missing_map) > 8 else ""
        reasons.append(f"Missing {len(missing_map)} required account mapping purpose(s): {preview}{suffix}")
    if not validation.get("ledger_anchor_present"):
        reasons.append(
            "Ledger posting profile finance account is missing or inactive "
            "(expected internal row for mapping-only purposes)."
        )
    if not validation.get("real_settlement_accounts_present"):
        reasons.append("No active cash/bank/UPI settlement finance account is configured.")
    for w in _blocking_warnings(validation.get("warnings") or []):
        msg = (w.get("message") or "").strip()
        if msg:
            reasons.append(msg)
    # De-dupe while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def get_admin_accounting_setup_status() -> dict[str, Any]:
    """
    Single payload for GET /api/v1/admin/accounting/setup/status/.

    Includes existing validate_accounting_setup() fields for backward compatibility,
    plus explicit master counts and checklist-oriented flags.
    """
    validation = AccountingSetupService.validate_accounting_setup()
    metrics = compute_accounting_master_metrics()
    missing_coa = list(validation.get("missing_required_accounts") or [])
    missing_map = list(validation.get("missing_required_mappings") or [])
    n_coa_req = len(REQUIRED_COA_SYSTEM_CODES)
    n_map_req = len(REQUIRED_MAPPING_PURPOSES)
    setup_complete = bool(validation.get("mappings_complete"))
    journal_ready = setup_complete
    blocking_reasons = build_blocking_reasons(validation=validation)
    health = get_accounting_setup_health()
    health_blockers = list(health.get("blockers") or [])
    health_warnings = list(health.get("warnings") or [])
    journals = health.get("journals") or {}
    bridges = health.get("bridges") or {}
    bridge_readiness_summary = build_accounting_bridge_readiness_summary()

    posting_ready = bool(
        setup_complete
        and not health_blockers
        and bool(validation.get("ledger_anchor_present"))
        and bool(validation.get("real_settlement_accounts_present"))
    )
    reconciliation_ready = bool(
        posting_ready
        and int(journals.get("posted_unbalanced_count") or 0) == 0
        and int(journals.get("posted_zero_line_count") or 0) == 0
        and int(bridges.get("missing_journal_count") or 0) == 0
    )

    return {
        **validation,
        **metrics,
        "required_system_accounts_total": n_coa_req,
        "required_system_accounts_present": n_coa_req - len(missing_coa),
        "required_system_accounts_missing": missing_coa,
        "required_mappings_total": n_map_req,
        "required_mappings_complete": n_map_req - len(missing_map),
        "required_mappings_missing": missing_map,
        "bridge_readiness": bridge_readiness_summary,
        "journals_configured": True,
        "journal_ready": journal_ready,
        "setup_complete": setup_complete,
        "blocking_reasons": blocking_reasons,
        "setup_health_status": health.get("status"),
        "setup_health_blockers_count": len(health_blockers),
        "setup_health_warnings_count": len(health_warnings),
        "posting_readiness": "READY" if posting_ready else "BLOCKED",
        "reconciliation_readiness": "READY" if reconciliation_ready else "BLOCKED",
    }
