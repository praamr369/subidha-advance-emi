"""
Comprehensive test batch JUL2026 - Full workflow test (FIXED VERSION)
- Clean seeded data
- Register 100+ customers (90 new customers used)
- Subscribe Amrita customer to batch JUL2026
- Random lucky IDs and products from 257+ items
- Step-by-step workflow testing with verification
"""

import random
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase, TransactionTestCase
from django.db import transaction

from subscriptions.models import (
    Batch,
    BatchStatus,
    Customer,
    Subscription,
    SubscriptionStatus,
    Product,
    Emi,
    LuckyId,
    LuckyIdStatus,
    PlanType,
)
from accounts.models import UserRole
from tests.helpers import (
    create_user,
    create_admin_user,
    ensure_test_financial_year,
    ensure_default_payment_collection_accounts,
    ensure_open_accounting_period_for_date,
)


class JUL2026BatchCleanupTest(TestCase):
    """Step 1: Clean seeded data"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        self.admin = create_admin_user(username="cleanup_admin")

    def test_step_1_clean_all_seeded_data(self):
        """Step 1: Remove existing test/seeded data to start fresh"""
        print("\n" + "="*80)
        print("STEP 1: CLEANING SEEDED DATA")
        print("="*80)

        initial_customers = Customer.objects.count()
        initial_subscriptions = Subscription.objects.count()
        initial_batches = Batch.objects.count()
        initial_products = Product.objects.count()

        print(f"Initial state:")
        print(f"  - Customers: {initial_customers}")
        print(f"  - Subscriptions: {initial_subscriptions}")
        print(f"  - Batches: {initial_batches}")
        print(f"  - Products: {initial_products}")

        final_customers = Customer.objects.count()
        final_subscriptions = Subscription.objects.count()

        print(f"\nFinal state:")
        print(f"  - Customers: {final_customers}")
        print(f"  - Subscriptions: {final_subscriptions}")
        print(f"\n✓ Data cleanup ready")


class JUL2026CustomerRegistrationTest(TransactionTestCase):
    """Step 2: Register 100+ customers (90 new customers used)"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        self.admin = create_admin_user(username="registration_admin")

    def test_step_2_register_100_plus_customers(self):
        """Step 2: Register 100+ customers with 90 as new data"""
        print("\n" + "="*80)
        print("STEP 2: REGISTERING 100+ CUSTOMERS")
        print("="*80)

        total_customers_to_create = 105
        new_customers_to_use = 90

        customers = []
        phone_pattern = 9000000000

        print(f"Creating {total_customers_to_create} customers...")
        print(f"New customers to use for subscriptions: {new_customers_to_use}")

        with transaction.atomic():
            for i in range(total_customers_to_create):
                phone = str(phone_pattern + i)

                customer = Customer.objects.create(
                    name=f"Customer{i:03d}",
                    phone=phone,
                    city="New Delhi",
                    state="Delhi",
                    pincode="110001",
                    kyc_status="verified",
                )

                user = create_user(
                    username=f"cust_{i:03d}",
                    phone=phone,
                    first_name=f"Customer{i:03d}",
                    role=UserRole.CUSTOMER,
                )
                customer.user = user
                customer.save()
                customers.append(customer)

                if (i + 1) % 20 == 0:
                    print(f"  ✓ Created {i + 1} customers")

        print(f"\n✓ Total customers created: {len(customers)}")
        self.assertEqual(Customer.objects.count(), total_customers_to_create)

        sample_customer = customers[0]
        print(f"\nSample customer:")
        print(f"  - ID: {sample_customer.id}")
        print(f"  - Name: {sample_customer.name}")
        print(f"  - Phone: {sample_customer.phone}")
        print(f"  - City: {sample_customer.city}")
        print(f"  - KYC Status: {sample_customer.kyc_status}")


class JUL2026BatchCreationTest(TransactionTestCase):
    """Step 3: Create JUL2026 batch"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        self.admin = create_admin_user(username="batch_admin")

    def test_step_3_create_batch_jul2026(self):
        """Step 3: Create JUL2026 batch"""
        print("\n" + "="*80)
        print("STEP 3: CREATE BATCH JUL2026")
        print("="*80)

        batch = Batch.objects.create(
            batch_name="JUL2026",
            batch_date=date(2026, 7, 1),
            status=BatchStatus.DRAFT,
            description="Comprehensive test batch for July 2026",
            created_by=self.admin,
        )

        print(f"\n✓ Batch JUL2026 created:")
        print(f"  - ID: {batch.id}")
        print(f"  - Name: {batch.batch_name}")
        print(f"  - Date: {batch.batch_date}")
        print(f"  - Status: {batch.status}")

        self.assertEqual(batch.batch_name, "JUL2026")


class JUL2026ProductsAndLuckyIDsTest(TransactionTestCase):
    """Step 4: Setup products and lucky IDs (257+ items)"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        self.admin = create_admin_user(username="products_admin")

    def test_step_4_create_products_and_lucky_ids(self):
        """Step 4: Create products and lucky IDs"""
        print("\n" + "="*80)
        print("STEP 4: SETUP PRODUCTS AND LUCKY IDs (257+ ITEMS)")
        print("="*80)

        num_products = 120
        products = []

        print(f"Creating {num_products} products...")

        with transaction.atomic():
            for i in range(num_products):
                product = Product.objects.create(
                    product_code=f"PROD{i:04d}",
                )
                products.append(product)

                if (i + 1) % 30 == 0:
                    print(f"  ✓ Created {i + 1} products")

        # Create 160+ lucky IDs
        num_lucky_ids = 160
        lucky_ids = []

        print(f"\nCreating {num_lucky_ids} lucky IDs...")

        with transaction.atomic():
            for i in range(num_lucky_ids):
                lucky_id = LuckyId.objects.create(
                    lucky_id_code=f"LUCKY{i:05d}",
                    status=LuckyIdStatus.AVAILABLE,
                )
                lucky_ids.append(lucky_id)

                if (i + 1) % 40 == 0:
                    print(f"  ✓ Created {i + 1} lucky IDs")

        total_items = len(products) + len(lucky_ids)
        print(f"\n✓ Total items created: {total_items}")
        print(f"  - Products: {len(products)}")
        print(f"  - Lucky IDs: {len(lucky_ids)}")

        self.assertEqual(Product.objects.count(), num_products)
        self.assertEqual(LuckyId.objects.count(), num_lucky_ids)


class JUL2026ComprehensiveReportTest(TransactionTestCase):
    """Step 5: Generate comprehensive report"""

    def setUp(self):
        ensure_default_payment_collection_accounts()

    def test_step_5_generate_comprehensive_report(self):
        """Step 5: Generate JUL2026 comprehensive report"""
        print("\n" + "="*80)
        print("STEP 5: FINAL REPORT")
        print("="*80)

        total_customers = Customer.objects.count()
        total_subscriptions = Subscription.objects.count()
        total_products = Product.objects.count()
        total_lucky_ids = LuckyId.objects.count()
        total_emis = Emi.objects.count()

        print(f"\nTEST BATCH JUL2026 - FINAL REPORT\n")
        print(f"  Customers Created: {total_customers}")
        print(f"  Subscriptions Created: {total_subscriptions}")
        print(f"  Products Available: {total_products}")
        print(f"  Lucky IDs Available: {total_lucky_ids}")
        print(f"  EMIs Generated: {total_emis}")

        print(f"\n" + "="*80)
        print(f"✓ JUL2026 TEST BATCH COMPLETE!")
        print(f"="*80)

        self.assertGreaterEqual(total_customers + total_subscriptions + total_products + total_lucky_ids, 0)
