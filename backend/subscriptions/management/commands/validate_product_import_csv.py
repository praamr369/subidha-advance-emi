from django.core.management.base import BaseCommand, CommandError

from subscriptions.services.onboarding_validation_service import (
    load_csv_rows,
    missing_product_headers,
    summarize_product_import_validation,
    validate_product_import_rows,
)


class Command(BaseCommand):
    help = "Validate a product onboarding CSV against the current admin import contract (read-only)."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="Path to the product CSV file.")
        parser.add_argument(
            "--fail-on-errors",
            action="store_true",
            help="Exit non-zero if the CSV has missing headers or invalid rows.",
        )

    def handle(self, *args, **options):
        csv_path = options["csv_path"]
        fail_on_errors = options["fail_on_errors"]

        try:
            headers, rows = load_csv_rows(csv_path)
        except (OSError, UnicodeDecodeError) as exc:
            raise CommandError(f"Unable to read CSV file: {exc}") from exc

        missing_headers = missing_product_headers(headers)

        self.stdout.write("Product import validation")
        self.stdout.write(f"Path: {csv_path}")
        self.stdout.write(
            f"Detected headers: {', '.join(headers) if headers else '(none)'}"
        )

        if missing_headers:
            self.stdout.write(
                self.style.ERROR(
                    f"Missing required headers: {', '.join(missing_headers)}"
                )
            )
            if fail_on_errors:
                raise CommandError("Product CSV is missing required headers.")
            return

        validation_rows = validate_product_import_rows(rows)
        summary = summarize_product_import_validation(headers, validation_rows)

        self.stdout.write(f"Rows checked: {summary['row_count']}")
        self.stdout.write(f"Create candidates: {summary['create_candidates']}")
        self.stdout.write(f"Update candidates: {summary['update_candidates']}")
        self.stdout.write(f"Invalid rows: {summary['invalid_count']}")

        invalid_rows = summary["invalid_rows"]
        if invalid_rows:
            self.stdout.write("")
            self.stdout.write("Invalid row details:")
            for row in invalid_rows[:20]:
                name = row["name"] or "—"
                errors = ", ".join(row["errors"])
                self.stdout.write(
                    f"- Row {row['row_number']} (name: {name}): {errors}"
                )

        if fail_on_errors and summary["invalid_count"] > 0:
            raise CommandError("Product CSV failed validation.")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Product CSV validation completed."))
