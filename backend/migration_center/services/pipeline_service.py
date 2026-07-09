"""Staging pipeline: upload → mapping → validation → duplicates → preview.

No stage in this module writes to production business tables.
"""

from __future__ import annotations

import hashlib
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

from migration_center.adapters import get_adapter
from migration_center.datasets import (
    GSTIN_RE, MOBILE_RE, PAN_RE, PIN_RE, DatasetSpec, get_dataset,
)
from migration_center.models import (
    DuplicateResolution, MigrationAuditLog, MigrationBatch, MigrationBatchStatus,
    MigrationStagingRow, StagingRowStatus,
)

STAGING_CHUNK = 500


def log_action(*, batch: MigrationBatch | None, action: str, actor=None, payload: dict | None = None) -> None:
    MigrationAuditLog.objects.create(batch=batch, action=action, actor=actor, payload=payload or {})


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def create_batch_from_upload(
    *, uploaded_file: Any, filename: str, dataset_key: str, source_type: str, actor=None,
) -> MigrationBatch:
    from migration_center.parsers import parse_upload

    dataset = get_dataset(dataset_key)
    if not dataset.importable:
        raise ValueError(f"Dataset '{dataset_key}' is template-only and cannot be imported here.")

    headers, rows, raw = parse_upload(uploaded_file, filename)
    checksum = hashlib.sha256(raw).hexdigest()

    adapter = get_adapter(source_type)
    mapping = adapter.build_mapping(dataset, headers)

    with transaction.atomic():
        batch = MigrationBatch.objects.create(
            batch_number=MigrationBatch.next_batch_number(),
            source_type=source_type,
            dataset_key=dataset_key,
            original_filename=filename or "",
            file_checksum_sha256=checksum,
            file_size_bytes=len(raw),
            mapping=mapping,
            source_headers=headers,
            created_by=actor,
        )
        total = 0
        chunk: list[MigrationStagingRow] = []
        for index, row in enumerate(rows, start=2):  # data starts on file row 2
            total += 1
            chunk.append(MigrationStagingRow(batch=batch, row_number=index, raw_data=row))
            if len(chunk) >= STAGING_CHUNK:
                MigrationStagingRow.objects.bulk_create(chunk)
                chunk = []
        if chunk:
            MigrationStagingRow.objects.bulk_create(chunk)
        batch.total_rows = total
        batch.save(update_fields=["total_rows", "updated_at"])
        log_action(batch=batch, action="UPLOAD", actor=actor, payload={
            "filename": filename, "rows": total, "checksum": checksum, "source_type": source_type,
        })
    duplicate_of = (
        MigrationBatch.objects
        .filter(file_checksum_sha256=checksum, dataset_key=dataset_key)
        .exclude(pk=batch.pk)
        .order_by("-id")
        .values_list("batch_number", flat=True)
        .first()
    )
    if duplicate_of:
        batch.notes = f"Warning: identical file already uploaded as {duplicate_of}."
        batch.save(update_fields=["notes", "updated_at"])
    return batch


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------

def update_mapping(*, batch: MigrationBatch, mapping: dict[str, str], actor=None) -> MigrationBatch:
    dataset = get_dataset(batch.dataset_key)
    clean: dict[str, str] = {}
    for field_key, header in mapping.items():
        if field_key not in dataset.field_map:
            raise ValueError(f"Unknown field '{field_key}' for dataset '{dataset.key}'.")
        if header and header not in batch.source_headers:
            raise ValueError(f"Header '{header}' does not exist in the uploaded file.")
        if header:
            clean[field_key] = header
    batch.mapping = clean
    batch.status = MigrationBatchStatus.MAPPED
    batch.save(update_fields=["mapping", "status", "updated_at"])
    # Mapping changed — earlier validation results are stale.
    batch.rows.exclude(status=StagingRowStatus.IMPORTED).update(
        status=StagingRowStatus.PENDING, errors=[], warnings=[], mapped_data={},
        duplicate_matches=[], duplicate_resolution=DuplicateResolution.NONE,
    )
    log_action(batch=batch, action="MAPPING_UPDATED", actor=actor, payload={"mapping": clean})
    return batch


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _coerce_value(spec, value: str) -> tuple[Any, str | None]:
    """Returns (coerced_value, error)."""
    text = (value or "").strip()
    if not text:
        return "", None
    kind = spec.kind
    if kind == "decimal":
        try:
            cleaned = text.replace(",", "").replace("₹", "").strip()
            amount = Decimal(cleaned)
        except (InvalidOperation, ValueError):
            return text, f"{spec.label}: '{value}' is not a valid amount."
        return str(amount), None
    if kind == "int":
        if not text.isdigit():
            return text, f"{spec.label}: '{value}' is not a whole number."
        return int(text), None
    if kind == "date":
        parsed = _parse_flexible_date(text)
        if parsed is None:
            return text, f"{spec.label}: '{value}' is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)."
        return parsed.isoformat(), None
    if kind == "mobile":
        digits = "".join(ch for ch in text if ch.isdigit())
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        if digits.startswith("0") and len(digits) == 11:
            digits = digits[1:]
        if not MOBILE_RE.match(digits):
            return text, f"{spec.label}: '{value}' is not a valid 10-digit mobile number."
        return digits, None
    if kind == "email":
        if "@" not in text or "." not in text.split("@")[-1]:
            return text, f"{spec.label}: '{value}' is not a valid email."
        return text.lower(), None
    if kind == "gstin":
        upper = text.upper()
        if not GSTIN_RE.match(upper):
            return text, f"{spec.label}: '{value}' is not a valid GSTIN."
        return upper, None
    if kind == "pan":
        upper = text.upper()
        if not PAN_RE.match(upper):
            return text, f"{spec.label}: '{value}' is not a valid PAN."
        return upper, None
    if kind == "pin":
        if not PIN_RE.match(text):
            return text, f"{spec.label}: '{value}' is not a valid 6-digit PIN code."
        return text, None
    if kind == "choice":
        upper = text.upper()
        normalized = _normalize_choice(spec, upper)
        if normalized is None:
            return text, f"{spec.label}: '{value}' must be one of {', '.join(spec.choices)}."
        return normalized, None
    return text, None


def _normalize_choice(spec, value: str) -> str | None:
    if value in spec.choices:
        return value
    aliases = {
        "DR": {"DEBIT", "TO COLLECT", "RECEIVABLE", "DR."},
        "CR": {"CREDIT", "TO PAY", "PAYABLE", "CR."},
        "ACTIVE": {"YES", "TRUE", "1", "ENABLED"},
        "INACTIVE": {"NO", "FALSE", "0", "DISABLED"},
    }
    for canonical, names in aliases.items():
        if canonical in spec.choices and value in names:
            return canonical
    return None


def _parse_flexible_date(text: str):
    from datetime import datetime

    cleaned = text.strip()[:19]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%m/%d/%Y", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _dataset_reference_checks(dataset: DatasetSpec, mapped: dict[str, Any], warnings: list[str], errors: list[str]) -> None:
    """Cross-reference lookups against production masters (read-only)."""
    if dataset.key == "opening_stock":
        product = str(mapped.get("product") or "")
        if product and not _product_exists(product):
            errors.append(f"Product '{product}' was not found. Import the product master first.")
        qty = mapped.get("quantity")
        if qty not in ("", None) and Decimal(str(qty)) < 0:
            errors.append("Quantity cannot be negative.")
        warehouse = str(mapped.get("warehouse") or "")
        if warehouse and not _warehouse_exists(warehouse):
            warnings.append(f"Warehouse '{warehouse}' was not found; the default location will be used.")
    elif dataset.key == "products":
        for field_name, checker, label in (
            ("category", _category_exists, "Category"),
            ("brand", _brand_exists, "Brand"),
            ("unit", _unit_exists, "Unit"),
        ):
            value = str(mapped.get(field_name) or "")
            if value and not checker(value):
                warnings.append(f"{label} '{value}' is not in the master list; it will be created/stored as text.")
    elif dataset.key in {"cash_opening_balance", "bank_opening_balance", "upi_opening_balance"}:
        account = str(mapped.get("account") or "")
        if account and _find_finance_account(dataset.key, account) is None:
            errors.append(
                f"Finance account '{account}' was not found. Create it in Business Setup → Finance Accounts first."
            )
    elif dataset.key == "customer_outstanding":
        amount = mapped.get("outstanding")
        if amount not in ("", None) and Decimal(str(amount)) <= 0:
            errors.append("Outstanding amount must be greater than zero.")
    elif dataset.key == "vendor_outstanding":
        vendor = str(mapped.get("vendor") or "")
        if vendor and not _vendor_exists(vendor):
            warnings.append(f"Vendor '{vendor}' was not found; it will be created during import.")


def _product_exists(value: str) -> bool:
    from subscriptions.models import Product

    return Product.objects.filter(name__iexact=value).exists() or Product.objects.filter(sku__iexact=value).exists() or Product.objects.filter(product_code__iexact=value).exists()


def _warehouse_exists(value: str) -> bool:
    from inventory.models import StockLocation

    return StockLocation.objects.filter(name__iexact=value).exists()


def _category_exists(value: str) -> bool:
    from subscriptions.models import ProductCategoryMaster

    return ProductCategoryMaster.objects.filter(name__iexact=value).exists()


def _brand_exists(value: str) -> bool:  # brand master may not exist — treat as free text
    return True


def _unit_exists(value: str) -> bool:
    from subscriptions.models import ProductUnitOfMeasureMaster

    return ProductUnitOfMeasureMaster.objects.filter(name__iexact=value).exists()


def _vendor_exists(value: str) -> bool:
    from accounting.models import Vendor

    return Vendor.objects.filter(name__iexact=value).exists()


def _find_finance_account(dataset_key: str, name: str):
    from accounting.models import FinanceAccount

    kind = {"cash_opening_balance": "CASH", "bank_opening_balance": "BANK", "upi_opening_balance": "UPI"}[dataset_key]
    return (
        FinanceAccount.objects.filter(kind=kind, name__iexact=name).first()
        or FinanceAccount.objects.filter(kind=kind, upi_handle__iexact=name).first()
    )


def validate_batch(*, batch: MigrationBatch, actor=None) -> dict[str, Any]:
    dataset = get_dataset(batch.dataset_key)
    mapping = batch.mapping or {}
    missing_required = [
        spec.label for spec in dataset.fields
        if spec.required and spec.key not in mapping
    ]
    if missing_required:
        raise ValueError(
            "Required fields are not mapped yet: " + ", ".join(missing_required)
        )

    counts = {"valid": 0, "warning": 0, "error": 0}
    queryset = batch.rows.exclude(status=StagingRowStatus.IMPORTED).order_by("row_number")
    updates: list[MigrationStagingRow] = []
    for row in queryset.iterator(chunk_size=STAGING_CHUNK):
        mapped: dict[str, Any] = {}
        errors: list[str] = []
        warnings: list[str] = []
        for spec in dataset.fields:
            header = mapping.get(spec.key)
            raw_value = row.raw_data.get(header, "") if header else ""
            value, error = _coerce_value(spec, str(raw_value))
            if error:
                errors.append(error)
            if spec.required and (value in ("", None)):
                errors.append(f"{spec.label} is required.")
            mapped[spec.key] = value
        if not errors:
            try:
                _dataset_reference_checks(dataset, mapped, warnings, errors)
            except Exception as exc:  # defensive: validation must report, not crash
                errors.append(f"Validation check failed: {exc}")
        row.mapped_data = mapped
        row.errors = errors
        row.warnings = warnings
        if errors:
            row.status = StagingRowStatus.ERROR
            counts["error"] += 1
        elif warnings:
            row.status = StagingRowStatus.WARNING
            counts["warning"] += 1
        else:
            row.status = StagingRowStatus.VALID
            counts["valid"] += 1
        updates.append(row)
        if len(updates) >= STAGING_CHUNK:
            MigrationStagingRow.objects.bulk_update(updates, ["mapped_data", "errors", "warnings", "status", "updated_at"])
            updates = []
    if updates:
        MigrationStagingRow.objects.bulk_update(updates, ["mapped_data", "errors", "warnings", "status", "updated_at"])

    batch.valid_rows = counts["valid"]
    batch.warning_rows = counts["warning"]
    batch.error_rows = counts["error"]
    batch.status = MigrationBatchStatus.VALIDATED
    batch.save(update_fields=["valid_rows", "warning_rows", "error_rows", "status", "updated_at"])
    log_action(batch=batch, action="VALIDATED", actor=actor, payload=counts)
    return counts


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------

def detect_duplicates(*, batch: MigrationBatch, actor=None) -> dict[str, Any]:
    dataset = get_dataset(batch.dataset_key)
    if not dataset.duplicate_keys:
        log_action(batch=batch, action="DUPLICATE_CHECK", actor=actor, payload={"duplicates": 0, "checked": False})
        return {"duplicates": 0, "checked_fields": []}

    lookups = _build_duplicate_lookups(dataset)
    seen_in_file: dict[tuple[str, str], int] = {}
    duplicate_count = 0
    updates: list[MigrationStagingRow] = []
    rows = batch.rows.filter(status__in=[StagingRowStatus.VALID, StagingRowStatus.WARNING, StagingRowStatus.DUPLICATE]).order_by("row_number")
    for row in rows.iterator(chunk_size=STAGING_CHUNK):
        matches: list[dict[str, Any]] = []
        for field_key in dataset.duplicate_keys:
            value = str(row.mapped_data.get(field_key) or "").strip().lower()
            if not value:
                continue
            existing = lookups.get(field_key, {}).get(value)
            if existing:
                matches.append({"field": field_key, "value": value, "existing_id": existing["id"], "existing_label": existing["label"], "scope": "production"})
            file_key = (field_key, value)
            if file_key in seen_in_file:
                matches.append({"field": field_key, "value": value, "existing_row": seen_in_file[file_key], "scope": "file"})
            else:
                seen_in_file[file_key] = row.row_number
        if matches:
            row.duplicate_matches = matches
            if row.duplicate_resolution == DuplicateResolution.NONE:
                row.duplicate_resolution = DuplicateResolution.SKIP
            row.status = StagingRowStatus.DUPLICATE
            duplicate_count += 1
        else:
            row.duplicate_matches = []
            if row.status == StagingRowStatus.DUPLICATE:
                row.status = StagingRowStatus.WARNING if row.warnings else StagingRowStatus.VALID
            row.duplicate_resolution = DuplicateResolution.NONE
        updates.append(row)
        if len(updates) >= STAGING_CHUNK:
            MigrationStagingRow.objects.bulk_update(updates, ["duplicate_matches", "duplicate_resolution", "status", "updated_at"])
            updates = []
    if updates:
        MigrationStagingRow.objects.bulk_update(updates, ["duplicate_matches", "duplicate_resolution", "status", "updated_at"])
    batch.duplicate_rows = duplicate_count
    batch.save(update_fields=["duplicate_rows", "updated_at"])
    log_action(batch=batch, action="DUPLICATE_CHECK", actor=actor, payload={"duplicates": duplicate_count})
    return {"duplicates": duplicate_count, "checked_fields": list(dataset.duplicate_keys)}


def _build_duplicate_lookups(dataset: DatasetSpec) -> dict[str, dict[str, dict[str, Any]]]:
    lookups: dict[str, dict[str, dict[str, Any]]] = {}
    if dataset.key == "customers":
        from subscriptions.models import Customer

        mobiles, emails = {}, {}
        for pk, name, phone, email in Customer.objects.values_list("id", "name", "phone", "user__email"):
            if phone:
                mobiles[phone.strip().lower()] = {"id": pk, "label": name}
            if email:
                emails[email.strip().lower()] = {"id": pk, "label": name}
        lookups["mobile"] = mobiles
        lookups["email"] = emails
        lookups["gst"] = {}
    elif dataset.key == "vendors":
        from accounting.models import Vendor

        gsts, phones = {}, {}
        for pk, name, gstin, phone in Vendor.objects.values_list("id", "name", "gstin", "phone"):
            if gstin:
                gsts[gstin.strip().lower()] = {"id": pk, "label": name}
            if phone:
                phones[phone.strip().lower()] = {"id": pk, "label": name}
        lookups["gst"] = gsts
        lookups["phone"] = phones
    elif dataset.key == "products":
        from subscriptions.models import Product

        skus: dict[str, dict[str, Any]] = {}
        for pk, name, sku, code in Product.objects.values_list("id", "name", "sku", "product_code"):
            if sku:
                skus[sku.strip().lower()] = {"id": pk, "label": name}
            if code:
                skus.setdefault(code.strip().lower(), {"id": pk, "label": name})
        lookups["sku"] = skus
        lookups["barcode"] = {}
    return lookups


def set_duplicate_resolutions(*, batch: MigrationBatch, resolutions: list[dict[str, Any]], actor=None) -> int:
    """resolutions: [{"row_number": 5, "resolution": "SKIP"}, ...]"""
    valid_values = set(DuplicateResolution.values)
    changed = 0
    for item in resolutions:
        resolution = str(item.get("resolution", "")).upper()
        if resolution not in valid_values:
            raise ValueError(f"Invalid resolution '{resolution}'.")
        changed += batch.rows.filter(
            row_number=item.get("row_number"), status=StagingRowStatus.DUPLICATE,
        ).update(duplicate_resolution=resolution)
    log_action(batch=batch, action="DUPLICATE_RESOLUTIONS_SET", actor=actor, payload={"count": changed})
    return changed


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------

def build_preview(*, batch: MigrationBatch, actor=None) -> dict[str, Any]:
    dataset = get_dataset(batch.dataset_key)
    importable = batch.rows.filter(status__in=[StagingRowStatus.VALID, StagingRowStatus.WARNING])
    duplicates = batch.rows.filter(status=StagingRowStatus.DUPLICATE)
    will_import = importable.count() + duplicates.exclude(duplicate_resolution=DuplicateResolution.SKIP).count()
    total_amount = None
    if dataset.amount_field:
        total = Decimal("0")
        for row in batch.rows.filter(
            status__in=[StagingRowStatus.VALID, StagingRowStatus.WARNING, StagingRowStatus.DUPLICATE]
        ).iterator(chunk_size=STAGING_CHUNK):
            if row.status == StagingRowStatus.DUPLICATE and row.duplicate_resolution == DuplicateResolution.SKIP:
                continue
            value = row.mapped_data.get(dataset.amount_field)
            if value not in ("", None):
                try:
                    total += Decimal(str(value))
                except InvalidOperation:
                    pass
        total_amount = str(total)
    summary = {
        "dataset": dataset.key,
        "dataset_label": dataset.label,
        "will_import": will_import,
        "errors": batch.error_rows,
        "warnings": batch.warning_rows,
        "duplicates_skip": duplicates.filter(duplicate_resolution=DuplicateResolution.SKIP).count(),
        "duplicates_merge": duplicates.filter(duplicate_resolution=DuplicateResolution.MERGE).count(),
        "duplicates_update": duplicates.filter(duplicate_resolution=DuplicateResolution.UPDATE).count(),
        "duplicates_create_new": duplicates.filter(duplicate_resolution=DuplicateResolution.CREATE_NEW).count(),
        "total_amount": total_amount,
        "amount_field": dataset.amount_field,
        "nothing_committed": True,
    }
    batch.preview_summary = summary
    batch.status = MigrationBatchStatus.PREVIEWED
    batch.save(update_fields=["preview_summary", "status", "updated_at"])
    log_action(batch=batch, action="PREVIEW", actor=actor, payload=summary)
    return summary
