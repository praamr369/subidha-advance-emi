from __future__ import annotations

import csv
import io
from dataclasses import asdict, dataclass
from typing import Any

from django.db import transaction

from subscriptions.models import Product


PRODUCT_CODE_HEADERS = ("product_code", "code")
NAME_HEADERS = ("name",)
CATEGORY_HEADERS = ("category",)
SUBCATEGORY_HEADERS = ("subcategory", "sub_category")
DESCRIPTION_HEADERS = ("description",)

ALLOWED_HEADERS = {
    *PRODUCT_CODE_HEADERS,
    *NAME_HEADERS,
    *CATEGORY_HEADERS,
    *SUBCATEGORY_HEADERS,
    *DESCRIPTION_HEADERS,
}


@dataclass
class ImportErrorRow:
    row: int
    message: str


@dataclass
class ImportPreviewRow:
    row: int
    product_id: int
    product_code: str
    name: str
    match_by: str
    action: str
    changes: dict[str, dict[str, str | None]]
    message: str | None = None


def _normalize_header(value: str | None) -> str:
    return (value or "").strip().lower()


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _read_csv_text(file_or_text: Any) -> str:
    if hasattr(file_or_text, "read"):
        raw = file_or_text.read()
    else:
        raw = file_or_text

    if isinstance(raw, bytes):
        return raw.decode("utf-8-sig")

    if isinstance(raw, str):
        return raw

    raise ValueError("Unsupported CSV input. Expected uploaded file, bytes, or string.")


def _pick_first(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = _clean_text(row.get(key))
        if value:
            return value
    return ""


def _build_changes(product: Product, row: dict[str, Any]) -> dict[str, dict[str, str | None]]:
    changes: dict[str, dict[str, str | None]] = {}

    csv_category = _pick_first(row, CATEGORY_HEADERS)
    csv_subcategory = _pick_first(row, SUBCATEGORY_HEADERS)
    csv_description = _pick_first(row, DESCRIPTION_HEADERS)

    current_category = _clean_text(getattr(product, "category", None))
    current_subcategory = _clean_text(
        getattr(product, "subcategory", None) or getattr(product, "sub_category", None)
    )
    current_description = _clean_text(getattr(product, "description", None))

    # Blank CSV value means "leave unchanged" for production safety.
    if csv_category and csv_category != current_category:
        changes["category"] = {
            "from": current_category or None,
            "to": csv_category,
        }

    if csv_subcategory and csv_subcategory != current_subcategory:
        changes["subcategory"] = {
            "from": current_subcategory or None,
            "to": csv_subcategory,
        }

    if csv_description and csv_description != current_description:
        changes["description"] = {
            "from": current_description or None,
            "to": csv_description,
        }

    return changes


def _apply_changes(product: Product, changes: dict[str, dict[str, str | None]]) -> None:
    if not changes:
        return

    update_fields: list[str] = []

    if "category" in changes:
        product.category = changes["category"]["to"]
        update_fields.append("category")

    if "subcategory" in changes:
        if hasattr(product, "subcategory"):
            product.subcategory = changes["subcategory"]["to"]
            update_fields.append("subcategory")
        elif hasattr(product, "sub_category"):
            product.sub_category = changes["subcategory"]["to"]
            update_fields.append("sub_category")
        else:
            raise AttributeError(
                "Product model does not expose 'subcategory' or 'sub_category'."
            )

    if "description" in changes:
        product.description = changes["description"]["to"]
        update_fields.append("description")

    if update_fields:
        product.save(update_fields=update_fields)


def import_product_metadata_csv(file_or_text: Any, dry_run: bool = True) -> dict[str, Any]:
    """
    Bulk update existing product metadata from CSV.

    Safe rules:
    - Matches by product_code first.
    - Falls back to name only when product_code is missing.
    - Updates ONLY category, subcategory, description.
    - Blank CSV metadata values do NOT clear existing values.
    - Does NOT create products.
    - Does NOT modify base_price or any financial field.

    Expected CSV headers:
    - product_code,name,category,subcategory,description

    Accepted aliases:
    - code -> product_code
    - sub_category -> subcategory
    """
    text = _read_csv_text(file_or_text)
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise ValueError("CSV header row is missing.")

    normalized_headers = [_normalize_header(field) for field in reader.fieldnames]
    unknown_headers = [header for header in normalized_headers if header and header not in ALLOWED_HEADERS]

    if unknown_headers:
        raise ValueError(
            f"Unsupported CSV header(s): {', '.join(sorted(set(unknown_headers)))}"
        )

    has_product_code_header = any(header in normalized_headers for header in PRODUCT_CODE_HEADERS)
    has_name_header = any(header in normalized_headers for header in NAME_HEADERS)

    if not has_product_code_header and not has_name_header:
        raise ValueError("CSV must include at least one matching column: product_code or name.")

    parsed_rows: list[tuple[int, dict[str, Any]]] = []
    seen_csv_keys: set[str] = set()

    total_rows = 0
    errors: list[ImportErrorRow] = []

    for index, raw_row in enumerate(reader, start=2):
        total_rows += 1

        row = {_normalize_header(key): value for key, value in raw_row.items()}

        product_code = _pick_first(row, PRODUCT_CODE_HEADERS)
        name = _pick_first(row, NAME_HEADERS)

        if not product_code and not name:
            errors.append(
                ImportErrorRow(
                    row=index,
                    message="Both product_code and name are empty. Row cannot be matched.",
                )
            )
            continue

        csv_key = f"code:{product_code.lower()}" if product_code else f"name:{name.lower()}"
        if csv_key in seen_csv_keys:
            errors.append(
                ImportErrorRow(
                    row=index,
                    message=f"Duplicate CSV match key detected: {product_code or name}",
                )
            )
            continue
        seen_csv_keys.add(csv_key)

        parsed_rows.append((index, row))

    previews: list[ImportPreviewRow] = []
    matched_rows = 0
    updated_rows = 0
    unchanged_rows = 0
    skipped_rows = len(errors)

    seen_product_ids: set[int] = set()

    def process_rows() -> None:
        nonlocal matched_rows, updated_rows, unchanged_rows, skipped_rows

        for row_number, row in parsed_rows:
            product_code = _pick_first(row, PRODUCT_CODE_HEADERS)
            name = _pick_first(row, NAME_HEADERS)

            product: Product | None = None
            match_by = ""

            if product_code:
                matches = list(
                    Product.objects.filter(product_code__iexact=product_code).only(
                        "id",
                        "name",
                        "product_code",
                        "category",
                        "description",
                    )
                )

                if len(matches) == 1:
                    product = matches[0]
                    match_by = "product_code"
                elif len(matches) > 1:
                    errors.append(
                        ImportErrorRow(
                            row=row_number,
                            message=f"Multiple products found for product_code '{product_code}'.",
                        )
                    )
                    skipped_rows += 1
                    continue
                else:
                    errors.append(
                        ImportErrorRow(
                            row=row_number,
                            message=f"No product found for product_code '{product_code}'.",
                        )
                    )
                    skipped_rows += 1
                    continue
            else:
                matches = list(
                    Product.objects.filter(name__iexact=name).only(
                        "id",
                        "name",
                        "product_code",
                        "category",
                        "description",
                    )
                )

                if len(matches) == 1:
                    product = matches[0]
                    match_by = "name"
                elif len(matches) > 1:
                    errors.append(
                        ImportErrorRow(
                            row=row_number,
                            message=f"Multiple products found for name '{name}'. Use product_code instead.",
                        )
                    )
                    skipped_rows += 1
                    continue
                else:
                    errors.append(
                        ImportErrorRow(
                            row=row_number,
                            message=f"No product found for name '{name}'.",
                        )
                    )
                    skipped_rows += 1
                    continue

            if product.id in seen_product_ids:
                errors.append(
                    ImportErrorRow(
                        row=row_number,
                        message=(
                            f"CSV row maps to product #{product.id} more than once. "
                            "Each product should appear only once per import."
                        ),
                    )
                )
                skipped_rows += 1
                continue

            seen_product_ids.add(product.id)
            matched_rows += 1

            changes = _build_changes(product, row)

            if not changes:
                unchanged_rows += 1
                previews.append(
                    ImportPreviewRow(
                        row=row_number,
                        product_id=product.id,
                        product_code=_clean_text(getattr(product, "product_code", None)),
                        name=_clean_text(getattr(product, "name", None)),
                        match_by=match_by,
                        action="unchanged",
                        changes={},
                        message="No metadata change detected.",
                    )
                )
                continue

            if not dry_run:
                _apply_changes(product, changes)

            updated_rows += 1
            previews.append(
                ImportPreviewRow(
                    row=row_number,
                    product_id=product.id,
                    product_code=_clean_text(getattr(product, "product_code", None)),
                    name=_clean_text(getattr(product, "name", None)),
                    match_by=match_by,
                    action="updated" if not dry_run else "would_update",
                    changes=changes,
                    message=None,
                )
            )

    if dry_run:
        process_rows()
    else:
        with transaction.atomic():
            process_rows()

    return {
        "dry_run": dry_run,
        "total_rows": total_rows,
        "matched_rows": matched_rows,
        "updated_rows": updated_rows,
        "unchanged_rows": unchanged_rows,
        "skipped_rows": skipped_rows,
        "errors": [asdict(item) for item in errors],
        "preview": [asdict(item) for item in previews],
    }