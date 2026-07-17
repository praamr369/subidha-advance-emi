# Backend P1 Implementation Guide
**N+1 Query Optimization & Filter Standardization**

**Status:** Ready for Implementation  
**Created:** 2026-07-16  
**Priority:** P1 (Performance Critical)

---

## Overview

This guide provides the exact pattern for applying pagination, eager loading (N+1 fixes), and filter standardization to all CRM and Requests views.

**Expected Impact:**
- 80%+ reduction in database queries
- 3-5x faster page load times
- Consistent API interface across all endpoints

---

## Pattern 1: Apply Pagination to List Views

### Before (No Pagination)
```python
class AdminLeadListView(APIView):
    def get(self, request):
        queryset = PublicLead.objects.all()
        queryset = _apply_filters(queryset, request)
        results = list(queryset[:200])  # Hard-coded limit
        return Response({
            "count": queryset.count(),
            "results": results,
        })
```

### After (With Pagination)
```python
from rest_framework.viewsets import ReadOnlyModelViewSet
from api.v1.utils.pagination import StandardResultsSetPagination
from api.v1.serializers.admin_leads import AdminLeadListSerializer

class AdminLeadListView(ReadOnlyModelViewSet):
    """List leads with pagination and filtering"""
    queryset = PublicLead.objects.all()
    serializer_class = AdminLeadListSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated, IsAdmin]
    
    def get_queryset(self):
        queryset = self.queryset
        queryset = _apply_filters(queryset, self.request)
        return queryset.order_by("-created_at", "-id")
```

**Usage:**
```
GET /api/v1/admin/leads/?page=1&page_size=25&status=NEW&q=john
GET /api/v1/admin/leads/?page=2
```

**Response:**
```json
{
    "count": 350,
    "next": "http://.../admin/leads/?page=2",
    "previous": null,
    "results": [...]
}
```

---

## Pattern 2: Fix N+1 Queries with Eager Loading

### Problem: N+1 Query Explosion

**Current code:**
```python
leads = PublicLead.objects.all()[:25]
for lead in leads:
    print(lead.product.name)        # 1 DB query per lead (25 queries!)
    print(lead.assigned_to.username)  # 1 DB query per lead (25 queries!)
```

**Result:** 1 lead query + 25 product queries + 25 user queries = **51 queries** for 25 rows

### Solution: Use select_related() and prefetch_related()

**After (Optimized):**
```python
def _lead_queryset():
    """Eager load all related objects"""
    return (
        PublicLead.objects
        .select_related(           # For ForeignKey/OneToOneField
            "product",
            "assigned_to",
            "converted_customer",
            "converted_subscription",
            "converted_direct_sale",
            "converted_by",
        )
        .prefetch_related(         # For ManyToManyField/reverse FK
            "crm_pipeline_lead",
        )
        .order_by("-created_at", "-id")
    )
```

**Result:** 1 lead query + 1 product query + 1 user query = **3 queries total** ✅ (94% reduction)

### Common select_related() Examples

| Relationship | Code | When to Use |
|---|---|---|
| ForeignKey | `select_related("author")` | Always (safe, efficient) |
| OneToOneField | `select_related("profile")` | Always |
| Reverse FK | Use prefetch_related | When accessing plural (interactions__) |
| ManyToMany | Use prefetch_related | Always |
| Reverse M2M | Use prefetch_related | Always |

### When to Use prefetch_related()

```python
# Instead of filter inside select
PartyInteraction.objects.filter(
    status=PartyInteractionStatus.OPEN,
    party_id__in=party_ids,
).values("party_id").annotate(
    open_follow_up_count=Count("id"),
    next_follow_up_at=Min("next_follow_up_at"),
)

# Use prefetch with Q filters for complex logic
from django.db.models import Prefetch, Q

follow_ups = PartyInteraction.objects.filter(
    status=PartyInteractionStatus.OPEN,
)
queryset = PartyMaster.objects.prefetch_related(
    Prefetch("interactions", queryset=follow_ups)
)
```

---

## Pattern 3: Standardize Filters Across All Endpoints

### Standard Filter Parameters

Every list endpoint should support these filters:

| Parameter | Type | Example | Usage |
|---|---|---|---|
| `q` | string | `?q=john` | Full-text search (name, phone, email, etc.) |
| `status` | enum | `?status=NEW` | Filter by status field |
| `created_after` | date | `?created_after=2026-07-01` | Date range start |
| `created_before` | date | `?created_before=2026-07-31` | Date range end |
| `page_size` | int | `?page_size=50` | Custom pagination size (override default) |

### Implementation Template

```python
def _apply_filters(queryset, request):
    """Standardized filter application"""
    
    # Text search - search across multiple fields
    q = (request.query_params.get("q") or "").strip()
    if q:
        queryset = queryset.filter(
            Q(name__icontains=q)
            | Q(phone__icontains=q)
            | Q(email__icontains=q)
            | Q(city__icontains=q)
            # Add domain-specific fields below
        )

    # Status filter - use upper() for consistency
    status = (request.query_params.get("status") or "").strip().upper()
    if status and status in VALID_STATUSES:
        queryset = queryset.filter(status=status)

    # Date range filtering
    created_after = (request.query_params.get("created_after") or "").strip()
    if created_after:
        queryset = queryset.filter(created_at__date__gte=created_after)

    created_before = (request.query_params.get("created_before") or "").strip()
    if created_before:
        queryset = queryset.filter(created_at__date__lte=created_before)

    # Apply domain-specific filters below

    return queryset
```

---

## Pattern 4: Apply to All 8 Views

### CRM Leads Views (backend/api/v1/views/admin_leads.py)

#### 1. AdminLeadListView
```python
from api.v1.utils.pagination import StandardResultsSetPagination

class AdminLeadListView(ReadOnlyModelViewSet):
    queryset = PublicLead.objects
        .select_related('product', 'assigned_to', 'converted_customer', 
                       'converted_subscription', 'converted_direct_sale', 'converted_by')
        .prefetch_related('crm_pipeline_lead')
    serializer_class = AdminLeadListSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        qs = _apply_filters(qs, self.request)
        return qs.order_by("-created_at", "-id")
```

#### 2. AdminFollowUpListView (New)
```python
class AdminFollowUpListView(ReadOnlyModelViewSet):
    queryset = PartyInteraction.objects
        .select_related('party', 'created_by')
    serializer_class = PartyInteractionSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        status = (self.request.query_params.get("status") or "").strip().upper()
        if status in ['OPEN', 'CLOSED']:
            qs = qs.filter(status=status)
        return qs.order_by("next_follow_up_at", "-happened_at", "-id")
```

#### 3. AdminKycListView
```python
class AdminKycListView(ReadOnlyModelViewSet):
    queryset = KycVerification.objects
        .select_related('customer')
    serializer_class = KycVerificationSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        status = (self.request.query_params.get("status") or "").strip().upper()
        if status in ['PENDING', 'VERIFIED', 'REJECTED']:
            qs = qs.filter(status=status)
        return qs.order_by("-created_at", "-id")
```

#### 4. AdminDisputeListView
```python
class AdminDisputeListView(ReadOnlyModelViewSet):
    queryset = Dispute.objects
        .select_related('subscription', 'customer')
    serializer_class = DisputeSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        status = (self.request.query_params.get("status") or "").strip().upper()
        if status in ['OPEN', 'PENDING_REVIEW', 'RESOLVED']:
            qs = qs.filter(status=status)
        return qs.order_by("-created_at", "-id")
```

### Requests Views (backend/api/v1/views/admin_support_requests.py)

#### 5. AdminOnlineEnquiryListView
```python
class AdminOnlineEnquiryListView(ReadOnlyModelViewSet):
    queryset = OnlineEnquiry.objects
        .select_related('customer', 'created_by')
    serializer_class = OnlineEnquirySerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        qs = _apply_filters(qs, self.request)
        return qs.order_by("-created_at", "-id")
```

#### 6. AdminSupportRequestListView
```python
class AdminSupportRequestListView(ReadOnlyModelViewSet):
    queryset = SupportRequest.objects
        .select_related('customer', 'assigned_to', 'created_by')
    serializer_class = SupportRequestSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        qs = _apply_filters(qs, self.request)
        return qs.order_by("-created_at", "-id")
```

#### 7. AdminSubscriptionRequestListView
```python
class AdminSubscriptionRequestListView(ReadOnlyModelViewSet):
    queryset = SubscriptionRequest.objects
        .select_related('customer', 'subscription', 'approved_by')
    serializer_class = SubscriptionRequestSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        status = (self.request.query_params.get("status") or "").strip().upper()
        if status in ['PENDING', 'APPROVED', 'REJECTED']:
            qs = qs.filter(status=status)
        return qs.order_by("-created_at", "-id")
```

#### 8. AdminPartnerPaymentRequestListView
```python
class AdminPartnerPaymentRequestListView(ReadOnlyModelViewSet):
    queryset = PartnerPaymentRequest.objects
        .select_related('partner', 'created_by', 'approved_by')
    serializer_class = PartnerPaymentRequestSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = self.queryset
        status = (self.request.query_params.get("status") or "").strip().upper()
        if status in ['PENDING', 'APPROVED', 'PAID']:
            qs = qs.filter(status=status)
        return qs.order_by("-created_at", "-id")
```

---

## Pattern 5: Integrate with Audit Logging for State Changes

### When to Log

Log these actions:
- Approve/Reject leads
- Update KYC status
- Resolve disputes
- Approve subscription requests
- Mark support requests as resolved

### Implementation

```python
from api.v1.utils.audit_log import (
    log_lead_approval,
    log_kyc_approval,
    log_dispute_resolution,
)

class AdminLeadConversionCompleteView(APIView):
    def post(self, request, pk):
        lead = get_object_or_404(PublicLead, pk=pk)
        
        # ... perform conversion ...
        
        # Log the action
        log_lead_approval(
            actor=request.user,
            lead_id=lead.id,
            reason="Conversion completed",
            request=request
        )
        
        return Response({"status": "success"})
```

---

## Verification Checklist

### After Implementing P1 Changes

- [ ] **Pagination Applied:** All 8 views use StandardResultsSetPagination or LargeResultsSetPagination
- [ ] **Eager Loading:** All views use select_related() and prefetch_related()
- [ ] **Filters Standardized:** All views support q, status, created_after, created_before
- [ ] **Django Debug Toolbar:** Verify queries reduced from 50+ to < 10 per request
- [ ] **Frontend:** Verify pagination works (navigate to page 2, change page_size)
- [ ] **Filters Work:** Test status, date range, and search filters
- [ ] **Performance:** Page load time < 2 seconds even with large datasets
- [ ] **Audit Logging:** State-change endpoints log actions correctly

### Query Verification Script

```python
# In Django shell: python manage.py shell

from django.test.utils import override_settings
from django.db import connection

@override_settings(DEBUG=True)
def check_queries():
    from api.v1.views.admin_leads import AdminLeadListView
    view = AdminLeadListView.as_view({'get': 'list'})
    
    connection.queries.clear()
    request = RequestFactory().get('/admin/leads/?page=1')
    request.user = User.objects.first()
    
    response = view(request)
    print(f"Queries executed: {len(connection.queries)}")
    for i, q in enumerate(connection.queries[:20], 1):
        print(f"{i}. {q['sql'][:100]}")

check_queries()
# Expected: < 10 queries (was 50+ before optimization)
```

---

## Implementation Roadmap

### Day 1: CRM Views
- [ ] Apply pagination to AdminLeadListView
- [ ] Add eager loading to AdminLeadListView
- [ ] Standardize filters

### Day 2: Other CRM Views
- [ ] Apply to FollowUp, KYC, Dispute views (same pattern)

### Day 3: Requests Views
- [ ] Apply pagination to OnlineEnquiry, SupportRequest views
- [ ] Add eager loading
- [ ] Standardize filters

### Day 4: Testing & Verification
- [ ] Test all 8 views with pagination
- [ ] Verify query counts reduced
- [ ] Performance benchmark (before/after)
- [ ] Test all filter combinations

### Day 5: Deployment
- [ ] Deploy to staging
- [ ] Monitor performance
- [ ] Deploy to production
- [ ] Monitor real-world performance

---

## Common Pitfalls to Avoid

1. **Missing prefetch_related()** - Will still cause N+1 for many-to-many
2. **Over-prefetching** - Eager load only what you use
3. **Not handling duplicates** - Use `.distinct()` when filtering on related fields
4. **Inconsistent filters** - Every endpoint should support q, status, date range
5. **Forgetting to paginate** - All list endpoints MUST paginate

---

## Performance Expectations

| Metric | Before P1 | After P1 | Improvement |
|---|---|---|---|
| Page load time | 3-5s | 0.5-1s | 5-10x faster |
| Database queries | 50-200 | 3-8 | 80%+ reduction |
| API response size | 50-200 KB | 25-100 KB | 50% smaller |
| Server load | High | Low | 5x reduction |

---

## Next Steps After P1

Once P1 is complete and tested:
1. **Proceed to P2:** Integrate audit logging calls into state-change endpoints
2. **Proceed to P3:** Refactor 14 frontend pages with unified pattern
3. **Monitor:** Set up performance monitoring dashboard

See `P0_P1_P2_IMPLEMENTATION_STATUS.md` for full roadmap.
