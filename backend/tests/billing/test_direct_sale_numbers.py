"""
Direct Sale Numbering Tests

Verifies that:
1. New direct sales receive a unique, non-null SALE number via the billing service.
2. Two direct sales never share the same sale_no (unique constraint + sequence logic).
3. assign_direct_sale_number is idempotent — calling it on a sale that already
   has a sale_no returns the existing number without modifying it.
4. assign_direct_sale_number correctly backfills a null-sale_no row by delegating
   to the billing DocumentSequence mechanism.
5. The backfill management command processes null-sale_no rows correctly.
6. Double-submit at the service layer produces distinct sale numbers (no duplicate).
"""
from __future__ import annotations

import datetime
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from django.utils.crypto import get_random_string

from accounts.models import User, UserRole
from billing.models import DirectSale, DirectSaleStatus
from billing.services.billing_service import (
    _ensure_direct_sale_sequence,
    create_direct_sale,
)
from subscriptions.services.contract_number_service import assign_direct_sale_number


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _make_admin() -> User:
    phone = f"+91{get_random_string(10, '1234567890')}"
    return User.objects.create_user(
        username=f"u_{get_random_string(8)}",
        password="pass",
        role=UserRole.ADMIN,
        phone=phone,
    )


def _minimal_payload(sale_date: datetime.date | None = None) -> dict:
    """Return the minimal payload accepted by create_direct_sale."""
    today = sale_date or timezone.localdate()
    return {
        "sale_date": today,
        "customer_name_snapshot": "Walk-In Customer",
        "lines": [],
    }


# ---------------------------------------------------------------------------
# 1. New direct sales receive a unique SALE number
# ---------------------------------------------------------------------------

class DirectSaleNumberAssignmentTests(TestCase):
    def setUp(self):
        self.admin = _make_admin()

    def test_create_direct_sale_assigns_sale_no(self):
        """create_direct_sale always populates sale_no."""
        sale = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        self.assertIsNotNone(sale.sale_no)
        self.assertNotEqual(sale.sale_no, "")

    def test_sale_no_starts_with_sale_prefix(self):
        """sale_no is prefixed with SALE-."""
        sale = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        self.assertTrue(
            sale.sale_no.startswith("SALE-"),
            f"Expected sale_no to start with 'SALE-', got {sale.sale_no!r}",
        )

    def test_two_sales_have_different_numbers(self):
        """Two direct sales created in the same request context never share a sale_no."""
        sale1 = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        sale2 = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        self.assertNotEqual(sale1.sale_no, sale2.sale_no)

    def test_sale_no_is_unique_in_database(self):
        """sale_no has a unique constraint — duplicate values are rejected on save."""
        from django.core.exceptions import ValidationError

        sale1 = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        seq = _ensure_direct_sale_sequence(timezone.localdate())
        dup = DirectSale(
            sale_no=sale1.sale_no,  # duplicate
            sale_date=timezone.localdate(),
            financial_year="2025-26",
            doc_series=seq,
            status=DirectSaleStatus.DRAFT,
            customer_name_snapshot="Walk-In Customer",
        )
        with self.assertRaises(ValidationError):
            dup.full_clean()


# ---------------------------------------------------------------------------
# 2. Idempotency of assign_direct_sale_number
# ---------------------------------------------------------------------------

class AssignDirectSaleNumberIdempotencyTests(TestCase):
    def setUp(self):
        self.admin = _make_admin()

    def test_idempotent_when_sale_no_already_set(self):
        """Calling assign_direct_sale_number on a sale that already has a number
        returns the existing number and does NOT change it."""
        sale = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        original_number = sale.sale_no
        self.assertIsNotNone(original_number)

        returned = assign_direct_sale_number(sale)

        self.assertEqual(returned, original_number, "Number must not change on second call")
        sale.refresh_from_db()
        self.assertEqual(sale.sale_no, original_number, "Database value must not change")

    def test_idempotent_called_multiple_times(self):
        """Multiple calls to assign_direct_sale_number all return the same value."""
        sale = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        first = assign_direct_sale_number(sale)
        second = assign_direct_sale_number(sale)
        third = assign_direct_sale_number(sale)
        self.assertEqual(first, second)
        self.assertEqual(second, third)


# ---------------------------------------------------------------------------
# 3. Backfill of null-sale_no legacy rows
# ---------------------------------------------------------------------------

class BackfillNullSaleNoTests(TestCase):
    def setUp(self):
        self.admin = _make_admin()

    def _create_null_sale_no_row(self) -> DirectSale:
        """Create a DirectSale row with sale_no=NULL (simulates legacy data)."""
        seq = _ensure_direct_sale_sequence(timezone.localdate())
        return DirectSale.objects.create(
            sale_no=None,
            sale_date=timezone.localdate(),
            financial_year="2025-26",
            doc_series=seq,
            status=DirectSaleStatus.DRAFT,
            customer_name_snapshot="Walk-In Customer",
        )

    def test_assign_direct_sale_number_fills_null_row(self):
        """assign_direct_sale_number assigns a SALE number to a null-sale_no row."""
        sale = self._create_null_sale_no_row()
        self.assertIsNone(sale.sale_no)

        number = assign_direct_sale_number(sale)

        self.assertIsNotNone(number)
        self.assertTrue(number.startswith("SALE-"), f"Got {number!r}")
        sale.refresh_from_db()
        self.assertEqual(sale.sale_no, number)

    def test_two_null_rows_get_different_numbers(self):
        """Two separate null-sale_no rows each receive a unique number."""
        sale1 = self._create_null_sale_no_row()
        sale2 = self._create_null_sale_no_row()

        n1 = assign_direct_sale_number(sale1)
        n2 = assign_direct_sale_number(sale2)

        self.assertNotEqual(n1, n2)

    def test_backfill_management_command_dry_run(self):
        """Management command dry-run reports rows to backfill without committing."""
        sale = self._create_null_sale_no_row()
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("backfill_direct_sale_numbers", dry_run=True, stdout=out)
        output = out.getvalue()

        self.assertIn("DRY RUN", output)
        # The row must NOT have been updated
        sale.refresh_from_db()
        self.assertIsNone(sale.sale_no)

    def test_backfill_management_command_assigns_numbers(self):
        """Management command assigns numbers to all null-sale_no rows."""
        sale1 = self._create_null_sale_no_row()
        sale2 = self._create_null_sale_no_row()

        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("backfill_direct_sale_numbers", stdout=out)
        output = out.getvalue()

        sale1.refresh_from_db()
        sale2.refresh_from_db()

        self.assertIsNotNone(sale1.sale_no)
        self.assertIsNotNone(sale2.sale_no)
        self.assertNotEqual(sale1.sale_no, sale2.sale_no)
        self.assertIn("Assigned", output)

    def test_backfill_command_is_idempotent(self):
        """Running the backfill command twice does not change already-assigned numbers."""
        sale = self._create_null_sale_no_row()

        from django.core.management import call_command
        from io import StringIO

        call_command("backfill_direct_sale_numbers", stdout=StringIO())
        sale.refresh_from_db()
        first_number = sale.sale_no
        self.assertIsNotNone(first_number)

        # Run again — should be a no-op
        out = StringIO()
        call_command("backfill_direct_sale_numbers", stdout=out)
        sale.refresh_from_db()
        self.assertEqual(sale.sale_no, first_number)
        self.assertIn("Nothing to do", out.getvalue())


# ---------------------------------------------------------------------------
# 4. Double-submit at service layer produces distinct numbers
# ---------------------------------------------------------------------------

class DoubleSubmitProtectionTests(TestCase):
    """Simulates a double-click / duplicate POST scenario at the service layer.

    Since create_direct_sale uses SELECT FOR UPDATE on DocumentSequence, two
    concurrent calls will each receive a distinct sequence number.  There is no
    shared mutable state between the two calls beyond the sequence counter.
    The test verifies the resulting sale_no values are distinct.
    """

    def setUp(self):
        self.admin = _make_admin()

    def test_sequential_double_submit_produces_unique_numbers(self):
        """Two sequential create_direct_sale calls yield distinct sale numbers."""
        sale1 = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        sale2 = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        self.assertNotEqual(sale1.sale_no, sale2.sale_no)
        self.assertIsNotNone(sale1.sale_no)
        self.assertIsNotNone(sale2.sale_no)

    def test_sale_no_not_changed_by_update_direct_sale(self):
        """update_direct_sale with a notes-only payload does not alter sale_no."""
        from billing.services.billing_service import update_direct_sale

        sale = create_direct_sale(payload=_minimal_payload(), created_by=self.admin)
        original_no = sale.sale_no
        self.assertIsNotNone(original_no)

        # Update a non-financial field only; sale_no must remain unchanged.
        update_direct_sale(
            direct_sale_id=sale.id,
            payload={"notes": "Updated note"},
            updated_by=self.admin,
        )
        sale.refresh_from_db()
        self.assertEqual(sale.sale_no, original_no)
