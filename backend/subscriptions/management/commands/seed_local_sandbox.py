from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from subscriptions.services.local_sandbox_seed_service import seed_local_sandbox


class Command(BaseCommand):
    help = "Seed local sandbox demo data (local/test only)."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true")
        parser.add_argument("--admin", default="subidhafurniture")

    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError("Pass --confirm to seed sandbox data.")
        User = get_user_model()
        admin = User.objects.filter(username=options["admin"]).first()
        if not admin:
            raise CommandError("Admin user not found.")
        result = seed_local_sandbox(performed_by=admin)
        self.stdout.write(self.style.SUCCESS(str(result)))
