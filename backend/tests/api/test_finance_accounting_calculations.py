from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from api.v1.services.admin_dashboard_analytics_service import build_dashboard_business_analytics
from accounting.models import EmployeeProfile, DocumentSequence, FinancialYear
from billing.models import BillingInvoice, DirectSale, DirectSaleReturn, DirectSaleReturnStatus
from inventory.models import InventoryItem, StockLedger, StockMovementType, StockLocation, StockLocationType
from manufacturing.models import ProductionJob, ProductionJobStatus, ProductionLaborLine
from payments.services.payment_service import record_emi_payment
from subscriptions.models import (
    Emi,
    OperationalCancellation,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_test_accounting_posting_prerequisites,
)


class FinanceAccountingCalculationsBreakAndFixTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="admin_finance_test",
            phone="9304000002",
        )
        self.env = ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        self.client.force_authenticate(user=self.admin)

        self.customer = create_customer_profile(
            name="Finance Test Customer",
            phone="7304000002",
        )
        self.product = create_product(
            name="Executive Desk",
            product_code="DESK-001",
            base_price=Decimal("12000.00"),
        )
        self.batch = create_batch(
            batch_code="FINTEST2026",
            duration_months=6,
            total_slots=100,
            draw_day=15,
            start_date=date(2026, 4, 1),
            status="OPEN",
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=7)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("2000.00"),
            tenure_months=6,
        )
        self.emi1 = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("2000.00"),
            due_date=self.today,
        )
        self.emi2 = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("2000.00"),
            due_date=self.today + timedelta(days=30),
        )
        self.emi3 = create_emi(
            subscription=self.subscription,
            month_no=3,
            amount=Decimal("2000.00"),
            due_date=self.today + timedelta(days=60),
        )

        fy_obj = FinancialYear.objects.filter(is_active=True).first()
        if not fy_obj:
            fy_obj = FinancialYear.objects.create(
                name="FY 2026-27",
                code="2026-2027",
                start_date=date(2026, 4, 1),
                end_date=date(2027, 3, 31),
                is_active=True,
            )
        self.fy = fy_obj
        self.doc_seq, _ = DocumentSequence.objects.get_or_create(
            series_code="TEST_DS",
            defaults={
                "financial_year": "2026-2027",
                "financial_year_ref": self.fy,
                "prefix": "SALE",
                "next_number": 1,
            },
        )
        self.inv_seq, _ = DocumentSequence.objects.get_or_create(
            series_code="TEST_INV",
            defaults={
                "financial_year": "2026-2027",
                "financial_year_ref": self.fy,
                "prefix": "INV",
                "next_number": 1,
            },
        )
        self.location = StockLocation.objects.create(
            code="WH-MAIN",
            name="Main Warehouse",
            location_type=StockLocationType.WAREHOUSE,
        )

    def test_gross_net_reversal_invariant_with_operational_cancellation(self):
        """
        FINANCIAL INVARIANT:
        Gross = Net + Reversals (or Gross - Reversals = Net).
        When payments are invalidated via OperationalCancellation or metadata flags,
        the gross total must record all payments, reversals must record all cancellations,
        and net must strictly equal active payments.
        """
        # Payment 1: Active payment of 2000
        p1 = record_emi_payment(
            emi_id=self.emi1.id,
            amount=Decimal("2000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="REC-001",
        )["payment"]

        # Payment 2: Reversed via metadata of 1000
        p2 = record_emi_payment(
            emi_id=self.emi2.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="REC-002",
        )["payment"]
        p2.allocation_metadata = {"reversal": {"is_reversed": True}}
        p2.save(update_fields=["allocation_metadata"])

        # Payment 3: Cancelled via OperationalCancellation of 1500
        p3 = record_emi_payment(
            emi_id=self.emi3.id,
            amount=Decimal("1500.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="REC-003",
        )["payment"]
        OperationalCancellation.objects.create(
            source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
            source_id=p3.id,
            cancellation_type=OperationalCancellation.CancellationType.PAYMENT_REVERSAL,
            cancelled_by=self.admin,
            reason="Customer requested cancellation",
        )

        analytics = build_dashboard_business_analytics(self.today)
        sales = analytics["sales"]

        # Active net payments should strictly be 2000
        self.assertEqual(sales["streams_breakdown"]["sfemi"]["amount"], "2000.00")

        # Monthly trends verification for current month:
        current_month_label = self.today.strftime("%b %Y")
        month_trend = next(
            (m for m in sales["monthly_trends"] if m["month"] == current_month_label),
            None,
        )
        self.assertIsNotNone(month_trend)

        # Gross should be 2000 + 1000 + 1500 = 4500
        # Reversals should be 1000 + 1500 = 2500
        # Net should be 2000
        self.assertEqual(Decimal(str(month_trend["net"])), Decimal("2000.00"))
        self.assertEqual(Decimal(str(month_trend["reversals"])), Decimal("2500.00"))
        self.assertEqual(Decimal(str(month_trend["gross"])), Decimal("4500.00"))
        self.assertEqual(
            Decimal(str(month_trend["gross"])) - Decimal(str(month_trend["reversals"])),
            Decimal(str(month_trend["net"])),
        )

    def test_direct_sales_net_revenue_deducts_posted_returns(self):
        """
        ACCOUNTING INVARIANT:
        Net Sales = Gross Sales - Returns & Allowances.
        If a direct sale of 25,000 has a posted DirectSaleReturn of 5,000,
        the net direct sales revenue must be 20,000.
        """
        sale = DirectSale.objects.create(
            sale_no="DS-TEST-001",
            sale_date=self.today,
            financial_year="2026-2027",
            doc_series=self.doc_seq,
            customer=self.customer,
            status="CONFIRMED",
            tax_mode="NON_GST",
            tax_calculation_mode="NON_GST",
            customer_gst_type="UNREGISTERED_CONSUMER",
            subtotal=Decimal("25000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("25000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("25000.00"),
            received_total=Decimal("25000.00"),
            balance_total=Decimal("0.00"),
        )

        invoice = BillingInvoice.objects.create(
            document_no="INV-TEST-001",
            invoice_date=self.today,
            financial_year="2026-2027",
            doc_series=self.inv_seq,
            direct_sale=sale,
            customer=self.customer,
            status="APPROVED",
            document_type="INVOICE",
            tax_mode="NON_GST",
            subtotal=Decimal("25000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("25000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("25000.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("25000.00"),
        )

        DirectSaleReturn.objects.create(
            return_no="RET-TEST-001",
            direct_sale=sale,
            original_invoice=invoice,
            customer=self.customer,
            status=DirectSaleReturnStatus.POSTED,
            subtotal=Decimal("5000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("5000.00"),
            reason="Customer returned piece",
            stock_location=self.location,
        )

        analytics = build_dashboard_business_analytics(self.today)
        sales = analytics["sales"]

        # Net direct sales revenue must account for the 5,000 return
        self.assertEqual(sales["streams_breakdown"]["direct_sales"]["amount"], "20000.00")

    def test_stock_valuation_accounts_for_manufactured_goods_costs(self):
        """
        INVENTORY ACCOUNTING INVARIANT:
        When standard/purchase cost is not specified but manufacturing_cost_enabled is True,
        inventory valuation must aggregate raw material + labor + overhead manufacturing costs.
        """
        item = InventoryItem.objects.create(
            product=self.product,
            default_stock_location=self.location,
            stock_item_type="FINISHED_GOOD",
            purchase_unit_cost=None,
            standard_unit_cost=None,
            manufacturing_cost_enabled=True,
            manufacturing_raw_material_cost=Decimal("800.00"),
            manufacturing_labour_cost=Decimal("400.00"),
            manufacturing_overhead_cost=Decimal("150.00"),  # Total unit cost = 1350.00
            reorder_level_qty=Decimal("2.000"),
        )

        # 10 units on hand
        StockLedger.objects.create(
            inventory_item=item,
            stock_location=self.location,
            movement_type=StockMovementType.OPENING_BALANCE_IN,
            movement_date=self.today,
            quantity_in=Decimal("10.000"),
            quantity_out=Decimal("0.000"),
            reference_model="OPENING",
            reference_id="OP-001",
        )

        analytics = build_dashboard_business_analytics(self.today)
        inv = analytics["inventory"]

        # 10 units * 1350.00 = 13500.00
        self.assertEqual(inv["total_valuation"], "13500.00")

    def test_manufacturing_labor_accruals_excludes_cancelled_jobs_and_handles_wage_rates(self):
        """
        MANUFACTURING ACCRUAL INVARIANT (Rule 4f):
        Unposted labor accrual must only include active (non-cancelled) production jobs.
        """
        emp = EmployeeProfile.objects.create(
            employee_code="EMP-PROD-01",
            name="Carpenter Ram",
            phone="9876543210",
            joining_date=self.today,
            hourly_wage_rate=Decimal("200.00"),
            is_active=True,
        )

        fg_item = InventoryItem.objects.create(
            product=self.product,
            default_stock_location=self.location,
            stock_item_type="FINISHED_GOOD",
        )

        # Job 1: Active job (IN_PROGRESS) with 1000 wage
        job_active = ProductionJob.objects.create(
            job_no="JOB-ACT-001",
            job_date=self.today,
            status=ProductionJobStatus.IN_PROGRESS,
            finished_good_inventory_item=fg_item,
            planned_output_qty=Decimal("1.000"),
        )
        ProductionLaborLine.objects.create(
            production_job=job_active,
            employee=emp,
            activity_name="Cutting & Assembly",
            hours_worked=Decimal("5.00"),
            wage_amount=Decimal("1000.00"),
            is_posted=False,
        )

        # Job 2: CANCELLED job with 500 wage
        job_cancelled = ProductionJob.objects.create(
            job_no="JOB-CAN-002",
            job_date=self.today,
            status=ProductionJobStatus.CANCELLED,
            cancel_reason="Prototype cancelled",
            finished_good_inventory_item=fg_item,
            planned_output_qty=Decimal("1.000"),
        )
        ProductionLaborLine.objects.create(
            production_job=job_cancelled,
            employee=emp,
            activity_name="Discarded Prototype",
            hours_worked=Decimal("2.50"),
            wage_amount=Decimal("500.00"),
            is_posted=False,
        )

        analytics = build_dashboard_business_analytics(self.today)
        staff = analytics["staff"]
        mfg = staff["manufacturing"]

        # Should only accrue the 1000 from the active job, completely excluding the cancelled job
        self.assertEqual(mfg["unposted_labor_lines_count"], 1)
        self.assertEqual(mfg["unposted_labor_accrual_amount"], "1000.00")
