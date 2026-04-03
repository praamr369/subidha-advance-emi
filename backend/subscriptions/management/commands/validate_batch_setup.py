from django.core.management.base import BaseCommand, CommandError

from subscriptions.models import Batch
from subscriptions.services.onboarding_validation_service import inspect_batch_setup


def _format_number_list(numbers: list[int], *, limit: int = 20) -> str:
    if not numbers:
        return "none"

    visible = ", ".join(f"{number:02d}" for number in numbers[:limit])
    if len(numbers) > limit:
        return f"{visible} (+{len(numbers) - limit} more)"
    return visible


class Command(BaseCommand):
    help = "Validate batch setup and Lucky ID readiness for live onboarding (read-only)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-id",
            type=int,
            help="Validate one batch by primary key.",
        )
        parser.add_argument(
            "--batch-code",
            type=str,
            help="Validate one batch by batch_code.",
        )
        parser.add_argument(
            "--fail-on-errors",
            action="store_true",
            help="Exit non-zero if any selected batch has onboarding issues.",
        )

    def handle(self, *args, **options):
        batch_id = options.get("batch_id")
        batch_code = (options.get("batch_code") or "").strip()
        fail_on_errors = options["fail_on_errors"]

        queryset = Batch.objects.order_by("id")
        if batch_id:
            queryset = queryset.filter(id=batch_id)
        if batch_code:
            queryset = queryset.filter(batch_code=batch_code.upper())

        batches = list(queryset)
        if not batches:
            raise CommandError("No matching batch was found.")

        flagged_count = 0

        for index, batch in enumerate(batches):
            report = inspect_batch_setup(batch)

            if index:
                self.stdout.write("")

            self.stdout.write(
                f"Batch {report['batch_code']} (id={report['batch_id']})"
            )
            self.stdout.write(f"Status: {report['status']}")
            self.stdout.write(
                f"Slots: {report['total_slots']} | Duration: {report['duration_months']} months | Draw day: {report['draw_day']}"
            )
            self.stdout.write(
                "Lucky IDs: "
                f"total={report['lucky_id_count']} "
                f"available={report['available_lucky_ids']} "
                f"assigned={report['assigned_lucky_ids']} "
                f"won={report['won_lucky_ids']}"
            )
            self.stdout.write(
                f"Subscriptions: {report['subscription_count']} | Draw records: {report['draw_count']}"
            )
            self.stdout.write(
                "Lucky generation expected: "
                f"{'yes' if report['lucky_generation_expected'] else 'no'}"
            )
            self.stdout.write(
                "Lucky generation healthy: "
                f"{'yes' if report['lucky_generation_healthy'] else 'no'}"
            )
            self.stdout.write(
                "Ready for OPEN transition: "
                f"{'yes' if report['ready_for_open_transition'] else 'no'}"
            )
            self.stdout.write(
                f"Missing lucky numbers: {_format_number_list(report['missing_numbers'])}"
            )
            self.stdout.write(
                f"Duplicate lucky numbers: {_format_number_list(report['duplicate_numbers'])}"
            )
            self.stdout.write(
                f"Out-of-range lucky numbers: {_format_number_list(report['invalid_numbers'])}"
            )

            if report["batch_errors"]:
                self.stdout.write("Batch model errors:")
                for field, errors in report["batch_errors"].items():
                    if isinstance(errors, list):
                        message = ", ".join(str(item) for item in errors)
                    else:
                        message = str(errors)
                    self.stdout.write(f"- {field}: {message}")

            if report["issues"]:
                flagged_count += 1
                self.stdout.write("Onboarding issues:")
                for issue in report["issues"]:
                    self.stdout.write(f"- {issue}")
            else:
                self.stdout.write(
                    self.style.SUCCESS("No blocking onboarding issues detected.")
                )

        if fail_on_errors and flagged_count > 0:
            raise CommandError(
                f"{flagged_count} batch(es) failed onboarding validation."
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Batch setup validation completed for {len(batches)} batch(es)."
            )
        )
