"""
Django management command to run JUL2026 batch tests.

Usage:
    python manage.py test_batch_jul2026                          # all steps
    python manage.py test_batch_jul2026 --step 5                 # single step
    python manage.py test_batch_jul2026 --customers 90           # override
    python manage.py test_batch_jul2026 --clean                  # cleanup first

Historically this seeder drifted out of sync with model schema changes; when
you re-touch it, verify each `.create(...)` call against the live model in
`customers.models.Customer`, `subscriptions.models.{Product, Batch,
LuckyId, Subscription, Emi, PublicLead, SubscriptionRequest}` — the
fields removed / renamed over time include: Customer.email,
Customer.customer_type, Product.price → base_price, Product.product_name →
name, Product.active → is_active, Batch.batch_date, Batch.description,
Batch.created_by, BatchStatus.ACTIVE (replaced by OPEN), LuckyId.
lucky_id_code (now per-batch lucky_number int), Emi.emi_number → month_no,
Subscription.price → total_amount + monthly_amount,
Subscription.subscription_date → start_date, Subscription.no_of_emis →
tenure_months.
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
    Subscription,
    SubscriptionStatus,
    Product,
    Emi,
    EmiStatus,
    LuckyId,
    LuckyIdStatus,
    PlanType,
    PublicLead,
    SubscriptionRequest,
    SubscriptionRequestStatus,
)
from customers.models import Customer
from accounts.models import UserRole, User
from tests.helpers import (
    create_user,
    create_admin_user,
    ensure_test_financial_year,
    ensure_default_payment_collection_accounts,
    ensure_open_accounting_period_for_date,
)

logger = logging.getLogger(__name__)


# JUL2026 dataset invariants (touch here if you rescale the seed):
BATCH_CODE = "JUL2026"
BATCH_START = date(2026, 7, 1)
BATCH_DURATION_MONTHS = 15
BATCH_DRAW_DAY = 5
BATCH_TOTAL_SLOTS = 100  # Business rule: OPEN batch must have exactly 100 slots.

AMRITA_PHONE = "9900000001"

PRODUCT_COUNT = 120
# Business rule: LuckyId.lucky_number is a two-digit slot (00-99). For a
# 100-slot batch we allocate the full 0..99 range.
LUCKY_ID_START = 0
LUCKY_ID_END = BATCH_TOTAL_SLOTS - 1  # inclusive → 0..99


class Command(BaseCommand):
    help = "Run JUL2026 comprehensive test batch with full workflow"

    def add_arguments(self, parser):
        parser.add_argument("--step", type=int, default=0, help="Run specific step (1-10) or 0 for all")
        parser.add_argument("--customers", type=int, default=90, help="Number of customers to create")
        parser.add_argument("--subscriptions", type=int, default=70, help="Number of subscriptions to create")
        parser.add_argument("--clean", action="store_true", help="Clean test data before running")

    def print_step(self, step_num, title):
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write(f"STEP {step_num}: {title}")
        self.stdout.write("=" * 80 + "\n")

    def success(self, msg):
        self.stdout.write(self.style.SUCCESS(f"[OK] {msg}"))

    def info(self, msg):
        self.stdout.write(self.style.HTTP_INFO(f"[..] {msg}"))

    def warning(self, msg):
        self.stdout.write(self.style.WARNING(f"[!] {msg}"))

    def handle(self, *args, **options):
        step = options["step"]
        num_customers = options["customers"]
        num_subscriptions = options["subscriptions"]
        should_clean = options["clean"]

        ensure_default_payment_collection_accounts()

        if should_clean:
            self.step_1_cleanup()

        # Each entry is a zero-argument callable — closures over CLI args, so
        # the step-0 loop and the single-step branch can both call `fn()`
        # uniformly without arity mismatch.
        steps = {
            1: self.step_1_cleanup,
            2: lambda: self.step_2_customers(num_customers),
            3: self.step_3_amrita,
            4: self.step_4_products,
            5: self.step_5_batch_and_lucky_ids,
            6: lambda: self.step_6_subscriptions(num_subscriptions),
            7: self.step_7_verify_amrita,
            8: self.step_8_emi_schedule,
            9: self.step_9_report,
            10: self.step_10_public_leads,
        }

        if step == 0:
            for i in range(1, 11):
                steps[i]()
        elif step in steps:
            steps[step]()
        else:
            self.warning(f"Unknown step: {step}")

        self.print_final_report()

    # ------------------------------------------------------------------ steps

    def step_1_cleanup(self):
        """Step 1: Clean seeded data (opt-in via --clean or auto in step-0)."""
        self.print_step(1, "CLEAN SEEDED DATA")

        initial_customers = Customer.objects.count()
        initial_subscriptions = Subscription.objects.count()

        self.info("Initial state:")
        self.info(f"  Customers: {initial_customers}")
        self.info(f"  Subscriptions: {initial_subscriptions}")

        # Delete only seeded rows (phone prefix identifies the seed).
        test_customers = Customer.objects.filter(phone__startswith="900")
        test_subscriptions = Subscription.objects.filter(customer__in=test_customers)

        deleted_subs = test_subscriptions.count()
        deleted_custs = test_customers.count()

        test_subscriptions.delete()
        test_customers.delete()

        final_customers = Customer.objects.count()

        self.info("Cleaned:")
        self.info(f"  Customers deleted: {deleted_custs}")
        self.info(f"  Subscriptions deleted: {deleted_subs}")
        self.success(f"Cleanup complete. Customers remaining: {final_customers}")

    def step_2_customers(self, num_customers):
        """Step 2: Register bulk customers."""
        self.print_step(2, f"REGISTER {num_customers}+ CUSTOMERS")

        phone_start = 9000000000
        created_count = 0

        self.info(f"Creating {num_customers} new customers...")

        with transaction.atomic():
            for i in range(num_customers):
                phone = str(phone_start + i)
                if Customer.objects.filter(phone=phone).exists():
                    continue
                # Customer has no `email` or `customer_type` field (removed
                # during the CRM refactor); email lives on the linked User row.
                # `user` is NOT NULL — reuse an existing User with this
                # username/phone if step 1 deleted only Customer rows and
                # left User rows behind (common after --clean re-runs).
                user = User.objects.filter(phone=phone).first()
                if user is None:
                    user = create_user(
                        username=f"cust_{i:03d}",
                        phone=phone,
                        email=f"customer{i:03d}@jul2026.test",
                        first_name=f"Customer{i:03d}",
                        role=UserRole.CUSTOMER,
                    )
                Customer.objects.create(
                    user=user,
                    name=f"Customer{i:03d}",
                    phone=phone,
                    city="New Delhi",
                    state="Delhi",
                    pincode="110001",
                    kyc_status="VERIFIED",
                )
                created_count += 1

                if (i + 1) % 30 == 0:
                    self.info(f"  Processed {i + 1} customers")

        self.success(f"Created {created_count} customers")
        self.info(f"Total customers in DB: {Customer.objects.count()}")

    def step_3_amrita(self):
        """Step 3: Create the Amrita anchor customer used by later assertions."""
        self.print_step(3, "CREATE AMRITA CUSTOMER")

        amrita = Customer.objects.filter(phone=AMRITA_PHONE).first()
        if amrita is None:
            # User must exist before Customer.save() — see step 2 note. Reuse
            # an existing User row when re-seeding after a Customer-only wipe.
            amrita_user = User.objects.filter(phone=AMRITA_PHONE).first()
            if amrita_user is None:
                amrita_user = create_user(
                    username="amrita_sharma",
                    phone=AMRITA_PHONE,
                    email="amrita@jul2026.test",
                    first_name="Amrita",
                    role=UserRole.CUSTOMER,
                )
            amrita = Customer.objects.create(
                user=amrita_user,
                name="Amrita Sharma",
                phone=AMRITA_PHONE,
                city="Mumbai",
                state="Maharashtra",
                pincode="400001",
                kyc_status="VERIFIED",
            )
            self.success(f"Amrita created: ID={amrita.id}")
        else:
            self.info(f"Amrita already exists: ID={amrita.id}")

        self.info(f"  Name: {amrita.name}")
        self.info(f"  Phone: {amrita.phone}")
        self.info(f"  City: {amrita.city}")

    def step_4_products(self):
        """Step 4: Create products (LuckyIDs moved to step 5 because they FK to Batch)."""
        self.print_step(4, f"SETUP {PRODUCT_COUNT} PRODUCTS")

        created_count = 0

        self.info(f"Creating {PRODUCT_COUNT} products...")

        with transaction.atomic():
            for i in range(PRODUCT_COUNT):
                # Product schema uses `name`, `base_price`, `is_active` — NOT
                # `product_name`, `price`, `active` (renamed during the PIM refactor).
                _, created = Product.objects.get_or_create(
                    product_code=f"PROD{i:04d}",
                    defaults={
                        "name": f"Product {i:03d}",
                        "category": "furniture",
                        "description": f"Test product {i:03d}",
                        "base_price": Decimal(str(15000 + (i * 500))),
                        "is_active": True,
                    },
                )
                if created:
                    created_count += 1

                if (i + 1) % 40 == 0:
                    self.info(f"  Processed {i + 1} products")

        total_products = Product.objects.count()
        self.success(f"Created {created_count} products")
        self.info(f"  Total products in DB: {total_products}")

    def step_5_batch_and_lucky_ids(self):
        """Step 5: Create JUL2026 batch and its per-slot LuckyIDs (LuckyIDs FK to Batch)."""
        self.print_step(5, f"CREATE BATCH {BATCH_CODE} + {LUCKY_ID_END} LUCKY IDS")

        # BatchStatus.ACTIVE was renamed — OPEN is the enrollment-accepting
        # status; ACTIVE no longer exists. Batch has no `batch_date`,
        # `description`, or `created_by` fields; scheduling anchors are
        # `start_date`, `duration_months`, `draw_day`.
        batch, created = Batch.objects.get_or_create(
            batch_code=BATCH_CODE,
            defaults={
                "start_date": BATCH_START,
                "total_slots": BATCH_TOTAL_SLOTS,
                "duration_months": BATCH_DURATION_MONTHS,
                "draw_day": BATCH_DRAW_DAY,
                "status": BatchStatus.OPEN,
            },
        )

        if created:
            self.success(f"Batch created: {batch.batch_code}")
        else:
            self.info(f"Batch already exists: {batch.batch_code}")
        self.info(f"  Start date: {batch.start_date}")
        self.info(f"  Duration months: {batch.duration_months}")
        self.info(f"  Draw day: {batch.draw_day}")
        self.info(f"  Status: {batch.status}")

        # LuckyId model is per-batch with integer `lucky_number` and a `status`
        # (AVAILABLE / RESERVED / ASSIGNED / WON etc); the old string
        # `lucky_id_code` column was dropped when the model went to composite
        # (batch, lucky_number) uniqueness.
        created_ids = 0
        with transaction.atomic():
            for n in range(LUCKY_ID_START, LUCKY_ID_END + 1):
                _, ok = LuckyId.objects.get_or_create(
                    batch=batch,
                    lucky_number=n,
                    defaults={"status": LuckyIdStatus.AVAILABLE},
                )
                if ok:
                    created_ids += 1

        self.success(f"Created {created_ids} lucky IDs for batch {batch.batch_code}")
        self.info(f"  Total lucky IDs for batch: {LuckyId.objects.filter(batch=batch).count()}")

    def step_6_subscriptions(self, num_subscriptions):
        """Step 6: Enroll bulk customers into the batch."""
        self.print_step(6, f"CREATE {num_subscriptions} RANDOM SUBSCRIPTIONS")

        try:
            batch = Batch.objects.get(batch_code=BATCH_CODE)
        except Batch.DoesNotExist:
            self.warning("Batch JUL2026 not found. Run step 5 first.")
            return

        eligible_customers = list(
            Customer.objects.filter(phone__startswith="900").exclude(phone=AMRITA_PHONE).order_by("id")[:num_subscriptions]
        )
        products = list(Product.objects.filter(product_code__startswith="PROD"))
        available_lucky_ids = list(
            LuckyId.objects.filter(batch=batch, status=LuckyIdStatus.AVAILABLE).order_by("lucky_number")
        )

        if not eligible_customers:
            self.warning("No seeded customers available. Run step 2 first.")
            return
        if not products:
            self.warning("No products available. Run step 4 first.")
            return
        if not available_lucky_ids:
            self.warning("No AVAILABLE lucky IDs. Run step 5 first.")
            return

        cap = min(len(eligible_customers), len(available_lucky_ids), num_subscriptions)
        self.info(f"Creating {cap} subscriptions (capped by min of customers/lucky_ids)...")

        random.seed(42)

        created_subs = 0
        with transaction.atomic():
            for i in range(cap):
                customer = eligible_customers[i]
                product = random.choice(products)
                lucky_id = available_lucky_ids[i]

                if Subscription.objects.filter(customer=customer, batch=batch).exists():
                    continue

                total_amount = Decimal(str(product.base_price))
                monthly_amount = (total_amount / Decimal(BATCH_DURATION_MONTHS)).quantize(Decimal("0.01"))

                Subscription.objects.create(
                    customer=customer,
                    product=product,
                    batch=batch,
                    lucky_id=lucky_id,
                    plan_type=PlanType.EMI,
                    status=SubscriptionStatus.ACTIVE,
                    start_date=BATCH_START,
                    tenure_months=BATCH_DURATION_MONTHS,
                    total_amount=total_amount,
                    monthly_amount=monthly_amount,
                )
                lucky_id.status = LuckyIdStatus.ASSIGNED
                lucky_id.save(update_fields=["status"])
                created_subs += 1

                if (i + 1) % 20 == 0:
                    self.info(f"  Created {i + 1} subscriptions")

        self.success(f"Created {created_subs} subscriptions")

    def step_7_verify_amrita(self):
        """Step 7: Give Amrita a subscription (if she doesn't already have one)."""
        self.print_step(7, "VERIFY AMRITA SUBSCRIPTION")

        try:
            amrita = Customer.objects.get(phone=AMRITA_PHONE)
            batch = Batch.objects.get(batch_code=BATCH_CODE)
        except (Customer.DoesNotExist, Batch.DoesNotExist) as exc:
            self.warning(f"Prerequisite missing: {exc}. Run earlier steps first.")
            return

        products = list(Product.objects.filter(product_code__startswith="PROD"))
        available_lucky_ids = list(
            LuckyId.objects.filter(batch=batch, status=LuckyIdStatus.AVAILABLE).order_by("lucky_number")
        )

        if not Subscription.objects.filter(customer=amrita, batch=batch).exists():
            if not products or not available_lucky_ids:
                self.warning("No products or available lucky IDs to assign to Amrita.")
                return

            product = random.choice(products)
            lucky_id = available_lucky_ids[0]

            total_amount = Decimal(str(product.base_price))
            monthly_amount = (total_amount / Decimal(BATCH_DURATION_MONTHS)).quantize(Decimal("0.01"))

            subscription = Subscription.objects.create(
                customer=amrita,
                product=product,
                batch=batch,
                lucky_id=lucky_id,
                plan_type=PlanType.EMI,
                status=SubscriptionStatus.ACTIVE,
                start_date=BATCH_START,
                tenure_months=BATCH_DURATION_MONTHS,
                total_amount=total_amount,
                monthly_amount=monthly_amount,
            )
            lucky_id.status = LuckyIdStatus.ASSIGNED
            lucky_id.save(update_fields=["status"])
            self.success(f"Amrita subscription created: {subscription.id}")
        else:
            self.info("Amrita already has subscription")

        for sub in Subscription.objects.filter(customer=amrita, batch=batch).select_related("product", "lucky_id"):
            self.info(f"  Subscription ID: {sub.id}")
            self.info(f"  Product: {sub.product.name}")
            self.info(f"  Lucky #: {sub.lucky_id.lucky_number}")
            self.info(f"  Tenure months: {sub.tenure_months}")

    def step_8_emi_schedule(self):
        """Step 8: Deterministic EMI schedule for the first few subs."""
        self.print_step(8, "GENERATE EMI SCHEDULE")

        ensure_test_financial_year()
        ensure_open_accounting_period_for_date(BATCH_START)

        try:
            batch = Batch.objects.get(batch_code=BATCH_CODE)
        except Batch.DoesNotExist:
            self.warning("Batch JUL2026 not found. Run step 5 first.")
            return

        subscriptions = list(Subscription.objects.filter(batch=batch)[:5])
        if not subscriptions:
            self.warning("No subscriptions in batch. Run step 6 first.")
            return

        self.info(f"Creating EMI schedule for {len(subscriptions)} subscriptions...")

        emi_count = 0
        with transaction.atomic():
            for sub in subscriptions:
                # Emi model has `month_no` (not `emi_number`); status uses the
                # canonical EmiStatus enum with UPPERCASE values.
                emi_amount = sub.monthly_amount
                for month in range(1, (sub.tenure_months or BATCH_DURATION_MONTHS) + 1):
                    emi_date = sub.start_date + timedelta(days=30 * month)
                    _, created = Emi.objects.get_or_create(
                        subscription=sub,
                        month_no=month,
                        defaults={
                            "amount": emi_amount,
                            "due_date": emi_date,
                            "status": EmiStatus.PENDING,
                        },
                    )
                    if created:
                        emi_count += 1

        total_emis = Emi.objects.filter(subscription__batch=batch).count()
        self.success(f"Created {emi_count} EMIs")
        self.info(f"  Total EMIs in batch: {total_emis}")

    def step_9_report(self):
        """Step 9: Print consolidated seed summary."""
        self.print_step(9, "FINAL REPORT")

        total_customers = Customer.objects.count()
        total_subscriptions = Subscription.objects.count()
        total_products = Product.objects.count()
        total_lucky_ids = LuckyId.objects.count()
        total_emis = Emi.objects.count()

        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("JUL2026 TEST BATCH - COMPREHENSIVE REPORT")
        self.stdout.write("=" * 80 + "\n")

        self.info(f"Total Customers:        {total_customers}")
        self.info(f"Total Subscriptions:    {total_subscriptions}")
        self.info(f"Total Products:         {total_products}")
        self.info(f"Total Lucky IDs:        {total_lucky_ids}")
        self.info(f"Total EMIs:             {total_emis}")

        try:
            batch = Batch.objects.get(batch_code=BATCH_CODE)
            batch_subs = Subscription.objects.filter(batch=batch).count()
            self.stdout.write("")
            self.info(f"Batch {BATCH_CODE}:")
            self.info(f"  Status:        {batch.status}")
            self.info(f"  Subscriptions: {batch_subs}")
            self.info(f"  Created:       {batch.created_at}")
        except Batch.DoesNotExist:
            self.stdout.write("")
            self.warning(f"Batch {BATCH_CODE} not found")

        try:
            amrita = Customer.objects.get(phone=AMRITA_PHONE)
            amrita_subs = Subscription.objects.filter(customer=amrita).count()
            self.stdout.write("")
            self.info("Amrita Sharma:")
            self.info(f"  Phone:         {amrita.phone}")
            self.info(f"  Subscriptions: {amrita_subs}")
        except Customer.DoesNotExist:
            self.stdout.write("")
            self.warning("Amrita not found")

        self.stdout.write("\n" + "=" * 80)
        self.success("JUL2026 TEST BATCH COMPLETE!")
        self.stdout.write("=" * 80 + "\n")

    def step_10_public_leads(self):
        """Step 10: Seed public leads + subscription requests to exercise CRM."""
        self.print_step(10, "CREATE 10 PUBLIC LEADS AND SUBSCRIPTION REQUESTS")

        try:
            batch = Batch.objects.get(batch_code=BATCH_CODE)
        except Batch.DoesNotExist:
            self.warning("Batch JUL2026 not found. Run step 5 first.")
            return

        admin = User.objects.filter(is_superuser=True).first()
        if not admin:
            admin = create_admin_user(username="lead_admin_10", phone="9990000010")

        products = list(Product.objects.filter(product_code__startswith="PROD")[:10])
        if len(products) < 10:
            self.warning("Not enough products available (need >=10). Run step 4 first.")
            return

        # Reserve lucky_numbers 90..94 for vacant-lead scenarios so they never
        # collide with an assigned subscription (step 6 picks in ascending order
        # starting at 0, and 70 subs cap at 69).
        self.info("Creating 5 public leads requesting vacant lucky IDs (numbers 90-94)...")
        for i, lucky_num in enumerate(range(90, 95)):
            lead, _ = PublicLead.objects.get_or_create(
                phone=f"93000000{i:02d}",
                defaults={
                    "name": f"Vacant Lead {i + 1}",
                    "email": f"vacant{i + 1}@jul2026.test",
                    "product": products[i],
                },
            )
            SubscriptionRequest.objects.get_or_create(
                requester=admin,
                requested_customer_phone=lead.phone,
                batch=batch,
                defaults={
                    "requester_role_snapshot": "admin",
                    "requested_customer_name": lead.name,
                    "requested_customer_email": lead.email or "",
                    "product": products[i],
                    "preferred_lucky_number": lucky_num,
                    "requested_tenure_months_snapshot": BATCH_DURATION_MONTHS,
                    "source_public_lead": lead,
                    "status": SubscriptionRequestStatus.SUBMITTED,
                },
            )

        self.info("Creating 5 public leads requesting already-assigned lucky IDs...")
        assigned_subs = list(
            Subscription.objects.filter(batch=batch, lucky_id__isnull=False).select_related("lucky_id")[:5]
        )
        assigned_numbers = [sub.lucky_id.lucky_number for sub in assigned_subs] or [1, 2, 3, 4, 5]

        for i, lucky_num in enumerate(assigned_numbers):
            lead, _ = PublicLead.objects.get_or_create(
                phone=f"94000000{i:02d}",
                defaults={
                    "name": f"Non-Vacant Lead {i + 1}",
                    "email": f"nonvacant{i + 1}@jul2026.test",
                    "product": products[i + 5],
                },
            )
            SubscriptionRequest.objects.get_or_create(
                requester=admin,
                requested_customer_phone=lead.phone,
                batch=batch,
                defaults={
                    "requester_role_snapshot": "admin",
                    "requested_customer_name": lead.name,
                    "requested_customer_email": lead.email or "",
                    "product": products[i + 5],
                    "preferred_lucky_number": lucky_num,
                    "requested_tenure_months_snapshot": BATCH_DURATION_MONTHS,
                    "source_public_lead": lead,
                    "status": SubscriptionRequestStatus.SUBMITTED,
                },
            )

        self.success("Created 10 public leads and subscription requests")

    # ------------------------------------------------------------------ finisher

    def print_final_report(self):
        try:
            total_customers = Customer.objects.count()
            total_subscriptions = Subscription.objects.count()
            total_products = Product.objects.count()
            total_lucky_ids = LuckyId.objects.count()

            self.stdout.write("\n" + "=" * 80)
            self.stdout.write("FINAL DATA SUMMARY")
            self.stdout.write("=" * 80 + "\n")

            self.info(f"Customers:     {total_customers}")
            self.info(f"Subscriptions: {total_subscriptions}")
            self.info(f"Products:      {total_products}")
            self.info(f"Lucky IDs:     {total_lucky_ids}")
            self.success(f"TOTAL ITEMS: {total_products + total_lucky_ids}")

            self.stdout.write("\n" + "=" * 80 + "\n")
        except Exception as exc:
            self.warning(f"Error generating report: {exc}")
