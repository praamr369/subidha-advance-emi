from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction

from inventory.models import StockLocation, StockLocationType, StockMovementType
from inventory.services.audit_service import log_inventory_event
from inventory.services.purchase_need_reconciliation_service import (
    reconcile_direct_sale_needs_after_inventory_in,
)
from inventory.services.stock_service import create_stock_ledger_entry
from subscriptions.models import AuditLog


MATCH_PRODUCT_HEADERS = ("product_code", "code")
MATCH_SKU_HEADERS = ("sku",)
QUANTITY_HEADERS = ("quantity", "opening_stock_qty", "qty")
LOCATION_CODE_HEADERS = ("location_code", "stock_location_code", "warehouse_code")
LOCATION_NAME_HEADERS = ("location_name", "stock_location_name", "warehouse_name")
NOTES_HEADERS = ("notes", "remark")

ALLOWED_HEADERS = {
    *MATCH_PRODUCT_HEADERS,
    *MATCH_SKU_HEADERS,
    *QUANTITY_HEADERS,
    *LOCATION_CODE_HEADERS,
    *LOCATION_NAME_HEADERS,
    *NOTES_HEADERS,
}


@dataclass
class OpeningStockPreviewRow:
    row: int
    product_code: str | None
    sku: str | None
    quantity: str | None
    inventory_item_id: int | None
    location_code: str | None
    location_name: str | None
    action: str
    message: str | None = None


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


def _normalize_headers(reader: csv.DictReader) -> list[dict[str, Any]]:
    if not reader.fieldnames:
        raise ValueError("CSV header row is missing.")

    normalized_headers = [str(header or "").strip().lower() for header in reader.fieldnames]
    unknown_headers = [header for header in normalized_headers if header and header not in ALLOWED_HEADERS]
    if unknown_headers:
        raise ValueError(f"Unsupported CSV header(s): {', '.join(sorted(set(unknown_headers)))}")

    rows: list[dict[str, Any]] = []
    for raw_row in reader:
        rows.append({str(key or "").strip().lower(): value for key, value in raw_row.items()})
    return rows


def _resolve_location(*, location_code: str, location_name: str, create_missing: bool) -> StockLocation | None:
    normalized_code = _clean_text(location_code).upper()
    normalized_name = _clean_text(location_name)

    if normalized_code:
        existing = StockLocation.objects.filter(code=normalized_code).first()
        if existing:
            return existing
        if create_missing:
            return StockLocation.objects.create(
                code=normalized_code,
                name=normalized_name or normalized_code,
                location_type=StockLocationType.STORE,
            )

    if normalized_name:
        existing = StockLocation.objects.filter(name__iexact=normalized_name).first()
        if existing:
            return existing
        if create_missing:
            fallback_code = normalized_name.upper().replace(" ", "-")[:30] or "MAIN"
            return StockLocation.objects.create(
                code=fallback_code,
                name=normalized_name,
                location_type=StockLocationType.STORE,
            )

    return None


def _resolve_inventory_item(*, product_code: str, sku: str):
    from inventory.models import InventoryItem

    normalized_sku = _clean_text(sku).upper()
    normalized_code = _clean_text(product_code).upper()

    if normalized_sku:
        item = InventoryItem.objects.select_related("product", "default_stock_location").filter(sku__iexact=normalized_sku).first()
        if item:
            return item
    if normalized_code:
        return (
            InventoryItem.objects.select_related("product", "default_stock_location")
            .filter(product__product_code__iexact=normalized_code)
            .first()
        )
    return None


def preview_opening_stock_import(file_or_text: Any) -> dict[str, Any]:
    text = _read_text(file_or_text)
    reader = csv.DictReader(io.StringIO(text))
    rows = _normalize_headers(reader)
    preview_rows: list[OpeningStockPreviewRow] = []
    errors = 0

    for index, row in enumerate(rows, start=2):
        product_code = _pick_first(row, MATCH_PRODUCT_HEADERS).upper()
        sku = _pick_first(row, MATCH_SKU_HEADERS).upper()
        quantity_raw = _pick_first(row, QUANTITY_HEADERS)
        location_code = _pick_first(row, LOCATION_CODE_HEADERS).upper()
        location_name = _pick_first(row, LOCATION_NAME_HEADERS)

        try:
            quantity = Decimal(quantity_raw or "0")
        except Exception:
            quantity = Decimal("0")

        inventory_item = _resolve_inventory_item(product_code=product_code, sku=sku)
        location = _resolve_location(
            location_code=location_code,
            location_name=location_name,
            create_missing=False,
        )

        if inventory_item is None:
            preview_rows.append(
                OpeningStockPreviewRow(
                    row=index,
                    product_code=product_code or None,
                    sku=sku or None,
                    quantity=quantity_raw or None,
                    inventory_item_id=None,
                    location_code=location_code or None,
                    location_name=location_name or None,
                    action="error",
                    message="Inventory item not found for the provided product_code/SKU.",
                )
            )
            errors += 1
            continue

        if quantity <= 0:
            preview_rows.append(
                OpeningStockPreviewRow(
                    row=index,
                    product_code=product_code or inventory_item.product.product_code,
                    sku=sku or inventory_item.sku,
                    quantity=quantity_raw or None,
                    inventory_item_id=inventory_item.id,
                    location_code=location_code or getattr(location, "code", None),
                    location_name=location_name or getattr(location, "name", None),
                    action="error",
                    message="Quantity must be greater than zero.",
                )
            )
            errors += 1
            continue

        preview_rows.append(
            OpeningStockPreviewRow(
                row=index,
                product_code=inventory_item.product.product_code,
                sku=inventory_item.sku,
                quantity=f"{quantity:.3f}",
                inventory_item_id=inventory_item.id,
                location_code=location_code or getattr(inventory_item.default_stock_location, "code", None),
                location_name=location_name or getattr(inventory_item.default_stock_location, "name", None),
                action="ready",
                message=None if location or not (location_code or location_name) else "Location will be created on post.",
            )
        )

    return {
        "total_rows": len(preview_rows),
        "error_rows": errors,
        "ready_rows": len(preview_rows) - errors,
        "rows": [asdict(row) for row in preview_rows],
    }


@transaction.atomic
def post_opening_stock_import(*, file_or_text: Any, movement_date, posted_by=None) -> dict[str, Any]:
    text = _read_text(file_or_text)
    preview = preview_opening_stock_import(text)
    if preview["error_rows"]:
        raise ValueError("Resolve all CSV errors before posting opening stock.")

    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    reader = csv.DictReader(io.StringIO(text))
    rows = _normalize_headers(reader)

    created_count = 0
    existing_count = 0
    processed_rows = 0
    product_ids_seen: set[int] = set()

    for index, row in enumerate(rows, start=2):
        product_code = _pick_first(row, MATCH_PRODUCT_HEADERS).upper()
        sku = _pick_first(row, MATCH_SKU_HEADERS).upper()
        quantity = Decimal(_pick_first(row, QUANTITY_HEADERS) or "0").quantize(Decimal("0.001"))
        location = _resolve_location(
            location_code=_pick_first(row, LOCATION_CODE_HEADERS).upper(),
            location_name=_pick_first(row, LOCATION_NAME_HEADERS),
            create_missing=True,
        )
        inventory_item = _resolve_inventory_item(product_code=product_code, sku=sku)
        if inventory_item is None:
            continue
        product_ids_seen.add(inventory_item.product_id)
        if location is None:
            location = inventory_item.default_stock_location

        entry, created = create_stock_ledger_entry(
            inventory_item=inventory_item,
            movement_type=StockMovementType.OPENING_BALANCE_IN,
            movement_date=movement_date,
            stock_location=location,
            quantity_in=quantity,
            reference_model="OpeningStockImport",
            reference_id=f"{digest}:{index}:{getattr(location, 'code', 'DEFAULT')}",
            notes=_pick_first(row, NOTES_HEADERS) or f"Opening stock import {digest}",
            posted_by=posted_by,
        )
        if location and inventory_item.default_stock_location_id is None:
            inventory_item.default_stock_location = location
            inventory_item.save(update_fields=["default_stock_location", "updated_at"])
        created_count += 1 if created else 0
        existing_count += 0 if created else 1
        processed_rows += 1

        log_inventory_event(
            action_type=AuditLog.ActionType.OPENING_STOCK_IMPORTED,
            instance=entry,
            performed_by=posted_by,
            event="OPENING_STOCK_IMPORTED",
            metadata={
                "inventory_item_id": inventory_item.id,
                "stock_location_id": getattr(location, "id", None),
                "digest": digest,
                "row": index,
            },
        )

    if product_ids_seen:
        reconcile_direct_sale_needs_after_inventory_in(product_ids=product_ids_seen, actor=posted_by)

    return {
        "processed_rows": processed_rows,
        "created_count": created_count,
        "existing_count": existing_count,
        "movement_date": movement_date.isoformat(),
        "digest": digest,
    }
