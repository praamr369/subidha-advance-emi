# Phase 3: Quick Start Guide

**Status**: Ready to Code  
**Estimated Duration**: 2-3 days  
**Team Capacity**: 1-2 developers  

---

## 🎯 Day 1: Core Models & Services

### Step 1: Create Models (2 hours)

**File**: `subscriptions/models_online_request.py`

```python
from django.db import models
from django.utils import timezone
from subscriptions.models import Customer, Product, Batch

class OnlineRequest(models.Model):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('QUOTE_SENT', 'Quote Sent'),
        ('QUOTE_ACCEPTED', 'Quote Accepted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('COMPLETED', 'Completed'),
    )
    
    REQUEST_TYPE_CHOICES = (
        ('ADVANCE_EMI', 'Advance EMI'),
        ('DIRECT_SALE', 'Direct Sale'),
        ('RENT', 'Rent'),
        ('LEASE', 'Lease'),
    )
    
    # Identification
    request_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    # Customer & Product
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    request_type = models.CharField(max_length=20, choices=REQUEST_TYPE_CHOICES)
    
    # Details
    quantity = models.IntegerField(default=1)
    preferred_tenure = models.IntegerField(null=True, blank=True)
    
    # Pricing
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=18.0)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    
    # Status & Approval
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT', db_index=True)
    approved_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Quotes
    quote_generated_at = models.DateTimeField(null=True, blank=True)
    quote_expiry_date = models.DateField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'online_request'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['customer', '-created_at']),
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['request_type']),
        ]
    
    def __str__(self):
        return f"{self.request_number} - {self.customer.name}"


class OnlineRequestAction(models.Model):
    ACTION_TYPES = (
        ('CREATED', 'Created'),
        ('QUOTE_GENERATED', 'Quote Generated'),
        ('QUOTE_SENT', 'Quote Sent'),
        ('QUOTE_ACCEPTED', 'Quote Accepted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('CANCELLED', 'Cancelled'),
    )
    
    request = models.ForeignKey(OnlineRequest, on_delete=models.CASCADE, related_name='actions')
    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)
    performed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    
    class Meta:
        db_table = 'online_request_action'
        ordering = ['-created_at']
```

### Step 2: Create Migrations (30 minutes)

```bash
python manage.py makemigrations subscriptions
python manage.py migrate subscriptions
```

### Step 3: Create Service Layer (2 hours)

**File**: `subscriptions/services/online_request_service.py`

```python
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from subscriptions.models_online_request import OnlineRequest, OnlineRequestAction
from subscriptions.models import Customer, Product


@transaction.atomic
def create_online_request(
    customer: Customer,
    product: Product,
    request_type: str,
    quantity: int = 1,
    preferred_tenure: int = None,
    unit_price: Decimal = None,
) -> OnlineRequest:
    """Create a new online request."""
    
    # Validate
    if not product.is_active:
        raise ValidationError("Product is inactive")
    
    # Generate request number
    count = OnlineRequest.objects.count() + 1
    request_number = f"ORQ-{timezone.now().year}-{count:05d}"
    
    # Create
    request = OnlineRequest.objects.create(
        request_number=request_number,
        customer=customer,
        product=product,
        request_type=request_type,
        quantity=quantity,
        preferred_tenure=preferred_tenure,
        unit_price=unit_price or product.base_price,
        status='DRAFT',
    )
    
    # Log action
    OnlineRequestAction.objects.create(
        request=request,
        action_type='CREATED',
        notes=f"Request created for {product.name}"
    )
    
    return request


@transaction.atomic
def generate_quote(request_id: int, discount: Decimal = Decimal(0)) -> dict:
    """Generate quote for request."""
    request = OnlineRequest.objects.get(pk=request_id)
    
    # Calculate amounts
    unit_price = request.unit_price or request.product.base_price
    sub_total = Decimal(request.quantity) * unit_price
    tax_rate = request.tax_percentage / 100
    gst_amount = sub_total * tax_rate
    total = sub_total + gst_amount - discount
    
    # Save
    request.total_amount = total
    request.gst_amount = gst_amount
    request.quote_generated_at = timezone.now()
    request.quote_expiry_date = timezone.now().date() + timezone.timedelta(days=7)
    request.save()
    
    # Log
    OnlineRequestAction.objects.create(
        request=request,
        action_type='QUOTE_GENERATED',
        metadata={'total_amount': str(total), 'gst': str(gst_amount)}
    )
    
    return {
        'unit_price': float(unit_price),
        'quantity': request.quantity,
        'sub_total': float(sub_total),
        'gst_rate': float(request.tax_percentage),
        'gst_amount': float(gst_amount),
        'total_amount': float(total),
        'quote_valid_until': request.quote_expiry_date.isoformat(),
    }


@transaction.atomic
def approve_request(request_id: int, approved_by, notes: str = '') -> OnlineRequest:
    """Approve request and create subscription/sale."""
    request = OnlineRequest.objects.get(pk=request_id)
    
    if request.status != 'QUOTE_ACCEPTED':
        raise ValidationError("Request must be in QUOTE_ACCEPTED status")
    
    # Approve
    request.status = 'APPROVED'
    request.approved_by = approved_by
    request.approved_at = timezone.now()
    request.save()
    
    # TODO: Auto-create subscription or sale based on request_type
    
    # Log
    OnlineRequestAction.objects.create(
        request=request,
        action_type='APPROVED',
        performed_by=approved_by,
        notes=notes
    )
    
    return request
```

---

## 🎯 Day 2: API Endpoints

### Step 1: Create Serializers (1 hour)

**File**: `api/v1/serializers/online_request.py`

```python
from rest_framework import serializers
from subscriptions.models_online_request import OnlineRequest, OnlineRequestAction


class OnlineRequestActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnlineRequestAction
        fields = ['id', 'action_type', 'performed_by', 'notes', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class OnlineRequestSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    actions = OnlineRequestActionSerializer(many=True, read_only=True)
    
    class Meta:
        model = OnlineRequest
        fields = [
            'id', 'request_number', 'customer', 'customer_name',
            'product', 'product_name', 'request_type', 'quantity',
            'unit_price', 'total_amount', 'gst_amount', 'tax_percentage',
            'status', 'quote_expiry_date', 'approved_at', 'created_at',
            'actions',
        ]
        read_only_fields = ['id', 'request_number', 'total_amount', 'gst_amount', 'created_at']
```

### Step 2: Create Views (2 hours)

**File**: `api/v1/views/online_request.py`

```python
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from api.v1.permissions import IsCustomer, IsAdmin
from api.v1.serializers.online_request import OnlineRequestSerializer
from subscriptions.models_online_request import OnlineRequest
from subscriptions.services.online_request_service import (
    create_online_request,
    generate_quote,
    approve_request,
)


class CustomerRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]
    
    def get(self, request):
        requests = OnlineRequest.objects.filter(customer__user=request.user)
        serializer = OnlineRequestSerializer(requests, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        try:
            req = create_online_request(
                customer=request.user.customer,
                product_id=request.data['product_id'],
                request_type=request.data['request_type'],
                quantity=request.data.get('quantity', 1),
                preferred_tenure=request.data.get('preferred_tenure'),
            )
            serializer = OnlineRequestSerializer(req)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminApproveRequestView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    
    def post(self, request, pk):
        try:
            req = approve_request(
                request_id=pk,
                approved_by=request.user,
                notes=request.data.get('notes', ''),
            )
            serializer = OnlineRequestSerializer(req)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
```

### Step 3: Add Routes (30 minutes)

**File**: `api/v1/routes/online_request.py`

```python
from django.urls import path
from api.v1.views.online_request import (
    CustomerRequestListView,
    AdminApproveRequestView,
)

urlpatterns = [
    path('customer/requests/online/', CustomerRequestListView.as_view()),
    path('admin/requests/online/<int:pk>/approve/', AdminApproveRequestView.as_view()),
]
```

---

## 🎯 Day 3: Integration & Testing

### Step 1: Integrate with Workbench (1 hour)

```python
# In create_online_request function, add:
from subscriptions.services.workbench_service import create_workbench_item, WorkbenchModule

workbench_item = create_workbench_item(
    module=WorkbenchModule.ONLINE_REQUEST,
    customer=customer,
    product=product,
    title=f"Online Request: {product.name}",
    request_data={'online_request_id': request.id}
)
request.workbench_item = workbench_item
```

### Step 2: Test All Endpoints (2 hours)

```bash
# Create request
curl -X POST http://localhost:8000/api/v1/customer/requests/online/ \
  -H "Authorization: Bearer TOKEN" \
  -d '{"product_id": 1, "request_type": "DIRECT_SALE", "quantity": 1}'

# Generate quote
curl -X POST http://localhost:8000/api/v1/customer/requests/online/1/quote/ \
  -H "Authorization: Bearer TOKEN"

# Approve (as admin)
curl -X POST http://localhost:8000/api/v1/admin/requests/online/1/approve/ \
  -H "Authorization: Bearer TOKEN" \
  -d '{"notes": "Approved"}'
```

### Step 3: Create Tests (1 hour)

```python
# tests/api/test_online_request.py
from django.test import TestCase
from subscriptions.models import Customer, Product
from subscriptions.models_online_request import OnlineRequest

class OnlineRequestTestCase(TestCase):
    def setUp(self):
        self.product = Product.objects.create(name='Test Product', base_price=50000)
        self.customer = Customer.objects.create(name='Test Customer')
    
    def test_create_request(self):
        from subscriptions.services.online_request_service import create_online_request
        req = create_online_request(
            customer=self.customer,
            product=self.product,
            request_type='DIRECT_SALE'
        )
        self.assertEqual(req.status, 'DRAFT')
        self.assertTrue(req.request_number.startswith('ORQ-'))
```

---

## ✅ Checklist

### Day 1
- [ ] Models created
- [ ] Migrations applied
- [ ] Service functions implemented
- [ ] Tests for services passing

### Day 2
- [ ] Serializers created
- [ ] API views implemented
- [ ] Routes added
- [ ] Basic endpoint tests passing

### Day 3
- [ ] Workbench integration done
- [ ] Full integration tests passing
- [ ] Edge cases handled
- [ ] Error handling complete

---

## 🚀 Commands Ready

```bash
# Makemigrations
python manage.py makemigrations subscriptions

# Migrate
python manage.py migrate subscriptions

# Run tests
python manage.py test tests.api.test_online_request -v 2

# Run server
python manage.py runserver 0.0.0.0:8000
```

---

## 📞 Support Files

- `PHASE_3_ONLINE_REQUEST_APIs.md` - Full architecture
- `SETUP_GUIDE_PHASE1B_2.md` - Integration guide
- `SESSION_COMPLETION_REPORT.md` - Status report

---

## 🎊 You're Ready!

All foundation is in place. Start with Step 1 above. Good luck! 🚀

