"""
CRM Approval Workflow Service
Handles lead approval, auto-conversion to contracts, and customer notifications
"""

from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model

User = get_user_model()

from subscriptions.models import (
    PublicLead,
    OnlineRequest,
    Subscription,
    Product,
)
from crm.models import CRMPipeline
from billing.models import DirectSale


def approve_online_request(
    online_request: OnlineRequest,
    approval_type: str,
    approval_user: User,
    auto_convert: bool = True,
    notes: str = ''
):
    """
    Approve lead for specific contract type.
    Auto-creates contract if auto_convert=True.
    Updates CRM Pipeline tracking.

    Args:
        online_request: OnlineRequest to approve
        approval_type: 'DIRECT_SALE', 'SUBSCRIPTION', 'RENT', 'LEASE'
        approval_user: User approving the request
        auto_convert: Auto-create contract on approval
        notes: Approval notes

    Returns:
        Created contract (DirectSale/Subscription) or None
    """

    # Step 1: Update approval status on OnlineRequest
    online_request.approval_status = 'APPROVED'
    online_request.approved_by = approval_user
    online_request.approved_at = timezone.now()
    online_request.approved_entity_type = approval_type
    online_request.conversion_notes = notes
    online_request.status = 'APPROVED'

    created_contract = None

    # Step 2: Auto-create contract based on approval type
    if auto_convert:
        if approval_type == 'DIRECT_SALE':
            created_contract = create_direct_sale_from_enquiry(online_request, created_by=approval_user)
            online_request.approved_direct_sale = created_contract

        elif approval_type == 'SUBSCRIPTION':
            created_contract = create_subscription_from_enquiry(online_request)
            online_request.approved_subscription = created_contract

        elif approval_type == 'RENT':
            # Rent is a type of Subscription with RENT plan_type
            created_contract = create_subscription_from_enquiry(online_request, plan_type='RENT')
            online_request.approved_subscription = created_contract
            online_request.approved_rent_profile = created_contract.rent_profile if hasattr(created_contract, 'rent_profile') else None

        elif approval_type == 'LEASE':
            # Lease is a type of Subscription with LEASE plan_type
            created_contract = create_subscription_from_enquiry(online_request, plan_type='LEASE')
            online_request.approved_subscription = created_contract
            online_request.approved_lease_profile = created_contract.lease_profile if hasattr(created_contract, 'lease_profile') else None

    online_request.save()

    # Step 3: Update CRM Pipeline
    try:
        pipeline = CRMPipeline.objects.get(online_request=online_request)
    except CRMPipeline.DoesNotExist:
        # Create pipeline if it doesn't exist
        if not online_request.source_public_lead:
            lead = PublicLead.objects.create(
                name=online_request.customer.name if online_request.customer else 'Unknown',
                phone=online_request.customer.phone if online_request.customer else '',
                email=online_request.customer.email if hasattr(online_request.customer, 'email') else '',
            )
        else:
            lead = online_request.source_public_lead

        pipeline = CRMPipeline.objects.create(
            lead=lead,
            online_request=online_request,
            request_type=online_request.request_type,
        )

    pipeline.current_stage = 'APPROVED'
    pipeline.approved_by = approval_user
    pipeline.approved_at = timezone.now()
    pipeline.converted_to = approval_type
    pipeline.quoted_amount = float(online_request.total_amount or 0)

    if created_contract:
        pipeline.converted_entity_id = created_contract.id
        pipeline.revenue = float(getattr(created_contract, 'grand_total', 0) or getattr(created_contract, 'total_amount', 0))
        pipeline.current_stage = 'CONVERTED'

    pipeline.save()

    # Step 4: Send notifications
    send_approval_notification(online_request, created_contract)

    # Step 5: Post to accounting (GL entries)
    if created_contract:
        from crm.services.crm_gl_posting_service import post_approval_to_accounting
        try:
            post_approval_to_accounting(created_contract, approval_type, approval_user)
        except Exception as e:
            print(f"GL posting warning: {str(e)}")

    return created_contract


def create_direct_sale_from_enquiry(online_request: OnlineRequest, created_by=None) -> DirectSale:
    """
    Auto-create DirectSale from approved OnlineRequest.

    Routed through billing_service.create_direct_sale so the document series,
    financial year, tax profile snapshot and line totals are all issued the same
    way as a manually created sale.
    """
    from billing.services.billing_service import create_direct_sale

    return create_direct_sale(
        payload={
            'customer': online_request.customer,
            'sale_date': timezone.localdate(),
            'delivery_required': True,
            'delivery_reference': (online_request.request_number or '')[:64],
            'notes': f'Auto-created from approval of {online_request.request_number}',
            'lines': [
                {
                    'product': online_request.product,
                    'quantity': Decimal(str(online_request.quantity or 1)),
                    'unit_price': online_request.unit_price
                    if online_request.unit_price is not None
                    else (online_request.product.base_price or Decimal('0')),
                    'gst_rate': online_request.tax_percentage,
                }
            ],
        },
        created_by=created_by,
    )


def create_subscription_from_enquiry(
    online_request: OnlineRequest,
    plan_type: str = 'EMI'
) -> Subscription:
    """Auto-create Subscription from approved OnlineRequest"""

    # Calculate EMI if needed
    tenure = online_request.preferred_tenure or 24
    total = float(online_request.total_amount or 0)
    monthly_amount = Decimal(str(total / tenure)) if tenure > 0 else Decimal('0')

    sub = Subscription.objects.create(
        customer=online_request.customer,
        online_request=online_request,
        product=online_request.product,
        plan_type=plan_type,
        status='DRAFT',
        monthly_amount=monthly_amount,
        tenure_months=tenure,
        total_amount=online_request.total_amount or Decimal('0'),
        start_date=timezone.now().date(),
        notes=f'Auto-created from approval of {online_request.request_number}',
    )

    # Auto-create EMI schedule
    create_emi_schedule(sub)

    return sub


def create_emi_schedule(subscription: Subscription):
    """Create monthly EMI schedule for subscription"""
    from subscriptions.models import EMI

    # Calculate EMI details
    monthly_amount = subscription.monthly_amount
    tenure = subscription.tenure_months
    start_date = subscription.start_date or timezone.now().date()

    # Clear existing EMIs
    EMI.objects.filter(subscription=subscription).delete()

    # Create EMI records for each month
    from dateutil.relativedelta import relativedelta

    for month_num in range(1, tenure + 1):
        due_date = start_date + relativedelta(months=month_num)

        EMI.objects.create(
            subscription=subscription,
            emi_number=month_num,
            due_date=due_date,
            amount=monthly_amount,
            status='PENDING',
        )


def send_approval_notification(online_request: OnlineRequest, contract=None):
    """Send approval notification to customer via SMS and Email"""

    if not online_request.customer:
        return

    customer = online_request.customer
    contract_type = type(contract).__name__ if contract else 'Contract'

    # Prepare message
    if contract:
        message = (
            f"Hi {customer.name}, your {online_request.request_type} request has been approved! "
            f"Your {contract_type} is ready. Please check your email for details."
        )
        email_subject = f"Approval Confirmed - {online_request.request_type}"
    else:
        message = (
            f"Hi {customer.name}, your {online_request.request_type} request has been approved! "
            f"Our team will contact you shortly."
        )
        email_subject = f"Request Approved - {online_request.request_type}"

    # Send SMS
    try:
        send_sms(customer.phone, message)
    except Exception as e:
        print(f"SMS send failed: {str(e)}")

    # Send Email
    try:
        send_email(
            email=customer.email,
            subject=email_subject,
            template='approval_notification',
            context={
                'customer_name': customer.name,
                'request_type': online_request.request_type,
                'contract': contract,
                'message': message,
            }
        )
    except Exception as e:
        print(f"Email send failed: {str(e)}")


def send_sms(phone: str, message: str):
    """Send SMS notification (stub - integrate with SMS provider)"""
    # TODO: Integrate with SMS provider (Twilio, AWS SNS, etc.)
    print(f"SMS to {phone}: {message}")


def send_email(email: str, subject: str, template: str, context: dict):
    """Send email notification (stub - integrate with email provider)"""
    # TODO: Integrate with email provider (Django Email, SendGrid, etc.)
    print(f"Email to {email} - Subject: {subject}")
    print(f"Template: {template}, Context: {context}")


def move_pipeline_stage(pipeline: CRMPipeline, new_stage: str):
    """Move lead to new stage with validation"""
    try:
        pipeline.move_to_stage(new_stage)
        return pipeline
    except ValueError as e:
        raise ValueError(f'Invalid stage transition: {str(e)}')


def get_pipeline_metrics(days: int = 30):
    """Get CRM pipeline health metrics"""
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Count, Sum, Avg, F, DurationField, ExpressionWrapper

    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)

    pipelines = CRMPipeline.objects.filter(created_at__range=[start_date, end_date])

    avg_duration = pipelines.aggregate(
        avg_days=Avg(
            ExpressionWrapper(F('updated_at') - F('created_at'), output_field=DurationField())
        )
    )['avg_days']

    metrics = {
        'total_leads': pipelines.count(),
        'by_stage': dict(
            pipelines.values('current_stage').annotate(count=Count('id')).values_list('current_stage', 'count')
        ),
        'by_type': dict(
            pipelines.values('request_type').annotate(count=Count('id')).values_list('request_type', 'count')
        ),
        'approved_count': pipelines.filter(current_stage__in=['APPROVED', 'CONVERTED']).count(),
        'converted_count': pipelines.filter(current_stage__in=['CONVERTED', 'ACTIVE', 'WON']).count(),
        'total_revenue': float(pipelines.aggregate(Sum('revenue'))['revenue__sum'] or 0),
        'average_days_in_pipeline': int((avg_duration or timedelta(0)).total_seconds() / 86400),
    }

    return metrics
