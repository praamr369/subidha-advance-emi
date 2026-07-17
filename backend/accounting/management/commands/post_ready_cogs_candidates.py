"""
Nightly COGS bridge sweep.

Auto-posts READY StockLedger COGS candidates (Dr COGS / Cr INVENTORY_ASSET)
through the exact same guarded path the Bridge Workspace uses
(post_bridge_candidate: idempotent, balanced, source-mutation-checked).

Intended to run as a scheduled job, e.g. nightly:
    python manage.py post_ready_cogs_candidates --user <admin-username>

Deferred/blocked candidates are reported but never forced — they stay visible
in the Bridge Workspace for operator review.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from accounting.services.accounting_bridge_candidate_service import BridgeCandidateFilters
from accounting.services.accounting_bridge_purchase_bill_service import (
    COGS_STOCK_LEDGER_EVENT_KEYS,
    STOCK_LEDGER_SOURCE_MODEL,
    list_bridge_candidates,
    post_bridge_candidate,
)


class Command(BaseCommand):
    help = "Post all READY StockLedger COGS bridge candidates (Dr COGS / Cr Inventory Asset)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            required=True,
            help="Username recorded as the posting actor (must be an active admin/staff account).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List what would be posted without creating journal entries.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=200,
            help="Maximum candidates to post in one run (default 200).",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        actor = User.objects.filter(username=options["user"], is_active=True).first()
        if actor is None:
            raise CommandError(f"Active user '{options['user']}' was not found.")

        candidates = list_bridge_candidates(
            BridgeCandidateFilters(source_model=STOCK_LEDGER_SOURCE_MODEL, module="inventory")
        )
        ready = [
            row
            for row in candidates
            if row.get("event_key") in COGS_STOCK_LEDGER_EVENT_KEYS
            and row.get("status") == "READY"
            and not row.get("journal_entry")
        ][: max(1, options["limit"])]

        deferred = sum(1 for row in candidates if row.get("event_key") == "deferred_cogs")
        self.stdout.write(f"COGS candidates: {len(ready)} READY to post, {deferred} deferred (need cost evidence).")

        posted = skipped = failed = 0
        for row in ready:
            label = f"{row.get('source_display')} [{row.get('event_key')}] ₹{row.get('amount')}"
            if options["dry_run"]:
                self.stdout.write(f"  DRY-RUN would post: {label}")
                continue
            try:
                result = post_bridge_candidate(
                    candidate_id=row["candidate_id"],
                    idempotency_key=row["idempotency_key"],
                    confirmed=True,
                    posting_note="Automated nightly COGS sweep (post_ready_cogs_candidates).",
                    actor=actor,
                )
                if result.get("already_posted"):
                    skipped += 1
                    self.stdout.write(f"  SKIP (already posted): {label}")
                else:
                    posted += 1
                    journal = (result.get("journal_entry") or {}).get("entry_no") or (result.get("journal_entry") or {}).get("id")
                    self.stdout.write(self.style.SUCCESS(f"  POSTED {label} -> journal {journal}"))
            except Exception as exc:  # keep sweeping; one bad row must not block the batch
                failed += 1
                self.stderr.write(self.style.WARNING(f"  FAILED {label}: {exc}"))

        summary = f"Done. posted={posted} skipped={skipped} failed={failed} deferred={deferred}"
        self.stdout.write(self.style.SUCCESS(summary) if failed == 0 else self.style.WARNING(summary))
