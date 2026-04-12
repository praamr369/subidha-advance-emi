from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from inventory.models import InventoryItem, InventoryItemType, StockMovementType
from inventory.services.stock_service import create_stock_ledger_entry
from manufacturing.models import (
    MONEY_ZERO,
    QUANTITY_ZERO,
    ManufacturingAccountingStatus,
    ManufacturingBom,
    ManufacturingBomLine,
    ManufacturingBomStatus,
    ManufacturingCostingStatus,
    ProductionJob,
    ProductionJobStatus,
    ProductionMaterialEntryKind,
    ProductionMaterialIssueLine,
    ProductionReceiptLine,
    ProductionScrapLine,
)
from manufacturing.services.audit_service import log_manufacturing_event
from subscriptions.models import AuditLog


def _quantity(value) -> Decimal:
    return Decimal(str(value or QUANTITY_ZERO)).quantize(Decimal("0.001"))


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _unit_cost(value) -> Decimal | None:
    if value in {None, ""}:
        return None
    return Decimal(str(value)).quantize(Decimal("0.0001"))


def _string(value) -> str:
    return str(value or "").strip()


def _default_material_cost(item: InventoryItem, explicit_unit_cost) -> Decimal | None:
    if explicit_unit_cost not in {None, ""}:
        return _unit_cost(explicit_unit_cost)
    if item.standard_unit_cost is None:
        return None
    return _unit_cost(item.standard_unit_cost)


def _line_total_from_snapshot(quantity: Decimal, unit_cost_snapshot: Decimal | None, explicit_total=None) -> Decimal:
    explicit = _money(explicit_total)
    if explicit > MONEY_ZERO:
        return explicit
    if unit_cost_snapshot is None:
        return MONEY_ZERO
    return (quantity * unit_cost_snapshot).quantize(Decimal("0.01"))


def _draft_bom_lines_from_payload(*, lines: list[dict]) -> list[dict]:
    if not lines:
        raise ValueError("At least one BOM line is required.")

    normalized: list[dict] = []
    for index, line in enumerate(lines, start=1):
        inventory_item = line.get("inventory_item")
        if not isinstance(inventory_item, InventoryItem):
            raise ValueError("Each BOM line must reference an inventory item.")
        if inventory_item.stock_item_type not in {
            InventoryItemType.RAW_MATERIAL,
            InventoryItemType.ACCESSORY,
        }:
            raise ValueError("BOM lines require raw-material or accessory inventory items.")
        quantity_per_unit = _quantity(line.get("quantity_per_unit"))
        if quantity_per_unit <= QUANTITY_ZERO:
            raise ValueError("BOM quantity per unit must be greater than zero.")
        wastage_percent = Decimal(str(line.get("wastage_percent") or "0.00")).quantize(Decimal("0.01"))
        if wastage_percent < Decimal("0.00") or wastage_percent > Decimal("100.00"):
            raise ValueError("BOM wastage percent must be between 0 and 100.")
        normalized.append(
            {
                "inventory_item": inventory_item,
                "quantity_per_unit": quantity_per_unit,
                "wastage_percent": wastage_percent,
                "sort_order": int(line.get("sort_order") or index),
                "notes": _string(line.get("notes")),
            }
        )
    return normalized


def _replace_bom_lines(*, bom: ManufacturingBom, lines: list[dict]):
    bom.lines.all().delete()
    ManufacturingBomLine.objects.bulk_create(
        [ManufacturingBomLine(bom=bom, **line) for line in lines]
    )


def _resolve_default_bom(*, finished_good_inventory_item: InventoryItem) -> ManufacturingBom | None:
    return (
        ManufacturingBom.objects.filter(
            finished_good_inventory_item=finished_good_inventory_item,
            status=ManufacturingBomStatus.ACTIVE,
        )
        .order_by("-is_default", "-revision_no", "-id")
        .first()
    )


def _seed_material_lines_from_bom(job: ProductionJob) -> list[ProductionMaterialIssueLine]:
    if job.bom_id is None:
        return []
    if job.material_issue_lines.exists():
        return list(job.material_issue_lines.all())

    created_lines: list[ProductionMaterialIssueLine] = []
    for bom_line in job.bom.lines.select_related("inventory_item", "inventory_item__product").all():
        planned_quantity = (
            bom_line.quantity_per_unit
            * job.planned_output_qty
            * (Decimal("1.00") + (bom_line.wastage_percent / Decimal("100.00")))
        ).quantize(Decimal("0.001"))
        unit_cost_snapshot = _default_material_cost(bom_line.inventory_item, None)
        created_lines.append(
            ProductionMaterialIssueLine.objects.create(
                production_job=job,
                bom_line=bom_line,
                inventory_item=bom_line.inventory_item,
                entry_kind=ProductionMaterialEntryKind.ISSUE,
                description=bom_line.inventory_item.product.name,
                planned_quantity=planned_quantity,
                quantity=planned_quantity,
                unit_cost_snapshot=unit_cost_snapshot,
                line_total_cost=_line_total_from_snapshot(planned_quantity, unit_cost_snapshot),
                notes=bom_line.notes,
            )
        )
    return created_lines


def _refresh_job_rollups(job: ProductionJob) -> ProductionJob:
    material_lines = list(ProductionMaterialIssueLine.objects.filter(production_job=job))
    receipt_lines = list(ProductionReceiptLine.objects.filter(production_job=job))
    scrap_lines = list(ProductionScrapLine.objects.filter(production_job=job))

    issued_cost = sum(
        (
            _money(line.line_total_cost)
            if line.entry_kind == ProductionMaterialEntryKind.ISSUE
            else -_money(line.line_total_cost)
        )
        for line in material_lines
        if line.is_posted
    )
    received_cost = sum((_money(line.line_total_cost) for line in receipt_lines if line.is_posted), MONEY_ZERO)
    scrap_cost = sum((_money(line.line_total_cost) for line in scrap_lines if line.is_posted), MONEY_ZERO)
    completed_output_qty = sum((_quantity(line.quantity) for line in receipt_lines if line.is_posted), QUANTITY_ZERO)
    wip_cost = _money(issued_cost - received_cost - scrap_cost)

    posted_material = [line for line in material_lines if line.is_posted]
    posted_receipts = [line for line in receipt_lines if line.is_posted]
    posted_scrap = [line for line in scrap_lines if line.is_posted]
    posted_any = bool(posted_material or posted_receipts or posted_scrap)
    deferred_lines = [
        line
        for line in [*posted_material, *posted_receipts, *posted_scrap]
        if _money(getattr(line, "line_total_cost", MONEY_ZERO)) == MONEY_ZERO
        and getattr(line, "posted_journal_entry_id", None) is None
    ]
    remaining_drafts = (
        any(not line.is_posted for line in material_lines)
        or any(not line.is_posted for line in receipt_lines)
        or any(not line.is_posted for line in scrap_lines)
    )

    if not posted_any:
        costing_status = ManufacturingCostingStatus.PENDING
        accounting_status = ManufacturingAccountingStatus.NOT_REQUIRED
        posting_notes = ""
    elif deferred_lines:
        costing_status = ManufacturingCostingStatus.DEFERRED
        accounting_status = ManufacturingAccountingStatus.DEFERRED
        posting_notes = "One or more manufacturing lines posted without costing support; accounting bridge remained deferred."
    else:
        costing_status = ManufacturingCostingStatus.READY
        accounting_status = (
            ManufacturingAccountingStatus.POSTED
            if not remaining_drafts and job.status == ProductionJobStatus.COMPLETED and wip_cost == MONEY_ZERO
            else ManufacturingAccountingStatus.PENDING
        )
        posting_notes = ""

    ProductionJob.objects.filter(pk=job.pk).update(
        completed_output_qty=completed_output_qty,
        total_issued_cost=_money(issued_cost),
        total_received_cost=received_cost,
        total_scrap_cost=scrap_cost,
        wip_cost=wip_cost,
        costing_status=costing_status,
        accounting_status=accounting_status,
        posting_notes=posting_notes,
    )
    job.refresh_from_db()
    return job


def _normalize_material_batch_lines(*, lines: list[dict], job: ProductionJob) -> list[dict]:
    if not lines:
        raise ValueError("At least one material movement line is required.")

    normalized: list[dict] = []
    for line in lines:
        inventory_item = line.get("inventory_item")
        if not isinstance(inventory_item, InventoryItem):
            raise ValueError("Each material movement line must reference an inventory item.")
        if inventory_item.stock_item_type not in {InventoryItemType.RAW_MATERIAL, InventoryItemType.ACCESSORY}:
            raise ValueError("Material movement lines must use raw-material or accessory inventory items.")
        if inventory_item.id == job.finished_good_inventory_item_id:
            raise ValueError("Material movement lines cannot target the finished-good inventory item.")
        entry_kind = (line.get("entry_kind") or ProductionMaterialEntryKind.ISSUE).strip().upper()
        if entry_kind not in ProductionMaterialEntryKind.values:
            raise ValueError("Unsupported production material movement kind.")
        quantity = _quantity(line.get("quantity"))
        if quantity <= QUANTITY_ZERO:
            raise ValueError("Material movement quantity must be greater than zero.")
        unit_cost_snapshot = _default_material_cost(inventory_item, line.get("unit_cost_snapshot"))
        normalized.append(
            {
                "bom_line": line.get("bom_line"),
                "inventory_item": inventory_item,
                "entry_kind": entry_kind,
                "description": _string(line.get("description")) or inventory_item.product.name,
                "planned_quantity": _quantity(line.get("planned_quantity")),
                "quantity": quantity,
                "unit_cost_snapshot": unit_cost_snapshot,
                "line_total_cost": _line_total_from_snapshot(quantity, unit_cost_snapshot, line.get("line_total_cost")),
                "notes": _string(line.get("notes")),
            }
        )
    return normalized


def _prepare_scrap_batch_lines(*, lines: list[dict], job: ProductionJob) -> list[dict]:
    normalized: list[dict] = []
    for line in lines:
        inventory_item = line.get("inventory_item")
        if inventory_item is not None and not isinstance(inventory_item, InventoryItem):
            raise ValueError("Scrap lines must reference a valid inventory item when one is provided.")
        quantity = _quantity(line.get("quantity"))
        if quantity <= QUANTITY_ZERO:
            raise ValueError("Scrap quantity must be greater than zero.")
        unit_cost_snapshot = None
        if inventory_item is not None:
            unit_cost_snapshot = _default_material_cost(inventory_item, line.get("unit_cost_snapshot"))
        elif line.get("unit_cost_snapshot") not in {None, ""}:
            unit_cost_snapshot = _unit_cost(line.get("unit_cost_snapshot"))
        normalized.append(
            {
                "inventory_item": inventory_item,
                "description": _string(line.get("description")) or "Production scrap",
                "quantity": quantity,
                "unit_cost_snapshot": unit_cost_snapshot,
                "line_total_cost": _line_total_from_snapshot(quantity, unit_cost_snapshot, line.get("line_total_cost")),
                "reason": _string(line.get("reason")) or "Production wastage",
                "notes": _string(line.get("notes")),
            }
        )
    return normalized


def _prepare_receipt_batch_lines(*, lines: list[dict], job: ProductionJob, current_wip_pool: Decimal, scrap_cost_total: Decimal) -> list[dict]:
    if not lines:
        return []

    prepared: list[dict] = []
    for line in lines:
        inventory_item = line.get("inventory_item") or job.finished_good_inventory_item
        if not isinstance(inventory_item, InventoryItem):
            raise ValueError("Receipt lines must reference a valid inventory item.")
        if inventory_item.id != job.finished_good_inventory_item_id:
            raise ValueError("Receipt lines must target the production job finished-good inventory item.")
        quantity = _quantity(line.get("quantity"))
        if quantity <= QUANTITY_ZERO:
            raise ValueError("Receipt quantity must be greater than zero.")
        explicit_unit_cost = _unit_cost(line.get("unit_cost_snapshot"))
        explicit_total = _money(line.get("line_total_cost"))
        derived_total = _line_total_from_snapshot(quantity, explicit_unit_cost, explicit_total)
        prepared.append(
            {
                "inventory_item": inventory_item,
                "description": _string(line.get("description")) or inventory_item.product.name,
                "quantity": quantity,
                "unit_cost_snapshot": explicit_unit_cost,
                "line_total_cost": derived_total,
                "notes": _string(line.get("notes")),
                "_explicit_cost": derived_total > MONEY_ZERO,
            }
        )

    total_new_qty = sum((_quantity(line["quantity"]) for line in prepared), QUANTITY_ZERO)
    remaining_expected_qty = max(job.planned_output_qty - job.completed_output_qty, total_new_qty)
    if remaining_expected_qty <= QUANTITY_ZERO:
        remaining_expected_qty = total_new_qty

    if scrap_cost_total > current_wip_pool:
        raise ValueError("Scrap cost cannot exceed the current WIP pool.")

    pool_after_scrap = _money(current_wip_pool - scrap_cost_total)
    target_batch_cost = (
        pool_after_scrap
        if remaining_expected_qty == total_new_qty
        else _money(pool_after_scrap * (total_new_qty / remaining_expected_qty))
    )

    explicit_total = sum((_money(line["line_total_cost"]) for line in prepared if line["_explicit_cost"]), MONEY_ZERO)
    if explicit_total > target_batch_cost + Decimal("0.01"):
        raise ValueError("Receipt cost allocation exceeds the safe WIP cost available for this output batch.")

    auto_lines = [line for line in prepared if not line["_explicit_cost"]]
    auto_total = _money(target_batch_cost - explicit_total)
    auto_qty_total = sum((_quantity(line["quantity"]) for line in auto_lines), QUANTITY_ZERO)
    allocated_running = MONEY_ZERO
    auto_index = 0

    for line in prepared:
        if line["_explicit_cost"]:
            continue
        auto_index += 1
        if auto_total <= MONEY_ZERO or auto_qty_total <= QUANTITY_ZERO:
            allocated = MONEY_ZERO
        elif auto_index == len(auto_lines):
            allocated = _money(auto_total - allocated_running)
        else:
            allocated = _money(auto_total * (_quantity(line["quantity"]) / auto_qty_total))
            allocated_running += allocated
        line["line_total_cost"] = allocated
        line["unit_cost_snapshot"] = (
            (allocated / _quantity(line["quantity"])).quantize(Decimal("0.0001"))
            if allocated > MONEY_ZERO and _quantity(line["quantity"]) > QUANTITY_ZERO
            else None
        )

    return prepared


def _build_bridge_lines_for_material(line: ProductionMaterialIssueLine) -> list[dict] | None:
    amount = _money(line.line_total_cost)
    if amount <= MONEY_ZERO:
        return None
    accounts = ensure_phase3_system_accounts()
    if line.entry_kind == ProductionMaterialEntryKind.ISSUE:
        return [
            {
                "chart_account": accounts["WIP_INVENTORY"],
                "description": line.production_job.job_no,
                "debit_amount": amount,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": accounts["INVENTORY_ASSET"],
                "description": line.inventory_item.sku or line.inventory_item.product.name,
                "debit_amount": MONEY_ZERO,
                "credit_amount": amount,
            },
        ]
    return [
        {
            "chart_account": accounts["INVENTORY_ASSET"],
            "description": line.production_job.job_no,
            "debit_amount": amount,
            "credit_amount": MONEY_ZERO,
        },
        {
            "chart_account": accounts["WIP_INVENTORY"],
            "description": line.inventory_item.sku or line.inventory_item.product.name,
            "debit_amount": MONEY_ZERO,
            "credit_amount": amount,
        },
    ]


def _build_bridge_lines_for_receipt(line: ProductionReceiptLine) -> list[dict] | None:
    amount = _money(line.line_total_cost)
    if amount <= MONEY_ZERO:
        return None
    accounts = ensure_phase3_system_accounts()
    return [
        {
            "chart_account": accounts["INVENTORY_ASSET"],
            "description": line.production_job.job_no,
            "debit_amount": amount,
            "credit_amount": MONEY_ZERO,
        },
        {
            "chart_account": accounts["WIP_INVENTORY"],
            "description": line.inventory_item.sku or line.inventory_item.product.name,
            "debit_amount": MONEY_ZERO,
            "credit_amount": amount,
        },
    ]


def _build_bridge_lines_for_scrap(line: ProductionScrapLine) -> list[dict] | None:
    amount = _money(line.line_total_cost)
    if amount <= MONEY_ZERO:
        return None
    accounts = ensure_phase3_system_accounts()
    return [
        {
            "chart_account": accounts["MANUFACTURING_SCRAP_EXPENSE"],
            "description": line.reason,
            "debit_amount": amount,
            "credit_amount": MONEY_ZERO,
        },
        {
            "chart_account": accounts["WIP_INVENTORY"],
            "description": line.production_job.job_no,
            "debit_amount": MONEY_ZERO,
            "credit_amount": amount,
        },
    ]


@transaction.atomic
def upsert_manufacturing_bom_draft(*, payload: dict, bom_id: int | None = None, performed_by=None) -> ManufacturingBom:
    payload = dict(payload)
    lines = payload.pop("lines", None)
    if bom_id is None and not lines:
        raise ValueError("At least one BOM line is required.")

    if bom_id is None:
        bom = ManufacturingBom.objects.create(**payload)
        if lines:
            _replace_bom_lines(bom=bom, lines=_draft_bom_lines_from_payload(lines=lines))
        log_manufacturing_event(
            action_type=AuditLog.ActionType.MANUFACTURING_BOM_CREATED,
            instance=bom,
            performed_by=performed_by,
            event="MANUFACTURING_BOM_CREATED",
            metadata={
                "bom_id": bom.id,
                "bom_no": bom.bom_no,
                "finished_good_inventory_item_id": bom.finished_good_inventory_item_id,
                "revision_no": bom.revision_no,
                "line_count": bom.lines.count(),
            },
        )
        return bom

    bom = ManufacturingBom.objects.select_for_update().get(pk=bom_id)
    if bom.status == ManufacturingBomStatus.ACTIVE:
        raise ValueError("Active BOMs cannot be edited. Deactivate or create a new revision instead.")
    for field_name, value in payload.items():
        setattr(bom, field_name, value)
    bom.save()
    if lines is not None:
        _replace_bom_lines(bom=bom, lines=_draft_bom_lines_from_payload(lines=lines))
    log_manufacturing_event(
        action_type=AuditLog.ActionType.MANUFACTURING_BOM_UPDATED,
        instance=bom,
        performed_by=performed_by,
        event="MANUFACTURING_BOM_UPDATED",
        metadata={
            "bom_id": bom.id,
            "bom_no": bom.bom_no,
            "line_count": bom.lines.count(),
        },
    )
    return bom


@transaction.atomic
def activate_manufacturing_bom(*, bom_id: int, performed_by=None):
    bom = ManufacturingBom.objects.select_for_update().prefetch_related("lines").get(pk=bom_id)
    if bom.status == ManufacturingBomStatus.ACTIVE:
        return bom, False
    if not bom.lines.exists():
        raise ValueError("BOM must contain at least one line before activation.")

    if bom.is_default:
        ManufacturingBom.objects.filter(
            finished_good_inventory_item_id=bom.finished_good_inventory_item_id,
            status=ManufacturingBomStatus.ACTIVE,
            is_default=True,
        ).exclude(pk=bom.pk).update(is_default=False)
    bom.status = ManufacturingBomStatus.ACTIVE
    bom.activated_at = timezone.now()
    bom.activated_by = performed_by
    bom.save(update_fields=["status", "activated_at", "activated_by", "updated_at"])
    log_manufacturing_event(
        action_type=AuditLog.ActionType.MANUFACTURING_BOM_STATUS_UPDATED,
        instance=bom,
        performed_by=performed_by,
        event="MANUFACTURING_BOM_ACTIVATED",
        metadata={"bom_id": bom.id, "bom_no": bom.bom_no},
    )
    return bom, True


@transaction.atomic
def deactivate_manufacturing_bom(*, bom_id: int, performed_by=None):
    bom = ManufacturingBom.objects.select_for_update().get(pk=bom_id)
    if bom.status == ManufacturingBomStatus.INACTIVE:
        return bom, False
    bom.status = ManufacturingBomStatus.INACTIVE
    bom.save(update_fields=["status", "updated_at"])
    log_manufacturing_event(
        action_type=AuditLog.ActionType.MANUFACTURING_BOM_STATUS_UPDATED,
        instance=bom,
        performed_by=performed_by,
        event="MANUFACTURING_BOM_DEACTIVATED",
        metadata={"bom_id": bom.id, "bom_no": bom.bom_no},
    )
    return bom, True


@transaction.atomic
def upsert_production_job_draft(*, payload: dict, job_id: int | None = None, performed_by=None) -> ProductionJob:
    payload = dict(payload)
    material_issue_lines = payload.pop("material_issue_lines", None)
    finished_good_inventory_item = payload.get("finished_good_inventory_item")
    bom = payload.get("bom")
    if finished_good_inventory_item is None and job_id is None:
        raise ValueError("Finished-good inventory item is required for a production job.")
    if job_id is None and bom is None and finished_good_inventory_item is not None:
        payload["bom"] = _resolve_default_bom(finished_good_inventory_item=finished_good_inventory_item)

    if payload.get("stock_location") is None:
        fg_item = payload.get("finished_good_inventory_item")
        payload["stock_location"] = getattr(fg_item, "default_stock_location", None)

    if job_id is None:
        job = ProductionJob.objects.create(created_by=performed_by, **payload)
        if material_issue_lines is not None:
            normalized_lines = _normalize_material_batch_lines(lines=material_issue_lines, job=job)
            ProductionMaterialIssueLine.objects.bulk_create(
                [ProductionMaterialIssueLine(production_job=job, **line) for line in normalized_lines]
            )
        elif job.bom_id:
            _seed_material_lines_from_bom(job)
        job = _refresh_job_rollups(job)
        log_manufacturing_event(
            action_type=AuditLog.ActionType.PRODUCTION_JOB_CREATED,
            instance=job,
            performed_by=performed_by,
            event="PRODUCTION_JOB_CREATED",
            metadata={
                "production_job_id": job.id,
                "job_no": job.job_no,
                "bom_id": job.bom_id,
                "finished_good_inventory_item_id": job.finished_good_inventory_item_id,
                "planned_output_qty": f"{job.planned_output_qty:.3f}",
            },
        )
        return job

    job = (
        ProductionJob.objects.select_for_update()
        .select_related("bom", "finished_good_inventory_item", "stock_location")
        .prefetch_related("material_issue_lines", "receipt_lines", "scrap_lines")
        .get(pk=job_id)
    )
    if job.status not in {ProductionJobStatus.DRAFT, ProductionJobStatus.RELEASED}:
        raise ValueError("Only draft or released production jobs can be edited.")
    if any(line.is_posted for line in [*job.material_issue_lines.all(), *job.receipt_lines.all(), *job.scrap_lines.all()]):
        raise ValueError("Production jobs cannot be edited after material or output posting has started.")

    for field_name, value in payload.items():
        setattr(job, field_name, value)
    if job.stock_location_id is None:
        job.stock_location = job.finished_good_inventory_item.default_stock_location
    job.save()
    if material_issue_lines is not None:
        job.material_issue_lines.all().delete()
        normalized_lines = _normalize_material_batch_lines(lines=material_issue_lines, job=job)
        ProductionMaterialIssueLine.objects.bulk_create(
            [ProductionMaterialIssueLine(production_job=job, **line) for line in normalized_lines]
        )
    elif job.bom_id and not job.material_issue_lines.exists():
        _seed_material_lines_from_bom(job)
    job = _refresh_job_rollups(job)
    log_manufacturing_event(
        action_type=AuditLog.ActionType.PRODUCTION_JOB_UPDATED,
        instance=job,
        performed_by=performed_by,
        event="PRODUCTION_JOB_UPDATED",
        metadata={
            "production_job_id": job.id,
            "job_no": job.job_no,
            "material_line_count": job.material_issue_lines.count(),
        },
    )
    return job


@transaction.atomic
def release_production_job(*, job_id: int, performed_by=None):
    job = (
        ProductionJob.objects.select_for_update()
        .select_related("bom", "finished_good_inventory_item")
        .prefetch_related("material_issue_lines", "bom__lines", "bom__lines__inventory_item", "bom__lines__inventory_item__product")
        .get(pk=job_id)
    )
    if job.status == ProductionJobStatus.RELEASED:
        return job, False
    if job.status != ProductionJobStatus.DRAFT:
        raise ValueError("Only draft production jobs can be released.")
    if job.bom_id and job.bom.status != ManufacturingBomStatus.ACTIVE:
        raise ValueError("Production jobs can only release against an active BOM revision.")
    if not job.material_issue_lines.exists():
        _seed_material_lines_from_bom(job)
    if not job.material_issue_lines.exists():
        raise ValueError("Production job requires material issue lines before release.")

    job.status = ProductionJobStatus.RELEASED
    job.released_at = timezone.now()
    job.released_by = performed_by
    job.save(update_fields=["status", "released_at", "released_by", "updated_at"])
    job = _refresh_job_rollups(job)
    log_manufacturing_event(
        action_type=AuditLog.ActionType.PRODUCTION_JOB_STATUS_UPDATED,
        instance=job,
        performed_by=performed_by,
        event="PRODUCTION_JOB_RELEASED",
        metadata={"production_job_id": job.id, "job_no": job.job_no},
    )
    return job, True


@transaction.atomic
def post_production_materials(*, job_id: int, movement_date=None, lines: list[dict] | None = None, performed_by=None):
    job = (
        ProductionJob.objects.select_for_update()
        .select_related("bom", "finished_good_inventory_item", "stock_location")
        .prefetch_related("material_issue_lines", "material_issue_lines__inventory_item", "material_issue_lines__inventory_item__product")
        .get(pk=job_id)
    )
    if job.status not in {ProductionJobStatus.RELEASED, ProductionJobStatus.IN_PROGRESS}:
        raise ValueError("Only released or in-progress production jobs can post material movement.")
    posting_date = movement_date or timezone.localdate()

    pending_lines: list[ProductionMaterialIssueLine]
    if lines:
        normalized_lines = _normalize_material_batch_lines(lines=lines, job=job)
        pending_lines = [
            ProductionMaterialIssueLine.objects.create(production_job=job, **line)
            for line in normalized_lines
        ]
    else:
        pending_lines = list(
            job.material_issue_lines.filter(is_posted=False).select_related("inventory_item", "inventory_item__product")
        )
        if not pending_lines and job.bom_id:
            pending_lines = _seed_material_lines_from_bom(job)

    if not pending_lines:
        raise ValueError("No pending production material lines are available to post.")

    posted_count = 0
    issue_count = 0
    return_count = 0
    deferred_count = 0

    for line in pending_lines:
        bridge_lines = _build_bridge_lines_for_material(line)
        journal_entry = None
        purpose = (
            "PRODUCTION_MATERIAL_ISSUE"
            if line.entry_kind == ProductionMaterialEntryKind.ISSUE
            else "PRODUCTION_MATERIAL_RETURN"
        )
        voucher_type = (
            "PRODUCTION_ISSUE"
            if line.entry_kind == ProductionMaterialEntryKind.ISSUE
            else "PRODUCTION_RETURN"
        )
        if bridge_lines is not None:
            journal_entry, _ = post_bridge_entry(
                source_instance=line,
                purpose=purpose,
                entry_date=posting_date,
                memo=f"Production material {line.entry_kind.lower()} {job.job_no}",
                lines=bridge_lines,
                voucher_type=voucher_type,
                source_type="PRODUCTION_JOB",
                source_reference=job.job_no,
                source_document_no=job.job_no,
                source_event_date=posting_date,
                trace_metadata={
                    "production_job_id": job.id,
                    "job_no": job.job_no,
                    "material_line_id": line.id,
                    "entry_kind": line.entry_kind,
                    "inventory_item_id": line.inventory_item_id,
                },
                posted_by=performed_by,
            )
        else:
            deferred_count += 1

        movement_type = (
            StockMovementType.PRODUCTION_ISSUE_OUT
            if line.entry_kind == ProductionMaterialEntryKind.ISSUE
            else StockMovementType.PRODUCTION_RETURN_IN
        )
        quantity_kwargs = (
            {"quantity_out": line.quantity, "quantity_in": QUANTITY_ZERO}
            if line.entry_kind == ProductionMaterialEntryKind.ISSUE
            else {"quantity_in": line.quantity, "quantity_out": QUANTITY_ZERO}
        )
        create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=movement_type,
            movement_date=posting_date,
            stock_location=job.stock_location or line.inventory_item.default_stock_location,
            reference_model="ProductionMaterialIssueLine",
            reference_id=str(line.id),
            notes=job.job_no,
            posted_by=performed_by,
            posted_journal_entry=journal_entry,
            **quantity_kwargs,
        )
        line.is_posted = True
        line.posted_at = timezone.now()
        line.posted_by = performed_by
        line.posted_journal_entry = journal_entry
        line.save(update_fields=["is_posted", "posted_at", "posted_by", "posted_journal_entry", "updated_at"])
        posted_count += 1
        if line.entry_kind == ProductionMaterialEntryKind.ISSUE:
            issue_count += 1
        else:
            return_count += 1

    if job.status == ProductionJobStatus.RELEASED:
        job.status = ProductionJobStatus.IN_PROGRESS
        job.started_at = job.started_at or timezone.now()
        job.save(update_fields=["status", "started_at", "updated_at"])

    job = _refresh_job_rollups(job)
    log_manufacturing_event(
        action_type=AuditLog.ActionType.PRODUCTION_MATERIAL_MOVEMENT_POSTED,
        instance=job,
        performed_by=performed_by,
        event="PRODUCTION_MATERIAL_MOVEMENT_POSTED",
        metadata={
            "production_job_id": job.id,
            "job_no": job.job_no,
            "posted_count": posted_count,
            "issue_count": issue_count,
            "return_count": return_count,
            "deferred_accounting_count": deferred_count,
            "movement_date": posting_date.isoformat(),
        },
    )
    return job, True


@transaction.atomic
def post_production_output(*, job_id: int, output_date=None, receipt_lines: list[dict] | None = None, scrap_lines: list[dict] | None = None, performed_by=None):
    job = (
        ProductionJob.objects.select_for_update()
        .select_related("finished_good_inventory_item", "stock_location")
        .prefetch_related("material_issue_lines", "receipt_lines", "scrap_lines")
        .get(pk=job_id)
    )
    if job.status not in {ProductionJobStatus.RELEASED, ProductionJobStatus.IN_PROGRESS}:
        raise ValueError("Only released or in-progress production jobs can post output.")
    if not job.material_issue_lines.filter(is_posted=True).exists():
        raise ValueError("Material issue must be posted before finished-goods output can be recorded.")

    posting_date = output_date or timezone.localdate()
    current_wip_pool = _money(job.total_issued_cost - job.total_received_cost - job.total_scrap_cost)

    normalized_scrap = _prepare_scrap_batch_lines(lines=scrap_lines or [], job=job)
    scrap_cost_total = sum((_money(line["line_total_cost"]) for line in normalized_scrap), MONEY_ZERO)
    normalized_receipts = _prepare_receipt_batch_lines(
        lines=receipt_lines or [],
        job=job,
        current_wip_pool=current_wip_pool,
        scrap_cost_total=scrap_cost_total,
    )
    if not normalized_scrap and not normalized_receipts:
        raise ValueError("At least one receipt line or scrap line is required to post production output.")

    receipt_total = sum((_money(line["line_total_cost"]) for line in normalized_receipts), MONEY_ZERO)
    if receipt_total + scrap_cost_total > current_wip_pool + Decimal("0.01"):
        raise ValueError("Output posting exceeds the available WIP pool for the production job.")

    deferred_count = 0
    receipt_count = 0
    scrap_count = 0

    for payload in normalized_scrap:
        line = ProductionScrapLine.objects.create(production_job=job, **payload)
        bridge_lines = _build_bridge_lines_for_scrap(line)
        journal_entry = None
        if bridge_lines is not None:
            journal_entry, _ = post_bridge_entry(
                source_instance=line,
                purpose="PRODUCTION_SCRAP",
                entry_date=posting_date,
                memo=f"Production scrap {job.job_no}",
                lines=bridge_lines,
                voucher_type="PRODUCTION_SCRAP",
                source_type="PRODUCTION_JOB",
                source_reference=job.job_no,
                source_document_no=job.job_no,
                source_event_date=posting_date,
                trace_metadata={
                    "production_job_id": job.id,
                    "job_no": job.job_no,
                    "scrap_line_id": line.id,
                    "inventory_item_id": line.inventory_item_id,
                },
                posted_by=performed_by,
            )
        else:
            deferred_count += 1
        line.is_posted = True
        line.posted_at = timezone.now()
        line.posted_by = performed_by
        line.posted_journal_entry = journal_entry
        line.save(update_fields=["is_posted", "posted_at", "posted_by", "posted_journal_entry", "updated_at"])
        scrap_count += 1

    for payload in normalized_receipts:
        line = ProductionReceiptLine.objects.create(
            production_job=job,
            **{key: value for key, value in payload.items() if not key.startswith("_")},
        )
        bridge_lines = _build_bridge_lines_for_receipt(line)
        journal_entry = None
        if bridge_lines is not None:
            journal_entry, _ = post_bridge_entry(
                source_instance=line,
                purpose="PRODUCTION_RECEIPT",
                entry_date=posting_date,
                memo=f"Production receipt {job.job_no}",
                lines=bridge_lines,
                voucher_type="PRODUCTION_RECEIPT",
                source_type="PRODUCTION_JOB",
                source_reference=job.job_no,
                source_document_no=job.job_no,
                source_event_date=posting_date,
                trace_metadata={
                    "production_job_id": job.id,
                    "job_no": job.job_no,
                    "receipt_line_id": line.id,
                    "finished_good_inventory_item_id": line.inventory_item_id,
                },
                posted_by=performed_by,
            )
        else:
            deferred_count += 1

        create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.PRODUCTION_RECEIPT_IN,
            movement_date=posting_date,
            stock_location=job.stock_location or line.inventory_item.default_stock_location,
            quantity_in=line.quantity,
            quantity_out=QUANTITY_ZERO,
            reference_model="ProductionReceiptLine",
            reference_id=str(line.id),
            notes=job.job_no,
            posted_by=performed_by,
            posted_journal_entry=journal_entry,
        )
        line.is_posted = True
        line.posted_at = timezone.now()
        line.posted_by = performed_by
        line.posted_journal_entry = journal_entry
        line.save(update_fields=["is_posted", "posted_at", "posted_by", "posted_journal_entry", "updated_at"])
        receipt_count += 1

    if job.status == ProductionJobStatus.RELEASED:
        job.status = ProductionJobStatus.IN_PROGRESS
        job.started_at = job.started_at or timezone.now()
        job.save(update_fields=["status", "started_at", "updated_at"])

    job = _refresh_job_rollups(job)
    log_manufacturing_event(
        action_type=AuditLog.ActionType.PRODUCTION_OUTPUT_POSTED,
        instance=job,
        performed_by=performed_by,
        event="PRODUCTION_OUTPUT_POSTED",
        metadata={
            "production_job_id": job.id,
            "job_no": job.job_no,
            "receipt_count": receipt_count,
            "scrap_count": scrap_count,
            "deferred_accounting_count": deferred_count,
            "output_date": posting_date.isoformat(),
        },
    )
    return job, True


@transaction.atomic
def complete_production_job(*, job_id: int, performed_by=None):
    job = (
        ProductionJob.objects.select_for_update()
        .prefetch_related("material_issue_lines", "receipt_lines", "scrap_lines")
        .get(pk=job_id)
    )
    if job.status == ProductionJobStatus.COMPLETED:
        return job, False
    if job.status not in {ProductionJobStatus.RELEASED, ProductionJobStatus.IN_PROGRESS}:
        raise ValueError("Only released or in-progress production jobs can be completed.")
    if any(not line.is_posted for line in [*job.material_issue_lines.all(), *job.receipt_lines.all(), *job.scrap_lines.all()]):
        raise ValueError("All draft manufacturing lines must be posted before the job can be completed.")

    job = _refresh_job_rollups(job)
    if job.completed_output_qty <= QUANTITY_ZERO:
        raise ValueError("Finished-goods receipt is required before completing a production job.")
    if _money(job.wip_cost) != MONEY_ZERO:
        raise ValueError("Production job still carries WIP cost. Post remaining output or scrap before completion.")

    job.status = ProductionJobStatus.COMPLETED
    job.completed_at = timezone.now()
    job.completed_by = performed_by
    job.save(update_fields=["status", "completed_at", "completed_by", "updated_at"])
    job = _refresh_job_rollups(job)
    log_manufacturing_event(
        action_type=AuditLog.ActionType.PRODUCTION_JOB_STATUS_UPDATED,
        instance=job,
        performed_by=performed_by,
        event="PRODUCTION_JOB_COMPLETED",
        metadata={"production_job_id": job.id, "job_no": job.job_no},
    )
    return job, True


@transaction.atomic
def cancel_production_job(*, job_id: int, performed_by=None, reason: str):
    job = (
        ProductionJob.objects.select_for_update()
        .prefetch_related("material_issue_lines", "receipt_lines", "scrap_lines")
        .get(pk=job_id)
    )
    if job.status == ProductionJobStatus.CANCELLED:
        return job, False
    if job.status not in {ProductionJobStatus.DRAFT, ProductionJobStatus.RELEASED}:
        raise ValueError("Only draft or released production jobs can be cancelled.")
    if any(line.is_posted for line in [*job.material_issue_lines.all(), *job.receipt_lines.all(), *job.scrap_lines.all()]):
        raise ValueError("Posted production jobs cannot be cancelled without a separate reversal policy.")

    job.status = ProductionJobStatus.CANCELLED
    job.cancelled_at = timezone.now()
    job.cancelled_by = performed_by
    job.cancel_reason = _string(reason)
    job.save(update_fields=["status", "cancelled_at", "cancelled_by", "cancel_reason", "updated_at"])
    log_manufacturing_event(
        action_type=AuditLog.ActionType.PRODUCTION_JOB_STATUS_UPDATED,
        instance=job,
        performed_by=performed_by,
        event="PRODUCTION_JOB_CANCELLED",
        metadata={
            "production_job_id": job.id,
            "job_no": job.job_no,
            "reason": job.cancel_reason,
        },
    )
    return job, True


def build_manufacturing_overview():
    jobs = ProductionJob.objects.all()
    boms = ManufacturingBom.objects.all()
    recent_jobs = (
        ProductionJob.objects.select_related("finished_good_inventory_item", "finished_good_inventory_item__product", "bom")
        .order_by("-job_date", "-created_at", "-id")[:8]
    )
    recent_boms = (
        ManufacturingBom.objects.select_related("finished_good_inventory_item", "finished_good_inventory_item__product")
        .order_by("-updated_at", "-id")[:8]
    )
    return {
        "summary": {
            "bom_count": boms.count(),
            "active_bom_count": boms.filter(status=ManufacturingBomStatus.ACTIVE).count(),
            "job_count": jobs.count(),
            "released_count": jobs.filter(status=ProductionJobStatus.RELEASED).count(),
            "in_progress_count": jobs.filter(status=ProductionJobStatus.IN_PROGRESS).count(),
            "completed_count": jobs.filter(status=ProductionJobStatus.COMPLETED).count(),
            "deferred_count": jobs.filter(accounting_status=ManufacturingAccountingStatus.DEFERRED).count(),
        },
        "recent_jobs": [
            {
                "id": job.id,
                "job_no": job.job_no,
                "status": job.status,
                "finished_good_inventory_item_id": job.finished_good_inventory_item_id,
                "finished_good_sku": job.finished_good_inventory_item.sku,
                "finished_good_product_name": job.finished_good_inventory_item.product.name,
                "planned_output_qty": f"{job.planned_output_qty:.3f}",
                "completed_output_qty": f"{job.completed_output_qty:.3f}",
                "wip_cost": f"{job.wip_cost:.2f}",
                "accounting_status": job.accounting_status,
                "costing_status": job.costing_status,
            }
            for job in recent_jobs
        ],
        "recent_boms": [
            {
                "id": bom.id,
                "bom_no": bom.bom_no,
                "status": bom.status,
                "revision_no": bom.revision_no,
                "is_default": bom.is_default,
                "finished_good_inventory_item_id": bom.finished_good_inventory_item_id,
                "finished_good_sku": bom.finished_good_inventory_item.sku,
                "finished_good_product_name": bom.finished_good_inventory_item.product.name,
                "line_count": bom.lines.count(),
            }
            for bom in recent_boms
        ],
    }
