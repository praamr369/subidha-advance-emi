from __future__ import annotations

import csv
import io
from typing import Any

from django.db import transaction

from accounting.models import ChartOfAccount, ChartOfAccountType, Vendor
from accounting.services.journal_posting_service import _log_accounting_event


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

    return {
        "created": created,
        "updated": updated,
        "skipped": 0,
        "message": "Vendor import completed.",
    }
