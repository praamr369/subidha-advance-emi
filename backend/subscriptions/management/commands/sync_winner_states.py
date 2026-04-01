from django.core.management.base import BaseCommand
from django.db.models import Q

from subscriptions.models import (
    EmiStatus,
    LedgerEntryType,
    LuckyIdStatus,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.winner_state_service import sync_winner_state


class Command(BaseCommand):
    help = "Repair stale winner state between subscriptions, waived EMI truth, draw records, and Lucky IDs."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--subscription-id", type=int, dest="subscription_id")
        parser.add_argument("--batch-id", type=int, dest="batch_id")

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        subscription_id = options.get("subscription_id")
        batch_id = options.get("batch_id")

        queryset = (
            Subscription.objects.select_related("lucky_id", "batch", "customer")
            .prefetch_related("emis__ledger_entries", "winning_draws")
            .filter(plan_type=PlanType.EMI)
            .filter(
                Q(winner_month__isnull=False)
                | Q(status=SubscriptionStatus.WON)
                | Q(lucky_id__status=LuckyIdStatus.WON)
                | Q(winning_draws__is_revealed=True)
                | Q(emis__status=EmiStatus.WAIVED)
                | Q(emis__ledger_entries__entry_type=LedgerEntryType.EMI_WAIVER)
            )
            .distinct()
            .order_by("id")
        )

        if subscription_id:
            queryset = queryset.filter(pk=subscription_id)

        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)

        checked = 0
        changed = 0
        skipped = 0

        for subscription in queryset:
            checked += 1
            result = sync_winner_state(
                subscription=subscription,
                performed_by=None,
                source="winner_state_repair",
                emit_audit=not dry_run,
                commit=not dry_run,
            )

            if result.get("skipped"):
                skipped += 1
                self.stdout.write(
                    self.style.WARNING(
                        (
                            f"Skipped subscription #{subscription.id}: "
                            f"{result.get('reason', 'no_reason')}"
                        )
                    )
                )
                continue

            if result["changed"]:
                changed += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        (
                            f"{'Would sync' if dry_run else 'Synced'} subscription #{subscription.id}: "
                            f"{result['old_subscription_status']} -> {result['new_subscription_status']}, "
                            f"lucky {result['old_lucky_id_status']} -> {result['new_lucky_id_status']}"
                        )
                    )
                )

        self.stdout.write(
            f"Winner state sync complete. Checked={checked}, changed={changed}, skipped={skipped}, dry_run={dry_run}"
        )
