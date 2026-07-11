from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from accounts.models import User
from subscriptions.services.policy_governance_service import seed_default_policy_pages


class Command(BaseCommand):
    help = "Delete ALL policy pages and governance metadata, then re-seed from default templates."

    def add_arguments(self, parser):
        parser.add_argument(
            "--performed-by",
            type=str,
            default="",
            help="Optional username for audit attribution.",
        )
        parser.add_argument(
            "--auto-accept-internal",
            action="store_true",
            help="After seeding, automatically accept all INTERNAL governance policies.",
        )
        parser.add_argument(
            "--auto-publish-public",
            action="store_true",
            help="After seeding, automatically publish all PUBLIC policies (skip review).",
        )

    def handle(self, *args, **options):
        actor = None
        username = (options.get("performed_by") or "").strip()
        if username:
            actor = User.objects.filter(username=username).first()
            if actor is None:
                self.stderr.write(self.style.WARNING(f"User '{username}' not found. Running without actor."))

        with transaction.atomic():
            with connection.cursor() as cursor:
                # Delete governance metadata first (FK child), then policy pages
                cursor.execute(
                    "DELETE FROM policy_governance_metadata WHERE id > 0"
                )
                meta_count = cursor.rowcount
                cursor.execute(
                    "DELETE FROM policy_pages WHERE id > 0"
                )
                policy_count = cursor.rowcount

        self.stdout.write(self.style.WARNING(
            f"Deleted {meta_count} governance metadata rows and {policy_count} policy page rows."
        ))

        result = seed_default_policy_pages(
            performed_by=actor,
            overwrite_existing_drafts=False,
        )

        self.stdout.write(self.style.SUCCESS(
            f"Seed complete: created={result['created']} updated={result['updated']} skipped={result['skipped']}"
        ))

        if options.get("auto_accept_internal"):
            from subscriptions.models_business_setup import PolicyPage
            from subscriptions.services.policy_governance_service import accept_internal_policy
            from subscriptions.services.policy_coverage_catalog import INTERNAL
            from subscriptions.models_policy_governance import PolicyGovernanceMetadata

            internal_slugs = PolicyGovernanceMetadata.objects.filter(
                visibility=INTERNAL
            ).values_list("policy__slug", flat=True).distinct()
            accepted = 0
            for slug in internal_slugs:
                policy = PolicyPage.objects.filter(slug=slug).order_by("-version").first()
                if policy:
                    try:
                        accept_internal_policy(policy, performed_by=actor)
                        accepted += 1
                    except Exception as e:
                        self.stderr.write(f"  Could not accept {slug}: {e}")
            self.stdout.write(self.style.SUCCESS(f"Auto-accepted {accepted} internal policies."))

        if options.get("auto_publish_public"):
            from subscriptions.models_business_setup import PolicyPage
            from subscriptions.services.policy_governance_service import publish_policy_page
            from subscriptions.services.policy_coverage_catalog import PUBLIC
            from subscriptions.models_policy_governance import PolicyGovernanceMetadata

            public_slugs = PolicyGovernanceMetadata.objects.filter(
                visibility=PUBLIC
            ).values_list("policy__slug", flat=True).distinct()
            published = 0
            for slug in public_slugs:
                policy = PolicyPage.objects.filter(slug=slug).order_by("-version").first()
                if policy:
                    try:
                        publish_policy_page(policy=policy, performed_by=actor, review_now=True)
                        published += 1
                    except Exception as e:
                        self.stderr.write(f"  Could not publish {slug}: {e}")
            self.stdout.write(self.style.SUCCESS(f"Auto-published {published} public policies."))

        self.stdout.write(self.style.SUCCESS("Done. Policy pages reset and re-seeded."))
