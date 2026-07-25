from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from subscriptions.models import Product


class Command(BaseCommand):
    help = (
        "Enable Rent and Lease plan eligibility (is_rent_enabled, is_lease_enabled) for "
        "every active product. Per user decision: the full catalog should be rentable/"
        "leasable, not just a category subset. Uses Product.save() per row so the "
        "derived is_rent_ready/is_lease_ready flags stay in sync via the model's own "
        "sync logic, rather than bypassing it with a bulk update()."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        products = Product.objects.filter(is_active=True).filter(
            Q(is_rent_enabled=False) | Q(is_lease_enabled=False)
        )

        if not products.exists():
            self.stdout.write(self.style.SUCCESS("Every active product already has rent and lease enabled."))
            return

        count = products.count()
        self.stdout.write(f"{count} active product(s) need rent/lease enabled.")

        if dry_run:
            for product in products:
                self.stdout.write(f"  would update product_id={product.id} ({product.name})")
            self.stdout.write(self.style.WARNING("Dry run — no changes made."))
            return

        updated = 0
        with transaction.atomic():
            for product in products.select_for_update():
                product.is_rent_enabled = True
                product.is_lease_enabled = True
                product.save(update_fields=["is_rent_enabled", "is_lease_enabled", "is_rent_ready", "is_lease_ready"])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Enabled rent and lease for {updated} product(s)."))
