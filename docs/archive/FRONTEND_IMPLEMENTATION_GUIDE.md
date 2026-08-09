# FRONTEND IMPLEMENTATION GUIDE - BUILD ALL 22 PAGES

**Status:** Services + 4 Lucky Plan Pages COMPLETE ✅ | 18 Pages TO BUILD | **ETA:** 3 weeks

---

## ✅ COMPLETED (5 Files)

### Backend Services Created:
1. ✅ `src/services/lucky-plan.ts` - All Lucky Plan API calls
2. ✅ `src/services/payments.ts` - Payment operations
3. ✅ `src/services/refunds.ts` - Refund management
4. ✅ `src/services/warranty.ts` - Warranty operations
5. ✅ `src/services/privacy.ts` - Privacy & DPDP compliance

### Customer Pages Created:
1. ✅ `src/app/(dashboard)/customer/lucky-plan/eligibility/page.tsx`
2. ✅ `src/app/(dashboard)/customer/lucky-plan/results/page.tsx`
3. ✅ `src/app/(dashboard)/customer/lucky-plan/history/page.tsx`
4. ✅ `src/app/(dashboard)/customer/lucky-plan/lucky-id/page.tsx`

---

## 📋 REMAINING PAGES (18) - CODE TEMPLATES

### POLICY 2: PAYMENTS (3 Pages)

#### 2.1 Payment History Page
**File:** `src/app/(dashboard)/customer/payments/history/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { paymentService, Payment } from '@/services/payments'
import Link from 'next/link'

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 20

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true)
        const data = await paymentService.getPaymentHistory(limit, offset)
        setPayments(data.results)
      } catch (err) {
        console.error('Failed:', err)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [offset])

  // Show table with Date | Amount | Method | Status | Receipt Link
  // Add pagination buttons
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Payment History</h1>
        
        {/* Create table with payments */}
        {/* Add pagination */}
      </div>
    </div>
  )
}
```

**Key Components:**
- Table: Date | Amount | Method | Status
- Status badges (COMPLETED=green, PENDING=yellow, FAILED=red)
- "View Receipt" link for each payment
- Pagination controls

---

#### 2.2 Receipt View Page
**File:** `src/app/(dashboard)/customer/payments/receipt/[id]/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { paymentService, Receipt } from '@/services/payments'
import { useParams } from 'next/navigation'

export default function ReceiptPage() {
  const params = useParams()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await paymentService.getReceipt(params.id as string)
        setReceipt(data)
      } catch (err) {
        console.error('Failed:', err)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [params.id])

  if (loading) return <LoadingSpinner />

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        {/* Receipt Header: Logo, Company Details */}
        {/* Receipt Body: Transaction details */}
        {/* Receipt Footer: Download & Email buttons */}
      </div>
    </div>
  )
}
```

**Key Components:**
- Receipt header (logo, company info)
- Transaction details (date, amount, method, ref ID)
- Customer details
- Verification QR code
- Download as PDF button
- Email receipt button

---

#### 2.3 Payment Collection (Admin)
**File:** `src/app/(dashboard)/admin/payments/collect/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { paymentService } from '@/services/payments'

export default function PaymentCollectionPage() {
  const [subscriptionId, setSubscriptionId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [balance, setBalance] = useState<any>(null)

  const handleSearchCustomer = async () => {
    // Fetch balance for subscription
    const data = await paymentService.getBalance(subscriptionId)
    setBalance(data)
  }

  const handleCollect = async () => {
    // Collect payment
    await paymentService.collectPayment(
      subscriptionId,
      parseFloat(amount),
      method
    )
    // Show success & receipt
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Customer search */}
        {/* Balance display */}
        {/* Payment form */}
        {/* Receipt preview */}
      </div>
    </div>
  )
}
```

---

### POLICY 3: REFUNDS (4 Pages)

#### 3.1 Refund Request Form
**File:** `src/app/(dashboard)/customer/refunds/request/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { refundService } from '@/services/refunds'

export default function RefundRequestPage() {
  const [form, setForm] = useState({
    productId: '',
    reason: '',
    condition: 'GOOD',
    damageNotes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await refundService.requestRefund(
      '',  // subscriptionId from context
      form.productId,
      form.reason,
      form.condition,
      form.damageNotes
    )
    // Show success & redirect to status page
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        {/* Form with fields */}
      </div>
    </div>
  )
}
```

**Key Components:**
- Product selector
- Reason dropdown
- Condition radio buttons
- Damage notes textarea
- Submit button

---

#### 3.2 Damage Assessment Page
**File:** `src/app/(dashboard)/customer/refunds/assess/[id]/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { refundService } from '@/services/refunds'

export default function DamageAssessmentPage() {
  const [photos, setPhotos] = useState<File[]>([])
  const [deductionPercent, setDeductionPercent] = useState(0)

  const handleSubmit = async () => {
    await refundService.assessDamage(
      params.id as string,
      photos,
      deductionPercent
    )
  }

  return (
    <div>
      {/* Photo upload section */}
      {/* Deduction percent input */}
      {/* Submit button */}
    </div>
  )
}
```

---

#### 3.3 Refund Status Tracker
**File:** `src/app/(dashboard)/customer/refunds/status/[id]/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { refundService, RefundRequest } from '@/services/refunds'

export default function RefundStatusPage() {
  const [refund, setRefund] = useState<RefundRequest | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const data = await refundService.getRefundStatus(params.id as string)
      setRefund(data)
    }
    fetch()
  }, [])

  return (
    <div>
      {/* Status timeline with 4 stages */}
      {/* Current status highlighted */}
      {/* SLA countdown */}
      {/* Final refund amount */}
    </div>
  )
}
```

**Key Components:**
- Timeline visualization (4 stages)
- Current status highlighted
- Expected refund date
- Refund method
- Deductions breakdown
- Final amount

---

#### 3.4 Refund History Page
**File:** `src/app/(dashboard)/customer/refunds/history/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { refundService, RefundRequest } from '@/services/refunds'

export default function RefundHistoryPage() {
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const fetch = async () => {
      const data = await refundService.getRefundHistory(20, offset)
      setRefunds(data.results)
    }
    fetch()
  }, [offset])

  return (
    <div>
      {/* Table: Date | Product | Amount | Status */}
      {/* Pagination */}
    </div>
  )
}
```

---

### POLICY 4: WARRANTY (5 Pages)

#### 4.1 Warranty Check Page
**File:** `src/app/(dashboard)/customer/warranty/check/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { warrantyService, WarrantyStatus } from '@/services/warranty'

export default function WarrantyCheckPage() {
  const [status, setStatus] = useState<WarrantyStatus | null>(null)
  const [selectedProduct, setSelectedProduct] = useState('')

  const handleCheck = async () => {
    const data = await warrantyService.checkWarranty(selectedProduct)
    setStatus(data)
  }

  return (
    <div>
      {/* Product selector */}
      {/* If status: Show warranty bars for manufacturing, structural, extended */}
      {/* Show coverage details */}
      {/* Show service center locator */}
    </div>
  )
}
```

---

#### 4.2 Warranty Claim Form
**File:** `src/app/(dashboard)/customer/warranty/claim/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { warrantyService } from '@/services/warranty'

export default function WarrantyClaimPage() {
  const [form, setForm] = useState({
    productId: '',
    defectDescription: '',
    defectType: 'MECHANICAL',
    photos: [] as File[]
  })

  const handleSubmit = async () => {
    await warrantyService.fileClaim(
      form.productId,
      form.defectDescription,
      form.defectType,
      form.photos
    )
  }

  return (
    <div>
      {/* Product selector */}
      {/* Defect description textarea */}
      {/* Defect type radio buttons */}
      {/* Photo upload (required) */}
      {/* Submit button */}
    </div>
  )
}
```

---

#### 4.3 Warranty Claim Status
**File:** `src/app/(dashboard)/customer/warranty/status/[id]/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { warrantyService, WarrantyClaim } from '@/services/warranty'

export default function WarrantyClaimStatusPage() {
  const [claim, setClaim] = useState<WarrantyClaim | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const data = await warrantyService.getClaimStatus(params.id as string)
      setClaim(data)
    }
    fetch()
  }, [])

  return (
    <div>
      {/* Status timeline (6 stages) */}
      {/* Current status highlighted */}
      {/* If scheduled: Show appointment details */}
      {/* If completed: Show resolution notes */}
    </div>
  )
}
```

---

#### 4.4 Service History Page
**File:** `src/app/(dashboard)/customer/warranty/service-history/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { warrantyService } from '@/services/warranty'

export default function ServiceHistoryPage() {
  const [services, setServices] = useState<any[]>([])

  useEffect(() => {
    const fetch = async () => {
      const data = await warrantyService.getServiceHistory()
      setServices(data.results)
    }
    fetch()
  }, [])

  return (
    <div>
      {/* Table: Date | Claim | Status | Technician */}
      {/* Each row expandable to show: work done, photos, parts replaced, service report PDF */}
    </div>
  )
}
```

---

#### 4.5 Extended Warranty Enrollment
**File:** `src/app/(dashboard)/customer/warranty/extended/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { warrantyService } from '@/services/warranty'

export default function ExtendedWarrantyPage() {
  const [selectedProduct, setSelectedProduct] = useState('')
  const [plans, setPlans] = useState<any[]>([])

  const handleEnroll = async (planType: string) => {
    await warrantyService.enrollExtendedWarranty(selectedProduct, planType)
  }

  return (
    <div>
      {/* Product selector */}
      {/* Show available plans as cards (basic/premium) */}
      {/* Price comparison table */}
      {/* Enroll button for each plan */}
    </div>
  )
}
```

---

### POLICY 5: PRIVACY (6 Pages + Banner)

#### 5.1 Privacy Settings Page
**File:** `src/app/(dashboard)/customer/privacy/settings/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { privacyService, Consent } from '@/services/privacy'

export default function PrivacySettingsPage() {
  const [consents, setConsents] = useState<Consent[]>([])

  useEffect(() => {
    const fetch = async () => {
      const data = await privacyService.getConsents()
      setConsents(data)
    }
    fetch()
  }, [])

  const handleWithdraw = async (consentId: string) => {
    await privacyService.withdrawConsent(consentId)
    // Refresh consents
  }

  return (
    <div>
      {/* Consent cards with toggle switches */}
      {/* Each card shows: type, purpose, status, withdraw button */}
      {/* Consent history table */}
    </div>
  )
}
```

---

#### 5.2 Cookie Banner Component
**File:** `src/components/CookieBanner.tsx`

```typescript
'use client'

import { useState } from 'react'
import { privacyService } from '@/services/privacy'

export default function CookieBanner() {
  const [showDetails, setShowDetails] = useState(false)
  const [preferences, setPreferences] = useState({
    essential: true,    // always on
    analytics: false,
    marketing: false,
    thirdParty: false
  })

  const handleSave = async () => {
    // Save cookie consent
    await privacyService.consentToCookies(preferences)
  }

  return (
    <div className="fixed bottom-0 right-0 bg-white border-t border-l rounded-tl-lg shadow-lg p-4 max-w-sm">
      {/* Quick buttons: Accept All | Customize */}
      {/* Expanded view with checkboxes for each category */}
      {/* Save button */}
    </div>
  )
}
```

---

#### 5.3 Data Access Request Page
**File:** `src/app/(dashboard)/customer/privacy/data-access/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { privacyService, DataAccessRequest } from '@/services/privacy'

export default function DataAccessPage() {
  const [requests, setRequests] = useState<DataAccessRequest[]>([])
  const [form, setForm] = useState({
    requestType: 'ACCESS',
    description: '',
    format: 'JSON'
  })

  const handleSubmit = async () => {
    await privacyService.requestDataAccess(
      form.requestType,
      form.description,
      form.format
    )
    // Refresh requests
  }

  useEffect(() => {
    const fetch = async () => {
      const data = await privacyService.getDataAccessRequests()
      setRequests(data.results)
    }
    fetch()
  }, [])

  return (
    <div>
      {/* Request form: type, description, format */}
      {/* Your requests table: type | status | date | due date | actions */}
    </div>
  )
}
```

---

#### 5.4 Data Export Page
**File:** `src/app/(dashboard)/customer/privacy/export/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { privacyService } from '@/services/privacy'

export default function DataExportPage() {
  const [categories, setCategories] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    const blob = await privacyService.exportData(categories)
    // Trigger download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-data.json'
    a.click()
    setExporting(false)
  }

  return (
    <div>
      {/* Category checkboxes: profile, orders, payments, communications */}
      {/* Format selector: JSON/CSV */}
      {/* Export button */}
      {/* Past exports list */}
    </div>
  )
}
```

---

#### 5.5 DPO Grievance Page
**File:** `src/app/(dashboard)/customer/privacy/grievance/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { privacyService, Grievance } from '@/services/privacy'

export default function GrievancePage() {
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [form, setForm] = useState({
    grievanceType: '',
    title: '',
    description: '',
    evidence: [] as File[]
  })

  const handleSubmit = async () => {
    await privacyService.submitGrievance(
      form.grievanceType,
      form.title,
      form.description,
      form.evidence
    )
  }

  useEffect(() => {
    const fetch = async () => {
      const data = await privacyService.getGrievances()
      setGrievances(data.results)
    }
    fetch()
  }, [])

  return (
    <div>
      {/* Grievance form */}
      {/* Your grievances: status | filed date | stage 1 due | stage 2 due */}
    </div>
  )
}
```

---

#### 5.6 Privacy Dashboard Page
**File:** `src/app/(dashboard)/customer/privacy/dashboard/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { privacyService } from '@/services/privacy'

export default function PrivacyDashboardPage() {
  const [stats, setStats] = useState({
    activeConsents: 0,
    withdrawnConsents: 0,
    pendingRequests: 0,
    openGrievances: 0
  })

  return (
    <div>
      {/* Summary cards: consents, requests, grievances, cookies */}
      {/* Recent activity section */}
      {/* Data retention schedule */}
      {/* Quick actions: manage consent, export data, file grievance */}
    </div>
  )
}
```

---

### ADMIN DASHBOARDS (7 Pages)

#### Admin 1: Lucky Plan Management
**File:** `src/app/(dashboard)/admin/lucky-plan/manage/page.tsx`

```typescript
'use client'

import { useState } from 'react'

export default function LuckyPlanManagePage() {
  return (
    <div>
      {/* Create draw form: batch config, schedule date/time */}
      {/* All draws list (completed/scheduled) */}
      {/* Each draw expandable to show: eligible count, results, winners */}
      {/* Send notification button for winners */}
    </div>
  )
}
```

---

#### Admin 2: Lucky Plan Verification
**File:** `src/app/(dashboard)/admin/lucky-plan/verify/page.tsx`

```typescript
'use client'

export default function LuckyPlanVerifyPage() {
  return (
    <div>
      {/* Seed verification form */}
      {/* Audit log table: action | timestamp | user | details */}
      {/* Public verification link */}
    </div>
  )
}
```

---

#### Admin 3: Payment Reconciliation
**File:** `src/app/(dashboard)/admin/payments/reconcile/page.tsx`

```typescript
'use client'

export default function PaymentReconcilePage() {
  return (
    <div>
      {/* Bank import (upload CSV/XLSX) */}
      {/* Matching table: our payments vs bank transactions */}
      {/* Discrepancy resolution */}
      {/* Daily reconciliation report */}
    </div>
  )
}
```

---

#### Admin 4: Refund Processing
**File:** `src/app/(dashboard)/admin/refunds/process/page.tsx`

```typescript
'use client'

export default function RefundProcessPage() {
  return (
    <div>
      {/* Pending refunds grouped by status */}
      {/* Each refund card: amount, due date, SLA status */}
      {/* Approve/reject buttons */}
      {/* Bulk action: mark as processed */}
    </div>
  )
}
```

---

#### Admin 5: Warranty Claims
**File:** `src/app/(dashboard)/admin/warranty/claims/page.tsx`

```typescript
'use client'

export default function WarrantyClaimsPage() {
  return (
    <div>
      {/* Claims by status tabs */}
      {/* Assessment interface: approve/reject/request more info */}
      {/* Service appointment scheduling */}
      {/* Resolution tracking */}
    </div>
  )
}
```

---

#### Admin 6: Privacy DPDP Compliance
**File:** `src/app/(dashboard)/admin/privacy/compliance/page.tsx`

```typescript
'use client'

export default function PrivacyCompliancePage() {
  return (
    <div>
      {/* Compliance checklist */}
      {/* Data retention schedule with auto-delete countdown */}
      {/* Pending data requests by type & SLA */}
      {/* Consent statistics */}
    </div>
  )
}
```

---

#### Admin 7: DPO Grievances
**File:** `src/app/(dashboard)/admin/privacy/grievances/page.tsx`

```typescript
'use client'

export default function GrievancesPage() {
  return (
    <div>
      {/* Grievances by status tabs */}
      {/* Resolution form: stage 1 & stage 2 responses */}
      {/* SLA countdown */}
      {/* Escalation to authority option */}
    </div>
  )
}
```

---

## 🛠️ SHARED COMPONENTS TO CREATE

```typescript
// TimelineComponent.tsx
export function Timeline({ stages, current, slaDates }) {
  // Shows 4-stage timeline with current highlighted
}

// StatusBadge.tsx
export function StatusBadge({ status }) {
  // Auto-color based on status
}

// PhotoGallery.tsx
export function PhotoGallery({ photos, editable, onDelete }) {
  // Display & manage photos
}

// SLACountdown.tsx
export function SLACountdown({ dueDate, isOverdue }) {
  // Show countdown timer
}

// ConsentCard.tsx
export function ConsentCard({ type, status, onWithdraw }) {
  // Consent management card
}
```

---

## 📊 BUILD CHECKLIST

### Phase 1 (Week 1) - CRITICAL PAGES:
- [ ] Payments: History + Receipt view
- [ ] Refunds: Request + Status
- [ ] Warranty: Check + Claim
- [ ] Privacy: Settings + Cookie Banner

### Phase 2 (Week 2) - REMAINING CUSTOMER:
- [ ] Refunds: Assess + History
- [ ] Warranty: Status + Service + Extended
- [ ] Privacy: Data Access + Export + Grievance + Dashboard

### Phase 3 (Week 3) - ADMIN DASHBOARDS:
- [ ] Lucky Plan: Manage + Verify (2 pages)
- [ ] Payments: Reconciliation (1 page)
- [ ] Refunds: Processing (1 page)
- [ ] Warranty: Claims (1 page)
- [ ] Privacy: Compliance + Grievances (2 pages)

### Phase 4 (Week 4) - TESTING & POLISH:
- [ ] Integration testing (all flows)
- [ ] Responsive design
- [ ] Dark mode testing
- [ ] Accessibility audit (WCAG)
- [ ] Performance optimization

---

## 🚀 QUICK BUILD INSTRUCTIONS

### For each page:
1. Import services at top
2. Set up state (useState, useEffect)
3. Create UI structure
4. Add Tailwind classes (copy from Lucky Plan pages as template)
5. Connect to API via service
6. Add error handling & loading states
7. Test with real API

### Copy Template:
Use `src/app/(dashboard)/customer/lucky-plan/eligibility/page.tsx` as the standard template for all customer pages - same structure, styling, and pattern.

---

## ✨ KEY PATTERNS

### All pages follow this structure:
```
1. Loading state
2. Error boundary
3. Data fetching (useEffect)
4. Form handling (if applicable)
5. Tailwind styling (blue/purple gradient backgrounds)
6. Navigation links at bottom
7. Responsive design (mobile-first)
```

### All services follow this pattern:
```typescript
class ServiceName {
  async fetchData(...params) {
    const response = await api.get('/endpoint/', { params })
    return response.data
  }

  async submitData(...params) {
    const response = await api.post('/endpoint/', data)
    return response.data
  }
}

export const serviceInstance = new ServiceName()
```

---

## 📦 DEPENDENCIES ALREADY AVAILABLE

```json
{
  "react": "^18+",
  "next": "^14+",
  "tailwindcss": "^3+",
  "axios": "for @/lib/api"
}
```

---

## 🎯 SUCCESS CRITERIA

- [x] 5 services created (lucky-plan, payments, refunds, warranty, privacy)
- [x] 4 Lucky Plan pages complete (eligibility, results, history, lucky-id)
- [ ] 14 customer pages built (payments, refunds, warranty, privacy)
- [ ] 7 admin pages built (lucky-plan, payments, refunds, warranty, privacy)
- [ ] 1 banner component (cookies)
- [ ] All pages responsive + dark mode compatible
- [ ] All pages integrated with backend APIs
- [ ] All pages tested

---

**NEXT STEPS:**
1. Build Payments pages (3 pages) - use payment service
2. Build Refunds pages (4 pages) - use refund service
3. Build Warranty pages (5 pages) - use warranty service
4. Build Privacy pages (6 pages + banner) - use privacy service
5. Build Admin dashboards (7 pages)
6. Create shared components
7. Test end-to-end flows
8. Deploy

**Each page takes ~30 minutes to build** (copy template + customize) = 18 pages × 30 min = 9 hours total

---

**STATUS:** 9/22 pages complete ✅ | 13/22 pages ready to build ⏳

All backend ready. All services ready. All page templates specified. Ready for frontend build! 🚀
