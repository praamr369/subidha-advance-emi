from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from subscriptions.models import Customer, Product, Batch
from subscriptions.models_workbench import (
    WorkbenchItem,
    WorkbenchAction,
    WorkbenchModule,
    WorkbenchItemStatus,
)


def workbench_base_queryset():
    return WorkbenchItem.objects.select_related(
        "customer",
        "product",
        "batch",
        "assigned_to",
    ).prefetch_related("actions")


@transaction.atomic
def create_workbench_item(
    *,
    module: str,
    customer: Customer,
    product: Product,
    title: str,
    description: str = "",
    request_data: dict = None,
    batch: Batch = None,
    priority: int = 0,
    due_date=None,
) -> WorkbenchItem:
    """Create a new workbench item for a customer."""
    if not WorkbenchModule(module):
        raise ValidationError({"module": "Invalid workbench module."})

    item = WorkbenchItem.objects.create(
        module=module,
        customer=customer,
        product=product,
        batch=batch,
        title=title,
        description=description,
        request_data=request_data or {},
        priority=priority,
        due_date=due_date,
        status=WorkbenchItemStatus.OPEN,
    )
    return item


@transaction.atomic
def assign_workbench_item(
    *,
    item_id: int,
    assigned_to,
    performed_by,
) -> WorkbenchItem:
    """Assign a workbench item to a user."""
    item = WorkbenchItem.objects.select_for_update().get(pk=item_id)
    item.assigned_to = assigned_to
    item.assigned_at = timezone.now()
    item.status = WorkbenchItemStatus.ASSIGNED
    item.save()

    WorkbenchAction.objects.create(
        workbench_item=item,
        action_type="SCHEDULE",
        performed_by=performed_by,
        notes=f"Assigned to {assigned_to.get_full_name() or assigned_to.username}",
    )
    return item


@transaction.atomic
def complete_workbench_item(
    *,
    item_id: int,
    performed_by,
    notes: str = "",
    result_data: dict = None,
) -> WorkbenchItem:
    """Mark a workbench item as completed."""
    item = WorkbenchItem.objects.select_for_update().get(pk=item_id)
    if item.status == WorkbenchItemStatus.COMPLETED:
        raise ValidationError({"detail": "Item is already completed."})

    item.status = WorkbenchItemStatus.COMPLETED
    item.completed_at = timezone.now()
    item.save()

    WorkbenchAction.objects.create(
        workbench_item=item,
        action_type="COMPLETE",
        performed_by=performed_by,
        notes=notes,
        result_data=result_data or {},
    )
    return item


@transaction.atomic
def cancel_workbench_item(
    *,
    item_id: int,
    performed_by,
    notes: str = "",
) -> WorkbenchItem:
    """Cancel a workbench item."""
    item = WorkbenchItem.objects.select_for_update().get(pk=item_id)
    if item.status in [WorkbenchItemStatus.COMPLETED, WorkbenchItemStatus.CANCELLED]:
        raise ValidationError({"detail": f"Cannot cancel {item.get_status_display()} item."})

    item.status = WorkbenchItemStatus.CANCELLED
    item.save()

    WorkbenchAction.objects.create(
        workbench_item=item,
        action_type="NOTE",
        performed_by=performed_by,
        notes=f"Cancelled: {notes}",
    )
    return item


@transaction.atomic
def add_workbench_action(
    *,
    item_id: int,
    action_type: str,
    performed_by,
    notes: str = "",
    result_data: dict = None,
) -> WorkbenchAction:
    """Add an action to a workbench item."""
    item = WorkbenchItem.objects.get(pk=item_id)
    action = WorkbenchAction.objects.create(
        workbench_item=item,
        action_type=action_type,
        performed_by=performed_by,
        notes=notes,
        result_data=result_data or {},
    )
    return action


def get_customer_workbench(customer: Customer, module: str = None):
    """Get all workbench items for a customer, optionally filtered by module."""
    qs = workbench_base_queryset().filter(customer=customer).exclude(status=WorkbenchItemStatus.CANCELLED)
    if module:
        qs = qs.filter(module=module)
    return qs


def get_user_assigned_items(user, status: str = None):
    """Get all workbench items assigned to a user."""
    qs = workbench_base_queryset().filter(assigned_to=user)
    if status:
        qs = qs.filter(status=status)
    return qs


# Module-specific workbench logic

@transaction.atomic
def workbench_direct_sale_create(
    *,
    customer: Customer,
    product: Product,
    quantity: int = 1,
    unit_price: float = None,
) -> WorkbenchItem:
    """Create a Direct Sale workbench item."""
    if unit_price is None:
        unit_price = product.base_price

    return create_workbench_item(
        module=WorkbenchModule.DIRECT_SALE,
        customer=customer,
        product=product,
        title=f"Direct Sale: {product.name} x{quantity}",
        description=f"Direct sale request for {product.name}",
        request_data={
            "quantity": quantity,
            "unit_price": float(unit_price),
            "total": quantity * float(unit_price),
        },
        priority=1,
    )


@transaction.atomic
def workbench_online_request_create(
    *,
    customer: Customer,
    product: Product,
    request_type: str,
    batch: Batch = None,
    preferred_lucky_number: int = None,
) -> WorkbenchItem:
    """Create an Online Request workbench item."""
    title = f"Online Request: {product.name} ({request_type})"
    return create_workbench_item(
        module=WorkbenchModule.ONLINE_REQUEST,
        customer=customer,
        product=product,
        batch=batch,
        title=title,
        description=f"{request_type} request for {product.name}",
        request_data={
            "request_type": request_type,
            "batch_id": batch.id if batch else None,
            "preferred_lucky_number": preferred_lucky_number,
        },
        priority=2,
    )


@transaction.atomic
def workbench_subscription_create(
    *,
    customer: Customer,
    product: Product,
    plan_type: str,
    tenure_months: int,
    batch: Batch = None,
) -> WorkbenchItem:
    """Create a Subscription workbench item."""
    title = f"Subscription: {product.name} ({plan_type}, {tenure_months}mo)"
    return create_workbench_item(
        module=WorkbenchModule.SUBSCRIPTION,
        customer=customer,
        product=product,
        batch=batch,
        title=title,
        description=f"{plan_type} subscription for {tenure_months} months",
        request_data={
            "plan_type": plan_type,
            "tenure_months": tenure_months,
        },
        priority=2,
    )


@transaction.atomic
def workbench_vendor_create(
    *,
    customer: Customer,
    product: Product,
    vendor_id: int,
    service_details: dict = None,
) -> WorkbenchItem:
    """Create a Vendor Dashboard workbench item."""
    title = f"Vendor Service: {product.name}"
    return create_workbench_item(
        module=WorkbenchModule.VENDOR,
        customer=customer,
        product=product,
        title=title,
        description="Vendor service request",
        request_data={
            "vendor_id": vendor_id,
            "service_details": service_details or {},
        },
        priority=1,
    )


class WorkbenchService:
    """Unified workbench service for customer request lifecycle"""

    @staticmethod
    def get_customer_workbench(customer_id: int):
        """Get complete unified workbench for a customer"""
        from subscriptions.models import OnlineRequest, ProductRequest, Subscription, PublicLead
        from billing.models import DirectSale

        try:
            customer = Customer.objects.get(id=customer_id)
        except Customer.DoesNotExist:
            raise ValueError(f"Customer not found: {customer_id}")

        # Get all related data
        online_requests = OnlineRequest.objects.filter(
            customer=customer
        ).values('id', 'request_number', 'status', 'request_type', 'product__name', 'total_amount', 'created_at')

        product_requests = ProductRequest.objects.filter(
            customer=customer
        ).values('id', 'request_type', 'status', 'product__name', 'created_at')

        invoices = DirectSale.objects.filter(
            customer=customer
        ).values('id', 'grand_total', 'status', 'created_at')

        subscriptions = Subscription.objects.filter(
            customer=customer
        ).values('id', 'plan_type', 'status', 'created_at')

        try:
            crm_lead = PublicLead.objects.filter(
                converted_customer=customer
            ).first() or PublicLead.objects.filter(
                email=customer.user.email if customer.user else None
            ).first() if customer.user else None

            if crm_lead:
                crm_lead_data = {
                    'id': crm_lead.id,
                    'status': crm_lead.status,
                    'assigned_to': crm_lead.assigned_to.get_full_name() if crm_lead.assigned_to else None,
                    'notes': crm_lead.notes or '',
                    'created_at': crm_lead.created_at,
                }
            else:
                crm_lead_data = None
        except PublicLead.DoesNotExist:
            crm_lead_data = None

        # Build timeline
        timeline = WorkbenchService._build_timeline(customer, online_requests, product_requests)

        # Determine next actions
        next_actions = WorkbenchService._determine_actions(online_requests, product_requests)

        return {
            'customer': {
                'id': customer.id,
                'name': customer.name,
                'phone': customer.phone,
                'email': customer.user.email if customer.user else '',
                'city': customer.city,
                'kyc_status': customer.kyc_status or 'PENDING',
                'status': 'ACTIVE',
            },
            'online_requests': list(online_requests),
            'crm_lead': crm_lead_data,
            'product_requests': list(product_requests),
            'invoices': list(invoices),
            'subscriptions': list(subscriptions),
            'timeline': timeline,
            'next_actions': next_actions,
        }

    @staticmethod
    def _build_timeline(customer, online_requests, product_requests):
        """Build chronological timeline of events"""
        timeline = []

        for req in online_requests:
            timeline.append({
                'time': req['created_at'],
                'event': f"Online enquiry created: {req['request_number']}",
                'type': 'enquiry',
            })

        for req in product_requests:
            timeline.append({
                'time': req['created_at'],
                'event': f"Product request created: {req['request_type']}",
                'type': 'request',
            })

        return sorted(timeline, key=lambda x: x['time'])

    @staticmethod
    def _determine_actions(online_requests, product_requests):
        """Determine recommended next actions"""
        actions = []

        if online_requests and online_requests[0]['status'] == 'DRAFT':
            actions.append("Send quote to customer")

        if online_requests and online_requests[0]['status'] == 'QUOTE_SENT':
            actions.append("Follow up on quote")

        if product_requests and product_requests[0]['status'] == 'SUBMITTED':
            actions.append("Approve product request")

        if not actions:
            actions.append("Review customer profile")

        return actions

    def update_customer_profile(self, customer_id: int, updates: dict):
        """Atomically update customer profile"""
        with transaction.atomic():
            customer = Customer.objects.select_for_update().get(id=customer_id)
            changed = []

            for field, value in updates.items():
                if value is not None and hasattr(customer, field):
                    setattr(customer, field, value)
                    changed.append(field)

            if changed:
                customer.save()

            return {
                'status': 'success',
                'changed': changed,
            }

    def approve_request(self, customer_id: int, request_id: int, admin, notes: str = ''):
        """
        Approve a product request and issue the sale document.

        Goes through billing_service.create_direct_sale so the document series,
        financial year, tax snapshot and line items are all correct. The previous
        implementation wrote `product` and `created_by` straight onto DirectSale
        (neither is a field), used the non-existent status 'CREATED', and omitted
        the required sale_date / financial_year / doc_series — so every approval
        through this path raised.
        """
        from billing.services.billing_service import create_direct_sale

        with transaction.atomic():
            product_request = ProductRequest.objects.get(id=request_id, customer_id=customer_id)

            if product_request.status != 'SUBMITTED':
                raise ValueError(f"Cannot approve request in {product_request.status} status")

            product = product_request.product
            invoice = create_direct_sale(
                payload={
                    'customer': Customer.objects.get(pk=customer_id),
                    'sale_date': timezone.localdate(),
                    'notes': notes or f'Approved from product request #{request_id}',
                    'lines': [
                        {
                            'product': product,
                            'quantity': Decimal('1'),
                            'unit_price': product.base_price or Decimal('0'),
                        }
                    ],
                },
                created_by=admin,
            )

            # Update product request
            product_request.status = 'APPROVED'
            product_request.approved_by = admin
            product_request.approved_at = timezone.now()
            product_request.save()

            return {
                'status': 'success',
                'request_id': request_id,
                'invoice_id': invoice.id,
                'message': f'✓ Approved. Invoice created',
            }
