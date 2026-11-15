from datetime import date
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)
from billing.services.billing_service import create_direct_sale
from billing.services.direct_sale_signing_service import (
    generate_direct_sale_signing_token,
    verify_direct_sale_signing_token,
)
from inventory.models import InventoryItem
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_product,
    ensure_document_numbering_profile_for_date,
    ensure_test_accounting_posting_prerequisites,
)

_SALE_DATE = date(2026, 11, 3)


class DirectSaleDigitalSignatureTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="direct_sale_sig_admin",
            phone="9388000002",
        )
        _today = timezone.localdate()
        ensure_test_accounting_posting_prerequisites(_SALE_DATE, performed_by=self.admin)
        if _today != _SALE_DATE:
            ensure_test_accounting_posting_prerequisites(_today, performed_by=self.admin)
        for doc_type in ("DIRECT_SALE", "TAX_INVOICE", "DIRECT_SALE_RECEIPT", "JOURNAL_ENTRY"):
            ensure_document_numbering_profile_for_date(doc_type, _SALE_DATE, performed_by=self.admin)
            if _today != _SALE_DATE:
                ensure_document_numbering_profile_for_date(doc_type, _today, performed_by=self.admin)

        self.customer = create_customer_profile(
            name="Signing Customer",
            phone="7388000002",
        )
        self.product = create_product(
            name="Dining Table Set",
            product_code="DT-SET-001",
            base_price=Decimal("25000.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="DT-SET-SKU-001",
            opening_stock_qty=Decimal("10.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("15000.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="SIG-CASH-001",
            name="Direct Sale Sign Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Signature Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=self.cash_account,
            chart_account=cash_chart,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        )

        payload = {
            "sale_date": _SALE_DATE,
            "customer": self.customer,
            "tax_mode": "NON_GST",
            "finance_account": self.cash_account,
            "delivery_required": False,
            "delivery_reference": "",
            "received_total": Decimal("25000.00"),
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "notes": "Direct sale invoice ready for signature.",
            "lines": [
                {
                    "product": self.product,
                    "inventory_item": self.inventory_item,
                    "description": "Solid Wood Dining Table Set",
                    "quantity": Decimal("1.000"),
                    "unit_price": Decimal("25000.00"),
                    "discount_amount": Decimal("0.00"),
                    "taxable_value": Decimal("25000.00"),
                    "gst_rate": None,
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "line_total": Decimal("25000.00"),
                    "hsn_sac_code": "",
                }
            ],
        }

        self.sale = create_direct_sale(
            payload=payload,
            created_by=self.admin,
        )
        self.sample_png_data = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )

    def test_token_generation_and_verification(self):
        token = generate_direct_sale_signing_token(self.sale.id)
        self.assertTrue(len(token) > 10)
        verified_id = verify_direct_sale_signing_token(token)
        self.assertEqual(verified_id, self.sale.id)

    def test_admin_signing_link_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/billing/direct-sales/{self.sale.id}/signing-link/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertIn("token", res.data)
        self.assertIn("/sign-invoice/", res.data["signing_path"])
        self.assertEqual(res.data["customer_name"], "Signing Customer")
        self.assertFalse(res.data["has_signature"])

    def test_public_view_and_sign_flow(self):
        token = generate_direct_sale_signing_token(self.sale.id)

        # Public / smartphone user views summary (unauthenticated)
        self.client.logout()
        get_res = self.client.get(f"/api/v1/public/direct-sales/sign/{token}/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["customer_name"], "Signing Customer")
        self.assertEqual(get_res.data["grand_total"], "25000.00")
        self.assertFalse(get_res.data["authorized_signed"])

        # Public / smartphone user submits touchscreen signature
        post_res = self.client.post(
            f"/api/v1/public/direct-sales/sign/{token}/",
            data={
                "signature_data": self.sample_png_data,
                "signer_type": "AUTHORIZED",
                "signer_name": "Store Manager",
            },
            format="json",
        )
        self.assertEqual(post_res.status_code, status.HTTP_200_OK)
        self.assertTrue(post_res.data["success"])

        # Verify DB updated
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.authorized_signature, self.sample_png_data)
        self.assertIsNotNone(self.sale.authorized_signed_at)
        self.assertEqual(self.sale.signature_metadata["authorized"]["signer_type"], "AUTHORIZED")

    def test_admin_counter_desktop_sign_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        post_res = self.client.post(
            f"/api/v1/billing/direct-sales/{self.sale.id}/sign/",
            data={
                "signature_data": self.sample_png_data,
                "signer_type": "BOTH",
                "signer_name": "Counter Operator",
            },
            format="json",
        )
        self.assertEqual(post_res.status_code, status.HTTP_200_OK)
        self.assertTrue(post_res.data["authorized_signed"])
        self.assertTrue(post_res.data["customer_signed"])

        self.sale.refresh_from_db()
        self.assertEqual(self.sale.authorized_signature, self.sample_png_data)
        self.assertEqual(self.sale.customer_signature, self.sample_png_data)

    def test_dual_independent_signatures_and_recall_flow(self):
        token = generate_direct_sale_signing_token(self.sale.id)

        # 1. Customer signs via public mobile link with default or CUSTOMER role
        cust_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGAC4mBAMb5ZupAAAAAElFTkSuQmCC"
        post_res = self.client.post(
            f"/api/v1/public/direct-sales/sign/{token}/",
            data={
                "signature_data": cust_png,
                "signer_type": "CUSTOMER",
                "signer_name": "Signing Customer",
            },
            format="json",
        )
        self.assertEqual(post_res.status_code, status.HTTP_200_OK)
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.customer_signature, cust_png)
        self.assertEqual(self.sale.authorized_signature, "")

        # 2. Store owner/admin signs via counter/desktop modal as AUTHORIZED
        self.client.force_authenticate(user=self.admin)
        store_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAGElEQVR42mNk+M9QzwAFjDAGBiYoBwB4twb1p8e8eQAAAABJRU5ErkJggg=="
        auth_res = self.client.post(
            f"/api/v1/billing/direct-sales/{self.sale.id}/sign/",
            data={
                "signature_data": store_png,
                "signer_type": "AUTHORIZED",
                "signer_name": "Roy (Owner)",
            },
            format="json",
        )
        self.assertEqual(auth_res.status_code, status.HTTP_200_OK)

        # 3. VERIFY BOTH SIGNATURES COEXIST - CUSTOMER SIGNATURE WAS NOT OVERWRITTEN!
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.customer_signature, cust_png)
        self.assertEqual(self.sale.authorized_signature, store_png)
        self.assertTrue(auth_res.data["authorized_signed"])
        self.assertTrue(auth_res.data["customer_signed"])
        self.assertGreaterEqual(len(auth_res.data["signature_history"]), 2)

        # 4. Test Recall Endpoint: swap signatures
        swap_res = self.client.post(
            f"/api/v1/billing/direct-sales/{self.sale.id}/recall-signature/",
            data={"action": "swap"},
            format="json",
        )
        self.assertEqual(swap_res.status_code, status.HTTP_200_OK)
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.customer_signature, store_png)
        self.assertEqual(self.sale.authorized_signature, cust_png)

        # Swap back
        swap_back_res = self.client.post(
            f"/api/v1/billing/direct-sales/{self.sale.id}/recall-signature/",
            data={"action": "swap"},
            format="json",
        )
        self.assertEqual(swap_back_res.status_code, status.HTTP_200_OK)
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.customer_signature, cust_png)
        self.assertEqual(self.sale.authorized_signature, store_png)

    def test_recall_assign_to_customer_when_accidentally_saved_as_authorized(self):
        # Scenario where a signature was saved as authorized (e.g. customer signed under wrong role)
        self.client.force_authenticate(user=self.admin)
        cust_accidental_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        self.client.post(
            f"/api/v1/billing/direct-sales/{self.sale.id}/sign/",
            data={
                "signature_data": cust_accidental_png,
                "signer_type": "AUTHORIZED",
                "signer_name": "Customer by mistake",
            },
            format="json",
        )
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.authorized_signature, cust_accidental_png)
        self.assertEqual(self.sale.customer_signature, "")

        # Call recall action: assign_to_customer
        recall_res = self.client.post(
            f"/api/v1/billing/direct-sales/{self.sale.id}/recall-signature/",
            data={"action": "assign_to_customer"},
            format="json",
        )
        self.assertEqual(recall_res.status_code, status.HTTP_200_OK)
        self.sale.refresh_from_db()
        # Customer signature now has the signature, authorized is cleared so owner can sign
        self.assertEqual(self.sale.customer_signature, cust_accidental_png)
        self.assertEqual(self.sale.authorized_signature, "")
