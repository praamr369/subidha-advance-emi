# PAYMENT TERMS - BACKEND + FRONTEND INTEGRATION GUIDE

**Date:** 10-Jul-2026  
**Status:** Ready for Implementation  
**Scope:** Models, Views/APIs, Frontend Components

---

## PHASE 1: BACKEND MODEL ADDITIONS

### 1.1 GST Configuration (Product Level)

```python
# FILE: subscriptions/models_business_setup.py OR inventory/models.py

class ProductTaxProfile(TimeStampedModel):
    product = OneToOneField(Product, on_delete=models.CASCADE)
    
    # GST Configuration (for future use)
    gst_rate = DecimalField(
        max_digits=5, 
        decimal_places=2,
        choices=[
            (Decimal('5.00'), '5% - Furniture'),
            (Decimal('12.00'), '12% - Appliances'),
            (Decimal('18.00'), '18% - Premium Items'),
            (Decimal('28.00'), '28% - Luxury Items'),
        ],
        null=True,
        blank=True,
        help_text="Apply when GST_REGULAR registered"
    )
    
    tax_mode = CharField(
        max_length=20,
        choices=[
            ('NON_GST', 'Non-GST (Current)'),
            ('GST_EXCLUSIVE', 'GST Exclusive'),  # Tax added to base
            ('GST_INCLUSIVE', 'GST Inclusive'),  # Tax included in price
        ],
        default='NON_GST'
    )
    
    is_active = BooleanField(default=True)
    
    class Meta:
        db_table = 'product_tax_profiles'
        
    def get_gst_amount(self, base_price):
        if self.tax_mode == 'NON_GST':
            return Decimal('0.00')
        return (base_price * self.gst_rate / 100) if self.gst_rate else Decimal('0.00')
    
    def get_total_price(self, base_price):
        return base_price + self.get_gst_amount(base_price)
```

**Migration:**
```bash
python manage.py makemigrations subscriptions
python manage.py migrate
```

---

### 1.2 Late Payment Charges (Rent/Lease)

```python
# FILE: subscriptions/models.py

class LateChargePolicy(TimeStampedModel):
    """Late charge escalation policy for Rent/Lease"""
    
    name = CharField(max_length=100)  # e.g., "RBI Standard Policy"
    description = TextField(blank=True)
    
    # Grace period
    grace_days = PositiveIntegerField(default=5)
    grace_charge_rate = DecimalField(default=Decimal('0.00'))  # 0% (no charge)
    
    # First escalation
    escalation_days_1 = PositiveIntegerField(default=30)
    charge_rate_1 = DecimalField(default=Decimal('0.01'))  # 1%
    
    # Second escalation
    escalation_days_2 = PositiveIntegerField(default=90)
    charge_rate_2 = DecimalField(default=Decimal('0.02'))  # 2%
    
    # RBI compliance
    max_charge_rate = DecimalField(
        default=Decimal('0.18'),  # 18% per annum max
        help_text="RBI lending guidelines - annual cap"
    )
    
    # Admin override
    allow_admin_waive = BooleanField(default=True)
    allow_admin_reduce = BooleanField(default=True)
    
    is_active = BooleanField(default=True)
    
    class Meta:
        db_table = 'late_charge_policies'
    
    def calculate_charge(self, payment_amount, days_overdue):
        """Calculate late charge based on days overdue"""
        if days_overdue <= self.grace_days:
            return Decimal('0.00')  # Grace period
        elif days_overdue <= self.escalation_days_1:
            return payment_amount * self.charge_rate_1
        else:
            return payment_amount * self.charge_rate_2
    
    def is_admin_override_available(self):
        return self.allow_admin_waive or self.allow_admin_reduce


class RentPayment(TimeStampedModel):
    """Monthly rent/lease payment tracking"""
    
    rent_subscription = ForeignKey(
        'subscriptions.RentSubscriptionProfile',
        on_delete=models.CASCADE,
        related_name='payments'
    )
    
    month_no = PositiveIntegerField()
    due_date = DateField()
    amount = DecimalField(max_digits=12, decimal_places=2)
    
    # Payment status
    payment_date = DateField(null=True, blank=True)
    paid_amount = DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    class PaymentStatus(models.TextChoices):
        DUE = "DUE", "Due"
        PAID = "PAID", "Paid"
        OVERDUE = "OVERDUE", "Overdue"
        PARTIAL = "PARTIAL", "Partial Payment"
    
    status = CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.DUE)
    
    # Late charge tracking
    late_charge_policy = ForeignKey(LateChargePolicy, on_delete=models.SET_NULL, null=True)
    late_charge_amount = DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Admin override
    admin_override_reason = TextField(blank=True)
    admin_override_type = CharField(  # WAIVED or REDUCED
        max_length=20,
        choices=[('WAIVED', 'Waived'), ('REDUCED', 'Reduced')],
        null=True,
        blank=True
    )
    admin_override_amount = DecimalField(  # What customer actually pays
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    admin_override_by = ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    admin_override_at = DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'rent_payments'
        unique_together = ('rent_subscription', 'month_no')
    
    def calculate_days_overdue(self):
        if self.status != self.PaymentStatus.OVERDUE:
            return 0
        return (date.today() - self.due_date).days
    
    def calculate_late_charge(self):
        """Auto-calculate late charge (before admin override)"""
        if not self.late_charge_policy:
            return Decimal('0.00')
        days = self.calculate_days_overdue()
        return self.late_charge_policy.calculate_charge(self.amount, days)
```

**Migration:**
```bash
python manage.py makemigrations subscriptions
python manage.py migrate
```

---

### 1.3 Refund Processing (CPA 2019 Compliant)

```python
# FILE: subscriptions/models.py OR billing/models.py

class PaymentRefund(TimeStampedModel):
    """Refund tracking with CPA 2019 SLA compliance"""
    
    payment = ForeignKey(Payment, on_delete=models.CASCADE, related_name='refunds')
    subscription = ForeignKey(
        'subscriptions.Subscription',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    refund_amount = DecimalField(max_digits=12, decimal_places=2)
    
    class RefundReason(models.TextChoices):
        CANCELLATION = "CANCELLATION", "Customer Cancellation"
        RETURN = "RETURN", "Product Return"
        DAMAGE = "DAMAGE", "Damaged/Defective Item"
        DISPUTE = "DISPUTE", "Dispute Resolution"
        RESTOCKING = "RESTOCKING", "Restocking Fee"
        OTHER = "OTHER", "Other"
    
    reason = CharField(max_length=20, choices=RefundReason.choices)
    reason_details = TextField(blank=True)
    
    # Timeline (CPA 2019: Max 14 days end-to-end)
    requested_at = DateTimeField(auto_now_add=True)
    
    class RefundStatus(models.TextChoices):
        PENDING = "PENDING", "Awaiting Approval (Days 1-2)"
        APPROVED = "APPROVED", "Approved"
        INSPECTION = "INSPECTION", "Under Inspection (Days 3-5)"
        PROCESSING = "PROCESSING", "Bank Processing (Days 6-14)"
        COMPLETED = "COMPLETED", "Refund Completed"
        REJECTED = "REJECTED", "Refund Rejected"
    
    status = CharField(max_length=20, choices=RefundStatus.choices, default=RefundStatus.PENDING)
    
    # SLA dates
    approved_at = DateTimeField(null=True, blank=True)
    inspection_completed_at = DateTimeField(null=True, blank=True)
    refund_initiated_at = DateTimeField(null=True, blank=True)
    refund_completed_at = DateTimeField(null=True, blank=True)
    expected_completion_date = DateField(null=True)  # Day 14 max from request
    
    # Refund destination
    refund_to_account = CharField(max_length=50)  # "ORIGINAL_PAYMENT_METHOD" or account details
    bank_reference_no = CharField(max_length=100, null=True, blank=True)
    
    # Notes
    internal_notes = TextField(blank=True)
    customer_notes = TextField(blank=True)
    
    class Meta:
        db_table = 'payment_refunds'
        ordering = ['-requested_at']
    
    def days_pending(self):
        return (timezone.now() - self.requested_at).days
    
    def is_overdue(self):
        """Check if refund processing exceeds 14-day CPA 2019 limit"""
        return self.days_pending() > 14 and self.status != self.RefundStatus.COMPLETED
    
    def get_expected_completion(self):
        if not self.expected_completion_date:
            self.expected_completion_date = (
                self.requested_at.date() + timedelta(days=14)
            )
        return self.expected_completion_date
```

---

### 1.4 Dispute Resolution with SLA

```python
# FILE: subscriptions/models.py

class PaymentDispute(TimeStampedModel):
    """Payment dispute tracking with escalation SLA"""
    
    payment = ForeignKey(Payment, on_delete=models.CASCADE)
    customer = ForeignKey(Customer, on_delete=models.CASCADE)
    subscription = ForeignKey(
        'subscriptions.Subscription',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    dispute_reason = TextField()
    filed_at = DateTimeField(auto_now_add=True)
    
    class Stage(models.TextChoices):
        STAGE_1 = "STAGE_1", "Verification (Days 0-3)"
        STAGE_2 = "STAGE_2", "Finance Review (Days 3-7)"
        STAGE_3 = "STAGE_3", "Mediation (Days 7-14)"
        STAGE_4 = "STAGE_4", "Consumer Court (14+ days)"
    
    current_stage = CharField(max_length=20, choices=Stage.choices, default=Stage.STAGE_1)
    
    # SLA tracking
    stage_1_due = DateTimeField()  # Day 3
    stage_2_due = DateTimeField()  # Day 7
    stage_3_due = DateTimeField()  # Day 14
    
    stage_1_completed_at = DateTimeField(null=True)
    stage_2_completed_at = DateTimeField(null=True)
    stage_3_completed_at = DateTimeField(null=True)
    
    # Resolution
    resolution_notes = TextField(blank=True)
    resolved_at = DateTimeField(null=True)
    
    class ResolutionStatus(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"
        ESCALATED = "ESCALATED", "Escalated to Consumer Court"
    
    status = CharField(max_length=20, choices=ResolutionStatus.choices, default=ResolutionStatus.OPEN)
    
    class Meta:
        db_table = 'payment_disputes'
        ordering = ['-filed_at']
    
    def advance_stage(self):
        """Move to next stage"""
        if self.current_stage == self.Stage.STAGE_1:
            self.stage_1_completed_at = timezone.now()
            self.current_stage = self.Stage.STAGE_2
        elif self.current_stage == self.Stage.STAGE_2:
            self.stage_2_completed_at = timezone.now()
            self.current_stage = self.Stage.STAGE_3
        elif self.current_stage == self.Stage.STAGE_3:
            self.stage_3_completed_at = timezone.now()
            self.current_stage = self.Stage.STAGE_4
        self.save()
```

---

### 1.5 Digital Receipt Delivery

```python
# FILE: billing/models.py OR subscriptions/models.py

class ReceiptDelivery(TimeStampedModel):
    """Email/SMS receipt delivery automation"""
    
    payment = ForeignKey(Payment, on_delete=models.CASCADE)
    
    class ReceiptType(models.TextChoices):
        RETAIL = "RETAIL_RECEIPT", "Retail Receipt"
        EMI = "EMI_PAYMENT_RECEIPT", "EMI Payment Receipt"
        REFUND = "REFUND_RECEIPT", "Refund Receipt"
    
    receipt_type = CharField(max_length=50, choices=ReceiptType.choices)
    receipt_number = CharField(max_length=50, unique=True)
    receipt_generated_at = DateTimeField(auto_now_add=True)
    
    # PDF storage
    receipt_pdf = FileField(upload_to='receipts/%Y/%m/%d/', null=True)
    receipt_html = TextField(blank=True)  # For email HTML
    
    # Delivery channels
    class DeliveryMethod(models.TextChoices):
        EMAIL = "EMAIL", "Email Only"
        SMS = "SMS", "SMS Only"
        BOTH = "BOTH", "Email & SMS"
    
    delivery_method = CharField(max_length=20, choices=DeliveryMethod.choices, default=DeliveryMethod.BOTH)
    
    # Email delivery
    email_to = EmailField()
    email_sent_at = DateTimeField(null=True)
    email_status = CharField(
        max_length=20,
        choices=[('PENDING', 'Pending'), ('SENT', 'Sent'), ('FAILED', 'Failed')],
        default='PENDING'
    )
    email_error = TextField(blank=True)
    email_opened_at = DateTimeField(null=True)
    
    # SMS delivery
    sms_to = CharField(max_length=15)  # Phone number
    sms_sent_at = DateTimeField(null=True)
    sms_status = CharField(
        max_length=20,
        choices=[('PENDING', 'Pending'), ('SENT', 'Sent'), ('FAILED', 'Failed')],
        default='PENDING'
    )
    sms_error = TextField(blank=True)
    
    # Tracking
    download_link_accessed_at = DateTimeField(null=True)
    
    class Meta:
        db_table = 'receipt_deliveries'
        
    def send_email_receipt(self):
        """Async task to send email"""
        # tasks.send_receipt_email.delay(self.pk)
        pass
    
    def send_sms_receipt(self):
        """Async task to send SMS"""
        # tasks.send_receipt_sms.delay(self.pk)
        pass
    
    def send_all(self):
        """Send via all configured methods"""
        if self.delivery_method in [self.DeliveryMethod.EMAIL, self.DeliveryMethod.BOTH]:
            self.send_email_receipt()
        if self.delivery_method in [self.DeliveryMethod.SMS, self.DeliveryMethod.BOTH]:
            self.send_sms_receipt()
```

---

## PHASE 2: BACKEND VIEWS/APIs

### 2.1 Payment API Endpoints

```python
# FILE: api/v1/views/payments.py

class PaymentListCreateView(generics.ListCreateAPIView):
    """
    GET: List customer's payments
    POST: Record new payment
    """
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['customer__name', 'reference_no']

class PaymentRefundListCreateView(generics.ListCreateAPIView):
    """
    GET: List refunds for a payment
    POST: Initiate refund (CPA 2019 tracking)
    """
    queryset = PaymentRefund.objects.all()
    serializer_class = PaymentRefundSerializer
    permission_classes = [IsAuthenticated]

class PaymentRefundStatusView(generics.RetrieveUpdateAPIView):
    """GET/PUT: Check and update refund status (SLA tracking)"""
    queryset = PaymentRefund.objects.all()
    serializer_class = PaymentRefundSerializer
    permission_classes = [IsAuthenticated]

class PaymentDisputeListCreateView(generics.ListCreateAPIView):
    """
    GET: List disputes
    POST: File new payment dispute
    """
    queryset = PaymentDispute.objects.all()
    serializer_class = PaymentDisputeSerializer
    permission_classes = [IsAuthenticated]

class PaymentDisputeEscalateView(generics.UpdateAPIView):
    """PUT: Move dispute to next stage (SLA enforcement)"""
    queryset = PaymentDispute.objects.all()
    serializer_class = PaymentDisputeSerializer
    permission_classes = [IsAdminUser]
    
    def update(self, request, *args, **kwargs):
        dispute = self.get_object()
        dispute.advance_stage()
        return Response(PaymentDisputeSerializer(dispute).data)

class ReceiptDeliveryView(generics.RetrieveUpdateAPIView):
    """GET/PUT: Check receipt delivery status (email/SMS)"""
    queryset = ReceiptDelivery.objects.all()
    serializer_class = ReceiptDeliverySerializer
    permission_classes = [IsAuthenticated]
```

**URLs:**
```python
# api/v1/urls.py
path('payments/', PaymentListCreateView.as_view()),
path('payments/<int:pk>/refunds/', PaymentRefundListCreateView.as_view()),
path('refunds/<int:pk>/', PaymentRefundStatusView.as_view()),
path('disputes/', PaymentDisputeListCreateView.as_view()),
path('disputes/<int:pk>/escalate/', PaymentDisputeEscalateView.as_view()),
path('receipts/<int:pk>/', ReceiptDeliveryView.as_view()),
```

---

## PHASE 3: FRONTEND INTEGRATION

### 3.1 Payment Dashboard

**Location:** `admin/billing/payments`

```html
<!-- Components to add: -->
1. Payment History Table
   - Payment date, amount, method, status
   - Receipt download link
   - View refund status
   - Report dispute button

2. Refund Status Tracker (CPA 2019)
   Timeline visualization:
   Days 1-2: Approval phase
   Days 3-5: Inspection phase
   Days 6-14: Processing phase
   
   Show: Current stage, expected completion date

3. Dispute Resolution Timeline
   Stage 1: Verification (0-3 days)
   Stage 2: Finance Review (3-7 days)
   Stage 3: Mediation (7-14 days)
   Stage 4: Consumer Court (14+ days)

4. Late Charges (Rent/Lease)
   If admin_override_available:
     [Waive] [Reduce] [Approve]
   Else:
     Show calculated amount

5. Receipt Delivery Status
   Email: [✓ Sent] [Resend]
   SMS: [✓ Sent] [Resend]
   Download: [PDF Link]
```

### 3.2 Customer Receipt Page

```html
<!-- Pages to add: -->
1. Receipt Details
   Receipt Number: RCP-20260710-001
   Payment Date: 10-Jul-2026
   Amount: ₹5,000
   Method: UPI
   Status: ✓ Paid
   
   Delivery Status:
   ✓ Email: sent 2 hours ago
   ✓ SMS: sent 2 hours ago
   📥 Download PDF
   
   [Resend Email] [Resend SMS]

2. Refund Tracking Page
   Refund Request: 10-Jul-2026
   Amount: ₹5,000
   Status: ⏳ Under Inspection (Days 3-5)
   Expected Completion: 24-Jul-2026
   
   Timeline:
   ✓ Day 1-2: Approved
   ⏳ Day 3-5: Inspection
   ⏹️ Day 6-14: Processing
   
   Notes: [Show internal/customer notes]

3. Dispute Status Page
   Filed: 10-Jul-2026
   Stage: ⏳ Finance Review (Days 3-7)
   Expected Resolution: 17-Jul-2026
   
   Escalation Timeline:
   ✓ Stage 1: Verified (Days 0-3)
   ⏳ Stage 2: Finance Review (Days 3-7)
   ⏹️ Stage 3: Mediation (Days 7-14)
   ⏹️ Stage 4: Consumer Court (14+ days)
```

### 3.3 Admin Payment Management

```html
<!-- Admin Pages to add: -->
1. Payment Reconciliation Dashboard
   Show all payments, refunds, disputes in one view
   
2. Rent/Lease Late Charges Management
   [Waive] [Reduce] [Approve] buttons with reason field
   Admin override history
   
3. Refund SLA Monitor
   Flag refunds exceeding 14 days (CPA 2019)
   Auto-escalate alerts
   
4. Dispute Escalation Manager
   Manual stage advancement
   SLA timeline enforcement
   Consumer court referrals

5. Receipt Delivery Log
   Email/SMS delivery status
   Failed delivery retry mechanism
```

---

## PHASE 4: AUTOMATION TASKS (Celery/Background Jobs)

```python
# FILE: celery_tasks.py OR tasks.py

from celery import shared_task

@shared_task
def send_payment_receipt_email(receipt_delivery_id):
    """Send receipt via email"""
    receipt = ReceiptDelivery.objects.get(id=receipt_delivery_id)
    try:
        # Generate PDF if not exists
        # Send email with PDF attachment
        receipt.email_sent_at = timezone.now()
        receipt.email_status = 'SENT'
        receipt.save()
    except Exception as e:
        receipt.email_status = 'FAILED'
        receipt.email_error = str(e)
        receipt.save()

@shared_task
def send_payment_receipt_sms(receipt_delivery_id):
    """Send receipt link via SMS"""
    receipt = ReceiptDelivery.objects.get(id=receipt_delivery_id)
    try:
        # Send SMS with receipt download link
        receipt.sms_sent_at = timezone.now()
        receipt.sms_status = 'SENT'
        receipt.save()
    except Exception as e:
        receipt.sms_status = 'FAILED'
        receipt.sms_error = str(e)
        receipt.save()

@shared_task
def calculate_late_charges_for_rent():
    """Daily task: Calculate late charges for overdue rent/lease"""
    rent_payments = RentPayment.objects.filter(
        status=RentPayment.PaymentStatus.OVERDUE
    )
    for payment in rent_payments:
        payment.late_charge_amount = payment.calculate_late_charge()
        payment.save()

@shared_task
def check_refund_sla_compliance():
    """Daily task: Alert if refunds exceed 14 days (CPA 2019)"""
    overdue_refunds = PaymentRefund.objects.filter(
        status__in=['PENDING', 'INSPECTION', 'PROCESSING'],
        expected_completion_date__lt=date.today()
    )
    for refund in overdue_refunds:
        # Alert admin: refund SLA exceeded
        notify_admin(f"Refund {refund.id} exceeds CPA 2019 14-day limit")

@shared_task
def escalate_disputes_by_sla():
    """Daily task: Auto-escalate disputes by stage SLA"""
    # Stage 1: Move to Stage 2 after 3 days
    # Stage 2: Move to Stage 3 after 7 days
    # Stage 3: Move to Stage 4 after 14 days
    pass
```

---

## DEPLOYMENT CHECKLIST

### Before Going Live:

- [ ] Database migrations run (`makemigrations` + `migrate`)
- [ ] GST configuration framework tested (even if GST_UNREGISTERED)
- [ ] Late charge policies created and linked to rent/lease
- [ ] Refund SLA tracking enabled (max 14 days per CPA 2019)
- [ ] Dispute resolution timeline enforced
- [ ] Email/SMS delivery automation configured
- [ ] Celery background tasks scheduled
- [ ] API endpoints documented and tested
- [ ] Frontend pages implemented and styled
- [ ] Admin override mechanisms tested
- [ ] Customer-facing receipt pages live
- [ ] Receipt automation (email/SMS) tested end-to-end

---

**IMPLEMENTATION PRIORITY:**
1. **CRITICAL (Week 1):** Refund tracking, Receipt delivery
2. **HIGH (Week 2):** Late charges (Rent/Lease), Dispute SLA
3. **MEDIUM (Week 3):** GST configuration, Gateway fee framework
4. **LOW (Week 4+):** Admin overrides, Automation optimization

---

**STATUS:** Ready for development team implementation  
**LAST UPDATED:** 10-Jul-2026
