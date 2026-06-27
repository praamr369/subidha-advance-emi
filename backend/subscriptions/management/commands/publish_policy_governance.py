from __future__ import annotations

from django.core.management.base import BaseCommand

from accounts.models import User
from subscriptions.services.policy_coverage_catalog import INTERNAL, PUBLIC, get_policy_coverage_specs
from subscriptions.services.policy_governance_service import (
    accept_internal_policy,
    hydrate_policy_governance_metadata,
    publish_policy_page,
    seed_default_policy_pages,
)
from subscriptions.models_business_setup import PolicyPage


class Command(BaseCommand):
    help = "Seed all required policy templates and publish public ones / accept internal ones."

    def add_arguments(self, parser):
        parser.add_argument("--performed-by", type=str, default="", help="Optional username for audit attribution.")
        parser.add_argument("--dry-run", action="store_true", help="Preview only — do not publish.")

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        actor = None
        username = (options.get("performed_by") or "").strip()
        if username:
            actor = User.objects.filter(username=username).first()
            if actor is None:
                self.stderr.write(self.style.WARNING(f"User '{username}' not found. Running without actor."))

        seed_result = seed_default_policy_pages(performed_by=actor)
        self.stdout.write(f"Seed: created={seed_result['created']} updated={seed_result['updated']} skipped={seed_result['skipped']}")

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run mode — skipping publish/accept steps."))
            return

        specs = get_policy_coverage_specs()
        published = updated = accepted = skipped = errors = 0
        for spec in specs:
            policy = PolicyPage.objects.filter(slug=spec.slug).order_by("-version", "-id").first()
            if policy is None:
                self.stderr.write(self.style.WARNING(f"  SKIP  {spec.slug}: no policy page found after seed"))
                skipped += 1
                continue
            if spec.visibility == PUBLIC:
                if policy.status == "PUBLISHED":
                    skipped += 1
                    continue
                try:
                    publish_policy_page(policy=policy, performed_by=actor, review_now=True)
                    published += 1
                    self.stdout.write(f"  PUBLISHED  {spec.slug}")
                except Exception as exc:
                    errors += 1
                    self.stderr.write(self.style.ERROR(f"  ERROR  {spec.slug}: {exc}"))
            elif spec.visibility == INTERNAL:
                meta = hydrate_policy_governance_metadata(policy)
                if meta.internal_acceptance_at or policy.status in {"APPROVED", "PUBLISHED"}:
                    skipped += 1
                    continue
                try:
                    accept_internal_policy(policy, performed_by=actor)
                    accepted += 1
                    self.stdout.write(f"  ACCEPTED  {spec.slug}")
                except Exception as exc:
                    errors += 1
                    self.stderr.write(self.style.ERROR(f"  ERROR  {spec.slug}: {exc}"))

        msg = f"Done: published={published} accepted={accepted} skipped={skipped} errors={errors}"
        if errors:
            self.stderr.write(self.style.ERROR(msg))
        else:
            self.stdout.write(self.style.SUCCESS(msg))
