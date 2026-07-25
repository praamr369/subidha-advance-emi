#!/usr/bin/env python
"""
Quick verification script for JUL2026 batch setup
Run with: python manage.py shell < verify_jul2026_batch.py
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from subscriptions.models import (
    Customer, Subscription, Product, LuckyId,
    Batch, Emi, LuckyIdStatus, SubscriptionStatus,
    BatchStatus, PlanType
)
from accounts.models import User

def print_header(title):
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80 + "\n")

def print_section(title):
    print(f"\n{title}")
    print("-" * len(title))

def verify_batch():
    """Comprehensive JUL2026 batch verification"""

    print_header("🔍 JUL2026 BATCH VERIFICATION REPORT")

    # 1. Count all data
    print_section("1️⃣  DATA COUNTS")

    total_customers = Customer.objects.count()
    total_subscriptions = Subscription.objects.count()
    total_products = Product.objects.count()
    total_lucky_ids = LuckyId.objects.count()
    total_emis = Emi.objects.count()

    print(f"Total Customers:        {total_customers}")
    print(f"Total Subscriptions:    {total_subscriptions}")
    print(f"Total Products:         {total_products}")
    print(f"Total Lucky IDs:        {total_lucky_ids}")
    print(f"Total EMIs:             {total_emis}")
    print(f"Total Items (P+L):      {total_products + total_lucky_ids}")

    # 2. Batch info
    print_section("2️⃣  BATCH INFORMATION")

    try:
        batch = Batch.objects.get(batch_name="JUL2026")
        batch_subs = Subscription.objects.filter(batch=batch)

        print(f"Batch Name:             {batch.batch_name}")
        print(f"Batch Date:             {batch.batch_date}")
        print(f"Batch Status:           {batch.status}")
        print(f"Created At:             {batch.created_at}")
        print(f"Subscriptions in Batch: {batch_subs.count()}")

        if batch_subs.exists():
            total_batch_emi = Emi.objects.filter(subscription__batch=batch).count()
            print(f"EMIs in Batch:          {total_batch_emi}")
    except Batch.DoesNotExist:
        print("❌ Batch JUL2026 NOT FOUND!")

    # 3. Amrita info
    print_section("3️⃣  AMRITA CUSTOMER")

    try:
        amrita = Customer.objects.get(name="Amrita Sharma")
        amrita_subs = Subscription.objects.filter(customer=amrita)

        print(f"Name:                   {amrita.name}")
        print(f"Phone:                  {amrita.phone}")
        print(f"Email:                  {amrita.email}")
        print(f"City:                   {amrita.city}")
        print(f"KYC Status:             {amrita.kyc_status}")
        print(f"Subscriptions:          {amrita_subs.count()}")

        for sub in amrita_subs:
            print(f"\n  Subscription Details:")
            print(f"    - ID:              {sub.id}")
            print(f"    - Product:         {sub.product.product_name}")
            print(f"    - Price:           ₹{sub.price}")
            print(f"    - Lucky ID:        {sub.lucky_id.lucky_id_code}")
            print(f"    - EMIs:            {sub.emi_set.count()}")
            print(f"    - Status:          {sub.status}")

    except Customer.DoesNotExist:
        print("❌ Amrita NOT FOUND!")

    # 4. Customer statistics
    print_section("4️⃣  CUSTOMER STATISTICS")

    verified_customers = Customer.objects.filter(kyc_status="verified").count()
    unverified_customers = Customer.objects.filter(kyc_status__in=["pending", "rejected"]).count()

    print(f"KYC Verified:           {verified_customers}")
    print(f"KYC Not Verified:       {unverified_customers}")

    # Sample customers
    sample_customers = Customer.objects.all()[:3]
    if sample_customers:
        print(f"\nSample Customers:")
        for cust in sample_customers:
            print(f"  - {cust.name} ({cust.phone})")

    # 5. Product statistics
    print_section("5️⃣  PRODUCT STATISTICS")

    active_products = Product.objects.filter(active=True).count()
    inactive_products = Product.objects.filter(active=False).count()

    print(f"Active Products:        {active_products}")
    print(f"Inactive Products:      {inactive_products}")

    # Sample products
    sample_products = Product.objects.all()[:3]
    if sample_products:
        print(f"\nSample Products:")
        for prod in sample_products:
            print(f"  - {prod.product_code}: {prod.product_name} (₹{prod.price})")

    # 6. Lucky ID statistics
    print_section("6️⃣  LUCKY ID STATISTICS")

    available_lucky = LuckyId.objects.filter(status=LuckyIdStatus.AVAILABLE).count()
    assigned_lucky = LuckyId.objects.filter(status__in=["assigned", "used", "won"]).count()

    print(f"Available Lucky IDs:    {available_lucky}")
    print(f"Assigned/Used:          {assigned_lucky}")

    # Sample lucky IDs
    sample_lucky = LuckyId.objects.all()[:3]
    if sample_lucky:
        print(f"\nSample Lucky IDs:")
        for lucky in sample_lucky:
            print(f"  - {lucky.lucky_id_code} ({lucky.status})")

    # 7. Subscription statistics
    print_section("7️⃣  SUBSCRIPTION STATISTICS")

    active_subs = Subscription.objects.filter(status=SubscriptionStatus.ACTIVE).count()
    emi_subs = Subscription.objects.filter(plan_type=PlanType.EMI).count()
    other_subs = Subscription.objects.exclude(plan_type=PlanType.EMI).count()

    print(f"Active Subscriptions:   {active_subs}")
    print(f"EMI Plan:               {emi_subs}")
    print(f"Other Plans:            {other_subs}")

    # Sample subscriptions
    sample_subs = Subscription.objects.all()[:3]
    if sample_subs:
        print(f"\nSample Subscriptions:")
        for sub in sample_subs:
            print(f"  - {sub.customer.name} → {sub.product.product_name}")
            print(f"    Lucky ID: {sub.lucky_id.lucky_id_code}")
            print(f"    Price: ₹{sub.price} (EMIs: {sub.emi_set.count()})")

    # 8. EMI statistics
    print_section("8️⃣  EMI STATISTICS")

    pending_emis = Emi.objects.filter(status="pending").count()
    paid_emis = Emi.objects.filter(status="paid").count()
    overdue_emis = Emi.objects.filter(status="overdue").count()

    print(f"Pending EMIs:           {pending_emis}")
    print(f"Paid EMIs:              {paid_emis}")
    print(f"Overdue EMIs:           {overdue_emis}")

    # Average EMI per subscription
    if total_subscriptions > 0:
        avg_emis = total_emis / total_subscriptions
        print(f"Average EMIs/Sub:       {avg_emis:.1f}")

    # 9. Data validation
    print_section("9️⃣  DATA VALIDATION")

    checks = []

    # Check 1: Customers with KYC verified
    check1 = total_customers > 0 and verified_customers == total_customers
    checks.append(("All customers KYC verified", check1))

    # Check 2: Batch exists
    check2 = Batch.objects.filter(batch_name="JUL2026").exists()
    checks.append(("Batch JUL2026 exists", check2))

    # Check 3: Amrita exists
    check3 = Customer.objects.filter(name="Amrita Sharma").exists()
    checks.append(("Amrita customer exists", check3))

    # Check 4: Products exist
    check4 = total_products > 0
    checks.append(("Products created", check4))

    # Check 5: Lucky IDs exist
    check5 = total_lucky_ids > 0
    checks.append(("Lucky IDs created", check5))

    # Check 6: Subscriptions exist
    check6 = total_subscriptions > 0
    checks.append(("Subscriptions created", check6))

    # Check 7: EMIs generated
    check7 = total_emis > 0
    checks.append(("EMIs generated", check7))

    # Check 8: All subs have products
    check8_count = Subscription.objects.filter(product__isnull=True).count()
    check8 = check8_count == 0
    checks.append(("All subscriptions have products", check8))

    # Check 9: All subs have customers
    check9_count = Subscription.objects.filter(customer__isnull=True).count()
    check9 = check9_count == 0
    checks.append(("All subscriptions have customers", check9))

    # Check 10: All subs have lucky IDs
    check10_count = Subscription.objects.filter(lucky_id__isnull=True).count()
    check10 = check10_count == 0
    checks.append(("All subscriptions have lucky IDs", check10))

    for check_name, result in checks:
        status = "✅" if result else "❌"
        print(f"{status} {check_name}")

    # 10. Final summary
    print_section("🔟 FINAL SUMMARY")

    total_checks = len(checks)
    passed_checks = sum(1 for _, result in checks if result)

    print(f"Total Checks:           {total_checks}")
    print(f"Passed:                 {passed_checks}")
    print(f"Failed:                 {total_checks - passed_checks}")

    success_rate = (passed_checks / total_checks * 100) if total_checks > 0 else 0
    print(f"Success Rate:           {success_rate:.1f}%")

    # Overall status
    print_header("FINAL STATUS")

    if passed_checks == total_checks and total_customers >= 100:
        print("✅ JUL2026 BATCH FULLY VERIFIED AND READY!")
        print(f"\n📊 Metrics:")
        print(f"   • Customers:   {total_customers}")
        print(f"   • Products:    {total_products}")
        print(f"   • Lucky IDs:   {total_lucky_ids}")
        print(f"   • Subscriptions: {total_subscriptions}")
        print(f"   • EMIs:        {total_emis}")
        return 0
    else:
        print("⚠️  SOME CHECKS FAILED - REVIEW ABOVE!")
        print(f"\nPlease review the failed checks and rerun the batch if needed.")
        return 1

if __name__ == "__main__":
    sys.exit(verify_batch())
