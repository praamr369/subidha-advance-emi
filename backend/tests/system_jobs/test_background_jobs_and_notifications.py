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
