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
    ensure_document_numbering_profile_for_date,
    ensure_test_accounting_posting_prerequisites,
)


class FinanceAccountCollectionGuardTests(TestCase):
    def test_finance_posting_resolution_rejects_non_posting_chart_account(self):
        from accounting.services.finance_posting_service import FinancePostingService

        chart = ChartOfAccount.objects.create(
            code="TEST-NONPOST-CASH",
            name="Non Posting Cash Control",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=False,
        )
        finance_account = FinanceAccount.objects.create(
            name="Non Posting Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )

        with self.assertRaises(ValueError) as ctx:
            FinancePostingService.resolve_operational_finance_account(
                finance_account_id=finance_account.id,
            )
        self.assertIn("non-posting chart account", str(ctx.exception))

    def test_filter_excludes_accounts_mapped_for_emi_income(self):
        from accounting.services.finance_account_collection_guard import (
            filter_finance_accounts_for_payment_collection,
        )

        clean = create_payment_collection_finance_account(
            code="TEST-GUARD-CLEAN",
            name="Clean Collection Desk",
        )
        dirty_asset = ChartOfAccount.objects.create(
            code="TEST-GUARD-DIRTY-ASSET",
            name="Dirty Mixed Desk Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        dirty = FinanceAccount.objects.create(
            name="Dirty Mixed Desk",
            kind=FinanceAccountKind.BANK,
            chart_account=dirty_asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
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

        dirty_asset = ChartOfAccount.objects.create(
            code="TEST-GUARD-EMI-ASSET",
            name="Rent Income Mapped Desk Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        dirty = FinanceAccount.objects.create(
            name="Rent Income Mapped Desk",
            kind=FinanceAccountKind.BANK,
            chart_account=dirty_asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
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
        FinanceAccountCoaMapping.objects.create(
            finance_account=dirty,
            chart_account=dirty_asset,
            purpose=FinanceAccountMappingPurpose.BANK_COLLECTION,
            is_active=True,
        )

        with self.assertRaises(ValueError) as ctx:
            record_emi_payment(
                emi_id=emi.id,
                amount=Decimal("100.00"),
                collected_by=admin,
                method="CASH",
                finance_account_id=dirty.id,
                idempotency_key="GUARD-EMI-RESERVED-001",
            )
        self.assertIn("operational ledger", str(ctx.exception).lower())

    def test_direct_sale_collection_rejects_reserved_finance_account(self):
        admin = create_admin_user(username="guard_ds_admin", phone="9389111103")
        ensure_test_accounting_posting_prerequisites(date(2026, 4, 21), performed_by=admin)
        ensure_document_numbering_profile_for_date("DIRECT_SALE", date(2026, 4, 21), performed_by=admin)
        ensure_document_numbering_profile_for_date("TAX_INVOICE", date(2026, 4, 21), performed_by=admin)
        ensure_document_numbering_profile_for_date("DIRECT_SALE_RECEIPT", date(2026, 4, 21), performed_by=admin)
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
        dirty_asset = ChartOfAccount.objects.create(
            code="TEST-GUARD-DS-ASSET",
            name="Commission Mapped Desk Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        dirty = FinanceAccount.objects.create(
            name="Commission Mapped Desk",
            kind=FinanceAccountKind.BANK,
            chart_account=dirty_asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
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
        FinanceAccountCoaMapping.objects.create(
            finance_account=dirty,
            chart_account=dirty_asset,
            purpose=FinanceAccountMappingPurpose.BANK_COLLECTION,
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


class CashCounterFinanceAccountFilterTests(TestCase):
    def test_cash_counter_filter_includes_only_cash_settlement_desks(self):
        from accounting.services.accounting_setup_service import LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME
        from accounting.services.finance_account_collection_guard import filter_finance_accounts_for_cash_counter

        asset = ChartOfAccount.objects.create(
            code="CTR-FLT-ASSET",
            name="CTR Filter Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        cash_ok = FinanceAccount.objects.create(
            name="CTR Filter Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        bank_row = FinanceAccount.objects.create(
            name="CTR Filter Bank",
            kind=FinanceAccountKind.BANK,
            chart_account=asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        ledger_anchor = FinanceAccount.objects.create(
            name=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
            kind=FinanceAccountKind.BANK,
            chart_account=asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=False,
        )
        qs = FinanceAccount.objects.filter(
            pk__in=[cash_ok.pk, bank_row.pk, ledger_anchor.pk],
        ).order_by("id")
        filtered = filter_finance_accounts_for_cash_counter(qs, branch_id=None)
        ids = set(filtered.values_list("pk", flat=True))
        self.assertEqual(ids, {cash_ok.pk})

    def test_cash_counter_filter_respects_branch_scope(self):
        from accounting.services.finance_account_collection_guard import filter_finance_accounts_for_cash_counter

        from branch_control.models import Branch, BranchStatus

        asset = ChartOfAccount.objects.create(
            code="CTR-BR-ASSET",
            name="CTR Branch Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        branch_a = Branch.objects.create(code="CTR-A", name="Branch A", status=BranchStatus.ACTIVE)
        branch_b = Branch.objects.create(code="CTR-B", name="Branch B", status=BranchStatus.ACTIVE)
        cash_a = FinanceAccount.objects.create(
            name="Cash A",
            branch=branch_a,
            kind=FinanceAccountKind.CASH,
            chart_account=asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        cash_b = FinanceAccount.objects.create(
            name="Cash B",
            branch=branch_b,
            kind=FinanceAccountKind.CASH,
            chart_account=asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        qs = FinanceAccount.objects.filter(pk__in=[cash_a.pk, cash_b.pk]).order_by("id")
        scoped = filter_finance_accounts_for_cash_counter(qs, branch_id=branch_a.pk)
        self.assertEqual(set(scoped.values_list("pk", flat=True)), {cash_a.pk})

    def test_validate_finance_account_for_cash_counter_rejects_profile_anchor(self):
        from accounting.services.accounting_setup_service import LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME
        from accounting.services.finance_account_collection_guard import validate_finance_account_for_cash_counter

        from branch_control.models import Branch, BranchStatus

        asset = ChartOfAccount.objects.create(
            code="CTR-VASSET",
            name="CTR V Asset",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        branch = Branch.objects.create(code="CTR-VBR", name="Branch V", status=BranchStatus.ACTIVE)
        ledger_anchor = FinanceAccount.objects.create(
            name=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
            branch=branch,
            kind=FinanceAccountKind.BANK,
            chart_account=asset,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=False,
        )
        with self.assertRaises(ValueError) as ctx:
            validate_finance_account_for_cash_counter(finance_account=ledger_anchor, branch_id=branch.pk)
        self.assertIn("posting profiles", str(ctx.exception).lower())
