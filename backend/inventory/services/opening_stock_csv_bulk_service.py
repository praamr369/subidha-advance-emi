from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from inventory.models import (
    OpeningStockEntry,
    OpeningStockEntrySource,
    OpeningStockEntryStatus,
    StockLocation,
)
from inventory.services.opening_stock_import_service import _resolve_inventory_item, _resolve_location
from inventory.services.opening_stock_entry_service import (
    create_opening_stock_correction_adjustment,
    create_opening_stock_entry,
    ensure_opening_stock_batch,
    post_opening_stock_entry,
    update_opening_stock_entry_draft,
)

BULK_HEADERS = {
    "sku",
    "product_code",
    "code",
    "quantity",
    "opening_stock_qty",
    "qty",
    "location_code",
    "stock_location_code",
    "warehouse_code",
    "location_name",
    "stock_location_name",
    "warehouse_name",
    "notes",
    "remark",
    "note",
    "unit_cost",
    "cost",
    "effective_date",
    "as_of_date",
    "movement_date",
    "update_mode",
    "quantity_delta",
}


MATCH_PRODUCT_HEADERS = ("product_code", "code")
MATCH_SKU_HEADERS = ("sku",)
QUANTITY_HEADERS = ("quantity", "opening_stock_qty", "qty")
LOCATION_CODE_HEADERS = ("location_code", "stock_location_code", "warehouse_code")
LOCATION_NAME_HEADERS = ("location_name", "stock_location_name", "warehouse_name")
UNIT_COST_HEADERS = ("unit_cost", "cost")
DATE_HEADERS = ("effective_date", "as_of_date", "movement_date")
NOTES_HEADERS = ("notes", "remark", "note")


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _read_text(file_or_text: Any) -> str:
    if hasattr(file_or_text, "read"):
        raw = file_or_text.read()
    else:
        raw = file_or_text
    if isinstance(raw, bytes):
        return raw.decode("utf-8-sig")
    if isinstance(raw, str):
        return raw
    raise ValueError("Unsupported CSV input.")


def _pick_first(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = _clean_text(row.get(key))
        if value:
            return value
    return ""


def _normalize_bulk_reader(reader: csv.DictReader) -> list[dict[str, Any]]:
    if not reader.fieldnames:
        raise ValueError("CSV header row is missing.")

    normalized_headers = [str(header or "").strip().lower() for header in reader.fieldnames]
    unknown = [h for h in normalized_headers if h and h not in BULK_HEADERS]
    if unknown:
        raise ValueError(f"Unsupported CSV header(s): {', '.join(sorted(set(unknown)))}")

    rows: list[dict[str, Any]] = []
    for raw_row in reader:
        rows.append({str(key or "").strip().lower(): value for key, value in raw_row.items()})
    return rows


def _parse_date(raw: str, fallback: date) -> date:
    raw = _clean_text(raw)
    if not raw:
        return fallback
    parts = raw.replace("/", "-").split("-")
    if len(parts) == 3:
        try:
            if len(parts[0]) == 4:
                return date(int(parts[0]), int(parts[1]), int(parts[2]))
            return date(int(parts[2]), int(parts[1]), int(parts[0]))
        except Exception:
            pass
    raise ValueError(f"Invalid effective_date: {raw}")


@dataclass
class BulkPreviewRow:
    row: int
    product_code: str | None
    sku: str | None
    quantity: str | None
    unit_cost: str | None
    effective_date: str | None
    update_mode: str | None
    inventory_item_id: int | None
    location_code: str | None
    location_name: str | None
    quantity_delta: str | None
    action: str
    message: str | None = None


def preview_bulk_opening_stock_csv(file_or_text: Any, *, default_effective_date: date | None = None) -> dict[str, Any]:
    text = _read_text(file_or_text)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    reader = csv.DictReader(io.StringIO(text))
    rows = _normalize_bulk_reader(reader)
    fallback_date = default_effective_date or timezone.localdate()

    preview_rows: list[BulkPreviewRow] = []
    errors = warnings = 0
    total_qty = Decimal("0.000")
    total_valuation = Decimal("0.00")

    for index, row in enumerate(rows, start=2):
        product_code = _pick_first(row, MATCH_PRODUCT_HEADERS).upper()
        sku = _pick_first(row, MATCH_SKU_HEADERS).upper()
        qty_raw = _pick_first(row, QUANTITY_HEADERS)
        uc_raw = _pick_first(row, UNIT_COST_HEADERS)
        mode = (_pick_first(row, ("update_mode",)) or "draft_update").strip().lower()
        qdelta_raw = _pick_first(row, ("quantity_delta",))
        location_code = _pick_first(row, LOCATION_CODE_HEADERS).upper()
        location_name = _pick_first(row, LOCATION_NAME_HEADERS)

        eff_raw = _pick_first(row, DATE_HEADERS)
        try:
            eff_date = _parse_date(eff_raw, fallback_date)
        except ValueError as exc:
            preview_rows.append(
                BulkPreviewRow(
                    row=index,
                    product_code=product_code or None,
                    sku=sku or None,
                    quantity=qty_raw or None,
                    unit_cost=uc_raw or None,
                    effective_date=eff_raw or None,
                    update_mode=mode,
                    inventory_item_id=None,
                    location_code=location_code or None,
                    location_name=location_name or None,
                    quantity_delta=qdelta_raw or None,
                    action="error",
                    message=str(exc),
                )
            )
            errors += 1
            continue

        inventory_item = _resolve_inventory_item(product_code=product_code, sku=sku)
        location = _resolve_location(
            location_code=location_code,
            location_name=location_name,
            create_missing=False,
        )

        if inventory_item is None:
            preview_rows.append(
                BulkPreviewRow(
                    row=index,
                    product_code=product_code or None,
                    sku=sku or None,
                    quantity=qty_raw or None,
                    unit_cost=uc_raw or None,
                    effective_date=eff_date.isoformat(),
                    update_mode=mode,
                    inventory_item_id=None,
                    location_code=location_code or None,
                    location_name=location_name or None,
                    quantity_delta=qdelta_raw or None,
                    action="error",
                    message="Inventory item not found for product_code/SKU.",
                )
            )
            errors += 1
            continue

        loc_display_code = location_code or getattr(location, "code", None)
        loc_display_name = location_name or getattr(location, "name", None)

        if mode == "correction":
            if location is None:
                location = inventory_item.default_stock_location
            if location is None:
                preview_rows.append(
                    BulkPreviewRow(
                        row=index,
                        product_code=inventory_item.product.product_code,
                        sku=inventory_item.sku,
                        quantity=qty_raw or None,
                        unit_cost=uc_raw or None,
                        effective_date=eff_date.isoformat(),
                        update_mode=mode,
                        inventory_item_id=inventory_item.id,
                        location_code=loc_display_code,
                        location_name=loc_display_name,
                        quantity_delta=qdelta_raw or None,
                        action="error",
                        message="Stock location is required for opening stock correction.",
                    )
                )
                errors += 1
                continue
            try:
                dq = Decimal(qdelta_raw or "0").quantize(Decimal("0.001"))
            except Exception:
                dq = Decimal("0")
            if dq == Decimal("0"):
                preview_rows.append(
                    BulkPreviewRow(
                        row=index,
                        product_code=inventory_item.product.product_code,
                        sku=inventory_item.sku,
                        quantity=qty_raw or None,
                        unit_cost=uc_raw or None,
                        effective_date=eff_date.isoformat(),
                        update_mode=mode,
                        inventory_item_id=inventory_item.id,
                        location_code=getattr(location, "code", None),
                        location_name=getattr(location, "name", None),
                        quantity_delta=qdelta_raw or None,
                        action="error",
                        message="quantity_delta is required for correction mode.",
                    )
                )
                errors += 1
                continue
            posted = (
                OpeningStockEntry.objects.filter(
                    inventory_item=inventory_item,
                    stock_location=location,
                    effective_date=eff_date,
                    status=OpeningStockEntryStatus.POSTED,
                )
                .order_by("-id")
                .first()
            )
            if posted is None:
                preview_rows.append(
                    BulkPreviewRow(
                        row=index,
                        product_code=inventory_item.product.product_code,
                        sku=inventory_item.sku,
                        quantity=qty_raw or None,
                        unit_cost=uc_raw or None,
                        effective_date=eff_date.isoformat(),
                        update_mode=mode,
                        inventory_item_id=inventory_item.id,
                        location_code=getattr(location, "code", None),
                        location_name=getattr(location, "name", None),
                        quantity_delta=qdelta_raw or None,
                        action="error",
                        message="No posted opening stock row matches item/location/effective_date.",
                    )
                )
                errors += 1
                continue
            preview_rows.append(
                BulkPreviewRow(
                    row=index,
                    product_code=inventory_item.product.product_code,
                    sku=inventory_item.sku,
                    quantity=qty_raw or None,
                    unit_cost=uc_raw or None,
                    effective_date=eff_date.isoformat(),
                    update_mode=mode,
                    inventory_item_id=inventory_item.id,
                    location_code=getattr(location, "code", None),
                    location_name=getattr(location, "name", None),
                    quantity_delta=qdelta_raw,
                    action="ready",
                    message=f"Will create correction adjustment draft for opening entry {posted.id}.",
                )
            )
            continue

        try:
            quantity = Decimal(qty_raw or "0").quantize(Decimal("0.001"))
        except Exception:
            quantity = Decimal("0")

        if quantity < Decimal("0"):
            preview_rows.append(
                BulkPreviewRow(
                    row=index,
                    product_code=inventory_item.product.product_code,
                    sku=inventory_item.sku,
                    quantity=qty_raw or None,
                    unit_cost=uc_raw or None,
                    effective_date=eff_date.isoformat(),
                    update_mode=mode,
                    inventory_item_id=inventory_item.id,
                    location_code=loc_display_code,
                    location_name=loc_display_name,
                    quantity_delta=qdelta_raw or None,
                    action="error",
                    message="Quantity cannot be negative.",
                )
            )
            errors += 1
            continue

        if quantity == Decimal("0") and mode != "skip_existing":
            preview_rows.append(
                BulkPreviewRow(
                    row=index,
                    product_code=inventory_item.product.product_code,
                    sku=inventory_item.sku,
                    quantity=qty_raw or None,
                    unit_cost=uc_raw or None,
                    effective_date=eff_date.isoformat(),
                    update_mode=mode,
                    inventory_item_id=inventory_item.id,
                    location_code=loc_display_code,
                    location_name=loc_display_name,
                    quantity_delta=qdelta_raw or None,
                    action="warning",
                    message="Quantity zero — row will be skipped unless update_mode is skip_existing.",
                )
            )
            warnings += 1
            continue

        resolved_location = location or inventory_item.default_stock_location
        if resolved_location is None:
            preview_rows.append(
                BulkPreviewRow(
                    row=index,
                    product_code=inventory_item.product.product_code,
                    sku=inventory_item.sku,
                    quantity=f"{quantity:.3f}",
                    unit_cost=uc_raw or None,
                    effective_date=eff_date.isoformat(),
                    update_mode=mode,
                    inventory_item_id=inventory_item.id,
                    location_code=loc_display_code,
                    location_name=loc_display_name,
                    quantity_delta=qdelta_raw or None,
                    action="error",
                    message="Stock location is required (set location columns or item default location).",
                )
            )
            errors += 1
            continue

        uc_dec = None
        if uc_raw:
            try:
                uc_dec = Decimal(uc_raw).quantize(Decimal("0.01"))
            except Exception:
                uc_dec = None
        if uc_dec is None:
            if inventory_item.standard_unit_cost is not None:
                uc_dec = Decimal(str(inventory_item.standard_unit_cost)).quantize(Decimal("0.01"))
        if uc_dec is None:
            preview_rows.append(
                BulkPreviewRow(
                    row=index,
                    product_code=inventory_item.product.product_code,
                    sku=inventory_item.sku,
                    quantity=f"{quantity:.3f}",
                    unit_cost=uc_raw or None,
                    effective_date=eff_date.isoformat(),
                    update_mode=mode,
                    inventory_item_id=inventory_item.id,
                    location_code=getattr(resolved_location, "code", None),
                    location_name=getattr(resolved_location, "name", None),
                    quantity_delta=qdelta_raw or None,
                    action="error",
                    message="unit_cost is required unless inventory standard_unit_cost is set.",
                )
            )
            errors += 1
            continue

        msg = None
        action = "ready"
        posted_exists = OpeningStockEntry.objects.filter(
            inventory_item=inventory_item,
            stock_location=resolved_location,
            effective_date=eff_date,
            status=OpeningStockEntryStatus.POSTED,
        ).exists()
        if posted_exists:
            if mode == "skip_existing":
                action = "warning"
                msg = "Posted opening exists — row will be skipped."
                warnings += 1
            else:
                action = "warning"
                msg = "Posted opening exists for item/location/date — apply may skip unless draft_update targets CSV batch row."
                warnings += 1

        preview_rows.append(
            BulkPreviewRow(
                row=index,
                product_code=inventory_item.product.product_code,
                sku=inventory_item.sku,
                quantity=f"{quantity:.3f}",
                unit_cost=f"{uc_dec:.2f}",
                effective_date=eff_date.isoformat(),
                update_mode=mode,
                inventory_item_id=inventory_item.id,
                location_code=getattr(resolved_location, "code", None),
                location_name=getattr(resolved_location, "name", None),
                quantity_delta=qdelta_raw or None,
                action=action,
                message=msg,
            )
        )
        if action == "ready":
            total_qty += quantity
            total_valuation += (quantity * uc_dec).quantize(Decimal("0.01"))

    return {
        "batch_key": digest,
        "total_rows": len(preview_rows),
        "error_rows": errors,
        "warning_rows": warnings,
        "ready_rows": sum(1 for r in preview_rows if r.action == "ready"),
        "total_quantity_preview": f"{total_qty:.3f}",
        "total_valuation_preview": f"{total_valuation:.2f}",
        "rows": [asdict(r) for r in preview_rows],
    }


def build_opening_stock_csv_template_bytes() -> bytes:
    header = (
        "sku,product_code,warehouse_code,quantity,unit_cost,effective_date,update_mode,note\n"
        "MY-SKU-001,,WH-001,10.000,450.00,2026-05-03,draft_update,Initial opening count\n"
    )
    return header.encode("utf-8")


@transaction.atomic
def apply_bulk_opening_stock_csv(
    file_or_text: Any,
    *,
    performed_by=None,
    dry_run: bool = False,
    auto_post: bool = False,
    default_effective_date: date | None = None,
    original_filename: str = "",
) -> dict[str, Any]:
    text = _read_text(file_or_text)
    preview_payload = preview_bulk_opening_stock_csv(text, default_effective_date=default_effective_date)
    if preview_payload["error_rows"]:
        raise ValueError("Resolve all CSV errors before applying opening stock import.")

    digest = preview_payload["batch_key"]
    reader = csv.DictReader(io.StringIO(text))
    rows = _normalize_bulk_reader(reader)
    fallback_date = default_effective_date or timezone.localdate()

    summary = {
        "batch_key": digest,
        "dry_run": dry_run,
        "created": 0,
        "updated": 0,
        "posted": 0,
        "skipped": 0,
        "corrections_created": 0,
        "failed": 0,
    }

    batch = ensure_opening_stock_batch(
        batch_key=digest,
        original_filename=original_filename,
        created_by=performed_by,
    )
    batch.last_preview_payload = preview_payload
    batch.save(update_fields=["last_preview_payload", "updated_at"])

    def _maybe_post(entry_id: int):
        nonlocal summary
        if not auto_post:
            return
        _, posted_new = post_opening_stock_entry(entry_id=entry_id, posted_by=performed_by)
        if posted_new:
            summary["posted"] += 1

    for index, row in enumerate(rows, start=2):
        product_code = _pick_first(row, MATCH_PRODUCT_HEADERS).upper()
        sku = _pick_first(row, MATCH_SKU_HEADERS).upper()
        qty_raw = _pick_first(row, QUANTITY_HEADERS)
        uc_raw = _pick_first(row, UNIT_COST_HEADERS)
        mode = (_pick_first(row, ("update_mode",)) or "draft_update").strip().lower()
        qdelta_raw = _pick_first(row, ("quantity_delta",))
        note = _pick_first(row, NOTES_HEADERS)

        eff_date = _parse_date(_pick_first(row, DATE_HEADERS), fallback_date)

        inventory_item = _resolve_inventory_item(product_code=product_code, sku=sku)
        if inventory_item is None:
            summary["failed"] += 1
            continue

        location = _resolve_location(
            location_code=_pick_first(row, LOCATION_CODE_HEADERS).upper(),
            location_name=_pick_first(row, LOCATION_NAME_HEADERS),
            create_missing=True,
        )
        if mode == "correction":
            if location is None:
                location = inventory_item.default_stock_location
            if location is None:
                summary["failed"] += 1
                continue
            dq = Decimal(qdelta_raw or "0").quantize(Decimal("0.001"))
            if dq == Decimal("0"):
                summary["failed"] += 1
                continue
            posted = (
                OpeningStockEntry.objects.filter(
                    inventory_item=inventory_item,
                    stock_location=location,
                    effective_date=eff_date,
                    status=OpeningStockEntryStatus.POSTED,
                )
                .order_by("-id")
                .first()
            )
            if posted is None:
                summary["failed"] += 1
                continue
            if dry_run:
                summary["corrections_created"] += 1
                continue
            uc_override = None
            if uc_raw:
                try:
                    uc_override = Decimal(uc_raw).quantize(Decimal("0.01"))
                except Exception:
                    uc_override = None
            note_eff = note or f"CSV row {index} correction"
            adj = create_opening_stock_correction_adjustment(
                entry_id=posted.id,
                reason=note_eff,
                quantity_delta=dq,
                unit_cost_snapshot=uc_override,
                adjustment_date=eff_date,
                created_by=performed_by,
            )
            summary["corrections_created"] += 1
            del adj  # noqa: keep creation side-effect
            continue

        resolved_location = location or inventory_item.default_stock_location
        if resolved_location is None:
            summary["failed"] += 1
            continue

        quantity = Decimal(qty_raw or "0").quantize(Decimal("0.001"))

        if mode == "skip_existing":
            exists_posted = OpeningStockEntry.objects.filter(
                inventory_item=inventory_item,
                stock_location=resolved_location,
                effective_date=eff_date,
                status=OpeningStockEntryStatus.POSTED,
            ).exists()
            if exists_posted:
                summary["skipped"] += 1
                continue

        if quantity <= Decimal("0"):
            summary["skipped"] += 1
            continue

        uc_dec = None
        if uc_raw:
            try:
                uc_dec = Decimal(uc_raw).quantize(Decimal("0.01"))
            except Exception:
                uc_dec = None

        existing_draft = OpeningStockEntry.objects.filter(
            batch=batch,
            csv_row_number=index,
            status=OpeningStockEntryStatus.DRAFT,
        ).first()

        if dry_run:
            summary["created"] += int(existing_draft is None)
            summary["updated"] += int(existing_draft is not None)
            if auto_post:
                summary["posted"] += 1
            continue

        if existing_draft and mode in {"draft_update", "skip_existing", ""}:
            update_opening_stock_entry_draft(
                entry_id=existing_draft.id,
                performed_by=performed_by,
                inventory_item_id=inventory_item.id,
                stock_location_id=resolved_location.id,
                quantity=quantity,
                effective_date=eff_date,
                unit_cost_snapshot=uc_dec,
                note=note,
            )
            summary["updated"] += 1
            _maybe_post(existing_draft.id)
            continue

        created = create_opening_stock_entry(
            inventory_item_id=inventory_item.id,
            stock_location_id=resolved_location.id,
            quantity=quantity,
            effective_date=eff_date,
            unit_cost_snapshot=uc_dec,
            note=note,
            created_by=performed_by,
            source=OpeningStockEntrySource.CSV_IMPORT,
            batch=batch,
            csv_row_number=index,
        )
        summary["created"] += 1
        _maybe_post(created.id)

        if inventory_item.default_stock_location_id is None:
            inventory_item.default_stock_location = resolved_location
            inventory_item.save(update_fields=["default_stock_location", "updated_at"])

    batch.last_apply_summary = summary
    batch.save(update_fields=["last_apply_summary", "updated_at"])

    if dry_run:
        transaction.set_rollback(True)

    return summary
