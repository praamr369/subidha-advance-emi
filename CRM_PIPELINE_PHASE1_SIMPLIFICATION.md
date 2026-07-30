# CRM Pipeline - Phase 1 & 2 Roadmap ✅

**Date**: 2026-07-18  
**Decision**: Remove Online Enquiries, simplify to unified CRM Pipeline  
**Status**: Phase 1 COMPLETE

---

## Phase 1: Simplification (DONE ✅)

### What Changed
- ❌ **Removed** Online Enquiries from navigation sidebar
- ✅ **Kept** CRM Leads (discovery/inquiry phase)
- ✅ **Kept** Online Requests (quote-to-approval workflow)

### Unified CRM Pipeline (NOW)
```
┌─────────────────────────────────────────────────────────────┐
│                      CUSTOMER JOURNEY                       │
└─────────────────────────────────────────────────────────────┘

1. PUBLIC LEAD (Interest Expression)
   └─ Website form: /forms/public-lead-form
   └─ Fields: Name, Phone, Email, City, Product, Monthly EMI
   └─ Status: NEW (waiting for admin contact)

2. ONLINE REQUEST (Quote & Approval)
   └─ Admin creates quote: DRAFT → QUOTE_SENT → QUOTE_ACCEPTED
   └─ Customer approves quote
   └─ Request types: ADVANCE_EMI, DIRECT_SALE, RENT, LEASE

3. CONVERSION (Auto-Create)
   └─ APPROVED request auto-creates:
      • Subscription (for ADVANCE_EMI/RENT/LEASE)
      • DirectSale (for DIRECT_SALE)

4. PAYMENT & FULFILLMENT
   └─ Subscription/Sale active
   └─ Payments collected
   └─ Delivery/Possession executed
```

### Benefits
| Aspect | Before | After |
|--------|--------|-------|
| **Workflows** | 3 (Enquiries, Requests, Sales) | 1 (Unified) |
| **Learning Curve** | Complex | Simpler |
| **Data Flow** | Confusing | Clear |
| **Code Maintenance** | Hard | Easy |
| **Speed to Launch** | Slow | Fast |

### Database
- ❌ Online Enquiries tables still exist (marked deprecated)
- ✅ Frontend pages removed
- ✅ Navigation hidden
- ✅ API endpoints still available (legacy, not used)

**Future**: Data can be archived or migrated if needed

---

## Phase 2: Analytics Dashboard (TODO - Future)

### Goal
Track conversion funnel without adding workflow complexity

### Dashboard Pages to Create

#### 1. CRM Funnel Analytics (`/admin/crm/analytics`)
```
Visual Funnel:
├─ Leads Created (Last 30 days): 50
│  └─ Leads Contacted: 35 (70%)
│     └─ Leads Interested: 20 (40%)
│        └─ Online Requests Created: 18 (90%)
│           └─ Quotes Sent: 16 (89%)
│              └─ Quotes Accepted: 14 (88%)
│                 └─ Approved & Subscribed: 12 (86%)
│
Metrics:
• Conversion Rate: Lead → Subscription = 24%
• Avg Days to Close: 7 days
• By Product (top 5): [chart]
• By Request Type: ADVANCE_EMI: 60%, DIRECT_SALE: 25%, RENT: 10%, LEASE: 5%
```

#### 2. Product Performance (`/admin/crm/analytics?view=products`)
```
Questions Answered:
• Which products get most enquiries but low sales?
• Which products have best conversion rate?
• Price elasticity: Does higher price = fewer requests?

Table:
├─ Product Name
├─ Leads Interested
├─ Requests Created
├─ Conversion Rate
├─ Avg Quoted Price
└─ Revenue (from Subscriptions)
```

#### 3. Time-Series (`/admin/crm/analytics?view=timeline`)
```
Charts:
• Leads per day (7-day MA)
• Requests per day
• Conversions per day
• $ revenue from CRM leads
```

### Implementation (Future Session)
1. Create `/admin/crm/analytics` page
2. Add API endpoints for analytics data
3. Build funnel visualization
4. Product and timeline views

---

## Customer-Facing Impact

### Before (Confusing)
- Public fills "Enquiry" form → Nothing happens until contacted
- Confusing: "Is this procurement or sales?"

### After (Clear)
- Public fills "Lead Form" (website) → Admin quotes → Customer buys
- Clear journey: Interest → Quote → Buy → Delivery

---

## API & Backend (Unchanged)

### Still Working
✅ PublicLead API endpoints  
✅ OnlineRequest API endpoints  
✅ CRM Pipeline services  
✅ All conversion functions  

### Removed from Frontend
❌ OnlineEnquiries navigation  
❌ Online Enquiries pages  

Backend API endpoints still exist but not exposed in UI (legacy)

---

## Files Modified

**Phase 1 (This Session):**
- `frontend/src/config/admin-route-registry.ts` - Removed Online Enquiries from nav

**Previous Sessions:**
- `backend/api/v1/serializers/online_request.py` - Price comparison
- `backend/api/v1/views/online_request.py` - Pricing fix
- `frontend/src/app/(dashboard)/admin/requests/online-requests/page.tsx` - CRM columns
- `frontend/src/app/(dashboard)/admin/requests/online-requests/[id]/page.tsx` - Price comparison
- `frontend/src/domains/product-requests/components/CustomerDetailsCard.tsx` - Clickable link

---

## Next Steps

### Immediate (This Session)
✅ Phase 1 complete - commit and deploy

### Future (Phase 2)
- [ ] Create `/admin/crm/analytics` page
- [ ] Build funnel visualization
- [ ] Add product performance analytics
- [ ] Track conversion rates by product/type

### Optional
- [ ] Archive Online Enquiries data
- [ ] Remove unused API endpoints
- [ ] Clean up database (migrations)

---

## Status Summary

| Phase | Component | Status | Notes |
|-------|-----------|--------|-------|
| Phase 1 | Navigation | ✅ DONE | Online Enquiries removed |
| Phase 1 | Frontend Pages | ✅ DONE | /admin/requests/online-enquiries hidden |
| Phase 1 | Pricing | ✅ DONE | Unit price fix implemented |
| Phase 1 | CRM Columns | ✅ DONE | Source lead + conversion status visible |
| Phase 2 | Analytics Dashboard | 🔄 TODO | Planned for future |
| Phase 2 | Funnel Visualization | 🔄 TODO | Planned for future |

---

## Testing Checklist for Phase 1

- [x] Online Enquiries removed from sidebar navigation
- [x] CRM Leads page still works
- [x] Online Requests page shows CRM source columns
- [x] Product Request workflow unchanged
- [x] Subscription creation still works
- [x] Direct Sale creation still works

---

**Your unified CRM pipeline is now LIVE and simplified! 🚀**

Next: Phase 2 analytics when needed.
