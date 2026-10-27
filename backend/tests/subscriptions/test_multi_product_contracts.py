from decimal import Decimal
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from accounts.models import User
from customers.models import Customer
from products_core.models import Product
from subscriptions.models import (
    ContractItem,
    Emi,
    EmiStatus,
    PlanType,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionStatus,
)
from contracts.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from contracts.services.document_pdf_service import render_rent_contract_pdf, render_lease_contract_pdf
from contracts.services.contract_pdf_service import generate_contract_pdf_for_subscription
from api.v1.serializers.contracts import (
    AdminRentContractCreateSerializer,
    AdminLeaseContractCreateSerializer,
)


from tests.helpers import create_admin_user, create_customer_profile, create_batch, create_lucky_id


class MultiProductRentLeaseContractTests(TestCase):
    def setUp(self):
        self.user = create_admin_user(username="admin_test", phone="9876543211")
        self.customer = create_customer_profile(
            name="Ramesh Sharma",
            phone="9876543210",
        )
        self.customer.kyc_status = "VERIFIED"
        self.customer.save()
        self.product1 = Product.objects.create(
            name="Double Bed Solid Teak",
            product_code="BED-001",
            base_price=Decimal("20000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
            is_emi_enabled=True,
        )
        self.product2 = Product.objects.create(
            name="Orthopedic Mattress",
            product_code="MAT-002",
            base_price=Decimal("10000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
            is_emi_enabled=True,
        )
        self.product3 = Product.objects.create(
            name="Bedside Center Table",
            product_code="TBL-003",
            base_price=Decimal("5000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
            is_emi_enabled=True,
        )
        self.emi_only_product = Product.objects.create(
            name="Exclusive EMI Sofa",
            product_code="SOFA-EMI",
            base_price=Decimal("15000.00"),
            is_active=True,
            is_rent_enabled=False,
            is_lease_enabled=False,
            is_emi_enabled=True,
        )

    def test_multi_product_rent_contract_creation(self):
        """Test creating a single Rent contract with 3 furniture items."""
        items = [
            {
                "product": self.product1,
                "quantity": 1,
                "unit_base_price": Decimal("20000.00"),
                "monthly_yield_percent": Decimal("5.00"),
            },
            {
                "product": self.product2,
                "quantity": 2,  # 2 mattresses = 20,000
                "unit_base_price": Decimal("10000.00"),
                "monthly_yield_percent": Decimal("5.00"),
            },
            {
                "product": self.product3,
                "quantity": 2,  # 2 tables = 10,000
                "unit_base_price": Decimal("5000.00"),
                "monthly_yield_percent": Decimal("5.00"),
            },
        ]
        # Total base value = 20,000 + 20,000 + 10,000 = 50,000
        # Monthly rent = (20,000 * 5%) + (20,000 * 5%) + (10,000 * 5%) = 1000 + 1000 + 500 = 2,500
        # Tenure = 6 months -> Total amount = 2,500 * 6 = 15,000
        # Deposit = 50,000 * 20% = 10,000

        sub = create_rent_contract(
            customer=self.customer,
            items=items,
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.user,
        )

        self.assertEqual(sub.plan_type, PlanType.RENT)
        self.assertEqual(sub.product, self.product1)  # Primary product preserved
        self.assertEqual(sub.total_amount, Decimal("15000.00"))
        self.assertEqual(sub.monthly_amount, Decimal("2500.00"))

        # Verify contract items
        contract_items = list(sub.contract_items.all().order_by("id"))
        self.assertEqual(len(contract_items), 3)

        self.assertEqual(contract_items[0].product, self.product1)
        self.assertEqual(contract_items[0].quantity, 1)
        self.assertEqual(contract_items[0].total_base_price, Decimal("20000.00"))
        self.assertEqual(contract_items[0].monthly_amount, Decimal("1000.00"))
        self.assertEqual(contract_items[0].security_deposit_amount, Decimal("4000.00"))

        self.assertEqual(contract_items[1].product, self.product2)
        self.assertEqual(contract_items[1].quantity, 2)
        self.assertEqual(contract_items[1].total_base_price, Decimal("20000.00"))
        self.assertEqual(contract_items[1].monthly_amount, Decimal("1000.00"))
        self.assertEqual(contract_items[1].security_deposit_amount, Decimal("4000.00"))

        self.assertEqual(contract_items[2].product, self.product3)
        self.assertEqual(contract_items[2].quantity, 2)
        self.assertEqual(contract_items[2].total_base_price, Decimal("10000.00"))
        self.assertEqual(contract_items[2].monthly_amount, Decimal("500.00"))
        self.assertEqual(contract_items[2].security_deposit_amount, Decimal("2000.00"))

        # Rent profile deposit
        self.assertEqual(sub.rent_profile.security_deposit_amount, Decimal("10000.00"))
        self.assertEqual(sub.rent_profile.security_deposit_percent, Decimal("20.00"))

        # PDF generation works cleanly
        pdf_bytes = render_rent_contract_pdf(contract=sub.rent_profile)
        self.assertTrue(len(pdf_bytes) > 500)

    def test_multi_product_lease_contract_creation(self):
        """Test creating a single Lease contract with multiple products."""
        items = [
            {
                "product": self.product1,
                "quantity": 1,
                "unit_base_price": Decimal("20000.00"),
                "monthly_yield_percent": Decimal("4.00"),
            },
            {
                "product": self.product3,
                "quantity": 1,
                "unit_base_price": Decimal("5000.00"),
                "monthly_yield_percent": Decimal("4.00"),
            },
        ]
        # Total base value = 25,000
        # Monthly lease = (20,000 * 4%) + (5,000 * 4%) = 800 + 200 = 1,000
        # Tenure = 12 months -> Total amount = 12,000
        # Deposit = 25,000 * 25% = 6,250

        sub = create_lease_contract(
            customer=self.customer,
            items=items,
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            buyout_amount=Decimal("5000.00"),
            ownership_transfer_allowed=True,
            performed_by=self.user,
        )

        self.assertEqual(sub.plan_type, PlanType.LEASE)
        self.assertEqual(sub.total_amount, Decimal("12000.00"))
        self.assertEqual(sub.monthly_amount, Decimal("1000.00"))
        self.assertEqual(sub.lease_profile.security_deposit_amount, Decimal("6250.00"))
        self.assertEqual(sub.lease_profile.buyout_amount, Decimal("5000.00"))
        self.assertTrue(sub.lease_profile.ownership_transfer_allowed)

        self.assertEqual(sub.contract_items.count(), 2)

        pdf_bytes = render_lease_contract_pdf(contract=sub.lease_profile)
        self.assertTrue(len(pdf_bytes) > 500)

    def test_single_product_backward_compatibility(self):
        """Single product creation via product= continues to work identically."""
        sub = create_rent_contract(
            customer=self.customer,
            product=self.product1,
            tenure_months=3,
            security_deposit_percent=Decimal("20.00"),
            monthly_yield_percent=Decimal("5.00"),
            performed_by=self.user,
        )
        # Base value = 20,000 -> Monthly = 1,000 -> Total = 3,000 -> Deposit = 4,000
        self.assertEqual(sub.total_amount, Decimal("3000.00"))
        self.assertEqual(sub.monthly_amount, Decimal("1000.00"))
        self.assertEqual(sub.rent_profile.security_deposit_amount, Decimal("4000.00"))
        self.assertEqual(sub.contract_items.count(), 1)
        item = sub.contract_items.first()
        self.assertEqual(item.product, self.product1)
        self.assertEqual(item.quantity, 1)

    def test_strict_isolation_advance_emi_cannot_have_contract_items(self):
        """Lucky Plan Advance EMI subscriptions MUST NOT have ContractItems attached."""
        batch = create_batch(batch_code="B2026TEST", duration_months=10)
        lucky = create_lucky_id(batch=batch, lucky_number=1)

        sub = Subscription.objects.create(
            customer=self.customer,
            product=self.emi_only_product,
            batch=batch,
            lucky_id=lucky,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=timezone.localdate(),
            total_amount=Decimal("15000.00"),
            monthly_amount=Decimal("1500.00"),
            status=SubscriptionStatus.ACTIVE,
        )

        # Attempting to attach a ContractItem to an EMI subscription must raise ValidationError
        item = ContractItem(
            subscription=sub,
            product=self.product1,
            quantity=1,
            unit_base_price=Decimal("20000.00"),
        )
        with self.assertRaises(ValidationError) as ctx:
            item.full_clean()
        self.assertIn("subscription", ctx.exception.message_dict)

    def test_serializer_validation_multi_product(self):
        """Test API serializers accept items payload properly."""
        serializer = AdminRentContractCreateSerializer(
            data={
                "customer": self.customer.id,
                "items": [
                    {"product": self.product1.id, "quantity": 1, "unit_base_price": "20000.00"},
                    {"product": self.product2.id, "quantity": 1, "unit_base_price": "10000.00"},
                ],
                "tenure_months": 6,
                "security_deposit_percent": "20.00",
                "monthly_yield_percent": "5.00",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(len(serializer.validated_data["items"]), 2)

    def test_api_view_create_rent_with_multiple_items(self):
        """Test full API view creation for Rent with multiple products."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.user)

        response = client.post(
            "/api/v1/admin/contracts/rent/",
            data={
                "customer": self.customer.id,
                "items": [
                    {"product": self.product1.id, "quantity": 1, "unit_base_price": "20000.00"},
                    {"product": self.product2.id, "quantity": 2, "unit_base_price": "10000.00"},
                ],
                "tenure_months": 6,
                "security_deposit_percent": "20.00",
                "monthly_yield_percent": "5.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        data = response.data
        self.assertEqual(data["plan_type"], "RENT")
        self.assertEqual(data["total_amount"], "12000.00")
        self.assertEqual(data["monthly_amount"], "2000.00")
        self.assertIn("contract_items", data)
        self.assertEqual(len(data["contract_items"]), 2)
        self.assertEqual(data["contract_items"][0]["quantity"], 1)
        self.assertEqual(data["contract_items"][1]["quantity"], 2)

    def test_manual_custom_deposit_and_yield_per_product(self):
        """Test admin can manually configure different yield rate and deposit percent per product."""
        items = [
            {
                "product": self.product1,
                "quantity": 1,
                "unit_base_price": Decimal("20000.00"),
                "monthly_yield_percent": Decimal("6.00"),  # 6% yield
                "security_deposit_percent": Decimal("25.00"),  # 25% deposit = 5,000
            },
            {
                "product": self.product2,
                "quantity": 1,
                "unit_base_price": Decimal("10000.00"),
                "monthly_yield_percent": Decimal("7.50"),  # 7.5% yield
                "security_deposit_percent": Decimal("15.00"),  # 15% deposit = 1,500
            },
        ]
        # Base: 20k + 10k = 30k
        # Monthly: (20k * 6%) + (10k * 7.5%) = 1200 + 750 = 1,950.00
        # Deposit: (20k * 25%) + (10k * 15%) = 5000 + 1500 = 6,500.00
        # Effective deposit %: (6500 / 30000) * 100 = 21.67%

        sub = create_rent_contract(
            customer=self.customer,
            items=items,
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.user,
        )

        self.assertEqual(sub.monthly_amount, Decimal("1950.00"))
        self.assertEqual(sub.total_amount, Decimal("11700.00"))  # 1950 * 6
        self.assertEqual(sub.rent_profile.security_deposit_amount, Decimal("6500.00"))
        self.assertEqual(sub.rent_profile.security_deposit_percent, Decimal("21.67"))

        c_items = list(sub.contract_items.all().order_by("id"))
        self.assertEqual(c_items[0].monthly_yield_percent, Decimal("6.00"))
        self.assertEqual(c_items[0].monthly_amount, Decimal("1200.00"))
        self.assertEqual(c_items[0].security_deposit_percent, Decimal("25.00"))
        self.assertEqual(c_items[0].security_deposit_amount, Decimal("5000.00"))

        self.assertEqual(c_items[1].monthly_yield_percent, Decimal("7.50"))
        self.assertEqual(c_items[1].monthly_amount, Decimal("750.00"))
        self.assertEqual(c_items[1].security_deposit_percent, Decimal("15.00"))
        self.assertEqual(c_items[1].security_deposit_amount, Decimal("1500.00"))


class PreActivationContractModificationTests(TestCase):
    def setUp(self):
        from tests.helpers import create_customer_user

        self.user = create_admin_user(username="admin_edit_test", phone="9876543212")
        cust_user1 = create_customer_user(username="cust_mod_1", phone="9876543213")
        self.customer1 = create_customer_profile(user=cust_user1, name="Customer One", phone="9876543213")
        self.customer1.kyc_status = "VERIFIED"
        self.customer1.save()

        cust_user2 = create_customer_user(username="cust_mod_2", phone="9876543214")
        self.customer2 = create_customer_profile(user=cust_user2, name="Customer Two", phone="9876543214")
        self.customer2.kyc_status = "VERIFIED"
        self.customer2.save()

        self.product1 = Product.objects.create(
            name="Dining Table Solid Wood",
            product_code="DT-001",
            base_price=Decimal("12000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
            is_emi_enabled=True,
        )
        self.product2 = Product.objects.create(
            name="Executive Office Chair",
            product_code="CH-002",
            base_price=Decimal("6000.00"),
            is_active=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
            is_emi_enabled=True,
        )

        self.batch1 = create_batch(batch_code="BATCH101", duration_months=10)
        self.lucky1 = create_lucky_id(batch=self.batch1, lucky_number=10)
        self.lucky2 = create_lucky_id(batch=self.batch1, lucky_number=11)

    def test_pre_activation_modify_emi_contract(self):
        from contracts.services.contract_lifecycle_service import modify_pre_activation_contract
        from subscriptions.models import LuckyIdStatus

        # Create draft EMI subscription
        sub = Subscription.objects.create(
            customer=self.customer1,
            product=self.product1,
            batch=self.batch1,
            lucky_id=self.lucky1,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=timezone.localdate(),
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1200.00"),
            status=SubscriptionStatus.DRAFT,
        )
        self.lucky1.status = LuckyIdStatus.ASSIGNED
        self.lucky1.save()

        # Modify to Customer Two, Product 2 (6000.00), Lucky ID 2
        updated = modify_pre_activation_contract(
            subscription=sub,
            performed_by=self.user,
            data={
                "customer": self.customer2.id,
                "product": self.product2.id,
                "lucky_id": self.lucky2.id,
                "tenure_months": 10,
            },
        )

        self.assertEqual(updated.customer_id, self.customer2.id)
        self.assertEqual(updated.product_id, self.product2.id)
        self.assertEqual(updated.total_amount, Decimal("6000.00"))
        self.assertEqual(updated.monthly_amount, Decimal("600.00"))
        self.assertEqual(updated.lucky_id_id, self.lucky2.id)

        # Check lucky status updates
        self.lucky1.refresh_from_db()
        self.lucky2.refresh_from_db()
        self.assertEqual(self.lucky1.status, LuckyIdStatus.AVAILABLE)
        self.assertEqual(self.lucky2.status, LuckyIdStatus.ASSIGNED)

        # Check draft EMIs were generated for updated amount
        emis = list(updated.emis.filter(status=EmiStatus.PENDING).order_by("month_no"))
        self.assertEqual(len(emis), 10)
        self.assertEqual(emis[0].amount, Decimal("600.00"))

    def test_pre_activation_modify_rent_contract(self):
        from contracts.services.contract_lifecycle_service import modify_pre_activation_contract

        sub = create_rent_contract(
            customer=self.customer1,
            product=self.product1,
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            monthly_yield_percent=Decimal("5.00"),
            performed_by=self.user,
            save_as_draft=True,
        )
        self.assertEqual(sub.status, SubscriptionStatus.DRAFT)
        self.assertEqual(sub.monthly_amount, Decimal("600.00"))  # 12k * 5%

        # Modify items basket to add product2 and change yield to 6% and tenure to 12
        updated = modify_pre_activation_contract(
            subscription=sub,
            performed_by=self.user,
            data={
                "items": [
                    {
                        "product": self.product1.id,
                        "quantity": 1,
                        "unit_base_price": "12000.00",
                        "monthly_yield_percent": "6.00",
                        "security_deposit_percent": "20.00",
                    },
                    {
                        "product": self.product2.id,
                        "quantity": 2,
                        "unit_base_price": "6000.00",
                        "monthly_yield_percent": "6.00",
                        "security_deposit_percent": "20.00",
                    },
                ],
                "tenure_months": 12,
                "monthly_yield_percent": "6.00",
                "security_deposit_percent": "20.00",
            },
        )

        # Product value: 12000 + 12000 = 24000
        # Monthly: 24000 * 6% = 1440.00
        # Total: 1440 * 12 = 17280.00
        # Deposit: 24000 * 20% = 4800.00
        self.assertEqual(updated.monthly_amount, Decimal("1440.00"))
        self.assertEqual(updated.total_amount, Decimal("17280.00"))
        self.assertEqual(updated.rent_profile.security_deposit_amount, Decimal("4800.00"))
        self.assertEqual(updated.contract_items.filter(status="ACTIVE").count(), 2)

    def test_modify_blocked_after_activation(self):
        from contracts.services.contract_lifecycle_service import modify_pre_activation_contract

        sub = create_rent_contract(
            customer=self.customer1,
            product=self.product1,
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.user,
            save_as_draft=False,  # Creates as ACTIVE
        )
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)

        with self.assertRaises(ValidationError) as ctx:
            modify_pre_activation_contract(
                subscription=sub,
                performed_by=self.user,
                data={"tenure_months": 12},
            )
        self.assertIn("Contract Amendments", str(ctx.exception))

    def test_modify_api_endpoint(self):
        from rest_framework.test import APIClient

        sub = create_rent_contract(
            customer=self.customer1,
            product=self.product1,
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.user,
            save_as_draft=True,
        )

        client = APIClient()
        client.force_authenticate(user=self.user)

        response = client.post(
            f"/api/v1/admin/contracts/{sub.id}/modify/",
            {
                "items": [
                    {
                        "product": self.product2.id,
                        "quantity": 1,
                        "unit_base_price": "6000.00",
                        "monthly_yield_percent": "5.00",
                        "security_deposit_percent": "20.00",
                    }
                ],
                "tenure_months": 10,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(Decimal(str(data["monthly_amount"])), Decimal("300.00"))  # 6k * 5%
        self.assertEqual(Decimal(str(data["total_amount"])), Decimal("3000.00"))  # 300 * 10



