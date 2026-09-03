"""
Repoint PIM category/subcategory from the operational product record.

The PIM import left a single placeholder category — named "Furniture" but
slugged "unclassified" — and pointed every product at it, with subcategory left
null. The operational Product rows carry the real values (Furniture, Home
Appliances, Kitchen Appliances, and subcategories like Bed / Fan / Cabinet), so
appliances were being shown and filtered as furniture.

This treats products_core.Product as the source of truth and rebuilds the PIM
taxonomy to match, creating any category or subcategory that does not exist yet.

Idempotent. Dry run by default.

    manage.py sync_pim_categories
    manage.py sync_pim_categories --commit
"""
from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

PLACEHOLDER_SLUG = "unclassified"


class Command(BaseCommand):
    help = "Sync PIM category/subcategory from each product's operational record."

    def add_arguments(self, parser):
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually write. Without this the command only reports what it would change.",
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            help="Also sync products marked inactive.",
        )

    def handle(self, *args, **opts):
        from products_pim.models import PimProduct

        qs = PimProduct.objects.select_related("category", "subcategory", "source_product")
        if not opts["include_inactive"]:
            qs = qs.filter(is_active=True)

        planned: list[tuple[str, str, str, str, str]] = []
        no_source = 0
        no_category = 0
        unchanged = 0

        for p in qs:
            src = p.source_product
            if src is None:
                no_source += 1
                continue

            core_cat = (src.category or "").strip()
            core_sub = (src.subcategory or "").strip()
            if not core_cat:
                no_category += 1
                continue

            cur_cat = p.category.name if p.category else ""
            cur_sub = p.subcategory.name if p.subcategory else ""

            if cur_cat.lower() == core_cat.lower() and cur_sub.lower() == core_sub.lower():
                unchanged += 1
                continue

            planned.append((p.code, cur_cat, core_cat, cur_sub, core_sub))

        self._report(planned, unchanged, no_source, no_category, opts["commit"])

        if not planned or not opts["commit"]:
            if planned and not opts["commit"]:
                self.stdout.write(
                    self.style.WARNING("\nDry run. Re-run with --commit to apply these.")
                )
            return

        changed = self._write(qs, opts["include_inactive"])
        self.stdout.write(self.style.SUCCESS(f"\nRepointed {changed} product(s)."))

    @transaction.atomic
    def _write(self, qs, include_inactive: bool) -> int:
        from products_pim.models import ProductCategory, ProductSubcategory

        cat_cache: dict[str, object] = {}
        sub_cache: dict[tuple[int, str], object] = {}
        changed = 0

        for p in qs:
            src = p.source_product
            if src is None:
                continue
            core_cat = (src.category or "").strip()
            if not core_cat:
                continue
            core_sub = (src.subcategory or "").strip()

            key = core_cat.lower()
            if key not in cat_cache:
                slug = slugify(core_cat) or "category"
                existing = ProductCategory.objects.filter(name__iexact=core_cat).first()
                if existing:
                    # The import's placeholder is named Furniture but slugged
                    # "unclassified"; give it its real slug now that it holds
                    # only genuine furniture.
                    if existing.slug == PLACEHOLDER_SLUG:
                        existing.slug = slug
                        existing.save(update_fields=["slug"])
                    cat_cache[key] = existing
                else:
                    cat_cache[key] = ProductCategory.objects.get_or_create(
                        slug=slug, defaults={"name": core_cat, "is_active": True}
                    )[0]
            category = cat_cache[key]

            subcategory = None
            if core_sub:
                sub_key = (category.id, core_sub.lower())
                if sub_key not in sub_cache:
                    sub_cache[sub_key] = ProductSubcategory.objects.get_or_create(
                        category=category,
                        slug=slugify(core_sub) or "subcategory",
                        defaults={"name": core_sub, "is_active": True},
                    )[0]
                subcategory = sub_cache[sub_key]

            if p.category_id != category.id or p.subcategory_id != getattr(subcategory, "id", None):
                p.category = category
                p.subcategory = subcategory
                p.save(update_fields=["category", "subcategory"])
                changed += 1

        return changed

    def _report(self, planned, unchanged, no_source, no_category, commit):
        verb = "Repointing" if commit else "Would repoint"
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{verb} {len(planned)} product(s)."))

        # Separate real category moves from rows where only the subcategory is
        # being filled in, so "Furniture -> Furniture" does not read as a change.
        moves = Counter(
            (cur or "—", new) for _c, cur, new, _cs, _ns in planned if (cur or "").lower() != new.lower()
        )
        sub_only = sum(
            1 for _c, cur, new, _cs, _ns in planned if (cur or "").lower() == new.lower()
        )
        if moves:
            self.stdout.write("\nCategory moves:")
            for (cur, new), n in moves.most_common():
                self.stdout.write(f"  {cur} -> {new}: {n}")
        if sub_only:
            self.stdout.write(f"\nCategory already correct, subcategory only: {sub_only}")

        subs = Counter(ns for *_r, ns in planned if ns)
        if subs:
            self.stdout.write("\nSubcategories to assign:")
            for name, n in subs.most_common(12):
                self.stdout.write(f"  {name}: {n}")

        self.stdout.write(f"\nAlready correct: {unchanged}")
        if no_source:
            self.stdout.write(self.style.WARNING(f"No source product, skipped: {no_source}"))
        if no_category:
            self.stdout.write(
                self.style.WARNING(f"Source has no category, skipped: {no_category}")
            )
