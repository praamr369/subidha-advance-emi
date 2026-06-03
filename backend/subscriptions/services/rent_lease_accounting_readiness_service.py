from __future__ import annotations

from typing import Any

from django.db import connection

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount
from accounting.services.finance_account_readiness import finance_account_readiness
from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandType
from subscriptions.services.rent_lease_finance_sync_service import get_active_account_mapping


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


def get_rent_lease_accounting_readiness(*, auto_create: bool = True) -> dict[str, Any]:
    mapping = get_active_account_mapping(auto_create=auto_create)
    field_errors: dict[str, list[str]] = {}
    blockers: list[str] = []

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

    status = "READY" if not blockers else "NEEDS_MAPPING"
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
    return {
        "status": status,
        "reason": "Rent/lease accounting bridge is ready." if status == "READY" else blockers[0] if blockers else "",
        "mapping_id": mapping.id if mapping else None,
        "field_errors": field_errors,
        "blockers": blockers,
        "source_collection_enabled": True,
        "accounting_bridge_enabled": status == "READY",
        "mapping": mapping_snapshot or {"mapping_configured": False},
        "accounts": accounts,
        "counters": {
            "deposit_sources_with_collection": RentLeaseBillingDemand.objects.filter(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT, collected_amount__gt=0).count(),
            "monthly_sources_with_collection": RentLeaseBillingDemand.objects.filter(demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY], collected_amount__gt=0).count(),
        },
    }
