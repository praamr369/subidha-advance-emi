from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import UserRole
from subscriptions.models import (
    Batch,
    BatchStatus,
    Customer,
    LuckyId,
    LuckyIdStatus,
    Product,
)
from subscriptions.services.subscription_service import create_emi_subscription


def _assert_local_only() -> None:
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").lower()
    if not (settings.DEBUG or env in {"development", "test", "local"}):
        raise CommandError("seed_batch_test_data is disabled outside local/test environments.")


class Command(BaseCommand):
    help = (
        "Seed N test customers + EMI subscriptions onto a batch (local/test only). "
        "Uses the canonical create_emi_subscription service so EMI schedules, lucky-ID "
        "assignment, contract numbers, and audit/business events all match production."
    )

    def add_arguments(self, parser):
        parser.add_argument("--batch-id", type=int, default=1)
        parser.add_argument("--count", type=int, default=100)
        parser.add_argument("--prefix", default="TESTB1")
        parser.add_argument("--phone-base", default="91000000000")
        parser.add_argument("--tenure", type=int, default=0, help="0 = use batch.duration_months")
        parser.add_argument("--product-id", type=int, default=0, help="0 = first EMI-enabled product")
        parser.add_argument("--confirm", action="store_true")

    def handle(self, *args, **options):
        _assert_local_only()
        if not options["confirm"]:
            raise CommandError("Pass --confirm to seed batch test data.")

        User = get_user_model()
        batch = Batch.objects.filter(id=options["batch_id"]).first()
        if not batch:
            raise CommandError(f"Batch #{options['batch_id']} not found.")
        if batch.status != BatchStatus.OPEN:
            raise CommandError(f"Batch #{batch.id} status is {batch.status}; must be OPEN to seed subscriptions.")

        if options["product_id"]:
            product = Product.objects.filter(id=options["product_id"], is_emi_enabled=True).first()
        else:
            product = Product.objects.filter(is_emi_enabled=True, is_active=True).order_by("id").first()
        if not product:
            raise CommandError("No EMI-enabled product available.")

        tenure = options["tenure"] or int(batch.duration_months or 15)
        prefix = options["prefix"]
        phone_base = int(options["phone_base"])
        target = options["count"]

        # Idempotent top-up: only create enough to bring the batch's ACTIVE
        # subscription count up to `target`. Re-running fills gaps safely.
        existing_active = batch.subscriptions.filter(status="ACTIVE").count()
        to_create = max(0, target - existing_active)

        available = list(
            LuckyId.objects.filter(batch=batch, status=LuckyIdStatus.AVAILABLE)
            .order_by("lucky_number")
            .values_list("lucky_number", flat=True)
        )
        if len(available) < to_create:
            self.stdout.write(
                self.style.WARNING(
                    f"Only {len(available)} lucky IDs available on batch {batch.id}; "
                    f"capping new subscriptions from {to_create} to {len(available)}."
                )
            )
            to_create = len(available)

        if to_create == 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Nothing to do: batch {batch.id} already has {existing_active} active subscriptions (target {target})."
                )
            )
            return

        created = 0
        skipped = 0
        failed = 0
        seq = 0
        for index in range(to_create):
            lucky_number = available[index]

            # Find the next free username/phone slot (skip any already-created test users).
            while True:
                seq += 1
                username = f"{prefix}-CUST-{seq:03d}"
                phone = str(phone_base + seq)
                if not (
                    User.objects.filter(username=username).exists()
                    or User.objects.filter(phone=phone).exists()
                ):
                    break
                skipped += 1

            try:
                with transaction.atomic():
                    user = User.objects.create_user(
                        username=username,
                        password="TestPass123!",
                        role=UserRole.CUSTOMER,
                        phone=phone,
                        first_name=f"Test{seq:03d}",
                        is_active=True,
                    )
                    customer = Customer.objects.create(
                        user=user,
                        name=f"Test Customer {seq:03d}",
                        phone=phone,
                        kyc_status="PENDING",
                    )
                    create_emi_subscription(
                        customer=customer,
                        product=product,
                        batch=batch,
                        lucky_number=lucky_number,
                        tenure_months=tenure,
                        performed_by=None,
                    )
                created += 1
                if created % 20 == 0:
                    self.stdout.write(f"  …{created} subscriptions created")
            except Exception as exc:  # noqa: BLE001 - report and continue per-customer
                failed += 1
                self.stdout.write(self.style.ERROR(f"  lucky #{lucky_number} ({username}) failed: {exc}"))

        batch.refresh_from_db()
        active_subs = batch.subscriptions.filter(status="ACTIVE").count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. created={created} skipped={skipped} failed={failed} | "
                f"batch {batch.id} ({batch.batch_code}) status={batch.status} "
                f"active_subscriptions={active_subs}/{batch.total_slots} product={product.product_code}"
            )
        )
