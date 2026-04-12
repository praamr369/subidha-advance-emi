from __future__ import annotations

import csv
import io
from typing import Any

from django.db import transaction

from accounting.models import FinanceAccount
from accounts.models import User
from branch_control.models import Branch, BranchStatus, CashCounter


def _decode_csv(file_or_text: Any) -> tuple[list[str], list[dict[str, str]]]:
    if hasattr(file_or_text, "read"):
        if hasattr(file_or_text, "seek"):
            file_or_text.seek(0)
        raw = file_or_text.read()
        decoded = raw.decode("utf-8-sig", errors="ignore") if isinstance(raw, bytes) else str(raw)
    else:
        decoded = str(file_or_text or "")
    reader = csv.DictReader(io.StringIO(decoded))
    return reader.fieldnames or [], list(reader)


def _clean_text(value: Any, *, upper: bool = False) -> str:
    text = str(value or "").strip()
    return text.upper() if upper else text


def _parse_bool(value: Any, *, default: bool) -> bool:
    cleaned = _clean_text(value).lower()
    if not cleaned:
        return default
    if cleaned in {"1", "true", "yes", "y"}:
        return True
    if cleaned in {"0", "false", "no", "n"}:
        return False
    raise ValueError("Expected a boolean-style value.")


def _preview_response(headers: list[str], rows: list[dict]) -> dict:
    valid_count = sum(1 for row in rows if row["valid"])
    return {
        "columns": headers,
        "preview_rows": rows[:25],
        "errors": [row for row in rows if not row["valid"]],
        "valid_count": valid_count,
        "invalid_count": len(rows) - valid_count,
    }


def preview_branch_import(file_or_text: Any) -> dict:
    headers, raw_rows = _decode_csv(file_or_text)
    preview_rows: list[dict] = []
    allowed_statuses = {choice for choice, _ in BranchStatus.choices}
    requested_primary_codes: list[str] = []
    code_counts: dict[str, int] = {}

    for row in raw_rows:
        code = _clean_text(row.get("code"), upper=True)
        if code:
            code_counts[code] = code_counts.get(code, 0) + 1
        try:
            if _parse_bool(row.get("is_primary"), default=False):
                requested_primary_codes.append(code)
        except ValueError:
            continue

    for index, row in enumerate(raw_rows, start=2):
        code = _clean_text(row.get("code"), upper=True)
        name = _clean_text(row.get("name"))
        status = _clean_text(row.get("status"), upper=True) or BranchStatus.ACTIVE
        existing = Branch.objects.filter(code=code).first() if code else None
        errors: list[str] = []
        try:
            is_primary = _parse_bool(row.get("is_primary"), default=False)
        except ValueError as exc:
            errors.append(str(exc))
            is_primary = False

        if not code:
            errors.append("code is required")
        elif code_counts.get(code, 0) > 1:
            errors.append("duplicate code in upload")
        if not name:
            errors.append("name is required")
        if status not in allowed_statuses:
            errors.append("status must be ACTIVE or INACTIVE")
        if len(requested_primary_codes) > 1 and is_primary:
            errors.append("only one imported branch can be marked as primary")

        preview_rows.append(
            {
                "row_number": index,
                "code": code,
                "name": name,
                "status": status,
                "resolution": "update" if existing is not None else "create",
                "valid": not errors,
                "errors": errors,
            }
        )

    return _preview_response(headers, preview_rows)


@transaction.atomic
def post_branch_import(file_or_text: Any) -> dict:
    preview = preview_branch_import(file_or_text)
    if preview["invalid_count"] > 0:
        raise ValueError("Branch import contains invalid rows.")

    _, raw_rows = _decode_csv(file_or_text)
    created = 0
    updated = 0

    for row in raw_rows:
        code = _clean_text(row.get("code"), upper=True)
        payload = {
            "name": _clean_text(row.get("name")),
            "status": _clean_text(row.get("status"), upper=True) or BranchStatus.ACTIVE,
            "is_primary": _parse_bool(row.get("is_primary"), default=False),
            "phone": _clean_text(row.get("phone")),
            "email": _clean_text(row.get("email")),
            "address": _clean_text(row.get("address")),
            "notes": _clean_text(row.get("notes")),
        }
        if payload["is_primary"]:
            Branch.objects.filter(is_primary=True).exclude(code=code).update(is_primary=False)
        branch, was_created = Branch.objects.update_or_create(code=code, defaults=payload)
        if was_created:
            created += 1
        else:
            updated += 1

    return {
        "created": created,
        "updated": updated,
        "skipped": 0,
        "message": "Branch import completed.",
    }


def _resolve_branch(branch_code: str) -> Branch:
    branch = Branch.objects.filter(code__iexact=_clean_text(branch_code, upper=True)).first()
    if branch is None:
        raise ValueError("branch_code does not match an existing branch")
    return branch


def _resolve_finance_account(*, name: str, chart_account_code: str, branch_id: int) -> FinanceAccount:
    if chart_account_code:
        account = FinanceAccount.objects.select_related("chart_account").filter(
            chart_account__code__iexact=chart_account_code
        ).first()
        if account is None:
            raise ValueError("finance_chart_account_code does not match an existing finance account")
    else:
        matches = list(
            FinanceAccount.objects.filter(
                name__iexact=name,
                branch_id=branch_id,
            ).order_by("id")
        )
        if not matches:
            raise ValueError("finance_account_name does not match an existing branch finance account")
        if len(matches) > 1:
            raise ValueError("finance_account_name is ambiguous; use finance_chart_account_code")
        account = matches[0]

    if not account.is_active:
        raise ValueError("finance account must be active")
    if account.branch_id and account.branch_id != branch_id:
        raise ValueError("finance account must belong to the same branch")
    return account


def _resolve_assigned_user(username: str) -> User | None:
    cleaned = _clean_text(username)
    if not cleaned:
        return None
    user = User.objects.filter(username__iexact=cleaned).first()
    if user is None:
        raise ValueError("assigned_username does not match an existing user")
    return user


def preview_counter_import(file_or_text: Any) -> dict:
    headers, raw_rows = _decode_csv(file_or_text)
    preview_rows: list[dict] = []
    code_counts: dict[str, int] = {}

    for row in raw_rows:
        code = _clean_text(row.get("code"), upper=True)
        if code:
            code_counts[code] = code_counts.get(code, 0) + 1

    for index, row in enumerate(raw_rows, start=2):
        code = _clean_text(row.get("code"), upper=True)
        name = _clean_text(row.get("name"))
        branch_code = _clean_text(row.get("branch_code"), upper=True)
        finance_account_name = _clean_text(row.get("finance_account_name"))
        finance_chart_code = _clean_text(row.get("finance_chart_account_code"), upper=True)
        assigned_username = _clean_text(row.get("assigned_username"))
        existing = CashCounter.objects.filter(code=code).first() if code else None
        errors: list[str] = []

        if not code:
            errors.append("code is required")
        elif code_counts.get(code, 0) > 1:
            errors.append("duplicate code in upload")
        if not name:
            errors.append("name is required")
        if not branch_code:
            errors.append("branch_code is required")
            branch = None
        else:
            try:
                branch = _resolve_branch(branch_code)
            except ValueError as exc:
                errors.append(str(exc))
                branch = None

        if not finance_account_name and not finance_chart_code:
            errors.append("finance_account_name or finance_chart_account_code is required")
        elif branch is not None:
            try:
                _resolve_finance_account(
                    name=finance_account_name,
                    chart_account_code=finance_chart_code,
                    branch_id=branch.id,
                )
            except ValueError as exc:
                errors.append(str(exc))

        if assigned_username:
            try:
                _resolve_assigned_user(assigned_username)
            except ValueError as exc:
                errors.append(str(exc))

        preview_rows.append(
            {
                "row_number": index,
                "code": code,
                "name": name,
                "branch_code": branch_code,
                "finance_account_name": finance_account_name,
                "finance_chart_account_code": finance_chart_code,
                "assigned_username": assigned_username,
                "resolution": "update" if existing is not None else "create",
                "valid": not errors,
                "errors": errors,
            }
        )

    return _preview_response(headers, preview_rows)


@transaction.atomic
def post_counter_import(file_or_text: Any) -> dict:
    preview = preview_counter_import(file_or_text)
    if preview["invalid_count"] > 0:
        raise ValueError("Counter import contains invalid rows.")

    _, raw_rows = _decode_csv(file_or_text)
    created = 0
    updated = 0

    for row in raw_rows:
        branch = _resolve_branch(_clean_text(row.get("branch_code"), upper=True))
        finance_account = _resolve_finance_account(
            name=_clean_text(row.get("finance_account_name")),
            chart_account_code=_clean_text(row.get("finance_chart_account_code"), upper=True),
            branch_id=branch.id,
        )
        assigned_user = _resolve_assigned_user(_clean_text(row.get("assigned_username")))
        payload = {
            "name": _clean_text(row.get("name")),
            "branch": branch,
            "finance_account": finance_account,
            "assigned_user": assigned_user,
            "is_active": _parse_bool(row.get("is_active"), default=True),
            "notes": _clean_text(row.get("notes")),
        }
        counter, was_created = CashCounter.objects.update_or_create(
            code=_clean_text(row.get("code"), upper=True),
            defaults=payload,
        )
        if was_created:
            created += 1
        else:
            updated += 1

    return {
        "created": created,
        "updated": updated,
        "skipped": 0,
        "message": "Counter import completed.",
    }
