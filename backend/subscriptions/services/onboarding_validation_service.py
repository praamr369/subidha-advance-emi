from __future__ import annotations

import csv
import io
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.exceptions import ValidationError
from django.utils.text import slugify

from subscriptions.models import Batch, BatchStatus, Customer, LuckyIdStatus, Product


CUSTOMER_REQUIRED_HEADERS = ("name", "phone")
PRODUCT_REQUIRED_HEADERS = ("name", "base_price")
EXPECTED_LUCKY_NUMBERS = tuple(range(100))


def load_csv_rows(csv_path: str | Path) -> tuple[list[str], list[dict[str, str]]]:
    path = Path(csv_path)
    decoded = path.read_text(encoding="utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))
    headers = reader.fieldnames or []
    rows = list(reader)
    return headers, rows


def missing_customer_headers(headers: list[str]) -> list[str]:
    return [header for header in CUSTOMER_REQUIRED_HEADERS if header not in headers]


def validate_customer_import_rows(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    seen_phones: set[str] = set()
    validation_rows: list[dict[str, object]] = []

    for index, row in enumerate(rows, start=2):
        name = (row.get("name") or "").strip()
        phone = (row.get("phone") or "").strip()

        errors: list[str] = []
        if not name:
            errors.append("name is required")
        if not phone:
            errors.append("phone is required")

        if phone and phone in seen_phones:
            errors.append("duplicate phone in upload")
        if phone:
            seen_phones.add(phone)

        existing_customer = Customer.objects.filter(phone=phone).first() if phone else None
        if existing_customer:
            errors.append("customer with this phone already exists")

        validation_rows.append(
            {
                "row_number": index,
                "name": name,
                "phone": phone,
                "valid": len(errors) == 0,
                "errors": errors,
            }
        )

    return validation_rows


def summarize_customer_import_validation(
    headers: list[str],
    validation_rows: list[dict[str, object]],
) -> dict[str, object]:
    valid_count = sum(1 for row in validation_rows if row["valid"])
    invalid_rows = [row for row in validation_rows if not row["valid"]]

    return {
        "columns": headers,
        "row_count": len(validation_rows),
        "valid_count": valid_count,
        "invalid_count": len(validation_rows) - valid_count,
        "invalid_rows": invalid_rows,
    }


def missing_product_headers(headers: list[str]) -> list[str]:
    normalized = {str(name).strip() for name in headers if name}
    return [header for header in PRODUCT_REQUIRED_HEADERS if header not in normalized]


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _clean_decimal(value: object) -> Decimal | None:
    raw = _clean_text(value)
    if not raw:
        return None

    try:
        return Decimal(raw)
    except (InvalidOperation, TypeError, ValueError):
        return None


def _row_subcategory(row: dict[str, str]) -> str:
    return _clean_text(
        row.get("sub_category")
        or row.get("subcategory")
        or row.get("sub-category")
    )


def _resolve_existing_product(product_code: str, name: str) -> Product | None:
    if product_code:
        existing = Product.objects.filter(product_code=product_code).first()
        if existing:
            return existing

    if name:
        existing = Product.objects.filter(name__iexact=name).first()
        if existing:
            return existing

    return None


def _build_product_code_preview(name: str) -> str:
    base = slugify(name).upper().replace("-", "")[:12] or "PRODUCT"
    existing_codes = Product.objects.filter(
        product_code__startswith=f"{base}-"
    ).values_list("product_code", flat=True)

    next_seq = 1
    used: set[int] = set()

    for code in existing_codes:
        try:
            used.add(int(str(code).split("-")[-1]))
        except (TypeError, ValueError):
            continue

    while next_seq in used:
        next_seq += 1

    return f"{base}-{next_seq:04d}"


def validate_product_import_rows(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    validation_rows: list[dict[str, object]] = []

    for index, row in enumerate(rows, start=2):
        name = _clean_text(row.get("name"))
        price_raw = _clean_text(row.get("base_price") or row.get("price"))
        product_code = _clean_text(row.get("product_code")).upper()

        errors: list[str] = []

        if not name:
            errors.append("name is required")

        price = _clean_decimal(price_raw)
        if price is None:
            errors.append(f"invalid base_price '{price_raw or ''}'")

        existing = _resolve_existing_product(product_code, name) if not errors else None

        resolved_product_code: str | None = None
        action = "invalid"

        if not errors:
            resolved_product_code = (
                product_code
                or (existing.product_code if existing else _build_product_code_preview(name))
            )
            action = "update" if existing else "create"

        validation_rows.append(
            {
                "row_number": index,
                "name": name,
                "category": _clean_text(row.get("category")),
                "subcategory": _row_subcategory(row),
                "input_product_code": product_code,
                "resolved_product_code": resolved_product_code,
                "valid": len(errors) == 0,
                "action": action,
                "errors": errors,
            }
        )

    return validation_rows


def summarize_product_import_validation(
    headers: list[str],
    validation_rows: list[dict[str, object]],
) -> dict[str, object]:
    valid_rows = [row for row in validation_rows if row["valid"]]
    invalid_rows = [row for row in validation_rows if not row["valid"]]

    return {
        "columns": headers,
        "row_count": len(validation_rows),
        "valid_count": len(valid_rows),
        "invalid_count": len(invalid_rows),
        "create_candidates": sum(1 for row in valid_rows if row["action"] == "create"),
        "update_candidates": sum(1 for row in valid_rows if row["action"] == "update"),
        "invalid_rows": invalid_rows,
    }


def inspect_batch_setup(batch: Batch) -> dict[str, object]:
    batch_errors: dict[str, list[str]] | dict[str, object] = {}

    try:
        batch.full_clean()
    except ValidationError as exc:
        batch_errors = exc.message_dict or {"detail": exc.messages}

    lucky_numbers = list(batch.lucky_ids.values_list("lucky_number", flat=True))
    lucky_count = len(lucky_numbers)
    counter = Counter(lucky_numbers)

    duplicate_numbers = sorted(
        number for number, count in counter.items() if count > 1
    )
    invalid_numbers = sorted(
        number for number in counter if number < 0 or number > 99
    )
    missing_numbers = (
        sorted(set(EXPECTED_LUCKY_NUMBERS) - set(lucky_numbers))
        if batch.total_slots == 100
        else []
    )

    available_count = batch.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).count()
    assigned_count = batch.lucky_ids.filter(status=LuckyIdStatus.ASSIGNED).count()
    won_count = batch.lucky_ids.filter(status=LuckyIdStatus.WON).count()

    issues: list[str] = []
    if batch_errors:
        issues.append("Batch model validation is failing for the persisted record.")
    if batch.total_slots != 100:
        issues.append("Lucky Plan onboarding expects total_slots=100 for batch setup.")
    if lucky_count != batch.total_slots:
        issues.append(
            f"Lucky ID count mismatch: expected {batch.total_slots}, found {lucky_count}."
        )
    if duplicate_numbers:
        issues.append("Duplicate lucky numbers exist inside this batch.")
    if invalid_numbers:
        issues.append("Out-of-range lucky numbers were found outside 00-99.")
    if batch.total_slots == 100 and missing_numbers:
        issues.append("One or more Lucky Plan numbers from 00-99 are missing.")
    if batch.status == BatchStatus.OPEN and batch.total_slots != 100:
        issues.append("OPEN batches must have exactly 100 slots.")
    if batch.status == BatchStatus.OPEN and lucky_count != batch.total_slots:
        issues.append("OPEN batches must already have the full Lucky ID pool prepared.")

    lucky_generation_healthy = (
        batch.total_slots == 100
        and lucky_count == 100
        and not duplicate_numbers
        and not invalid_numbers
        and not missing_numbers
    )
    ready_for_open_transition = (
        batch.total_slots == 100
        and lucky_generation_healthy
        and batch.status in {BatchStatus.DRAFT, BatchStatus.OPEN}
    )

    return {
        "batch_id": batch.id,
        "batch_code": batch.batch_code,
        "status": batch.status,
        "total_slots": batch.total_slots,
        "duration_months": batch.duration_months,
        "draw_day": batch.draw_day,
        "start_date": batch.start_date,
        "subscription_count": batch.subscriptions.count(),
        "draw_count": batch.lucky_draws.count(),
        "batch_errors": batch_errors,
        "lucky_id_count": lucky_count,
        "available_lucky_ids": available_count,
        "assigned_lucky_ids": assigned_count,
        "won_lucky_ids": won_count,
        "duplicate_numbers": duplicate_numbers,
        "invalid_numbers": invalid_numbers,
        "missing_numbers": missing_numbers,
        "lucky_generation_expected": batch.total_slots == 100,
        "lucky_generation_healthy": lucky_generation_healthy,
        "ready_for_open_transition": ready_for_open_transition,
        "issues": issues,
    }
