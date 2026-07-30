# Admin Quick Reference: Track Unregistered Prospects

## In 60 Seconds

**When an unregistered prospect clicks "Apply":**
1. **PublicLead** record created automatically
2. Shows up in admin's **Enquiries tab** under CRM
3. Admin can **assign → note → follow-up → create request → approve → track fulfillment**

---

## Key URLs

| Task | URL |
|------|-----|
| **View all public leads** | `/admin/crm/leads?tab=enquiries` |
| **View NEW leads only** | `/admin/crm/leads?tab=enquiries&status=NEW` |
| **View assigned to me** | `/admin/crm/leads?tab=enquiries&assignee={MY_ID}` |
| **Lead detail page** | `/admin/crm/leads/{lead_id}` |
| **Create ProductRequest** | `/admin/requests/product-requests` → Create → Source: PublicLead |
| **Approve ProductRequest** | `/admin/requests/product-requests/direct-sale/{id}` |
| **View Invoice/Sale** | `/admin/billing/invoices/{invoice_id}` |

---

## Step-by-Step: Track a Prospect

### 1️⃣ See New Leads
```
Dashboard → CRM → Leads (Enquiries tab)
Shows: Name, Phone, Product, Status, Assigned To
```

### 2️⃣ Assign to Staff
```
Click lead → [Assign] → Select staff member
Auto-updates: Status = IN_PROGRESS
```

### 3️⃣ Add Follow-Up Notes
```
Click lead → [Add Admin Notes]
Type: "Called at 3PM, very interested, send quote"
Visible to: Entire team
```

### 4️⃣ Schedule Call/Follow-Up
```
Click lead → [Create Task]
Set: Due date/time
Add: Call notes
Assignee: Which staff member
Status: Open, tracking overdue calls
```

### 5️⃣ Create Request (from Lead)
```
Click lead → [Create Product Request]
Auto-fills: Name, Phone, Email, Product
Admin selects: Request type (DIRECT_SALE, EMI, etc.)
Result: ProductRequest created with source_public_lead = this lead
```

### 6️⃣ Approve Request
```
Navigate: /admin/requests/product-requests/direct-sale/{id}
Steps:
  ├─ Step 1: Link customer (search registered OR use snapshot)
  ├─ Step 2: Review pricing
  └─ Step 3: Approve → Creates DRAFT Invoice

Auto-updates Lead:
  └─ Status = CONVERTED
  └─ converted_direct_sale = Invoice ID
```

### 7️⃣ Track Fulfillment
```
View Invoice: /admin/billing/invoices/{invoice_id}
Track: Payment → Delivery → Completion
Final: Mark Lead as CLOSED (archived)
```

---

## Lead Status Meanings

| Status | Meaning | Admin Action |
|--------|---------|--------------|
| **NEW** | Just applied, not contacted yet | Assign to staff |
| **IN_PROGRESS** | Assigned to staff member | Wait for follow-up |
| **CONTACTED** | Staff called/emailed | Create request or schedule more follow-up |
| **INTERESTED** | Showed interest | Prepare ProductRequest |
| **KYC_PENDING** | Customer registered (if needed) | Link to customer account |
| **READY_TO_CONVERT** | ProductRequest created | Approve request |
| **CONVERTED** | Request approved, sale created | Track payment & delivery |
| **CLOSED** | Delivered/completed | Archive |

---

## What Gets Tracked at Each Stage

```
Stage 1: NEW
  └─ Applied: 2026-07-18 10:30 AM
  └─ Source: PUBLIC_SITE
  └─ Contact: Rajesh Kumar (9876543210)
  └─ Intent: DIRECT_SALE

Stage 2: ASSIGNED
  └─ Assigned to: Priya (sales manager)
  └─ Status → IN_PROGRESS
  └─ Admin notes: "High priority, ASAP follow-up"

Stage 3: FOLLOW-UP
  └─ Contact date: 2026-07-18 2:00 PM
  └─ Follow-up scheduled: 2026-07-19 10:00 AM
  └─ Notes: "Very interested, send quote"
  └─ Status → CONTACTED

Stage 4: REQUEST CREATION
  └─ ProductRequest created: #567
  └─ Source: PublicLead #1234 (linked)
  └─ Status → READY_TO_CONVERT

Stage 5: APPROVAL
  └─ Request approved: 2026-07-18 3:00 PM
  └─ Invoice created: #890 (DRAFT)
  └─ Amount: ₹25,000
  └─ Status → CONVERTED

Stage 6: FULFILLMENT
  └─ Payment: Received 2026-07-19
  └─ Delivery: Scheduled 2026-07-20
  └─ Delivered: 2026-07-22 ✓
  └─ Status → CLOSED
```

---

## Admin Reporting

### Dashboard Metrics

| Metric | Shows |
|--------|-------|
| **Total Leads** | All public inquiries |
| **New (Unassigned)** | Leads needing assignment |
| **In Progress** | Assigned to staff, waiting follow-up |
| **Converted** | Leads with approved sales |
| **Closed** | Delivered/completed sales |
| **Days to Conversion** | How fast from lead → sale |
| **Conversion Rate** | % of leads → sales |
| **Revenue by Source** | How much from public leads |

---

## Key Admin Actions

### Assign Lead
```
Action: Assign to Staff
Effect: Marks as IN_PROGRESS, staff gets notification
```

### Add Notes
```
Action: Update Admin Notes
Effect: Visible to all team members, searchable
```

### Schedule Follow-Up
```
Action: Create Task
Effect: Sets due date, tracks overdue, staff assigned
```

### Create ProductRequest
```
Action: Click [Create Request] from lead
Effect: Auto-fills prospect snapshot, waits for admin approval
```

### Approve Request
```
Action: Approve ProductRequest
Effect: Creates DRAFT invoice, marks lead CONVERTED
```

### Track Delivery
```
Action: View associated Invoice/DirectSale
Effect: See payment status, delivery status, completion date
```

### Close Lead
```
Action: Mark CLOSED
Effect: Archives lead, shows in conversion reports
```

---

## Searching & Filtering

### Find Leads By:

**Status**
```
?status=NEW                    → Uncontacted
?status=IN_PROGRESS           → Assigned, awaiting follow-up
?status=CONTACTED             → Called/emailed
?status=READY_TO_CONVERT      → Request created
?status=CONVERTED             → Sale approved
```

**Assigned To**
```
?assignee=unassigned          → No owner yet
?assignee={user_id}           → Specific staff member
```

**Intent**
```
?intent=DIRECT_SALE           → One-time purchase
?intent=SUBSCRIPTION          → EMI/recurring
?intent=RENT                  → Rental plan
?intent=LEASE                 → Lease plan
```

**Date Range**
```
?date_from=2026-07-11&date_to=2026-07-18
```

**Keyword Search**
```
?q=rajesh                     → Name, phone, email, city
?q=9876543210                 → Exact phone
?q=home-appliance             → Product name
```

---

## Common Workflows

### Workflow 1: Simple Direct Sale
```
Lead applies → Assign → Call → Create ProductRequest (DIRECT_SALE)
  → Link customer/snapshot → Approve → Create invoice
  → Payment → Delivery → Complete → Lead CLOSED
```

### Workflow 2: EMI Subscription
```
Lead applies → Assign → Call → Create ProductRequest (ADVANCE_EMI)
  → Link customer → Select batch → Approve → Create subscription
  → Payment → Delivery → EMI starts → Lead CLOSED
```

### Workflow 3: Self-Service (Prospect Registers First)
```
Lead applies → Assign → Call → Prospect registers (self)
  → Creates Customer account → PublicLead.converted_customer set
  → Prospect submits OnlineRequest (quote workflow)
  → Admin quotes → Customer accepts → Admin approves
  → Creates subscription/sale → Lead CLOSED
```

---

## Data That Admins See

### Lead Card
- Name, Phone
- Product interested in
- When applied
- Current status
- Assigned to whom
- Conversion progress

### Lead Detail Page
- **Snapshot**: Name, phone, email, city, product, intent, applied date
- **Admin Actions**: Assign, notes, follow-up tasks, opportunities
- **Conversion Timeline**: Track each step from apply → closed
- **CRM Party**: All interactions, follow-ups, calls, emails
- **Linked Requests**: ProductRequest/OnlineRequest IDs
- **Linked Sale**: Invoice/DirectSale ID
- **Fulfillment Status**: Payment, delivery, completion date

---

## Key Fields Admins Can Edit

| Field | Editable | How |
|-------|----------|-----|
| Status | Yes | Via status buttons (CONTACTED, INTERESTED, etc.) |
| Assigned To | Yes | Click [Assign] button |
| Admin Notes | Yes | Text field with save |
| Follow-Up Date | Yes | Schedule task |
| Follow-Up Notes | Yes | Task description |
| Opportunities | Yes | Create/update opportunities |
| (Not editable) | — | Name, phone, email, product, intent (original data) |

---

## Tips for Admins

### ✅ DO:
- Review new leads daily
- Assign to specific staff (not generic)
- Add detailed follow-up notes for handoffs
- Schedule follow-up tasks with due dates
- Track conversion progress on detail page
- Use CRM Party to see all interactions
- Archive/close leads after fulfillment
- Use filters to find specific lead cohorts

### ❌ DON'T:
- Leave leads unassigned for long
- Forget to update status as things progress
- Create multiple ProductRequests for same lead
- Skip adding admin notes (context gets lost)
- Delete leads (archive instead)
- Ignore overdue follow-ups

---

## Quick Stats Dashboard

Admin can view:
```
Today's Activity:
  • New leads: 15
  • Assigned: 12
  • Converted: 3
  • Closed: 2

This Week:
  • Total leads: 87
  • Conversion rate: 12%
  • Revenue: ₹2,15,000
  • Avg days to conversion: 4.2 days

By Staff Member:
  • Priya: 28 leads, 5 converted
  • Rahul: 22 leads, 2 converted
  • Sanjay: 37 leads, 8 converted
```

---

## Keyboard Shortcuts (If Available)

| Shortcut | Action |
|----------|--------|
| `A` | Assign lead |
| `N` | Add notes |
| `F` | Create follow-up task |
| `C` | Create ProductRequest |
| `S` | Change status |
| `P` | View CRM Party |
| `Esc` | Close modal |

---

## Error Prevention

### What Happens If:

| Scenario | What System Does |
|----------|------------------|
| Lead unassigned for 3 days | Follow-up task marked OVERDUE (red flag) |
| ProductRequest not approved | Sale not created, lead stuck in READY_TO_CONVERT |
| Invoice created but not paid | Shows in unpaid invoice list |
| Delivery not marked | Revenue not recognized as complete |
| Lead status not updated | Appears in wrong filter group |

---

## Integration Points

### Lead → Customer Registration
```
When prospect registers:
  PublicLead.converted_customer = new Customer
  → Can now link ProductRequests with customer account
  → Access full customer profile
```

### Lead → ProductRequest
```
Admin creates request:
  ProductRequest.source_public_lead = PublicLead
  → Ties request back to original inquiry
  → Tracks full conversion path
```

### Lead → DirectSale/Invoice
```
Request approved:
  PublicLead.converted_direct_sale = DirectSale
  → Single source of truth for sale
  → Revenue attribution to original lead
```

### Lead → CRM Party
```
Lead linked to Party:
  All interactions (calls, emails, tasks) tracked at Party level
  → 360° view of prospect engagement
  → Multi-channel interaction history
```

---

## Support

**For help:**
- Hover over any field for tooltip
- Click [?] icon for detailed help
- Contact: CRM Admin team

---

