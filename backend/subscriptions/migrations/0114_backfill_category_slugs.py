from django.db import migrations
from django.utils.text import slugify


def backfill_slugs(apps, schema_editor):
    """Populate slug for existing categories from their name. Additive and
    idempotent: only fills rows whose slug is empty. Collisions are made unique
    with a numeric suffix. No financial/inventory/visibility data is touched."""
    Category = apps.get_model("subscriptions", "ProductCategoryMaster")
    used = set(
        Category.objects.exclude(slug="").values_list("slug", flat=True)
    )
    for category in Category.objects.filter(slug="").order_by("id"):
        base = slugify(category.name)[:140] or f"category-{category.pk}"
        candidate = base
        counter = 2
        while candidate in used:
            candidate = f"{base}-{counter}"[:140]
            counter += 1
        used.add(candidate)
        category.slug = candidate
        category.save(update_fields=["slug"])


def noop_reverse(apps, schema_editor):
    # Reverse is a no-op: leaving slugs in place is harmless and non-destructive.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0113_alter_productcategorymaster_options_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_slugs, noop_reverse),
    ]
