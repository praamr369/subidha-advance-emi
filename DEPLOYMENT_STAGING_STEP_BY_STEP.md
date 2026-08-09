# Staging Deployment Guide — Phase 1 (4 Modules)
**Date:** August 9, 2026  
**Environment:** https://srv1391250.hstgr.cloud  
**Duration:** ~30 minutes  
**Rollback:** ~5 minutes

---

## Pre-Deployment Checklist

- [x] Git branch `update` is clean (no uncommitted changes)
- [x] All 4 modules tested locally (dev server)
- [x] TypeScript compiles with 0 errors
- [x] Django migrations created (0003_productvariant)
- [x] PostgreSQL dev DB migrated successfully
- [ ] Team notified of 15-minute maintenance window
- [ ] Backup of staging database created (optional but recommended)

---

## Step 1: SSH to VPS (2 min)

```bash
ssh subidha-vps

# Verify connected
echo "Connected to: $(hostname)"
pwd  # Should be /home/subidha or similar
```

**Expected Output:**
```
Welcome to Subidha VPS
subidha-vps ~ #
```

---

## Step 2: Backend Deployment (8 min)

### 2.1 Pull Latest Code
```bash
cd /app/backend  # Or wherever backend is deployed

# Show current status
git status
git log --oneline -5

# Pull the update branch
git fetch origin update
git checkout update
git pull origin update

# Verify we got the new files
ls -la products_core/migrations/ | grep 0003
# Should show: -rw-r--r-- 1 ... 0003_productvariant.py
```

### 2.2 Install Dependencies
```bash
# Check if there are new Python dependencies
pip freeze > /tmp/old-deps.txt
pip install -r requirements.txt
pip freeze > /tmp/new-deps.txt
diff /tmp/old-deps.txt /tmp/new-deps.txt

# If new deps added, pip will list them
```

**Expected New Packages:**
- zod (already installed in frontend, but not in Python backend)
- No new Python dependencies for these 4 modules

### 2.3 Run Migrations
```bash
python manage.py migrate

# Expected output:
# Running migrations:
#   Applying products_core.0003_productvariant... OK
```

### 2.4 Sync Service Backfill (Optional)
```bash
# Synchronize existing SERVICE products to ServiceCatalogItem
python manage.py sync_services

# Expected output:
# [OK] Synced X SERVICE products to ServiceCatalogItem
```

### 2.5 Collect Static Files
```bash
python manage.py collectstatic --noinput

# Expected: Successfully collected X files
```

### 2.6 Restart Backend Service
```bash
# Method 1: Systemd (if using systemd)
sudo systemctl restart backend
sudo systemctl status backend

# Method 2: Gunicorn (if using supervisor/gunicorn)
sudo supervisorctl restart backend
sudo supervisorctl status backend

# Verify port is listening
lsof -i :8000  # Should show gunicorn or similar listening
```

**Expected Status:**
```
backend.service - Subidha Backend (gunicorn)
Loaded: loaded (/etc/systemd/system/backend.service)
Active: active (running) since ...
```

---

## Step 3: Frontend Deployment (10 min)

### 3.1 Pull Latest Code
```bash
cd /app/frontend

# Show current status
git status
git log --oneline -5

# Pull the update branch
git fetch origin update
git checkout update
git pull origin update

# Verify new files
ls src/lib/schemas/product-creation.ts
ls src/components/admin/products/tabs/VariantsTab.tsx
ls src/hooks/useFormPersistence.ts
```

### 3.2 Install Dependencies
```bash
npm install

# This should pick up zod + @hookform/resolvers + react-hook-form
npm list zod react-hook-form @hookform/resolvers

# Expected: All 3 packages listed with versions
```

### 3.3 Build Frontend
```bash
npm run build

# This generates the .next/static directory
# Expected output:
# ▲ Next.js 16.2.6
# ○ Compiled client and server successfully
```

### 3.4 Restart Frontend Service
```bash
# Method 1: Systemd
sudo systemctl restart frontend
sudo systemctl status frontend

# Method 2: PM2 (if using PM2)
pm2 restart frontend
pm2 status

# Verify port is listening
lsof -i :3000  # Should show node listening
```

---

## Step 4: Smoke Tests (5 min)

### 4.1 Backend Endpoints
```bash
# Test product creation endpoint
curl -X POST https://srv1391250.hstgr.cloud/api/v1/admin/products/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "product_code": "TEST-001",
    "name": "Test Product"
  }'

# Expected response: 201 Created or 400 Bad Request (missing fields)
# NOT 404 (which would mean endpoint doesn't exist)
```

### 4.2 Frontend Routes
```bash
# Check if create page loads
curl https://srv1391250.hstgr.cloud/admin/products/create \
  -H "Cookie: session=$SESSION_ID"

# Expected: 200 OK with HTML content
# Should contain: <input placeholder="e.g., CHAIR-001" ...>
```

### 4.3 Service Catalog Sync
```bash
# Check if a SERVICE product appears in catalog
curl https://srv1391250.hstgr.cloud/api/v1/admin/inventory/service-catalog/ \
  -H "Authorization: Bearer $TOKEN"

# Expected: Array of services (count should increase if we created a SERVICE)
```

---

## Step 5: Manual QA (5 min)

### 5.1 Test Product Creation Flow
**Navigate:** https://srv1391250.hstgr.cloud/admin/products/create

1. **Fill Basic Identity Tab:**
   - Product Code: `CHAIR-STAGING-001`
   - Name: `Test Office Chair`
   - Click "Generate" next to SKU
   - Expected: SKU auto-filled with `SKU-CHAIR-STAGING-001-001`

2. **Validate Instant Feedback:**
   - Leave "Product Name" blank
   - Wait 0.5 seconds
   - Expected: Red border on name field + error tooltip

3. **Fill Financials Tab:**
   - Base Price: `5000.00`
   - Click "Suggest" next to HSN Code
   - Expected: Popup with 5 HSN suggestions (uses AI)
   - Select one, confirm
   - Expected: Code fills + confirmation recorded

4. **Fill Variants Tab:**
   - Check "This product has multiple variants"
   - Add Variant 1: Code=`BLU`, Name=`Blue`
   - Add Variant 2: Code=`RED`, Name=`Red`
   - Click "Auto-Generate All SKUs & Barcodes"
   - Expected: Each variant gets SKU + Barcode

5. **Submit:**
   - Click "Create Product"
   - Expected: Success page with product ID

### 5.2 Verify Service Auto-Sync
**Create SERVICE Product:**
1. On `/admin/products/create`
2. Basic Identity: Code=`CONSULT-001`, Name=`Consultation Service`
3. Item Type: Select `Service`
4. Submit
5. Navigate to `/admin/inventory/service-catalog`
6. Expected: New service appears in list (NO manual entry required)

### 5.3 Check localStorage Persistence
1. Fill `/admin/products/create` partially
2. Close browser tab (without submitting)
3. Re-open `/admin/products/create`
4. Expected: All filled fields are still there (recovered from localStorage)

---

## Step 6: Verify No Regressions (3 min)

### 6.1 Existing Pages Still Work
```bash
# Stock Reservations (should show correct KPIs)
curl https://srv1391250.hstgr.cloud/api/v1/admin/inventory/reservations/ \
  -H "Authorization: Bearer $TOKEN"

# Expected: summary.total_reservations = actual DB count (not paginated)

# Service Catalog
curl https://srv1391250.hstgr.cloud/api/v1/admin/inventory/service-catalog/ \
  -H "Authorization: Bearer $TOKEN"

# Expected: All services visible, properly serialized
```

### 6.2 Product Register Page
**Navigate:** https://srv1391250.hstgr.cloud/admin/products

1. Check that all existing products still show
2. KPI strip should show correct totals (use Database query to verify)
3. Search, filter, pagination should work

---

## Rollback Plan (If Issues Found)

### Quick Rollback (< 5 min)
```bash
# Revert to previous commit
cd /app/backend && git revert HEAD && python manage.py migrate
cd /app/frontend && git revert HEAD && npm run build

# Restart services
sudo systemctl restart backend frontend
```

### Full Rollback (Database rollback if needed)
```bash
# If migration broke data, restore from backup
psql subidha_prod < /backups/staging-before-deploy.sql

# Revert code
cd /app && git reset --hard origin/stable
```

---

## Validation Checklist (Post-Deployment)

- [ ] All 4 modules working as expected
- [ ] No 500 errors in server logs
- [ ] No TypeScript errors in browser console
- [ ] Product creation works end-to-end
- [ ] Service auto-sync works
- [ ] KPIs show correct totals
- [ ] Form state persists on refresh
- [ ] Old routes still redirect properly

---

## Monitoring (24 hours post-deploy)

```bash
# Watch server logs for errors
tail -f /var/log/backend.log | grep -i error
tail -f /var/log/frontend.log | grep -i error

# Monitor database query performance
# Check for N+1 issues in new ProductVariant queries
```

---

## Sign-Off

**Deployed By:** (Your Name)  
**Deployment Start Time:** ___________  
**Deployment End Time:** ___________  
**Status:** ☐ Success ☐ Partial ☐ Rollback  
**Issues Found:** (list any)  
**Next Steps:** (if any)

---

*Deployment Guide Complete*
