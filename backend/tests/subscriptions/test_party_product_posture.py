"""Party 360 product posture for partner and vendor profiles.

Partners must see the Advance EMI / rent-lease / direct-sale breakdown of the
contracts they referred (rent/lease money lives on demands, never on Payment),
and vendors must see what we owe them from the vendor ledger.
"""
from datetime import date
from decimal import Decimal

from django.db.models import F
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import EmployeeProfile, StaffAdvance, Vendor, VendorLedgerEntry
from accounts.models import StaffIdentity, UserRole
from contracts.services.rent_lease_billing_service import generate_monthly_demands_for_subscription
from contracts.services.rent_lease_contract_service import create_rent_contract
from payments.models import RentLeaseCollection
from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandType, Subscription
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_partner_user,
    create_payment_collection_finance_account,
    create_product,
    create_user,
)


class PartyProductPostureTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="posture_admin", phone="9102000001")
        self.client.force_authenticate(user=self.admin)

    def _resolve(self, role: str, source_id: int):
        return self.client.get(f"/api/v1/crm/parties/resolve/?role={role}&source_id={source_id}")

    def test_partner_sees_referred_rent_contract_by_product(self):
        partner = create_partner_user(username="posture_partner", phone="9102000002")
        customer = create_customer_profile(name="Posture Rent Customer", phone="9102000003")
        product = create_product(
            name="Posture Rent Sofa",
            product_code="POSTURE-RENT",
            base_price=Decimal("12000.00"),
        )
        product.is_rent_enabled = True
        product.save(update_fields=["is_rent_enabled"])
        subscription = create_rent_contract(
            customer=customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        Subscription.objects.filter(pk=subscription.pk).update(partner=partner)
        generate_monthly_demands_for_subscription(
            subscription=subscription,
            through_date=date(2026, 8, 1),
            performed_by=self.admin,
        )
        first_month = (
            RentLeaseBillingDemand.objects.filter(
                subscription=subscription, demand_type=RentLeaseDemandType.RENT_MONTHLY
            )
            .order_by("due_date")
            .first()
        )
        self.assertIsNotNone(first_month)
        RentLeaseBillingDemand.objects.filter(pk=first_month.pk).update(
            collected_amount=F("amount"), status="PAID"
        )
        subscription.refresh_from_db()

        response = self._resolve("PARTNER", partner.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        posture = response.data["product_posture"]
        rent_lease = posture["rent_lease"]
        self.assertEqual(rent_lease["count"], 1)
        self.assertEqual(rent_lease["rent_count"], 1)
        self.assertEqual(Decimal(rent_lease["value"]), subscription.total_amount)
        self.assertEqual(Decimal(rent_lease["paid"]), first_month.amount)
        self.assertEqual(posture["advance_emi"]["count"], 0)
        self.assertEqual(posture["totals"]["active_count"], 1)
        self.assertIsNone(response.data["vendor_payables"])

    def test_vendor_sees_payables_from_ledger(self):
        vendor = Vendor.objects.create(name="Posture Timber Supplies")
        VendorLedgerEntry.objects.create(
            vendor=vendor,
            entry_type="PURCHASE_BILL",
            source_type="VENDOR_BILL",
            debit=Decimal("10000.00"),
            balance_after=Decimal("10000.00"),
        )
        VendorLedgerEntry.objects.create(
            vendor=vendor,
            entry_type="PAYMENT_TO_VENDOR",
            source_type="VENDOR_PAYMENT",
            credit=Decimal("4000.00"),
            balance_after=Decimal("6000.00"),
        )

        response = self._resolve("VENDOR", vendor.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        payables = response.data["vendor_payables"]
        self.assertEqual(payables["vendor_count"], 1)
        self.assertEqual(payables["billed"], "10000.00")
        self.assertEqual(payables["paid"], "4000.00")
        self.assertEqual(payables["payable"], "6000.00")
        self.assertEqual(payables["advance"], "0.00")
        self.assertIsNotNone(payables["last_bill_date"])
        self.assertEqual(response.data["product_posture"]["totals"]["active_count"], 0)

    def test_staff_sees_collections_handled_and_advance_outstanding(self):
        employee = EmployeeProfile.objects.create(
            name="Posture Collector",
            designation="Collections",
            department="Ops",
            phone="9102000010",
            joining_date=date(2024, 1, 1),
        )
        # StaffIdentity only accepts a STAFF-role user.
        staff_user = create_user(
            username="posture_staff", role=UserRole.STAFF, phone="9102000011", is_staff=True
        )
        StaffIdentity.objects.create(user=staff_user, employee=employee)

        customer = create_customer_profile(name="Posture Staff Customer", phone="9102000012")
        product = create_product(
            name="Posture Staff Bed",
            product_code="POSTURE-STAFF",
            base_price=Decimal("12000.00"),
        )
        product.is_rent_enabled = True
        product.save(update_fields=["is_rent_enabled"])
        subscription = create_rent_contract(
            customer=customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        generate_monthly_demands_for_subscription(
            subscription=subscription,
            through_date=date(2026, 6, 1),
            performed_by=self.admin,
        )
        first_month = RentLeaseBillingDemand.objects.filter(
            subscription=subscription, demand_type=RentLeaseDemandType.RENT_MONTHLY
        ).order_by("due_date").first()
        finance_account = create_payment_collection_finance_account(
            code="POSTURE-CASH", name="Posture Cash Desk", kind="CASH"
        )
        RentLeaseCollection.objects.create(
            demand=first_month,
            subscription=subscription,
            customer=customer,
            plan_type="RENT",
            amount=first_month.amount,
            payment_date=date(2026, 6, 1),
            payment_method="CASH",
            finance_account=finance_account,
            created_by=staff_user,
        )
        StaffAdvance.objects.create(
            employee=employee,
            request_date=date(2026, 6, 1),
            amount=Decimal("5000.00"),
            recovered_amount=Decimal("2000.00"),
            reason="Festival advance",
            status="DISBURSED",
        )

        response = self._resolve("STAFF", employee.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        staff = response.data["staff_posture"]
        self.assertTrue(staff["has_login"])
        self.assertEqual(staff["collections"]["rent_lease"]["count"], 1)
        self.assertEqual(Decimal(staff["collections"]["rent_lease"]["amount"]), first_month.amount)
        self.assertEqual(Decimal(staff["collections"]["total"]), first_month.amount)
        self.assertEqual(staff["collections"]["advance_emi"]["count"], 0)
        self.assertEqual(staff["payroll"]["advance_outstanding"], "3000.00")
