# Product Request Workbench Refactor - Comprehensive Implementation

**Status**: Phase 1 Complete, Phase 2+ In Progress  
**Date**: 2026-07-17

## What Has Been Implemented

### ✅ Backend Enhancements (Complete)

**File**: `backend/subscriptions/services/product_request_service.py`

1. **Pricing Override Support in `approve_product_request_for_admin()`**
   - Added `pricing_override` parameter (dict) to approval function
   - DIRECT_SALE: Supports `unit_price` override
   - RENT: Supports `monthly_rent_amount` override
   - LEASE: Supports `monthly_lease_amount` override
   - Gracefully falls back to product defaults if not provided

2. **New Helper Functions**
   - `get_product_pricing_info()` - Returns default pricing for RENT/LEASE
   - `get_product_stock_status()` - Enhanced stock check for DIRECT_SALE
   - `validate_product_request_step()` - Type-specific workflow validation

### ✅ Frontend Type System (Complete)

**File**: `frontend/src/services/product-requests-types.ts`

- Unified workflow definitions for all 4 request types
- Step progression logic (link_customer → select_batch → pricing → review → approve)
- Type-specific workflow sequences:
  - **DIRECT_SALE**: 4 steps (link_customer, pricing, review, approve)
  - **ADVANCE_EMI**: 4 steps (link_customer, select_batch, review, approve)
  - **RENT**: 4 steps (link_customer, pricing, review, approve)
  - **LEASE**: 4 steps (link_customer, pricing, review, approve)

### ✅ DIRECT_SALE Workbench Page (Complete)

**Path**: `frontend/src/app/(dashboard)/admin/requests/product-requests/direct-sale/[id]/page.tsx`

**Features**:
- ✅ Step-by-step workflow (Customer → Pricing → Review → Approve)
- ✅ Customer search & linking
- ✅ Unit price review & override
- ✅ Invoice total display
- ✅ Simple 3-step UI (no batch/lucky number clutter)
- ✅ Pricing override sent to backend on approval
- ✅ Reject with reason
- ✅ Status-based view (submitted vs. finalized)
- ✅ Link to approved invoice

**UX Benefits Over Unified Page**:
- No irrelevant batch/lucky number fields
- Clear pricing focus
- Simpler approval flow (easier for operators)
- Type-specific labels & descriptions

---

## What Remains To Implement

### Phase 2: EMI, RENT, LEASE Pages (Ready to Build)

#### 2a. ADVANCE_EMI Workbench Page
**Path**: `frontend/src/app/(dashboard)/admin/requests/product-requests/advance-emi/[id]/page.tsx`

**Unique Steps**:
1. **Link Customer** - Same as DIRECT_SALE
2. **Select Batch** - Choose batch with available lucky numbers
   - Show batch code, duration, pricing
   - Display available lucky numbers in grid
   - Allow override via dropdown
3. **Review** - Show selected batch, lucky number, tenure
4. **Approve** - Create EMI subscription with selected lucky number

**Components Needed**:
- Batch selector with lucky number grid
- Batch details card
- Tenure display

**Estimated LOC**: 400-500 lines

#### 2b. RENT Workbench Page
**Path**: `frontend/src/app/(dashboard)/admin/requests/product-requests/rent/[id]/page.tsx`

**Unique Steps**:
1. **Link Customer** - Same
2. **Set Pricing** - Monthly rent amount
   - Show product.base_price
   - Default: base_price / 12
   - Allow override for negotiated rates
3. **Set Tenure** - Default 12 months, allow override
4. **Review & Approve** - Show total rental cost

**Components Needed**:
- Monthly rent input
- Tenure selector
- Total cost calculator

**Estimated LOC**: 350-400 lines

#### 2c. LEASE Workbench Page
**Path**: `frontend/src/app/(dashboard)/admin/requests/product-requests/lease/[id]/page.tsx`

**Unique Steps**:
1. **Link Customer**
2. **Set Pricing** - Monthly lease amount
   - Default: base_price / 24
   - Allow override
3. **Set Tenure** - Default 24 months, allow override
4. **Review & Approve** - Show total lease cost

**Components Needed**:
- Monthly lease input
- Tenure selector
- Total cost calculator

**Estimated LOC**: 350-400 lines

### Phase 3: Update Product Requests List Page

**Current Path**: `frontend/src/app/(dashboard)/admin/requests/product-requests/page.tsx`

**Changes Needed**:
1. Add type-specific links (column in table with links to correct workbench)
2. Add type filter
3. Highlight by request type (color-coded badges)
4. Quick actions that route to correct workbench

**Estimated LOC**: 100-150 line changes

### Phase 4: Shared Components Library

**Path**: `frontend/src/domains/product-requests/components/`

**Components to Extract**:
- `StepIndicator.tsx` - Visual progress through workflow steps
- `CustomerLinkSection.tsx` - Reusable customer search/selection
- `PricingSection.tsx` - Reusable pricing input
- `ReviewSection.tsx` - Reusable review form

**Benefits**:
- DRY principle - reduces duplication across 4 pages
- Consistent UX across all request types
- Easier to maintain and update

**Estimated LOC**: 200-300 lines total

---

## Architecture Improvements

### Before (Current Unified Page)
```
Product Request Detail Page
├── ProductRequestCard (request overview)
├── Customer Search (if no customer linked)
│   ├── Search input
│   ├── Customer dropdown
│   └── Snapshot info
├── Lucky Number Override (even for DIRECT_SALE!)
├── Review Note
├── Reject Reason
└── Approve / Reject Buttons
```

**Problems**:
- DIRECT_SALE shows batch/lucky fields (irrelevant)
- EMI doesn't show batch selection clearly
- No pricing input for RENT/LEASE
- No pricing override for DIRECT_SALE
- Confusing for operators - unclear which fields matter for their type

### After (Type-Specific Pages)
```
DIRECT_SALE Page          | EMI Page              | RENT Page
├── ProductRequestCard    | ├── ProductRequestCard| ├── ProductRequestCard
├── Step 1: Customer      | ├── Step 1: Customer  | ├── Step 1: Customer
├── Step 2: Pricing       | ├── Step 2: Batch     | ├── Step 2: Pricing
│   └── Unit Price Input  | │   ├── Batch Grid    | │   ├── Monthly Rent
├── Step 3: Review        | │   └── Lucky Numbers | │   └── Tenure
│   ├── Invoice Total     | ├── Step 3: Review    | ├── Step 3: Review
│   └── Review Note       | │   ├── Batch Details | │   └── Total Cost
└── Approve / Reject      | │   └── Review Note   | └── Approve / Reject
                          | └── Approve / Reject
```

**Benefits**:
- Clear, focused workflow for each type
- Relevant fields only
- Less cognitive load for operators
- Easier to understand what's required
- Type-specific validation

---

## API Contract

### Updated Approval Endpoint

```
POST /api/v1/admin/product-requests/{id}/approve/

Request Body:
{
  "decision": "APPROVE",
  "customer_id": 123,  // if needed
  "resolution_mode": "existing",
  "review_note": "Approved as per customer request",
  "pricing_override": {
    // DIRECT_SALE:
    "unit_price": 50000,
    
    // RENT:
    "monthly_rent_amount": 4000,
    
    // LEASE:
    "monthly_lease_amount": 2000
  }
}

Response:
{
  "id": 1,
  "status": "APPROVED",
  "approved_subscription_id": 123,  // EMI/RENT/LEASE
  "approved_direct_sale_id": 456,   // DIRECT_SALE
  "approved_at": "2026-07-17T...",
  "approved_by": "admin@example.com"
}
```

---

## Testing Strategy

### Backend (Django Tests)

```python
# tests/api/test_product_request_workbench.py

def test_direct_sale_approval_with_pricing_override():
    """Verify pricing override is applied to draft invoice"""
    
def test_emi_approval_creates_subscription_with_lucky_number():
    """Verify EMI creates subscription with correct lucky number"""
    
def test_rent_approval_with_custom_monthly_rent():
    """Verify RENT subscription uses overridden monthly amount"""
    
def test_lease_approval_with_custom_monthly_lease():
    """Verify LEASE subscription uses overridden monthly amount"""
```

### Frontend (Next.js Tests)

```typescript
// __tests__/direct-sale-workbench.test.tsx

test("DIRECT_SALE: shows pricing step", () => {...})
test("DIRECT_SALE: allows unit price override", () => {...})
test("DIRECT_SALE: sends pricing_override to API", () => {...})

// __tests__/emi-workbench.test.tsx
test("EMI: shows batch selection", () => {...})
test("EMI: shows lucky number grid", () => {...})
test("EMI: allows lucky number override", () => {...})
```

---

## Rollout Plan

### Week 1: Deploy Backend
1. Merge backend enhancements
2. Deploy `product_request_service.py` changes
3. Update API contract docs

### Week 2: Deploy DIRECT_SALE Frontend
1. Deploy `direct-sale/[id]/page.tsx`
2. Deploy type system utilities
3. Update main list page to link to workbenches

### Week 3: Deploy EMI/RENT/LEASE Frontends
1. Deploy all 3 remaining workbench pages
2. Deploy shared components
3. Full rollout testing

### Week 4: Cleanup & Refinement
1. Monitor usage & metrics
2. Gather operator feedback
3. Minor UX tweaks
4. Archive unified page (or remove if not needed)

---

## Performance Considerations

### Data Fetching
- Batch info pre-loaded with request data ✅
- Lucky numbers lazy-loaded after batch selected
- Stock info lazy-loaded for DIRECT_SALE
- Pricing info in request detail

### Rendering
- Step components lazy-loaded
- No unnecessary re-renders (useState organized by step)
- Memoized customer selector

### UX Responsiveness
- Approval action gives immediate visual feedback
- Error messages clear & actionable
- No unnecessary API calls

---

## Success Metrics

After deployment, monitor:
1. **Operator efficiency**: Time to approve per request type
2. **Error rate**: Failed approvals due to user confusion
3. **Adoption**: % of requests approved via workbench vs. legacy
4. **Support tickets**: Reduction in "how do I use this?" questions

**Goals**:
- 20% reduction in approval time for DIRECT_SALE
- 0 failed approvals due to "wrong fields filled"
- 100% adoption within 2 weeks
- 50% reduction in support tickets

---

## Files Summary

### Created ✅
- `backend/subscriptions/services/product_request_service.py` (enhanced)
- `frontend/src/services/product-requests-types.ts` (new)
- `frontend/src/app/(dashboard)/admin/requests/product-requests/direct-sale/[id]/page.tsx` (new)

### To Create (Phase 2-4)
- `frontend/src/app/(dashboard)/admin/requests/product-requests/advance-emi/[id]/page.tsx`
- `frontend/src/app/(dashboard)/admin/requests/product-requests/rent/[id]/page.tsx`
- `frontend/src/app/(dashboard)/admin/requests/product-requests/lease/[id]/page.tsx`
- `frontend/src/domains/product-requests/components/StepIndicator.tsx`
- `frontend/src/domains/product-requests/components/CustomerLinkSection.tsx`
- `frontend/src/domains/product-requests/components/PricingSection.tsx`
- `frontend/src/domains/product-requests/components/ReviewSection.tsx`
- Updated: `frontend/src/app/(dashboard)/admin/requests/product-requests/page.tsx`

### Files Not Changed
- Existing product request list endpoint (works as-is)
- Existing unified detail page (can remain as fallback)
- Approval endpoint (enhanced to support overrides, backward compatible)

---

## Total Implementation Estimate

| Phase | Component | LOC | Time |
|-------|-----------|-----|------|
| 1 | Backend enhancements | 150 | ✅ Done |
| 1 | Type system | 100 | ✅ Done |
| 1 | DIRECT_SALE page | 400 | ✅ Done |
| 2 | EMI page | 500 | ~2 hrs |
| 2 | RENT page | 400 | ~1.5 hrs |
| 2 | LEASE page | 400 | ~1.5 hrs |
| 3 | Shared components | 300 | ~2 hrs |
| 3 | List page updates | 150 | ~1 hr |
| 4 | Tests | 400 | ~3 hrs |
| **Total** | | **2,800** | **~12 hrs** |

---

## Next Steps

Would you like me to continue with:
1. **Phase 2A**: EMI workbench page (batch + lucky number selection)
2. **Phase 2B+**: RENT & LEASE workbench pages  
3. **Phase 3**: Shared components & list page updates
4. **All remaining phases** at once

Choose your preferred path forward! 🚀
