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

