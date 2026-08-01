# Unified CRM Pipeline Workflow
**Status**: Data model prepared, awaiting migration approval  
**Date**: 2026-07-18

---

## Complete Workflow: PublicLead → Customer → OnlineRequest → ProductRequest → Subscription/Sale

### Phase 1: Public Lead (No Account)
**Source**: Public website visitor fills out enquiry form
```
PublicLead {
  - name, phone, email, city
  - product interest
  - status: NEW → CONTACTED → CONVERTED
  - source: PUBLIC_SITE | PARTNER | MOBILE_APP
  - assigned_to: admin user (for follow-up)
}
```

### Phase 2: Online Request (Quote Workflow - BEFORE Registration)
**Trigger**: Admin moves lead to quote workflow OR lead automatically becomes OnlineRequest
```
OnlineRequest {
  - status: DRAFT → QUOTE_SENT → QUOTE_ACCEPTED → APPROVED → COMPLETED
  - source_public_lead: FK to PublicLead (tracks origin)
  - customer: NULL (may not have registered yet) OR FK to Customer
  - request_type: ADVANCE_EMI | DIRECT_SALE | RENT | LEASE
  
  - Admin activities:
    • Generate quote (calculate pricing)
    • Send quote to public lead (via SMS/email)
    • Customize: discount_amount, delivery_cost
}
```

### Phase 3: Customer Registration
**Trigger**: Public lead registers via webapp → creates Customer + auth User account
```
Customer {
  - user: OneToOne FK to auth User (new account created)
  - source: ONLINE (came from website)
  - converted_public_leads: reverse FK from PublicLead
}

PublicLead update:
  - converted_customer: FK to Customer (now has account)
  - status: CONVERTED
}
```

### Phase 4: Quote Acceptance → ProductRequest/SubscriptionRequest
**Trigger**: Customer accepts quote OR admin accepts on their behalf
```
ProductRequest OR SubscriptionRequest {
  - source_public_lead: FK to PublicLead (complete traceability)
  - source_online_request: FK to OnlineRequest (immediate source)
  - customer: FK to Customer (now registered)
  - request_type: ADVANCE_EMI | DIRECT_SALE | RENT | LEASE
  - status: SUBMITTED
}

OnlineRequest update:
  - status: QUOTE_ACCEPTED
  - converted_product_request: OneToOne FK (if product type)
  - converted_subscription_request: OneToOne FK (if subscription type)
}
```

### Phase 5: Admin Approval → Subscription/Sale Created
**Trigger**: Admin reviews and approves ProductRequest/SubscriptionRequest
```
IF request_type = ADVANCE_EMI:
  → Subscription created (plan_type='EMI')
  → ProductRequest.approved_subscription = subscription
  
IF request_type = RENT:
  → Subscription created (plan_type='RENT')
  → RentSubscriptionProfile created (rent-specific details)
  → ProductRequest.approved_subscription = subscription
  → ProductRequest.approved_rent_profile = rent_profile

IF request_type = LEASE:
  → Subscription created (plan_type='LEASE')
  → LeaseSubscriptionProfile created (lease-specific details)
  → ProductRequest.approved_subscription = subscription
  → ProductRequest.approved_lease_profile = lease_profile

IF request_type = DIRECT_SALE:
  → DirectSale (invoice) created in billing
  → ProductRequest.approved_direct_sale = invoice
```

---

## Data Model Relationships

### Foreign Key Map
```
PublicLead
  ├─ converted_customer: FK → Customer
  ├─ converted_online_request: FK → OnlineRequest
  ├─ converted_product_request: FK → ProductRequest
  ├─ converted_subscription_request: FK → SubscriptionRequest
  ├─ converted_subscription: FK → Subscription (final)
  └─ converted_direct_sale: FK → DirectSale (final)

OnlineRequest
  ├─ source_public_lead: FK → PublicLead
  ├─ customer: FK → Customer (optional, before registration)
  ├─ converted_product_request: OneToOne → ProductRequest
  ├─ converted_subscription_request: OneToOne → SubscriptionRequest
  ├─ approved_subscription: FK → Subscription (final)
  ├─ approved_direct_sale: FK → DirectSale (final)
  ├─ approved_rent_profile: OneToOne → RentSubscriptionProfile (final, if RENT)
  └─ approved_lease_profile: OneToOne → LeaseSubscriptionProfile (final, if LEASE)

ProductRequest
  ├─ source_public_lead: FK → PublicLead
  ├─ source_online_request: FK → OnlineRequest
  ├─ customer: FK → Customer (required after approval)
  ├─ approved_subscription: OneToOne → Subscription (if EMI/RENT/LEASE)
  ├─ approved_direct_sale: OneToOne → DirectSale (if DIRECT_SALE)
  ├─ approved_rent_profile: OneToOne → RentSubscriptionProfile (if RENT)
  └─ approved_lease_profile: OneToOne → LeaseSubscriptionProfile (if LEASE)

SubscriptionRequest
  ├─ source_public_lead: FK → PublicLead
  ├─ source_online_request: FK → OnlineRequest
  ├─ customer: FK → Customer (required)
  ├─ approved_subscription: OneToOne → Subscription (if approved)
  ├─ approved_direct_sale: OneToOne → DirectSale (alternate path)
  ├─ approved_rent_profile: OneToOne → RentSubscriptionProfile (if RENT)
  └─ approved_lease_profile: OneToOne → LeaseSubscriptionProfile (if LEASE)

Customer
  ├─ user: OneToOne → auth User
  ├─ public_leads_reverse: reverse FK from PublicLead
  ├─ product_requests: reverse FK from ProductRequest
  ├─ subscription_requests: reverse FK from SubscriptionRequest
  └─ subscriptions: reverse FK from Subscription
```

---

## Workflow Traceability Examples

### Example 1: Public Lead → Online Quote → Registration → Advance EMI
```
1. PublicLead created (name: "John", phone: "98765...", interested: "EMI")
   ├─ PublicLead.id = 1
   ├─ PublicLead.status = "NEW"
   └─ PublicLead.assigned_to = Admin1

2. Admin creates OnlineRequest (quote workflow)
   ├─ OnlineRequest.id = 100
   ├─ OnlineRequest.source_public_lead = PublicLead(1)
   ├─ OnlineRequest.request_type = "ADVANCE_EMI"
   ├─ OnlineRequest.status = "DRAFT"
   └─ OnlineRequest.customer = NULL (not registered yet)

3. Admin sends quote to John via SMS
   └─ OnlineRequest.status = "QUOTE_SENT"

4. John clicks link → registers on webapp
   ├─ auth.User created (username: john_emi_123)
   ├─ Customer created (user: john_emi_123)
   ├─ PublicLead.converted_customer = Customer(5)
   └─ PublicLead.status = "CONVERTED"

5. John accepts quote (or admin accepts on his behalf)
   ├─ OnlineRequest.status = "QUOTE_ACCEPTED"
   ├─ OnlineRequest.customer = Customer(5)
   ├─ ProductRequest created
   ├─ ProductRequest.source_public_lead = PublicLead(1) ← TRACEABILITY!
   ├─ ProductRequest.source_online_request = OnlineRequest(100)
   ├─ ProductRequest.customer = Customer(5)
   ├─ ProductRequest.status = "SUBMITTED"
   └─ OnlineRequest.converted_product_request = ProductRequest(200)

6. Admin approves ProductRequest
   ├─ ProductRequest.status = "APPROVED"
   ├─ Subscription created (plan_type='EMI')
   ├─ Subscription.id = 50
   ├─ ProductRequest.approved_subscription = Subscription(50)
   ├─ OnlineRequest.approved_subscription = Subscription(50)
   ├─ PublicLead.converted_subscription = Subscription(50)
   └─ PublicLead.converted_by = Admin1

Result: ONE COMPLETE TRAIL from PublicLead → OnlineRequest → ProductRequest → Subscription
```

### Example 2: Trace any Subscription back to its Public Origin
```
Query: Get all subscriptions that came from public leads
SELECT s.* FROM subscriptions s
WHERE s.approved_public_lead_id IS NOT NULL;

Or track by OnlineRequest source:
SELECT pr.*, pr.source_online_request_id
FROM product_requests pr
WHERE pr.source_public_lead_id IS NOT NULL;

Or get complete history:
SELECT 
  pl.id, pl.name, pl.phone,
  or.id as online_request_id,
  pr.id as product_request_id,
  s.id as subscription_id,
  s.plan_type
FROM public_leads pl
LEFT JOIN online_requests or ON or.source_public_lead_id = pl.id
LEFT JOIN product_requests pr ON pr.source_online_request_id = or.id
LEFT JOIN subscriptions s ON s.id = pr.approved_subscription_id
WHERE pl.id = 1;
```

---

## Benefits of This Data Model

✅ **Complete Traceability**: Follow any subscription back to its original public lead
✅ **Multi-path Support**: PublicLead can convert via OnlineRequest OR direct ProductRequest
✅ **Type-specific Tracking**: Separate rent/lease profiles for specific handling
✅ **Admin Workflow**: Clear steps for contact → quote → acceptance → approval
✅ **Customer Self-service**: Registered customers can accept quotes directly
✅ **Flexible Conversions**: Can skip OnlineRequest if admin creates ProductRequest directly
✅ **Audit Trail**: Every conversion step is tracked with ForeignKeys

---

## Database Changes (Migration 0097)

### New Fields Added
**PublicLead**: 3 fields
- `converted_online_request` (FK to OnlineRequest)
- `converted_product_request` (FK to ProductRequest)
- `converted_subscription_request` (FK to SubscriptionRequest)

**OnlineRequest**: 4 fields
- `source_public_lead` (FK to PublicLead) 
- `converted_product_request` (OneToOne to ProductRequest)
- `converted_subscription_request` (OneToOne to SubscriptionRequest)
- `approved_rent_profile`, `approved_lease_profile` (OneToOne for specifics)

**ProductRequest**: 4 fields
- `source_public_lead` (FK to PublicLead)
- `source_online_request` (FK to OnlineRequest)
- `approved_rent_profile` (OneToOne to RentSubscriptionProfile)
- `approved_lease_profile` (OneToOne to LeaseSubscriptionProfile)

**SubscriptionRequest**: 5 fields
- `source_public_lead` (FK to PublicLead)
- `source_online_request` (FK to OnlineRequest)
- `approved_direct_sale` (OneToOne to DirectSale)
- `approved_rent_profile` (OneToOne to RentSubscriptionProfile)
- `approved_lease_profile` (OneToOne to LeaseSubscriptionProfile)

### Indexes Added
- `public_leads.converted_online_request_idx`
- `online_requests.source_public_lead_idx`
- `product_requests.source_idx` (on both source fields)
- `subscription_requests.source_idx` (on both source fields)

---

## API Endpoints Needed

### Public Lead Management
```
GET /api/v1/leads/public/
POST /api/v1/leads/public/ (create from website form)
GET /api/v1/leads/public/{id}/
PATCH /api/v1/leads/public/{id}/ (update status, assign, etc)
```

### Online Request Management (Admin)
```
GET /api/v1/admin/requests/online/
POST /api/v1/admin/requests/online/ (create from PublicLead)
GET /api/v1/admin/requests/online/{id}/
POST /api/v1/admin/requests/online/{id}/generate-quote/
POST /api/v1/admin/requests/online/{id}/send-quote/
POST /api/v1/admin/requests/online/{id}/accept/ (customer accepts quote)
POST /api/v1/admin/requests/online/{id}/convert/ (convert to ProductRequest)
POST /api/v1/admin/requests/online/{id}/approve/
```

### Public Lead Registration → Customer
```
POST /api/v1/auth/register/ (with lead_id parameter to link)
```

---

## Frontend Workflows Needed

### Admin: Lead Management
1. **CRM Dashboard**: List all PublicLeads with status
2. **Lead Detail**: View lead info + conversion history
3. **Lead Actions**:
   - Convert to OnlineRequest (quote workflow)
   - Contact info (SMS/email templates)
   - Mark as converted/closed
   - Link to customer manually

### Admin: Online Request Management
1. **Request List**: Filter by status, type, source
2. **Request Detail**:
   - View quote details
   - Send to customer
   - Accept/reject quote
   - Convert to ProductRequest
   - View traceability (PublicLead → history)

### Public: Lead Submission
1. **Lead Form**: Collect name, phone, email, product interest
2. **Confirmation**: "Thank you! We'll contact you soon"

### Public: Customer Registration
1. **Register Page**: Email/phone + password
2. **Link to Lead**: Auto-link if came from lead email/phone
3. **View Quotes**: Show accepted quotes
4. **Accept Quote**: Convert to ProductRequest

---

## Migration Approval

This migration adds 14 ForeignKey fields across 4 models to establish the unified CRM pipeline.

**Estimated impact**:
- No data loss (all fields are nullable)
- Adds ~14 columns to 4 tables
- Adds 4 indexes for efficient lookups
- Zero downtime migration (backward compatible)

Ready to apply? Approve to proceed.
