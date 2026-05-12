from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction

from accounting.models import ChartOfAccount
from accounting.services.journal_posting_service import _log_accounting_event


@dataclass(frozen=True)
class SystemAccountEnsureResult:
    account: ChartOfAccount
    created: bool
    claimed: bool
    conflict: bool


@transaction.atomic
def ensure_system_account(
    *,
    system_code: str,
    code: str,
    name: str,
    account_type: str,
    allow_manual_posting: bool = False,
    reactivate: bool = False,
    performed_by=None,
) -> SystemAccountEnsureResult:
    """
    Canonical system-account ensure/claim logic.

    Rules (safe + audit-friendly):
    - Normalize system_code and code to uppercase.
    - Prefer lookup by system_code.
    - If missing, lookup by code:
      - If code row has empty system_code, claim it (set system_code).
      - If code row has a different system_code, do not overwrite.
    - Never silently reactivate inactive accounts unless reactivate=True.
    - Never allow manual posting on canonical system accounts by default.
    """

    normalized_system_code = (system_code or "").strip().upper()
    normalized_code = (code or "").strip().upper()
    if not normalized_system_code:
        raise ValueError("system_code is required.")
    if not normalized_code:
        raise ValueError("code is required.")

    created = False
    claimed = False
    conflict = False

    account = (
        ChartOfAccount.objects.select_for_update()
        .filter(system_code=normalized_system_code)
        .first()
    )
    if account is None:
        by_code = (
            ChartOfAccount.objects.select_for_update()
            .filter(code=normalized_code)
            .first()
        )
        if by_code is not None:
            existing_system_code = (by_code.system_code or "").strip().upper() or None
            if existing_system_code is None:
                by_code.system_code = normalized_system_code
                by_code.allow_manual_posting = bool(allow_manual_posting)
                by_code.name = (name or "").strip() or by_code.name
                by_code.account_type = account_type
                if reactivate:
                    by_code.is_active = True
                by_code.save(
                    update_fields=[
                        "system_code",
                        "allow_manual_posting",
                        "name",
                        "account_type",
                        "is_active",
                        "updated_at",
                    ]
                )
                _log_accounting_event(
                    event="ACCOUNTING_SYSTEM_ACCOUNT_CLAIMED",
                    instance=by_code,
                    performed_by=performed_by,
                    metadata={
                        "system_code": normalized_system_code,
                        "code": normalized_code,
                        "account_type": account_type,
                    },
                )
                claimed = True
            else:
                conflict = existing_system_code != normalized_system_code
            account = by_code
        else:
            account = ChartOfAccount.objects.create(
                system_code=normalized_system_code,
                code=normalized_code,
                name=name,
                account_type=account_type,
                allow_manual_posting=bool(allow_manual_posting),
                is_active=True,
            )
            _log_accounting_event(
                event="ACCOUNTING_SYSTEM_ACCOUNT_CREATED",
                instance=account,
                performed_by=performed_by,
                metadata={
                    "system_code": normalized_system_code,
                    "code": normalized_code,
                    "account_type": account_type,
                },
            )
            created = True

    if (
        account is not None
        and not created
        and not claimed
        and not conflict
        and (account.system_code or "").strip().upper() == normalized_system_code
    ):
        update_fields: list[str] = []
        if (account.name or "").strip() != (name or "").strip() and (name or "").strip():
            account.name = (name or "").strip()
            update_fields.append("name")
        if account.account_type != account_type:
            account.account_type = account_type
            update_fields.append("account_type")
        if account.allow_manual_posting != bool(allow_manual_posting):
            account.allow_manual_posting = bool(allow_manual_posting)
            update_fields.append("allow_manual_posting")
        if reactivate and not account.is_active:
            account.is_active = True
            update_fields.append("is_active")
        if update_fields:
            update_fields.append("updated_at")
            account.save(update_fields=update_fields)

    return SystemAccountEnsureResult(
        account=account,
        created=created,
        claimed=claimed,
        conflict=conflict,
    )
