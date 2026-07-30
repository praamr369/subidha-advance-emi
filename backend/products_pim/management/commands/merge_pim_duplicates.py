"""Merge duplicate PIM categories/subcategories into one clean set.

The generic `seed_pim_categories` command and the data-driven `import_pim_taxonomy`
command created overlapping subcategories (e.g. old "Beds" vs "Bed", "Sofas" vs
"Sofa", "Dining Sets" vs "Dinning Table"). This collapses each duplicate group into
the subcategory that actually holds the products, merging in any unique attributes
from the empty duplicate, then deletes the leftover.

Canonical winner = the subcategory with the most products (tie -> most attributes).
Idempotent. Dry-run by default; pass --commit to apply.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from products_pim.models import (
    CategoryAttribute,
    PimProduct,
    ProductAttribute,
    ProductCategory,
    ProductSubcategory,
)

# Explicit aliases where plural-stripping is not enough (old-seed -> canonical name).
NAME_ALIASES = {
    "dining sets": "dinning table",
    "mixer grinders": "mixer grinder",
}


def _norm(name: str) -> str:
    key = (name or "").strip().lower()
    key = NAME_ALIASES.get(key, key)
    if key.endswith("s") and not key.endswith("ss"):
        key = key[:-1]  # simple plural -> singular (beds->bed, sofas->sofa)
    return key


class Command(BaseCommand):
    help = "Merge duplicate PIM categories/subcategories into one clean set."

    def add_arguments(self, parser):
        parser.add_argument("--commit", action="store_true", help="Apply (default: dry run).")
        parser.add_argument(
            "--drop-empty",
            action="store_true",
            help="Also delete leftover subcategories/categories that hold zero products.",
        )

    def handle(self, *args, **opts):
        commit = opts["commit"]
        drop_empty = opts["drop_empty"]
        log = []

        with transaction.atomic():
            self._merge_categories(log)
            self._merge_subcategories(log)
            if drop_empty:
                self._drop_empty(log)
            if not commit:
                transaction.set_rollback(True)

        mode = "APPLIED" if commit else "DRY RUN (nothing saved - pass --commit)"
        self.stdout.write(self.style.SUCCESS(f"\n=== {mode} ==="))
        for line in log:
            self.stdout.write("  " + line)
        if not log:
            self.stdout.write("  Nothing to merge - taxonomy already clean.")

    # ── merge same-name categories ────────────────────────────────────
    def _merge_categories(self, log):
        by_name: dict[str, list[ProductCategory]] = {}
        for cat in ProductCategory.objects.all():
            by_name.setdefault(cat.name.strip().lower(), []).append(cat)
        for name, cats in by_name.items():
            if len(cats) < 2:
                continue
            canonical = max(cats, key=lambda c: PimProduct.objects.filter(category=c).count())
            for dup in cats:
                if dup.id == canonical.id:
                    continue
                ProductSubcategory.objects.filter(category=dup).update(category=canonical)
                CategoryAttribute.objects.filter(category=dup).update(category=canonical)
                PimProduct.objects.filter(category=dup).update(category=canonical)
                log.append(f"Category '{dup.name}' (#{dup.id}) merged into '{canonical.name}' (#{canonical.id})")
                dup.delete()

    # ── merge duplicate subcategories within each category ─────────────
    def _merge_subcategories(self, log):
        for cat in ProductCategory.objects.all():
            groups: dict[str, list[ProductSubcategory]] = {}
            for sub in ProductSubcategory.objects.filter(category=cat):
                groups.setdefault(_norm(sub.name), []).append(sub)
            for key, subs in groups.items():
                if len(subs) < 2:
                    continue
                canonical = max(
                    subs,
                    key=lambda s: (
                        PimProduct.objects.filter(subcategory=s).count(),
                        CategoryAttribute.objects.filter(subcategory=s).count(),
                    ),
                )
                for dup in subs:
                    if dup.id == canonical.id:
                        continue
                    self._merge_attributes(dup, canonical, log)
                    moved = PimProduct.objects.filter(subcategory=dup).update(subcategory=canonical)
                    log.append(
                        f"[{cat.name}] Subcategory '{dup.name}' -> '{canonical.name}' "
                        f"({moved} products moved)"
                    )
                    dup.delete()

    def _merge_attributes(self, dup_sub, canonical_sub, log):
        """Move unique attributes from a duplicate subcategory to the canonical one.
        For attributes that already exist on the canonical (same name), repoint any
        product values to the canonical attribute so nothing is lost."""
        canon_by_name = {
            a.name.strip().lower(): a
            for a in CategoryAttribute.objects.filter(subcategory=canonical_sub)
        }
        for attr in CategoryAttribute.objects.filter(subcategory=dup_sub):
            match = canon_by_name.get(attr.name.strip().lower())
            if match is None:
                # unique attribute -> move it onto the canonical subcategory
                attr.category = canonical_sub.category
                attr.subcategory = canonical_sub
                attr.save(update_fields=["category", "subcategory"])
                canon_by_name[attr.name.strip().lower()] = attr
                log.append(f"    + attribute '{attr.name}' moved to '{canonical_sub.name}'")
            else:
                # duplicate attribute -> move product values over, then delete it
                for pa in ProductAttribute.objects.filter(attribute=attr):
                    if not ProductAttribute.objects.filter(product=pa.product, attribute=match).exists():
                        pa.attribute = match
                        pa.save(update_fields=["attribute"])
                    else:
                        pa.delete()
                attr.delete()

    # ── optional cleanup of empty leftovers ───────────────────────────
    def _drop_empty(self, log):
        def _purge_attributes(qs):
            # ProductAttribute.attribute is PROTECT — clear stale value rows first.
            # These are orphaned values on retired attributes (empty in practice).
            ProductAttribute.objects.filter(attribute__in=qs).delete()
            qs.delete()

        for sub in ProductSubcategory.objects.all():
            if PimProduct.objects.filter(subcategory=sub).count() == 0:
                _purge_attributes(CategoryAttribute.objects.filter(subcategory=sub))
                log.append(f"Dropped empty subcategory '{sub.category.name} / {sub.name}'")
                sub.delete()
        for cat in ProductCategory.objects.all():
            has_products = PimProduct.objects.filter(category=cat).exists()
            has_subs = ProductSubcategory.objects.filter(category=cat).exists()
            if not has_products and not has_subs:
                _purge_attributes(CategoryAttribute.objects.filter(category=cat))
                log.append(f"Dropped empty category '{cat.name}'")
                cat.delete()
