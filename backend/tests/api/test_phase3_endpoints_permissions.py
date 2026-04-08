from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, DocumentSequence, FinanceAccount, FinanceAccountKind
from billing.models import BillingInvoice
from inventory.models import InventoryItem
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
    create_product,
)


class Phase3EndpointsPermissionsTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="phase3_admin",
            phone="9386000001",
        )
        self.cashier = create_cashier_user(
            username="phase3_cashier",
            phone="9386000002",
        )
        self.partner = create_partner_user(
            username="phase3_partner",
            phone="9386000003",
        )
        self.customer_user = create_customer_user(
            username="phase3_customer",
            phone="7386000004",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Phase3 Customer",
            phone="7386000004",
        )
        product = create_product(
            name="Phase3 Product",
            product_code="PHASE3-001",
            base_price=Decimal("1500.00"),
        )
        InventoryItem.objects.create(product=product, sku="PHASE3-SKU-001")
        chart_account = ChartOfAccount.objects.create(
            code="PHASE3-CASH-001",
            name="Phase3 Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        finance_account = FinanceAccount.objects.create(
            name="Phase3 Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=chart_account,
            opening_balance=Decimal("0.00"),
        )
        sequence = DocumentSequence.objects.create(
            series_code="BILL_INV",
            financial_year="2026-27",
            prefix="INV-2026-27",
            next_number=1,
        )
        BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 8),
            financial_year="2026-27",
            doc_series=sequence,
            customer=self.customer,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            finance_account=finance_account,
            subtotal=Decimal("100.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("100.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("100.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

    def test_inventory_and_billing_registers_are_admin_only(self):
        endpoints = [
            "/api/v1/inventory/items/",
            "/api/v1/billing/invoices/",
            "/api/v1/accounting/periods/",
        ]
        for user in [self.cashier, self.partner, self.customer_user]:
            self.client.force_authenticate(user=user)
            for endpoint in endpoints:
                response = self.client.get(endpoint)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    msg=f"Unexpected access for {user.role} on {endpoint}",
                )

    def test_reminder_register_is_visible_to_cashier_but_mutation_is_admin_only(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get("/api/v1/reminders/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        create_response = self.client.post(
            "/api/v1/reminders/",
            {
                "channel": "SMS",
                "reminder_type": "EMI_DUE",
                "target_customer": self.customer.id,
                "due_date": "2026-04-12",
                "amount_due": "100.00",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        admin_create = self.client.post(
            "/api/v1/reminders/",
            {
                "channel": "SMS",
                "reminder_type": "EMI_DUE",
                "target_customer": self.customer.id,
                "due_date": "2026-04-12",
                "amount_due": "100.00",
            },
            format="json",
        )
        self.assertEqual(admin_create.status_code, status.HTTP_201_CREATED, admin_create.data)
