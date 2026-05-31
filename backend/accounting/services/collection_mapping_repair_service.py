from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount
from accounting.services.finance_account_readiness import chart_account_allowed_for_collection, finance_account_readiness
from accounting.services.master_edit_service import AccountingMasterUpdateService
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

CONFIRM_COLLECTION_MAPPING_REPAIR = "REPAIR COLLECTION MAPPINGS"
HISTORICAL_MUTATION_NOTE = (
    "This will not post payments, create receipts, rewrite journals, settlements, "
    "reconciliations, or day-close records."
)


def _chart_payload(chart: ChartOfAccount | None) -> dict[str, Any] | None:
    if chart is None:
        return None
    return {
        "id": chart.id,
        "code": chart.code,
        "name": chart.name,
        "account_type": chart.account_type,
        "is_active": chart.is_active,
        "allow_manual_posting": chart.allow_manual_posting,
        "is_group_control": bool(chart.children.exists() or not chart.allow_manual_posting),
        "allowed_for_collection": chart_account_allowed_for_collection(chart),
        "parent_id": chart.parent_id,
    }


def _posting_child_system_code(parent: ChartOfAccount) -> str:
    base = (parent.system_code or parent.code or f"COA_{parent.pk}").strip().upper()
    suffix = "_POSTING"
    return f"{base[: max(1, 50 - len(suffix))]}{suffix}"


def _posting_child_code(parent: ChartOfAccount) -> str:
    suffix = "-P"
    base = (parent.code or f"COA-{parent.pk}").strip().upper()
    return f"{base[: max(1, 30 - len(suffix))]}{suffix}"


def _find_existing_posting_child(parent: ChartOfAccount, *, kind: str) -> ChartOfAccount | None:
    system_code = _posting_child_system_code(parent)
    candidate = ChartOfAccount.objects.filter(system_code=system_code, is_active=True).prefetch_related("children").first()
    if candidate and chart_account_allowed_for_collection(candidate, kind=kind):
        return candidate
    candidate = (
        ChartOfAccount.objects.filter(
            parent=parent,
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        .prefetch_related("children")
        .order_by("code", "id")
        .first()
    )
    if candidate and chart_account_allowed_for_collection(candidate, kind=kind):
        return candidate
    return None


def _preview_for_account(account: FinanceAccount) -> dict[str, Any]:
    readiness = finance_account_readiness(account)
    current = getattr(account, "chart_account", None)
    base = {
        "finance_account_id": account.id,
        "finance_account_name": account.name,
        "finance_account_kind": account.kind,
        "current_chart_account": _chart_payload(current),
        "blocker_reason": readiness.collection_blocker_reason,
        "risk_note": HISTORICAL_MUTATION_NOTE,
        "historical_mutation": False,
        "diagnostic_only": readiness.diagnostic_only,
        "selectable_for_collection": readiness.selectable_for_collection,
    }
    if readiness.collection_ready:
        return {
            **base,
            "repairable": False,
            "repair_action_type": "NOT_REPAIRABLE",
            "suggested_posting_chart_account": _chart_payload(current),
            "reason": "Already collection-ready.",
        }
    if readiness.diagnostic_only:
        return {
            **base,
            "repairable": False,
            "repair_action_type": "NOT_REPAIRABLE",
            "suggested_posting_chart_account": None,
            "reason": readiness.collection_blocker_reason,
        }
    if current is None:
        return {
            **base,
            "repairable": False,
            "repair_action_type": "NOT_REPAIRABLE",
            "suggested_posting_chart_account": None,
            "reason": "Finance account has no mapped chart account to repair from.",
        }
    if (not current.is_active) or current.account_type != ChartOfAccountType.ASSET:
        return {
            **base,
            "repairable": False,
            "repair_action_type": "NOT_REPAIRABLE",
            "suggested_posting_chart_account": None,
            "reason": "Current mapping is not an active ASSET group/control account.",
        }
    existing_child = _find_existing_posting_child(current, kind=account.kind)
    if existing_child is not None:
        return {
            **base,
            "repairable": True,
            "repair_action_type": "REMAP_TO_EXISTING_POSTING_ACCOUNT",
            "suggested_posting_chart_account": _chart_payload(existing_child),
            "reason": "Existing posting-enabled leaf ASSET account found below current group/control account.",
        }
    return {
        **base,
        "repairable": True,
        "repair_action_type": "CREATE_LEAF_POSTING_ACCOUNT_AND_REMAP",
        "suggested_posting_chart_account": {
            "code": _posting_child_code(current),
            "name": f"{current.name} Posting",
            "account_type": ChartOfAccountType.ASSET,
            "parent_id": current.id,
            "allow_manual_posting": True,
            "is_active": True,
        },
        "reason": "A safe posting-enabled leaf ASSET account can be created under the current group/control account.",
    }


def _collection_repair_queryset():
    return (
        FinanceAccount.objects.select_related("chart_account", "chart_account__parent", "branch")
        .prefetch_related("chart_account__children")
        .filter(is_active=True, is_real_settlement_account=True)
        .order_by("kind", "name", "id")
    )


def preview_collection_mapping_repairs(*, finance_account_id: int | None = None) -> dict[str, Any]:
    queryset = _collection_repair_queryset()
    if finance_account_id is not None:
        queryset = queryset.filter(pk=finance_account_id)
    rows = [_preview_for_account(account) for account in queryset]
    blocked = [row for row in rows if row["blocker_reason"]]
    repairable = [row for row in rows if row["repairable"]]
    return {
        "dry_run": True,
        "historical_mutation": False,
        "risk_note": HISTORICAL_MUTATION_NOTE,
        "confirmation_text_required": CONFIRM_COLLECTION_MAPPING_REPAIR,
        "accounts": rows,
        "blocked_accounts": blocked,
        "repairable_accounts": repairable,
        "summary": {
            "accounts_checked": len(rows),
            "blocked_count": len(blocked),
            "repairable_count": len(repairable),
            "not_repairable_count": len([row for row in blocked if not row["repairable"]]),
        },
    }


def _create_leaf_posting_account(parent: ChartOfAccount) -> ChartOfAccount:
    system_code = _posting_child_system_code(parent)
    existing = ChartOfAccount.objects.filter(system_code=system_code).first()
    if existing is not None:
        if chart_account_allowed_for_collection(existing):
            return existing
        raise serializers.ValidationError({"chart_account": "Existing posting child system code is not collection-ready."})
    code = _posting_child_code(parent)
    if ChartOfAccount.objects.filter(code__iexact=code).exists():
        code = f"P{parent.pk:06d}"
    return ChartOfAccount.objects.create(
        code=code,
        name=f"{parent.name} Posting",
        account_type=ChartOfAccountType.ASSET,
        parent=parent,
        is_active=True,
        allow_manual_posting=True,
        system_code=system_code,
        notes="Created by Accounting Setup guided repair to keep group/control account non-posting while allowing collections.",
    )


@transaction.atomic
def execute_collection_mapping_repairs(*, actor, confirmation_text: str, finance_account_id: int | None = None) -> dict[str, Any]:
    if (confirmation_text or "").strip().upper() != CONFIRM_COLLECTION_MAPPING_REPAIR:
        raise serializers.ValidationError({"confirmation_text": f"Type {CONFIRM_COLLECTION_MAPPING_REPAIR} to repair mappings."})

    lock_queryset = (
        FinanceAccount.objects.select_for_update()
        .filter(is_active=True, is_real_settlement_account=True)
        .order_by("kind", "name", "id")
        .values_list("id", flat=True)
    )
    if finance_account_id is not None:
        lock_queryset = lock_queryset.filter(pk=finance_account_id)
    locked_ids = list(lock_queryset)
    queryset = _collection_repair_queryset().filter(id__in=locked_ids)

    results: list[dict[str, Any]] = []
    for account in queryset:
        preview = _preview_for_account(account)
        if not preview["blocker_reason"]:
            results.append({**preview, "status": "skipped", "reason": "Already collection-ready."})
            continue
        if not preview["repairable"]:
            results.append({**preview, "status": "skipped", "reason": preview.get("reason") or "Not repairable."})
            continue
        old_chart_id = account.chart_account_id
        try:
            if preview["repair_action_type"] == "REMAP_TO_EXISTING_POSTING_ACCOUNT":
                target = ChartOfAccount.objects.get(pk=preview["suggested_posting_chart_account"]["id"])
            else:
                current = account.chart_account
                target = _create_leaf_posting_account(current)
            if not chart_account_allowed_for_collection(target, kind=account.kind):
                raise serializers.ValidationError({"chart_account": "Suggested target is not collection-ready."})
            updated = AccountingMasterUpdateService.update_finance_account(
                account=account,
                payload={"chart_account": target},
                actor=actor,
            )
            readiness = finance_account_readiness(updated)
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=updated,
                performed_by=actor,
                metadata={
                    "event": "ACCOUNTING_SETUP_GUIDED_COLLECTION_MAPPING_REPAIR",
                    "finance_account_id": updated.id,
                    "old_chart_account_id": old_chart_id,
                    "new_chart_account_id": updated.chart_account_id,
                    "historical_mutation": False,
                },
            )
            results.append(
                {
                    **preview,
                    "status": "repaired" if readiness.selectable_for_collection else "failed",
                    "old_chart_account_id": old_chart_id,
                    "new_chart_account_id": updated.chart_account_id,
                    "collection_ready": readiness.collection_ready,
                    "selectable_for_collection": readiness.selectable_for_collection,
                    "reason": None if readiness.selectable_for_collection else readiness.collection_blocker_reason,
                }
            )
        except (DjangoValidationError, serializers.ValidationError) as exc:
            detail = getattr(exc, "message_dict", None) or getattr(exc, "detail", None) or str(exc)
            results.append({**preview, "status": "failed", "reason": detail})
        except Exception as exc:  # defensive: per-account structured failure, no generic crash
            results.append({**preview, "status": "failed", "reason": str(exc)})

    return {
        "historical_mutation": False,
        "risk_note": HISTORICAL_MUTATION_NOTE,
        "results": results,
        "summary": {
            "repaired_count": len([row for row in results if row["status"] == "repaired"]),
            "skipped_count": len([row for row in results if row["status"] == "skipped"]),
            "failed_count": len([row for row in results if row["status"] == "failed"]),
        },
    }
