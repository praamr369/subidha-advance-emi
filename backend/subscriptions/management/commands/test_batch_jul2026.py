"""
Django management command to run JUL2026 batch tests
Usage: python manage.py test_batch_jul2026
"""

import random
import logging
from decimal import Decimal
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

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
    PublicLead,
    SubscriptionRequest,
    SubscriptionRequestStatus,
)
from accounts.models import UserRole, User
from tests.helpers import (
    create_user,
    create_admin_user,
    ensure_test_financial_year,
    ensure_default_payment_collection_accounts,
    ensure_open_accounting_period_for_date,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run JUL2026 comprehensive test batch with full workflow"

    def add_arguments(self, parser):
        parser.add_argument(
            "--step",
            type=int,
            default=0,
            help="Run specific step (1-10) or 0 for all",
        )
        parser.add_argument(
            "--customers",
            type=int,
            default=90,
            help="Number of customers to create",
        )
        parser.add_argument(
            "--subscriptions",
            type=int,
            default=70,
            help="Number of subscriptions to create",
        )
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Clean test data before running",
        )

    def print_step(self, step_num, title):
        self.stdout.write("\n" + "="*80)
        self.stdout.write(f"STEP {step_num}: {title}")
        self.stdout.write("="*80 + "\n")

    def success(self, msg):
        self.stdout.write(self.style.SUCCESS(f"✓ {msg}"))

    def info(self, msg):
        self.stdout.write(self.style.HTTP_INFO(f"ℹ {msg}"))

    def warning(self, msg):
        self.stdout.write(self.style.WARNING(f"⚠ {msg}"))

    def handle(self, *args, **options):
        step = options["step"]
        num_customers = options["customers"]
        num_subscriptions = options["subscriptions"]
        should_clean = options["clean"]

        # Setup
        ensure_default_payment_collection_accounts()

        if should_clean:
            self.step_1_cleanup()

        steps = {
            1: self.step_1_cleanup,
            2: lambda: self.step_2_customers(num_customers),
            3: self.step_3_amrita,
            4: self.step_4_products,
            5: self.step_5_batch,
            6: lambda: self.step_6_subscriptions(num_subscriptions),
            7: self.step_7_verify_amrita,
            8: self.step_8_emi_schedule,
            9: self.step_9_report,
            10: self.step_10_public_leads,
        }

        if step == 0:
            # Run all steps
            for i in range(1, 11):
                if i == 2:
                    steps[i](num_customers)
                elif i == 6:
                    steps[i](num_subscriptions)
                else:
                    steps[i]()
        elif step in steps:
            if step == 2:
                steps[step](num_customers)
            elif step == 6:
                steps[step](num_subscriptions)
            else:
                steps[step]()
        else:
            self.warning(f"Unknown step: {step}")

        self.print_final_report()

    def step_1_cleanup(self):
        """Step 1: Clean seeded data"""
        self.print_step(1, "CLEAN SEEDED DATA")

        initial_customers = Customer.objects.count()
        initial_subscriptions = Subscription.objects.count()

        self.info(f"Initial state:")
        self.info(f"  Customers: {initial_customers}")
        self.info(f"  Subscriptions: {initial_subscriptions}")

        # Delete test data
        test_customers = Customer.objects.filter(phone__startswith="800")
        test_subscriptions = Subscription.objects.filter(customer__in=test_customers)

        deleted_subs = test_subscriptions.count()
        deleted_custs = test_customers.count()

        test_subscriptions.delete()
        test_customers.delete()

        final_customers = Customer.objects.count()
        final_subscriptions = Subscription.objects.count()

        self.info(f"Cleaned:")
        self.info(f"  Customers deleted: {deleted_custs}")
        self.info(f"  Subscriptions deleted: {deleted_subs}")
        self.success(f"Cleanup complete. Customers: {final_customers}")

    def step_2_customers(self, num_customers):
        """Step 2: Register customers"""
        self.print_step(2, f"REGISTER {num_customers}+ CUSTOMERS")

        customers = []
        phone_start = 9000000000

        self.info(f"Creating {num_customers} new customers...")

        with transaction.atomic():
            for i in range(num_customers):
                phone = str(phone_start + i)
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

                if (i + 1) % 30 == 0:
                    self.info(f"  Created {i + 1} customers")

        self.success(f"Created {len(customers)} customers")

        # Verify
        total = Customer.objects.count()
        self.info(f"Total customers in DB: {total}")

    def step_3_amrita(self):
        """Step 3: Create Amrita customer"""
        self.print_step(3, "CREATE AMRITA CUSTOMER")

        amrita, created = Customer.objects.get_or_create(
            name="Amrita Sharma",
            defaults={
                "phone": "9900000001",
                "email": "amrita@jul2026.test",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001",
                "kyc_status": "verified",
                "customer_type": "individual",
            },
        )

        if created:
            amrita_user = create_user(
                username="amrita_sharma",
                phone="9900000001",
                email="amrita@jul2026.test",
                first_name="Amrita",
                role=UserRole.CUSTOMER,
            )
            amrita.user = amrita_user
            amrita.save()
            self.success(f"Amrita created: ID={amrita.id}")
        else:
            self.info(f"Amrita already exists: ID={amrita.id}")

        self.info(f"  Name: {amrita.name}")
        self.info(f"  Phone: {amrita.phone}")
        self.info(f"  City: {amrita.city}")

    def step_4_products(self):
        """Step 4: Create products and lucky IDs"""
        self.print_step(4, "SETUP PRODUCTS AND LUCKY IDs (257+ ITEMS)")

        # Products
        products = []
        num_products = 120

        self.info(f"Creating {num_products} products...")

        with transaction.atomic():
            for i in range(num_products):
                product, created = Product.objects.get_or_create(
                    product_code=f"PROD{i:04d}",
                    defaults={
                        "product_name": f"Product {i:03d}",
                        "category": "furniture",
                        "description": f"Test product {i:03d}",
                        "price": Decimal(str(15000 + (i * 500))),
                        "active": True,
                    },
                )
                if created:
                    products.append(product)

                if (i + 1) % 40 == 0:
                    self.info(f"  Created {i + 1} products")

        # Lucky IDs
        lucky_ids = []
        num_lucky_ids = 160

        self.info(f"Creating {num_lucky_ids} lucky IDs...")

        with transaction.atomic():
            for i in range(num_lucky_ids):
                lucky_id, created = LuckyId.objects.get_or_create(
                    lucky_id_code=f"LUCKY{i:05d}",
                    defaults={"status": LuckyIdStatus.AVAILABLE},
                )
                if created:
                    lucky_ids.append(lucky_id)

                if (i + 1) % 40 == 0:
                    self.info(f"  Created {i + 1} lucky IDs")

        total_products = Product.objects.count()
        total_lucky_ids = LuckyId.objects.count()
        total_items = total_products + total_lucky_ids

        self.success(f"Created {total_items} total items")
        self.info(f"  Products: {total_products}")
        self.info(f"  Lucky IDs: {total_lucky_ids}")

    def step_5_batch(self):
        """Step 5: Create batch"""
        self.print_step(5, "CREATE BATCH JUL2026")

        batch, created = Batch.objects.get_or_create(
            batch_code="JUL2026",
            defaults={
                "batch_date": date(2026, 7, 1),
                "status": BatchStatus.ACTIVE,
                "description": "Comprehensive test batch for July 2026",
                "created_by": create_admin_user(username="batch_creator"),
            },
        )

        if created:
            self.success(f"Batch created: {batch.batch_code}")
        else:
            self.info(f"Batch already exists: {batch.batch_code}")

        self.info(f"  Date: {batch.batch_date}")
        self.info(f"  Status: {batch.status}")

    def step_6_subscriptions(self, num_subscriptions):
        """Step 6: Create subscriptions"""
        self.print_step(6, f"CREATE {num_subscriptions} RANDOM SUBSCRIPTIONS")

        batch = Batch.objects.get(batch_code="JUL2026")
        customers = list(Customer.objects.all()[:num_subscriptions])
        products = list(Product.objects.all())
        lucky_ids = list(LuckyId.objects.filter(status=LuckyIdStatus.AVAILABLE))

        if not customers:
            self.warning("No customers available. Create customers first (Step 2)")
            return

        if not products:
            self.warning("No products available. Create products first (Step 4)")
            return

        if not lucky_ids:
            self.warning("No lucky IDs available. Create lucky IDs first (Step 4)")
            return

        self.info(f"Creating {len(customers)} subscriptions...")
        random.seed(42)

        subscriptions = []
        with transaction.atomic():
            for i, customer in enumerate(customers):
                product = random.choice(products)
                lucky_id = random.choice(lucky_ids)

                subscription = Subscription.objects.create(
                    customer=customer,
                    product=product,
                    batch=batch,
                    plan_type=PlanType.EMI,
                    status=SubscriptionStatus.ACTIVE,
                    subscription_date=date.today(),
                    price=product.price,
                    lucky_id=lucky_id,
                    no_of_emis=15,
                )
                subscriptions.append(subscription)

                if (i + 1) % 20 == 0:
                    self.info(f"  Created {i + 1} subscriptions")

        self.success(f"Created {len(subscriptions)} subscriptions")

    def step_7_verify_amrita(self):
        """Step 7: Verify Amrita subscription"""
        self.print_step(7, "VERIFY AMRITA SUBSCRIPTION")

        amrita = Customer.objects.get(name="Amrita Sharma")
        batch = Batch.objects.get(batch_code="JUL2026")

        products = list(Product.objects.all())
        lucky_ids = list(LuckyId.objects.filter(status=LuckyIdStatus.AVAILABLE))

        if not Subscription.objects.filter(customer=amrita, batch=batch).exists():
            product = random.choice(products)
            lucky_id = random.choice(lucky_ids)

            subscription = Subscription.objects.create(
                customer=amrita,
                product=product,
                batch=batch,
                plan_type=PlanType.EMI,
                status=SubscriptionStatus.ACTIVE,
                subscription_date=date.today(),
                price=product.price,
                lucky_id=lucky_id,
                no_of_emis=15,
            )
            self.success(f"Amrita subscription created: {subscription.id}")
        else:
            self.info("Amrita already has subscription")

        subs = Subscription.objects.filter(customer=amrita, batch=batch)
        for sub in subs:
            self.info(f"  Subscription ID: {sub.id}")
            self.info(f"  Product: {sub.product.product_name}")
            self.info(f"  Lucky ID: {sub.lucky_id.lucky_id_code}")
            self.info(f"  EMIs: {sub.no_of_emis}")

    def step_8_emi_schedule(self):
        """Step 8: Generate EMI schedule"""
        self.print_step(8, "GENERATE EMI SCHEDULE")

        ensure_test_financial_year()
        ensure_open_accounting_period_for_date(date.today())

        batch = Batch.objects.get(batch_code="JUL2026")
        subscriptions = Subscription.objects.filter(batch=batch)[:5]

        self.info(f"Creating EMI schedule for {subscriptions.count()} subscriptions...")

        emi_count = 0
        with transaction.atomic():
            for sub in subscriptions:
                emi_amount = sub.price / sub.no_of_emis

                for emi_num in range(1, sub.no_of_emis + 1):
                    emi_date = sub.subscription_date + timedelta(days=30 * emi_num)

                    emi, created = Emi.objects.get_or_create(
                        subscription=sub,
                        emi_number=emi_num,
                        defaults={
                            "amount": emi_amount,
                            "due_date": emi_date,
                            "status": "pending",
                        },
                    )
                    if created:
                        emi_count += 1

        self.success(f"Created {emi_count} EMIs")
        self.info(f"  Total EMIs in batch: {Emi.objects.filter(subscription__batch=batch).count()}")

    def step_9_report(self):
        """Step 9: Generate final report"""
        self.print_step(9, "FINAL REPORT")

        total_customers = Customer.objects.count()
        total_subscriptions = Subscription.objects.count()
        total_products = Product.objects.count()
        total_lucky_ids = LuckyId.objects.count()
        total_emis = Emi.objects.count()

        print(f"\n{'='*80}")
        print("📊 JUL2026 TEST BATCH - COMPREHENSIVE REPORT")
        print(f"{'='*80}\n")

        self.info(f"Total Customers:        {total_customers}")
        self.info(f"Total Subscriptions:    {total_subscriptions}")
        self.info(f"Total Products:         {total_products}")
        self.info(f"Total Lucky IDs:        {total_lucky_ids}")
        self.info(f"Total EMIs:             {total_emis}")
        self.info(f"Total Items (P+L):      {total_products + total_lucky_ids}")

        try:
            batch = Batch.objects.get(batch_code="JUL2026")
            batch_subs = Subscription.objects.filter(batch=batch).count()
            print()
            self.info(f"Batch JUL2026:")
            self.info(f"  Status:       {batch.status}")
            self.info(f"  Subscriptions: {batch_subs}")
            self.info(f"  Created:      {batch.created_at}")
        except Batch.DoesNotExist:
            print()
            self.warning("Batch JUL2026 not found")

        try:
            amrita = Customer.objects.get(name="Amrita Sharma")
            amrita_subs = Subscription.objects.filter(customer=amrita).count()
            print()
            self.info(f"Amrita Sharma:")
            self.info(f"  Phone:        {amrita.phone}")
            self.info(f"  Email:        {amrita.email}")
            self.info(f"  Subscriptions: {amrita_subs}")
        except Customer.DoesNotExist:
            print()
            self.warning("Amrita not found")

        print(f"\n{'='*80}")
        self.success("JUL2026 TEST BATCH COMPLETE!")
        print(f"{'='*80}\n")

    def step_10_public_leads(self):
        """Step 10: Create 10 public leads and their subscription requests"""
        self.print_step(10, "CREATE 10 PUBLIC LEADS AND SUBSCRIPTION REQUESTS")
        
        try:
            batch = Batch.objects.get(batch_code="JUL2026")
        except Batch.DoesNotExist:
            self.warning("Batch JUL2026 not found. Run previous steps first.")
            return

        admin = User.objects.filter(is_superuser=True).first()
        if not admin:
            admin = create_admin_user(username="lead_admin_10")
            
        products = list(Product.objects.all()[:10])
        if len(products) < 10:
            self.warning("Not enough products available")
            return
            
        self.info("Creating 5 public leads requesting vacant lucky IDs...")
        vacant_numbers = [90, 91, 92, 93, 94]
        for i, lucky_num in enumerate(vacant_numbers):
            lead = PublicLead.objects.create(
                name=f"Vacant Lead {i+1}",
                phone=f"93000000{i:02d}",
                email=f"vacant{i+1}@jul2026.test",
                product=products[i]
            )
            SubscriptionRequest.objects.create(
                requester=admin,
                requester_role_snapshot="admin",
                customer=None,
                requested_customer_name=lead.name,
                requested_customer_phone=lead.phone,
                requested_customer_email=lead.email,
                product=products[i],
                batch=batch,
                preferred_lucky_number=lucky_num,
                requested_tenure_months_snapshot=15,
                source_public_lead=lead,
                status=SubscriptionRequestStatus.SUBMITTED
            )
            
        self.info("Creating 5 public leads requesting non-vacant lucky IDs...")
        assigned_subs = Subscription.objects.filter(batch=batch).exclude(lucky_id__isnull=True)[:5]
        assigned_numbers = []
        for sub in assigned_subs:
            try:
                num = int(sub.lucky_id.lucky_id_code.replace("LUCKY", "")) % 100
                assigned_numbers.append(num)
            except ValueError:
                assigned_numbers.append(1)
                
        if not assigned_numbers:
            assigned_numbers = [1, 2, 3, 4, 5]
            
        for i, lucky_num in enumerate(assigned_numbers):
            lead = PublicLead.objects.create(
                name=f"Non-Vacant Lead {i+1}",
                phone=f"94000000{i:02d}",
                email=f"nonvacant{i+1}@jul2026.test",
                product=products[i+5]
            )
            SubscriptionRequest.objects.create(
                requester=admin,
                requester_role_snapshot="admin",
                customer=None,
                requested_customer_name=lead.name,
                requested_customer_phone=lead.phone,
                requested_customer_email=lead.email,
                product=products[i+5],
                batch=batch,
                preferred_lucky_number=lucky_num,
                requested_tenure_months_snapshot=15,
                source_public_lead=lead,
                status=SubscriptionRequestStatus.SUBMITTED
            )
            
        self.success("Created 10 public leads and subscription requests")

    def print_final_report(self):
        """Print final consolidated report"""
        try:
            total_customers = Customer.objects.count()
            total_subscriptions = Subscription.objects.count()
            total_products = Product.objects.count()
            total_lucky_ids = LuckyId.objects.count()

            print(f"\n{'='*80}")
            print("✅ FINAL DATA SUMMARY")
            print(f"{'='*80}\n")

            self.info(f"Customers:    {total_customers}")
            self.info(f"Subscriptions: {total_subscriptions}")
            self.info(f"Products:     {total_products}")
            self.info(f"Lucky IDs:    {total_lucky_ids}")
            self.success(f"TOTAL ITEMS: {total_products + total_lucky_ids}")

            print(f"\n{'='*80}\n")

        except Exception as e:
            self.warning(f"Error generating report: {e}")
