from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand
from django.db import transaction

from subscriptions.models import Commission, Payment
from subscriptions.services.commission_service import create_commission_for_payment


def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.00")


def _is_payment_reversed(payment) -> bool:
    metadata = getattr(payment, "allocation_metadata", {}) or {}
    reversal = metadata.get("reversal", {}) or {}
    return bool(reversal.get("is_reversed"))


class Command(BaseCommand):
    help = (
        "Backfill missing commission records from existing payments. "
        "This is safe to run multiple times."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--payment-id",
            type=int,
            dest="payment_id",
            help="Process only one payment id.",
        )
        parser.add_argument(
            "--partner-id",
            type=int,
            dest="partner_id",
            help="Process only payments for a single partner id.",
        )
        parser.add_argument(
            "--verified-only",
            action="store_true",
            dest="verified_only",
            help="Only include payments that have been verified by an admin.",
        )
        parser.add_argument(
            "--date-from",
            type=str,
            dest="date_from",
            help="Include payments on or after this date (YYYY-MM-DD).",
        )
        parser.add_argument(
            "--date-to",
            type=str,
            dest="date_to",
            help="Include payments on or before this date (YYYY-MM-DD).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            dest="dry_run",
            help="Inspect and print what would change without saving.",
        )

    def handle(self, *args, **options):
        payment_id = options.get("payment_id")
        partner_id = options.get("partner_id")
        verified_only = options.get("verified_only", False)
        date_from = options.get("date_from")
        date_to = options.get("date_to")
        dry_run = options.get("dry_run", False)

        queryset = (
            Payment.objects.select_related(
                "subscription",
                "subscription__partner",
                "emi",
                "collected_by",
                "verified_by",
            )
            .filter(subscription__partner__isnull=False)
            .filter(commission__isnull=True)
            .order_by("id")
        )

        if payment_id:
            queryset = queryset.filter(id=payment_id)

        if partner_id:
            queryset = queryset.filter(subscription__partner_id=partner_id)

        if verified_only:
            queryset = queryset.filter(verified_by__isnull=False)

        if date_from:
            queryset = queryset.filter(payment_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(payment_date__lte=date_to)

        total = queryset.count()
        created = 0
        skipped = 0
        skipped_zero_rate = 0
        skipped_reversed = 0
        skipped_non_partner = 0

        for payment in queryset:
            partner = getattr(payment.subscription, "partner", None)
            if not partner:
                skipped += 1
                continue

            if getattr(partner, "role", None) != "PARTNER":
                skipped_non_partner += 1
                continue

            if _is_payment_reversed(payment):
                skipped_reversed += 1
                continue

            rate = _to_decimal(getattr(partner, "commission_rate", 0))
            if rate <= Decimal("0.00"):
                skipped_zero_rate += 1
                continue

            if dry_run:
                created += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"[DRY-RUN] would create commission for payment #{payment.id}"
                    )
                )
                continue

            with transaction.atomic():
                result = create_commission_for_payment(
                    payment=payment,
                    actor=payment.verified_by or payment.collected_by,
                )

            if result.get("created"):
                created += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[CREATED] commission for payment #{payment.id}"
                    )
                )
            else:
                skipped += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"[SKIP] payment #{payment.id}: commission already exists or not eligible."
                    )
                )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Backfill summary"))
        self.stdout.write(f"Eligible payments checked : {total}")
        self.stdout.write(f"Commissions created       : {created}")
        self.stdout.write(f"Skipped (already/other)   : {skipped}")
        self.stdout.write(f"Skipped (zero rate)       : {skipped_zero_rate}")
        self.stdout.write(f"Skipped (reversed)        : {skipped_reversed}")
        self.stdout.write(f"Skipped (non-partner)     : {skipped_non_partner}")
