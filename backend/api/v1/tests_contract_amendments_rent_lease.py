from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from contracts.models import ContractItem, RentSubscriptionProfile, Subscription
from contracts.services.rent_lease_contract_service import create_rent_contract
from customers.models import Customer
from products_core.models import Product
from subscriptions.models import AuditLog, ContractAmendment, PlanType, RentLeaseBillingDemand, SubscriptionStatus


class ContractAmendmentsRentLeaseApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_rent_test", password="pass1234", role="ADMIN", phone="9800000200"
        )
        self.customer_user = User.objects.create_user(
            username="cust_rent_test", password="pass1234", role="CUSTOMER", phone="9800000201"
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Rent Customer",
            phone="9800000201",
            address="123 Park Street",
            kyc_status="VERIFIED",
        )

        self.bed = Product.objects.create(
            product_code="BED-TEAK-01",
            name="Teak Wood Double Bed",
            base_price=Decimal("20000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
        )
        self.mattress = Product.objects.create(
            product_code="MAT-ORTHO-02",
            name="Orthopedic Mattress",
            base_price=Decimal("10000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
        )
        self.luxury_mattress = Product.objects.create(
            product_code="MAT-LUX-03",
            name="Luxury Latex Mattress",
            base_price=Decimal("15000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
        )
        self.emi_only_product = Product.objects.create(
            product_code="EMI-SOFA-99",
            name="Advance EMI Sofa",
            base_price=Decimal("12000.00"),
            is_active=True,
            is_rent_enabled=False,
            is_lease_enabled=False,
            is_emi_enabled=True,
        )

        # Create multi-product Rent contract: 1 Bed (20k @ 5% = 1000/mo) + 2 Mattresses (20k @ 5% = 1000/mo)
        # Total product value = 40,000, Monthly rent = 2,000, Tenure = 6 mos, Total = 12,000, Deposit = 8,000 (20%)
        self.subscription = create_rent_contract(
            customer=self.customer,
            items=[
                {"product": self.bed, "quantity": 1, "unit_base_price": Decimal("20000.00"), "monthly_yield_percent": Decimal("5.00"), "security_deposit_percent": Decimal("20.00")},
                {"product": self.mattress, "quantity": 2, "unit_base_price": Decimal("10000.00"), "monthly_yield_percent": Decimal("5.00"), "security_deposit_percent": Decimal("20.00")},
            ],
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        self.bed_item = self.subscription.contract_items.get(product=self.bed)
        self.mattress_item = self.subscription.contract_items.get(product=self.mattress)

    def test_customer_can_request_product_return_amendment(self):
        """Customer can request to return 1 of their 2 mattresses."""
        self.client.force_authenticate(user=self.customer_user)
        payload = {
            "contract_type": "RENT_LEASE",
            "rent_lease_contract": self.subscription.id,
            "amendment_type": "PRODUCT_CHANGE",
            "reason": "Customer no longer needs 2nd mattress",
            "requested_values": {
                "action": "RETURN",
                "contract_item_id": self.mattress_item.id,
                "quantity": 1,
                "reason": "Returning 1 mattress",
            },
        }
        res = self.client.post("/api/v1/customer/contract-amendments/", payload, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        amendment_id = res.data["id"]

        amendment = ContractAmendment.objects.get(pk=amendment_id)
        self.assertEqual(amendment.status, "REQUESTED")
        self.assertEqual(amendment.contract_type, "RENT_LEASE")
        self.assertEqual(amendment.requested_role, "CUSTOMER")

    def test_preview_rent_lease_item_amendment_calculations(self):
        """Preview calculates exact changes: returning 1 mattress decreases monthly from 2000 to 1500."""
        amendment = ContractAmendment.objects.create(
            contract_type="RENT_LEASE",
            rent_lease_contract=self.subscription,
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            reason="Return 1 mattress",
            requested_values={
                "action": "RETURN",
                "contract_item_id": self.mattress_item.id,
                "quantity": 1,
            },
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/rent-lease-preview/")
        self.assertEqual(res.status_code, 200, res.data)
        data = res.data

        self.assertTrue(data["execution_supported"])
        self.assertEqual(data["current_monthly_amount"], "2000.00")
        self.assertEqual(data["proposed_monthly_amount"], "1500.00")
        self.assertEqual(data["monthly_amount_difference"], "-500.00")
        self.assertEqual(data["current_product_value"], "40000.00")
        self.assertEqual(data["proposed_product_value"], "30000.00")
        self.assertEqual(data["current_deposit_amount"], "8000.00")
        self.assertEqual(data["proposed_deposit_amount"], "6000.00")
        self.assertEqual(len(data["current_items"]), 2)
        self.assertEqual(len(data["proposed_items"]), 2)

    def test_admin_approve_and_implement_partial_product_return(self):
        """Admin approves and implements partial return: 1 mattress returned, 1 remains."""
        amendment = ContractAmendment.objects.create(
            contract_type="RENT_LEASE",
            rent_lease_contract=self.subscription,
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            reason="Customer wants to return 1 mattress",
            requested_values={
                "action": "RETURN",
                "contract_item_id": self.mattress_item.id,
                "quantity": 1,
            },
        )
        self.client.force_authenticate(user=self.admin)

        # 1. Admin approves
        approve_res = self.client.post(
            f"/api/v1/admin/contract-amendments/{amendment.id}/approve/",
            {"approved_values": amendment.requested_values, "admin_note": "Approved after inspection."},
            format="json",
        )
        self.assertEqual(approve_res.status_code, 200, approve_res.data)
        amendment.refresh_from_db()
        self.assertEqual(amendment.status, "APPROVED")

        # 2. Admin implements
        impl_res = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/")
        self.assertEqual(impl_res.status_code, 200, impl_res.data)
        amendment.refresh_from_db()
        self.assertEqual(amendment.status, "IMPLEMENTED")

        # 3. Check contract item updates
        self.mattress_item.refresh_from_db()
        self.assertEqual(self.mattress_item.quantity, 1)  # 2 - 1 = 1 remaining
        self.assertEqual(self.mattress_item.returned_quantity, 1)
        self.assertEqual(self.mattress_item.status, "ACTIVE")
        self.assertEqual(self.mattress_item.total_base_price, Decimal("10000.00"))
        self.assertEqual(self.mattress_item.monthly_amount, Decimal("500.00"))

        # 4. Check subscription updates
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.monthly_amount, Decimal("1500.00"))
        self.assertEqual(self.subscription.total_amount, Decimal("9000.00"))  # 1500 * 6

        # 5. Check rent profile deposit update
        self.subscription.rent_profile.refresh_from_db()
        self.assertEqual(self.subscription.rent_profile.security_deposit_amount, Decimal("6000.00"))

        # 6. Check uncollected monthly demands update
        pending_demands = RentLeaseBillingDemand.objects.filter(
            subscription=self.subscription,
            demand_type="MONTHLY_RENT",
            status="PENDING",
        )
        for dem in pending_demands:
            self.assertEqual(dem.amount, Decimal("1500.00"))

        # 7. Check audit log
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED,
                object_id=str(self.subscription.id),
            ).exists()
        )

    def test_admin_approve_and_implement_product_upgrade(self):
        """Customer upgrades mattress to luxury mattress."""
        amendment = ContractAmendment.objects.create(
            contract_type="RENT_LEASE",
            rent_lease_contract=self.subscription,
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            reason="Upgrade mattress to luxury",
            requested_values={
                "action": "UPGRADE",
                "contract_item_id": self.mattress_item.id,
                "new_product_id": self.luxury_mattress.id,
                "new_quantity": 2,
            },
        )
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"/api/v1/admin/contract-amendments/{amendment.id}/approve/",
            {"approved_values": amendment.requested_values},
            format="json",
        )
        self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/")

        amendment.refresh_from_db()
        self.assertEqual(amendment.status, "IMPLEMENTED")

        # Old mattress item is marked UPGRADED
        self.mattress_item.refresh_from_db()
        self.assertEqual(self.mattress_item.status, "UPGRADED")
        self.assertIsNotNone(self.mattress_item.returned_at)

        # New luxury mattress item is created
        lux_item = self.subscription.contract_items.get(product=self.luxury_mattress)
        self.assertEqual(lux_item.status, "ACTIVE")
        self.assertEqual(lux_item.quantity, 2)
        self.assertEqual(lux_item.unit_base_price, Decimal("15000.00"))
        self.assertEqual(lux_item.total_base_price, Decimal("30000.00"))
        self.assertEqual(lux_item.monthly_amount, Decimal("1500.00"))  # 30k * 5%

        # Subscription totals updated: Bed (1000) + Luxury Mattress (1500) = 2500/mo
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.monthly_amount, Decimal("2500.00"))
        self.assertEqual(self.subscription.total_amount, Decimal("15000.00"))  # 2500 * 6

    def test_cannot_remove_all_products(self):
        """Contract amendment cannot remove all products from a contract."""
        amendment = ContractAmendment.objects.create(
            contract_type="RENT_LEASE",
            rent_lease_contract=self.subscription,
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            reason="Try to return everything",
            requested_values={
                "item_actions": [
                    {"contract_item_id": self.bed_item.id, "action": "RETURN", "quantity": 1},
                    {"contract_item_id": self.mattress_item.id, "action": "RETURN", "quantity": 2},
                ]
            },
        )
        self.client.force_authenticate(user=self.admin)
        preview_res = self.client.get(f"/api/v1/admin/contract-amendments/{amendment.id}/rent-lease-preview/")
        self.assertEqual(preview_res.status_code, 200)
        self.assertFalse(preview_res.data["execution_supported"])
        self.assertTrue(any("cannot remove all products" in b for b in preview_res.data["blocker_reasons"]))

    def test_customer_can_access_rent_lease_preview(self):
        """Customer can access their rent-lease preview endpoint."""
        amendment = ContractAmendment.objects.create(
            contract_type="RENT_LEASE",
            rent_lease_contract=self.subscription,
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="PRODUCT_CHANGE",
            reason="Return 1 mattress",
            requested_values={
                "action": "RETURN",
                "contract_item_id": self.mattress_item.id,
                "quantity": 1,
            },
        )
        self.client.force_authenticate(user=self.customer_user)
        res = self.client.get(f"/api/v1/customer/contract-amendments/{amendment.id}/rent-lease-preview/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["proposed_monthly_amount"], "1500.00")
