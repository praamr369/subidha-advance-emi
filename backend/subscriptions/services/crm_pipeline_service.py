"""
Unified CRM Pipeline Service

Handles conversions:
PublicLead → OnlineRequest → ProductRequest/SubscriptionRequest → Subscription/DirectSale
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    PublicLead,
    OnlineRequest,
    ProductRequest,
    SubscriptionRequest,
    Customer,
    Product,
    Batch,
)


def create_online_request_from_lead(
    public_lead: PublicLead,
    request_type: str,
    quantity: int = 1,
    preferred_tenure: int = None,
    preferred_lucky_number: int = None,
    unit_price: Decimal = None,
) -> OnlineRequest:
    """
    Convert PublicLead to OnlineRequest (quote workflow)

    PublicLead may not have a Customer yet (unregistered)
    """
    from subscriptions.services.online_request_service import online_request_base_queryset

    # Get or create Customer if email/phone matches existing
    customer = None
    if public_lead.converted_customer:
        customer = public_lead.converted_customer

    # Create OnlineRequest
    online_request = OnlineRequest.objects.create(
        request_number=_generate_online_request_number(),
        customer=customer,  # May be NULL if not registered
        product=public_lead.product,
        batch=None,  # Can be set later
        request_type=request_type,
        quantity=quantity,
        preferred_tenure=preferred_tenure,
        preferred_lucky_number=preferred_lucky_number,
        unit_price=unit_price,
        status='DRAFT',
        source_public_lead=public_lead,
    )

    # Update PublicLead to track this OnlineRequest
    public_lead.converted_online_request = online_request
    public_lead.save(update_fields=['converted_online_request'])

    return online_request


def convert_online_request_to_product_request(
    online_request: OnlineRequest,
    requester_user,
    requester_role: str,
) -> ProductRequest:
    """
    Accept quote: OnlineRequest → ProductRequest

    Customer accepted the quote (either registered or via admin approval)
    """
    if not online_request.customer:
        raise ValueError(
            "OnlineRequest must have a customer before converting to ProductRequest"
        )

    # Create ProductRequest from OnlineRequest
    product_request = ProductRequest.objects.create(
        requester=requester_user,
        requester_role_snapshot=requester_role,
        partner=None,  # Can be set separately
        customer=online_request.customer,
        requested_customer_name=online_request.customer.name or '',
        requested_customer_phone=online_request.customer.phone_number or '',
        requested_customer_email=online_request.customer.user.email if online_request.customer.user else '',
        product=online_request.product,
        request_type=online_request.request_type,
        batch=online_request.batch,
        preferred_lucky_number=online_request.preferred_lucky_number,
        requested_tenure_months_snapshot=online_request.preferred_tenure,
        notes=f"Converted from OnlineRequest #{online_request.request_number}",
        status='SUBMITTED',
        source_public_lead=online_request.source_public_lead,
    )

    # Link OnlineRequest to ProductRequest
    online_request.converted_product_request = product_request
    online_request.status = 'QUOTE_ACCEPTED'
    online_request.save(update_fields=['converted_product_request', 'status'])

    # Update PublicLead if it exists
    if online_request.source_public_lead:
        online_request.source_public_lead.converted_product_request = product_request
        online_request.source_public_lead.save(update_fields=['converted_product_request'])

    return product_request


def convert_online_request_to_subscription_request(
    online_request: OnlineRequest,
    requester_user,
    requester_role: str,
    batch: Batch,
) -> SubscriptionRequest:
    """
    Accept quote: OnlineRequest → SubscriptionRequest

    Subscription-focused request (always requires batch)
    """
    if not online_request.customer:
        raise ValueError(
            "OnlineRequest must have a customer before converting to SubscriptionRequest"
        )

    # Create SubscriptionRequest from OnlineRequest
    subscription_request = SubscriptionRequest.objects.create(
        requester=requester_user,
        requester_role_snapshot=requester_role,
        partner=None,
        customer=online_request.customer,
        requested_customer_name=online_request.customer.name or '',
        requested_customer_phone=online_request.customer.phone_number or '',
        requested_customer_email=online_request.customer.user.email if online_request.customer.user else '',
        product=online_request.product,
        batch=batch,
        preferred_lucky_number=online_request.preferred_lucky_number or 0,
        requested_tenure_months_snapshot=online_request.preferred_tenure or 12,
        notes=f"Converted from OnlineRequest #{online_request.request_number}",
        status='SUBMITTED',
        source_public_lead=online_request.source_public_lead,
    )

    # Link OnlineRequest to SubscriptionRequest
    online_request.converted_subscription_request = subscription_request
    online_request.status = 'QUOTE_ACCEPTED'
    online_request.save(update_fields=['converted_subscription_request', 'status'])

    # Update PublicLead if it exists
    if online_request.source_public_lead:
        online_request.source_public_lead.converted_subscription_request = subscription_request
        online_request.source_public_lead.save(update_fields=['converted_subscription_request'])

    return subscription_request


def _generate_online_request_number() -> str:
    """Generate unique OnlineRequest number (e.g., ORQ-2026-00001)"""
    import datetime
    year = datetime.datetime.now().year
    count = OnlineRequest.objects.filter(
        request_number__startswith=f"ORQ-{year}"
    ).count() + 1
    return f"ORQ-{year}-{count:05d}"


def mark_public_lead_converted(
    public_lead: PublicLead,
    converted_by_user,
    subscription=None,
    direct_sale=None,
) -> PublicLead:
    """
    Final step: Mark PublicLead as fully converted with final transaction
    """
    public_lead.converted_subscription = subscription
    public_lead.converted_direct_sale = direct_sale
    public_lead.converted_by = converted_by_user
    public_lead.converted_at = timezone.now()
    public_lead.status = 'CONVERTED'
    public_lead.save()
    return public_lead


def get_public_lead_conversion_history(public_lead: PublicLead) -> dict:
    """
    Get complete conversion history: PublicLead → OnlineRequest → ProductRequest → Subscription
    """
    return {
        'public_lead': public_lead,
        'online_request': public_lead.converted_online_request,
        'product_request': public_lead.converted_product_request,
        'subscription_request': public_lead.converted_subscription_request,
        'subscription': public_lead.converted_subscription,
        'direct_sale': public_lead.converted_direct_sale,
        'converted_by': public_lead.converted_by,
        'converted_at': public_lead.converted_at,
    }
