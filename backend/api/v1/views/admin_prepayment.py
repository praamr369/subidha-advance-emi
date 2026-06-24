"""Admin views for advance EMI prepayment + early delivery unlock."""
from decimal import Decimal
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.shortcuts import get_object_or_404

from subscriptions.models import Subscription, Delivery, DeliveryStatus, FulfillmentStatus


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def prepayment_calculate_view(request, subscription_id):
    """
    Calculate prepayment threshold for advance delivery unlock.

    Returns:
    {
      "subscription_id": 123,
      "contract_ref": "ADV-EMI-2025-001",
      "customer_name": "John Doe",
      "plan_type": "ADVANCE_EMI",
      "total_emis": 12,
      "paid_emis": 2,
      "remaining_emis": 10,
      "monthly_amount": "₹8,500",
      "threshold_percentage": 60,
      "threshold_emis_needed": 6,
      "prepayment_required": "₹51,000",
      "status": "ACTIVE",
      "already_unlocked": false
    }
    """
    sub = get_object_or_404(Subscription, pk=subscription_id)

    # Calculate remaining EMIs
    total_emis = sub.tenure_months
    paid_count = sub.emi_payments.filter(status='PAID').count()  # Assuming EMI payments tracked
    remaining_emis = total_emis - paid_count

    if remaining_emis <= 0:
        return Response(
            {"error": "No remaining EMIs to pay."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Calculate threshold (60% minimum)
    threshold_percentage = 60
    threshold_emis = max(1, int(remaining_emis * Decimal(threshold_percentage) / Decimal("100")))
    prepayment_required = threshold_emis * sub.monthly_amount

    return Response({
        "subscription_id": sub.id,
        "contract_ref": sub.contract_reference,
        "customer_name": str(sub.customer),
        "plan_type": sub.plan_type,
        "total_emis": total_emis,
        "paid_emis": paid_count,
        "remaining_emis": remaining_emis,
        "monthly_amount": str(sub.monthly_amount),
        "threshold_percentage": threshold_percentage,
        "threshold_emis_needed": threshold_emis,
        "prepayment_required": str(prepayment_required),
        "status": sub.status,
        "already_unlocked": sub.advance_delivery_unlocked,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def prepayment_unlock_delivery_view(request, subscription_id):
    """
    Process prepayment and unlock advance delivery.

    Request:
    {
      "amount": "51000.00",
      "request_delivery": true
    }

    Response:
    {
      "success": true,
      "subscription_id": 123,
      "prepayment_amount": "51000.00",
      "prepayment_date": "2026-01-15T10:30:00Z",
      "advance_delivery_unlocked": true,
      "delivery_id": 456,
      "message": "Prepayment processed. Advance delivery unlocked."
    }
    """
    sub = get_object_or_404(Subscription, pk=subscription_id)

    amount = request.data.get('amount')
    request_delivery = request.data.get('request_delivery', False)

    if not amount:
        return Response(
            {"error": "Amount is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        amount = Decimal(amount)
    except:
        return Response(
            {"error": "Invalid amount format."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if amount <= 0:
        return Response(
            {"error": "Amount must be greater than zero."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate amount meets threshold
    total_emis = sub.tenure_months
    paid_count = sub.emi_payments.filter(status='PAID').count()
    remaining_emis = total_emis - paid_count

    if remaining_emis <= 0:
        return Response(
            {"error": "No remaining EMIs to prepay."},
            status=status.HTTP_400_BAD_REQUEST
        )

    threshold_emis = max(1, int(remaining_emis * Decimal("60") / Decimal("100")))
    minimum_required = threshold_emis * sub.monthly_amount

    if amount < minimum_required:
        return Response(
            {"error": f"Minimum prepayment required: ₹{minimum_required}. You entered: ₹{amount}"},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Process prepayment
    sub.advance_delivery_unlocked = True
    sub.prepayment_amount = amount
    sub.prepayment_date = timezone.now()
    sub.save(update_fields=['advance_delivery_unlocked', 'prepayment_amount', 'prepayment_date'])

    # Create or update delivery record
    delivery, created = Delivery.objects.get_or_create(
        subscription=sub,
        defaults={
            "status": DeliveryStatus.SCHEDULED if request_delivery else DeliveryStatus.PENDING,
        }
    )

    if request_delivery and delivery.status == DeliveryStatus.PENDING:
        delivery.status = DeliveryStatus.SCHEDULED
        delivery.save(update_fields=['status'])

    return Response({
        "success": True,
        "subscription_id": sub.id,
        "prepayment_amount": str(amount),
        "prepayment_date": sub.prepayment_date.isoformat(),
        "advance_delivery_unlocked": True,
        "delivery_id": delivery.id,
        "message": "Prepayment processed. Advance delivery unlocked.",
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def prepayment_list_view(request):
    """List all prepayments (admin audit)."""
    prepayments = Subscription.objects.filter(
        advance_delivery_unlocked=True,
        prepayment_amount__gt=0
    ).select_related('customer').order_by('-prepayment_date')

    results = []
    for sub in prepayments:
        results.append({
            "subscription_id": sub.id,
            "contract_ref": sub.contract_reference,
            "customer_name": str(sub.customer),
            "prepayment_amount": str(sub.prepayment_amount),
            "prepayment_date": sub.prepayment_date.isoformat() if sub.prepayment_date else None,
            "delivery_status": sub.delivery.status if hasattr(sub, 'delivery') else None,
        })

    return Response({
        "count": len(results),
        "results": results,
    })
