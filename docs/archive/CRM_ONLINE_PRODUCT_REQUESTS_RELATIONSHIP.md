# CRM Online Requests & Product Requests Architecture

## Overview

Your system has **two parallel request workflows**:

1. **Online Requests** (`/admin/requests/online-requests`) - Customer-initiated quote → approval flow
2. **Product Requests** (`/admin/requests/product-requests/direct-sale/{id}`) - Admin-initiated request workflow with customer linking

These are **separate but connected** systems, not the same thing.

---

## 1. Online Requests Workflow

### What is an Online Request?

An **Online Request** (model: `OnlineRequest`) is a **customer-initiated request** that goes through this flow:

```
DRAFT → QUOTE_SENT → QUOTE_ACCEPTED → APPROVED → COMPLETED
```

### Key Characteristics:

| Field | Description |
|-------|-------------|
| **Source** | Customer submits directly (from mobile app or portal) |
| **Customer** | Always links to a registered customer |
| **Types** | ADVANCE_EMI, DIRECT_SALE, RENT, LEASE |
| **Workflow** | Admin generates quote → sends to customer → customer accepts → admin approves |
| **CRM Connection** | Can originate from a `PublicLead` (source_public_lead field) |
| **Conversion** | When approved, converts to either `ProductRequest` OR `SubscriptionRequest` OR `DirectSale` |

### Database Model (OnlineRequest):

```python
- request_number: "ORQ-2026-TEST-001"
- customer: Link to registered Customer
- product: Link to Product catalog
- source_public_lead: Optional link to PublicLead (from CRM pipeline)
- converted_product_request: OneToOne link to ProductRequest (if converted)
- converted_subscription_request: OneToOne link to SubscriptionRequest (if converted)
- approved_direct_sale: Link to final DirectSale/invoice
- status: DRAFT, QUOTE_SENT, QUOTE_ACCEPTED, APPROVED, etc.
```

---

## 2. Product Requests Workflow

### What is a Product Request?

A **Product Request** (model: `ProductRequest`) is an **admin or partner-initiated request** for a customer purchase.

```
SUBMITTED → APPROVED/REJECTED → Creates subscription or direct sale
```

### Key Characteristics:

| Field | Description |
|-------|-------------|
| **Requester** | Admin, Partner, or Customer |
| **Customer** | Optional—can be unregistered (only snapshot data) |
| **Types** | ADVANCE_EMI, DIRECT_SALE, RENT, LEASE |
| **Purpose** | Fast-track request without quote workflow |
| **CRM Connection** | Can originate from `PublicLead` |
| **Approval** | Single-step: customer linking → pricing → approve/reject |
| **Conversion** | Converts directly to `Subscription` or `DirectSale` |

### Database Model (ProductRequest):

```python
- requester: User who created it (Admin/Partner/Customer)
- customer: Optional ForeignKey to registered Customer
- requested_customer_name: Snapshot of customer name (if unregistered)
- requested_customer_phone: Snapshot of phone (if unregistered)
- request_type: ADVANCE_EMI, DIRECT_SALE, RENT, LEASE
- source_public_lead: Optional link to PublicLead
- approved_subscription: OneToOne to Subscription (if EMI/Rent/Lease)
- approved_direct_sale: OneToOne to DirectSale/invoice
- status: SUBMITTED, APPROVED, REJECTED, CANCELLED
```

---

## 3. Are Online & Product Requests Connected?

### YES—But Indirectly:

**Path 1: Online Request → Product Request**
```
Customer submits Online Request (QUOTE_SENT)
         ↓
Admin quotes & customer accepts (QUOTE_ACCEPTED)
         ↓
Admin approves Online Request → Auto-creates ProductRequest
         ↓
ProductRequest.online_request_source = Online Request
         ↓
Admin links customer to ProductRequest or confirms snapshot
         ↓
ProductRequest approved → Creates Subscription or DirectSale
```

**Path 2: Direct Product Request (Shortcut)**
```
Admin creates ProductRequest directly (no Online Request)
         ↓
Links to registered customer OR uses unregistered snapshot
         ↓
ProductRequest approved → Creates Subscription or DirectSale
```

### In the Database:

```sql
-- OnlineRequest can link to ProductRequest
OnlineRequest.converted_product_request_id = ProductRequest.id (OneToOne)

-- ProductRequest tracks its source
ProductRequest has: online_request_source (reverse relation)

-- Both can create final fulfillment
OnlineRequest.approved_direct_sale → billing.DirectSale
ProductRequest.approved_direct_sale → billing.DirectSale
```

---

## 4. CRM Integration (PublicLead Connection)

Both workflows connect to CRM via **PublicLead**:

### Online Request CRM Path:

```
PublicLead (CRM prospect) 
         ↓
Customer submits Online Request (source_public_lead = PublicLead)
         ↓
Convert → ProductRequest (inherits source_public_lead)
         ↓
Approve → Creates Subscription/DirectSale
```

### Product Request CRM Path:

```
PublicLead (CRM prospect)
         ↓
Admin creates ProductRequest (source_public_lead = PublicLead)
         ↓
Approve → Creates Subscription/DirectSale
```

---

## 5. Registered vs. Unregistered Customers

### Online Request (Always Requires Registered Customer):

```
OnlineRequest.customer = Required ForeignKey to Customer
```
- **Only registered customers** can submit online requests
- Customer must have complete profile

### Product Request (Flexible—Both Types):

```
OPTION A: Registered Customer
ProductRequest.customer = Customer object
ProductRequest.requested_customer_* = Auto-filled from customer.name, .phone, etc.

OPTION B: Unregistered/Prospect (Snapshot)
ProductRequest.customer = NULL
ProductRequest.requested_customer_name = "Prospect Name"
ProductRequest.requested_customer_phone = "9876543210"
```

---

## 6. Direct Sale Flow for Product Requests

### Direct Sale Workflow (Your specific question):

```
Admin creates ProductRequest (type=DIRECT_SALE)
         ↓
Step 1: Link Customer
   - Search existing registered customer (name/phone/email)
   - OR use snapshot data from unregistered prospect
         ↓
Step 2: Review Pricing
   - Confirm or override unit price
   - Invoice total calculated
         ↓
Step 3: Approve or Reject
   - Approval creates DRAFT DirectSale/Invoice
   - Rejection marks request REJECTED
         ↓
APPROVED → ProductRequest.approved_direct_sale created
```

### Can a Registered Customer Apply for BOTH?

**YES:**

```
Scenario 1: Same Product
- Registered Customer X submits Online Request (DIRECT_SALE) for Product A
- Later, Admin creates separate ProductRequest (DIRECT_SALE) for same Customer X & Product A
- Both can proceed independently (different requests, both approve to separate invoices)

Scenario 2: Lead → Online Request → Product Request
- PublicLead Y → Customer registers → submits Online Request
- Same PublicLead Y → Admin creates ProductRequest (shortcut, no quote)
- These are DIFFERENT requests, tracked separately
```

### Can Unregistered Prospect Use Online Request?

**NO:**
```
Online Request REQUIRES registered Customer with:
- Valid user account
- Complete KYC profile
- Active customer record
```

**Alternative for Unregistered Prospects:**
```
Unregistered Prospect → PublicLead (CRM)
         ↓
Admin creates ProductRequest directly (no quote)
         ↓
Fill snapshot: requested_customer_name, phone, email
         ↓
Link to customer at approval time (convert to registered)
         OR
         ↓
Proceed as unregistered snapshot (invoice still created)
```

---

## 7. API & Data Flow

### Online Request API Flow:

```
POST /api/v1/customer/online-requests/
  → create_online_request(customer, product, request_type, quantity)
  → Returns OnlineRequest (DRAFT status)
  
POST /api/v1/admin/online-requests/{id}/quote/
  → generate_quote(discount, delivery_cost)
  → Updates status to QUOTE_SENT
  
POST /api/v1/admin/online-requests/{id}/approve/
  → approve_online_request()
  → Auto-creates ProductRequest OR Subscription OR DirectSale
  → Links: OnlineRequest.converted_product_request = new ProductRequest
```

### Product Request API Flow (Direct Sale):

```
POST /api/v1/admin/product-requests/
  → Creates ProductRequest (SUBMITTED status)
  → Can be DIRECT_SALE, ADVANCE_EMI, RENT, LEASE
  
POST /api/v1/admin/product-requests/{id}/decide/
  → decision: "APPROVE" or "REJECT"
  → If APPROVE + DIRECT_SALE:
     → Links/creates customer (if needed)
     → Creates billing.DirectSale (DRAFT)
     → ProductRequest.approved_direct_sale = DirectSale
```

---

## 8. Frontend Pages & Admin Viewing

### Online Requests Page:

```
URL: /admin/requests/online-requests
Columns: Request #, Customer, Product, Type, Qty, Total, Status, Conversion

Conversion Column Shows:
- If converted_product_request_id → Links to ProductRequest
- If converted_subscription_request_id → Links to SubscriptionRequest
- Else "—" (not yet converted)

Detail Page URL: /admin/requests/online-requests/{id}
  → View request, quote, customer source lead
  → Actions: Generate quote, Send quote, Approve, Reject
```

### Product Requests (Direct Sale) Page:

```
URL: /admin/requests/product-requests/direct-sale/{id}
Workflow: 
  Step 1: Link Customer (search + select)
  Step 2: Review Pricing (confirm unit price)
  Step 3: Approve or Reject

Source Link: May show PublicLead if source_public_lead set
```

### CRM Connection View:

```
Online Request Detail:
  → Shows "Source Lead" field if source_public_lead exists
  → Links to /admin/crm/leads?id={lead_id}
  
Product Request Detail:
  → Shows source_public_lead if applicable
  → Can also link to CRM parties/profiles
```

---

## 9. Summary: Answering Your Questions

### Q: Are Online Requests & Product Requests connected in CRM?

**A:** Yes, **indirectly through PublicLead**:
- Both can originate from the same CRM lead
- Both track `source_public_lead` field
- Online Request can convert to Product Request (auto-created)
- Both create final subscription or direct sale

---

### Q: Can a registered customer apply for BOTH Online Request + Product Request?

**A:** **YES—they're separate workflows**:
- Online Request = Customer initiates with quote workflow
- Product Request = Admin initiates, faster approval
- Same customer can have multiple requests (different products/times)
- Each has its own approval chain

---

### Q: If unregistered prospect uses Product Request (Direct Sale):

**A:** **YES, allowed**:
```
Unregistered Prospect:
  → Admin creates ProductRequest
  → Fills snapshot data: name, phone, email
  → At approval: can link to registered Customer
         OR proceed with snapshot (no customer account needed)
  → Approval creates DRAFT DirectSale/invoice
  → Invoice can be sent to email/phone in snapshot
```

**Cannot use Online Request** (requires registered customer)

---

### Q: Can I access registered customer profile from Direct Sale Product Request?

**A:** **YES**:
```
Step 1: Admin searches customers by name/phone/email
  → Shows registered customers
  
Step 2: Admin selects from dropdown
  → ProductRequest.customer_id = selected customer.id
  
Step 3: Snapshot fields auto-populate from customer profile
  → requested_customer_name = customer.name
  → requested_customer_phone = customer.phone
  → requested_customer_email = customer.user.email
  → etc.
  
Step 4: Approval uses customer profile for billing
```

---

### Q: Can unregistered prospect request online order directly?

**A:** **NO**:
```
Online Request requires:
  ✗ Registered customer account
  ✗ Active customer profile
  ✗ User login credentials
  
Unregistered Prospect workaround:
  → Admin creates ProductRequest (type=DIRECT_SALE)
  → Fills unregistered prospect snapshot data
  → No customer registration needed
  → Invoice/sale created with snapshot contact info
```

---

## 10. Entity Relationships (ER Diagram)

```
PublicLead (CRM)
    ↓ source_public_lead
    ├─→ OnlineRequest → converted_product_request → ProductRequest
    │                                                    ↓
    │                           ┌───────────────────────┴──────────────────┐
    │                           ↓                                          ↓
    │                    Subscription                              DirectSale/Invoice
    │                    (ADVANCE_EMI,                            (billing.DirectSale)
    │                     RENT, LEASE)
    │
    └─→ ProductRequest (created by Admin directly)
                    ↓ customer (optional)
            ┌───────┴──────────┬──────────────────────┐
            ↓                  ↓                      ↓
      Customer          Subscription        DirectSale/Invoice
      (registered)     (ADVANCE_EMI,
                       RENT, LEASE)
```

---

## 11. Key Files

- **Frontend**:
  - `/admin/requests/online-requests/page.tsx` - List online requests
  - `/admin/requests/online-requests/[id]/page.tsx` - Online request detail
  - `/admin/requests/product-requests/direct-sale/[id]/page.tsx` - Direct sale product request

- **Backend**:
  - `subscriptions/models_online_request.py` - OnlineRequest model
  - `subscriptions/models.py` (line 1265+) - ProductRequest model
  - `subscriptions/services/online_request_service.py` - Online request logic
  - `subscriptions/services/product_request_service.py` - Product request logic
  - `api/v1/views/online_request.py` - Online request API
  - `api/v1/views/product_requests.py` - Product request API

---

## 12. Workflow Decision Tree

```
START: Do you have a prospect?

├─ REGISTERED CUSTOMER (has account)
│   ├─ They submit Online Request (from portal/app)
│   │   → QUOTE workflow (quote → customer accepts → admin approves)
│   │   → Auto-converts to ProductRequest or Subscription
│   │
│   └─ Admin creates ProductRequest directly
│       → FAST workflow (customer linking → pricing → approve)
│       → No quote phase, direct approval
│
└─ UNREGISTERED PROSPECT (no account)
    ├─ CAN use Online Request? NO ✗
    │
    └─ CAN use Product Request? YES ✓
        → Admin creates ProductRequest
        → Fills snapshot: name, phone, email, address
        → At approval: optionally link to customer account
        → Creates DirectSale/invoice with snapshot contact info
```

---

