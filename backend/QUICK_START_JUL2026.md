# 🚀 JUL2026 Test Batch - QUICK START

## ⚡ 30-Second Setup

```bash
# Just run this ONE command to test everything:
python manage.py test tests.test_batch_jul2026_comprehensive -v 2
```

**That's it!** The test will:
- ✅ Clean seeded data
- ✅ Register 105 customers
- ✅ Create Amrita customer
- ✅ Add 280 products & lucky IDs
- ✅ Generate 71 subscriptions
- ✅ Create 850+ EMI records
- ✅ Verify everything works

**Time to complete:** ~30-45 seconds

---

## 📊 What Gets Created

| What | Count | Details |
|------|-------|---------|
| Customers | 105 | Phones: 9000000000-9000000104 + Amrita |
| Products | 120 | PROD0000-PROD0119 (₹15K-₹74.5K) |
| Lucky IDs | 160 | LUCKY00000-LUCKY00159 (all available) |
| Subscriptions | 71 | 70 + Amrita (all active, 12 EMI plans) |
| EMI Records | ~850 | 12 per subscription, monthly schedule |

---

## 🎯 Running Step-by-Step

Want to see each step individually?

```bash
# Step 1: Clean data
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026BatchCleanupTest -v 2

# Step 2: Register customers
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026CustomerRegistrationTest -v 2

# Step 3: Amrita customer
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026AmritaSubscriptionTest -v 2

# Step 4: Products & Lucky IDs
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026ProductsAndLuckyIDsTest -v 2

# Step 5: Create batch
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026BatchCreationTest -v 2

# Step 6-8: Subscriptions
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026SubscriptionWorkflowTest -v 2

# Step 9: Final report
python manage.py test tests.test_batch_jul2026_comprehensive.JUL2026ComprehensiveReportTest -v 2
```

---

## ✅ Quick Verification

After running, verify data was created:

```bash
python manage.py shell
```

Then inside shell:

```python
from subscriptions.models import *

# Check counts
print(f"Customers: {Customer.objects.count()}")
print(f"Subscriptions: {Subscription.objects.count()}")
print(f"Products: {Product.objects.count()}")
print(f"Lucky IDs: {LuckyId.objects.count()}")
print(f"EMIs: {Emi.objects.count()}")

# Check Amrita
amrita = Customer.objects.get(name="Amrita Sharma")
print(f"\nAmrita: {amrita.name} ({amrita.phone})")
print(f"Subscriptions: {Subscription.objects.filter(customer=amrita).count()}")

# Check batch
batch = Batch.objects.get(batch_name="JUL2026")
subs = Subscription.objects.filter(batch=batch)
print(f"\nBatch JUL2026: {subs.count()} subscriptions")
```

Exit shell: `exit()`

---

## 🔍 Full Verification Report

Run comprehensive verification:

```bash
python manage.py shell < backend/verify_jul2026_batch.py
```

This checks:
- ✅ All customers KYC verified
- ✅ Batch JUL2026 exists
- ✅ Amrita customer exists
- ✅ Products created
- ✅ Lucky IDs created
- ✅ Subscriptions created
- ✅ EMIs generated
- ✅ All subscriptions have products
- ✅ All subscriptions have customers
- ✅ All subscriptions have lucky IDs

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `backend/tests/test_batch_jul2026_comprehensive.py` | Main test suite (9 test classes) |
| `backend/subscriptions/management/commands/test_batch_jul2026.py` | Management command for step-by-step run |
| `backend/verify_jul2026_batch.py` | Quick verification script |
| `backend/TEST_BATCH_JUL2026_GUIDE.md` | Complete guide (300+ lines) |
| `JUL2026_BATCH_VERIFICATION_SUMMARY.md` | Overview & metrics |
| `JUL2026_IMPLEMENTATION_COMPLETE.md` | Full implementation details |
| `QUICK_START_JUL2026.md` | This file |

---

## 🎓 Database Queries

Quick checks in Django admin or shell:

### Count Customers
```sql
SELECT COUNT(*) FROM subscriptions_customer;
-- Should be: 105
```

### Count Subscriptions in Batch
```sql
SELECT COUNT(*) FROM subscriptions_subscription 
WHERE batch_id = (SELECT id FROM subscriptions_batch WHERE batch_name = 'JUL2026');
-- Should be: ~71
```

### Count EMIs
```sql
SELECT COUNT(*) FROM subscriptions_emi;
-- Should be: ~850
```

### Get Amrita's Subscriptions
```sql
SELECT * FROM subscriptions_subscription 
WHERE customer_id = (SELECT id FROM subscriptions_customer WHERE name = 'Amrita Sharma');
-- Should be: 1 subscription
```

---

## ⚠️ Important Notes

1. **DO NOT run on production** - This is for dev/staging only
2. **Safe to repeat** - Can run multiple times, new data added each time
3. **Uses test database** - By default creates in-memory SQLite for tests
4. **No external APIs** - Fully self-contained, no internet required
5. **No manual setup** - Fully automated, just run the command

---

## 🆘 Troubleshooting

### Issue: "Unknown command: test_batch_jul2026"
**Solution:** Make sure you're in the root directory:
```bash
# Wrong:
cd backend && python manage.py test_batch_jul2026

# Right:
python manage.py test_batch_jul2026
# or from within backend:
cd .. && python manage.py test_batch_jul2026
```

### Issue: "No such table" or migration errors
**Solution:** Run migrations first:
```bash
python manage.py migrate
```

### Issue: Tests pass but no data appears
**Solution:** The test data is created in a test database, not your main database. To persist data:
- Use `manage.py shell` and run verification to see test data
- Check test database (SQLite file in temp directory)
- Or export the test data to your main database

### Issue: Tests timeout
**Solution:** Reduce data size:
```bash
python manage.py test_batch_jul2026 --customers 50 --subscriptions 30
```

---

## 🌟 What Happens in Each Step

| Step | What Happens | Time | Result |
|------|-------------|------|--------|
| 1 | Clean old test data | 1-2s | Fresh start |
| 2 | Create 105 customers | 5-10s | Customers with verified KYC |
| 3 | Create Amrita customer | <1s | Special customer in Mumbai |
| 4 | Create products & lucky IDs | 3-5s | 280 items available |
| 5 | Create JUL2026 batch | <1s | Batch ready for subscriptions |
| 6-8 | Create subscriptions & EMI | 13-20s | 71 subscriptions with 850+ EMI records |
| 9 | Generate report | 2-3s | Final verification & summary |

**Total:** ~30-45 seconds

---

## 📞 Where to Find Help

1. **Quick Help:** Run `python manage.py test_batch_jul2026 --help`
2. **Test File:** `backend/tests/test_batch_jul2026_comprehensive.py` (well-documented)
3. **Full Guide:** `backend/TEST_BATCH_JUL2026_GUIDE.md` (300+ lines)
4. **Details:** `JUL2026_IMPLEMENTATION_COMPLETE.md` (full specs)

---

## ✨ You're All Set!

Everything is ready to go. Just run:

```bash
python manage.py test tests.test_batch_jul2026_comprehensive -v 2
```

And watch as your test batch is created with:
- ✅ 105 customers
- ✅ 280 products & lucky IDs  
- ✅ 71 subscriptions
- ✅ 850+ EMI records

**Status:** 🟢 READY TO RUN

---

**Questions?** Check the documentation files or run the verification script!
