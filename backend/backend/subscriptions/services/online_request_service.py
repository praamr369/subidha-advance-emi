from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from subscriptions.models_online_request import OnlineRequest, OnlineRequestAction
from subscriptions.models import Customer, Product, Batch
from subscriptions.services.subscription_service import (
    create_emi_subscription,
    create_rent_subscription,
    create_lease_subscription,
)
from billing.services.billing_service import create_direct_sale


def online_request_base_queryset():
    """Optimized queryset for online requests"""
    return OnlineRequest.objects.select_related(
        'customer',
        'customer__user',
        'product',
        'batch',
        'approved_by',
        'approved_subscription',
        'approved_direct_sale',
    ).prefetch_related('actions')


@transaction.atomic
def create_online_request(
    *,
    customer: Customer,
    product: Product,
    request_type: str,
    quantity: int = 1,
    preferred_tenure: int = None,
    unit_price: Decimal = None,
    batch: Batch = None,
    preferred_lucky_number: int = None,
) -> OnlineRequest:
    """Create a new online request (DRAFT status)"""

    # Validate product
    if not product.is_active:
        raise ValidationError({'product_id': 'Product is inactive.'})

    # Validate request type
    valid_types = [t[0] for t in OnlineRequest.REQUEST_TYPE_CHOICES]
    if request_type not in valid_types:
        raise ValidationError({'request_type': f'Invalid request type. Choose from {valid_types}'})

    # Generate unique request number
    count = OnlineRequest.objects.count() + 1
    request_number = f"ORQ-{timezone.now().year}-{count:05d}"

    # Prepare unit price
    if unit_price is None:
        unit_price = Decimal(str(product.base_price))
    else:
        unit_price = Decimal(str(unit_price))

    # Calculate subtotal
    sub_total = unit_price * Decimal(str(quantity))

    # Create request
    request_obj = OnlineRequest.objects.create(
        request_number=request_number,
        customer=customer,
        product=product,
        batch=batch,
        request_type=request_type,
        quantity=quantity,
        preferred_tenure=preferred_tenure,
        preferred_lucky_number=preferred_lucky_number,
        unit_price=unit_price,
        sub_total=sub_total,
        status='DRAFT',
    )

    # Log action
    OnlineRequestAction.objects.create(
        request=request_obj,
        action_type='CREATED',
        notes=f"Request created for {product.name}",
    )

    return request_obj


@transaction.atomic
def generate_quote(
    *,
    request_id: int,
    discount_amount: Decimal = Decimal(0),
    delivery_cost: Decimal = Decimal(0),
    performed_by=None,
) -> dict:
    """Generate quote for online request"""

    request = OnlineRequest.objects.get(pk=request_id)

    # Calculate amounts
    sub_total = request.sub_total or (request.unit_price * Decimal(str(request.quantity)))
    tax_rate = request.tax_percentage / Decimal(100)
    gst_amount = (sub_total * tax_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    total = sub_total + gst_amount + delivery_cost - discount_amount

    # Save calculated amounts
    request.sub_total = sub_total
    request.gst_amount = gst_amount
    request.delivery_cost = delivery_cost
    request.discount_amount = discount_amount
    request.total_amount = total
    request.quote_generated_at = timezone.now()
    request.quote_expiry_date = (timezone.now() + timezone.timedelta(days=7)).date()
    request.save()

    # Log action
    OnlineRequestAction.objects.create(
        request=request,
        action_type='QUOTE_GENERATED',
        performed_by=performed_by,
        metadata={
            'sub_total': str(sub_total),
            'gst_amount': str(gst_amount),
            'delivery_cost': str(delivery_cost),
            'discount': str(discount_amount),
            'total_amount': str(total),
        },
    )

    return {
        'request_id': request.id,
        'request_number': request.request_number,
        'product': request.product.name,
        'quantity': request.quantity,
        'unit_price': float(request.unit_price),
        'sub_total': float(sub_total),
        'tax_rate': float(request.tax_percentage),
        'gst_amount': float(gst_amount),
        'delivery_cost': float(delivery_cost),
        'discount_amount': float(discount_amount),
        'total_amount': float(total),
        'quote_valid_until': request.quote_expiry_date.isoformat(),
    }


@transaction.atomic
def send_quote(
    *,
    request_id: int,
    performed_by,
) -> OnlineRequest:
    """Mark quote as sent to customer"""

    request = OnlineRequest.objects.get(pk=request_id)

    if request.status != 'DRAFT':
        raise ValidationError({'detail': 'Quote can only be sent for DRAFT requests.'})

    if not request.quote_generated_at:
        raise ValidationError({'detail': 'Quote must be generated before sending.'})

    request.status = 'QUOTE_SENT'
    request.save()

    OnlineRequestAction.objects.create(
        request=request,
        action_type='QUOTE_SENT',
        performed_by=performed_by,
        notes='Quote sent to customer',
    )

    return request


@transaction.atomic
def accept_quote(
    *,
    request_id: int,
    accepted_by=None,
) -> OnlineRequest:
    """Customer accepts quote"""

    request = OnlineRequest.objects.get(pk=request_id)

    if request.status != 'QUOTE_SENT':
        raise ValidationError({'detail': 'Can only accept QUOTE_SENT requests.'})

    if request.is_quote_expired:
        raise ValidationError({'detail': 'Quote has expired.'})

    request.status = 'QUOTE_ACCEPTED'
    request.save()

    OnlineRequestAction.objects.create(
        request=request,
        action_type='QUOTE_ACCEPTED',
        performed_by=accepted_by,
        notes='Customer accepted quote',
    )

    return request


@transaction.atomic
def approve_online_request(
    *,
    request_id: int,
    approved_by,
    approval_notes: str = '',
    create_transaction: bool = True,
) -> (OnlineRequest, object):
    """Approve online request and optionally create subscription/sale"""

    request = online_request_base_queryset().select_for_update().get(pk=request_id)

    if request.status != 'QUOTE_ACCEPTED':
        raise ValidationError({'detail': 'Only QUOTE_ACCEPTED requests can be approved.'})

    # Approve
    request.status = 'APPROVED'
    request.approved_by = approved_by
    request.approved_at = timezone.now()
    request.approval_notes = approval_notes
    request.save()

    # Create linked transaction if requested
    transaction_obj = None
    if create_transaction:
        try:
            if request.request_type == 'ADVANCE_EMI':
                transaction_obj = create_emi_subscription(
                    customer=request.customer,
                    product=request.product,
                    batch=request.batch,
                    lucky_number=request.preferred_lucky_number,
                    tenure_months=request.preferred_tenure or 12,
                    performed_by=approved_by,
                )
                request.approved_subscription = transaction_obj

            elif request.request_type == 'DIRECT_SALE':
                transaction_obj = create_direct_sale(
                    payload={
                        'customer': request.customer,
                        'sale_date': timezone.now().date(),
                        'status': 'DRAFT',
                        'lines': [
                            {
                                'product': request.product,
                                'quantity': request.quantity,
                                'unit_price': request.unit_price,
                            }
                        ],
                    },
                    created_by=approved_by,
                )
                request.approved_direct_sale = transaction_obj

            elif request.request_type == 'RENT':
                monthly_rent = request.unit_price / 12
                transaction_obj = create_rent_subscription(
                    customer=request.customer,
                    product=request.product,
                    monthly_rent_amount=monthly_rent,
                    tenure_months=request.preferred_tenure or 12,
                    performed_by=approved_by,
                )
                request.approved_subscription = transaction_obj

            elif request.request_type == 'LEASE':
                monthly_lease = request.unit_price / 24
                transaction_obj = create_lease_subscription(
                    customer=request.customer,
                    product=request.product,
                    monthly_lease_amount=monthly_lease,
                    tenure_months=request.preferred_tenure or 24,
                    performed_by=approved_by,
                )
                request.approved_subscription = transaction_obj

            request.save()
        except Exception as e:
            raise ValidationError({'detail': f'Failed to create transaction: {str(e)}'})

    # Log action
    OnlineRequestAction.objects.create(
        request=request,
        action_type='APPROVED',
        performed_by=approved_by,
        notes=approval_notes,
        metadata={'transaction_type': request.request_type},
    )

    return request, transaction_obj


@transaction.atomic
def reject_online_request(
    *,
    request_id: int,
    rejected_by,
    rejection_reason: str = '',
) -> OnlineRequest:
    """Reject online request"""

    request = OnlineRequest.objects.get(pk=request_id)

    if request.status in ['APPROVED', 'REJECTED', 'COMPLETED']:
        raise ValidationError({'detail': f'Cannot reject {request.get_status_display()} request.'})

    request.status = 'REJECTED'
    request.save()

    OnlineRequestAction.objects.create(
        request=request,
        action_type='REJECTED',
        performed_by=rejected_by,
        notes=rejection_reason,
    )

    return request


@transaction.atomic
def cancel_online_request(
    *,
    request_id: int,
    cancelled_by,
    cancellation_reason: str = '',
) -> OnlineRequest:
    """Cancel online request"""

    request = OnlineRequest.objects.get(pk=request_id)

    if request.status in ['APPROVED', 'COMPLETED', 'CANCELLED']:
        raise ValidationError({'detail': f'Cannot cancel {request.get_status_display()} request.'})

    request.status = 'CANCELLED'
    request.save()

    OnlineRequestAction.objects.create(
        request=request,
        action_type='CANCELLED',
        performed_by=cancelled_by,
        notes=cancellation_reason,
    )

    return request


@transaction.atomic
def complete_online_request(
    *,
    request_id: int,
    completed_by,
    completion_notes: str = '',
) -> OnlineRequest:
    """Mark online request as completed"""

    request = OnlineRequest.objects.get(pk=request_id)

    if request.status != 'APPROVED':
        raise ValidationError({'detail': 'Only APPROVED requests can be completed.'})

    request.status = 'COMPLETED'
    request.save()

    OnlineRequestAction.objects.create(
        request=request,
        action_type='COMPLETED',
        performed_by=completed_by,
        notes=completion_notes,
    )

    return request
