# Admin Guide: Tracking Unregistered Prospects (Public Leads)

## Overview

Unregistered prospects who submit requests through your public website are automatically created as **PublicLeads** in your CRM system. Admins can track their entire journey from initial inquiry → conversion → final fulfillment.

---

## 1. Where Prospects Submit Requests

### Public Application Endpoint

**URL:** Any public-facing "Apply" button on your website
- Product catalog pages
- Direct Sale request form
- EMI/Subscription inquiry
- Rent/Lease inquiry

**What They Fill:**
- Name (required)
- Phone number (required, 10 digits)
- Email (optional)
- City (optional)
- Product interested in (required)
- Preferred EMI amount (optional)
- Notes (optional)
- Intent (DIRECT_SALE, QUOTATION, SUBSCRIPTION, LEASE, RENT, etc.)

**API Endpoint:** `POST /api/public/leads/`

```json
{
  "name": "Rajesh Kumar",
  "phone": "9876543210",
  "email": "rajesh@example.com",
  "city": "Mumbai",
  "product_id": 5,
  "interested_product": "Home Appliance Plan",
  "preferred_emi_amount": "5000.00",
  "notes": "Interested in monthly EMI option",
  "intent": "DIRECT_SALE",
  "create_procurement_enquiry": false
}
```

**Response:**
```json
{
  "message": "Lead submitted successfully",
  "lead_id": 1234,
  "created_at": "2026-07-18T10:30:00Z",
  "data": { ... }
}
```

---

## 2. PublicLead Model in System

### What Gets Stored

When a prospect applies, a **PublicLead** record is created with:

```
PublicLead
├─ id: 1234
├─ name: "Rajesh Kumar"
├─ phone: "9876543210"
├─ email: "rajesh@example.com"
├─ city: "Mumbai"
├─ product: ForeignKey → Product (5)
├─ interested_product: "Home Appliance Plan"
├─ preferred_emi_amount: 5000.00
├─ notes: "Interested in monthly EMI option"
├─ intent: "DIRECT_SALE"
├─ status: "NEW" (initial status)
├─ source: "PUBLIC_SITE"
├─ follow_up_required: false
├─ assigned_to: NULL (unassigned until admin picks it up)
├─ admin_notes: "" (admin fills these during follow-up)
├─ created_at: 2026-07-18 10:30:00
│
├─ CONVERSION TRACKING (all NULL initially):
│  ├─ converted_customer: NULL → Customer (when they register)
│  ├─ converted_online_request: NULL → OnlineRequest (quote workflow)
│  ├─ converted_product_request: NULL → ProductRequest (direct request)
│  ├─ converted_subscription_request: NULL → SubscriptionRequest
│  ├─ converted_subscription: NULL → Subscription (active contract)
│  ├─ converted_direct_sale: NULL → DirectSale/Invoice
│  └─ converted_by: NULL → User (admin who converted)
│
└─ CRM LINKING:
   └─ crm_pipeline_lead: Optional link to CRM Pipeline Lead
```

---

## 3. Admin Views & Dashboards

### 3.1 Public Leads Dashboard

**URL:** `/admin/crm/leads`

Shows **two tabs:**
1. **Pipeline Tab** - Internal CRM leads created by admin
2. **Enquiries Tab** - Public leads (unregistered prospects)

### 3.2 Enquiries Tab (Public Leads)

**Shows:**
- All public leads submitted through website
- Status, intent, assigned staff member
- Conversion progress (customer registered? request created? sale completed?)

**Filters Available:**
- **Status**: NEW, IN_PROGRESS, CONTACTED, CONVERTED, CLOSED
- **Intent**: DIRECT_SALE, QUOTATION, SUBSCRIPTION, RENT, LEASE
- **Assigned To**: Your staff members
- **Date Range**: When they applied
- **Search**: By name, phone, city, product, notes

**Columns:**
| Column | Shows |
|--------|-------|
| **Lead** | Name, Phone |
| **Product** | What they're interested in |
| **Intent** | Their request type (DIRECT_SALE, etc.) |
| **Status** | NEW / IN_PROGRESS / CONTACTED / CONVERTED / CLOSED |
| **Assigned To** | Which staff member is handling it |
| **Conversion** | If → Registered Customer, Request Created, Sale Closed |
| **Created** | When they applied |

---

## 4. Lead Detail Page (Admin Tracking)

### URL: `/admin/crm/leads/{id}`

Shows **complete lifecycle** of a single prospect.

### Information Sections:

#### A. **Lead Snapshot** (Read-Only Initially)
```
Name: Rajesh Kumar
Phone: 9876543210
Email: rajesh@example.com
City: Mumbai
Product: Home Appliance Plan (ID: 5)
Intent: DIRECT_SALE
Applied: Jul 18, 2026 10:30 AM
Status: NEW
Assigned To: (Unassigned)
```

#### B. **Admin Actions Panel**

1. **Assign to Staff Member**
   - Click "Assign"
   - Select from dropdown of CRM staff
   - Automatically updates status to "IN_PROGRESS"

2. **Update Lead Status**
   - NEW → CONTACTED → INTERESTED → KYC_PENDING → READY_TO_CONVERT → CONVERTED
   - Track where in sales pipeline this prospect is

3. **Add Admin Notes**
   - Update "Admin Notes" field with follow-up details
   - Visible to all staff members
   - Helps with handoffs and context

4. **Schedule Follow-Up Tasks**
   - Set a due date/time
   - Add call notes or action items
   - System tracks overdue follow-ups
   - Staff can mark as "Complete" or "Cancel"

#### C. **Opportunities** (Sales Pipeline)

Track sales opportunities linked to this lead:
- Create opportunity with title, estimated value, expected close date
- Mark as: OPEN → WON → LOST
- Shows conversion probability

Example:
```
Opportunity: "Home Appliance Plan - Monthly EMI"
Estimated Value: ₹25,000
Stage: OPEN
Expected Close: Aug 15, 2026
```

#### D. **Conversion Timeline**

Shows **step-by-step conversion journey**:

```
✓ STEP 1: Lead Applied
  └─ Jul 18, 10:30 AM - Public lead created from website

□ STEP 2: Customer Registration (NOT YET)
  └─ When prospect registers → Customer account created
  └─ PublicLead.converted_customer = new Customer
  └─ Status moves toward "READY_TO_CONVERT"

□ STEP 3: Request Submitted (NOT YET)
  └─ When admin creates ProductRequest OR prospect submits OnlineRequest
  └─ PublicLead.converted_product_request or .converted_online_request
  └─ Status: "READY_TO_CONVERT" → "CONVERTED"

□ STEP 4: Conversion Complete (NOT YET)
  └─ When request is approved
  └─ Creates Subscription or DirectSale
  └─ PublicLead.converted_subscription or .converted_direct_sale
  └─ Status: "CLOSED"
  └─ Shows final fulfillment entity
```

---

## 5. How Admin Creates Request from Public Lead

### Path 1: Admin Creates Product Request

**At Lead Detail Page:**
1. Click "Create Product Request"
2. System auto-fills:
   - Customer snapshot (name, phone, email, city)
   - Product (from PublicLead.product)
   - Source: PublicLead ID
3. Admin selects:
   - Request type: DIRECT_SALE, ADVANCE_EMI, RENT, LEASE
   - If DIRECT_SALE: pricing, customer linking
4. Admin approves → Creates DRAFT invoice
5. Public lead linked: `PublicLead.converted_product_request = ProductRequest.id`

**Result:**
- ProductRequest created with `source_public_lead = PublicLead.id`
- Lead status auto-updates to "READY_TO_CONVERT"
- When request approved → Lead status = "CONVERTED"

### Path 2: Prospect Registers & Submits Online Request

**Customer Self-Service:**
1. Prospect clicks "Register" from somewhere in journey
2. Creates customer account (phone-based OTP or email)
3. Registers as Customer in system
4. PublicLead.converted_customer = new Customer
5. Prospect can now:
   - Submit Online Request (quote workflow)
   - View subscription history
   - Pay EMI online

**Admin's View:**
- Lead detail shows "Customer Registered ✓" 
- Can now see Customer Profile link
- Can now link existing ProductRequests

---

## 6. Complete Tracking Workflow

### Example: Rajesh's Journey

**Day 1: Initial Application**
```
Time: 10:30 AM
Event: Rajesh fills "Apply" form on website
  └─ PublicLead created (ID: 1234)
  └─ Status: NEW
  └─ Intent: DIRECT_SALE
  └─ Assigned to: NULL
  └─ Product: Home Appliance Plan

Admin View: /admin/crm/leads?tab=enquiries
└─ Rajesh appears in "New" section
└─ Phone: 9876543210
└─ Status badge: "NEW"
└─ Action: [Assign] [View Details]
```

**Day 1: Admin Assignment**
```
Time: 11:00 AM
Admin Action: Assign to "Priya" (sales staff)
  └─ PublicLead.assigned_to = Priya
  └─ Status: IN_PROGRESS
  └─ Admin Notes: "High-value prospect, ASAP follow-up"

Priya's Dashboard:
└─ Lead appears in her "Assigned to Me" list
└─ Status: IN_PROGRESS
```

**Day 1: Admin Creates Request**
```
Time: 14:30 PM
Admin Action: Click "Create Product Request" on lead
  └─ New ProductRequest created
  └─ Type: DIRECT_SALE
  └─ Customer Snapshot:
    ├─ Name: Rajesh Kumar
    ├─ Phone: 9876543210
    ├─ Email: rajesh@example.com
    └─ City: Mumbai
  └─ source_public_lead = PublicLead(1234)
  └─ Link: PublicLead.converted_product_request = ProductRequest(567)

Lead Detail Shows:
├─ Status badge: "READY_TO_CONVERT" (auto-updated)
├─ Conversion column: "PR #567" (linked ProductRequest)
└─ Timeline: "✓ Request Created"
```

**Day 1: Admin Approves Request**
```
Time: 15:00 PM
Admin Action: Approves ProductRequest #567
  └─ Pricing: ₹25,000
  └─ Creates: billing.DirectSale (DRAFT invoice)
  └─ Links: ProductRequest.approved_direct_sale = DirectSale(890)

Lead Detail Shows:
├─ Status badge: "CONVERTED" (auto-updated)
├─ Conversion Timeline:
│  ├─ ✓ Lead Applied (Jul 18)
│  ├─ ✓ Request Created (Jul 18)
│  └─ ✓ Conversion Complete → DirectSale #890
└─ Sale Link: "View Invoice →" (click to see DRAFT invoice)
```

**Day 2+: Fulfillment**
```
Admin Workflow:
  DirectSale #890 → Payment Collected
                  → Delivery Scheduled
                  → Delivered ✓
                  → Completed

Lead Detail Shows:
└─ Final Status: "CLOSED"
└─ Sale Status: "COMPLETED"
└─ Revenue Attribution: "Rajesh Kumar - Home Appliance - ₹25,000"
```

---

## 7. Linked CRM Parties (Advanced)

### How "Parties" Connect to Leads

Each PublicLead can have a **CRM Party** (business contact):

**Links Created:**
```
PublicLead (1234)
    ↓ PartyLink (LEAD role)
CRM Party (ID: 5001)
    ├─ party_no: "CUST-0001"
    ├─ display_name: "Rajesh Kumar"
    └─ Follow-up interactions tracked here
```

**Why This Matters:**
- All follow-up calls, emails, messages tracked at Party level
- Multiple leads can link to same Party (returning customer)
- Unified interaction history across all channels

**Admin View:**
In Lead Detail page → "CRM Party" section:
- Party Number
- Party Display Name
- Next Follow-Up Due
- Follow-Up Status: DUE | SCHEDULED | NONE
- Open Follow-Ups Count

---

## 8. Complete Admin Dashboard Summary

### Lead Status Lifecycle

```
NEW
 ↓ (Admin assigns to staff)
IN_PROGRESS
 ↓ (Admin contacts prospect)
CONTACTED
 ↓ (Prospect shows interest, request created)
INTERESTED / KYC_PENDING
 ↓ (Ready to convert)
READY_TO_CONVERT
 ↓ (Request approved, sale created)
CONVERTED
 ↓ (Sale delivered/completed)
CLOSED
```

### Conversion Tracking Fields

**At Each Stage:**

| Stage | What's Tracked | Data |
|-------|----------------|------|
| NEW | Initial submission | Name, phone, product, intent |
| IN_PROGRESS | Assigned staff | PublicLead.assigned_to |
| CONTACTED | Follow-up history | CRM Party interactions |
| INTERESTED | Opportunities created | Opportunities table |
| KYC_PENDING | Registration if needed | converted_customer |
| READY_TO_CONVERT | Request created | converted_product_request or converted_online_request |
| CONVERTED | Sale approved | converted_direct_sale or converted_subscription |
| CLOSED | Final fulfillment | Subscription/DirectSale completion |

---

## 9. Admin Tracking Checklist

### How to Fully Track an Unregistered Prospect:

- [ ] **View all new leads**: `/admin/crm/leads?tab=enquiries&status=NEW`
- [ ] **Assign to staff**: Click lead → "Assign" → Select staff
- [ ] **Add follow-up notes**: Lead detail → "Admin Notes" → Update
- [ ] **Schedule follow-up call**: Create task → Set due date → Assign to staff
- [ ] **Check conversion progress**: Lead detail → "Conversion Timeline"
- [ ] **Create request**: Click "Create Product Request" OR wait for prospect to register
- [ ] **Link to customer**: If prospect registers → Link to Customer account
- [ ] **Approve request**: Move to ProductRequest approval workflow
- [ ] **Track fulfillment**: Monitor DirectSale/Subscription completion
- [ ] **Mark as closed**: When sale delivered/completed
- [ ] **View CRM party**: See all interactions at CRM Party level

---

## 10. Key Fields for Admin Tracking

### PublicLead Fields (Visible in Admin)

| Field | Purpose | Editable |
|-------|---------|----------|
| `id` | Unique lead ID | No |
| `name` | Prospect name | Yes (admin notes) |
| `phone` | Contact number | No |
| `email` | Contact email | No |
| `city` | Location | No |
| `product_id` | What they're interested in | No |
| `intent` | Type of inquiry (DIRECT_SALE, etc.) | No |
| `status` | NEW/IN_PROGRESS/CONTACTED/CONVERTED/CLOSED | Yes (admin action) |
| `assigned_to` | Which staff member handles | Yes (assign) |
| `admin_notes` | Internal notes for team | Yes |
| `follow_up_required` | Flag for follow-up | Yes |
| `follow_up_on` | Follow-up date | Yes |
| `follow_up_note` | Follow-up details | Yes |
| `converted_customer` | Link to registered Customer | Auto-filled |
| `converted_product_request` | Link to ProductRequest | Auto-filled |
| `converted_direct_sale` | Link to Invoice/Sale | Auto-filled |
| `converted_subscription` | Link to Contract | Auto-filled |
| `created_at` | When they applied | No |

---

## 11. API Endpoints for Admin Tracking

### List Public Leads

```
GET /api/v1/admin/leads/
Params: status, intent, assignee, q (search), date_from, date_to
Returns: Paginated list of PublicLeads with conversion data
```

### Get Lead Detail

```
GET /api/v1/admin/leads/{id}/
Returns: Full PublicLead with:
  - Conversion tracking fields
  - Assigned staff
  - CRM party links
  - Follow-up tasks
  - Opportunities
```

### Assign Lead

```
POST /api/v1/admin/leads/{id}/assign/
Body: { "assigned_to": user_id }
Effect: Updates assigned_to, status → IN_PROGRESS
```

### Update Lead Status

```
POST /api/v1/admin/leads/{id}/update-status/
Body: { "status": "CONTACTED" | "INTERESTED" | "CONVERTED" | ... }
Effect: Updates status, updates tracking timeline
```

### Update Admin Notes

```
POST /api/v1/admin/leads/{id}/update-notes/
Body: { "admin_notes": "Called at 3PM, interested in EMI" }
Effect: Updates admin_notes field (visible to all staff)
```

### Create Follow-Up Task

```
POST /api/v1/admin/leads/{id}/tasks/
Body: { "due_at": "2026-07-19T14:00:00Z", "call_note": "Confirm interest" }
Effect: Creates follow-up task, tracks in CRM interactions
```

### Create Opportunity

```
POST /api/v1/admin/leads/{id}/opportunities/
Body: { 
  "title": "Home Appliance Sale",
  "estimated_value": "25000.00",
  "expected_close_date": "2026-08-15"
}
Effect: Creates opportunity, tracks in sales pipeline
```

### Mark Conversion Complete

```
POST /api/v1/admin/leads/{id}/conversion-complete/
Body: { 
  "direct_sale_id": 890 (or subscription_id, etc.)
}
Effect: Links to final fulfillment, marks status → CLOSED
```

---

## 12. Queries & Reports

### How Admins Query Lead Conversion

**All New Leads (Not Yet Contacted):**
```
GET /admin/crm/leads?status=NEW
```

**Leads Assigned to a Staff Member:**
```
GET /admin/crm/leads?assignee={user_id}&status=IN_PROGRESS
```

**Converted Leads (Sales Closed):**
```
GET /admin/crm/leads?status=CONVERTED
```

**Leads by Intent (DIRECT_SALE):**
```
GET /admin/crm/leads?intent=DIRECT_SALE
```

**Leads Created in Last 7 Days:**
```
GET /admin/crm/leads?date_from=2026-07-11&date_to=2026-07-18
```

**Search by Name/Phone:**
```
GET /admin/crm/leads?q=rajesh OR q=9876543210
```

---

## 13. Summary: Full Prospect Tracking Flow

```
PUBLIC APPLICATION (Website)
    ↓ POST /api/public/leads/
    ↓
PublicLead Created (Status: NEW)
    ↓
ADMIN VIEWS ENQUIRY TAB
    ├─ /admin/crm/leads?tab=enquiries
    ├─ Filters by: status, intent, assigned_to, date, search
    └─ Column: Lead Name, Product, Intent, Status, Assigned, Conversion, Created

ADMIN DETAIL PAGE (/admin/crm/leads/{id})
    ├─ [ASSIGN] → Assign to staff member (Status → IN_PROGRESS)
    ├─ [ADD NOTES] → Update admin_notes with follow-up details
    ├─ [SCHEDULE TASK] → Create follow-up call/email with due date
    ├─ [CREATE OPPORTUNITY] → Track sales opportunity value
    ├─ [VIEW CRM PARTY] → See all interactions & follow-ups
    └─ [CREATE REQUEST] → Admin creates ProductRequest from lead

CONVERSION TIMELINE (Auto-Updated)
    ├─ ✓ Lead Applied (Jul 18)
    ├─ ✓ Request Created (Jul 18) → PR#567
    ├─ ✓ Conversion Complete (Jul 18) → Sale #890
    └─ Status: CONVERTED → CLOSED

FINAL FULFILLMENT
    ├─ Invoice created & sent
    ├─ Payment collected
    ├─ Delivery scheduled & completed
    └─ Lead status: CLOSED (archived)
```

---

