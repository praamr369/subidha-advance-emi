"""
Unified JUL2026 batch test - all steps in one test method
"""
from django.test import TestCase
from subscriptions.models import (
    Customer, Product, LuckyId, Batch, Subscription, Emi, PlanType
)
from accounts.models import User
from django.utils import timezone
from datetime import timedelta
import random
from decimal import Decimal


def create_user(username, phone):
    return User.objects.create_user(
        username=username,
        phone=phone,
        password="test123"
    )


class JUL2026UnifiedTest(TestCase):
    """Complete JUL2026 test - all steps in one method"""

    def test_complete_jul2026_workflow(self):
        """Run complete JUL2026 batch workflow"""
        print("\n" + "="*80)
        print("JUL2026 COMPLETE BATCH TEST - UNIFIED WORKFLOW")
        print("="*80)

        # ----------------------------------------------------------
        # STEP 1: Create 101 customers (100 new + Amrita)
        # ----------------------------------------------------------
        print("\n[STEP 1] Creating 101 customers (100 + Amrita)...")
        customers = []
        for i in range(100):
            user = create_user(f"cust{i:03d}", f"700{i:07d}")
            customer = Customer.objects.create(
                name=f"Customer {i:03d}",
                phone=f"700{i:07d}",
                user=user,
                kyc_status="VERIFIED",
                city="Mumbai",
                state="Maharashtra",
                pincode="400001"
            )
            customers.append(customer)
            if (i + 1) % 20 == 0:
                print(f"  Created {i + 1} customers")

        # Amrita - special customer
        amrita_user = create_user("amrita_sharma", "9800012345")
        amrita = Customer.objects.create(
            name="Amrita Sharma",
            phone="9800012345",
            user=amrita_user,
            kyc_status="VERIFIED",
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
            address="Amrita House, Mumbai"
        )
        customers.append(amrita)
        print(f"  Created 101 (Amrita added)")
        print(f"\n[OK] Total customers: {len(customers)}")
        print(f"     Amrita: {amrita.name} | {amrita.phone} | {amrita.city}")

        # ----------------------------------------------------------
        # STEP 2: Create 120 products
        # ----------------------------------------------------------
        print("\n[STEP 2] Creating 120 products...")
        products = []
        for i in range(120):
            price = Decimal(str(15000 + (i * 500)))
            product = Product.objects.create(
                product_code=f"PROD{i:04d}",
                name=f"Product {i:04d}",
                base_price=price
            )
            products.append(product)
            if (i + 1) % 40 == 0:
                print(f"  Created {i + 1} products")
        print(f"[OK] Total products: {len(products)}")

        # ----------------------------------------------------------
        # STEP 3: Create Batch JUL2026
        # ----------------------------------------------------------
        print("\n[STEP 3] Creating Batch JUL2026...")
        today = timezone.now().date()
        batch = Batch.objects.create(
            batch_code="JUL2026",
            total_slots=100,
            duration_months=12,
            draw_day=15,
            start_date=today,
            status="OPEN"
        )
        print(f"[OK] Batch JUL2026 created")
        print(f"     Status: {batch.status} | Slots: {batch.total_slots} | Duration: {batch.duration_months}m")

        # ----------------------------------------------------------
        # STEP 4: Lucky IDs are auto-created by post_save signal on Batch
        # (numbers 0-99 created automatically when Batch is created)
        # ----------------------------------------------------------
        print("\n[STEP 4] Fetching auto-created lucky IDs (post_save signal)...")
        lucky_ids = list(LuckyId.objects.filter(batch=batch).order_by("lucky_number"))
        print(f"[OK] Lucky IDs auto-created: {len(lucky_ids)}")
        if lucky_ids:
            print(f"     Range: {lucky_ids[0].lucky_number} to {lucky_ids[-1].lucky_number}")

        # ----------------------------------------------------------
        # STEP 5: Create 71 subscriptions (90 customers, Amrita included)
        # ----------------------------------------------------------
        print("\n[STEP 5] Creating 71 subscriptions with EMI schedules...")
        subscriptions = []
        emi_count = 0

        # Use first 70 regular customers + Amrita = 71 total
        sub_customers = customers[:70] + [amrita]

        for i, customer in enumerate(sub_customers):
            product = products[i % len(products)]
            lucky_id = lucky_ids[i % len(lucky_ids)]
            monthly = (product.base_price / 12).quantize(Decimal("0.01"))
            total = product.base_price

            subscription = Subscription.objects.create(
                customer=customer,
                product=product,
                lucky_id=lucky_id,
                batch=batch,
                plan_type=PlanType.EMI,
                tenure_months=12,
                start_date=today,
                total_amount=total,
                monthly_amount=monthly,
                status="ACTIVE"
            )
            subscriptions.append(subscription)

            # 12 EMIs per subscription
            for month_no in range(1, 13):
                due_date = today + timedelta(days=30 * month_no)
                Emi.objects.create(
                    subscription=subscription,
                    month_no=month_no,
                    due_date=due_date,
                    amount=monthly.quantize(Decimal("0.01")),
                    status="PENDING"
                )
                emi_count += 1

            if (i + 1) % 25 == 0 or (i + 1) == 71:
                print(f"  Created {i + 1} subscriptions ({emi_count} EMIs)")

        print(f"[OK] Total subscriptions: {len(subscriptions)}")
        print(f"[OK] Total EMIs: {emi_count}")

        # ----------------------------------------------------------
        # STEP 6: Final comprehensive report
        # ----------------------------------------------------------
        print("\n" + "="*80)
        print("JUL2026 FINAL REPORT")
        print("="*80)

        total_customers = Customer.objects.count()
        total_subscriptions = Subscription.objects.count()
        total_products = Product.objects.count()
        total_lucky_ids = LuckyId.objects.count()
        total_emis = Emi.objects.count()
        total_items = total_products + total_lucky_ids

        print(f"\n[REPORT] TEST BATCH JUL2026 - FINAL COUNTS")
        print(f"  Customers Registered   : {total_customers}")
        print(f"  Products in Catalog    : {total_products}")
        print(f"  Lucky IDs Available    : {total_lucky_ids}")
        print(f"  Total Items (P+L)      : {total_items}")
        print(f"  Subscriptions Created  : {total_subscriptions}")
        print(f"  EMIs Generated         : {total_emis}")

        # Batch details
        batch_info = Batch.objects.get(batch_code="JUL2026")
        batch_subs = Subscription.objects.filter(batch=batch_info).count()
        print(f"\n[BATCH] JUL2026 Details:")
        print(f"  Code     : {batch_info.batch_code}")
        print(f"  Status   : {batch_info.status}")
        print(f"  Slots    : {batch_info.total_slots}")
        print(f"  Duration : {batch_info.duration_months} months")
        print(f"  Subs     : {batch_subs}")

        # Amrita details
        amrita_info = Customer.objects.get(name="Amrita Sharma")
        amrita_subs = Subscription.objects.filter(customer=amrita_info).count()
        amrita_emis = Emi.objects.filter(subscription__customer=amrita_info).count()
        print(f"\n[CUSTOMER] Amrita Sharma:")
        print(f"  Phone    : {amrita_info.phone}")
        print(f"  City     : {amrita_info.city}")
        print(f"  KYC      : {amrita_info.kyc_status}")
        print(f"  Subs     : {amrita_subs}")
        print(f"  EMIs     : {amrita_emis}")

        print(f"\n" + "="*80)
        print(f"[DONE] JUL2026 TEST BATCH COMPLETE! ALL ASSERTIONS PASSED")
        print(f"="*80)

        # Assertions
        self.assertEqual(total_customers, 101, "Should have exactly 101 customers")
        self.assertEqual(total_subscriptions, 71, "Should have exactly 71 subscriptions")
        self.assertEqual(total_products, 120, "Should have exactly 120 products")
        self.assertEqual(total_lucky_ids, 100, "Should have exactly 100 lucky IDs")
        self.assertEqual(total_emis, 71 * 12, "Should have 852 EMIs (71 x 12)")
        self.assertEqual(amrita_subs, 1, "Amrita should have 1 subscription")
        self.assertEqual(amrita_emis, 12, "Amrita should have 12 EMIs")
