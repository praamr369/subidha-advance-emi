"""Reconciliation: expected vs imported totals per batch and overall."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from migration_center.datasets import get_dataset
from migration_center.models import MigrationBatch, MigrationBatchStatus, StagingRowStatus
from migration_center.services.pipeline_service import log_action


def _imported_total(batch: MigrationBatch, amount_field: str) -> Decimal:
    total = Decimal("0")
    for row in batch.rows.filter(status=StagingRowStatus.IMPORTED).iterator(chunk_size=500):
        value = row.mapped_data.get(amount_field)
        if value not in ("", None):
            try:
                total += Decimal(str(value))
            except InvalidOperation:
                pass
    return total


def set_expected_total(*, batch: MigrationBatch, expected_total, actor=None) -> MigrationBatch:
    batch.expected_total = Decimal(str(expected_total)) if expected_total not in ("", None) else None
    batch.save(update_fields=["expected_total", "updated_at"])
    log_action(batch=batch, action="EXPECTED_TOTAL_SET", actor=actor, payload={"expected_total": str(batch.expected_total)})
    return batch


def reconcile_batch(*, batch: MigrationBatch, actor=None) -> dict[str, Any]:
    dataset = get_dataset(batch.dataset_key)
    imported_total = _imported_total(batch, dataset.amount_field) if dataset.amount_field else None
    expected = batch.expected_total
    difference = None
    matched = None
    if imported_total is not None and expected is not None:
        difference = expected - imported_total
        matched = difference == 0
    snapshot = {
        "dataset": dataset.key,
        "amount_field": dataset.amount_field,
        "expected_total": str(expected) if expected is not None else None,
        "imported_total": str(imported_total) if imported_total is not None else None,
        "difference": str(difference) if difference is not None else None,
        "matched": matched,
        "imported_rows": batch.imported_rows,
        "failed_rows": batch.failed_rows,
        "skipped_rows": batch.skipped_rows,
    }
    batch.reconciliation_snapshot = snapshot
    batch.save(update_fields=["reconciliation_snapshot", "updated_at"])
    log_action(batch=batch, action="RECONCILED", actor=actor, payload=snapshot)
    return snapshot


def overall_reconciliation() -> dict[str, Any]:
    """Cross-dataset reconciliation summary used by the Go-Live gate."""
    sections: list[dict[str, Any]] = []
    all_resolved = True
    batches = MigrationBatch.objects.filter(
        status__in=[MigrationBatchStatus.IMPORTED, MigrationBatchStatus.PARTIALLY_IMPORTED]
    )
    for batch in batches:
        snapshot = batch.reconciliation_snapshot or {}
        matched = snapshot.get("matched")
        has_expected = snapshot.get("expected_total") is not None
        unresolved = (has_expected and matched is False) or batch.failed_rows > 0
        if unresolved:
            all_resolved = False
        sections.append({
            "batch_number": batch.batch_number,
            "dataset": batch.dataset_key,
            "status": batch.status,
            "snapshot": snapshot,
            "failed_rows": batch.failed_rows,
            "unresolved": unresolved,
        })
    return {"batches": sections, "all_resolved": all_resolved}
