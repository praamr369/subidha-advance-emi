from __future__ import annotations

from typing import Iterable, List, Sequence

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


RESET_CONFIRMATION = "RESET_SUBIDHA_CORE"


BUSINESS_MODEL_NAMES: Sequence[str] = (
    "AuditLog",
    "Commission",
    "CommissionPayoutBatch",
    "CommissionPayoutBatchItem",
    "Customer",
    "Batch",
    "LuckyId",
    "LuckyDraw",
    "Subscription",
    "SubscriptionTransition",
    "SubscriptionTransitionLog",
    "Emi",
    "EMI",
    "Payment",
    "PaymentAllocation",
    "FinancialLedger",
    "PayoutBatch",
    "PayoutBatchItem",
    
)


AUTH_ARTIFACT_MODEL_NAMES: Sequence[str] = (
    "Session",
    "OutstandingToken",
    "BlacklistedToken",
)


def resolve_models_by_name(names: Iterable[str]) -> List[type]:
    resolved: List[type] = []
    seen = set()

    for model in apps.get_models():
        if model.__name__ in names:
            label = model._meta.label_lower
            if label not in seen:
                seen.add(label)
                resolved.append(model)

    return resolved


def quote_table(table_name: str) -> str:
    return connection.ops.quote_name(table_name)


class Command(BaseCommand):
    help = (
        "Hard reset business data while preserving superusers and optionally "
        "preserving specific internal user IDs."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--keep-user-ids",
            nargs="*",
            type=int,
            default=[],
            help="Additional user IDs to preserve besides superusers.",
        )
        parser.add_argument(
            "--delete-non-kept-users",
            action="store_true",
            help=(
                "Also delete non-preserved users after business data reset. "
                "Use this only when you want to remove customer/partner/cashier users too."
            ),
        )
        parser.add_argument(
            "--clear-auth-artifacts",
            action="store_true",
            help=(
                "Also clear sessions and JWT blacklist/outstanding token tables if present."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without actually deleting anything.",
        )
        parser.add_argument(
            "--confirm",
            type=str,
            default="",
            help=f"Required confirmation string: {RESET_CONFIRMATION}",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        keep_user_ids: List[int] = options["keep_user_ids"]
        delete_non_kept_users: bool = options["delete_non_kept_users"]
        clear_auth_artifacts: bool = options["clear_auth_artifacts"]
        confirm: str = (options["confirm"] or "").strip()

        if not dry_run and confirm != RESET_CONFIRMATION:
            raise CommandError(
                f"Reset blocked. Re-run with --confirm {RESET_CONFIRMATION}"
            )

        business_models = resolve_models_by_name(BUSINESS_MODEL_NAMES)
        auth_artifact_models = resolve_models_by_name(AUTH_ARTIFACT_MODEL_NAMES)

        if not business_models:
            raise CommandError(
                "No target business models were resolved. "
                "Review BUSINESS_MODEL_NAMES for your project."
            )

        User = get_user_model()

        superuser_ids = set(
            User.objects.filter(is_superuser=True).values_list("id", flat=True)
        )
        preserved_user_ids = set(keep_user_ids) | superuser_ids

        preserved_users = list(
            User.objects.filter(id__in=preserved_user_ids)
            .order_by("id")
            .values("id", "username", "is_superuser")
        )

        business_counts = []
        total_business_rows = 0

        for model in business_models:
            count = model.objects.count()
            business_counts.append((model._meta.label, count))
            total_business_rows += count

        auth_artifact_counts = []
        total_auth_artifact_rows = 0

        if clear_auth_artifacts:
            for model in auth_artifact_models:
                count = model.objects.count()
                auth_artifact_counts.append((model._meta.label, count))
                total_auth_artifact_rows += count

        deletable_user_qs = User.objects.exclude(id__in=preserved_user_ids)
        deletable_user_count = deletable_user_qs.count() if delete_non_kept_users else 0

        self.stdout.write("")
        self.stdout.write(self.style.WARNING("SUBIDHA CORE database reset plan"))
        self.stdout.write("-" * 72)
        self.stdout.write(f"Business rows to remove: {total_business_rows}")
        for label, count in business_counts:
            self.stdout.write(f"  - {label}: {count}")

        if clear_auth_artifacts:
            self.stdout.write(f"Auth artifact rows to remove: {total_auth_artifact_rows}")
            for label, count in auth_artifact_counts:
                self.stdout.write(f"  - {label}: {count}")

        self.stdout.write(f"Superusers preserved automatically: {len(superuser_ids)}")
        self.stdout.write(f"Total preserved users: {len(preserved_user_ids)}")
        for user in preserved_users:
            suffix = " [superuser]" if user["is_superuser"] else ""
            self.stdout.write(f"  - id={user['id']} username={user['username']}{suffix}")

        if delete_non_kept_users:
            self.stdout.write(f"Non-preserved users to delete: {deletable_user_count}")
        else:
            self.stdout.write("Non-preserved users: kept")

        if dry_run:
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("Dry run complete. No data was deleted."))
            return

        with transaction.atomic():
            if connection.vendor == "postgresql":
                business_tables = [quote_table(model._meta.db_table) for model in business_models]
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"TRUNCATE TABLE {', '.join(business_tables)} RESTART IDENTITY CASCADE;"
                    )

                if clear_auth_artifacts and auth_artifact_models:
                    auth_tables = [
                        quote_table(model._meta.db_table) for model in auth_artifact_models
                    ]
                    with connection.cursor() as cursor:
                        cursor.execute(
                            f"TRUNCATE TABLE {', '.join(auth_tables)} RESTART IDENTITY CASCADE;"
                        )
            else:
                # Non-Postgres fallback
                for model in business_models:
                    model.objects.all().delete()

                if clear_auth_artifacts:
                    for model in auth_artifact_models:
                        model.objects.all().delete()

            if delete_non_kept_users:
                deletable_user_qs.delete()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Business data reset completed successfully."))
        self.stdout.write(
            self.style.SUCCESS(
                f"Preserved user IDs: {sorted(preserved_user_ids) if preserved_user_ids else []}"
            )
        )