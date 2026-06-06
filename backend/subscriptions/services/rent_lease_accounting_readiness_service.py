from __future__ import annotations

from typing import Any

from django.db import connection
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount
from accounting.services.document_sequence_service import (
    DocumentNumberingSetupError,
    DocumentType,
    validate_document_numbering_ready,
)
from accounting.services.finance_account_readiness import finance_account_readiness
from accounting.services.period_service import build_accounting_period_readiness
from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandType
from subscriptions.services.rent_lease_finance_sync_service import get_active_account_mapping

POSTING_MODE_AUDIT_DEFERRED = "AUDIT_DEFERRED"
POSTING_MODE_POSTING_ENABLED = "POSTING_ENABLED"
POSTING_APPROVAL_REQUIRED_ACTION = "Enable bridge posting through approved accounting bridge workflow."


def _account_payload(account: ChartOfAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {
        "id": account.id,
        "code": account.code,
        "name": account.name,
        "account_type": account.account_type,
        "system_code": account.system_code,
        "is_active": account.is_active,
    }


def _finance_account_payload(account: FinanceAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "is_active": account.is_active,
        "is_real_settlement_account": account.is_real_settlement_account,
        "chart_account": _account_payload(account.chart_account),
    }


def _extra_mapping_ids(mapping_id: int | None) -> dict[str, int | None]:
    if not mapping_id:
        return {
            "customer_advance_liability_account_id": None,
            "rent_income_account_id": None,
            "lease_income_account_id": None,
        }
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT customer_advance_liability_account_id, rent_income_account_id, lease_income_account_id
            FROM accounting_rent_lease_account_mappings
            WHERE id = %s
            """,
            [mapping_id],
        )
        row = cursor.fetchone()
    if not row:
        return {
            "customer_advance_liability_account_id": None,
            "rent_income_account_id": None,
            "lease_income_account_id": None,
        }
    return {
        "customer_advance_liability_account_id": row[0],
        "rent_income_account_id": row[1],
        "lease_income_account_id": row[2],
    }


def _chart_error(account: ChartOfAccount | None, expected_type: str, label: str) -> str | None:
    if account is None:
        return f"{label} is missing."
    if not account.is_active:
        return f"{label} is inactive."
    if account.account_type != expected_type:
        return f"{label} must be {expected_type}."
    return None


def _settlement_error(account: FinanceAccount | None) -> str | None:
    if account is None:
        return "Settlement finance account is missing."
    if not account.is_active:
        return "Settlement finance account is inactive."
    readiness = finance_account_readiness(account)
    if not account.is_real_settlement_account or not readiness.selectable_for_collection:
        return readiness.collection_blocker_reason or "Settlement finance account must be collection-ready."
    if not account.chart_account_id:
        return "Settlement finance account must map to an active ASSET chart account."
    if not account.chart_account.is_active:
        return "Settlement finance account chart account is inactive."
    if account.chart_account.account_type != ChartOfAccountType.ASSET:
        return "Settlement finance account must map to ASSET."
    return None


def _period_readiness_payload() -> dict[str, Any]:
    reference_date = timezone.localdate()
    readiness = build_accounting_period_readiness(reference_date)
    active_financial_year = readiness.get("active_financial_year")
    current_period = readiness.get("current_period")
    blockers = [str(error) for error in readiness.get("errors") or []]
    journal_numbering_ready = False

    if readiness.get("is_ready"):
        try:
            validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, reference_date)
            journal_numbering_ready = True
        except DocumentNumberingSetupError as exc:
            blockers.append(str(exc))

    return {
        "reference_date": reference_date.isoformat(),
        "financial_year_ready": active_financial_year is not None and not any(
            "financial year" in reason.lower() for reason in blockers
        ),
        "accounting_period_ready": bool(readiness.get("is_ready")),
        "journal_numbering_ready": journal_numbering_ready,
        "posting_controls_ready": bool(readiness.get("is_ready") and journal_numbering_ready and not blockers),
        "active_financial_year": {
            "id": active_financial_year.id,
            "code": active_financial_year.code,
            "name": active_financial_year.name,
            "start_date": active_financial_year.start_date.isoformat(),
            "end_date": active_financial_year.end_date.isoformat(),
            "is_active": active_financial_year.is_active,
        } if active_financial_year else None,
        "current_period": {
            "id": current_period.id,
            "code": current_period.code,
            "name": current_period.name or current_period.label,
            "start_date": current_period.start_date.isoformat(),
            "end_date": current_period.end_date.isoformat(),
            "status": current_period.status,
            "is_locked": current_period.is_locked,
        } if current_period else None,
        "blockers": blockers,
        "warnings": [str(warning) for warning in readiness.get("warnings") or []],
    }


def get_rent_lease_accounting_readiness(*, auto_create: bool = True) -> dict[str, Any]:
    mapping = get_active_account_mapping(auto_create=auto_create)
    field_errors: dict[str, list[str]] = {}
    blockers: list[str] = []
    period_readiness = _period_readiness_payload()

    if ChartOfAccount.objects.filter(is_active=True).count() == 0:
        blockers.append("Chart of Accounts records are missing.")
    if FinanceAccount.objects.filter(is_active=True).count() == 0:
        blockers.append("Finance accounts are missing.")

    if mapping is None:
        blockers.append("Active rent/lease account mapping is missing.")
    else:
        checks = [
            ("monthly_income_account", mapping.monthly_income_account, ChartOfAccountType.INCOME, "Monthly income account"),
            ("deposit_liability_account", mapping.deposit_liability_account, ChartOfAccountType.LIABILITY, "Security deposit liability account"),
            ("deposit_refund_account", mapping.deposit_refund_account, ChartOfAccountType.ASSET, "Deposit refund account"),
            ("damage_recovery_income_account", mapping.damage_recovery_income_account, ChartOfAccountType.INCOME, "Damage recovery income account"),
        ]
        for field, account, expected_type, label in checks:
            error = _chart_error(account, expected_type, label)
            if error:
                field_errors.setdefault(field, []).append(error)
                blockers.append(error)
        settlement_error = _settlement_error(mapping.settlement_finance_account)
        if settlement_error:
            field_errors.setdefault("settlement_finance_account", []).append(settlement_error)
            blockers.append(settlement_error)

    mapping_blockers = list(blockers)
    mapping_ready = not mapping_blockers
    blockers.extend(period_readiness["blockers"])
    status = "READY" if not blockers else "NEEDS_ACCOUNTING_PERIOD" if period_readiness["blockers"] and mapping_ready else "NEEDS_MAPPING"
    extra_ids = _extra_mapping_ids(mapping.id if mapping else None)
    accounts = {
        "monthly_income": _account_payload(mapping.monthly_income_account) if mapping else None,
        "deposit_liability": _account_payload(mapping.deposit_liability_account) if mapping else None,
        "deposit_refund": _account_payload(mapping.deposit_refund_account) if mapping else None,
        "damage_recovery": _account_payload(mapping.damage_recovery_income_account) if mapping else None,
        "settlement_finance_account": _finance_account_payload(mapping.settlement_finance_account) if mapping else None,
    }
    mapping_snapshot = None
    if mapping is not None:
        mapping_snapshot = {
            "mapping_configured": True,
            "mapping_id": mapping.id,
            "id": mapping.id,
            "monthly_income_account_id": mapping.monthly_income_account_id,
            "deposit_liability_account_id": mapping.deposit_liability_account_id,
            "deposit_refund_account_id": mapping.deposit_refund_account_id,
            "damage_recovery_income_account_id": mapping.damage_recovery_income_account_id,
            "settlement_finance_account_id": mapping.settlement_finance_account_id,
            **extra_ids,
        }
    from subscriptions.services.rent_lease_posting_bridge_config_service import get_rent_lease_posting_bridge_state

    bridge_state = get_rent_lease_posting_bridge_state(
        readiness={
            "status": status,
            "mapping_ready": mapping_ready,
            "posting_controls_ready": period_readiness["posting_controls_ready"],
        }
    )
    posting_bridge_approved = bool(bridge_state["posting_bridge_approved"])
    posting_bridge_ready = bool(bridge_state["posting_bridge_ready"])
    posting_mode = bridge_state["posting_mode"]
    posting_message = (
        "Operational source collection, mapping, and posting bridge approval are ready. Future explicit posting execution is enabled."
        if posting_bridge_ready
        else "Operational source collection and mapping are ready. Accounting bridge posting remains audit-deferred until approval is enabled."
        if mapping_ready and period_readiness["posting_controls_ready"]
        else "Financial year, accounting period, or journal numbering setup must be completed before bridge posting."
        if mapping_ready
        else blockers[0] if blockers else "Rent/lease accounting mapping is not ready."
    )
    return {
        "status": status,
        "reason": "Rent/lease accounting bridge is ready." if status == "READY" else blockers[0] if blockers else "",
        "mapping_id": mapping.id if mapping else None,
        "field_errors": field_errors,
        "blockers": blockers,
        "source_collection_enabled": True,
        "accounting_bridge_enabled": mapping_ready and period_readiness["posting_controls_ready"],
        "collection_ready": True,
        "mapping_ready": mapping_ready,
        "financial_year_ready": period_readiness["financial_year_ready"],
        "accounting_period_ready": period_readiness["accounting_period_ready"],
        "journal_numbering_ready": period_readiness["journal_numbering_ready"],
        "posting_controls_ready": period_readiness["posting_controls_ready"],
        "posting_bridge_ready": posting_bridge_ready,
        "posting_bridge_approved": posting_bridge_approved,
        "posting_mode": posting_mode,
        "message": posting_message,
        "operator_action": None if posting_bridge_ready else POSTING_APPROVAL_REQUIRED_ACTION if mapping_ready else "Complete rent/lease COA, finance account, and mapping setup.",
        "posting_bridge_config": bridge_state["config"],
        "financial_year_readiness": period_readiness,
        "accounting_period_readiness": period_readiness,
        "mapping": mapping_snapshot or {"mapping_configured": False},
        "accounts": accounts,
        "counters": {
            "deposit_sources_with_collection": RentLeaseBillingDemand.objects.filter(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT, collected_amount__gt=0).count(),
            "monthly_sources_with_collection": RentLeaseBillingDemand.objects.filter(demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY], collected_amount__gt=0).count(),
        },
    }
