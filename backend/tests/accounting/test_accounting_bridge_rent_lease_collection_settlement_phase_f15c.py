from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, DocumentSequence, JournalEntry
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus
from subscriptions.models import PlanType, RentLeaseBillingDemand, RentLeaseDemandStatus, RentLeaseDemandType, Subscription, SubscriptionStatus
from subscriptions.models_rent_lease_collection import RentLeaseCollection, RentLeaseCollectionStatus
from subscriptions.services.rent_lease_collection_workflow_service import collect_rent_lease_monthly_demand
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_customer_user, create_product


class AccountingBridgeRentLeaseCollectionSettlementPhaseF15CTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f15c_admin", phone="9305150001")
        self.cashier = create_cashier_user(username="phase_f15c_cashier", phone="9305150002")
        self.customer_user = create_customer_user(username="phase_f15c_customer", phone="9305150003")
        self.customer = create_customer_profile(user=self.customer_user, name="F15C Customer", phone="9305150003")
        self.product = create_product(name="F15C Sofa", product_code="F15C-SOFA", base_price=Decimal("24000.00"))
        self.product.is_rent_enabled = True
        self.product.is_lease_enabled = True
        self.product.save(update_fields=["is_rent_enabled", "is_lease_enabled"])
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]
        self.client.force_authenticate(user=self.admin)

    def _subscription(self, *, plan_type=PlanType.RENT, suffix="R"):
        return Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=plan_type,
            tenure_months=12,
            start_date=self.today,
            total_amount=Decimal("24000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
            subscription_number=f"F15C-{suffix}-{self.today:%Y%m%d}",
            waived_amount=Decimal("0.00"),
        )

    def _demand(self, subscription, *, suffix="001"):
        demand_type = RentLeaseDemandType.RENT_MONTHLY if subscription.plan_type == PlanType.RENT else RentLeaseDemandType.LEASE_MONTHLY
        return RentLeaseBillingDemand.objects.create(
            subscription=subscription,
            demand_type=demand_type,
            status=RentLeaseDemandStatus.PENDING,
            billing_period_start=date(self.today.year, self.today.month, 1),
            billing_period_end=date(self.today.year, self.today.month, 28),
            due_date=self.today,
            amount=Decimal("2000.00"),
            collected_amount=Decimal("0.00"),
            reference_key=f"RL-F15C-{subscription.plan_type}-{suffix}",
        )

    def _collection(self, *, plan_type=PlanType.RENT, amount=Decimal("1000.00"), suffix="001"):
        subscription = self._subscription(plan_type=plan_type, suffix=f"{plan_type}-{suffix}")
        demand = self._demand(subscription, suffix=suffix)
        collect_rent_lease_monthly_demand(
            subscription=subscription,
            demand_id=demand.id,
            amount=amount,
            performed_by=self.admin,
            reference_no=f"F15C-{plan_type}-{suffix}",
            finance_account_id=self.finance_account.id,
            payment_method="CASH",
            payment_date=self.today,
            idempotency_key=f"f15c-{plan_type}-{suffix}",
        )
        return RentLeaseCollection.objects.select_related("demand", "subscription", "customer", "finance_account").get(external_reference_no=f"F15C-{plan_type}-{suffix}")

    def _candidate_id(self, collection):
        event_key = "rent_payment_settlement" if collection.plan_type == PlanType.RENT else "lease_payment_settlement"
        return f"rentleasecollection:{collection.id}:{event_key}"

    def _collection_snapshot(self, collection):
        collection.refresh_from_db()
        collection.demand.refresh_from_db()
        collection.subscription.refresh_from_db()
        collection.customer.refresh_from_db()
        collection.finance_account.refresh_from_db()
        return {
            "collection": {
                "amount": collection.amount,
                "status": collection.status,
                "payment_date": collection.payment_date,
                "payment_method": collection.payment_method,
                "finance_account_id": collection.finance_account_id,
            },
            "demand": {"status": collection.demand.status, "collected_amount": collection.demand.collected_amount},
            "subscription": {"status": collection.subscription.status, "monthly_amount": collection.subscription.monthly_amount},
            "customer": {"name": collection.customer.name, "phone": collection.customer.phone},
            "finance_account": {"is_active": collection.finance_account.is_active, "chart_account_id": collection.finance_account.chart_account_id},
        }

    def test_concrete_rent_and_lease_candidate_generation(self):
        rent = self._collection(plan_type=PlanType.RENT, suffix="RENT")
        lease = self._collection(plan_type=PlanType.LEASE, suffix="LEASE")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseCollection")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {int(row["source_pk"]): row for row in response.data["results"]}
        self.assertEqual(rows[rent.id]["event_key"], "rent_payment_settlement")
        self.assertEqual(rows[lease.id]["event_key"], "lease_payment_settlement")
        self.assertEqual(rows[rent.id]["status"], "READY_UNPOSTED")
        self.assertTrue(rows[rent.id]["can_post"])
        self.assertEqual(rows[lease.id]["source_model"], "RentLeaseCollection")

    def test_preview_is_read_only_and_balanced(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="PREVIEW")
        before = {
            "snapshot": self._collection_snapshot(collection),
            "journals": JournalEntry.objects.count(),
            "bridges": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(collection)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "RentLeaseCollection")
        self.assertEqual(response.data["total_debit"], "1000.00")
        self.assertEqual(response.data["total_credit"], "1000.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertFalse(response.data.get("tax_lines"))
        self.assertIn("read-only", response.data["safety_text"])
        after = {
            "snapshot": self._collection_snapshot(collection),
            "journals": JournalEntry.objects.count(),
            "bridges": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_idempotent_pending_verify_and_no_source_mutation(self):
        collection = self._collection(plan_type=PlanType.LEASE, suffix="POST")
        before = self._collection_snapshot(collection)
        candidate_id = self._candidate_id(collection)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="RentLeaseCollection", source_id=str(collection.id), purpose="LEASE_PAYMENT_SETTLEMENT").count(), 1)
        item = ReconciliationItem.objects.get(source_type="RentLeaseCollection", source_id=str(collection.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._collection_snapshot(collection), before)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_blockers_and_non_admin(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="BLOCK")
        self.finance_account.is_active = False
        self.finance_account.save(update_fields=["is_active"])
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseCollection")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == collection.id)
        self.assertEqual(row["status"], "BLOCKED_BY_FINANCE_ACCOUNT")
        self.assertFalse(row["can_post"])
        self.client.force_authenticate(user=self.cashier)
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(collection)}/post/", {"idempotency_key": row["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(post.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_voided_collection_is_not_postable_and_f14_rows_still_exist(self):
        collection = self._collection(plan_type=PlanType.RENT, suffix="VOID")
        collection.status = RentLeaseCollectionStatus.VOIDED
        collection.voided_at = timezone.now()
        collection.voided_by = self.admin
        collection.void_reason = "test"
        collection.save()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseCollection")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == collection.id)
        self.assertEqual(row["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertFalse(row["can_post"])
        f14_response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=RentLeaseBillingDemand")
        self.assertEqual(f14_response.status_code, status.HTTP_200_OK, f14_response.data)
