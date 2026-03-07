"""Import products from backend/products.csv into subscriptions_product table.

Run:
    cd backend
    python import_products.py
"""

from __future__ import annotations

import csv
import os
from decimal import Decimal, InvalidOperation

import django
from django.utils.text import slugify

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from subscriptions.models import Product  # noqa: E402

CSV_PATH = os.path.join(os.path.dirname(__file__), "products.csv")


def make_product_code(name: str, index: int) -> str:
    base = slugify(name).upper().replace("-", "")[:12] or "PRODUCT"
    return f"{base}-{index:04d}"


def main() -> None:
    created = 0
    updated = 0
    skipped = 0

    with open(CSV_PATH, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)

        for idx, row in enumerate(reader, start=1):
            name = (row.get("name") or "").strip()
            price_raw = (row.get("base_price") or row.get("price") or "").strip()

            if not name or not price_raw:
                skipped += 1
                continue

            try:
                price = Decimal(price_raw)
            except InvalidOperation:
                skipped += 1
                continue

            product_code = make_product_code(name, idx)
            _, was_created = Product.objects.update_or_create(
                product_code=product_code,
                defaults={"name": name, "base_price": price},
            )

            if was_created:
                created += 1
            else:
                updated += 1

    print(f"✅ Products created: {created}")
    print(f"♻️ Products updated: {updated}")
    print(f"⚠️ Rows skipped: {skipped}")


if __name__ == "__main__":
    main()
