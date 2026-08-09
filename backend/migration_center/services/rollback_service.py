"""Batch rollback — undoes only what the migration created.

Rules:
- Records created by the batch are deleted (if business activity has not
  attached to them; a protected delete failure is reported, never forced).
- Records the batch updated (finance-account opening balances, merged
  customers/vendors/products) are restored from the stored prior_state.
- Manually created business data is never touched.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.apps import apps
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils import timezone

from migration_center.models import (
    MigrationBatch, MigrationBatchStatus, MigrationStagingRow, StagingRowStatus,
)
from migration_center.services.pipeline_service import log_action


def _get_instance(model_label: str, pk: int):
    model = apps.get_model(model_label)
    return model.objects.filter(pk=pk).first()


def _rollback_created(model_label: str, pk: int) -> tuple[bool, str]:
    instance = _get_instance(model_label, pk)
    if instance is None:
        return True, "already deleted"
    if model_label == "inventory.OpeningStockEntry":
        return _rollback_opening_stock_entry(instance)
    if model_label == "customers.Customer":
        return _rollback_created_customer(instance)
    try:
        instance.delete()
        return True, "deleted"
    except ProtectedError:
        return False, f"{model_label}#{pk} is referenced by other business records and was left in place."
    except Exception as exc:
        return False, f"{model_label}#{pk}: {exc}"


def _rollback_created_customer(customer) -> tuple[bool, str]:
    """Delete a migration-created customer only if no business activity exists.

    The creation itself writes protected BusinessEventLog rows; those pure
    log rows are removed with the customer. Any subscription/payment/contract
    activity means the customer is live — rollback refuses to touch it.
    """
    events = customer.business_events.all()
    has_activity = (
        events.exclude(subscription__isnull=True).exists()
        or events.exclude(payment__isnull=True).exists()
        or customer.subscriptions.exists()
    )
    if has_activity:
        return False, f"Customer #{customer.pk} has business activity and was left in place."
    try:
        events.delete()
        customer.delete()
        return True, "deleted (with creation event logs)"
    except ProtectedError:
        return False, f"Customer #{customer.pk} is referenced by other business records and was left in place."


def _rollback_opening_stock_entry(entry) -> tuple[bool, str]:
    from inventory.models import OpeningStockEntryStatus
    from inventory.services.opening_stock_entry_service import cancel_opening_stock_entry

    if entry.status == OpeningStockEntryStatus.DRAFT:
        cancel_opening_stock_entry(entry_id=entry.pk)
        return True, "draft cancelled"
    if entry.status == OpeningStockEntryStatus.POSTED:
        try:
            from inventory.services.opening_stock_entry_service import (
                create_opening_stock_correction_adjustment,
            )

            create_opening_stock_correction_adjustment(
                entry_id=entry.pk,
                reason="Migration batch rollback",
                quantity_delta=-entry.quantity,
            )
            return True, "posted entry reversed via draft correction adjustment (approve in inventory)"
        except Exception as exc:
            return False, f"Posted opening stock entry #{entry.pk} needs a manual correction adjustment: {exc}"
    return True, "already cancelled"


def _rollback_updated(row: MigrationStagingRow) -> tuple[bool, str]:
    prior = row.prior_state or {}
    instance = _get_instance(row.target_model, row.target_pk)
    if instance is None:
        return True, "target no longer exists"
    restorable = {k: v for k, v in prior.items() if k != "action"}
    if not restorable:
        return True, "no field changes to restore"
    for field_name, value in restorable.items():
        current_field = instance._meta.get_field(field_name)
        if current_field.get_internal_type() == "DecimalField" and value is not None:
            value = Decimal(str(value))
        setattr(instance, field_name, value)
    instance.save(update_fields=[*restorable.keys()])
    return True, "prior values restored"


def rollback_batch(*, batch: MigrationBatch, actor=None) -> dict[str, Any]:
    if batch.status not in (
        MigrationBatchStatus.IMPORTED, MigrationBatchStatus.PARTIALLY_IMPORTED, MigrationBatchStatus.FAILED,
    ):
        raise ValueError("Only imported (or partially imported/failed) batches can be rolled back.")

    rolled_back = 0
    issues: list[dict[str, Any]] = []
    rows = batch.rows.filter(status=StagingRowStatus.IMPORTED).order_by("-row_number")
    for row in rows.iterator(chunk_size=200):
        row_ok = True
        messages: list[str] = []
        with transaction.atomic():
            action = (row.prior_state or {}).get("action", "created")
            # Build the deletion worklist: main target, then extra targets.
            # Two passes so parent/child protection resolves regardless of
            # which side was created first (vendor↔ledger, user↔customer).
            worklist: list[tuple[str, int]] = []
            if row.target_model and row.target_pk and action not in ("updated", "already_existed", "matched"):
                worklist.append((row.target_model, row.target_pk))
            worklist.extend((extra["model"], extra["pk"]) for extra in reversed(row.extra_targets or []))
            if action == "updated" and row.target_model and row.target_pk:
                ok, message = _rollback_updated(row)
                messages.append(message)
                row_ok = row_ok and ok
            elif action in ("already_existed", "matched"):
                messages.append("no production change to undo")
            pending = worklist
            for _ in range(2):
                retry: list[tuple[str, int]] = []
                pass_messages: list[str] = []
                for model_label, pk in pending:
                    ok, message = _rollback_created(model_label, pk)
                    if ok:
                        pass_messages.append(message)
                    else:
                        retry.append((model_label, pk))
                        pass_messages.append(message)
                if not retry:
                    messages.extend(pass_messages)
                    pending = []
                    break
                if retry == pending:  # no progress — keep failure messages
                    messages.extend(pass_messages)
                    pending = retry
                    break
                pending = retry
            if pending:
                row_ok = False
            if row_ok:
                row.status = StagingRowStatus.ROLLED_BACK
                row.import_error = ""
                rolled_back += 1
            else:
                row.import_error = "Rollback issue: " + " | ".join(messages)
                issues.append({"row_number": row.row_number, "messages": messages})
            row.save(update_fields=["status", "import_error", "updated_at"])

    remaining = batch.rows.filter(status=StagingRowStatus.IMPORTED).count()
    batch.status = MigrationBatchStatus.ROLLED_BACK if remaining == 0 else MigrationBatchStatus.PARTIALLY_IMPORTED
    batch.rolled_back_at = timezone.now()
    batch.rolled_back_by = actor
    batch.imported_rows = remaining
    batch.save(update_fields=["status", "rolled_back_at", "rolled_back_by", "imported_rows", "updated_at"])
    result = {
        "batch_number": batch.batch_number,
        "rolled_back": rolled_back,
        "remaining_imported": remaining,
        "issues": issues,
        "status": batch.status,
    }
    log_action(batch=batch, action="ROLLBACK", actor=actor, payload=result)
    return result
