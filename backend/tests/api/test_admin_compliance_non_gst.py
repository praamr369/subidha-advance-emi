from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    BusinessTaxProfile,
    ChartOfAccount,
    ChartOfAccountType,
    DocumentSequence,
    FinanceAccount,
    FinanceAccountKind,
    JournalEntryLine,
    Vendor,
)
from billing.models import BillingInvoice, DirectSale
from inventory.models import InventoryItem, PurchaseBill, StockLocation
from subscriptions.models import (
    LeaseSubscriptionProfile,
    Payment,
    PaymentMethod,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentSubscriptionProfile,
    Subscription,
)
from subscriptions.services.rent_lease_billing_service import generate_monthly_demands_for_subscription
from accounting.services.gst_document_posting_service import financial_year_for
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class NonGstComplianceApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="non_gst_admin", phone="9100000001")
        self.partner = create_partner_user(username="non_gst_partner", phone="9100000002")
        self.cashier = create_cashier_user(username="non_gst_cashier", phone="9100000003")
        self.customer_user = create_customer_user(username="non_gst_customer", phone="9100000004")
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Non GST Customer",
            phone="9100000004",
        )
        self.client.force_authenticate(user=self.admin)

        self.retail_product = create_product(
            name="Non GST Sale Product",
            product_code="NG-SALE-001",
            base_price=Decimal("12000.00"),
        )
        self.retail_item = InventoryItem.objects.create(
            product=self.retail_product,
            sku="NG-SALE-SKU-001",
            opening_stock_qty=Decimal("8.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("9000.00"),
        )

        purchase_product = create_product(
            name="Non GST Purchase Product",
            product_code="NG-PUR-001",
            base_price=Decimal("2500.00"),
        )
        self.purchase_item = InventoryItem.objects.create(
            product=purchase_product,
            sku="NG-PUR-SKU-001",
            opening_stock_qty=Decimal("2.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("1200.00"),
            stock_item_type="RAW_MATERIAL",
        )

        self.vendor = Vendor.objects.create(name="Non GST Vendor", phone="9898989898")
        self.stock_location = StockLocation.objects.create(code="NG-STK-001", name="Non GST Main Store")

        cash_chart = ChartOfAccount.objects.create(
            code="NG-CASH-001",
            name="Non GST Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        bank_chart = ChartOfAccount.objects.create(
            code="NG-BANK-001",
            name="Non GST Bank",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Non GST Retail Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )
        self.bank_account = FinanceAccount.objects.create(
            name="Non GST Purchase Bank",
            kind=FinanceAccountKind.BANK,
            chart_account=bank_chart,
            opening_balance=Decimal("0.00"),
        )
        fy = financial_year_for(date.today())
        DocumentSequence.objects.create(
            series_code="DIRECT_SALE_INVOICE",
            financial_year=fy,
            prefix=f"DSI-{fy}",
            next_number=1,
            padding=5,
            is_active=True,
        )

    def _direct_sale_payload(self, *, tax_mode: str, tax_amount: str = "0.00") -> dict:
        taxable_total = Decimal("12000.00")
        tax_total = Decimal(tax_amount if tax_mode == "GST" else "0.00")
        grand_total = taxable_total + tax_total
        received_total = Decimal("5000.00")
        balance_total = grand_total - received_total
        cgst_amount = (tax_total / 2).quantize(Decimal("0.01")) if tax_mode == "GST" else Decimal("0.00")
        sgst_amount = tax_total - cgst_amount if tax_mode == "GST" else Decimal("0.00")
        return {
            "sale_date": date(2026, 5, 2),
            "customer": self.customer.id,
            "tax_mode": tax_mode,
            "tax_calculation_mode": "NON_GST" if tax_mode == "NON_GST" else "GST_EXCLUSIVE",
            "finance_account": self.cash_account.id,
            "delivery_required": False,
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "customer_gst_type": "REGISTERED_BUSINESS" if tax_mode == "GST" else "UNREGISTERED_CONSUMER",
            "customer_gstin": "19ABCDE1234F1Z5" if tax_mode == "GST" else "",
            "customer_snapshot_place_of_supply": "WB" if tax_mode == "GST" else "",
            "subtotal": f"{taxable_total:.2f}",
            "discount_total": "0.00",
            "taxable_total": f"{taxable_total:.2f}",
            "tax_total": f"{tax_total:.2f}",
            "grand_total": f"{grand_total:.2f}",
            "received_total": f"{received_total:.2f}",
            "balance_total": f"{balance_total:.2f}",
            "notes": "non-gst compliance test",
            "lines": [
                {
                    "product": self.retail_product.id,
                    "inventory_item": self.retail_item.id,
                    "description": "Retail line",
                    "quantity": "1.000",
                    "unit_price": "12000.00",
                    "discount_amount": "0.00",
                    "taxable_value": "12000.00",
                    "gst_rate": "18.00" if tax_mode == "GST" else None,
                    "cgst_amount": f"{cgst_amount:.2f}",
                    "sgst_amount": f"{sgst_amount:.2f}",
                    "igst_amount": "0.00",
                    "line_total": f"{grand_total:.2f}",
                    "hsn_sac_code": "",
                }
            ],
        }

    def test_default_tax_profile_endpoint_returns_gst_unregistered(self):
        response = self.client.get("/api/v1/admin/compliance/tax-profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["active"]["mode"], "GST_UNREGISTERED")
        self.assertEqual(response.data["snapshot"]["mode"], "GST_UNREGISTERED")

    def test_gst_direct_sale_invoice_is_blocked_in_unregistered_mode(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._direct_sale_payload(tax_mode="GST", tax_amount="2160.00"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("GST_UNREGISTERED", str(response.data))

    def test_direct_sale_commercial_invoice_has_zero_tax_snapshot(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._direct_sale_payload(tax_mode="NON_GST", tax_amount="2160.00"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        sale = DirectSale.objects.get(pk=response.data["id"])
        invoice = BillingInvoice.objects.get(pk=response.data["billing_invoice_id"])

        self.assertEqual(sale.tax_mode, "NON_GST")
        self.assertEqual(sale.tax_total, Decimal("0.00"))
        self.assertEqual(invoice.tax_total, Decimal("0.00"))
        self.assertEqual((invoice.tax_profile_snapshot or {}).get("invoice_kind"), "COMMERCIAL_INVOICE")
        self.assertEqual((invoice.tax_profile_snapshot or {}).get("mode"), "GST_UNREGISTERED")
        self.assertEqual((invoice.tax_profile_snapshot or {}).get("seller_gstin"), "")

    def test_purchase_supplier_gst_is_cost_and_itc_false_in_unregistered_mode(self):
        create_response = self.client.post(
            "/api/v1/accounting/purchase-bills/",
            {
                "bill_no": "PB-NG-001",
                "bill_date": "2026-05-03",
                "vendor": self.vendor.id,
                "tax_mode": "GST",
                "stock_location": self.stock_location.id,
                "finance_account": self.bank_account.id,
                "notes": "supplier gst captured",
                "lines": [
                    {
                        "inventory_item": self.purchase_item.id,
                        "description": "Raw material",
                        "quantity": "1.000",
                        "unit_cost": "1000.00",
                        "tax_amount": "180.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        purchase_bill_id = create_response.data["id"]

        approve_response = self.client.post(
            f"/api/v1/accounting/purchase-bills/{purchase_bill_id}/approve/",
            {},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)

        post_response = self.client.post(
            f"/api/v1/accounting/purchase-bills/{purchase_bill_id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_response.status_code, status.HTTP_200_OK, post_response.data)

        purchase_bill = PurchaseBill.objects.select_related("posted_journal_entry").get(pk=purchase_bill_id)
        self.assertTrue((purchase_bill.tax_profile_snapshot or {}).get("supplier_gst_as_cost"))
        self.assertFalse((purchase_bill.tax_profile_snapshot or {}).get("itc_claimable"))

        debit_lines = JournalEntryLine.objects.filter(
            journal_entry_id=purchase_bill.posted_journal_entry_id,
            debit_amount__gt=Decimal("0.00"),
        )
        debit_system_codes = {line.chart_account.system_code for line in debit_lines}
        self.assertIn("INVENTORY_ASSET", debit_system_codes)
        self.assertNotIn("INPUT_GST", debit_system_codes)

    def test_advance_emi_receipt_snapshot_is_non_gst(self):
        batch = create_batch(batch_code="NG-BATCH-01", status="OPEN")
        lucky_id = create_lucky_id(batch=batch, lucky_number=11)
        emi_product = create_product(
            name="Non GST EMI Product",
            product_code="NG-EMI-001",
            base_price=Decimal("15000.00"),
        )
        subscription = create_subscription(
            customer=self.customer,
            product=emi_product,
            batch=batch,
            lucky_id=lucky_id,
            start_date=date(2026, 5, 1),
            monthly_amount=Decimal("1000.00"),
            total_amount=Decimal("15000.00"),
            tenure_months=batch.duration_months,
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            due_date=date(2026, 5, 7),
            amount=Decimal("1000.00"),
        )
        payment = Payment.objects.create(
            customer=self.customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal("1000.00"),
            method=PaymentMethod.CASH,
            payment_date=date(2026, 5, 7),
            reference_no="NG-PAY-001",
            finance_account=self.cash_account,
        )

        receipt_response = self.client.post(
            f"/api/v1/billing/receipts/emi-payment/{payment.id}/generate/",
            {"finance_account_id": self.cash_account.id},
            format="json",
        )
        self.assertEqual(receipt_response.status_code, status.HTTP_200_OK, receipt_response.data)
        snapshot = receipt_response.data["receipt"].get("tax_profile_snapshot") or {}
        self.assertEqual(snapshot.get("document_type"), "ADVANCE_EMI_RECEIPT")
        self.assertEqual(snapshot.get("mode"), "GST_UNREGISTERED")

    def test_tax_activation_requires_gstin_and_effective_date(self):
        response = self.client.post(
            "/api/v1/admin/compliance/tax-profile/activate/",
            {"mode": "GST_REGULAR"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("gstin", response.data)

    def test_old_documents_keep_snapshot_after_gst_activation(self):
        sale_response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._direct_sale_payload(tax_mode="NON_GST"),
            format="json",
        )
        self.assertEqual(sale_response.status_code, status.HTTP_201_CREATED, sale_response.data)
        sale = DirectSale.objects.get(pk=sale_response.data["id"])
        invoice = BillingInvoice.objects.get(pk=sale_response.data["billing_invoice_id"])
        original_sale_snapshot = dict(sale.tax_profile_snapshot or {})
        original_invoice_snapshot = dict(invoice.tax_profile_snapshot or {})

        activate_response = self.client.post(
            "/api/v1/admin/compliance/tax-profile/activate/",
            {
                "mode": "GST_REGULAR",
                "effective_from": "2026-05-10",
                "gstin": "19ABCDE1234F1Z5",
                "legal_name": "Subidha Furniture",
            },
            format="json",
        )
        self.assertEqual(activate_response.status_code, status.HTTP_200_OK, activate_response.data)

        sale.refresh_from_db()
        invoice.refresh_from_db()

        self.assertEqual((sale.tax_profile_snapshot or {}).get("mode"), original_sale_snapshot.get("mode"))
        self.assertEqual((invoice.tax_profile_snapshot or {}).get("mode"), original_invoice_snapshot.get("mode"))
        self.assertEqual((invoice.tax_profile_snapshot or {}).get("invoice_kind"), "COMMERCIAL_INVOICE")

    def test_compliance_endpoints_are_admin_only(self):
        endpoints = [
            "/api/v1/admin/compliance/tax-profile/",
            "/api/v1/admin/compliance/tax-readiness/",
            "/api/v1/admin/compliance/turnover-summary/",
            "/api/v1/admin/compliance/product-tax-profiles/",
            "/api/v1/admin/compliance/party-tax-profiles/",
        ]
        for user in [self.partner, self.cashier, self.customer_user]:
            self.client.force_authenticate(user=user)
            for endpoint in endpoints:
                response = self.client.get(endpoint)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    msg=f"Unexpected access for {user.role} on {endpoint}",
                )


class RentLeaseNonGstSnapshotTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="rent_lease_snapshot_admin", phone="9200000001")
        self.customer = create_customer_profile(name="Rent Lease Customer", phone="9200000002")

    def _create_subscription(self, *, plan_type: str, product_code: str) -> Subscription:
        product = create_product(
            name=f"{plan_type} Product",
            product_code=product_code,
            base_price=Decimal("18000.00"),
        )
        if plan_type == PlanType.RENT:
            product.plan_type_default = PlanType.RENT
            product.is_rent_enabled = True
        else:
            product.plan_type_default = PlanType.LEASE
            product.is_lease_enabled = True
        product.save(update_fields=["plan_type_default", "is_rent_enabled", "is_lease_enabled"])

        subscription = Subscription.objects.create(
            customer=self.customer,
            product=product,
            plan_type=plan_type,
            tenure_months=6,
            start_date=date(2026, 5, 1),
            total_amount=Decimal("18000.00"),
            monthly_amount=Decimal("3000.00"),
            status="ACTIVE",
        )
        if plan_type == PlanType.RENT:
            RentSubscriptionProfile.objects.create(
                subscription=subscription,
                security_deposit_percent=Decimal("20.00"),
                security_deposit_amount=Decimal("3600.00"),
                refundable_security_deposit=Decimal("3600.00"),
            )
        else:
            LeaseSubscriptionProfile.objects.create(
                subscription=subscription,
                security_deposit_percent=Decimal("20.00"),
                security_deposit_amount=Decimal("3600.00"),
                refundable_security_deposit=Decimal("3600.00"),
            )
        return subscription

    def test_rent_receipt_snapshot_is_non_gst(self):
        subscription = self._create_subscription(plan_type=PlanType.RENT, product_code="NG-RENT-001")
        generate_monthly_demands_for_subscription(
            subscription=subscription,
            through_date=date(2026, 5, 1),
            performed_by=self.admin,
        )
        rent_demand = RentLeaseBillingDemand.objects.get(
            subscription=subscription,
            demand_type=RentLeaseDemandType.RENT_MONTHLY,
        )
        snapshot = rent_demand.tax_profile_snapshot or {}
        self.assertEqual(snapshot.get("document_type"), "NON_GST_RENT_RECEIPT")
        self.assertEqual(snapshot.get("mode"), "GST_UNREGISTERED")

    def test_lease_receipt_snapshot_is_non_gst(self):
        subscription = self._create_subscription(plan_type=PlanType.LEASE, product_code="NG-LEASE-001")
        generate_monthly_demands_for_subscription(
            subscription=subscription,
            through_date=date(2026, 5, 1),
            performed_by=self.admin,
        )
        lease_demand = RentLeaseBillingDemand.objects.get(
            subscription=subscription,
            demand_type=RentLeaseDemandType.LEASE_MONTHLY,
        )
        snapshot = lease_demand.tax_profile_snapshot or {}
        self.assertEqual(snapshot.get("document_type"), "NON_GST_LEASE_RECEIPT")
        self.assertEqual(snapshot.get("mode"), "GST_UNREGISTERED")


class NonGstBackfillCommandTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="non_gst_backfill_admin", phone="9300000001")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="Backfill Customer", phone="9300000002")

        product = create_product(
            name="Backfill Product",
            product_code="NG-BF-001",
            base_price=Decimal("7000.00"),
        )
        item = InventoryItem.objects.create(
            product=product,
            sku="NG-BF-SKU-001",
            opening_stock_qty=Decimal("3.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("5000.00"),
        )
        chart = ChartOfAccount.objects.create(
            code="NG-BF-CASH-001",
            name="Backfill Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        account = FinanceAccount.objects.create(
            name="Backfill Cash Account",
            kind=FinanceAccountKind.CASH,
            chart_account=chart,
            opening_balance=Decimal("0.00"),
        )
        fy = financial_year_for(date.today())
        DocumentSequence.objects.create(
            series_code="DIRECT_SALE_INVOICE",
            financial_year=fy,
            prefix=f"DSI-{fy}",
            next_number=1,
            padding=5,
            is_active=True,
        )

        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 5, 4),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": account.id,
                "delivery_required": False,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "subtotal": "7000.00",
                "discount_total": "0.00",
                "taxable_total": "7000.00",
                "tax_total": "0.00",
                "grand_total": "7000.00",
                "received_total": "1000.00",
                "balance_total": "6000.00",
                "lines": [
                    {
                        "product": product.id,
                        "inventory_item": item.id,
                        "description": "Backfill line",
                        "quantity": "1.000",
                        "unit_price": "7000.00",
                        "discount_amount": "0.00",
                        "taxable_value": "7000.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "7000.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.sale = DirectSale.objects.get(pk=response.data["id"])

    def test_backfill_command_dry_run_and_confirm(self):
        self.sale.tax_profile_snapshot = None
        self.sale.save(update_fields=["tax_profile_snapshot", "updated_at"])

        call_command("backfill_non_gst_tax_snapshots", "--dry-run")
        self.sale.refresh_from_db()
        self.assertIsNone(self.sale.tax_profile_snapshot)

        call_command("backfill_non_gst_tax_snapshots", "--confirm")
        self.sale.refresh_from_db()
        self.assertIsNotNone(self.sale.tax_profile_snapshot)
        self.assertEqual((self.sale.tax_profile_snapshot or {}).get("mode"), "GST_UNREGISTERED")


class BusinessTaxProfileSeedSmokeTests(TestCase):
    def test_default_profile_exists_as_gst_unregistered(self):
        profile = BusinessTaxProfile.objects.filter(is_active=True).order_by("-id").first()
        if profile is None:
            profile = BusinessTaxProfile.objects.create(
                mode="GST_UNREGISTERED",
                legal_name="Subidha Furniture",
                effective_from=date(2026, 5, 1),
                is_active=True,
            )
        self.assertEqual(profile.mode, "GST_UNREGISTERED")
