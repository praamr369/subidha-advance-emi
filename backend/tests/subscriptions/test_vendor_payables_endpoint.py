"""Admin vendor payables endpoint — the vendor bill drawer's "vendor payables".

Ledger convention (procurement_service): a posted bill is a debit and a
payment/settlement is a credit, so the payable balance is debit − credit.
"""
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import Vendor, VendorLedgerEntry
from tests.helpers import create_admin_user


class AdminVendorPayablesEndpointTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="vendor_payables_admin", phone="9107000001")
        self.client.force_authenticate(user=self.admin)
        self.vendor = Vendor.objects.create(name="Payables Plywood Traders")
        VendorLedgerEntry.objects.create(
            vendor=self.vendor,
            entry_type="PURCHASE_BILL",
            source_type="VENDOR_BILL",
            debit=Decimal("10000.00"),
            balance_after=Decimal("10000.00"),
        )
        VendorLedgerEntry.objects.create(
            vendor=self.vendor,
            entry_type="PAYMENT_TO_VENDOR",
            source_type="VENDOR_PAYMENT",
            credit=Decimal("4000.00"),
            balance_after=Decimal("6000.00"),
        )

    def test_returns_billed_paid_and_payable(self):
        response = self.client.get(f"/api/v1/admin/vendors/{self.vendor.id}/payables/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        self.assertEqual(response.data["billed"], "10000.00")
        self.assertEqual(response.data["paid"], "4000.00")
        self.assertEqual(response.data["payable"], "6000.00")
        self.assertEqual(response.data["advance"], "0.00")
        self.assertIsNotNone(response.data["last_bill_date"])
        self.assertIsNotNone(response.data["last_payment_date"])

    def test_unknown_vendor_is_404(self):
        response = self.client.get("/api/v1/admin/vendors/999999/payables/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
