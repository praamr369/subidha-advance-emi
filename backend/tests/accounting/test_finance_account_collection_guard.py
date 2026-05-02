from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)
from billing.models import BillingInvoice
from billing.services.billing_service import approve_billing_invoice, create_direct_sale, post_billing_invoice
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_payment_collection_finance_account,
    create_product,
    create_subscription,
)


class FinanceAccountCollectionGuardTests(TestCase):
    def test_filter_excludes_accounts_mapped_for_emi_income(self):
        from accounting.services.finance_account_collection_guard import (
            filter_finance_accounts_for_payment_collection,
        )

        clean = create_payment_collection_finance_account(
            code="TEST-GUARD-CLEAN",
            name="Clean Collection Desk",
        )
        dirty = create_payment_collection_finance_account(
            code="TEST-GUARD-DIRTY",
            name="Dirty Mixed Desk",
        )
        income_chart = ChartOfAccount.objects.create(
            code="INC-GUARD-1",
            name="EMI Income Mapping Ledger",
            account_type=ChartOfAccountType.INCOME,
            is_active=True,
            allow_manual_posting=True,
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=dirty,
            chart_account=income_chart,
            purpose=FinanceAccountMappingPurpose.EMI_INCOME,
            is_active=True,
        )

        qs = FinanceAccount.objects.filter(pk__in=[clean.pk, dirty.pk]).order_by("id")
        filtered = filter_finance_accounts_for_payment_collection(qs)
        ids = set(filtered.values_list("pk", flat=True))
        self.assertIn(clean.pk, ids)
        self.assertNotIn(dirty.pk, ids)

    def test_record_emi_payment_rejects_reserved_finance_account(self):
        admin = create_admin_user(username="guard_admin", phone="9389111101")
        partner = create_partner_user(username="guard_partner", phone="9389111102")
        customer = create_customer_profile(name="Guard EMI Customer", phone="7389111101")
        product = create_product(base_price=Decimal("9000.00"), product_code="GUARD-EMI-P1")
        batch = create_batch()
        lucky_id = create_lucky_id(batch=batch, lucky_number=91)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            partner=partner,
            total_amount=Decimal("9000.00"),
            monthly_amount=Decimal("1000.00"),
        )
        emi = create_emi(subscription=subscription, month_no=1, amount=Decimal("1000.00"))

        dirty = create_payment_collection_finance_account(
            code="TEST-GUARD-EMI-FA",
            name="Rent Income Mapped Desk",
        )
        income_chart = ChartOfAccount.objects.create(
            code="INC-GUARD-2",
            name="Rent Income Ledger",
            account_type=ChartOfAccountType.INCOME,
            is_active=True,
            allow_manual_posting=True,
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=dirty,
            chart_account=income_chart,
            purpose=FinanceAccountMappingPurpose.RENT_INCOME,
            is_active=True,
        )

        with self.assertRaises(ValueError) as ctx:
            record_emi_payment(
                emi_id=emi.id,
                amount=Decimal("100.00"),
                collected_by=admin,
                method="CASH",
                finance_account_id=dirty.id,
            )
        self.assertIn("operational ledger", str(ctx.exception).lower())

    def test_direct_sale_collection_rejects_reserved_finance_account(self):
        admin = create_admin_user(username="guard_ds_admin", phone="9389111103")
        customer = create_customer_profile(name="Guard DS Customer", phone="7389111103")
        product = create_product(name="Guard DS Product", product_code="GUARD-DS-01", base_price=Decimal("12000.00"))
        from inventory.models import InventoryItem

        inventory_item = InventoryItem.objects.create(
            product=product,
            sku="GUARD-DS-SKU",
            opening_stock_qty=Decimal("4.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("8000.00"),
        )
        dirty = create_payment_collection_finance_account(
            code="TEST-GUARD-DS-FA",
            name="Commission Mapped Desk",
        )
        liability_chart = ChartOfAccount.objects.create(
            code="LIA-GUARD-1",
            name="Commission Payable Ledger",
            account_type=ChartOfAccountType.LIABILITY,
            is_active=True,
            allow_manual_posting=True,
        )
        FinanceAccountCoaMapping.objects.create(
            finance_account=dirty,
            chart_account=liability_chart,
            purpose=FinanceAccountMappingPurpose.COMMISSION_PAYABLE,
            is_active=True,
        )

        clean_chart = ChartOfAccount.objects.create(
            code="GUARD-DS-CLEAN-CH",
            name="Guard DS Cash Ledger",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        clean_counter_fa = FinanceAccount.objects.create(
            name="Guard DS Counter FA",
            kind=FinanceAccountKind.CASH,
            chart_account=clean_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
        )

        payload = {
            "sale_date": date(2026, 4, 21),
            "customer": customer,
            "tax_mode": "NON_GST",
            "finance_account": clean_counter_fa,
            "delivery_required": False,
            "received_total": Decimal("2000.00"),
            "customer_name_snapshot": customer.name,
            "customer_phone_snapshot": customer.phone,
            "lines": [
                {
                    "product": product,
                    "inventory_item": inventory_item,
                    "description": "Retail line",
                    "quantity": Decimal("1.000"),
                    "unit_price": Decimal("12000.00"),
                    "discount_amount": Decimal("0.00"),
                    "taxable_value": Decimal("12000.00"),
                    "gst_rate": None,
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "line_total": Decimal("12000.00"),
                    "hsn_sac_code": "",
                }
            ],
        }
        sale = create_direct_sale(payload=payload, created_by=admin)
        invoice = BillingInvoice.objects.get(direct_sale=sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=admin)

        with self.assertRaises(ValueError) as ctx:
            collect_direct_sale_payment(
                direct_sale_id=sale.id,
                amount=Decimal("3000.00"),
                collected_by=admin,
                finance_account_id=dirty.id,
            )
        self.assertIn("operational ledger", str(ctx.exception).lower())
