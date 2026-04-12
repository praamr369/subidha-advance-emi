from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

from accounting.models import ChartOfAccount, ChartOfAccountType, EmployeeProfile, Vendor
from accounting.services.journal_posting_service import _log_accounting_event
from crm.services.party_service import sync_party_for_employee, sync_party_for_vendor


def _decode_csv(file_or_text: Any) -> tuple[list[str], list[dict[str, str]]]:
    if hasattr(file_or_text, "read"):
        if hasattr(file_or_text, "seek"):
            file_or_text.seek(0)
        raw = file_or_text.read()
        if isinstance(raw, bytes):
            decoded = raw.decode("utf-8-sig", errors="ignore")
        else:
            decoded = str(raw)
    else:
        decoded = str(file_or_text or "")

    reader = csv.DictReader(io.StringIO(decoded))
    return reader.fieldnames or [], list(reader)


def _parse_bool(value: Any, *, default: bool) -> bool:
    if value is None or value == "":
        return default
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y"}:
        return True
    if normalized in {"0", "false", "no", "n"}:
        return False
    raise ValueError("Expected a boolean-style value.")


def _normalize_text(value: Any, *, upper: bool = False) -> str:
    text = str(value or "").strip()
    return text.upper() if upper else text


def _parse_decimal(value: Any, *, allow_blank: bool = False) -> Decimal | None:
    cleaned = _normalize_text(value)
    if not cleaned:
        return None if allow_blank else Decimal("0.00")
    try:
        return Decimal(cleaned)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Expected a decimal-style value.")


def _parse_date(value: Any) -> date | None:
    cleaned = _normalize_text(value)
    if not cleaned:
        return None
    try:
        return date.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError("Expected a date in YYYY-MM-DD format.") from exc


def _preview_response(headers: list[str], rows: list[dict]) -> dict:
    valid_count = sum(1 for row in rows if row["valid"])
    return {
        "columns": headers,
        "preview_rows": rows[:25],
        "errors": [row for row in rows if not row["valid"]],
        "valid_count": valid_count,
        "invalid_count": len(rows) - valid_count,
    }


def preview_chart_of_accounts_import(file_or_text: Any) -> dict:
    headers, raw_rows = _decode_csv(file_or_text)
    existing_codes = set(ChartOfAccount.objects.values_list("code", flat=True))
    upload_codes = {
        _normalize_text(row.get("code"), upper=True)
        for row in raw_rows
        if _normalize_text(row.get("code"), upper=True)
    }
    allowed_account_types = {choice for choice, _ in ChartOfAccountType.choices}
    preview_rows: list[dict] = []

    for index, row in enumerate(raw_rows, start=2):
        code = _normalize_text(row.get("code"), upper=True)
        name = _normalize_text(row.get("name"))
        account_type = _normalize_text(row.get("account_type"), upper=True)
        parent_code = _normalize_text(row.get("parent_code"), upper=True)
        errors: list[str] = []

        if not code:
            errors.append("code is required")
        if not name:
            errors.append("name is required")
        if account_type not in allowed_account_types:
            errors.append("account_type must be one of ASSET, LIABILITY, EQUITY, INCOME, EXPENSE")
        if parent_code and parent_code not in existing_codes and parent_code not in upload_codes:
            errors.append("parent_code does not match an existing or imported chart account")

        resolution = "update" if code in existing_codes else "create"
        preview_rows.append(
            {
                "row_number": index,
                "code": code,
                "name": name,
                "account_type": account_type,
                "parent_code": parent_code,
                "resolution": resolution,
                "valid": not errors,
                "errors": errors,
            }
        )

    return _preview_response(headers, preview_rows)


@transaction.atomic
def post_chart_of_accounts_import(file_or_text: Any, *, performed_by=None) -> dict:
    preview = preview_chart_of_accounts_import(file_or_text)
    if preview["invalid_count"] > 0:
        raise ValueError("Chart of accounts import contains invalid rows.")

    _, raw_rows = _decode_csv(file_or_text)
    row_map: dict[str, dict[str, Any]] = {}
    parent_map: dict[str, str] = {}
    created = 0
    updated = 0

    for row in raw_rows:
        code = _normalize_text(row.get("code"), upper=True)
        row_map[code] = {
            "name": _normalize_text(row.get("name")),
            "account_type": _normalize_text(row.get("account_type"), upper=True),
            "is_active": _parse_bool(row.get("is_active"), default=True),
            "allow_manual_posting": _parse_bool(row.get("allow_manual_posting"), default=True),
            "system_code": _normalize_text(row.get("system_code"), upper=True) or None,
        }
        parent_map[code] = _normalize_text(row.get("parent_code"), upper=True)

    for code, payload in row_map.items():
        account, was_created = ChartOfAccount.objects.update_or_create(
            code=code,
            defaults=payload,
        )
        if was_created:
            created += 1
        else:
            updated += 1
        _log_accounting_event(
            event="ACCOUNTING_MASTER_IMPORTED",
            instance=account,
            performed_by=performed_by,
            metadata={"import_type": "CHART_OF_ACCOUNTS", "operation": "CREATED" if was_created else "UPDATED"},
        )

    for code, parent_code in parent_map.items():
        if not parent_code:
            continue
        account = ChartOfAccount.objects.get(code=code)
        parent = ChartOfAccount.objects.get(code=parent_code)
        if account.parent_id != parent.id:
            account.parent = parent
            account.save(update_fields=["parent"])

    return {
        "created": created,
        "updated": updated,
        "skipped": 0,
        "message": "Chart of accounts import completed.",
    }


def _find_vendor_match(*, name: str, gstin: str, email: str, phone: str) -> tuple[Vendor | None, str]:
    if gstin:
        return Vendor.objects.filter(gstin__iexact=gstin).first(), "gstin"
    if email:
        return Vendor.objects.filter(email__iexact=email).first(), "email"
    if phone:
        return Vendor.objects.filter(phone=phone).first(), "phone"

    matches = list(Vendor.objects.filter(name__iexact=name).order_by("id"))
    if len(matches) == 1:
        return matches[0], "name"
    if len(matches) > 1:
        raise ValueError("ambiguous vendor name without GSTIN/email/phone")
    return None, "name"


def preview_vendor_import(file_or_text: Any) -> dict:
    headers, raw_rows = _decode_csv(file_or_text)
    preview_rows: list[dict] = []

    for index, row in enumerate(raw_rows, start=2):
        name = _normalize_text(row.get("name"))
        gstin = _normalize_text(row.get("gstin"), upper=True)
        email = _normalize_text(row.get("email"))
        phone = _normalize_text(row.get("phone"))
        errors: list[str] = []

        if not name:
            errors.append("name is required")

        resolution = "create"
        if not errors:
            try:
                existing, match_basis = _find_vendor_match(
                    name=name,
                    gstin=gstin,
                    email=email,
                    phone=phone,
                )
            except ValueError as exc:
                errors.append(str(exc))
                existing = None
                match_basis = "name"
            else:
                if existing is not None:
                    resolution = f"update:{match_basis}"

        preview_rows.append(
            {
                "row_number": index,
                "name": name,
                "gstin": gstin,
                "email": email,
                "phone": phone,
                "resolution": resolution,
                "valid": not errors,
                "errors": errors,
            }
        )

    return _preview_response(headers, preview_rows)


@transaction.atomic
def post_vendor_import(file_or_text: Any, *, performed_by=None) -> dict:
    preview = preview_vendor_import(file_or_text)
    if preview["invalid_count"] > 0:
        raise ValueError("Vendor import contains invalid rows.")

    _, raw_rows = _decode_csv(file_or_text)
    created = 0
    updated = 0

    for row in raw_rows:
        name = _normalize_text(row.get("name"))
        gstin = _normalize_text(row.get("gstin"), upper=True)
        email = _normalize_text(row.get("email"))
        phone = _normalize_text(row.get("phone"))
        existing, _ = _find_vendor_match(name=name, gstin=gstin, email=email, phone=phone)

        payload = {
            "name": name,
            "phone": phone,
            "email": email,
            "address": _normalize_text(row.get("address")),
            "gstin": gstin or None,
            "state_code": _normalize_text(row.get("state_code"), upper=True) or None,
            "state_name": _normalize_text(row.get("state_name")) or None,
            "is_active": _parse_bool(row.get("is_active"), default=True),
        }

        if existing is None:
            vendor = Vendor.objects.create(**payload)
            created += 1
            operation = "CREATED"
        else:
            for key, value in payload.items():
                setattr(existing, key, value)
            existing.save()
            vendor = existing
            updated += 1
            operation = "UPDATED"

        _log_accounting_event(
            event="ACCOUNTING_MASTER_IMPORTED",
            instance=vendor,
            performed_by=performed_by,
            metadata={"import_type": "VENDORS", "operation": operation},
        )
        sync_party_for_vendor(vendor, performed_by=performed_by)

    return {
        "created": created,
        "updated": updated,
        "skipped": 0,
        "message": "Vendor import completed.",
    }


def _resolve_branch_by_code(branch_code: str):
    from branch_control.models import Branch
    from branch_control.services.branch_service import default_branch_for_model

    normalized_code = _normalize_text(branch_code, upper=True)
    if not normalized_code:
        return default_branch_for_model()

    branch = Branch.objects.filter(code=normalized_code).first()
    if branch is None:
        raise ValueError("branch_code does not match an existing branch")
    return branch


def _find_employee_match(*, employee_code: str, phone: str) -> tuple[EmployeeProfile | None, str]:
    if employee_code:
        return (
            EmployeeProfile.objects.filter(employee_code__iexact=employee_code).first(),
            "employee_code",
        )
    if phone:
        return EmployeeProfile.objects.filter(phone=phone).first(), "phone"
    return None, "new"


def preview_employee_import(file_or_text: Any) -> dict:
    headers, raw_rows = _decode_csv(file_or_text)
    preview_rows: list[dict] = []
    employee_code_counts: dict[str, int] = {}
    phone_counts: dict[str, int] = {}

    for row in raw_rows:
        employee_code = _normalize_text(row.get("employee_code"), upper=True)
        phone = _normalize_text(row.get("phone"))
        if employee_code:
            employee_code_counts[employee_code] = employee_code_counts.get(employee_code, 0) + 1
        if phone:
            phone_counts[phone] = phone_counts.get(phone, 0) + 1

    for index, row in enumerate(raw_rows, start=2):
        employee_code = _normalize_text(row.get("employee_code"), upper=True)
        name = _normalize_text(row.get("name"))
        phone = _normalize_text(row.get("phone"))
        branch_code = _normalize_text(row.get("branch_code"), upper=True)
        joining_date_raw = _normalize_text(row.get("joining_date"))
        base_salary_raw = _normalize_text(row.get("base_salary"))
        standard_daily_hours_raw = _normalize_text(row.get("standard_daily_hours"))
        overtime_rate_raw = _normalize_text(row.get("overtime_rate_per_hour"))
        errors: list[str] = []

        existing, match_basis = _find_employee_match(
            employee_code=employee_code,
            phone=phone,
        )
        resolution = f"update:{match_basis}" if existing is not None else "create"

        if not name:
            errors.append("name is required")
        if not phone and existing is None:
            errors.append("phone is required for new employee imports")
        if employee_code and employee_code_counts.get(employee_code, 0) > 1:
            errors.append("duplicate employee_code in upload")
        if phone and phone_counts.get(phone, 0) > 1:
            errors.append("duplicate phone in upload")

        try:
            joining_date = _parse_date(joining_date_raw)
        except ValueError as exc:
            errors.append(str(exc))
            joining_date = None
        if joining_date is None and existing is None:
            errors.append("joining_date is required for new employee imports")

        try:
            base_salary = _parse_decimal(base_salary_raw, allow_blank=True)
        except ValueError as exc:
            errors.append(f"base_salary {exc}")
            base_salary = None
        else:
            if base_salary is not None and base_salary < Decimal("0.00"):
                errors.append("base_salary cannot be negative")

        try:
            standard_daily_hours = _parse_decimal(standard_daily_hours_raw, allow_blank=True)
        except ValueError as exc:
            errors.append(f"standard_daily_hours {exc}")
            standard_daily_hours = None
        else:
            if standard_daily_hours is not None and standard_daily_hours <= Decimal("0.00"):
                errors.append("standard_daily_hours must be greater than zero")

        try:
            overtime_rate = _parse_decimal(overtime_rate_raw, allow_blank=True)
        except ValueError as exc:
            errors.append(f"overtime_rate_per_hour {exc}")
            overtime_rate = None
        else:
            if overtime_rate is not None and overtime_rate < Decimal("0.00"):
                errors.append("overtime_rate_per_hour cannot be negative")

        try:
            branch = _resolve_branch_by_code(branch_code)
        except ValueError as exc:
            errors.append(str(exc))
            branch = None

        preview_rows.append(
            {
                "row_number": index,
                "employee_code": employee_code or getattr(existing, "employee_code", ""),
                "name": name,
                "phone": phone,
                "branch_code": branch_code or getattr(branch, "code", ""),
                "joining_date": joining_date_raw,
                "base_salary": base_salary_raw,
                "resolution": resolution,
                "valid": not errors,
                "errors": errors,
            }
        )

    return _preview_response(headers, preview_rows)


@transaction.atomic
def post_employee_import(file_or_text: Any, *, performed_by=None) -> dict:
    preview = preview_employee_import(file_or_text)
    if preview["invalid_count"] > 0:
        raise ValueError("Employee import contains invalid rows.")

    _, raw_rows = _decode_csv(file_or_text)
    created = 0
    updated = 0

    for row in raw_rows:
        employee_code = _normalize_text(row.get("employee_code"), upper=True)
        name = _normalize_text(row.get("name"))
        phone = _normalize_text(row.get("phone"))
        existing, _ = _find_employee_match(employee_code=employee_code, phone=phone)
        branch = _resolve_branch_by_code(_normalize_text(row.get("branch_code"), upper=True))
        joining_date = _parse_date(row.get("joining_date"))
        base_salary = _parse_decimal(row.get("base_salary"), allow_blank=True)
        standard_daily_hours = _parse_decimal(
            row.get("standard_daily_hours"),
            allow_blank=True,
        )
        overtime_rate = _parse_decimal(
            row.get("overtime_rate_per_hour"),
            allow_blank=True,
        )

        payload = {
            "employee_code": employee_code or getattr(existing, "employee_code", ""),
            "name": name,
            "phone": phone if phone or existing is None else existing.phone,
            "branch": branch,
            "designation": _normalize_text(row.get("designation")),
            "department": _normalize_text(row.get("department")),
            "joining_date": joining_date or getattr(existing, "joining_date", None),
            "base_salary": (
                base_salary if base_salary is not None else getattr(existing, "base_salary", None)
            ),
            "standard_daily_hours": (
                standard_daily_hours
                if standard_daily_hours is not None
                else getattr(existing, "standard_daily_hours", Decimal("8.00"))
            ),
            "overtime_rate_per_hour": (
                overtime_rate
                if overtime_rate is not None
                else getattr(existing, "overtime_rate_per_hour", None)
            ),
            "is_active": _parse_bool(row.get("is_active"), default=True),
            "notes": _normalize_text(row.get("notes")),
        }

        if existing is None:
            employee = EmployeeProfile.objects.create(**payload)
            created += 1
            operation = "CREATED"
        else:
            for key, value in payload.items():
                setattr(existing, key, value)
            existing.save()
            employee = existing
            updated += 1
            operation = "UPDATED"

        _log_accounting_event(
            event="ACCOUNTING_MASTER_IMPORTED",
            instance=employee,
            performed_by=performed_by,
            metadata={"import_type": "EMPLOYEES", "operation": operation},
        )
        sync_party_for_employee(employee, performed_by=performed_by)

    return {
        "created": created,
        "updated": updated,
        "skipped": 0,
        "message": "Employee import completed.",
    }
