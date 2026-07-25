"""
JUL2026 Minimal Test Batch - Working version
"""

from django.test import TestCase
from subscriptions.models import Customer, LuckyId, LuckyIdStatus
from tests.helpers import create_user, create_admin_user, ensure_default_payment_collection_accounts
from accounts.models import UserRole


class JUL2026WorkingTest(TestCase):
    """Working test for JUL2026 batch"""

    def setUp(self):
        ensure_default_payment_collection_accounts()
        self.admin = create_admin_user(username="test_admin")

    def test_jul2026_workflow(self):
        """Test JUL2026 workflow - create customers and lucky IDs"""
        print("\n" + "="*80)
        print("JUL2026 TEST BATCH - WORKING VERSION")
        print("="*80)

        # Step 1: Create 105 customers
        print("\nStep 1: Creating 105 customers...")
        customers = []

        for i in range(105):
            phone = str(9000000000 + i)
            user = create_user(
                username=f"jul_cust_{i:03d}",
                phone=phone,
                first_name=f"Customer{i:03d}",
                role=UserRole.CUSTOMER,
            )

            customer = Customer.objects.create(
                user=user,
                name=f"Customer{i:03d}",
                phone=phone,
                city="New Delhi",
                state="Delhi",
                pincode="110001",
            )
            customers.append(customer)

            if (i + 1) % 20 == 0:
                print(f"  Created {i + 1} customers")

        print(f"\nSuccess! Created {len(customers)} customers")
        self.assertEqual(Customer.objects.count(), 105)

        # Step 2: Create 160 lucky IDs
        print("\nStep 2: Creating 160 lucky IDs...")
        lucky_ids = []

        for i in range(160):
            lucky_id = LuckyId.objects.create(
                lucky_id_code=f"LUCKY{i:05d}",
                status=LuckyIdStatus.AVAILABLE,
            )
            lucky_ids.append(lucky_id)

            if (i + 1) % 40 == 0:
                print(f"  Created {i + 1} lucky IDs")

        print(f"\nSuccess! Created {len(lucky_ids)} lucky IDs")
        self.assertEqual(LuckyId.objects.count(), 160)

        # Step 3: Create Amrita customer
        print("\nStep 3: Creating Amrita customer...")
        amrita_user = create_user(
            username="amrita_sharma",
            phone="9900000001",
            first_name="Amrita",
            role=UserRole.CUSTOMER,
        )

        amrita = Customer.objects.create(
            user=amrita_user,
            name="Amrita Sharma",
            phone="9900000001",
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
        )

        print(f"Success! Amrita created")
        print(f"  Name: {amrita.name}")
        print(f"  Phone: {amrita.phone}")
        print(f"  City: {amrita.city}")

        # Final report
        print("\n" + "="*80)
        print("FINAL REPORT")
        print("="*80)
        print(f"\nCustomers created: {Customer.objects.count()}")
        print(f"Lucky IDs created: {LuckyId.objects.count()}")
        print(f"Total items: {Customer.objects.count() + LuckyId.objects.count()}")
        print(f"\n[PASS] JUL2026 TEST BATCH COMPLETE!")
        print("="*80 + "\n")

        # Assertions
        self.assertGreater(Customer.objects.count(), 100)
        self.assertGreater(LuckyId.objects.count(), 150)
        self.assertEqual(
            Customer.objects.filter(name="Amrita Sharma").count(), 1
        )
