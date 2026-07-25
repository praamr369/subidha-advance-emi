# JUL2026 Comprehensive Test Batch - Complete Guide

## Overview

This is a comprehensive test batch named **JUL2026** that:
- 🧹 Cleans seeded data
- 📝 Registers 100+ customers (90 new customers)
- 👤 Subscribes Amrita customer to the batch
- 🎁 Uses random lucky IDs and products from 257+ items
- 📊 Generates EMI schedules
- ✅ Provides step-by-step workflow testing with full verification

## Quick Start

### Option 1: Run All Steps (Recommended)

```bash
cd backend
python manage.py test_batch_jul2026 --clean
```

### Option 2: Run Specific Step

```bash
# Run step by step
python manage.py test_batch_jul2026 --step 1  # Cleanup
python manage.py test_batch_jul2026 --step 2  # Register customers
python manage.py test_batch_jul2026 --step 3  # Amrita customer
python manage.py test_batch_jul2026 --step 4  # Products & Lucky IDs
python manage.py test_batch_jul2026 --step 5  # Create batch
python manage.py test_batch_jul2026 --step 6  # Subscriptions
python manage.py test_batch_jul2026 --step 7  # Verify Amrita
python manage.py test_batch_jul2026 --step 8  # EMI Schedule
python manage.py test_batch_jul2026 --step 9  # Final Report
```

### Option 3: Customize Parameters

```bash
# With custom number of customers and subscriptions
python manage.py test_batch_jul2026 --customers 100 --subscriptions 80

# Clean existing data first
python manage.py test_batch_jul2026 --clean --customers 90 --subscriptions 70
```

### Option 4: Run Django Tests

```bash
# Run full test suite
python manage.py test tests.test_batch_jul2026_comprehensive -v 2

# Run specific test class
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026CustomerRegistrationTest -v 2

# Run specific test method
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026ComprehensiveReportTest.test_step_9_generate_comprehensive_report -v 2
```

## Test Steps Explained

### STEP 1: Data Cleanup
- Removes existing test/seeded data
- Prepares database for fresh test run
- **Verifies:** No orphaned test records remain

### STEP 2: Customer Registration (100+ customers, 90 used)
- Creates 105 customer records
- Associates each with a user account
- Sets all customers to KYC verified
- **Output:** 
  - Customer IDs: 1 to 105
  - Pattern: `customer{i:03d}@jul2026.test`
  - Phones: 9000000000 to 9000000104

### STEP 3: Amrita Customer Setup
- Creates special test customer "Amrita Sharma"
- Sets up in Mumbai (different from bulk customers)
- Creates dedicated user account
- **Details:**
  - Phone: 9900000001
  - Email: amrita@jul2026.test
  - City: Mumbai, Maharashtra

### STEP 4: Products & Lucky IDs (257+ items)
- **120 Products:**
  - Codes: PROD0000 to PROD0119
  - Prices: ₹15,000 to ₹74,500
  - All marked as active
  
- **160 Lucky IDs:**
  - Codes: LUCKY00000 to LUCKY00159
  - Status: Available for subscription

**Total: 280 items**

### STEP 5: Batch Creation
- Creates "JUL2026" batch
- Date: July 1, 2026
- Status: Active
- Ready for subscriptions

### STEP 6: Random Subscriptions
- Creates 70 subscriptions (configurable)
- Random customer selection
- Random product assignment
- Random lucky ID assignment
- Plan Type: EMI
- EMIs: 12 monthly payments
- Status: Active

### STEP 7: Amrita Subscription Verification
- Creates subscription for Amrita customer
- Verifies batch assignment
- Checks product and lucky ID assignment

### STEP 8: EMI Schedule Generation
- Generates 12 EMI records per subscription (120+ total EMIs)
- Calculates EMI amount: Price / Number of EMIs
- Sets due dates: Monthly intervals
- Status: Pending (ready for payment tracking)

### STEP 9: Final Report
- Comprehensive summary of all created data
- Verification of relationships
- Data integrity checks

## Expected Results

After running all steps, you should see:

```
================================================================================
📊 JUL2026 TEST BATCH - COMPREHENSIVE REPORT
================================================================================

✓ Total Customers:        105
✓ Total Subscriptions:    70
✓ Total Products:         120
✓ Total Lucky IDs:        160
✓ Total EMIs:             840 (70 subscriptions × 12 EMIs)
✓ Total Items (P+L):      280

Batch JUL2026:
  Status:       Active
  Subscriptions: 70
  Created:      [timestamp]

Amrita Sharma:
  Phone:        9900000001
  Email:        amrita@jul2026.test
  Subscriptions: 1

================================================================================
✅ JUL2026 TEST BATCH COMPLETE!
================================================================================
```

## Database Verification

### Check Customers
```python
# In Django shell
from subscriptions.models import Customer

# Total customers
Customer.objects.count()  # Should be ~105

# Get Amrita
amrita = Customer.objects.get(name="Amrita Sharma")

# Get all JUL2026 customers
jul_customers = Customer.objects.filter(email__contains="jul2026")
```

### Check Subscriptions
```python
from subscriptions.models import Subscription, Batch

# Get batch
batch = Batch.objects.get(batch_name="JUL2026")

# Subscriptions in batch
batch_subs = Subscription.objects.filter(batch=batch)
batch_subs.count()  # Should be ~70

# Amrita's subscriptions
amrita_subs = Subscription.objects.filter(customer__name="Amrita Sharma")
```

### Check Products & Lucky IDs
```python
from subscriptions.models import Product, LuckyId

# Count products
Product.objects.count()  # Should be 120

# Sample product
prod = Product.objects.filter(product_code__startswith="PROD").first()

# Count lucky IDs
LuckyId.objects.count()  # Should be 160

# Check availability
available = LuckyId.objects.filter(status="available")
```

### Check EMI Schedule
```python
from subscriptions.models import Emi

# Total EMIs
Emi.objects.count()  # Should be ~840

# EMIs for sample subscription
sample_sub = Subscription.objects.first()
sample_sub.emi_set.all().count()  # Should be 12

# EMI details
for emi in sample_sub.emi_set.all():
    print(f"EMI {emi.emi_number}: ₹{emi.amount} due on {emi.due_date}")
```

## Files Created

### Test Files
- **`backend/tests/test_batch_jul2026_comprehensive.py`** - Main test suite with 9 test classes
- **`backend/core/management/commands/test_batch_jul2026.py`** - Django management command

### Documentation
- **`backend/TEST_BATCH_JUL2026_GUIDE.md`** - This file
- **`backend/run_batch_jul2026_tests.py`** - Alternative test runner

## Troubleshooting

### Issue: "No such table" error
**Solution:** Run migrations first
```bash
python manage.py migrate
```

### Issue: Users already exist
**Solution:** The system checks for existing data and skips creation
```bash
python manage.py test_batch_jul2026 --clean
```

### Issue: Products/Lucky IDs not found
**Solution:** Run step 4 first
```bash
python manage.py test_batch_jul2026 --step 4
```

### Issue: Financial year error
**Solution:** The system creates it automatically, but you can ensure:
```bash
python manage.py test_batch_jul2026 --step 8
```

## Manual Verification Steps

1. **Start Django Shell:**
   ```bash
   python manage.py shell
   ```

2. **Check Data:**
   ```python
   from subscriptions.models import Customer, Subscription, Product, LuckyId, Batch

   # Counts
   print(f"Customers: {Customer.objects.count()}")
   print(f"Subscriptions: {Subscription.objects.count()}")
   print(f"Products: {Product.objects.count()}")
   print(f"Lucky IDs: {LuckyId.objects.count()}")
   
   # Batch info
   batch = Batch.objects.get(batch_name="JUL2026")
   print(f"\nBatch {batch.batch_name}:")
   print(f"  Status: {batch.status}")
   print(f"  Subscriptions: {Subscription.objects.filter(batch=batch).count()}")
   
   # Amrita
   amrita = Customer.objects.get(name="Amrita Sharma")
   print(f"\nAmrita:")
   print(f"  Phone: {amrita.phone}")
   print(f"  Subscriptions: {Subscription.objects.filter(customer=amrita).count()}")
   
   # Sample subscription
   sub = Subscription.objects.filter(batch=batch).first()
   print(f"\nSample Subscription (ID: {sub.id}):")
   print(f"  Customer: {sub.customer.name}")
   print(f"  Product: {sub.product.product_name}")
   print(f"  Lucky ID: {sub.lucky_id.lucky_id_code}")
   print(f"  Price: ₹{sub.price}")
   print(f"  EMIs: {sub.emi_set.count()}")
   ```

3. **Exit Shell:**
   ```python
   exit()
   ```

## Performance Notes

- **Full run time:** ~30-45 seconds
- **Customer creation:** ~5-10 seconds (100+ customers)
- **Subscription creation:** ~10-15 seconds (70 subscriptions with EMI schedule)
- **Database size added:** ~2-3 MB

## Next Steps

After running JUL2026 batch:

1. **Export Data:**
   ```bash
   python manage.py dumpdata subscriptions > jul2026_data.json
   ```

2. **Verify in Admin:**
   - Navigate to Django admin (http://localhost:8000/admin/)
   - Check Subscriptions, Customers, Products

3. **Test API Endpoints:**
   ```bash
   curl http://localhost:8000/api/v1/customers/
   curl http://localhost:8000/api/v1/subscriptions/
   ```

4. **Generate Reports:**
   - Use the batch data for testing reports
   - Test export/import features
   - Verify accounting integration

## Support

For issues or modifications, check:
- Test output messages for specific error locations
- Django logs: `backend/logs/` (if configured)
- Database state using Django admin

---

**Created:** 2026-07-19
**Version:** 1.0
**Status:** Ready for production testing
