from __future__ import annotations

import csv
import io
from typing import Any

from django.db.models import Q

from inventory.models import InventoryItem


def bulk_update_items(
    *,
    item_ids: list[int],
    updates: dict[str, Any],
) -> dict[str, Any]:
    """Bulk update multiple inventory items with validation.

    Args:
        item_ids: List of InventoryItem IDs to update
        updates: Dict of field_name: new_value pairs

    Returns: {
        "updated_count": 42,
        "validation_errors": ["field_name: error message", ...],
        "updated_items": [...]
    }
    """
    validation_errors = []
    updated_items = []

    # Validate updates before applying
    allowed_fields = {
        "reorder_level_qty",
        "standard_unit_cost",
        "barcode",
        "qr_code",
        "lot_tracking_enabled",
        "expiry_tracking_enabled",
        "stock_item_type",
        "delivery_stock_bridge_enabled",
        "is_active",
        "default_stock_location",
    }

    for field, value in updates.items():
        if field not in allowed_fields:
            validation_errors.append(f"{field}: field not allowed for bulk update")

    # Validate business rules
    if "reorder_level_qty" in updates:
        try:
            reorder = float(updates["reorder_level_qty"])
            if reorder < 0:
                validation_errors.append("reorder_level_qty: cannot be negative")
        except (ValueError, TypeError):
            validation_errors.append("reorder_level_qty: must be a valid number")

    if "standard_unit_cost" in updates:
        try:
            cost = float(updates["standard_unit_cost"])
            if cost < 0:
                validation_errors.append("standard_unit_cost: cannot be negative")
        except (ValueError, TypeError):
            validation_errors.append("standard_unit_cost: must be a valid number")

    if validation_errors:
        return {
            "updated_count": 0,
            "validation_errors": validation_errors,
            "updated_items": [],
        }

    # Apply updates
    queryset = InventoryItem.objects.filter(id__in=item_ids)
    updated_count = queryset.update(**updates)

    # Fetch updated items
    updated_items = list(queryset.select_related("product").values(
        "id", "product__product_code", "product__name", "sku", "stock_item_type",
        "reorder_level_qty", "standard_unit_cost", "barcode", "qr_code",
        "lot_tracking_enabled", "expiry_tracking_enabled",
        "delivery_stock_bridge_enabled", "is_active"
    ))

    return {
        "updated_count": updated_count,
        "validation_errors": [],
        "updated_items": updated_items,
    }


def export_items_csv(
    *,
    item_ids: list[int] | None = None,
    stock_item_type: str | None = None,
    bridge_enabled: bool | None = None,
    location_id: int | None = None,
) -> str:
    """Export inventory items to CSV format.

    Returns: CSV string with header and data rows
    """
    queryset = InventoryItem.objects.select_related("product", "default_stock_location").all()

    # Apply filters
    if item_ids:
        queryset = queryset.filter(id__in=item_ids)
    if stock_item_type:
        queryset = queryset.filter(stock_item_type=stock_item_type)
    if bridge_enabled is not None:
        queryset = queryset.filter(delivery_stock_bridge_enabled=bridge_enabled)
    if location_id:
        queryset = queryset.filter(default_stock_location_id=location_id)

    queryset = queryset.order_by("product__product_code")

    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)

    # Write header
    writer.writerow([
        "Product Code",
        "Product Name",
        "SKU",
        "Stock Type",
        "Default Location",
        "Reorder Level",
        "Unit Cost",
        "Barcode",
        "QR Code",
        "Lot Tracking",
        "Expiry Tracking",
        "Delivery Bridge",
        "Active",
    ])

    # Write data rows
    for item in queryset:
        writer.writerow([
            item.product.product_code,
            item.product.name,
            item.sku or "",
            item.stock_item_type,
            item.default_stock_location.name if item.default_stock_location else "Unassigned",
            item.reorder_level_qty,
            item.standard_unit_cost or "",
            item.barcode or "",
            item.qr_code or "",
            "Yes" if item.lot_tracking_enabled else "No",
            "Yes" if item.expiry_tracking_enabled else "No",
            "Enabled" if item.delivery_stock_bridge_enabled else "Disabled",
            "Active" if item.is_active else "Inactive",
        ])

    return csv_buffer.getvalue()


def import_items_csv(csv_content: str) -> dict[str, Any]:
    """Import inventory items from CSV content.

    Expected columns:
        Product Code, Product Name, SKU, Stock Type, Default Location,
        Reorder Level, Unit Cost, Barcode, QR Code, Lot Tracking,
        Expiry Tracking, Delivery Bridge, Active

    Returns: {
        "processed": 42,
        "updated": 40,
        "skipped": 2,
        "errors": ["row 3: Product Code not found", ...]
    }
    """
    csv_buffer = io.StringIO(csv_content)
    reader = csv.DictReader(csv_buffer)

    processed = 0
    updated = 0
    errors = []

    if not reader.fieldnames:
        return {
            "processed": 0,
            "updated": 0,
            "skipped": 0,
            "errors": ["CSV file is empty or has no header"],
        }

    for row_num, row in enumerate(reader, start=2):  # Start at 2 (after header)
        try:
            product_code = row.get("Product Code", "").strip()
            if not product_code:
                errors.append(f"row {row_num}: Product Code is required")
                continue

            # Find item by product code
            try:
                item = InventoryItem.objects.select_related("product").get(
                    product__product_code=product_code
                )
            except InventoryItem.DoesNotExist:
                errors.append(f"row {row_num}: Product Code '{product_code}' not found")
                continue

            # Prepare updates
            updates = {}

            # Reorder level
            if "Reorder Level" in row and row["Reorder Level"].strip():
                try:
                    reorder = float(row["Reorder Level"])
                    if reorder >= 0:
                        updates["reorder_level_qty"] = reorder
                except ValueError:
                    errors.append(f"row {row_num}: Invalid Reorder Level '{row['Reorder Level']}'")
                    continue

            # Unit cost
            if "Unit Cost" in row and row["Unit Cost"].strip():
                try:
                    cost = float(row["Unit Cost"])
                    if cost >= 0:
                        updates["standard_unit_cost"] = cost
                except ValueError:
                    errors.append(f"row {row_num}: Invalid Unit Cost '{row['Unit Cost']}'")
                    continue

            # Barcode
            if "Barcode" in row:
                updates["barcode"] = row["Barcode"].strip() or None

            # QR Code
            if "QR Code" in row:
                updates["qr_code"] = row["QR Code"].strip() or None

            # Lot tracking
            if "Lot Tracking" in row:
                updates["lot_tracking_enabled"] = row["Lot Tracking"].strip().lower() in ("yes", "true", "1")

            # Expiry tracking
            if "Expiry Tracking" in row:
                updates["expiry_tracking_enabled"] = row["Expiry Tracking"].strip().lower() in ("yes", "true", "1")

            # Delivery bridge
            if "Delivery Bridge" in row:
                updates["delivery_stock_bridge_enabled"] = row["Delivery Bridge"].strip().lower() in ("enabled", "yes", "true", "1")

            # Active status
            if "Active" in row:
                updates["is_active"] = row["Active"].strip().lower() in ("active", "yes", "true", "1")

            # Apply updates if any
            if updates:
                for field, value in updates.items():
                    setattr(item, field, value)
                item.save(update_fields=list(updates.keys()))
                updated += 1

            processed += 1

        except Exception as e:
            errors.append(f"row {row_num}: {str(e)}")

    return {
        "processed": processed,
        "updated": updated,
        "skipped": processed - updated,
        "errors": errors,
    }
