# Simplified Workflow Guide: Unified Workbench

## The Problem You're Facing

❌ **Currently:** You're jumping between:
1. Online Requests page
2. CRM Leads page  
3. Product Requests page
4. Invoices page

Same customer, scattered data, confusing!

✅ **Solution:** ONE Unified Workbench showing everything

---

## How to Use: Step-by-Step for Amrita Roy

### STEP 1: Open Workbench
```
Navigate to: /admin/workbench/customer/amrita-roy

OR Search: "Amrita Roy" in main search bar
```

### STEP 2: You See Everything
```
┌─────────────────────────────────────────┐
│ AMRITA ROY (9000090000)                 │
├─────────────────────────────────────────┤
│ ✓ Online Enquiry (ORQ-2026-TEST-001)   │
│ ✓ CRM Lead (#1234)                     │
│ ✓ Product Request (#1)                  │
│ ✓ Invoice (Not yet created)             │
│ ═══════════════════════════════════════ │
│ NEXT ACTION NEEDED:                     │
│ → Approve Product Request               │
│ → This will auto-create Invoice        │
└─────────────────────────────────────────┘
```

### STEP 3: Perform Actions (One-Click)

**ACTION 1: View Online Enquiry**
```
Click: [View Quote]
See: What Amrita asked for
  • Product: Ahuja BTA 660
  • Amount: ₹67,500
  • Type: Direct Sale
  • Quote Status: SENT
```

**ACTION 2: Check CRM Lead**
```
Click: [View Lead]
See: Who's tracking this?
  • Assigned to: Priya
  • Stage: CONTACTED
  • Next Follow-up: Jul 19, 10 AM
  • Notes: "Very interested"
```

**ACTION 3: Approve Product Request**
```
Click: [APPROVE SALE]
System:
  1. Links customer ✓
  2. Confirms pricing ✓
  3. Creates DRAFT invoice ✓
  4. Updates status ✓
  5. Sends notifications ✓
Timeline: ~2 seconds
Result: Ready for fulfillment
```

**ACTION 4: Send Invoice**
```
Click: [Send Invoice]
Choose: Email or SMS
Amrita gets: Invoice link + payment instructions
```

**ACTION 5: Track Payment**
```
See: Payment status automatically
Amrita pays online
Status auto-updates: PAID ✓
```

**ACTION 6: Schedule Delivery**
```
Click: [Schedule Delivery]
Set: Delivery date (Jul 22)
Amrita gets: Delivery notification
Logistics team gets: Delivery task
```

**ACTION 7: Mark Completed**
```
Click: [Mark Completed]
System archives: This customer journey
Revenue recorded: ₹67,500 from Amrita Roy
---

TOTAL TIME: ~10 minutes from enquiry to fulfilled
LOCATIONS VISITED: 1 (Unified Workbench)
```

---

## Complete Workflow at a Glance

### Timeline for Amrita Roy

```
Day 1: Jul 18, 2026
┌─ 10:30 AM: Amrita submits online enquiry
│  └─ System creates: PublicLead + OnlineRequest
│
├─ 10:31 AM: Admin sees notification
│  └─ Opens: /admin/workbench/customer/amrita-roy
│
├─ 11:00 AM: Admin views all data
│  └─ Sees: Enquiry, Lead, Request status
│
├─ 14:00 PM: Admin calls Amrita (via Lead tracking)
│  └─ Confirms: Still interested, wants to proceed
│
├─ 15:00 PM: Admin creates ProductRequest
│  └─ From workbench: One click [Create Request]
│
├─ 15:30 PM: Admin approves request
│  └─ One click: [APPROVE SALE]
│  └─ Invoice auto-creates
│
└─ 16:00 PM: Admin sends invoice
   └─ Amrita receives: Invoice via email

Day 2: Jul 19, 2026
└─ 09:00 AM: Amrita makes payment online
   └─ Status auto-updates: PAID ✓

Day 3-4: Jul 20-21, 2026
└─ Delivery scheduled and processed

Day 5: Jul 22, 2026
└─ Delivered ✓
└─ Request marked CLOSED
└─ Revenue: ₹67,500 credited to Amrita Roy
```

---

## Data Management (Single Edit Point)

### Scenario: Amrita's Phone Number is Wrong

**Current way (BAD)** ❌
```
1. Go to CRM Leads
2. Find Amrita Roy
3. Edit phone: 9000090000 → 9876543210
4. Go to Online Requests
5. Check if it updated there
6. Go to Product Requests
7. Edit it there too
8. Go to Invoices
9. Edit it there as well
10. Hope everything is synced!
```

**Unified way (GOOD)** ✅
```
1. Open Workbench: /admin/workbench/customer/amrita-roy
2. Click: [Edit Profile]
3. Change: Phone number
4. Save: Once
5. System updates:
   ├─ CRM Lead: ✓ Updated
   ├─ Online Request: ✓ Updated
   ├─ Product Request: ✓ Updated
   └─ Invoice: ✓ Updated
6. Done: Complete sync, no manual work
```

---

## Master Checklist: Complete Request Lifecycle

Use this to track Amrita's journey from enquiry to fulfilled:

```
☐ ENQUIRY STAGE
  ☐ Customer submitted online enquiry
  ☐ Quote generated automatically
  ☐ Quote sent to customer
  ☐ Quote status: SENT

☐ LEAD TRACKING
  ☐ CRM Lead created
  ☐ Lead assigned to: Priya
  ☐ Customer contacted
  ☐ Customer confirmed interest
  ☐ Lead status: CONTACTED

☐ REQUEST CREATION
  ☐ ProductRequest created from lead
  ☐ Type confirmed: DIRECT_SALE
  ☐ Product confirmed: Ahuja BTA 660
  ☐ Amount confirmed: ₹67,500

☐ CUSTOMER LINKING
  ☐ Customer linked to ProductRequest
  ☐ All details synced (name, phone, email, address)

☐ PRICING REVIEW
  ☐ Unit price reviewed: ₹67,500
  ☐ No overrides needed
  ☐ Total amount confirmed: ₹67,500

☐ APPROVAL
  ☐ ProductRequest approved
  ☐ Draft invoice created automatically
  ☐ Lead status updated: READY_TO_CONVERT
  ☐ Status updated: CONVERTED

☐ FULFILLMENT
  ☐ Invoice sent to customer
  ☐ Payment link provided
  ☐ Payment received: ✓
  ☐ Delivery scheduled: Jul 22
  ☐ Delivery completed: ✓
  ☐ Receipt issued

☐ CLOSURE
  ☐ Request marked COMPLETED
  ☐ Lead marked CLOSED
  ☐ Revenue recorded: ₹67,500
  ☐ Customer archived
```

---

## Quick Reference: What Goes Where

### In Unified Workbench, You'll See:

**Top Section (Customer Profile)**
```
Name: Amrita Roy
Phone: 9000090000
Email: amrita@example.com
City: Mumbai
Status: Active
Registration: Self-registered online
```

**Main Section (Request Lifecycle)**
```
STEP 1: ENQUIRY
├─ Online Request ID: ORQ-2026-TEST-001
├─ Date Created: Jul 18, 10:30 AM
├─ Status: QUOTE_SENT
├─ Product: Ahuja BTA 660
├─ Amount: ₹67,500
└─ [View Quote Details]

STEP 2: LEAD TRACKING
├─ CRM Lead ID: #1234
├─ Assigned To: Priya (Sales Manager)
├─ Stage: CONTACTED
├─ Next Follow-up: Jul 19, 10 AM
├─ Last Contact: Jul 18, 2:00 PM
└─ [Add Notes] [Schedule Follow-up] [Move Stage]

STEP 3: PRODUCT REQUEST
├─ Request ID: #1
├─ Status: SUBMITTED → Awaiting Approval
├─ Type: DIRECT_SALE
├─ Customer Linked: YES ✓
├─ Pricing: ₹67,500 (Confirmed)
├─ Approval Status: Pending
└─ [APPROVE SALE] [Reject] [Edit]

STEP 4: FULFILLMENT
├─ Invoice Status: Not Yet Created
├─ Payment Status: Awaiting Invoice
├─ Delivery Status: Not Scheduled
├─ Timeline: Will auto-create on approval
└─ (Available after approval)
```

**Right Sidebar (Quick Info)**
```
REQUEST SUMMARY:
• Total Amount: ₹67,500
• Payment Terms: Online transfer
• Tax Applied: 18% GST
• Quote Valid Till: Jul 25, 2026

AUDIT TRAIL:
• Jul 18, 10:30 - Enquiry created
• Jul 18, 10:31 - Lead created
• Jul 18, 14:00 - Customer contacted
• Jul 18, 15:00 - Request created
• Awaiting approval...

RELATED RECORDS:
• Online Request: ORQ-2026-TEST-001
• CRM Lead: #1234
• Product Request: #1
• (Invoice will appear after approval)
```

---

## Button Reference: What Each Button Does

### ENQUIRY BUTTONS
- **[View Quote]** → See detailed quote
- **[Resend Quote]** → Send quote again to customer
- **[Accept Quote]** → Mark as accepted (if manual)

### LEAD BUTTONS
- **[View Lead]** → Open full CRM lead page
- **[Add Notes]** → Add follow-up notes (visible to all staff)
- **[Schedule Follow-up]** → Create task with due date
- **[Move Stage]** → Move lead in sales pipeline (NEW → CONTACTED → etc)
- **[Reassign]** → Give to another sales person

### REQUEST BUTTONS
- **[Link Customer]** → Connect to registered customer (or use snapshot)
- **[Confirm Pricing]** → Review/override unit price
- **[APPROVE SALE]** → Approve & create invoice (GREEN button)
- **[Reject]** → Decline with reason (RED button)
- **[Edit]** → Change customer details or notes

### FULFILLMENT BUTTONS
- **[Send Invoice]** → Email invoice to customer
- **[Track Payment]** → Monitor payment status
- **[Schedule Delivery]** → Set delivery date
- **[Mark Delivered]** → Confirm delivery
- **[View Receipt]** → See payment receipt
- **[Mark Completed]** → Close request

---

## Common Mistakes to Avoid

❌ **Mistake 1: Jumping Between Pages**
```
WRONG: Click online request → click lead → click product request
RIGHT: One workbench shows all
```

❌ **Mistake 2: Updating Data in Multiple Places**
```
WRONG: Edit phone in CRM, then edit in Product Request, then in Invoice
RIGHT: Edit once in workbench, auto-syncs everywhere
```

❌ **Mistake 3: Creating Duplicate Requests**
```
WRONG: Create ProductRequest twice for same online enquiry
RIGHT: Create once from workbench, system links automatically
```

❌ **Mistake 4: Forgetting to Update Status**
```
WRONG: Approve request but forget to update lead stage
RIGHT: Workbench auto-updates all linked records
```

❌ **Mistake 5: Losing Customer Data**
```
WRONG: Manual entry → typos → mismatch across modules
RIGHT: Workbench maintains single source of truth
```

---

## Time Savings

### Before (Fragmented) ❌
```
Open online request page: 5 sec
Search for Amrita: 10 sec
Read enquiry details: 30 sec
Navigate to leads: 5 sec
Search for Amrita's lead: 10 sec
Read lead status: 30 sec
Navigate to product requests: 5 sec
Search for request: 10 sec
View/approve request: 60 sec
Navigate to invoices: 5 sec
Check invoice: 30 sec
Send invoice: 30 sec
──────────────────────────
TOTAL: ~200 seconds (3+ minutes)
```

### After (Unified) ✅
```
Open workbench: 5 sec
Search/navigate: 2 sec
See everything: 0 sec (all visible)
Review all data: 30 sec
Click approve: 5 sec
Auto-create invoice: 2 sec
Send invoice: 30 sec
──────────────────────────
TOTAL: ~75 seconds (1.25 minutes)
```

**TIME SAVED: ~125 seconds per request (60% faster)**

---

## Summary: One Workbench, Complete Control

```
OLD WAY (Complicated):
📍 Location 1: Online Requests
  ├─ Find ORQ-2026-TEST-001
  └─ See quote status
📍 Location 2: CRM Leads  
  ├─ Find Lead #1234
  └─ See follow-up status
📍 Location 3: Product Requests
  ├─ Find Request #1
  └─ Approve/reject
📍 Location 4: Invoices
  ├─ Find Invoice
  └─ Send to customer
RESULT: 4 locations, confusing, time-consuming

NEW WAY (Simple):
📍 Unified Workbench
  ├─ All data visible
  ├─ All actions available
  ├─ Auto-synced
  └─ One-click operations
RESULT: 1 location, clear, fast, accurate
```

---

**Start using Unified Workbench today!**

Navigate to: `/admin/workbench/customer/{customer_id}`

Everything you need, in one place.

