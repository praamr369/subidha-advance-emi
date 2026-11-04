from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from reminders.models import PaymentReminder, ReminderType
from reminders.services.emi_reminder_jobs import generate_emi_due_reminders_for_date
from system_jobs.models import Notification, SystemJobLog, SystemJobStatus
from system_jobs.services.job_runner import run_idempotent_job
from system_jobs.services.notifications import emit_notification
from system_jobs.tasks import daily_emi_due_reminders, daily_inventory_reorder_check
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class EmiReminderJobTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.customer = create_customer_profile(name="Job Customer", phone="9305000001")
        self.product = create_product(name="Job Product", product_code="JOB-PR-001", base_price=Decimal("3000.00"))
        self.batch = create_batch(
            batch_code="JOBBATCH2026",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=3)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("250.00"),
            tenure_months=12,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("250.00"),
            due_date=self.today,
        )

    def test_emi_due_reminder_generation_is_idempotent(self):
        first = generate_emi_due_reminders_for_date(on_date=self.today, performed_by=None)
        second = generate_emi_due_reminders_for_date(on_date=self.today, performed_by=None)
        self.assertEqual(first["created_count"], 1)
        self.assertEqual(second["created_count"], 0)
        self.assertEqual(
            PaymentReminder.objects.filter(
                target_subscription=self.subscription,
                reminder_type=ReminderType.EMI_DUE,
            ).count(),
            1,
        )


class IdempotentJobAndNotificationTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="job_admin", phone="9305000002")
        self.customer = create_customer_profile(name="N2", phone="9305000003")
        self.product = create_product(name="P2", product_code="JOB-PR-002", base_price=Decimal("3000.00"))
        self.batch = create_batch(
            batch_code="JOBBATCH2026B",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=4)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("250.00"),
            tenure_months=12,
        )
        create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("250.00"),
            due_date=timezone.localdate(),
        )

    def test_daily_emi_due_task_skipped_second_time_no_extra_notifications(self):
        daily_emi_due_reminders()
        n_after_first = Notification.objects.filter(recipient=self.admin).count()
        daily_emi_due_reminders()
        n_after_second = Notification.objects.filter(recipient=self.admin).count()
        self.assertEqual(n_after_first, n_after_second)
        logs = SystemJobLog.objects.filter(job_type="daily_emi_due_reminders")
        self.assertEqual(logs.count(), 1)
        self.assertEqual(logs.first().status, SystemJobStatus.SUCCESS)

    def test_emit_notification_dedupe_key_prevents_duplicates(self):
        emit_notification(
            module="billing",
            title="Once",
            body="Body",
            recipient=self.admin,
            dedupe_key="unit-test:dedupe:1",
        )
        emit_notification(
            module="billing",
            title="Twice",
            body="Body",
            recipient=self.admin,
            dedupe_key="unit-test:dedupe:1",
        )
        self.assertEqual(Notification.objects.filter(dedupe_key="unit-test:dedupe:1").count(), 1)

    def test_failed_job_records_failure_reason(self):
        def boom(_log):
            raise RuntimeError("planned failure")

        log, meta = run_idempotent_job(
            idempotency_key="unit-test:fail-once",
            job_type="unit_test_fail",
            body=boom,
        )
        self.assertEqual(log.status, SystemJobStatus.FAILED)
        self.assertIn("planned failure", log.failure_reason)
        self.assertIn("error", meta)

    @patch("system_jobs.tasks.generate_emi_due_reminders_for_date")
    def test_failed_daily_emi_task_emits_admin_system_alert(self, mock_gen):
        mock_gen.side_effect = RuntimeError("job body down")
        daily_emi_due_reminders()
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.admin,
                module="system",
                title="EMI due reminder job failed",
            ).exists()
        )

    @patch("inventory.services.demand_service.get_purchase_suggestions")
    def test_inventory_reorder_task_creates_per_source_stock_low_alert_once(self, mock_suggestions):
        mock_suggestions.return_value = [
            {
                "product_id": 101,
                "product_code": "INV-101",
                "product_name": "Low Item 101",
                "trigger": "LOW_STOCK",
                "physical_stock": "1.000",
                "available_stock": "1.000",
                "low_stock_threshold": "5.000",
                "suggested_order_quantity": "4.000",
            },
            {
                "product_id": 102,
                "product_code": "INV-102",
                "product_name": "Low Item 102",
                "trigger": "SHORTAGE",
                "physical_stock": "2.000",
                "available_stock": "0.000",
                "low_stock_threshold": "2.000",
                "suggested_order_quantity": "3.000",
            },
        ]
        daily_inventory_reorder_check()
        daily_inventory_reorder_check()
        stock_low = Notification.objects.filter(module="inventory", title="Stock low alert")
        self.assertEqual(stock_low.count(), 2)
        self.assertTrue(stock_low.filter(payload__product_id=101).exists())
        self.assertTrue(stock_low.filter(payload__product_id=102).exists())


class NotificationApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="notif_admin", phone="9305000010")
        self.cashier_a = create_cashier_user(username="cashier_a", phone="9305000011")
        self.cashier_b = create_cashier_user(username="cashier_b", phone="9305000012")

    def test_unread_count_matches_unread_rows(self):
        emit_notification(module="billing", title="A", recipient=self.admin, dedupe_key="uc:1")
        emit_notification(module="billing", title="B", recipient=self.admin, dedupe_key="uc:2")
        n1 = Notification.objects.get(dedupe_key="uc:1")
        n1.mark_read()
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/notifications/unread-count/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unread_count"], 1)

    def test_admin_list_supports_module_filter(self):
        emit_notification(module="system", title="Sys", recipient=self.admin, dedupe_key="mf:sys")
        emit_notification(module="billing", title="Bill", recipient=self.admin, dedupe_key="mf:bill")
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/notifications/?module=system")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        modules = {row["module"] for row in response.data["results"]}
        self.assertEqual(modules, {"system"})

    def test_admin_sees_system_alert_notifications(self):
        emit_notification(
            module="system",
            title="System alert",
            body="Check worker",
            recipient=self.admin,
            dedupe_key="sys:alert:1",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {row["title"] for row in response.data["results"]}
        self.assertIn("System alert", titles)

    def test_cashier_sees_only_assigned_notifications(self):
        emit_notification(
            module="billing",
            title="For A",
            recipient=self.cashier_a,
            dedupe_key="cash:a:1",
        )
        self.client.force_authenticate(user=self.cashier_b)
        response = self.client.get("/api/v1/cashier/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 0)
        self.client.force_authenticate(user=self.cashier_a)
        response_a = self.client.get("/api/v1/cashier/notifications/")
        self.assertEqual(response_a.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_a.data["results"]), 1)

    def test_mark_read_updates_row(self):
        emit_notification(module="inventory", title="Stock", recipient=self.admin, dedupe_key="mr:1")
        n = Notification.objects.get(dedupe_key="mr:1")
        self.assertIsNone(n.read_at)
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/v1/admin/notifications/{n.id}/read/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["read_at"])
        n.refresh_from_db()
        self.assertIsNotNone(n.read_at)


class OperationalNotificationsSyncTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="sync_admin", phone="9305000099")
        self.customer = create_customer_profile(name="Sync Customer", phone="9305000098")

    def test_emi_payment_posted_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_emi_payment_posted_notifications,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_emi_payment_posted_notifications(
                payment_id=101,
                customer_user_id=self.customer.user_id,
                partner_user_id=None,
                cashier_user_id=None,
                subscription_label="SUB-2026-001",
                amount_str="1500.00",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="payments",
            payload__category="PAYMENT_POSTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("1500.00", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/payments")

    def test_direct_sale_receipt_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_direct_sale_collection_notifications,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_direct_sale_collection_notifications(
                receipt_id=202,
                direct_sale_id=303,
                customer_user_id=self.customer.user_id,
                amount_str="4500.00",
                receipt_no="RCP-2026-001",
                cashier_user_id=None,
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="billing",
            payload__category="RECEIPT_CREATED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("4500.00", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/billing/receipts")

    def test_customer_advance_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_customer_advance_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_customer_advance_notification(
                advance_id=505,
                customer_name="Ramesh Kumar",
                customer_user_id=self.customer.user_id,
                amount_str="2000.00",
                method="UPI",
                reference_no="UPI-REF-123",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="payments",
            payload__category="ADVANCE_COLLECTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("2000.00", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/customer-advances")

    def test_payment_reversal_notifies_admin_with_warning(self):
        from subscriptions.services.operational_notification_service import (
            schedule_payment_reversal_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_payment_reversal_notification(
                payment_id=404,
                reversal_ledger_id=808,
                amount_str="1200.00",
                reason="Customer requested chargeback reversal",
                reversed_by_username="test_cashier",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="payments",
            payload__category="PAYMENT_REVERSED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertEqual(admin_notif.payload.get("severity"), "WARNING")
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/payments/reversals")

    def test_product_request_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_product_request_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_product_request_notification(
                request_id=606,
                requester_name="Sunil Sharma",
                product_name="King Size Bed",
                request_type="EMI",
                role="customer",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="products",
            payload__category="PRODUCT_REQUEST_SUBMITTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("King Size Bed", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/requests/product-requests")

    def test_online_request_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_online_request_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_online_request_notification(
                request_id=707,
                request_number="ORQ-2026-00001",
                customer_name="Pooja Verma",
                product_name="Dining Table Set",
                request_type="RENT",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="subscriptions",
            payload__category="ONLINE_REQUEST_SUBMITTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("ORQ-2026-00001", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/requests/online-requests")

    def test_customer_kyc_submitted_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_customer_kyc_submitted_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_customer_kyc_submitted_notification(
                customer_id=self.customer.id,
                customer_name="Sync Customer",
                document_type="AADHAAR",
                document_id=888,
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="crm",
            payload__category="KYC_SUBMITTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("AADHAAR", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/crm/kyc")

    def test_customer_support_request_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_customer_support_request_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_customer_support_request_notification(
                request_id=999,
                customer_name="Sync Customer",
                category="BILLING_INQUIRY",
                message="Need clarification on recent payment receipt.",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="support",
            payload__category="SUPPORT_REQUEST_CREATED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("BILLING_INQUIRY", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/service-desk/tickets")

    def test_sfemi_promotional_benefit_winner_notifies_admin_and_customer(self):
        from subscriptions.services.operational_notification_service import (
            schedule_draw_winner_notifications,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_draw_winner_notifications(
                draw_id=111,
                batch_code="SFEMI-BATCH-A",
                winner_customer_user_id=self.customer.user_id,
                winner_customer_name="Sync Customer",
                lucky_number=42,
                waived_amount_str="15000.00",
                waived_count=6,
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="subscriptions",
            payload__category="SFEMI_BENEFIT_AWARDED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("SFEMI-BATCH-A", admin_notif.body)
        self.assertIn("15000.00", admin_notif.body)

        cust_notif = Notification.objects.filter(
            recipient=self.customer.user,
            module="customer",
            payload__category="SFEMI_BENEFIT_AWARDED",
        ).first()
        self.assertIsNotNone(cust_notif)
        self.assertIn("15000.00", cust_notif.body)

    def test_goods_receipt_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_goods_receipt_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_goods_receipt_notification(
                receipt_id=101,
                receipt_no="GRN-2026-001",
                vendor_name="Quality Teak Woodworks",
                po_no="PO-2026-005",
                items_count=3,
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="inventory",
            payload__category="GOODS_RECEIPT_POSTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("GRN-2026-001", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/purchases/receipts")

    def test_vendor_payment_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_vendor_payment_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_vendor_payment_notification(
                payment_id=202,
                payment_no="VPAY-2026-002",
                vendor_name="Quality Teak Woodworks",
                amount_str="25000.00",
                bill_no="BILL-889",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="accounting",
            payload__category="VENDOR_PAYMENT_POSTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("VPAY-2026-002", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/accounting/vendor-settlements")

    def test_direct_sale_invoice_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_direct_sale_invoice_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_direct_sale_invoice_notification(
                invoice_id=303,
                invoice_number="INV-2026-009",
                customer_name="Ravi Shankar",
                amount_str="18500.00",
                sale_id=404,
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="billing",
            payload__category="INVOICE_FINALIZED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("INV-2026-009", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/billing/invoices")

    def test_credit_note_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_credit_debit_note_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_credit_debit_note_notification(
                note_id=505,
                note_no="CRN-2026-001",
                note_type="CREDIT",
                amount_str="1500.00",
                customer_name="Ravi Shankar",
                reason="Damaged item returned",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="billing",
            payload__category="CREDIT_NOTE_POSTED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("CRN-2026-001", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/billing/credit-notes")

    def test_customer_refund_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_customer_refund_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_customer_refund_notification(
                refund_id=606,
                refund_no="REF-2026-001",
                customer_name="Ravi Shankar",
                amount_str="3000.00",
                method="BANK_TRANSFER",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="billing",
            payload__category="REFUND_PAID",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("REF-2026-001", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/refunds/process")

    def test_cashier_day_close_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_cashier_day_close_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_cashier_day_close_notification(
                day_close_id=707,
                cashier_username="cashier_john",
                business_date_str="2026-11-04",
                counted_cash_str="12500.00",
                variance_str="-200.00",
                has_variance=True,
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="finance",
            payload__category="CASHIER_DAY_CLOSE",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertEqual(admin_notif.payload.get("severity"), "WARNING")
        self.assertIn("cashier_john", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/settlements/day-closes")

    def test_production_job_completed_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_production_job_completed_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_production_job_completed_notification(
                job_id=808,
                job_no="JOB-2026-042",
                product_name="Solid Oak Dining Table",
                completed_qty_str="5.000",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="inventory",
            payload__category="PRODUCTION_JOB_COMPLETED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("JOB-2026-042", admin_notif.body)
        self.assertIn("Solid Oak Dining Table", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/operations")

    def test_partner_collection_request_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_partner_collection_request_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_partner_collection_request_notification(
                request_id=909,
                partner_username="partner_sharma",
                customer_name="Sunil Dutt",
                amount_str="1200.00",
                reference_no="PARTNER-REC-01",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="partners",
            payload__category="PARTNER_COLLECTION_REQUEST",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("partner_sharma", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/partners/collection-requests")

    def test_rental_asset_posture_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_rental_asset_posture_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_rental_asset_posture_notification(
                asset_id=1010,
                asset_code="RA-SOFA-001",
                product_name="Fabric Recliner",
                status_label="UNDER_REPAIR",
                is_damaged=True,
                notes="Leg broken during return",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="rent",
            payload__category="RENTAL_ASSET_UPDATED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertEqual(admin_notif.payload.get("severity"), "WARNING")
        self.assertIn("RA-SOFA-001", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/rent-lease/assets")

    def test_reconciliation_completed_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_reconciliation_completed_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_reconciliation_completed_notification(
                run_id=1111,
                total_checked=250,
                total_matched=248,
                total_exceptions=2,
                high_risk_count=1,
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="reconciliation",
            payload__category="RECONCILIATION_COMPLETED",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertEqual(admin_notif.payload.get("severity"), "WARNING")
        self.assertIn("1111", admin_notif.body)
        self.assertIn("2 exceptions", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/reports/reconciliation")

    def test_stock_adjustment_notifies_admin(self):
        from subscriptions.services.operational_notification_service import (
            schedule_stock_adjustment_notification,
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_stock_adjustment_notification(
                ledger_id=1212,
                product_name="Office Chair Ergonomic",
                movement_type="DAMAGE",
                quantity_str="2.000",
                location_name="Main Showroom",
                notes="Water damage from leak",
            )

        admin_notif = Notification.objects.filter(
            recipient=self.admin,
            module="inventory",
            payload__category="STOCK_ADJUSTMENT",
        ).first()
        self.assertIsNotNone(admin_notif)
        self.assertEqual(admin_notif.payload.get("severity"), "WARNING")
        self.assertIn("Office Chair Ergonomic", admin_notif.body)
        self.assertIn("DAMAGE", admin_notif.body)
        self.assertEqual(admin_notif.payload.get("action_url"), "/admin/inventory/workspace")
