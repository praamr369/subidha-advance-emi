from __future__ import annotations

import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from inventory.services.local_inventory_vendor_seed_service import (
    DEFAULT_ITEM_COUNT,
    DEFAULT_VENDOR_COUNT,
    seed_inventory_vendor_sandbox,
)


class Command(BaseCommand):
    help = "Seed local/test inventory items, opening stock, vendors, and vendor opening outstanding."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true")
        parser.add_argument("--admin", default="subidhafurniture")
        parser.add_argument("--items", type=int, default=DEFAULT_ITEM_COUNT)
        parser.add_argument("--vendors", type=int, default=DEFAULT_VENDOR_COUNT)

    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError("Pass --confirm to seed inventory/vendor sandbox data.")

        User = get_user_model()
        admin = User.objects.filter(username=options["admin"]).first()
        if not admin:
            raise CommandError(f"Admin user '{options['admin']}' not found.")

        try:
            result = seed_inventory_vendor_sandbox(
                performed_by=admin,
                item_count=options["items"],
                vendor_count=options["vendors"],
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(json.dumps(result, indent=2, sort_keys=True)))
