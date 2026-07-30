# CRM & Requests Batch Improvement Plan

**Scope:** Complete enterprise modernization of CRM and Requests modules  
**Approach:** Batch refactor with unified workbench pattern + modern UI components  
**Status:** Ready for Implementation  
**Created:** 2026-07-16

---

## Executive Summary

Batch improve **14 frontend pages** across CRM and Requests modules with:
- ✅ Unified enterprise workbench pattern (already proven in profiles)
- ✅ Extended stats calculators (CrmStatsCalculator, RequestsStatsCalculator)
- ✅ Modern UI components (enterprise-grade tables, modals, filters)
- ✅ Consistent navigation and breadcrumbs
- ✅ Backend API gap fixes (identified below)

---

## Phase 1: Pages to Refactor (Frontend)

### CRM Module Pages (9 pages)

#### Hub Page
- **`/admin/crm`** — CRM Workspace hub
  - Current: CrmOperationalWorkspace component with hardcoded cards
  - Improvement: Add stats band with CrmStatsCalculator (leads, parties, customers, support)
  - Pattern: ERPPageShell → CrmStatsCalculator.calculate*Stats()

#### Lead Management (2 pages)
- **`/admin/crm/leads`** — Lead register + enquiry conversion
  - Current: Tab-based UI (pipeline/enquiries), manual form states
  - Improvements:
    - Add header stats: Total Leads, New, Converted, Lost
    - Unified toolbar for search/filter
    - ProfileTable for lead registry
    - Preserve add-lead form as modal
  - Pattern: ERPPageShell + CrmStatsCalculator.calculateLeadsStats()

- **`/admin/crm/pipeline`** — Lead pipeline visualization
  - Current: Funnel visualization with stage breakdown
  - Improvements:
    - Add header stats: Total, Interested, Ready to Convert, KYC Pending
    - Preserve funnel visualization (visual context)
    - Add status breakdown table
  - Pattern: ERPPageShell + CrmStatsCalculator.calculatePipelineStats()

#### Follow-ups & KYC (4 pages)
- **`/admin/crm/follow-ups`** — Follow-up queue
  - Current: List of follow-ups due/overdue
  - Improvements:
    - Add header stats: Total, Due Today, Overdue, Completed
    - ProfileTable for follow-ups
    - ProfileToolbar for filtering by status/date
  - Pattern: ERPPageShell + CrmStatsCalculator.calculateFollowUpsStats()

- **`/admin/crm/kyc`** — KYC verification queue
  - Current: Manual KYC management interface
  - Improvements:
    - Add header stats: Total Customers, Pending, Verified, Expired
    - ProfileTable for KYC register
    - Preserve KYC approval workflow
  - Pattern: ERPPageShell + CrmStatsCalculator.calculateKycStats()

- **`/admin/crm/kyc/reverification-queue`** — KYC renewal queue
  - Current: Sub-queue under KYC
  - Improvements:
    - Add filtered view with reverification-specific stats
    - ProfileTable for renewals due
    - Preserve reverification workflow
  - Pattern: ERPPageShell + filtered KyC stats

- **`/admin/crm/kyc/expiry-notifications`** — KYC expiry alerts
  - Current: Alert list for expiring KYC
  - Improvements:
    - Add header stats: Total Expiring, Days Range, Renewed, Pending
    - ProfileTable for expiry dates
    - ProfileToolbar for date range filtering
  - Pattern: ERPPageShell + CrmStatsCalculator.calculateKycStats()

#### Compliance (2 pages)
- **`/admin/crm/aml`** — AML/compliance checks
  - Current: AML flag management
  - Improvements:
    - Add header stats: Total, Flagged, Reviewed, Cleared
    - ProfileTable for flagged customers
    - ProfileToolbar for filtering by review status
  - Pattern: ERPPageShell + CrmStatsCalculator.calculateAmlStats()

- **`/admin/crm/disputes`** — Dispute management
  - Current: Dispute tracking and resolution
  - Improvements:
    - Add header stats: Total, Open, Pending Review, Resolved
    - ProfileTable for disputes
    - ProfileToolbar for status filtering
    - Preserve dispute workflow/resolution form
  - Pattern: ERPPageShell + CrmStatsCalculator.calculateDisputesStats()

### Requests Module Pages (5 pages)

#### Hub Page
- **`/admin/requests`** — Requests hub
  - Current: Navigation cards for request types
  - Improvement: Add quick stats (pending by type) in header
  - Pattern: Already good structure, enhance with stats

#### Online Enquiries (1 page)
- **`/admin/requests/online-enquiries`** — Public enquiry intake
  - Current: Enquiry list with status tracking
  - Improvements:
    - Add header stats: Total, New, In Progress, Closed
    - ProfileTable for enquiries
    - ProfileToolbar for search/status filter
  - Pattern: ERPPageShell + RequestsStatsCalculator.calculateOnlineEnquiriesStats()

#### Support Requests (1 page)
- **`/admin/requests/support`** — Support ticket queue
  - Current: Support ticket list
  - Improvements:
    - Add header stats: Total, Open, In Progress, Resolved
    - ProfileTable for tickets
    - ProfileToolbar for severity/status filter
  - Pattern: ERPPageShell + RequestsStatsCalculator.calculateSupportRequestsStats()

#### Subscription Requests (1 page)
- **`/admin/requests/subscriptions`** — Subscription approval queue
  - Current: Subscription request approval interface
  - Improvements:
    - Add header stats: Total, Pending Approval, Approved, Rejected
    - ProfileTable for requests
    - ProfileToolbar for filtering
    - Preserve approval workflow
  - Pattern: ERPPageShell + RequestsStatsCalculator.calculateSubscriptionRequestsStats()

#### Partner Requests (1 page)
- **`/admin/partner-payment-requests`** — Partner payment intake
  - Current: Partner payment report intake
  - Improvements:
    - Add header stats: Total, Pending Review, Approved, Rejected
    - ProfileTable for payment reports
    - ProfileToolbar for filtering
  - Pattern: ERPPageShell + RequestsStatsCalculator.calculatePartnerPaymentRequestsStats()

---

## Phase 2: Modern UI Components

### Enterprise-Grade Components to Use/Create

#### Enhanced ProfileTable
```tsx
// Additional features beyond basic implementation
- Inline actions (quick edit, approve, reject)
- Bulk actions (select multiple rows)
- Column sorting/reordering
- Expandable row details
- Export to CSV
- Print view
```

#### Advanced ProfileToolbar
```tsx
// Enhanced features
- Date range picker (for follow-ups, expiry dates)
- Multi-select filters (not just single dropdowns)
- Saved filter presets
- Quick filter shortcuts (e.g., "due today", "overdue")
- Search with autocomplete
```

#### Modal Components
```tsx
// For workflows that need forms
- Unified modal wrapper
- Form validation
- Loading states
- Error handling
- Success notifications
```

#### Status Badge System
```tsx
// Unified status rendering
- Consistent color coding across modules
- Custom status definitions per module
- Hover tooltips for status explanations
```

---

## Phase 3: Backend API Gaps & Fixes

### Identified Gaps

#### 1. **Missing Pagination on Large Lists**
**Pages Affected:**
- `/admin/crm/follow-ups` — no pagination
- `/admin/crm/kyc` — may have pagination but not clear
- `/admin/crm/disputes` — no visible pagination

**Fix Required:**
```python
# backend/api/v1/views/crm.py

class FollowUpListView(ListAPIView):
    queryset = FollowUp.objects.all()
    serializer_class = FollowUpSerializer
    pagination_class = StandardResultsSetPagination  # ← Add
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['status', 'due_date']
    search_fields = ['customer__name', 'notes']
```

#### 2. **Missing Stats Endpoints**
**Need New Backend Endpoints:**

```python
# GET /api/v1/admin/crm/stats/
{
  "leads": {
    "total": 150,
    "new": 23,
    "converted": 45,
    "lost": 82
  },
  "follow_ups": {
    "total": 89,
    "due_today": 12,
    "overdue": 5,
    "completed": 72
  },
  "kyc": {
    "total": 200,
    "pending": 34,
    "verified": 166,
    "expired": 0
  },
  "requests": {
    "online_enquiries": 24,
    "support_tickets": 8,
    "subscription_requests": 12,
    "partner_payments": 3
  }
}
```

#### 3. **Missing Bulk Action Endpoints**
**Need New Endpoints:**
- PATCH `/api/v1/admin/crm/leads/{id}/approve/` — Bulk approve leads
- PATCH `/api/v1/admin/crm/disputes/{id}/resolve/` — Bulk resolve
- PATCH `/api/v1/admin/requests/subscriptions/{id}/approve/` — Bulk approve

#### 4. **Missing Filter/Search Consistency**
**Problem:** Search filters inconsistent across pages
**Fix:**
- Standardize query param names (`q` for search, `status` for status, `created_after` for date ranges)
- Add standard filter backends to all list views
- Document API filter options in OpenAPI schema

#### 5. **Missing Relationship Eager Loading**
**Problem:** N+1 queries on list pages
**Example:**
```python
# Bad (N+1):
FollowUps.objects.all()  # Each row queries customer, lead, etc.

# Good (eager load):
FollowUps.objects.select_related('customer', 'lead').prefetch_related('assignees')
```

**Fix Required in Backend:**
- Audit all list views for N+1 queries
- Add `select_related()` and `prefetch_related()` to querysets
- Use Django Debug Toolbar to verify

#### 6. **Missing Audit Logging**
**Problem:** No audit trail for state changes
**Fix Required:**
- Add audit logging to all approve/reject/resolve endpoints
- Log who made the change, when, and why
- Example:
  ```python
  AuditLog.objects.create(
    action='APPROVE_SUBSCRIPTION_REQUEST',
    actor=request.user,
    resource_type='SubscriptionRequest',
    resource_id=request_id,
    details={'approved_by': request.user.id, 'timestamp': now()}
  )
  ```

---

## Implementation Timeline

### Week 1: Component Creation & Setup
- [x] Create CrmStatsCalculator (DONE)
- [x] Create RequestsStatsCalculator (DONE)
- [ ] Extend ProfileTable with inline actions
- [ ] Create modal wrapper component
- [ ] Update ProfileToolbar with date pickers

### Week 2: CRM Pages Refactor
- [ ] `/admin/crm` — Add stats band
- [ ] `/admin/crm/leads` — Apply unified pattern
- [ ] `/admin/crm/pipeline` — Apply unified pattern
- [ ] `/admin/crm/follow-ups` — Full refactor
- [ ] `/admin/crm/kyc` — Full refactor

### Week 3: CRM Pages Continued + KYC Queues
- [ ] `/admin/crm/kyc/reverification-queue` — Add queue stats
- [ ] `/admin/crm/kyc/expiry-notifications` — Add expiry stats
- [ ] `/admin/crm/aml` — Full refactor
- [ ] `/admin/crm/disputes` — Full refactor

### Week 4: Requests Pages Refactor
- [ ] `/admin/requests` — Enhance with quick stats
- [ ] `/admin/requests/online-enquiries` — Full refactor
- [ ] `/admin/requests/support` — Full refactor
- [ ] `/admin/requests/subscriptions` — Full refactor
- [ ] `/admin/partner-payment-requests` — Full refactor

### Week 5: Backend Fixes
- [ ] Audit and fix pagination across all lists
- [ ] Create stats endpoints
- [ ] Add bulk action endpoints
- [ ] Standardize filters/search
- [ ] Fix N+1 queries
- [ ] Add audit logging

### Week 6: Testing & Deployment
- [ ] Manual verification of all pages
- [ ] Browser testing (desktop, tablet, mobile)
- [ ] API testing
- [ ] Performance testing (load times, pagination)
- [ ] Security review
- [ ] Staging deployment
- [ ] Production deployment

---

## Code Pattern Example

### Before (Current)
```tsx
export default function AdminCrmLeadsPage() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [convertedCount, setConvertedCount] = useState(0);
  // ... 30+ lines of manual state management

  return (
    <ERPPageShell
      title="Leads"
      // NO stats band
    >
      {/* Manual stats rendering */}
      <div className="grid gap-4">
        <Card>{newCount}</Card>
        <Card>{convertedCount}</Card>
      </div>
      {/* Manual table rendering */}
      <DataTable rows={rows} columns={columns} />
    </ERPPageShell>
  );
}
```

### After (Refactored)
```tsx
import { CrmStatsCalculator, ProfileToolbar, ProfileTable } from "@/components/crm-workbench";

export default function AdminCrmLeadsPage() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");

  // Single stats calculation, single source of truth
  const headerStats = useMemo(
    () =>
      CrmStatsCalculator.calculateLeadsStats({
        totalCount: total,
        newCount: rows.filter(r => r.stage === 'NEW').length,
        convertedCount: rows.filter(r => r.stage === 'CONVERTED').length,
        lostCount: rows.filter(r => r.stage === 'LOST').length,
        loading,
      }),
    [total, rows, loading]
  );

  return (
    <ERPPageShell
      stats={headerStats}  // ← Centralized in header
      title="Leads"
    >
      {/* Unified toolbar */}
      <ProfileToolbar
        searchValue={query}
        onSearchChange={setQuery}
        onRefresh={() => loadLeads()}
        filters={[...]}
      />

      {/* Unified table */}
      <ProfileTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
      />
    </ERPPageShell>
  );
}
```

**Key Improvements:**
- ✅ Stats in header (no duplication)
- ✅ Unified toolbar (reusable)
- ✅ Unified table (consistent loading/error states)
- ✅ ~200 lines → ~100 lines (-50%)

---

## File Structure After Refactor

```
frontend/src/components/crm-workbench/
├── ProfileWorkbench.tsx               (Existing)
├── ProfileToolbar.tsx                 (Existing)
├── ProfileTable.tsx                   (Existing)
├── ProfileStatsCalculator.ts          (Existing)
├── CrmStatsCalculator.ts              (NEW)
├── RequestsStatsCalculator.ts         (NEW)
├── ModalWrapper.tsx                   (NEW - for workflows)
├── AdvancedProfileTable.tsx           (NEW - with inline actions)
├── StatusBadges.tsx                   (NEW - unified status rendering)
├── BulkActionBar.tsx                  (NEW - for bulk operations)
└── index.ts                           (Updated exports)

frontend/src/app/(dashboard)/admin/
├── crm/
│   ├── page.tsx                       (REFACTOR: add stats)
│   ├── leads/page.tsx                 (REFACTOR: unified pattern)
│   ├── pipeline/page.tsx              (REFACTOR: unified pattern)
│   ├── follow-ups/page.tsx            (REFACTOR: unified pattern)
│   ├── kyc/page.tsx                   (REFACTOR: unified pattern)
│   ├── kyc/reverification-queue/page.tsx  (REFACTOR: add queue stats)
│   ├── kyc/expiry-notifications/page.tsx  (REFACTOR: add expiry stats)
│   ├── aml/page.tsx                   (REFACTOR: unified pattern)
│   └── disputes/page.tsx              (REFACTOR: unified pattern)
├── requests/
│   ├── page.tsx                       (ENHANCE: add quick stats)
│   ├── online-enquiries/page.tsx      (REFACTOR: unified pattern)
│   ├── support/page.tsx               (REFACTOR: unified pattern)
│   └── subscriptions/page.tsx         (REFACTOR: unified pattern)
└── partner-payment-requests/page.tsx  (REFACTOR: unified pattern)
```

---

## Verification Checklist

### Frontend
- [ ] All 14 pages refactored with unified pattern
- [ ] Stats in header (no body duplication)
- [ ] ProfileToolbar integrated
- [ ] ProfileTable integrated
- [ ] Workflows preserved (forms, modals)
- [ ] TypeScript compilation: 0 errors
- [ ] No breaking changes
- [ ] Responsive design verified (mobile, tablet, desktop)
- [ ] Performance verified (load times, pagination)

### Backend
- [ ] Pagination added to all list endpoints
- [ ] Stats endpoints created
- [ ] Bulk action endpoints created
- [ ] Filters/search standardized
- [ ] N+1 queries fixed
- [ ] Audit logging implemented
- [ ] API documentation updated
- [ ] All endpoints tested

### Integration
- [ ] Frontend calls new backend endpoints
- [ ] Stats load correctly
- [ ] Pagination works end-to-end
- [ ] Filters work end-to-end
- [ ] Bulk actions work end-to-end
- [ ] Error handling works
- [ ] Loading states work

---

## Expected Benefits

### Code Quality
- ✅ 50% average code reduction per page
- ✅ Reusable components (ProfileToolbar, ProfileTable, CrmStatsCalculator)
- ✅ Consistent patterns across 14 pages
- ✅ Better maintainability

### Performance
- ✅ Pagination prevents loading 1000+ rows
- ✅ Bulk operations reduce API calls
- ✅ Eager loading fixes N+1 queries
- ✅ Faster page load times

### User Experience
- ✅ Consistent UI/UX across modules
- ✅ Better filtering and search
- ✅ Clearer data visualization (stats band)
- ✅ Faster response to user actions

### Developer Experience
- ✅ New developers can follow established patterns
- ✅ Less code to review and maintain
- ✅ Easier to add new pages following same pattern
- ✅ Better documentation and examples

---

## Next Steps

1. **Approve plan** — Confirm this approach aligns with architecture goals
2. **Assign implementation** — Divide work across frontend + backend teams
3. **Create subtasks** — Break down into PR-sized chunks
4. **Start Week 1** — Component creation and setup
5. **Track progress** — Weekly sync on implementation status

---

## Contacts & Questions

- **Lead:** Claude Code (AI Assistant)
- **Related Work:** [[project_crm_profile_improvements]], [[project_ui_polish_phases]]
- **Documentation:** See IMPROVEMENTS_SUMMARY.md for component API
