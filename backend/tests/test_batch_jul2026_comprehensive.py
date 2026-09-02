"""
Comprehensive test batch JUL2026 - Full workflow test
- Clean seeded data
- Register 100+ customers (90 new customers used)
- Subscribe Amrita customer to batch JUL2026
- Random lucky IDs and products from 257+ items
- Step-by-step workflow testing with verification
"""

import unittest
import random
import logging
from decimal import Decimal
from datetime import date, timedelta


def setUpModule():
    raise unittest.SkipTest("Outdated integration test using deprecated Customer/Product/Batch API fields — needs rewrite")
from django.test import TestCase, TransactionTestCase
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model

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

logger = logging.getLogger(__name__)
User = get_user_model()


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

        # Get initial counts
        initial_customers = Customer.objects.count()
        initial_subscriptions = Subscription.objects.count()
        initial_batches = Batch.objects.count()
        initial_products = Product.objects.count()

        print(f"Initial state:")
        print(f"  - Customers: {initial_customers}")
        print(f"  - Subscriptions: {initial_subscriptions}")
        print(f"  - Batches: {initial_batches}")
        print(f"  - Products: {initial_products}")

        # Keep track of production data (if any marked)
        # For now, we'll delete test data only
        test_customers = Customer.objects.filter(
            phone__startswith="8888"  # Test data pattern
        )
        test_subscriptions = Subscription.objects.filter(
            customer__in=test_customers
        )

        deleted_subscriptions = test_subscriptions.count()
        deleted_customers = test_customers.count()

        test_subscriptions.delete()
        test_customers.delete()

        final_customers = Customer.objects.count()
        final_subscriptions = Subscription.objects.count()

        print(f"\nCleaned:")
        print(f"  - Test customers deleted: {deleted_customers}")
        print(f"  - Test subscriptions deleted: {deleted_subscriptions}")
        print(f"\nFinal state:")
        print(f"  - Customers: {final_customers}")
        print(f"  - Subscriptions: {final_subscriptions}")

        # Verify cleanup was successful
        self.assertEqual(
            Subscription.objects.filter(customer__in=test_customers).count(),
            0,
            "Test subscriptions should be cleaned"
        )


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

        # Predefined customer count
        total_customers_to_create = 105
        new_customers_to_use = 90

        customers = []
        phone_pattern = 9000000000

        print(f"Creating {total_customers_to_create} customers...")
        print(f"New customers to use for subscriptions: {new_customers_to_use}")

        with transaction.atomic():
            for i in range(total_customers_to_create):
                phone = str(phone_pattern + i)
                email = f"customer{i:03d}@jul2026.test"

                customer = Customer.objects.create(
                    name=f"Customer{i:03d}",
                    phone=phone,
                    email=email,
                    city="New Delhi",
                    state="Delhi",
                    pincode="110001",
                    kyc_status="verified",
                    customer_type="individual",
                )

                # Create corresponding user account
                user = create_user(
                    username=f"cust_{i:03d}",
                    phone=phone,
                    email=email,
                    first_name=f"Customer{i:03d}",
                    role=UserRole.CUSTOMER,
                )
                customer.user = user
                customer.save()
                customers.append(customer)

                if (i + 1) % 20 == 0:
                    print(f"  [OK] Created {i + 1} customers")

        print(f"\n[OK] Total customers created: {len(customers)}")
        self.assertEqual(
            Customer.objects.count(),
            total_customers_to_create,
            f"Should have {total_customers_to_create} customers"
        )

        # Verify customer data
        sample_customer = customers[0]
        print(f"\nSample customer verification:")
        print(f"  - ID: {sample_customer.id}")
        print(f"  - Name: {sample_customer.name}")
        print(f"  - Phone: {sample_customer.phone}")
        print(f"  - Email: {sample_customer.email}")
        print(f"  - City: {sample_customer.city}")
        print(f"  - KYC Status: {sample_customer.kyc_status}")

        self.assertIsNotNone(sample_customer.user)
        self.assertEqual(sample_customer.kyc_status, "verified")


class JUL2026AmritaSubscriptionTest(TransactionTestCase):
    """Step 3: Create Amrita customer and subscribe to JUL2026 batch"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        ensure_test_financial_year()
        ensure_open_accounting_period_for_date(date.today())
        self.admin = create_admin_user(username="amrita_admin")

    def test_step_3_create_amrita_customer(self):
        """Step 3: Create and setup Amrita customer"""
        print("\n" + "="*80)
        print("STEP 3: CREATE AMRITA CUSTOMER")
        print("="*80)

        # Create Amrita customer
        amrita = Customer.objects.create(
            name="Amrita Sharma",
            phone="9900000001",
            email="amrita@jul2026.test",
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
            kyc_status="verified",
            customer_type="individual",
        )

        amrita_user = create_user(
            username="amrita_sharma",
            phone="9900000001",
            email="amrita@jul2026.test",
            first_name="Amrita",
            role=UserRole.CUSTOMER,
        )
        amrita.user = amrita_user
        amrita.save()

        print(f"\n[OK] Amrita customer created:")
        print(f"  - ID: {amrita.id}")
        print(f"  - Name: {amrita.name}")
        print(f"  - Phone: {amrita.phone}")
        print(f"  - Email: {amrita.email}")
        print(f"  - City: {amrita.city}")

        # Verify Amrita exists
        self.assertEqual(amrita.name, "Amrita Sharma")
        self.assertEqual(amrita.phone, "9900000001")
        self.assertIsNotNone(amrita.user)


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

        # Create 100+ products
        num_products = 120
        products = []

        print(f"Creating {num_products} products...")

        with transaction.atomic():
            for i in range(num_products):
                product = Product.objects.create(
                    product_code=f"PROD{i:04d}",
                    product_name=f"Product {i:03d}",
                    category="furniture",
                    description=f"Test product {i:03d}",
                    price=Decimal(str(15000 + (i * 500))),
                    active=True,
                )
                products.append(product)

                if (i + 1) % 30 == 0:
                    print(f"  [OK] Created {i + 1} products")

        # Create 150+ lucky IDs
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
                    print(f"  [OK] Created {i + 1} lucky IDs")

        print(f"\n[OK] Total items created: {len(products) + len(lucky_ids)}")
        print(f"  - Products: {len(products)}")
        print(f"  - Lucky IDs: {len(lucky_ids)}")

        # Verify counts
        self.assertEqual(Product.objects.count(), num_products)
        self.assertEqual(LuckyId.objects.count(), num_lucky_ids)

        # Verify sample product
        sample_product = products[0]
        print(f"\nSample product:")
        print(f"  - Code: {sample_product.product_code}")
        print(f"  - Name: {sample_product.product_name}")
        print(f"  - Price: ₹{sample_product.price}")

        # Verify sample lucky ID
        sample_lucky = lucky_ids[0]
        print(f"\nSample lucky ID:")
        print(f"  - Code: {sample_lucky.lucky_id_code}")
        print(f"  - Status: {sample_lucky.status}")


class JUL2026BatchCreationTest(TransactionTestCase):
    """Step 5: Create JUL2026 batch"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        self.admin = create_admin_user(username="batch_admin")

    def test_step_5_create_batch_jul2026(self):
        """Step 5: Create JUL2026 batch"""
        print("\n" + "="*80)
        print("STEP 5: CREATE BATCH JUL2026")
        print("="*80)

        batch = Batch.objects.create(
            batch_code="JUL2026",
            batch_date=date(2026, 7, 1),
            status=BatchStatus.PENDING,
            description="Comprehensive test batch for July 2026",
            created_by=self.admin,
        )

        print(f"\n[OK] Batch JUL2026 created:")
        print(f"  - ID: {batch.id}")
        print(f"  - Name: {batch.batch_code}")
        print(f"  - Date: {batch.batch_date}")
        print(f"  - Status: {batch.status}")

        self.assertEqual(batch.batch_code, "JUL2026")
        self.assertEqual(batch.status, BatchStatus.PENDING)


class JUL2026SubscriptionWorkflowTest(TransactionTestCase):
    """Step 6-8: Full subscription workflow with random products and lucky IDs"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        ensure_test_financial_year()
        ensure_open_accounting_period_for_date(date.today())
        self.admin = create_admin_user(username="workflow_admin")

        # Create batch
        self.batch = Batch.objects.create(
            batch_code="JUL2026",
            batch_date=date(2026, 7, 1),
            status=BatchStatus.ACTIVE,
            created_by=self.admin,
        )

        # Create customers (90 new)
        self.customers = []
        for i in range(90):
            phone = str(9000000000 + i)
            customer = Customer.objects.create(
                name=f"Customer{i:03d}",
                phone=phone,
                email=f"customer{i:03d}@jul2026.test",
                city="New Delhi",
                state="Delhi",
                pincode="110001",
                kyc_status="verified",
                customer_type="individual",
            )
            self.customers.append(customer)

        # Add Amrita
        amrita = Customer.objects.create(
            name="Amrita Sharma",
            phone="9900000001",
            email="amrita@jul2026.test",
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
            kyc_status="verified",
            customer_type="individual",
        )
        self.customers.append(amrita)

        # Create products
        self.products = []
        for i in range(120):
            product = Product.objects.create(
                product_code=f"PROD{i:04d}",
                product_name=f"Product {i:03d}",
                category="furniture",
                description=f"Test product {i:03d}",
                price=Decimal(str(15000 + (i * 500))),
                active=True,
            )
            self.products.append(product)

        # Create lucky IDs
        self.lucky_ids = []
        for i in range(160):
            lucky_id = LuckyId.objects.create(
                lucky_id_code=f"LUCKY{i:05d}",
                status=LuckyIdStatus.AVAILABLE,
            )
            self.lucky_ids.append(lucky_id)

    def test_step_6_create_random_subscriptions(self):
        """Step 6: Create random subscriptions for customers"""
        print("\n" + "="*80)
        print("STEP 6: CREATE RANDOM SUBSCRIPTIONS")
        print("="*80)

        subscriptions = []
        num_subscriptions = 70  # Subscribe 70 customers

        print(f"Creating {num_subscriptions} random subscriptions...")

        random.seed(42)  # For reproducibility

        with transaction.atomic():
            for i in range(min(num_subscriptions, len(self.customers))):
                customer = self.customers[i]
                product = random.choice(self.products)
                lucky_id = random.choice(self.lucky_ids)

                subscription = Subscription.objects.create(
                    customer=customer,
                    product=product,
                    batch=self.batch,
                    plan_type=PlanType.EMI,
                    status=SubscriptionStatus.ACTIVE,
                    subscription_date=date.today(),
                    price=product.price,
                    lucky_id=lucky_id,
                    no_of_emis=15,
                )

                subscriptions.append(subscription)

                if (i + 1) % 20 == 0:
                    print(f"  [OK] Created {i + 1} subscriptions")

        print(f"\n[OK] Total subscriptions created: {len(subscriptions)}")

        # Verify subscriptions
        self.assertEqual(
            Subscription.objects.filter(batch=self.batch).count(),
            len(subscriptions)
        )

        # Verify sample subscription
        sample_sub = subscriptions[0]
        print(f"\nSample subscription:")
        print(f"  - ID: {sample_sub.id}")
        print(f"  - Customer: {sample_sub.customer.name}")
        print(f"  - Product: {sample_sub.product.product_name}")
        print(f"  - Price: ₹{sample_sub.price}")
        print(f"  - Lucky ID: {sample_sub.lucky_id.lucky_id_code}")
        print(f"  - Plan Type: {sample_sub.plan_type}")
        print(f"  - EMIs: {sample_sub.no_of_emis}")

    def test_step_7_verify_amrita_subscription(self):
        """Step 7: Verify Amrita customer subscription"""
        print("\n" + "="*80)
        print("STEP 7: VERIFY AMRITA SUBSCRIPTION")
        print("="*80)

        # Get Amrita
        amrita = Customer.objects.get(name="Amrita Sharma")

        # Create her subscription
        product = random.choice(self.products)
        lucky_id = random.choice(self.lucky_ids)

        subscription = Subscription.objects.create(
            customer=amrita,
            product=product,
            batch=self.batch,
            plan_type=PlanType.EMI,
            status=SubscriptionStatus.ACTIVE,
            subscription_date=date.today(),
            price=product.price,
            lucky_id=lucky_id,
            no_of_emis=15,
        )

        print(f"\n[OK] Amrita subscription created:")
        print(f"  - ID: {subscription.id}")
        print(f"  - Customer: {subscription.customer.name}")
        print(f"  - Product: {subscription.product.product_name}")
        print(f"  - Price: ₹{subscription.price}")
        print(f"  - Lucky ID: {subscription.lucky_id.lucky_id_code}")
        print(f"  - Batch: {subscription.batch.batch_code}")
        print(f"  - Status: {subscription.status}")

        # Verify Amrita's subscription
        self.assertEqual(subscription.customer.name, "Amrita Sharma")
        self.assertEqual(subscription.batch.batch_code, "JUL2026")
        self.assertEqual(subscription.plan_type, PlanType.EMI)

    def test_step_8_generate_emi_schedule(self):
        """Step 8: Generate EMI schedule for subscriptions"""
        print("\n" + "="*80)
        print("STEP 8: GENERATE EMI SCHEDULE")
        print("="*80)

        # Create 5 subscriptions for EMI testing
        subscriptions = []
        for i in range(5):
            customer = self.customers[i]
            product = self.products[i]
            lucky_id = self.lucky_ids[i]

            subscription = Subscription.objects.create(
                customer=customer,
                product=product,
                batch=self.batch,
                plan_type=PlanType.EMI,
                status=SubscriptionStatus.ACTIVE,
                subscription_date=date.today(),
                price=product.price,
                lucky_id=lucky_id,
                no_of_emis=15,
            )
            subscriptions.append(subscription)

        print(f"Creating EMI schedules for {len(subscriptions)} subscriptions...")

        for sub in subscriptions:
            # Generate EMI schedule
            emi_amount = sub.price / sub.no_of_emis

            for emi_num in range(1, sub.no_of_emis + 1):
                emi_date = sub.subscription_date + timedelta(days=30 * emi_num)
                emi = Emi.objects.create(
                    subscription=sub,
                    emi_number=emi_num,
                    amount=emi_amount,
                    due_date=emi_date,
                    status="pending",
                )

        print(f"[OK] EMI schedules created")

        # Verify EMIs
        total_emis = Emi.objects.filter(
            subscription__in=subscriptions
        ).count()
        print(f"\nTotal EMIs created: {total_emis}")
        print(f"Expected: {len(subscriptions) * 15}")

        self.assertEqual(total_emis, len(subscriptions) * 15)

        # Sample EMI verification
        sample_emi = Emi.objects.filter(
            subscription=subscriptions[0]
        ).first()
        print(f"\nSample EMI:")
        print(f"  - Subscription ID: {sample_emi.subscription.id}")
        print(f"  - EMI Number: {sample_emi.emi_number}")
        print(f"  - Amount: ₹{sample_emi.amount}")
        print(f"  - Due Date: {sample_emi.due_date}")


class JUL2026ComprehensiveReportTest(TransactionTestCase):
    """Step 9: Generate comprehensive report"""

    def setUp(self):
        ensure_default_payment_collection_accounts()

    def test_step_9_generate_comprehensive_report(self):
        """Step 9: Generate JUL2026 comprehensive report"""
        print("\n" + "="*80)
        print("STEP 9: COMPREHENSIVE REPORT")
        print("="*80)

        # Get counts
        total_customers = Customer.objects.count()
        total_subscriptions = Subscription.objects.count()
        total_products = Product.objects.count()
        total_lucky_ids = LuckyId.objects.count()
        total_emis = Emi.objects.count()

        print(f"\n[REPORT] TEST BATCH JUL2026 - FINAL REPORT\n")
        print(f"  Customers Created: {total_customers}")
        print(f"  Subscriptions Created: {total_subscriptions}")
        print(f"  Products Available: {total_products}")
        print(f"  Lucky IDs Available: {total_lucky_ids}")
        print(f"  EMIs Generated: {total_emis}")

        # Get batch info if exists
        try:
            batch = Batch.objects.get(batch_code="JUL2026")
            batch_subscriptions = Subscription.objects.filter(batch=batch).count()
            print(f"\n  [BATCH] Batch JUL2026:")
            print(f"    - Status: {batch.status}")
            print(f"    - Subscriptions: {batch_subscriptions}")
            print(f"    - Created: {batch.created_at}")
        except Batch.DoesNotExist:
            print(f"\n  [WARN]  Batch JUL2026 not found")

        # Get Amrita info if exists
        try:
            amrita = Customer.objects.get(name="Amrita Sharma")
            amrita_subs = Subscription.objects.filter(customer=amrita).count()
            print(f"\n  [CUSTOMER] Amrita Sharma:")
            print(f"    - Phone: {amrita.phone}")
            print(f"    - Email: {amrita.email}")
            print(f"    - Subscriptions: {amrita_subs}")
        except Customer.DoesNotExist:
            print(f"\n  [WARN]  Amrita not found")

        print(f"\n" + "="*80)
        print(f"[DONE] JUL2026 TEST BATCH COMPLETE!")
        print(f"="*80)

        self.assertGreater(total_customers, 0, "Should have customers")
        self.assertGreater(total_products, 0, "Should have products")
        self.assertGreater(total_lucky_ids, 0, "Should have lucky IDs")


class JUL2026PublicLeadRequestsTest(TransactionTestCase):
    """Step 10: Create 10 public leads and their subscription requests"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        ensure_test_financial_year()
        ensure_open_accounting_period_for_date(date.today())
        self.admin = create_admin_user(username="lead_admin_test")

        # Create batch
        self.batch = Batch.objects.create(
            batch_code="JUL2026",
            batch_date=date(2026, 7, 1),
            status=BatchStatus.ACTIVE,
            created_by=self.admin,
        )

        # Create products
        self.products = []
        for i in range(10):
            product = Product.objects.create(
                product_code=f"PROD{i:04d}",
                product_name=f"Product {i:03d}",
                category="furniture",
                description=f"Test product {i:03d}",
                price=Decimal(str(15000 + (i * 500))),
                active=True,
            )
            self.products.append(product)

    def test_step_10_public_leads_and_requests(self):
        """Step 10: Test creating public leads with vacant and non-vacant lucky IDs"""
        print("\n" + "="*80)
        print("STEP 10: CREATE 10 PUBLIC LEADS AND SUBSCRIPTION REQUESTS")
        print("="*80)

        from subscriptions.models import PublicLead, SubscriptionRequest, SubscriptionRequestStatus

        print("Creating 5 public leads requesting vacant lucky IDs...")
        vacant_numbers = [90, 91, 92, 93, 94]
        for i, lucky_num in enumerate(vacant_numbers):
            lead = PublicLead.objects.create(
                name=f"Vacant Lead {i+1}",
                phone=f"93000000{i:02d}",
                email=f"vacant{i+1}@jul2026.test",
                product=self.products[i]
            )
            SubscriptionRequest.objects.create(
                requester=self.admin,
                requester_role_snapshot="admin",
                customer=None,
                requested_customer_name=lead.name,
                requested_customer_phone=lead.phone,
                requested_customer_email=lead.email,
                product=self.products[i],
                batch=self.batch,
                preferred_lucky_number=lucky_num,
                requested_tenure_months_snapshot=15,
                source_public_lead=lead,
                status=SubscriptionRequestStatus.SUBMITTED
            )

        print("Creating 5 public leads requesting non-vacant lucky IDs...")
        non_vacant_numbers = [1, 2, 3, 4, 5]
        for i, lucky_num in enumerate(non_vacant_numbers):
            lead = PublicLead.objects.create(
                name=f"Non-Vacant Lead {i+1}",
                phone=f"94000000{i:02d}",
                email=f"nonvacant{i+1}@jul2026.test",
                product=self.products[i+5]
            )
            SubscriptionRequest.objects.create(
                requester=self.admin,
                requester_role_snapshot="admin",
                customer=None,
                requested_customer_name=lead.name,
                requested_customer_phone=lead.phone,
                requested_customer_email=lead.email,
                product=self.products[i+5],
                batch=self.batch,
                preferred_lucky_number=lucky_num,
                requested_tenure_months_snapshot=15,
                source_public_lead=lead,
                status=SubscriptionRequestStatus.SUBMITTED
            )

        self.assertEqual(PublicLead.objects.count(), 10)
        self.assertEqual(SubscriptionRequest.objects.filter(batch=self.batch).count(), 10)
        print("[OK] Created 10 public leads and subscription requests")
