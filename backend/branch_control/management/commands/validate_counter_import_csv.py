from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from branch_control.services.import_service import preview_counter_import


class Command(BaseCommand):
    help = "Validate a counter import CSV against the current preview-first import contract (read-only)."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="Path to the counter CSV file.")
        parser.add_argument(
            "--fail-on-errors",
            action="store_true",
            help="Exit non-zero if the CSV contains invalid rows.",
        )

    def handle(self, *args, **options):
        csv_path = options["csv_path"]
        fail_on_errors = options["fail_on_errors"]

        try:
            csv_text = Path(csv_path).read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError) as exc:
            raise CommandError(f"Unable to read CSV file: {exc}") from exc

        preview = preview_counter_import(csv_text)
        row_count = preview["valid_count"] + preview["invalid_count"]
        self.stdout.write("Counter import validation")
        self.stdout.write(f"Path: {csv_path}")
        self.stdout.write(
            f"Detected headers: {', '.join(preview['columns']) if preview['columns'] else '(none)'}"
        )
        self.stdout.write(f"Rows checked: {row_count}")
        self.stdout.write(f"Valid rows: {preview['valid_count']}")
        self.stdout.write(f"Invalid rows: {preview['invalid_count']}")

        if preview["errors"]:
            self.stdout.write("")
            self.stdout.write("Invalid row details:")
            for row in preview["errors"][:20]:
                identifier = row.get("code") or row.get("branch_code") or row.get("name") or "—"
                self.stdout.write(
                    f"- Row {row['row_number']} ({identifier}): {', '.join(row['errors'])}"
                )

        if fail_on_errors and preview["invalid_count"] > 0:
            raise CommandError("Counter CSV failed validation.")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Counter CSV validation completed."))
