# Unified Workbench Implementation Roadmap

## Current State vs. Target State

### Current State (Fragmented) ❌
```
/admin/crm/leads              → CRM Lead data only
/admin/crm/leads/1            → Lead detail (isolated)
/admin/requests/online-requests → Online enquiries (isolated)
/admin/requests/online-requests/1 → Enquiry detail (isolated)
/admin/requests/product-requests/direct-sale/1 → Product request (isolated)
/admin/billing/invoices       → Invoices (isolated)

Problem: Data scattered, no unified view, manual linking
```

### Target State (Unified) ✅
```
/admin/workbench/customer/{id}     → Everything for this customer
/admin/workbench/request/{id}      → Everything for this request
/admin/workbench/lead/{id}         → Everything for this lead

Benefit: Complete view, auto-linked, single source of truth
```

---

## Phase 1: Backend Infrastructure (Weeks 1-2)

### Create Unified Query Service

**File: `backend/api/v1/services/workbench_service.py`**

```python
def get_customer_workbench(customer_id: int) -> dict:
    """
    Unified view combining:
    - Customer/PublicLead info
    - All online requests
    - CRM lead status
    - All product requests
    - Related invoices/subscriptions
    - Timeline of all events
    """
    
    return {
        "customer": {
            "id": customer_id,
            "name": "Amrita Roy",
            "phone": "9000090000",
            "email": "amrita@example.com",
            "type": "registered" | "lead",
            "status": "active"
        },
        "online_requests": [
            {
                "id": "ORQ-2026-TEST-001",
                "status": "QUOTE_SENT",
                "product": "Ahuja BTA 660",
                "amount": 67500,
                "created_at": "2026-07-18T10:30:00Z"
            }
        ],
        "crm_lead": {
            "id": 1234,
            "stage": "CONTACTED",
            "assigned_to": "Priya",
            "next_follow_up": "2026-07-19T10:00:00Z",
            "notes": "Very interested"
        },
        "product_requests": [
            {
                "id": 1,
                "type": "DIRECT_SALE",
                "status": "SUBMITTED",
                "customer_linked": True,
                "pricing": 67500
            }
        ],
        "invoices": [],  # Will be created on approval
        "timeline": [
            {"event": "Online enquiry created", "time": "..."},
            {"event": "CRM lead created", "time": "..."},
            # ... more events
        ],
        "next_actions": [
            "Approve Product Request",
            "Send Invoice",
            "Collect Payment"
        ]
    }

def update_customer_profile(customer_id: int, updates: dict) -> dict:
    """
    Single edit point that syncs across:
    - Customer record
    - PublicLead (if exists)
    - OnlineRequest (if exists)
    - ProductRequest (if exists)
    - Invoice (if exists)
    """
    # Atomic transaction ensuring all records stay in sync
    pass
```

### Backend API Endpoints

**Endpoint 1: Get Unified Workbench**
```
GET /api/v1/admin/workbench/customer/{customer_id}
Response: Complete unified data structure
Status: ✅ Fast, optimized queries with select_related/prefetch_related
```

**Endpoint 2: Update Customer Profile**
```
POST /api/v1/admin/workbench/customer/{customer_id}/profile
Body: {
  "name": "...",
  "phone": "...",
  "email": "...",
  "address": "..."
}
Result: Atomic update across all linked records
```

**Endpoint 3: Perform Workbench Action**
```
POST /api/v1/admin/workbench/customer/{customer_id}/action
Body: {
  "action": "approve_request" | "reject_request" | "send_invoice",
  "request_id": ...,
  "notes": "..."
}
Result: Coordinated action updating multiple records
```

---

## Phase 2: Frontend Components (Weeks 2-3)

### Component Hierarchy

```
UnifiedWorkbench/
├── Header.tsx
│   ├── CustomerBadge (name, phone, status)
│   ├── StatusIndicator (overall progress)
│   └── ActionButtons (quick access)
│
├── RequestLifecycleTimeline.tsx
│   ├── EnquiryStage.tsx
│   ├── LeadTrackingStage.tsx
│   ├── ProductRequestStage.tsx
│   └── FulfillmentStage.tsx
│
├── QuickActionsPanel.tsx
│   ├── RequestActions.tsx
│   ├── CustomerActions.tsx
│   ├── CrmActions.tsx
│   └── FulfillmentActions.tsx
│
├── LeftSidebar.tsx
│   ├── ProfileSummary.tsx
│   ├── HistorySummary.tsx
│   └── CommunicationLog.tsx
│
├── RightSidebar.tsx
│   ├── RequestDetails.tsx
│   ├── ApprovalNotes.tsx
│   ├── AuditTrail.tsx
│   └── RelatedDocuments.tsx
│
└── BottomPanel.tsx
    └── ExpandableDetails.tsx
```

### Component Responsibilities

**UnifiedWorkbench (Main)**
```typescript
export default function UnifiedWorkbench({ customerId }: Props) {
  const [workbenchData, setWorkbenchData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch unified data
    fetchCustomerWorkbench(customerId);
  }, [customerId]);
  
  return (
    <div className="grid grid-cols-4 gap-6">
      <div className="col-span-3">
        <Header data={workbenchData} />
        <RequestLifecycleTimeline data={workbenchData} />
        <QuickActionsPanel data={workbenchData} />
      </div>
      <div>
        <LeftSidebar data={workbenchData} />
        <RightSidebar data={workbenchData} />
      </div>
    </div>
  );
}
```

**RequestLifecycleTimeline (Key Component)**
```typescript
export default function RequestLifecycleTimeline({ data }: Props) {
  return (
    <div className="space-y-4">
      <EnquiryStage request={data.online_requests[0]} />
      <LeadTrackingStage lead={data.crm_lead} />
      <ProductRequestStage request={data.product_requests[0]} />
      <FulfillmentStage invoice={data.invoices[0]} />
    </div>
  );
}
```

---

## Phase 3: Backend Services (Week 3)

### Service Functions Needed

**1. Workbench Query Service**
```python
# subscriptions/services/workbench_service.py

class WorkbenchService:
    @staticmethod
    def get_customer_workbench(customer_id):
        """Unified customer view"""
        pass
    
    @staticmethod
    def update_customer_atomic(customer_id, updates):
        """Single edit point"""
        pass
    
    @staticmethod
    def perform_workbench_action(customer_id, action, **kwargs):
        """Coordinated actions"""
        pass
```

**2. Atomic Update Service**
```python
@transaction.atomic
def update_customer_profile(customer_id, updates):
    """
    Update customer across all linked records atomically:
    1. Update Customer record
    2. Update PublicLead (if exists)
    3. Update OnlineRequest (if exists)
    4. Update ProductRequest (if exists)
    5. Update Invoice (if exists)
    
    All in one transaction = safe sync
    """
    # Implementation
    pass
```

**3. Action Coordinator Service**
```python
class WorkbenchActionCoordinator:
    @staticmethod
    @transaction.atomic
    def approve_product_request(customer_id, request_id, admin):
        """
        Coordinated approval:
        1. Approve ProductRequest
        2. Create DirectSale/Invoice
        3. Update CRM Lead status
        4. Update OnlineRequest status
        5. Log audit
        6. Send notifications
        """
        pass
```

---

## Phase 4: Integration & Testing (Week 4)

### API Endpoint Tests
```python
# tests/test_workbench.py

def test_get_customer_workbench():
    """Unified data structure returns correctly"""
    pass

def test_update_customer_atomic():
    """All records sync when one edited"""
    pass

def test_approve_request_coordinates_all():
    """Approval updates leads, requests, invoices"""
    pass
```

### Frontend Component Tests
```typescript
// tests/UnifiedWorkbench.test.tsx

test('displays all request stages', () => {
  // Render workbench with mock data
  // Verify all 4 stages visible
});

test('quick action buttons work', () => {
  // Click approve button
  // Verify request approved
  // Verify invoice created
  // Verify timeline updated
});
```

---

## Phase 5: Migration & Rollout (Week 5)

### Feature Flags
```python
# Use feature flags to rollout gradually
FEATURES = {
    "UNIFIED_WORKBENCH_ENABLED": True,
    "UNIFIED_WORKBENCH_PRIMARY": False,  # Show alongside old interface
}
```

### Rollout Plan
```
Week 5, Day 1-2: Beta with admins
├─ Enable for select staff
├─ Gather feedback
└─ Fix issues

Week 5, Day 3-4: Wider rollout
├─ Enable for all staff
├─ Monitor usage
└─ Support questions

Week 5, Day 5+: Replace old interface
├─ Redirect old URLs to workbench
├─ Archive old pages
└─ Training complete
```

---

## URL Migration Strategy

### Redirect Old URLs to Workbench
```
/admin/crm/leads/{id}
  → /admin/workbench/lead/{id}

/admin/requests/online-requests/{id}
  → /admin/workbench/request/{id}

/admin/requests/product-requests/{id}
  → /admin/workbench/request/{id}

/admin/billing/invoices/{id}
  → /admin/workbench/request/{id}
```

---

## Implementation Tasks Checklist

### Backend Tasks
- [ ] Create `workbench_service.py`
- [ ] Create unified query functions
- [ ] Create atomic update service
- [ ] Create action coordinator service
- [ ] Add API endpoints
- [ ] Write tests
- [ ] Deploy to staging
- [ ] Performance testing

### Frontend Tasks
- [ ] Create `UnifiedWorkbench` component
- [ ] Create `RequestLifecycleTimeline` component
- [ ] Create stage components (Enquiry, Lead, Request, Fulfillment)
- [ ] Create `QuickActionsPanel` component
- [ ] Create sidebar components
- [ ] Style responsively
- [ ] Test on mobile/desktop
- [ ] Write component tests

### Integration Tasks
- [ ] Connect frontend to backend
- [ ] Test complete workflows
- [ ] Test data sync
- [ ] Test action coordination
- [ ] Performance optimization
- [ ] Browser testing
- [ ] Accessibility testing

### Rollout Tasks
- [ ] Documentation
- [ ] Staff training
- [ ] Set up feature flags
- [ ] Beta testing
- [ ] Bug fixes
- [ ] Full rollout
- [ ] Monitor metrics
- [ ] Decommission old pages

---

## Success Metrics

Track these after implementation:

```
SPEED:
- Avg time per request: Before 3min → After 1min (66% faster)
- Actions per page view: Before 4 pages → After 1 page (75% fewer)

QUALITY:
- Data sync errors: Before ~5% → After 0%
- Manual corrections needed: Before ~10% → After ~1%

USER SATISFACTION:
- Staff satisfaction: Target 8/10
- Time saved: Target 60% reported
- Error reduction: Target 90%

ADOPTION:
- Daily active users: Track growth
- Features used: Which actions most clicked
- Support tickets: Should decrease by 50%
```

---

## Timeline Summary

```
WEEK 1-2: Backend Infrastructure
├─ Unified queries
├─ Atomic update service
└─ API endpoints

WEEK 2-3: Frontend Components
├─ Main component
├─ Timeline stages
└─ Action panels

WEEK 3: Services & Coordination
├─ Business logic
├─ Action coordinator
└─ Notifications

WEEK 4: Testing & Integration
├─ Unit tests
├─ Integration tests
└─ Performance testing

WEEK 5: Rollout
├─ Beta → All staff
├─ Training
└─ Old UI decommissioned

TOTAL: 5 weeks to complete
EFFORT: 2-3 developers full-time
IMPACT: 60% faster, 90% fewer errors
```

---

## Immediate Action Items (This Week)

For Amrita Roy's case, while we build the workbench:

✅ **Quick Fix Now:**
```
/admin/workbench/customer/amrita-roy (manual view)

1. Online Request: ORQ-2026-TEST-001
   - Status: QUOTE_SENT
   - Action: [View]

2. CRM Lead: #1234
   - Status: CONTACTED
   - Assigned: Priya
   - Action: [View]

3. Product Request: #1
   - Status: SUBMITTED
   - Action: [APPROVE]

4. Next Steps:
   - Approve request
   - Create invoice
   - Send to customer
```

**Instructions for Amrita's Case:**
1. Open `/admin/crm/leads/1` (view lead, see follow-up done)
2. Open `/admin/requests/online-requests` (see enquiry in QUOTE_SENT)
3. Open `/admin/requests/product-requests/direct-sale/1` (approve request)
4. Once approved, navigate to invoices (send to customer)

---

## Next Steps

1. **Approve this architecture** ✓
2. **Start Phase 1** (Backend services)
3. **Keep old interface** working during transition
4. **Build new workbench** gradually
5. **Beta test** with select staff
6. **Full rollout** once confident
7. **Decommission old** pages after adoption

---

**Expected Outcome:**
- Single URL shows everything for a customer
- All data auto-synced
- Complete request lifecycle visible
- 60% faster workflow
- 90% fewer data errors
- Staff much happier

Ready to start? ✅

