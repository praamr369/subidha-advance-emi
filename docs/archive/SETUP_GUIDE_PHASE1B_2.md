# Phase 1B, 1C & Phase 2 Setup Guide

This guide covers the complete setup for Address Management (Phase 1B/C), Pincode Database, and Workbench Architecture (Phase 2).

## Overview

### Phase 1B: Address Management Backend
- **Models**: PIN validation, Address model with geolocation, Service Zone for vendor coverage
- **Services**: Pincode validation, lookup, address creation with auto-fill
- **API**: Full CRUD for customer addresses, vendor service availability checks
- **Status**: ✅ Complete

### Phase 1C: Address Components Frontend
- **PincodeInput**: Real-time 6-digit PIN validation with automatic city/district/state lookup
- **AddressForm**: Complete address capture form with postal code validation
- **AddressSelector**: Radio selector for choosing from existing addresses
- **Status**: ✅ Complete

### Setup: Pincode Database
- **Sample Data**: 30 major Indian cities with postal codes, geolocation
- **CSV Format**: postal_code, city, district, state, region, latitude, longitude
- **Location**: `backend/subscriptions/fixtures/sample_pincodes.csv`
- **Status**: ✅ Sample fixture created

### Phase 2: Workbench Architecture
- **Models**: WorkbenchItem, WorkbenchAction with status tracking
- **Services**: Create items for 4 modules (Direct Sale, Online Request, Subscription, Vendor)
- **API**: Full CRUD with assignment, completion, cancellation workflows
- **Status**: ✅ Complete

---

## Backend Setup Instructions

### Step 1: Create Django Migrations

```bash
cd backend
python manage.py makemigrations subscriptions
python manage.py migrate subscriptions
```

This will create tables for:
- `workbench_item` - Main workbench task table
- `workbench_action` - Audit log for actions on workbench items

### Step 2: Load Pincode Database

**Option A: Use provided sample data (30 cities)**

```bash
cd backend
python manage.py load_pincode_database backend/subscriptions/fixtures/sample_pincodes.csv
```

Expected output:
```
Loading pincodes from: backend/subscriptions/fixtures/sample_pincodes.csv
Created 30 pincodes, Updated 0, Errors 0
✓ Pincode database loaded successfully
```

**Option B: Load custom CSV file**

Prepare a CSV file with headers:
```csv
postal_code,city,district,state,region,latitude,longitude
110001,New Delhi,Central Delhi,Delhi,NCR,28.6328,77.2197
```

Then load it:
```bash
python manage.py load_pincode_database /path/to/your/pincodes.csv
```

### Step 3: Verify Database Setup

```bash
python manage.py shell

# Check pincode data
from subscriptions.models import PincodeDatabase
print(f"Total pincodes: {PincodeDatabase.objects.count()}")

# Check workbench tables
from subscriptions.models_workbench import WorkbenchItem, WorkbenchAction
print(f"Workbench items: {WorkbenchItem.objects.count()}")
print(f"Workbench actions: {WorkbenchAction.objects.count()}")
```

---

## Frontend Integration

### Step 1: Address Components

The following components are created and ready to use:

#### **PincodeInput.tsx**
- 6-digit PIN validation
- Real-time API lookup to PincodeDatabase
- Shows city/district/state when valid
- Used by AddressForm

```tsx
import PincodeInput from "@/components/address/PincodeInput";

<PincodeInput
  value={pincode}
  onChange={setPincode}
  onValidated={(data) => {
    // data contains postal_code, city, district, state
  }}
/>
```

#### **AddressForm.tsx**
- Full address capture with PIN validation
- Address line 1 & 2 fields
- Address type selector (Residential/Commercial/Billing)
- Primary address toggle
- Calls `POST /api/v1/customer/addresses/`

```tsx
import AddressForm from "@/components/address/AddressForm";

<AddressForm
  onSubmit={async (address) => {
    // Submits to API with validated data
  }}
/>
```

#### **AddressSelector.tsx**
- Radio selector for existing addresses
- Shows all customer addresses with type badges
- Fetches from `GET /api/v1/customer/addresses/`
- Returns selected address object

```tsx
import AddressSelector from "@/components/address/AddressSelector";

<AddressSelector
  onSelect={(address) => {
    console.log("Selected:", address);
  }}
  selectedId={currentAddressId}
/>
```

### Step 2: Integration in Registration Flow

Example: Add address capture to customer registration form:

```tsx
import { useState } from "react";
import AddressForm, { type AddressPayload } from "@/components/address/AddressForm";

export default function CustomerRegistration() {
  const [address, setAddress] = useState<AddressPayload | null>(null);

  const handleAddressSubmit = async (addressData: AddressPayload) => {
    const res = await fetch("/api/v1/customer/addresses/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addressData),
    });
    if (res.ok) {
      setAddress(await res.json());
    }
  };

  return (
    <form>
      {/* Other registration fields */}
      <AddressForm onSubmit={handleAddressSubmit} />
      {address && <p>Address saved: {address.address_line1}</p>}
    </form>
  );
}
```

---

## API Endpoints

### Address Endpoints

```
GET    /api/v1/customer/addresses/                 - List customer addresses
POST   /api/v1/customer/addresses/                 - Create new address
GET    /api/v1/customer/addresses/{id}/            - Get address details
PATCH  /api/v1/customer/addresses/{id}/            - Update address
DELETE /api/v1/customer/addresses/{id}/            - Delete address
POST   /api/v1/customer/addresses/{id}/set-primary/ - Mark as primary
GET    /api/v1/pincode/{pin}/details/              - Lookup postal code
GET    /api/v1/vendors/{vendor_id}/availability/{pin}/  - Check vendor service
GET    /api/v1/vendors/by-postal-code/{pin}/      - List vendors serving area
```

### Workbench Endpoints

```
# Customer view
GET    /api/v1/customer/workbench/                 - List customer items
GET    /api/v1/customer/workbench/{id}/            - Get item details

# Admin dashboard
GET    /api/v1/admin/workbench/                    - List all items
GET    /api/v1/admin/workbench/{id}/               - Get item details
GET    /api/v1/admin/workbench/assigned/           - Get user's assigned items

# Admin actions
POST   /api/v1/admin/workbench/{id}/assign/        - Assign to user
POST   /api/v1/admin/workbench/{id}/complete/      - Mark complete
POST   /api/v1/admin/workbench/{id}/cancel/        - Cancel item
GET    /api/v1/admin/workbench/{id}/actions/       - Get action history
POST   /api/v1/admin/workbench/{id}/actions/create/ - Add action
```

---

## Sample Workbench Usage

### Creating Workbench Items

```python
from subscriptions.services.workbench_service import (
    workbench_direct_sale_create,
    workbench_online_request_create,
    workbench_subscription_create,
    workbench_vendor_create,
)

# Direct Sale
item = workbench_direct_sale_create(
    customer=customer,
    product=product,
    quantity=2,
    unit_price=50000,
)

# Online Request
item = workbench_online_request_create(
    customer=customer,
    product=product,
    request_type="ADVANCE_EMI",
    batch=batch,
    preferred_lucky_number=42,
)

# Subscription
item = workbench_subscription_create(
    customer=customer,
    product=product,
    plan_type="EMI",
    tenure_months=12,
    batch=batch,
)

# Vendor Service
item = workbench_vendor_create(
    customer=customer,
    product=product,
    vendor_id=1,
    service_details={"service_type": "delivery"},
)
```

### Workflow Actions

```python
from subscriptions.services.workbench_service import (
    assign_workbench_item,
    complete_workbench_item,
    cancel_workbench_item,
    add_workbench_action,
)

# Assign to team member
assign_workbench_item(
    item_id=item.id,
    assigned_to=team_member,
    performed_by=admin,
)

# Add progress note
add_workbench_action(
    item_id=item.id,
    action_type="NOTE",
    performed_by=admin,
    notes="Waiting for customer verification",
)

# Mark as complete
complete_workbench_item(
    item_id=item.id,
    performed_by=admin,
    notes="Sale processed successfully",
    result_data={"invoice_id": 12345, "amount": 50000},
)
```

---

## Testing Checklist

### Backend Tests

```bash
# Test migrations
python manage.py migrate --plan

# Test pincode loader
python manage.py load_pincode_database backend/subscriptions/fixtures/sample_pincodes.csv

# Test workbench creation via shell
python manage.py shell
>>> from subscriptions.models import Customer, Product
>>> from subscriptions.services.workbench_service import workbench_direct_sale_create
>>> item = workbench_direct_sale_create(customer=customer_obj, product=product_obj)
>>> print(item)  # Should print workbench item
```

### Frontend Tests

1. **Pincode Validation**
   - Enter 6-digit number → Should show "Validating..."
   - Wait for API response → Should show city/district/state or error

2. **Address Form**
   - Enter valid PIN → Form should enable
   - Fill address lines → Submit button becomes active
   - Submit → Should POST to API and show success

3. **Address Selector**
   - Should load existing addresses
   - Click radio → Should select address
   - Show primary badge on primary address

### Integration Tests

1. Create customer via API
2. Add address via AddressForm
3. Verify in database
4. Create workbench item
5. Assign to admin
6. Complete with result data

---

## Troubleshooting

### Pincode Loader Fails

**Problem**: "No such file or directory"
```bash
# Solution: Verify file path
ls backend/subscriptions/fixtures/sample_pincodes.csv
python manage.py load_pincode_database $(pwd)/backend/subscriptions/fixtures/sample_pincodes.csv
```

### Workbench Migration Not Found

**Problem**: `ModuleNotFoundError: No module named 'subscriptions.models_workbench'`
```bash
# Solution: Run migrations after models are added
python manage.py makemigrations
python manage.py migrate
```

### Address API Returns 404

**Problem**: Endpoints not found
```bash
# Solution: Verify routes are imported in admin.py
grep -n "workbench_routes" backend/api/v1/routes/admin.py
```

### Frontend Can't Connect to API

**Problem**: CORS or auth errors
```bash
# Solution: Verify auth headers
# Use: Authorization: Bearer <token> for token auth
# Or: Use cookies for session auth
```

---

## Next Steps

### Phase 3: Online Request APIs
- Complete online request workflow
- Auto-create Direct Sale/Subscription on approval
- Quote generation and management

### Phase 4: Full Integration
- Complete customer journeys for all request types
- Workbench status updates tied to subscription lifecycle
- Notification system for workbench assignments

---

## File Structure

```
backend/
├── subscriptions/
│   ├── models_workbench.py              # Workbench models
│   ├── services/
│   │   ├── workbench_service.py        # Workbench business logic
│   │   └── address_service.py          # Address validation & lookup
│   ├── fixtures/
│   │   └── sample_pincodes.csv         # Sample data
│   └── management/commands/
│       └── load_pincode_database.py    # CSV loader command
├── api/v1/
│   ├── views/
│   │   ├── workbench.py                # API views
│   │   └── address.py                  # Address API
│   ├── serializers/
│   │   └── workbench.py                # API serializers
│   └── routes/
│       └── workbench.py                # URL routes

frontend/
└── src/components/address/
    ├── PincodeInput.tsx                # PIN validation component
    ├── AddressForm.tsx                 # Complete address form
    └── AddressSelector.tsx             # Address selector widget
```

---

## Support

For issues or questions:
1. Check the Troubleshooting section
2. Verify database migrations: `python manage.py migrate --list`
3. Check API logs: `python manage.py shell` → Database queries
4. Frontend errors: Browser console for TypeError/NetworkError
