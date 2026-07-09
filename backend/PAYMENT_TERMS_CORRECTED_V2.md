# PAYMENT TERMS & CONDITIONS (Version 2.0 - CORRECTED FOR ACTUAL BUSINESS)

**Effective Date:** 01-Jul-2026  
**Last Updated:** 10-Jul-2026  
**Compliance:** CPA 2019, ITA 1961, RBI Guidelines (when applicable)  
**Status:** GST_UNREGISTERED (framework ready for future GST_REGULAR/COMPOSITION upgrade)

---

## 1. ACCEPTED PAYMENT MODES

Subidha Furniture accepts payments through:
- **Cash:** In-person at showroom (receipt issued immediately)
- **Bank Transfer:** Direct bank deposits to authorized accounts
- **UPI:** Google Pay, PhonePe, Paytm, WhatsApp Pay
- **Card Payment:** Debit/Credit cards (when payment gateway integrated in future)

### Payment Processing:
```
Customer Payment → Verification → Recording → Receipt Generation
                                   ↓
                         Finance Account (CASH/BANK/UPI)
                         EMI Record (if subscription)
                         Tax Treatment (based on product GST rate)
```

---

## 2. GST & TAXATION FRAMEWORK

### Current Status:
- **Registration Mode:** GST_UNREGISTERED
- **GSTIN:** Not registered (can be added when registering as GST_REGULAR)
- **PAN:** Available for TDS/compliance
- **Applicable Effective Date:** 01-Jul-2026

### Future GST Integration (Ready for upgrade):

**When registering as GST_REGULAR or GST_COMPOSITION:**

```
Product Category          GST Rate    Backend Field
─────────────────────────────────────────────────────
Furniture (Specified)     5% GST      product.gst_rate = 5
Appliances/Electronics    12% GST     product.gst_rate = 12
Premium/Luxury Items      18% GST     product.gst_rate = 18
Luxury Category Items     28% GST     product.gst_rate = 28
```

### Invoicing & Documentation:
- GST invoices generated within 30 days of sale (per ITA 1961)
- GST amount shown separately on invoice
- Records retained 7 years (tax compliance)
- Tax calculation mode: GST_EXCLUSIVE (GST added to base price)

### Implementation (Backend Ready):
```python
# In ProductTaxProfile:
gst_rate = DecimalField(choices=[5, 12, 18, 28])
tax_mode = CharField(choices=['GST_EXCLUSIVE', 'GST_INCLUSIVE'])

# In BillingInvoice:
tax_mode = CharField(choices=['GST', 'NON_GST'])
gst_amount = DecimalField()
base_amount = DecimalField()
total_amount = base_amount + gst_amount
```

**Upgrade Steps (When Ready):**
1. [ ] Register business as GST_REGULAR in tax authority
2. [ ] Obtain GSTIN from GST portal
3. [ ] Add GSTIN to BusinessTaxProfile
4. [ ] Configure product-wise GST rates (5%, 12%, 18%, 28%)
5. [ ] Enable automatic tax calculation in billing
6. [ ] Generate GSTR returns (monthly/quarterly)

---

## 3. PAYMENT GATEWAY FEES (Future)

### Current Status:
**No payment gateway integrated yet.**

### When Gateway is Adopted (Future):

**Processing Fees:**
- **Card Payments:** 1.5% - 2.5% processing fee
- **Digital Wallets:** Varies by provider (shown at checkout)
- **UPI Payments:** Typically free (absorbed by business)
- **Bank Transfers:** Free

### Implementation Structure (Ready for integration):
```python
# Add to Payment model:
gateway_fee = DecimalField(default=0.00)
gateway_fee_type = CharField(choices=[
    ('CARD', 'Card Processing Fee (1.5-2.5%)'),
    ('WALLET', 'Digital Wallet Fee (varies)'),
    ('UPI', 'UPI (No Fee)'),
    ('BANK', 'Bank Transfer (No Fee)')
])
net_payment_amount = amount - gateway_fee

# Payment method specific:
if method == 'CARD':
    gateway_fee = amount * 0.02  # 2% (can be 1.5-2.5%)
elif method == 'WALLET':
    gateway_fee = amount * provider_rate  # Dynamic per wallet
else:
    gateway_fee = 0
```

**Policy:** 
- All advertised prices are FINAL
- Gateway fees disclosed at checkout before payment
- Customer sees: Base price + GST (if applicable) + Gateway fee (if applicable)

---

## 4. PAYMENT HANDLING BY SUBSCRIPTION TYPE

### A. ADVANCE EMI PAYMENTS (Lucky Plan)

**Payment Model:**
```
Customer buys furniture via Advance EMI (6-24 months)
         ↓
Monthly EMI payments due (12-24 installments)
         ↓
Optional: Lucky Draw each month
         ↓
If Draw Happens: Winner's EMI waived (₹X credited)
```

#### Payment Due & Draw Eligibility:

```
Timeline:
─────────────────────────────────────────
Month 1-N: EMI Due Date (e.g., 5th of month)
         ↓
Draw Eligibility Window:
  - Hash Creation Date: X days before draw
  - Seed Commitment Published: 24 hours before
  - Draw Execution: On scheduled draw date
  - Seed Revealed: During live draw
```

#### NO LATE PAYMENT CHARGES:
Instead, **Draw Void on Payment Failure**:

```
Scenario 1: Customer Paid ON TIME
  Status: PAID ✓
  Draw Eligibility: ✓ Eligible for draw
  
Scenario 2: Customer Missed Due Date
  Days Overdue: 1-5
  Status: OVERDUE (pending payment)
  Draw Eligibility: ✗ VOID for this customer
  
  If draw date arrives while payment overdue:
    - Customer excluded from draw (cryptographically)
    - Draw proceeds with other eligible customers
    - No late charge assessed
    - Payment still required to continue subscription
```

#### Payment Status Tracking:
```python
# In Emi model:
class EmiStatus(models.TextChoices):
    PENDING = "PENDING", "Not Yet Due"
    DUE = "DUE", "Due (Payment Expected)"
    PAID = "PAID", "Paid - Eligible for Draw"
    OVERDUE = "OVERDUE", "Overdue - Draw Void"
    WAIVED = "WAIVED", "Waived by Draw"
    CANCELLED = "CANCELLED", "Subscription Cancelled"

# Draw eligibility check (before draw execution):
if emi.status in ['PAID', 'WAIVED']:
    include_in_draw = True
elif emi.status in ['OVERDUE', 'PENDING']:
    include_in_draw = False
    mark_draw_void_for_customer()
```

---

### B. RENT/LEASE PAYMENTS

**Late Payment Rules (Official RBI/CPA Guidelines):**

#### Grace Period & Escalation:
```
Days Overdue:
───────────────────────────────────────
1-5 days   : Grace period (NO charge)
6-30 days  : 1% of monthly rent/lease
31+ days   : 2% of monthly rent/lease
90+ days   : Recovery procedures initiated
```

#### Admin Override Capability:
```python
# In RentSubscription or LeaseSubscriptionProfile:
late_charge_policy = ForeignKey(LateChargePolicy)

class LateChargePolicy(TimeStampedModel):
    grace_days = PositiveIntegerField(default=5)
    escalation_days_1 = PositiveIntegerField(default=30)
    charge_rate_1 = DecimalField(default=0.01)  # 1%
    escalation_days_2 = PositiveIntegerField(default=90)
    charge_rate_2 = DecimalField(default=0.02)  # 2%
    
    # ADMIN OVERRIDE:
    can_admin_waive = BooleanField(default=True)
    can_admin_reduce = BooleanField(default=True)

# Payment received → Late charge calculated → Admin can:
# Option 1: WAIVE the entire late charge
# Option 2: REDUCE the late charge (e.g., 2% → 1%)
# Option 3: APPROVE the full late charge
```

#### Implementation:
```python
class RentLateCharge(TimeStampedModel):
    rent_payment = ForeignKey(RentPayment)
    days_overdue = PositiveIntegerField()
    calculated_charge = DecimalField()  # Auto-calculated
    
    # Admin intervention:
    admin_action = CharField(choices=[
        ('AUTO', 'Auto-calculated - Approved'),
        ('WAIVED', 'Waived by Admin'),
        ('REDUCED', 'Reduced by Admin')
    ], default='AUTO')
    
    admin_approved_amount = DecimalField(null=True)
    approved_by = ForeignKey(User, null=True)
    approval_notes = TextField(blank=True)
```

---

### C. DIRECT SALE PAYMENTS (Outstanding Handling)

**Payment Terms:**
- Full payment due at point of sale (or as negotiated)
- If payment outstanding, admin can:
  - [ ] Extend payment deadline
  - [ ] Negotiate partial payment plans
  - [ ] Apply discretionary charges/waivers

```python
class DirectSalePayment(TimeStampedModel):
    direct_sale = ForeignKey(DirectSale)
    due_date = DateField()
    amount = DecimalField()
    status = CharField(choices=[
        'PENDING', 'PAID', 'PARTIAL', 'OVERDUE'
    ])
    
    # Admin flexibility:
    admin_notes = TextField()
    extended_due_date = DateField(null=True)  # Admin can extend
    
class DirectSaleOutstanding(TimeStampedModel):
    direct_sale = ForeignKey(DirectSale)
    outstanding_amount = DecimalField()
    days_overdue = PositiveIntegerField()
    admin_action = CharField(choices=[
        ('PENDING', 'Awaiting payment'),
        ('EXTENDED', 'Payment deadline extended'),
        ('NEGOTIATED', 'Payment plan agreed'),
        ('SETTLED', 'Paid')
    ])
```

---

## 5. REFUND PROCESSING (CPA 2019 Compliant)

### Refund Timeline & SLA:

```
Refund Request
     ↓
[Days 1-2] Approval Review
     ↓
[Days 3-5] Item Inspection/Assessment
     ↓
[Days 6-14] Bank Processing
     ↓
TOTAL: Maximum 14 days end-to-end (CPA 2019)
```

### Implementation (Backend Model):

```python
class PaymentRefund(TimeStampedModel):
    payment = ForeignKey(Payment)
    subscription = ForeignKey(Subscription, null=True)
    refund_amount = DecimalField()
    
    class RefundReason(models.TextChoices):
        CANCELLATION = "CANCELLATION", "Customer Cancellation"
        RETURN = "RETURN", "Product Return"
        DAMAGE = "DAMAGE", "Damaged/Defective Item"
        DISPUTE = "DISPUTE", "Dispute Resolution"
        RESTOCKING = "RESTOCKING", "Restocking Fee"
    
    reason = CharField(max_length=20, choices=RefundReason.choices)
    
    # Timeline tracking (CPA 2019):
    requested_at = DateTimeField(auto_now_add=True)
    approved_at = DateTimeField(null=True)
    inspection_completed_at = DateTimeField(null=True)
    refund_initiated_at = DateTimeField(null=True)
    refund_completed_at = DateTimeField(null=True)
    
    class RefundStatus(models.TextChoices):
        PENDING = "PENDING", "Awaiting Approval"
        APPROVED = "APPROVED", "Approved (Days 1-2)"
        INSPECTION = "INSPECTION", "Under Inspection (Days 3-5)"
        PROCESSING = "PROCESSING", "Bank Processing (Days 6-14)"
        COMPLETED = "COMPLETED", "Completed"
        REJECTED = "REJECTED", "Rejected"
    
    status = CharField(max_length=20, choices=RefundStatus.choices)
    expected_completion_date = DateField()  # Day 14 max
    
    # Tracking:
    refund_to_account = CharField()  # Which account to refund to
    bank_reference = CharField(null=True)
    notes = TextField(blank=True)

# Frontend: Show refund timeline
Refund Status Page:
  Days 1-2: ✓ Approved → Expected completion: [Day 14]
  Days 3-5: ⏳ Inspection → Expected completion: [Day 14]
  Days 6-14: ⏳ Processing → Expected completion: [Day 14]
```

---

## 6. DISPUTE RESOLUTION & SLA

### Escalation Timeline:

```python
class PaymentDispute(TimeStampedModel):
    payment = ForeignKey(Payment)
    customer = ForeignKey(Customer)
    
    dispute_reason = TextField()
    filed_at = DateTimeField(auto_now_add=True)
    
    class DisputeStage(models.TextChoices):
        STAGE_1 = "STAGE_1", "Verification (Days 0-3)"
        STAGE_2 = "STAGE_2", "Finance Review (Days 3-7)"
        STAGE_3 = "STAGE_3", "Mediation (Days 7-14)"
        STAGE_4 = "STAGE_4", "Consumer Court (14+ days)"
    
    current_stage = CharField(max_length=20, choices=DisputeStage.choices)
    
    # SLA timestamps:
    stage_1_due = DateTimeField()  # Day 3
    stage_2_due = DateTimeField()  # Day 7
    stage_3_due = DateTimeField()  # Day 14
    
    stage_1_completed_at = DateTimeField(null=True)
    stage_2_completed_at = DateTimeField(null=True)
    stage_3_completed_at = DateTimeField(null=True)
    
    # Resolution:
    resolution_notes = TextField(blank=True)
    resolved_at = DateTimeField(null=True)
    
    class ResolutionStatus(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"
        ESCALATED = "ESCALATED", "Escalated to Consumer Court"
    
    status = CharField(max_length=20, choices=ResolutionStatus.choices)

# Frontend: Show dispute SLA
Dispute Status Timeline:
  Stage 1: ✓ Verified (Days 0-3)
  Stage 2: ⏳ Finance Review (Days 3-7) - Expected: [Day 7]
  Stage 3: ⏹️ Mediation (Days 7-14)
  Stage 4: Consumer Court (if unresolved after Day 14)
```

---

## 7. DIGITAL RECEIPTS (Email/SMS Automation)

### Receipt Generation & Delivery:

```python
class ReceiptDelivery(TimeStampedModel):
    payment = ForeignKey(Payment)
    
    receipt_type = CharField(choices=[
        'RETAIL_RECEIPT',
        'EMI_PAYMENT_RECEIPT',
        'REFUND_RECEIPT'
    ])
    
    # Generation:
    receipt_number = CharField(unique=True)
    receipt_generated_at = DateTimeField(auto_now_add=True)
    receipt_pdf_url = URLField(null=True)
    
    # Delivery methods:
    delivery_methods = CharField(choices=[
        'EMAIL', 'SMS', 'BOTH'
    ], default='BOTH')
    
    # Email delivery:
    email_sent_to = EmailField()
    email_sent_at = DateTimeField(null=True)
    email_status = CharField(choices=['PENDING', 'SENT', 'FAILED'])
    
    # SMS delivery:
    sms_sent_to = CharField()  # Phone number
    sms_sent_at = DateTimeField(null=True)
    sms_status = CharField(choices=['PENDING', 'SENT', 'FAILED'])
    
    # Tracking:
    email_opened_at = DateTimeField(null=True)  # If trackable
    download_link_accessed_at = DateTimeField(null=True)

# Frontend: Receipt page
Receipt Delivery Status:
  ✓ Generated: 2026-07-09 14:30
  ✓ Email sent to: customer@email.com (12:30)
  ✓ SMS sent to: +91-9476490946 (12:31)
  📋 Receipt Number: RCP-20260709-001
  📥 Download: [PDF Link]
  📧 Resend Email | 📱 Resend SMS
```

---

## 8. PAYMENT RECORDING & ACCOUNTING

### Payment Flow to Finance:

```
Customer Payment
     ↓
Payment.model (record in DB)
     ↓
├─→ Finance Account (CASH/BANK/UPI)
├─→ EMI Record (if subscription payment)
├─→ Ledger Entry (double-entry bookkeeping)
└─→ Receipt Generation (email/SMS)
     ↓
Finance Dashboard: Payment reconciliation
```

### Accounting Integration:

```python
# When payment is recorded:
payment = Payment.objects.create(
    customer=customer,
    subscription=subscription,
    amount=5000,
    method='CARD',
    payment_date=today(),
)

# Auto-create ledger entries:
FinancialLedger.objects.create(
    payment=payment,
    entry_type='EMI_PAYMENT',
    debit_account=FinanceAccount.objects.get(kind='BANK'),
    credit_account=FinanceAccount.objects.get(kind='REVENUE'),
    amount=5000,
)
```

---

## CONTACT & SUPPORT

**Payment Support:** payments@subidha.local  
**Dispute Escalation:** disputes@subidha.local  
**Finance Department:** finance@subidha.local  
**Response SLA:** 3 days acknowledgment, 14 days resolution (CPA 2019)

---

## SUMMARY OF BUSINESS LOGIC

| Scenario | Late Charges | Refund SLA | Admin Override |
|---|---|---|---|
| **Advance EMI** | No; Draw void if overdue | 2-14 days (CPA 2019) | N/A |
| **Rent/Lease** | Yes; 5-day grace, 1-2% escalation | 2-14 days (CPA 2019) | Can waive/reduce |
| **Direct Sale** | N/A; Admin discretion | 2-14 days (CPA 2019) | Admin handles |
| **Disputes** | N/A | SLA: 3-7-14 days escalation | Management review |
| **Refunds** | N/A | Max 14 days (CPA 2019) | Can expedite |

---

**VERSION:** 2.0 (CORRECTED)  
**COMPLIANCE:** CPA 2019 + ITA 1961 + RBI Guidelines (where applicable)  
**GST STATUS:** Framework ready; currently UNREGISTERED  
**PAYMENT GATEWAY:** Framework ready; currently not integrated  
**LAST UPDATED:** 10-Jul-2026  
**READY FOR:** Frontend integration + backend implementation
