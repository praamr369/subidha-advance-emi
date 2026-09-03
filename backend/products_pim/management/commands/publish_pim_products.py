"""
Publish or unpublish PIM products in bulk.

The public catalogue honours PimProduct.is_published. Nothing is published by
default, so this is how a catalogue gets put live without clicking through the
PIM one product at a time.

Select by category, by explicit codes, or everything. Dry run by default.

    manage.py publish_pim_products --category "Home Appliances"
    manage.py publish_pim_products --category "Home Appliances" --commit
    manage.py publish_pim_products --codes BAHU-A,BAHU-B --commit
    manage.py publish_pim_products --all --priced-only --commit
    manage.py publish_pim_products --codes BAHU-BED --unpublish --commit
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Publish or unpublish PIM products in bulk."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true", help="Select every active product.")
        parser.add_argument("--category", default="", help="Select one category by name.")
        parser.add_argument("--codes", default="", help="Comma-separated product codes.")
        parser.add_argument(
            "--priced-only",
            action="store_true",
            help="Skip products with no price, so no Rs.0 card reaches the catalogue.",
        )
        parser.add_argument(
            "--unpublish",
            action="store_true",
            help="Unpublish the selection instead of publishing it.",
        )
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually write. Without this the command only reports what it would do.",
        )

    def handle(self, *args, **opts):
        from products_pim.models import PimProduct

        if not (opts["all"] or opts["category"] or opts["codes"]):
            raise CommandError("Choose a selection: --all, --category, or --codes.")

        publish = not opts["unpublish"]
        qs = PimProduct.objects.filter(is_active=True).select_related("category", "source_product")

        if opts["category"]:
            qs = qs.filter(category__name__iexact=opts["category"].strip())
        if opts["codes"]:
            codes = [c.strip() for c in opts["codes"].split(",") if c.strip()]
            qs = qs.filter(code__in=codes)

        skipped_unpriced = 0
        selected = []
        for p in qs.order_by("code"):
            if publish and opts["priced_only"]:
                price = getattr(p.source_product, "base_price", None) or p.base_price or 0
                if price <= 0:
                    skipped_unpriced += 1
                    continue
            if p.is_published == publish:
                continue
            selected.append(p)

        verb = "Publishing" if publish else "Unpublishing"
        if not opts["commit"]:
            verb = "Would publish" if publish else "Would unpublish"

        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{verb} {len(selected)} product(s):"))
        for p in selected[:20]:
            cat = p.category.name if p.category else "—"
            self.stdout.write(f"  {p.code}: {p.name[:44]} ({cat})")
        if len(selected) > 20:
            self.stdout.write(f"  ... and {len(selected) - 20} more")

        if skipped_unpriced:
            self.stdout.write(
                self.style.WARNING(f"\nSkipped {skipped_unpriced} unpriced product(s).")
            )

        if not selected:
            self.stdout.write("\nNothing to change.")
            return

        if not opts["commit"]:
            self.stdout.write(self.style.WARNING("\nDry run. Re-run with --commit to apply."))
            return

        with transaction.atomic():
            PimProduct.objects.filter(pk__in=[p.pk for p in selected]).update(is_published=publish)

        state = "published" if publish else "unpublished"
        total_live = PimProduct.objects.filter(is_active=True, is_published=True).count()
        self.stdout.write(self.style.SUCCESS(f"\n{len(selected)} product(s) {state}."))
        self.stdout.write(f"Public catalogue now carries {total_live} published product(s).")
