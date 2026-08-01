# Unified Request Lifecycle Workbench

## Problem with Current System
❌ **Fragmented & Complicated:**
- Lead in CRM section
- Request in Requests Hub
- Online enquiry in Online Requests
- Different workflows for same customer
- Data scattered across modules
- Confusing navigation

✅ **Solution: Single Unified Workbench**
- All request types in ONE place
- Complete customer journey visible
- Simplified navigation
- Single source of truth

---

## Unified Workbench Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   REQUEST LIFECYCLE WORKBENCH                       │
│              (Unified Dashboard for All Request Types)              │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SECTION 1: CUSTOMER PROFILE (Quick View)                           │
├─────────────────────────────────────────────────────────────────────┤
│ • Name: Amrita Roy                                                  │
│ • Phone: 9000090000                                                 │
│ • Email: amrita@example.com                                         │
│ • Status: Active Customer                                           │
│ • Total Requests: 1                                                 │
│ • Last Activity: 2026-07-18                                         │
│ [Edit Profile] [View Full Profile] [History]                       │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SECTION 2: REQUEST LIFECYCLE (Unified Timeline)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ Step 1: ENQUIRY ✓ COMPLETED                                         │
│ └─ Source: Online Enquiry (ORQ-2026-TEST-001)                      │
│ └─ Date: Jul 18, 10:30 AM                                           │
│ └─ Type: DIRECT_SALE                                                │
│ └─ Product: Ahuja BTA 660                                           │
│ └─ Amount: ₹67,500.00                                               │
│ └─ Status: QUOTE_SENT                                               │
│                                                                      │
│ Step 2: LEAD TRACKING ✓ IN PROGRESS                                │
│ └─ CRM Lead ID: #1234 (Amrita Roy)                                 │
│ └─ Stage: CONTACTED                                                 │
│ └─ Assigned To: Priya (Sales Manager)                              │
│ └─ Next Follow-up: Jul 19, 10:00 AM                                │
│ └─ Notes: "Very interested, send quote"                            │
│                                                                      │
│ Step 3: PRODUCT REQUEST ⧳ PENDING                                  │
│ └─ Request ID: #1 (Direct Sale)                                    │
│ └─ Status: SUBMITTED                                                │
│ └─ Customer: Linked ✓                                               │
│ └─ Pricing: ₹67,500 (Confirmed)                                    │
│ └─ Action: [Link Customer] [Confirm Pricing] [Approve] [Reject]    │
│                                                                      │
│ Step 4: FULFILLMENT ○ PENDING                                       │
│ └─ Invoice: Not yet created                                         │
│ └─ Payment: Pending                                                 │
│ └─ Delivery: Not scheduled                                          │
│ └─ Status: Awaiting approval                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SECTION 3: QUICK ACTIONS (One-Click Operations)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ REQUEST MANAGEMENT:                                                  │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [View Online Enquiry] [Edit Request] [View Quote]               │ │
│ │ [Approve Request] [Reject Request] [Generate Invoice]           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ CUSTOMER MANAGEMENT:                                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [Edit Profile] [Update Phone] [Update Email]                   │ │
│ │ [View KYC Status] [Update Address]                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ CRM & FOLLOW-UP:                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [View Lead] [Schedule Follow-up] [Add Notes] [Reassign]        │ │
│ │ [Create Opportunity] [View Interactions]                       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ FULFILLMENT:                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [Send Invoice] [Collect Payment] [Schedule Delivery]           │ │
│ │ [Mark Delivered] [Generate Receipt]                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SECTION 4: RELATED DATA (Side Panel)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ LEFT SIDEBAR:                      │  RIGHT SIDEBAR:               │
│ • Customer Account Status          │  • Full Request Details       │
│ • Subscription History             │  • Quote Details              │
│ • Previous Purchases               │  • Approval Notes             │
│ • Payment Methods                  │  • Audit Trail                │
│ • Communication History            │  • Related Documents          │
│                                     │  • Timeline Events            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How It Works: Amrita Roy's Journey

### Current Complicated Flow ❌
```
Amrita applies online
    ↓
Creates PublicLead in CRM
    ↓
Shows up in Online Requests
    ↓
Shows up in Leads section
    ↓
Admin creates ProductRequest in Requests Hub
    ↓
Approves in separate ProductRequest page
    ↓
Scattered data across 3-4 modules
```

### New Unified Flow ✅
```
Amrita applies online
    ↓
UNIFIED WORKBENCH loads ALL her data:
  ├─ Her profile (quick view)
  ├─ Original online enquiry
  ├─ CRM lead status & follow-ups
  ├─ Product request details
  ├─ Approval workflow
  └─ Fulfillment status
    ↓
Admin manages EVERYTHING from ONE screen:
  ├─ View enquiry details
  ├─ Track lead progress
  ├─ Approve/reject request
  ├─ Generate invoice
  ├─ Schedule delivery
  └─ Track completion
    ↓
Single source of truth - complete visibility
```

---

## URL Structure (Simplified)

### Current (Complicated) ❌
- `/admin/crm/leads/1` - View CRM lead
- `/admin/requests/online-requests` - View online request
- `/admin/requests/product-requests/direct-sale/1` - View product request
- `/admin/billing/invoices` - View invoice
- Multiple tabs, multiple views, same customer

### New (Unified) ✅
```
/admin/workbench/customer/{customer_id}
/admin/workbench/request/{request_id}
/admin/workbench/lead/{lead_id}

Example:
/admin/workbench/customer/amrita-roy-9000090000
  └─ Shows everything for this customer
  └─ All requests, all statuses, all actions
  └─ Single page, complete journey
```

---

## Data Model (Unified View)

### What Workbench Displays

```python
class UnifiedWorkbench:
    """Single view combining all request data"""
    
    # Customer Level
    customer: Customer or PublicLead
    customer_profile: {
        name, phone, email, city, address,
        kyc_status, account_status
    }
    
    # Request History
    all_requests: [
        {
            id: "ORQ-2026-TEST-001",
            type: "ONLINE_ENQUIRY",
            status: "QUOTE_SENT",
            created_at: "2026-07-18 10:30"
            details: {
                product, quantity, amount,
                quote_sent_date, quote_expiry
            }
        },
        {
            id: "#1234",
            type: "CRM_LEAD",
            status: "CONTACTED",
            created_at: "2026-07-18 10:31"
            details: {
                assigned_to, stage, follow_ups,
                next_follow_up, notes
            }
        },
        {
            id: "#1",
            type: "PRODUCT_REQUEST",
            status: "SUBMITTED",
            created_at: "2026-07-18 10:32"
            details: {
                request_type, customer_linked,
                pricing, approval_status
            }
        },
        {
            id: "INVOICE-001",
            type: "INVOICE",
            status: "DRAFT",
            created_at: "2026-07-18 15:00"
            details: {
                amount, payment_status, delivery_status
            }
        }
    ]
    
    # Timeline
    timeline: [
        {event: "Online enquiry created", time: "10:30"},
        {event: "CRM lead created", time: "10:31"},
        {event: "Admin contacted customer", time: "14:00"},
        {event: "Product request created", time: "15:00"},
        {event: "Request approved", time: "15:30"},
        {event: "Invoice generated", time: "15:35"}
    ]
    
    # Next Steps
    next_actions: [
        "Send invoice to customer",
        "Collect payment",
        "Schedule delivery"
    ]
```

---

## Workbench Components (Single Page)

### Component Structure
```
UnifiedWorkbench/
├── Header
│   ├── Customer Name & Details
│   ├── Status Badges
│   └── Quick Stats (Total Requests, Last Activity, etc)
│
├── RequestLifecycleTimeline
│   ├── Step 1: Online Enquiry
│   ├── Step 2: CRM Lead Tracking
│   ├── Step 3: Product Request
│   └── Step 4: Fulfillment
│
├── QuickActionsPanel
│   ├── Request Management Buttons
│   ├── Customer Management Buttons
│   ├── CRM & Follow-up Buttons
│   └── Fulfillment Buttons
│
├── LeftSidebar
│   ├── Customer Profile Summary
│   ├── Request History
│   └── Communication Log
│
├── RightSidebar
│   ├── Current Request Details
│   ├── Approval Notes
│   ├── Audit Trail
│   └── Related Documents
│
└── BottomPanel
    └── Expandable Details Section
```

---

## Step-by-Step Workflow: Unified Approach

### STEP 1: Enquiry Received
**What shows in Workbench:**
- Online enquiry card (ORQ-2026-TEST-001)
- Quote details (product, amount, status)
- Customer snapshot (name, phone, email)

**Admin Actions:**
- [View Quote] - See full quote
- [Send Quote] - Send to customer
- [Track Status] - Monitor if customer accepted

### STEP 2: Customer Accepts Quote
**What updates:**
- Online enquiry status → QUOTE_ACCEPTED
- CRM Lead appears → CONTACTED
- Timeline shows contact date
- Follow-up task auto-created

**Admin Actions:**
- [View Lead] - See CRM tracking
- [Schedule Follow-up] - Plan next contact
- [Add Notes] - Record customer feedback

### STEP 3: Admin Creates Product Request
**What changes:**
- ProductRequest card appears
- Customer linking status shown
- Pricing confirmation displayed
- Approval workflow button active

**Admin Actions:**
- [Link Customer] - Link to registered account
- [Confirm Pricing] - Review unit price
- [Approve Request] - Move to fulfillment
- [Reject Request] - Decline with reason

### STEP 4: Request Approved
**What happens:**
- Invoice auto-generated (DRAFT)
- Status updates to APPROVED
- Fulfillment panel activates
- Timeline shows approval

**Admin Actions:**
- [Send Invoice] - Email to customer
- [Track Payment] - Monitor payment
- [Schedule Delivery] - Set delivery date
- [Mark Completed] - Close request

---

## Data Management & Rectification

### SCENARIO: Correct Customer Details for Amrita Roy

**Current (Hard Way) ❌**
1. Go to CRM Leads → Find Amrita
2. Edit name/phone there
3. Go to Online Requests → Find request
4. Check if details match
5. Go to Product Requests → Update there
6. Go to Invoices → Update there
7. Data scattered, hard to sync

**New (Easy Way) ✅**
```
1. Open: /admin/workbench/customer/amrita-roy
2. See: All her data in ONE place
3. Click: [Edit Profile]
4. Update: Name, phone, email, address
5. System: Auto-syncs across all linked records
   ├─ CRM Lead updated
   ├─ Online Request updated
   ├─ Product Request updated
   ├─ Invoice updated
   └─ All in transaction (atomic update)
6. See: All sections immediately reflect changes
7. Done: Complete sync, single source of truth
```

### Data Integrity
```
When you edit customer in Workbench:

BEFORE (Fragmented):
CRM Lead:      Name = "Amrita Roy"      ✓
Online Request: Name = "Amrit Roy"       ✗ (typo)
Product Request: Name = "Amrita Roy"     ✓
Invoice:        Name = "Amrit Roy"       ✗ (typo)
→ Confusion, manual syncing needed

AFTER (Unified):
All linked to: Customer or PublicLead record
Edit once → All update automatically
CRM Lead:      Name = "Amrita Roy"      ✓
Online Request: Name = "Amrita Roy"      ✓
Product Request: Name = "Amrita Roy"     ✓
Invoice:        Name = "Amrita Roy"      ✓
→ Single source of truth, auto-sync
```

---

## Navigation Simplification

### Current (Too Many Sections) ❌
```
Left Sidebar:
├─ Command Center
├─ Profiles & Parties
├─ CRM & Requests (14 items!)
│  ├─ Requests Hub
│  ├─ CRM Workspace
│  ├─ CRM Analytics
│  ├─ Leads
│  ├─ Pipeline
│  ├─ Follow-ups
│  ├─ KYC
│  └─ (More...)
├─ Sales & Contracts
├─ Lucky Plan Control
└─ Accounting
```

### New (Unified) ✅
```
Left Sidebar:
├─ Command Center
├─ Profiles & Parties
├─ REQUEST LIFECYCLE (New!)
│  ├─ Workbench (New - All-in-one)
│  ├─ Leads
│  ├─ Requests
│  └─ Follow-ups
├─ Sales & Contracts
├─ Lucky Plan Control
└─ Accounting
```

---

## Key Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Views Needed** | 4-5 different pages | 1 unified workbench |
| **Data Source** | Scattered across modules | Single source of truth |
| **Navigation** | Complex jumps | Linear, clear flow |
| **Editing** | Manual sync required | Atomic updates |
| **Customer Journey** | Invisible, fragmented | Complete timeline |
| **Action Speed** | Multiple clicks | One-page actions |
| **Error Risk** | High (sync issues) | Low (auto-sync) |
| **Staff Training** | Complicated | Simple |

---

## Implementation Path

### Phase 1: Backend (Week 1)
- [ ] Create unified query combining:
  - Customer/PublicLead
  - Online Enquiry
  - CRM Lead
  - Product Request
  - Invoice
- [ ] Create atomic update service (single edit point)
- [ ] Add endpoints:
  - GET /api/v1/admin/workbench/customer/{id}
  - POST /api/v1/admin/workbench/customer/{id}/update

### Phase 2: Frontend (Week 2)
- [ ] Build UnifiedWorkbench component
- [ ] Build RequestLifecycleTimeline component
- [ ] Build QuickActionsPanel component
- [ ] Integrate customer profile section
- [ ] Add side panels (details, history, audit)

### Phase 3: Polish (Week 3)
- [ ] Add drag-drop for task reordering
- [ ] Add real-time status updates
- [ ] Add bulk actions
- [ ] Mobile responsiveness
- [ ] Performance optimization

---

## Quick Reference: Amrita Roy's Complete Journey (Unified)

**Single URL:** `/admin/workbench/customer/9000090000`

```
┌──────────────────────────────────────────────────────┐
│ AMRITA ROY (9000090000)         Status: Active        │
├──────────────────────────────────────────────────────┤
│                                                      │
│ ENQUIRY STAGE ✓                                      │
│ • Online Request: ORQ-2026-TEST-001                 │
│ • Status: QUOTE_SENT                                 │
│ • Date: Jul 18, 10:30 AM                            │
│ • Amount: ₹67,500                                   │
│ [View Quote] [Resend Quote]                         │
│                                                      │
│ LEAD TRACKING ✓                                      │
│ • CRM Lead: #1234                                   │
│ • Assigned: Priya                                   │
│ • Stage: CONTACTED                                  │
│ • Next Follow-up: Jul 19, 10 AM                    │
│ [Add Notes] [Schedule Task] [Move Stage]            │
│                                                      │
│ REQUEST REVIEW ⧳ PENDING APPROVAL                   │
│ • Product Request: #1                               │
│ • Type: DIRECT_SALE                                 │
│ • Product: Ahuja BTA 660                            │
│ • Price: ₹67,500 ✓                                 │
│ • Customer Linked: YES ✓                            │
│ [APPROVE SALE] [Reject]                             │
│                                                      │
│ FULFILLMENT ○ NOT YET STARTED                       │
│ • Invoice: Pending (auto-creates on approval)      │
│ • Payment: Pending                                  │
│ • Delivery: Pending                                 │
│ (Will activate after approval)                      │
│                                                      │
│ ═════════════════════════════════════════════════   │
│ AUDIT TRAIL:                                        │
│ • 10:30 AM - Online enquiry created                │
│ • 10:31 AM - CRM lead created                      │
│ • 14:00 PM - Lead contacted                        │
│ • 15:00 PM - ProductRequest created                │
│ → Awaiting approval...                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## All Done! The Workbench Brings Together:

✅ **Leads** (CRM) - track at one place  
✅ **Online Enquiries** - see request status  
✅ **Product Requests** - manage approval  
✅ **Subscriptions & Sales** - see fulfillment  
✅ **Customer Data** - edit once, sync everywhere  
✅ **Complete Timeline** - see full journey  

**Result:** From 4-5 confusing modules → 1 clear, unified workbench

---

