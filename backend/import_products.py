import os
import django
import csv

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from api.models import Product

created = 0
skipped = 0

with open("products.csv", newline="", encoding="latin-1") as f:
    reader = csv.DictReader(f)

    for row in reader:
        name = row.get("name")
        price = row.get("base_price") or row.get("price")

        if not name or not price:
            skipped += 1
            continue

        Product.objects.create(
            name=name.strip(),
            category=row.get("category"),
            sub_category=row.get("sub_category"),
            details=row.get("details"),
            base_price=price,
            is_active=True,
        )
        created += 1

print("✅ Products imported:", created)
print("⚠️ Rows skipped:", skipped)
