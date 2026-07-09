"""Data Workbench — build and edit migration data entirely inside the webapp.

A workbench batch is an ordinary MigrationBatch with source_type=WORKBENCH and
an identity mapping (source header == canonical field key), so it flows through
the exact same validate → dedupe → preview → import → rollback pipeline as an
uploaded file. The difference is the rows are created/edited/deleted online via
structured field forms instead of a third-party spreadsheet.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from migration_center.datasets import DatasetSpec, get_dataset
from migration_center.models import (
    DuplicateResolution, MigrationBatch, MigrationBatchStatus,
    MigrationStagingRow, MigrationSourceType, StagingRowStatus,
)
from migration_center.services.pipeline_service import (
    _coerce_value, _dataset_reference_checks, log_action,
)

# Rows can be edited until the batch is committed to production.
EDITABLE_STATUSES = {
    MigrationBatchStatus.UPLOADED,
    MigrationBatchStatus.MAPPED,
    MigrationBatchStatus.VALIDATED,
    MigrationBatchStatus.PREVIEWED,
    MigrationBatchStatus.APPROVED,
}


def _assert_editable(batch: MigrationBatch) -> None:
    if batch.status not in EDITABLE_STATUSES:
        raise ValueError(
            f"Batch {batch.batch_number} is {batch.status} and can no longer be edited in the workbench."
        )


def _identity_mapping(dataset: DatasetSpec) -> dict[str, str]:
    return {spec.key: spec.key for spec in dataset.fields}


def create_workbench_batch(*, dataset_key: str, actor=None) -> MigrationBatch:
    """Start an empty, editable batch for online data entry."""
    dataset = get_dataset(dataset_key)
    if not dataset.importable:
        raise ValueError(f"Dataset '{dataset_key}' is template-only and cannot be entered in the workbench.")
    mapping = _identity_mapping(dataset)
    batch = MigrationBatch.objects.create(
        batch_number=MigrationBatch.next_batch_number(),
        source_type=MigrationSourceType.WORKBENCH,
        dataset_key=dataset_key,
        original_filename="",
        source_headers=[spec.key for spec in dataset.fields],
        mapping=mapping,
        created_by=actor,
        notes="Created in Data Workbench (manual online entry).",
    )
    log_action(batch=batch, action="WORKBENCH_CREATED", actor=actor, payload={"dataset": dataset_key})
    return batch


def _clean_row_data(dataset: DatasetSpec, data: dict[str, Any]) -> dict[str, str]:
    """Keep only known field keys; stringify values for consistent staging."""
    cleaned: dict[str, str] = {}
    for spec in dataset.fields:
        value = data.get(spec.key, "")
        cleaned[spec.key] = "" if value is None else str(value).strip()
    return cleaned


def _validate_row(dataset: DatasetSpec, cleaned: dict[str, str]) -> tuple[dict[str, Any], list[str], list[str]]:
    """Return (mapped_data, errors, warnings) — same rules as batch validation."""
    mapped: dict[str, Any] = {}
    errors: list[str] = []
    warnings: list[str] = []
    for spec in dataset.fields:
        value, error = _coerce_value(spec, cleaned.get(spec.key, ""))
        if error:
            errors.append(error)
        if spec.required and value in ("", None):
            errors.append(f"{spec.label} is required.")
        mapped[spec.key] = value
    if not errors:
        try:
            _dataset_reference_checks(dataset, mapped, warnings, errors)
        except Exception as exc:  # defensive: never crash the editor
            errors.append(f"Validation check failed: {exc}")
    return mapped, errors, warnings


def _status_for(errors: list[str], warnings: list[str]) -> str:
    if errors:
        return StagingRowStatus.ERROR
    if warnings:
        return StagingRowStatus.WARNING
    return StagingRowStatus.VALID


def _next_row_number(batch: MigrationBatch) -> int:
    last = batch.rows.order_by("-row_number").values_list("row_number", flat=True).first()
    return (last or 1) + 1


@transaction.atomic
def add_row(*, batch: MigrationBatch, data: dict[str, Any], actor=None) -> MigrationStagingRow:
    _assert_editable(batch)
    dataset = get_dataset(batch.dataset_key)
    cleaned = _clean_row_data(dataset, data)
    mapped, errors, warnings = _validate_row(dataset, cleaned)
    row = MigrationStagingRow.objects.create(
        batch=batch,
        row_number=_next_row_number(batch),
        raw_data=cleaned,
        mapped_data=mapped,
        errors=errors,
        warnings=warnings,
        status=_status_for(errors, warnings),
    )
    _recount(batch)
    log_action(batch=batch, action="WORKBENCH_ROW_ADDED", actor=actor, payload={"row_number": row.row_number})
    return row


@transaction.atomic
def update_row(*, batch: MigrationBatch, row_number: int, data: dict[str, Any], actor=None) -> MigrationStagingRow:
    _assert_editable(batch)
    dataset = get_dataset(batch.dataset_key)
    row = batch.rows.select_for_update().get(row_number=row_number)
    if row.status == StagingRowStatus.IMPORTED:
        raise ValueError("Imported rows cannot be edited. Roll back the batch first.")
    cleaned = _clean_row_data(dataset, data)
    mapped, errors, warnings = _validate_row(dataset, cleaned)
    row.raw_data = cleaned
    row.mapped_data = mapped
    row.errors = errors
    row.warnings = warnings
    row.status = _status_for(errors, warnings)
    row.duplicate_matches = []
    row.duplicate_resolution = DuplicateResolution.NONE
    row.save(update_fields=[
        "raw_data", "mapped_data", "errors", "warnings", "status",
        "duplicate_matches", "duplicate_resolution", "updated_at",
    ])
    _recount(batch)
    log_action(batch=batch, action="WORKBENCH_ROW_UPDATED", actor=actor, payload={"row_number": row_number})
    return row


@transaction.atomic
def delete_row(*, batch: MigrationBatch, row_number: int, actor=None) -> None:
    _assert_editable(batch)
    row = batch.rows.select_for_update().get(row_number=row_number)
    if row.status == StagingRowStatus.IMPORTED:
        raise ValueError("Imported rows cannot be deleted. Roll back the batch first.")
    row.delete()
    _recount(batch)
    log_action(batch=batch, action="WORKBENCH_ROW_DELETED", actor=actor, payload={"row_number": row_number})


@transaction.atomic
def bulk_set_rows(*, batch: MigrationBatch, rows: list[dict[str, Any]], actor=None) -> int:
    """Replace all editable rows with the given list (paste-from-grid save)."""
    _assert_editable(batch)
    dataset = get_dataset(batch.dataset_key)
    batch.rows.exclude(status=StagingRowStatus.IMPORTED).delete()
    to_create: list[MigrationStagingRow] = []
    for index, data in enumerate(rows, start=2):
        cleaned = _clean_row_data(dataset, data)
        if not any(cleaned.values()):
            continue
        mapped, errors, warnings = _validate_row(dataset, cleaned)
        to_create.append(MigrationStagingRow(
            batch=batch, row_number=index, raw_data=cleaned, mapped_data=mapped,
            errors=errors, warnings=warnings, status=_status_for(errors, warnings),
        ))
    MigrationStagingRow.objects.bulk_create(to_create)
    _recount(batch)
    log_action(batch=batch, action="WORKBENCH_BULK_SET", actor=actor, payload={"rows": len(to_create)})
    return len(to_create)


@transaction.atomic
def adopt_upload_for_editing(*, batch: MigrationBatch, actor=None) -> MigrationBatch:
    """Pull an uploaded CSV/XLSX batch into the editable workbench grid.

    Re-keys every row from source headers to canonical field keys (using the
    current mapping) and switches the batch to an identity mapping, so the same
    online editor used for manual entry can edit imported file data. The file is
    opened and edited on our own page — no third-party spreadsheet app needed.
    """
    _assert_editable(batch)
    dataset = get_dataset(batch.dataset_key)
    mapping = batch.mapping or {}
    missing = [spec.label for spec in dataset.fields if spec.required and spec.key not in mapping]
    if missing:
        raise ValueError("Map the required fields before opening in the workbench: " + ", ".join(missing))
    updates: list[MigrationStagingRow] = []
    for row in batch.rows.exclude(status=StagingRowStatus.IMPORTED).iterator(chunk_size=500):
        cleaned = {
            spec.key: str(row.raw_data.get(mapping.get(spec.key, ""), "") or "").strip()
            for spec in dataset.fields
        }
        mapped, errors, warnings = _validate_row(dataset, cleaned)
        row.raw_data = cleaned
        row.mapped_data = mapped
        row.errors = errors
        row.warnings = warnings
        row.status = _status_for(errors, warnings)
        row.duplicate_matches = []
        row.duplicate_resolution = DuplicateResolution.NONE
        updates.append(row)
        if len(updates) >= 500:
            MigrationStagingRow.objects.bulk_update(updates, ["raw_data", "mapped_data", "errors", "warnings", "status", "duplicate_matches", "duplicate_resolution", "updated_at"])
            updates = []
    if updates:
        MigrationStagingRow.objects.bulk_update(updates, ["raw_data", "mapped_data", "errors", "warnings", "status", "duplicate_matches", "duplicate_resolution", "updated_at"])
    batch.mapping = _identity_mapping(dataset)
    batch.source_headers = [spec.key for spec in dataset.fields]
    batch.status = MigrationBatchStatus.MAPPED
    batch.preview_summary = None
    batch.save(update_fields=["mapping", "source_headers", "status", "preview_summary", "updated_at"])
    _recount(batch)
    log_action(batch=batch, action="WORKBENCH_ADOPTED_UPLOAD", actor=actor, payload={"rows": batch.total_rows})
    return batch


def _recount(batch: MigrationBatch) -> None:
    rows = batch.rows.all()
    batch.total_rows = rows.count()
    batch.valid_rows = rows.filter(status=StagingRowStatus.VALID).count()
    batch.warning_rows = rows.filter(status=StagingRowStatus.WARNING).count()
    batch.error_rows = rows.filter(status=StagingRowStatus.ERROR).count()
    batch.duplicate_rows = rows.filter(status=StagingRowStatus.DUPLICATE).count()
    # Editing invalidates a prior preview/validation snapshot.
    if batch.status in (MigrationBatchStatus.PREVIEWED, MigrationBatchStatus.VALIDATED, MigrationBatchStatus.APPROVED):
        batch.status = MigrationBatchStatus.MAPPED
        batch.preview_summary = None
    batch.save(update_fields=[
        "total_rows", "valid_rows", "warning_rows", "error_rows", "duplicate_rows",
        "status", "preview_summary", "updated_at",
    ])
