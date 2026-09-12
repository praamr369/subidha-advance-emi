"""Catalog product posture — the inventory/product profile's per-plan breakdown.

A direct sale can hold several products, so a product's direct-sale value must
come from its own sale lines, and the sale's received/balance must be allocated
pro-rata by that product's share of the sale's grand total. Cancelled sales are
excluded. Rows are inserted with bulk_create on purpose: the function under test
only reads totals, and this keeps the test independent of sale-number generation
and line validation.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import DocumentSequence, FinancialYear
from billing.models import DirectSale, DirectSaleLine
from customers.services.customer_account_service import build_catalog_product_posture
from tests.helpers import create_product


class CatalogProductPostureTests(TestCase):
    def setUp(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.series = DocumentSequence.objects.create(
            series_code="DS-2026-27",
            document_type="DIRECT_SALE",
            financial_year="2026-27",
            financial_year_ref=financial_year,
            prefix="DS",
            pattern="DS/{FY}/{number}",
            next_number=1,
        )
        self.product_a = create_product(
            name="Posture Teak Table", product_code="POSTURE-A", base_price=Decimal("6000.00")
        )
        self.product_b = create_product(
            name="Posture Teak Chair", product_code="POSTURE-B", base_price=Decimal("4000.00")
        )

    def _sale(self, *, sale_no: str, status: str, grand: str, received: str, balance: str):
        return DirectSale.objects.bulk_create(
            [
                DirectSale(
                    sale_no=sale_no,
                    sale_date=date(2026, 9, 1),
                    financial_year="2026-27",
                    doc_series=self.series,
                    status=status,
                    grand_total=Decimal(grand),
                    received_total=Decimal(received),
                    balance_total=Decimal(balance),
                )
            ]
        )[0]

    def _line(self, sale, product, *, qty: str, total: str):
        DirectSaleLine.objects.bulk_create(
            [
                DirectSaleLine(
                    direct_sale=sale,
                    product=product,
                    description=product.name,
                    quantity=Decimal(qty),
                    unit_price=Decimal(total) / Decimal(qty),
                    taxable_value=Decimal(total),
                    line_total=Decimal(total),
                )
            ]
        )

    def test_mixed_sale_is_allocated_pro_rata_and_cancelled_sale_excluded(self):
        mixed = self._sale(
            sale_no="DS-POSTURE-1", status="DRAFT", grand="10000.00", received="5000.00", balance="5000.00"
        )
        self._line(mixed, self.product_a, qty="2", total="6000.00")
        self._line(mixed, self.product_b, qty="1", total="4000.00")
        cancelled = self._sale(
            sale_no="DS-POSTURE-2", status="CANCELLED", grand="6000.00", received="0.00", balance="6000.00"
        )
        self._line(cancelled, self.product_a, qty="2", total="6000.00")

        posture = build_catalog_product_posture(self.product_a.id)

        direct = posture["direct_sale"]
        self.assertEqual(direct["count"], 1)
        self.assertEqual(direct["value"], "6000.00")
        self.assertEqual(direct["paid"], "3000.00")
        self.assertEqual(direct["due"], "3000.00")
        self.assertEqual(direct["units_sold"], "2")
        self.assertEqual(direct["allocation"], "PRO_RATA_BY_LINE_VALUE")
        self.assertEqual(posture["totals"]["value"], "6000.00")
        self.assertEqual(posture["advance_emi"]["count"], 0)
        self.assertEqual(posture["rent_lease"]["count"], 0)

    def test_product_with_no_sales_or_contracts_is_all_zero(self):
        posture = build_catalog_product_posture(self.product_b.id)

        self.assertEqual(posture["direct_sale"]["count"], 0)
        self.assertEqual(posture["direct_sale"]["value"], "0.00")
        self.assertEqual(posture["totals"]["active_count"], 0)
