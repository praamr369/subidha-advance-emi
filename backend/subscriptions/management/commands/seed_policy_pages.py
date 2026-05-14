from __future__ import annotations

from django.core.management.base import BaseCommand

from accounts.models import User
from subscriptions.services.policy_governance_service import seed_default_policy_pages


class Command(BaseCommand):
    help = "Seed default legal/policy page templates as editable draft records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--overwrite-existing-drafts",
            action="store_true",
            help="Overwrite existing draft rows with the default template content.",
        )
        parser.add_argument(
            "--performed-by",
            type=str,
            default="",
            help="Optional username for audit attribution.",
        )

    def handle(self, *args, **options):
        actor = None
        username = (options.get("performed_by") or "").strip()
        if username:
            actor = User.objects.filter(username=username).first()
            if actor is None:
                self.stderr.write(self.style.WARNING(f"User '{username}' not found. Running without actor."))

        result = seed_default_policy_pages(
            performed_by=actor,
            overwrite_existing_drafts=bool(options.get("overwrite_existing_drafts")),
        )

        self.stdout.write(
            self.style.SUCCESS(
                "Policy template seed completed: "
                f"created={result['created']} updated={result['updated']} skipped={result['skipped']}"
            )
        )
