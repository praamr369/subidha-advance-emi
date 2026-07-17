# Phase 3: Online Request APIs - Architecture & Implementation Plan

**Status**: Planning Stage (Ready to Implement)  
**Foundation**: Phase 2 Workbench + Phase 1C Address Management  
**Pincode Database**: Loading (22 MB complete India dataset)

---

## Overview

Phase 3 implements a complete **Online Request** workflow that:
1. Accepts customer requests from various channels (web, mobile, partner)
2. Creates workbench items for admin review & action
3. Auto-creates subscriptions or direct sales on approval
4. Integrates with existing workbench architecture
5. Provides API for quote generation and vendor matching

---

## Data Models (New)

### OnlineRequest Model
```python
class OnlineRequest(models.Model):
    # Identification
    id = UUID  # Unique identifier
    request_number = str  # Human-readable (e.g., "ORQ-2026-00001")
    
    # Customer & Product
    customer = FK(Customer)
    product = FK(Product)
    request_type = Choice(ADVANCE_EMI, RENT, LEASE, DIRECT_SALE)
    
    # Request Details
    quantity = int  # For direct sale
    preferred_tenure = int  # Months (for subscriptions)
    delivery_address = FK(Address)  # For delivery
    
    # Batch/Lucky Number (for EMI)
    batch = FK(Batch, null=True)
    preferred_lucky_number = int  # (optional, for EMI)
    
    # Pricing & Terms
    unit_price = Decimal  # Can override product price
    total_amount = Decimal  # Calculated
    tax_percentage = Decimal  # Tax rate
    gst_amount = Decimal  # Calculated
    
    # Quotes & Approval
    quote_generated_at = DateTime
    quote_expiry_date = Date
    approved_by = FK(User)  # Admin who approved
    approved_at = DateTime
    approval_notes = Text
    
    # Status
    status = Choice(DRAFT, QUOTE_SENT, QUOTE_ACCEPTED, APPROVED, REJECTED, COMPLETED)
    
    # Timestamps
    created_at = DateTime
    updated_at = DateTime
    
    class Meta:
        indexes = [
            Index(fields=['customer', '-created_at']),
            Index(fields=['status', '-created_at']),
            Index(fields=['request_type', '-created_at']),
        ]
```

### OnlineRequestAction Model (Audit Log)
```python
class OnlineRequestAction(models.Model):
    request = FK(OnlineRequest)
    action_type = Choice(
        CREATED, QUOTE_GENERATED, QUOTE_SENT,
        QUOTE_ACCEPTED, APPROVED, REJECTED,
        PAYMENT_INITIATED, COMPLETED, CANCELLED
    )
    performed_by = FK(User)  # null for system actions
    notes = Text
    metadata = JSON  # Extra context
    created_at = DateTime
```

---

## Service Layer Functions

### Core Request Management
```python
# subscriptions/services/online_request_service.py

# Request Creation
def create_online_request(
    customer: Customer,
    product: Product,
    request_type: str,
    delivery_address: Address,
    quantity: int = 1,
    preferred_tenure: int = None,
    unit_price: Decimal = None,
    batch: Batch = None,
    preferred_lucky_number: int = None,
) -> OnlineRequest

# Quote Generation
def generate_quote(
    request_id: int,
    applied_discount: Decimal = 0,
    tax_rate: Decimal = None,
) -> dict

def send_quote(
    request_id: int,
    performed_by: User,
    email_to: str,
    quote_expiry_days: int = 7,
) -> bool

# Approval Workflow
def approve_online_request(
    request_id: int,
    approved_by: User,
    approval_notes: str = "",
    auto_create_transaction: bool = True,
) -> (OnlineRequest, Subscription | DirectSale)

def reject_online_request(
    request_id: int,
    rejected_by: User,
    rejection_reason: str = "",
) -> OnlineRequest

# Status Transitions
def mark_quote_accepted(
    request_id: int,
    accepted_by: User,
) -> OnlineRequest

def complete_request(
    request_id: int,
    performed_by: User,
    completion_notes: str = "",
) -> OnlineRequest
```

### Vendor & Quote Integration
```python
# Match vendors for delivery
def find_vendors_for_request(
    request: OnlineRequest,
) -> list[Vendor]

# Calculate delivery cost
def calculate_delivery_cost(
    from_pincode: str,
    to_pincode: str,
    vendor_id: int,
) -> Decimal

# Generate detailed quote
def build_quote_payload(request: OnlineRequest) -> dict:
    """
    Returns:
    {
        "product": {...},
        "unit_price": 50000,
        "quantity": 1,
        "sub_total": 50000,
        "tax_amount": 9000,
        "gst_rate": 18,
        "delivery_cost": 0 (or amount),
        "total_amount": 59000,
        "payment_terms": {...},
        "quote_valid_until": "2026-07-24",
        "matched_vendors": [...]
    }
    """
```

---

## API Endpoints

### Customer Endpoints

```
POST   /api/v1/customer/requests/online/                    - Create request
GET    /api/v1/customer/requests/online/                    - List customer's requests
GET    /api/v1/customer/requests/online/{id}/               - Get request details
PATCH  /api/v1/customer/requests/online/{id}/               - Update request (DRAFT only)
DELETE /api/v1/customer/requests/online/{id}/               - Delete request (DRAFT only)

GET    /api/v1/customer/requests/online/{id}/quote/         - Get generated quote
POST   /api/v1/customer/requests/online/{id}/accept-quote/  - Accept quote
POST   /api/v1/customer/requests/online/{id}/cancel/        - Cancel request

GET    /api/v1/customer/requests/online/{id}/matching-vendors/ - Find vendors
```

### Admin Endpoints

```
GET    /api/v1/admin/requests/online/                       - All online requests (filtered)
GET    /api/v1/admin/requests/online/{id}/                  - Request details + audit

POST   /api/v1/admin/requests/online/{id}/generate-quote/   - Generate quote
POST   /api/v1/admin/requests/online/{id}/send-quote/       - Send quote to customer
POST   /api/v1/admin/requests/online/{id}/approve/          - Approve & create subscription/sale
POST   /api/v1/admin/requests/online/{id}/reject/           - Reject request

GET    /api/v1/admin/requests/online/{id}/actions/          - Audit trail
POST   /api/v1/admin/requests/online/{id}/note/             - Add internal note
```

---

## Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ONLINE REQUEST FLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. CUSTOMER INITIATES
   ↓
   POST /customer/requests/online/
   ├─ Product selected
   ├─ Request type chosen (EMI/RENT/LEASE/DIRECT_SALE)
   ├─ Delivery address selected
   └─ Creates OnlineRequest (DRAFT status)

2. QUOTE GENERATION
   ↓
   [System or Admin: Calculate pricing]
   ├─ Unit price (product or override)
   ├─ Tax calculation (18% GST)
   ├─ Delivery cost (from vendor service zones)
   ├─ Total = price + tax + delivery
   └─ Creates quote (stored in request)

3. QUOTE TO CUSTOMER
   ↓
   POST /admin/requests/online/{id}/send-quote/
   ├─ Email quote details
   ├─ Show payment terms
   ├─ Quote expires in 7 days
   └─ OnlineRequest.status = QUOTE_SENT

4. CUSTOMER ACCEPTS QUOTE
   ↓
   POST /customer/requests/online/{id}/accept-quote/
   ├─ Customer confirms
   └─ OnlineRequest.status = QUOTE_ACCEPTED

5. ADMIN APPROVAL & FULFILLMENT
   ↓
   POST /admin/requests/online/{id}/approve/
   ├─ Creates Subscription (EMI/RENT/LEASE) OR
   ├─ Creates Direct Sale (DIRECT_SALE) OR
   ├─ Creates Workbench item for fulfillment
   └─ OnlineRequest.status = APPROVED

6. COMPLETION
   ↓
   [Product handover, payment processing, etc.]
   └─ OnlineRequest.status = COMPLETED
```

---

## Auto-Transaction Creation

When request is approved, system automatically creates:

### For ADVANCE_EMI
```python
subscription = create_emi_subscription(
    customer=request.customer,
    product=request.product,
    batch=request.batch,
    lucky_number=request.preferred_lucky_number,
    tenure_months=request.preferred_tenure,
    performed_by=admin,
)
request.approved_subscription = subscription
```

### For DIRECT_SALE
```python
invoice = create_direct_sale(
    customer=request.customer,
    product=request.product,
    quantity=request.quantity,
    unit_price=request.unit_price,
    tax_rate=request.tax_percentage,
    performed_by=admin,
)
request.approved_direct_sale = invoice
```

### For RENT/LEASE
```python
subscription = create_rent_subscription(
    customer=request.customer,
    product=request.product,
    monthly_rent_amount=calculated_rent,
    tenure_months=request.preferred_tenure,
    performed_by=admin,
)
request.approved_subscription = subscription
```

---

## Workbench Integration

Each OnlineRequest creates a workbench item:

```python
# When request is created
workbench_item = create_workbench_item(
    module=WorkbenchModule.ONLINE_REQUEST,
    customer=request.customer,
    product=request.product,
    batch=request.batch,
    title=f"Online Request: {product.name}",
    description=f"{request_type} for {customer.name}",
    request_data={
        "online_request_id": request.id,
        "status": request.status,
        "quote_amount": request.total_amount,
    }
)

# When approved
complete_workbench_item(
    item_id=workbench_item.id,
    performed_by=admin,
    notes="Approved and subscription/sale created",
    result_data={
        "subscription_id": subscription.id,
        "contract_number": subscription.contract_number,
    }
)
```

---

## Request Lifecycle States

```
DRAFT
  └─→ [Admin generates quote]
      └─→ QUOTE_SENT
          ├─→ [Customer accepts]
          │   └─→ QUOTE_ACCEPTED
          │       └─→ [Admin approves]
          │           └─→ APPROVED
          │               └─→ [Subscription/Sale created]
          │                   └─→ COMPLETED
          │
          └─→ [Quote expires or customer rejects]
              └─→ REJECTED

Alternative paths:
DRAFT → REJECTED (admin rejects early)
DRAFT → CANCELLED (customer cancels before quote)
```

---

## Database Queries (Optimized)

### Customer Request List
```python
# Efficient: select_related + prefetch
OnlineRequest.objects.select_related(
    'customer',
    'product',
    'delivery_address',
    'batch',
    'approved_by'
).prefetch_related(
    'actions'
).filter(customer=customer).order_by('-created_at')
```

### Admin Dashboard Stats
```python
# Show pending quotes waiting for customer response
pending_quotes = OnlineRequest.objects.filter(
    status='QUOTE_SENT',
    quote_expiry_date__gte=today
).count()

# Show approved waiting for fulfillment
pending_fulfillment = OnlineRequest.objects.filter(
    status='APPROVED',
    approved_at__gte=datetime.now() - timedelta(days=7)
).count()
```

---

## Quote Email Template

```html
<h2>Your Product Quote</h2>

<p>Hi {{customer.name}},</p>

<p>We have prepared a quote for your request:</p>

<table>
  <tr><td>Product</td><td>{{product.name}}</td></tr>
  <tr><td>Request Type</td><td>{{request_type}}</td></tr>
  <tr><td>Unit Price</td><td>₹ {{unit_price}}</td></tr>
  <tr><td>Quantity</td><td>{{quantity}}</td></tr>
  <tr><td>Subtotal</td><td>₹ {{subtotal}}</td></tr>
  <tr><td>GST (18%)</td><td>₹ {{gst_amount}}</td></tr>
  <tr><td>Delivery Cost</td><td>₹ {{delivery_cost}}</td></tr>
  <tr><th>TOTAL</th><th>₹ {{total_amount}}</th></tr>
</table>

<p>Payment Terms: {{payment_terms}}</p>
<p>This quote is valid until {{quote_expiry_date}}</p>

<a href="{{accept_quote_link}}">Accept Quote</a>
```

---

## Testing Checklist

- [ ] Create online request (DRAFT)
- [ ] Generate quote
- [ ] Send quote to customer (email)
- [ ] Customer accepts quote
- [ ] Admin approves and subscription is auto-created
- [ ] Workbench item marked as completed
- [ ] Request status transitions correct
- [ ] Vendor delivery cost calculated
- [ ] Address geolocation used for matching
- [ ] Audit trail created
- [ ] API pagination works
- [ ] Error handling for invalid states
- [ ] Quote expiry date enforced

---

## Implementation Order

### Phase 3a: Core Models & Services
1. Create OnlineRequest & OnlineRequestAction models
2. Implement request creation service
3. Implement quote generation service
4. Implement approval workflow service

### Phase 3b: API Endpoints
1. Customer request endpoints
2. Admin request endpoints
3. Quote endpoints
4. Vendor matching endpoints

### Phase 3c: Integration
1. Integrate with workbench system
2. Integrate with subscription creation
3. Integrate with direct sale creation
4. Email notifications

### Phase 3d: Polish & Testing
1. Error handling
2. Validation
3. Testing
4. Documentation

---

## Next: Phase 4 (Full Integration)

After Phase 3, Phase 4 will:
- Complete customer journeys for all workflow types
- Connect order management to fulfillment
- Implement payment processing
- Add notification system
- Deploy to production

---

## Status

**Waiting for**: Pincode database load to complete  
**Ready to implement**: Online Request models + services  
**Estimated time**: 2-3 days for full Phase 3  

