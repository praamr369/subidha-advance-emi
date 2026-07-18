# Prospect Tracking: Visual Workflow Guide

## Complete Flow Diagram: Unregistered Prospect → Fulfilled Sale

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ UNREGISTERED PROSPECT SUBMITS REQUEST VIA PUBLIC WEBSITE                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User fills "Apply" form on public website:                                │
│  ┌─────────────────────────────────┐                                       │
│  │ Name: Rajesh Kumar              │                                       │
│  │ Phone: 9876543210               │                                       │
│  │ Email: rajesh@example.com       │                                       │
│  │ City: Mumbai                    │                                       │
│  │ Product: Home Appliance Plan    │                                       │
│  │ Intent: DIRECT_SALE             │                                       │
│  │ Notes: Need monthly EMI         │                                       │
│  └─────────────────────────────────┘                                       │
│           ↓                                                                 │
│  POST /api/public/leads/                                                  │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SYSTEM CREATES PublicLead RECORD (Status: NEW)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Database:                                                                  │
│  ┌──────────────────────────────────┐                                      │
│  │ PublicLead ID: 1234              │                                      │
│  │ name: "Rajesh Kumar"             │                                      │
│  │ phone: "9876543210"              │                                      │
│  │ email: "rajesh@example.com"      │                                      │
│  │ city: "Mumbai"                   │                                      │
│  │ product_id: 5                    │                                      │
│  │ intent: "DIRECT_SALE"            │                                      │
│  │ status: "NEW" ← ← ← ← ←          │                                      │
│  │ assigned_to: NULL                │                                      │
│  │ created_at: 2026-07-18 10:30 AM  │                                      │
│  └──────────────────────────────────┘                                      │
│           ↓                                                                 │
│  ADMIN IS NOTIFIED: New lead in enquiry queue                              │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ ADMIN TRACKS LEAD IN CRM                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  URL: /admin/crm/leads?tab=enquiries                                       │
│                                                                             │
│  Admin Dashboard Table:                                                     │
│  ┌────────┬─────────────────┬──────────────────┬────────────┬──────────┐   │
│  │ Lead   │ Product         │ Intent           │ Status     │ Actions  │   │
│  ├────────┼─────────────────┼──────────────────┼────────────┼──────────┤   │
│  │ Rajesh │ Home Appliance  │ DIRECT_SALE      │ NEW ⚡     │ [Details]│   │
│  │ Kumar  │ Plan            │                  │            │ [Assign] │   │
│  └────────┴─────────────────┴──────────────────┴────────────┴──────────┘   │
│           ↓                                                                 │
│  Admin clicks → View Details                                               │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ ADMIN DETAIL PAGE: /admin/crm/leads/1234                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LEFT PANEL: Lead Information                                              │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │ Lead Snapshot:                                                 │        │
│  │ • Rajesh Kumar | 9876543210 | rajesh@example.com              │        │
│  │ • City: Mumbai                                                 │        │
│  │ • Product: Home Appliance Plan (ID: 5)                        │        │
│  │ • Intent: DIRECT_SALE                                         │        │
│  │ • Applied: Jul 18, 2026 10:30 AM                              │        │
│  │ • Status: NEW                                                  │        │
│  └────────────────────────────────────────────────────────────────┘        │
│           ↓                                                                 │
│  CENTER PANEL: Admin Actions                                               │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │ [ASSIGN to Staff]       → Select Priya (sales manager)         │        │
│  │ [ADD ADMIN NOTES]       → "High-value prospect, ASAP follow-up"│        │
│  │ [SCHEDULE FOLLOW-UP]    → Call on Jul 19, 2PM                │        │
│  │ [CREATE OPPORTUNITY]    → ₹25,000 sale, close by Aug 15      │        │
│  │ [CREATE REQUEST]        → Generate ProductRequest            │        │
│  │ [VIEW CRM PARTY]        → See all interactions               │        │
│  └────────────────────────────────────────────────────────────────┘        │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: ADMIN ASSIGNS TO STAFF                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Admin Action: Click [ASSIGN to Staff] → Select "Priya"                    │
│           ↓                                                                 │
│  Database Update:                                                           │
│  PublicLead.assigned_to = Priya (User ID: 456)                             │
│  PublicLead.status = "IN_PROGRESS"                                         │
│  PublicLead.assigned_at = 2026-07-18 11:00 AM                              │
│           ↓                                                                 │
│  PRIYA'S DASHBOARD NOW SHOWS:                                              │
│  "New lead: Rajesh Kumar - Assigned to you"                                │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: ADMIN ADDS NOTES & SCHEDULES FOLLOW-UP                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Admin Action: Add Notes                                                    │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │ Admin Notes:                                                   │        │
│  │ "Called Rajesh at 2PM. Very interested. Wants monthly EMI.    │        │
│  │  Send quote for ₹25,000 plan. Follow-up: Jul 19, 10 AM"       │        │
│  └────────────────────────────────────────────────────────────────┘        │
│           ↓                                                                 │
│  Database Update:                                                           │
│  PublicLead.admin_notes = "Called Rajesh..."                               │
│  PublicLead.status = "CONTACTED"                                           │
│  PublicLead.contacted_at = 2026-07-18 14:00 PM                             │
│           ↓                                                                 │
│  PRIYA'S CRM DASHBOARD NOW SHOWS:                                          │
│  └─ Follow-up task (DUE: Jul 19, 10 AM)                                    │
│  └─ Notes: "Send quote for ₹25,000 plan"                                  │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: ADMIN CREATES ProductRequest                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Admin Action: Click [CREATE REQUEST] on lead detail                       │
│           ↓                                                                 │
│  System Auto-Fills:                                                         │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │ NEW ProductRequest                                             │        │
│  │ • requester: Admin                                             │        │
│  │ • request_type: DIRECT_SALE (from lead intent)               │        │
│  │ • product: Home Appliance Plan (ID: 5)                       │        │
│  │ • requested_customer_name: "Rajesh Kumar"                     │        │
│  │ • requested_customer_phone: "9876543210"                      │        │
│  │ • requested_customer_email: "rajesh@example.com"              │        │
│  │ • source_public_lead: PublicLead(1234) ← LINKED               │        │
│  │ • status: SUBMITTED                                            │        │
│  └────────────────────────────────────────────────────────────────┘        │
│           ↓                                                                 │
│  Database Update:                                                           │
│  PublicLead.converted_product_request = ProductRequest(567)                │
│  PublicLead.status = "READY_TO_CONVERT"                                    │
│           ↓                                                                 │
│  LEAD DETAIL PAGE UPDATES:                                                 │
│  Status Badge: READY_TO_CONVERT                                            │
│  Conversion: "PR #567" (clickable link)                                    │
│  Timeline:                                                                  │
│   ✓ Lead Applied (Jul 18)                                                  │
│   ✓ Request Created (Jul 18) → PR #567                                     │
│   □ Approval Pending                                                       │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: ADMIN APPROVES ProductRequest → Creates DRAFT Invoice              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Admin navigates: /admin/requests/product-requests/direct-sale/567         │
│           ↓                                                                 │
│  Admin approves:                                                            │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │ STEP 1: Link Customer                                          │        │
│  │ • Option A: Rajesh registers → Link to Customer account       │        │
│  │ • Option B: Use snapshot → Invoice created without account    │        │
│  │                                                                 │        │
│  │ STEP 2: Review Pricing                                        │        │
│  │ • Unit Price: ₹25,000                                        │        │
│  │ • Quantity: 1                                                 │        │
│  │ • Total: ₹25,000                                              │        │
│  │                                                                 │        │
│  │ STEP 3: Approve Sale                                          │        │
│  │ [APPROVE SALE] → Creates DRAFT DirectSale/Invoice             │        │
│  └────────────────────────────────────────────────────────────────┘        │
│           ↓                                                                 │
│  Database Update:                                                           │
│  ProductRequest.status = "APPROVED"                                        │
│  ProductRequest.approved_direct_sale = DirectSale(890)                     │
│  PublicLead.converted_direct_sale = DirectSale(890)                        │
│  PublicLead.status = "CONVERTED"                                           │
│  PublicLead.converted_at = 2026-07-18 15:00 PM                             │
│  PublicLead.converted_by = Admin (User ID: 123)                            │
│           ↓                                                                 │
│  LEAD DETAIL PAGE FINAL STATE:                                             │
│  Status Badge: CONVERTED ✓                                                 │
│  Timeline:                                                                  │
│   ✓ Lead Applied (Jul 18)                                                  │
│   ✓ Request Created (Jul 18) → PR #567                                     │
│   ✓ Conversion Complete (Jul 18) → Sale #890                               │
│           ↓                                                                 │
│  ADMIN CAN NOW:                                                             │
│  └─ View Draft Invoice (billing.DirectSale #890)                           │
│  └─ Send invoice to Rajesh                                                 │
│  └─ Collect payment                                                        │
│  └─ Process delivery                                                       │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: FULFILLMENT → Lead Status: CLOSED                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Timeline:                                                                  │
│  ┌──────────┬───────────────────────────────┐                              │
│  │ Jul 18   │ ✓ Lead Applied → IN_PROGRESS  │                              │
│  │ Jul 18   │ ✓ Contacted (Admin notes) →   │                              │
│  │ Jul 18   │ ✓ ProductRequest Created      │                              │
│  │ Jul 18   │ ✓ Request Approved            │                              │
│  │ Jul 18   │ ✓ DirectSale Created (DRAFT)  │                              │
│  │ Jul 19   │ ✓ Payment Collected ₹25,000   │                              │
│  │ Jul 20   │ ✓ Delivery Scheduled          │                              │
│  │ Jul 22   │ ✓ Delivered Successfully      │                              │
│  │ Jul 22   │ ✓ Lead Status: CLOSED         │ ← Archive                    │
│  └──────────┴───────────────────────────────┘                              │
│           ↓                                                                 │
│  FINAL CONVERSION REPORT:                                                  │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │ Prospect: Rajesh Kumar (9876543210)                            │        │
│  │ Product: Home Appliance Plan                                   │        │
│  │ Sale Type: DIRECT_SALE                                        │        │
│  │ Invoice: #890 (COMPLETED)                                      │        │
│  │ Amount: ₹25,000                                                │        │
│  │ Days to Conversion: 4 days (applied Jul 18 → delivered Jul 22)│        │
│  │ Journey: PublicLead → ProductRequest → DirectSale → Completed │        │
│  └────────────────────────────────────────────────────────────────┘        │
│           ↓                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Admin Dashboard at Each Stage

### Stage 1: NEW (Unapproached)
```
Enquiries Tab View:
┌──────────────────────────────────────────────────────────┐
│ Rajesh Kumar | Home Appliance | DIRECT_SALE | NEW ⚡    │
│ Phone: 9876... | Status: NEW | Assigned: — | Conversion: — │
│ [View Details] [Assign] [Delete?]                        │
└──────────────────────────────────────────────────────────┘
```

### Stage 2: IN_PROGRESS (Assigned)
```
Enquiries Tab View:
┌──────────────────────────────────────────────────────────┐
│ Rajesh Kumar | Home Appliance | DIRECT_SALE | IN_PROG 🔄 │
│ Phone: 9876... | Assigned: Priya | Follow-up: Due TODAY │
│ [View Details] [Notes...] [Schedule Follow-up]          │
└──────────────────────────────────────────────────────────┘
```

### Stage 3: CONTACTED (Follow-up done)
```
Enquiries Tab View:
┌──────────────────────────────────────────────────────────┐
│ Rajesh Kumar | Home Appliance | DIRECT_SALE | CONTACTED │
│ Phone: 9876... | Assigned: Priya | Last Contact: Today  │
│ [View Details] [Create Request] [Mark Interested]       │
└──────────────────────────────────────────────────────────┘
```

### Stage 4: READY_TO_CONVERT (Request created)
```
Enquiries Tab View:
┌──────────────────────────────────────────────────────────┐
│ Rajesh Kumar | Home Appliance | DIRECT_SALE | RDY_CONV ⚡ │
│ Phone: 9876... | Conversion: PR #567 | Status: SUBMITTED│
│ [View Details] [Approve Request] [View Invoice]         │
└──────────────────────────────────────────────────────────┘
```

### Stage 5: CONVERTED (Sale approved)
```
Enquiries Tab View:
┌──────────────────────────────────────────────────────────┐
│ Rajesh Kumar | Home Appliance | DIRECT_SALE | CONVERTED✓│
│ Phone: 9876... | Sale: #890 | Amount: ₹25,000 | Paid: No│
│ [View Invoice] [Track Delivery] [Mark Closed]          │
└──────────────────────────────────────────────────────────┘
```

### Stage 6: CLOSED (Delivered/Complete)
```
Enquiries Tab View (Archived):
┌──────────────────────────────────────────────────────────┐
│ Rajesh Kumar | Home Appliance | DIRECT_SALE | CLOSED ✓   │
│ Phone: 9876... | Delivered: Jul 22 | Revenue: ₹25,000   │
│ [View Full Record] [Archive] [Create Report]            │
└──────────────────────────────────────────────────────────┘
```

---

## Key Admin Access Points

```
┌──────────────────────────────────────────────────────┐
│ ADMIN CRM DASHBOARD                                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│ 1. /admin/crm/leads (Pipeline + Enquiries)         │
│    └─ View all internal leads & public inquiries    │
│    └─ Filters: status, intent, assigned, date, q    │
│    └─ Bulk actions: assign, add notes, convert      │
│                                                      │
│ 2. /admin/crm/leads/{id} (Detail Page)             │
│    └─ Full prospect history                         │
│    └─ Assign, add notes, schedule follow-up         │
│    └─ Create ProductRequest, link to customer       │
│    └─ View CRM Party interactions                   │
│    └─ Track conversion progress                     │
│                                                      │
│ 3. /admin/requests/product-requests (All PRs)      │
│    └─ View all ProductRequests                      │
│    └─ Filter by status, type, source                │
│    └─ Approve/reject with customer linking          │
│                                                      │
│ 4. /admin/requests/product-requests/direct-sale/{id}│
│    └─ DIRECT_SALE ProductRequest detail             │
│    └─ Step-by-step approval workflow                │
│    └─ Create DRAFT invoice                          │
│                                                      │
│ 5. /admin/billing/invoices (All Sales/Invoices)    │
│    └─ View DRAFT, SENT, PAID invoices               │
│    └─ Track payment status                          │
│    └─ Generate delivery orders                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Query Examples for Admins

### Find all new leads (not yet contacted)
```
GET /admin/crm/leads?tab=enquiries&status=NEW
Result: Shows all NEW leads with "Assign" button
```

### Find leads assigned to specific staff
```
GET /admin/crm/leads?tab=enquiries&assignee=456
Result: All leads owned by staff member ID 456
```

### Find leads ready to convert
```
GET /admin/crm/leads?tab=enquiries&status=READY_TO_CONVERT
Result: Leads with ProductRequests pending approval
```

### Find converted/closed leads (reporting)
```
GET /admin/crm/leads?tab=enquiries&status=CONVERTED
Result: All leads with approved sales (for revenue tracking)
```

### Search by prospect name
```
GET /admin/crm/leads?q=rajesh
Result: Any lead matching "rajesh" in name/phone/city
```

### Leads from last 7 days
```
GET /admin/crm/leads?date_from=2026-07-11&date_to=2026-07-18
Result: Leads created in that date range
```

---

## What Admins Can Track at Each Step

```
STEP 1: INTAKE
  ✓ When prospect applied (created_at)
  ✓ What they want (product, intent)
  ✓ Contact details (name, phone, email, city)
  ✓ Special notes (preferred EMI, notes)

STEP 2: ENGAGEMENT
  ✓ Assigned to which staff member (assigned_to)
  ✓ When assigned (assigned_at)
  ✓ All follow-up calls/emails (CRM Party interactions)
  ✓ Next follow-up scheduled (follow_up_on)
  ✓ Admin notes (admin_notes)
  ✓ Current stage (status: NEW → CONTACTED → etc.)

STEP 3: REQUEST CREATION
  ✓ Which ProductRequest created (converted_product_request)
  ✓ Request status (SUBMITTED → APPROVED)
  ✓ Customer linked or unregistered (customer_id)
  ✓ Pricing confirmed (unit_price)

STEP 4: APPROVAL
  ✓ Which DirectSale/Invoice created (converted_direct_sale)
  ✓ Approval timestamp (converted_at)
  ✓ Approved by which admin (converted_by)
  ✓ Sale amount (from DirectSale)

STEP 5: FULFILLMENT
  ✓ Payment received (DirectSale.payment_status)
  ✓ Delivery scheduled (Delivery record)
  ✓ Delivery date (Delivery.completed_at)
  ✓ Final status (CLOSED)
  ✓ Total days to conversion (created_at → completed_at)
```

---

