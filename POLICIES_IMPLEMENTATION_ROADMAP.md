# 6 POLICIES IMPLEMENTATION ROADMAP - COMPLETE

**Status:** In Progress | **Target:** Production Ready | **Date:** 10-Jul-2026

---

## POLICY MATRIX (6 Policies)

| # | Policy | Backend Status | Frontend Status | Gaps | Priority |
|---|--------|---|---|---|---|
| 1 | **Lucky Plan Draw** | ✅ 95% | ⏳ 0% | TDS (deferred) | HIGH |
| 2 | **Payment Terms** | ⚠️ 50% | ⏳ 0% | GST, late charges, gateway fees, refunds | CRITICAL |
| 3 | **Refund & Cancellation** | ✅ 80% | ⏳ 0% | Damage assessment, refund processing timeline | HIGH |
| 4 | **EMI & Defaults** | ⚠️ 30% | ⏳ 0% | Grace period, late charges, NPA, credit bureau | CRITICAL |
| 5 | **Warranty & Service** | ✅ 100% | ⏳ 0% | All implemented | MEDIUM |
| 6 | **Privacy & Protection** | ✅ 100% | ⏳ 0% | All implemented | MEDIUM |

---

## POLICY 1: LUCKY PLAN DRAW (v2.0)

### ✅ BACKEND (95% Complete)
- ✓ Cryptographic draw infrastructure (SHA-256, commitment)
- ✓ Batch/DrawCommit/LuckyDraw models
- ✓ Eligibility checking (payment PAID required, OVERDUE = void)
- ✓ EMI waiver settlement
- ✓ Customer notifications
- ⏳ TDS (deferred - optional post-launch)

### ⏳ FRONTEND (0% - TO BUILD)
**Pages needed:**
1. Draw Eligibility Check page
2. Draw Results page (winner announcement)
3. EMI waiver history
4. Lucky ID tracking

**Endpoints:**
```
GET    /api/v1/lucky-plan/eligibility/
GET    /api/v1/lucky-plan/draw-results/
GET    /api/v1/lucky-plan/waiver-history/
```

---

## POLICY 2: PAYMENT TERMS (v2.0)

### ⚠️ BACKEND (50% Complete)
- ✓ Payment model (cash, UPI, bank, card)
- ✓ Receipt generation
- ✓ Dispute tracking (basic)
- ✗ **GST INTEGRATION** - Configure rates, GSTIN, tax calculation
- ✗ **LATE CHARGES** - 1% (days 6-30), 2% (days 31-60), RBI 18% cap
- ✗ **GATEWAY FEES** - 1.5-2.5% for cards, tracking, net amount calc
- ✗ **REFUND SLA** - 2-14 day tracking per CPA 2019
- ✗ **DISPUTE SLA** - 3-7-14 day escalation stages

### ⏳ FRONTEND (0% - TO BUILD)
**Pages needed:**
1. Payment Collection page (cash/UPI/bank entry)
2. Invoice/Receipt view
3. Refund Status tracker
4. Dispute management

**Gap Models to Create:**
```python
# EmiLateCharge - grace period (5 days), escalation (1% then 2%)
# GatewayFeePolicy - per-method fees
# RefundTracker - SLA timeline (2-14 days)
# DisputeEscalation - Stage 1 (3d) → Stage 2 (7d) → Stage 3 (14d)
```

---

## POLICY 3: REFUND & CANCELLATION (v2.0)

### ✅ BACKEND (80% Complete)
- ✓ Refund model (basic)
- ✓ CPA 2019 7-day return period
- ✓ Full refund in 7 days, 10% fee after 7 days
- ✗ **DAMAGE ASSESSMENT** - Photo evidence, staff assessment, deduction %
- ✗ **REFUND PROCESSING TIMELINE** - Approval (2d) → Inspection (3d) → Bank (7d) = 14d max

### ⏳ FRONTEND (0% - TO BUILD)
**Pages needed:**
1. Return Request form
2. Damage Assessment (photo upload, assessment result)
3. Refund Status page (SLA timeline)
4. Return History

**Gap Models:**
```python
# DamageAssessment - photo evidence, staff notes, deduction %
# ReturnProcessing - 4-stage timeline tracking
```

---

## POLICY 4: EMI & SUBSCRIPTION DEFAULT (v2.0)

### ⚠️ BACKEND (30% Complete)
- ✓ RecoveryCase model (basic)
- ✓ Overdue EMI detection
- ✗ **GRACE PERIOD** - 5 days no charge, then OVERDUE
- ✗ **LATE CHARGES** - 1% (6-30 days), 2% (31-60 days), RBI 18% cap
- ✗ **NPA CLASSIFICATION** - Days 61+ = Default/NPA status
- ✗ **CREDIT BUREAU REPORTING** - CIBIL/Equifax at 30/90 days
- ✗ **COMMUNICATION ESCALATION** - SMS (2x weekly, 1-30d) → Call (weekly, 31-60d) → Letter (61d+) → Legal (90d+)
- ✗ **REPOSSESSION** - 90-day + 15-day notice, sale, shortfall tracking

### ⏳ FRONTEND (0% - TO BUILD)
**Pages needed:**
1. Overdue EMI Dashboard
2. Defaulter List (aging buckets)
3. Recovery Actions (notice send, legal, settlement)
4. Communication Log

**Gap Models:**
```python
# EmiLateCharge - grace period, escalation
# NPAClassification - auto-classify at 61 days
# CreditBureauReport - CIBIL/Equifax integration
# DefaultCommunicationSchedule - SMS, calls, letters, legal
# RepossessionCase - notice, sale, shortfall
```

---

## POLICY 5: WARRANTY & SERVICE (v2.0)

### ✅ BACKEND (100% Complete)
- ✓ WarrantyClaim model (defect classification, assessment, approval)
- ✓ ServicePricing (labor, travel, SLA)
- ✓ WarrantyExtendedPlan (enrollment, payment)
- ✓ WarrantyServiceRecord (product-invoice-delivery mapping)
- ✓ WarrantyServiceCall (per-service tracking)

### ⏳ FRONTEND (0% - TO BUILD)
**Pages needed:**
1. Warranty Claims Dashboard
2. Claim Submission form
3. Claim Status (assessment, approval, resolution)
4. Service History
5. Extended Warranty Enrollment

---

## POLICY 6: PRIVACY & DATA PROTECTION (v2.0)

### ✅ BACKEND (100% Complete)
- ✓ CustomerConsent (opt-in/out for marketing, analytics, etc.)
- ✓ DataAccessRequest (30-day SLA for access/correction/erasure/portability)
- ✓ PrivacyPreference (communication & processing prefs)
- ✓ CookieConsent (13-month CPA 2019 tracking)
- ✓ DataBreachLog (72-hour notification requirement)
- ✓ DataAccessLog (immutable audit trail)
- ✓ DPOGrievance (30-day + 14-day escalation SLA)
- ✓ DataRetentionPolicy (7-year tax records, etc.)

### ⏳ FRONTEND (0% - TO BUILD)
**Pages needed:**
1. Privacy Settings page
2. Cookie Banner
3. Data Access Request form
4. Grievance Submission
5. Data Export (portability)

---

## IMPLEMENTATION PRIORITY

### PHASE 1 (CRITICAL - This Sprint)
- [ ] Policy 2: Payment Terms - GST, late charges, gateway fees, refunds
- [ ] Policy 4: EMI Defaults - Grace period, late charges, NPA, credit bureau
- [ ] Frontend: Payment Dashboard + Refund Tracker + EMI Overdue List

### PHASE 2 (HIGH - Next Sprint)
- [ ] Policy 3: Refund & Cancellation - Damage assessment, processing timeline
- [ ] Policy 1: Lucky Plan Draw - Frontend pages (eligibility, results, history)
- [ ] Frontend: Refund workflow + Lucky Draw pages

### PHASE 3 (MEDIUM - Following Sprint)
- [ ] Policy 5: Warranty & Service - Frontend dashboard + claims
- [ ] Policy 6: Privacy & Data Protection - Consent + grievance UI

---

## BACKEND GAPS TO FIX

### High Priority (Payment & EMI):
```python
# 1. EmiLateCharge Model
class EmiLateCharge(models.Model):
    emi = ForeignKey(Emi)
    days_overdue = PositiveIntegerField()
    grace_period_days = 5
    charge_rate_1 = Decimal('0.01')  # 1% (days 6-30)
    charge_rate_2 = Decimal('0.02')  # 2% (days 31-60)
    charge_amount = DecimalField()
    status = CharField(choices=['PENDING', 'ASSESSED', 'PAID', 'WAIVED'])

# 2. PaymentGatewayFee Model
class PaymentGatewayFee(models.Model):
    payment = ForeignKey(Payment)
    method = CharField(choices=['CARD', 'WALLET', 'UPI', 'BANK'])
    fee_percentage = DecimalField()
    fee_amount = DecimalField()
    net_amount = DecimalField()

# 3. RefundTracker Model
class RefundTracker(models.Model):
    payment = ForeignKey(Payment)
    status = CharField(choices=['PENDING', 'APPROVED', 'INSPECTION', 'PROCESSING', 'COMPLETED'])
    requested_at = DateTimeField()
    approved_at = DateTimeField(null=True)
    expected_completion = DateField()  # Max 14 days
    refund_method = CharField()

# 4. NPAClassification Model
class NPAClassification(models.Model):
    subscription = ForeignKey(Subscription)
    npa_status = CharField(choices=['NOT_NPA', 'SUBNORMAL', 'DOUBTFUL', 'LOSS'])
    classified_at = DateTimeField()
    days_overdue = PositiveIntegerField()

# 5. CreditBureauReport Model
class CreditBureauReport(models.Model):
    subscription = ForeignKey(Subscription)
    bureau = CharField(choices=['CIBIL', 'EQUIFAX', 'EXPERIAN', 'HIGHMARK'])
    status = CharField(choices=['OVERDUE', 'DEFAULT', 'SETTLED'])
    reported_at = DateTimeField()
    settlement_reported_at = DateTimeField(null=True)
```

### Medium Priority (Refunds & Recovery):
```python
# DamageAssessment, RepossessionCase, etc.
```

---

## FRONTEND PAGES TO BUILD

### Core Dashboards:
1. **Payment Management** - Collection, refunds, disputes
2. **EMI Management** - Overdue tracking, default recovery
3. **Warranty Management** - Claims, service history
4. **Privacy Management** - Consent, data requests, grievances

### Customer-Facing:
1. **My Warranties** - Status, service history, claims
2. **My Privacy** - Data access, preferences, downloads
3. **My Refunds** - Return request, status, timeline

---

## TIMELINE

**Week 1 (This):** EMI late charges + Payment terms gaps + Refund SLA  
**Week 2:** Frontend dashboards for payment + EMI + refunds  
**Week 3:** Warranty frontend + Privacy UI  
**Week 4:** Integration testing + deployment  

---

## SUCCESS CRITERIA

- [ ] All 6 policies have complete backend models
- [ ] All 6 policies have admin dashboard pages
- [ ] All 6 policies have customer-facing pages
- [ ] Compliance: DPDP 2023, CPA 2019, ITA 1961, RBI, BIS
- [ ] Verification gates pass (backend + frontend)
- [ ] All gaps documented & fixed
- [ ] Production deployment ready

**Current Status:** 50% Complete | **Backend:** 70% | **Frontend:** 0%
