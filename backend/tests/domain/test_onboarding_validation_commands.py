from __future__ import annotations

import os
import tempfile
from datetime import date
from decimal import Decimal
from io import StringIO

from django.core.management import call_command, CommandError
from django.test import TestCase

from tests.helpers import (
    create_batch,
    create_customer_profile,
    create_product,
)


class OnboardingValidationCommandTests(TestCase):
    def _write_csv(self, content: str) -> str:
        handle = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            suffix=".csv",
            delete=False,
        )
        self.addCleanup(lambda: os.path.exists(handle.name) and os.unlink(handle.name))
        handle.write(content)
        handle.flush()
        handle.close()
        return handle.name

    def test_validate_customer_import_csv_reports_invalid_rows(self):
        create_customer_profile(
            name="Existing Customer",
            phone="9100000002",
        )
        csv_path = self._write_csv(
            "name,phone,email\n"
            "Valid Customer,9100000001,valid.customer@example.com\n"
            ",9100000003,missing.name@example.com\n"
            "Duplicate Existing,9100000002,duplicate.existing@example.com\n"
        )

        out = StringIO()
        call_command("validate_customer_import_csv", csv_path, stdout=out)
        output = out.getvalue()

        self.assertIn("Customer import validation", output)
        self.assertIn("Rows checked: 3", output)
        self.assertIn("Valid rows: 1", output)
        self.assertIn("Invalid rows: 2", output)
        self.assertIn("customer with this phone already exists", output)

    def test_validate_customer_import_csv_fail_on_errors_exits_non_zero(self):
        csv_path = self._write_csv(
            "name,phone,email\n"
            ",9100000100,invalid.customer@example.com\n"
        )
        out = StringIO()

        with self.assertRaisesMessage(CommandError, "Customer CSV failed validation."):
            call_command(
                "validate_customer_import_csv",
                csv_path,
                "--fail-on-errors",
                stdout=out,
            )

    def test_validate_product_import_csv_reports_create_update_and_invalid_rows(self):
        create_product(
            name="Existing Sofa",
            product_code="EXIST-001",
            base_price=Decimal("45000.00"),
        )
        csv_path = self._write_csv(
            "product_code,name,base_price,category,sub_category,description,image\n"
            "EXIST-001,Existing Sofa,46000.00,Sofa,Living Room,Updated,\n"
            ",New Recliner,55000.00,Sofa,Living Room,New product,\n"
            ",Broken Product,not-a-price,Sofa,Living Room,Invalid,\n"
        )

        out = StringIO()
        call_command("validate_product_import_csv", csv_path, stdout=out)
        output = out.getvalue()

        self.assertIn("Product import validation", output)
        self.assertIn("Create candidates: 1", output)
        self.assertIn("Update candidates: 1", output)
        self.assertIn("Invalid rows: 1", output)
        self.assertIn("invalid base_price 'not-a-price'", output)

    def test_validate_batch_setup_reports_signal_based_lucky_id_health(self):
        batch = create_batch(
            batch_code="ONBOARD2026",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
            status="DRAFT",
        )

        out = StringIO()
        call_command("validate_batch_setup", "--batch-id", str(batch.id), stdout=out)
        output = out.getvalue()

        self.assertIn(f"Batch {batch.batch_code} (id={batch.id})", output)
        self.assertIn("Lucky generation healthy: yes", output)
        self.assertIn("Ready for OPEN transition: yes", output)
        self.assertIn("No blocking onboarding issues detected.", output)

    def test_validate_batch_setup_fail_on_errors_when_lucky_ids_are_missing(self):
        batch = create_batch(
            batch_code="ONBOARDMISS2026",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
            status="DRAFT",
        )
        batch.lucky_ids.filter(lucky_number=99).delete()
        out = StringIO()

        with self.assertRaisesMessage(
            CommandError,
            "1 batch(es) failed onboarding validation.",
        ):
            call_command(
                "validate_batch_setup",
                "--batch-id",
                str(batch.id),
                "--fail-on-errors",
                stdout=out,
            )
