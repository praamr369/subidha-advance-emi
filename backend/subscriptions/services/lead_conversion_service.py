"""
Lead Conversion & Customer Registration Service
Automatically links online enquiries/direct sales to existing leads
Handles complete lead-to-customer-to-fulfillment workflow
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.models import User

from subscriptions.models import Customer, PublicLead, OnlineRequest, ProductRequest, Subscription
from billing.models import DirectSale


class LeadConversionService:
    """
    Manages the complete workflow from lead → customer registration → fulfillment

    Workflow:
    1. Lead is created (online enquiry form, etc)
    2. Online Enquiry arrives with same phone/email as lead
    3. System automatically:
       - Links lead to customer (if customer exists)
       - Creates customer if needed
       - Links online enquiry to lead
       - Updates lead status
    4. When product/subscription request created:
       - Links to lead
       - Updates lead status to next stage
    5. When fulfillment (subscription/direct sale) completed:
       - Links to lead
       - Mark lead as CONVERTED
    """

    @staticmethod
    def _find_matching_lead(phone=None, email=None, name=None):
        """Find a lead by phone, email, or name (in order of reliability)"""
        # Priority 1: Phone (most reliable)
        if phone:
            lead = PublicLead.objects.filter(phone=phone).first()
            if lead:
                return lead

        # Priority 2: Email
        if email:
            lead = PublicLead.objects.filter(email=email).first()
            if lead:
                return lead

        # Priority 3: Name
        if name:
            lead = PublicLead.objects.filter(name=name).first()
            if lead:
                return lead

        return None

    @staticmethod
    def _find_or_create_customer(phone, email, name, source="ONLINE"):
        """Find existing customer or create new one"""
        # Try to find by phone first (most reliable)
        customer = Customer.objects.filter(phone=phone).first()

        if customer:
            return customer, False  # Found existing

        # Create new customer if not found
        try:
            # Create a user account for the customer
            user = User.objects.create_user(
                username=f"cust_{phone}_{timezone.now().timestamp()}",
                email=email or "",
            )

            customer = Customer.objects.create(
                user=user,
                name=name,
                phone=phone,
                customer_source=source,
            )
            return customer, True  # Created new
        except Exception as e:
            raise Exception(f"Failed to create customer: {str(e)}")

    @staticmethod
    @transaction.atomic
    def process_online_enquiry(phone, email, name, product_name=None, amount=None, request_number=None, enquiry_details=None):
        """
        Process an online enquiry and link to existing lead + customer

        Returns: (online_request, customer, lead, created_customer)
        """
        # Step 1: Find or create customer
        customer, created_customer = LeadConversionService._find_or_create_customer(
            phone=phone,
            email=email,
            name=name,
            source="ONLINE_ENQUIRY"
        )

        # Step 2: Find matching lead
        lead = LeadConversionService._find_matching_lead(
            phone=phone,
            email=email,
            name=name
        )

        # Step 3: Create online request
        online_request = OnlineRequest.objects.create(
            customer=customer,
            product_name=product_name or "Not Specified",
            request_number=request_number or f"ONL-{phone}-{timezone.now().timestamp()}",
            amount=Decimal(amount) if amount else None,
            status="SUBMITTED"
        )

        # Step 4: Link lead to customer and online request
        if lead:
            lead.converted_customer = customer
            lead.converted_online_request = online_request

            # Update lead status based on current state
            if lead.status == "NEW":
                lead.status = "CONTACTED"

            lead.save()
        else:
            # Create a new lead from the online enquiry
            lead = PublicLead.objects.create(
                name=name,
                phone=phone,
                email=email,
                product=None,
                interested_product=product_name or "Not Specified",
                status="CONTACTED",
                source="ONLINE_ENQUIRY",
                converted_customer=customer,
                converted_online_request=online_request,
            )

        return online_request, customer, lead, created_customer

    @staticmethod
    @transaction.atomic
    def process_direct_sale(phone, email, name, product_name=None, amount=None, sale_details=None):
        """
        Process a direct sale and link to existing lead + customer

        Returns: (direct_sale, customer, lead, created_customer)
        """
        # Step 1: Find or create customer
        customer, created_customer = LeadConversionService._find_or_create_customer(
            phone=phone,
            email=email,
            name=name,
            source="DIRECT_SALE"
        )

        # Step 2: Find matching lead
        lead = LeadConversionService._find_matching_lead(
            phone=phone,
            email=email,
            name=name
        )

        # Step 3: Create direct sale
        direct_sale = DirectSale.objects.create(
            customer=customer,
            product_name=product_name or "Direct Sale",
            grand_total=Decimal(amount) if amount else Decimal("0"),
            status="PENDING_APPROVAL"
        )

        # Step 4: Link lead to customer and direct sale
        if lead:
            lead.converted_customer = customer
            lead.converted_direct_sale = direct_sale

            # Update lead status
            if lead.status in ["NEW", "CONTACTED"]:
                lead.status = "QUALIFIED"
            elif lead.status == "QUALIFIED":
                lead.status = "PROPOSAL_SENT"

            lead.save()
        else:
            # Create a new lead from the direct sale
            lead = PublicLead.objects.create(
                name=name,
                phone=phone,
                email=email,
                interested_product=product_name or "Direct Sale",
                status="QUALIFIED",
                source="DIRECT_SALE",
                converted_customer=customer,
                converted_direct_sale=direct_sale,
            )

        return direct_sale, customer, lead, created_customer

    @staticmethod
    @transaction.atomic
    def process_product_request(customer_id, lead_id=None, product_name=None, request_type="PRODUCT_REQUEST"):
        """
        Process a product request and update lead status

        Returns: (product_request, lead)
        """
        try:
            customer = Customer.objects.get(id=customer_id)
        except Customer.DoesNotExist:
            raise Exception(f"Customer {customer_id} not found")

        # Create product request
        product_request = ProductRequest.objects.create(
            customer=customer,
            request_type=request_type,
            product_name=product_name or "Product Request",
            status="SUBMITTED"
        )

        # Find or update lead
        lead = None
        if lead_id:
            try:
                lead = PublicLead.objects.get(id=lead_id)
            except PublicLead.DoesNotExist:
                pass

        if not lead:
            # Try to find by customer phone
            lead = PublicLead.objects.filter(phone=customer.phone).first()

        # Link lead to product request
        if lead:
            lead.converted_product_request = product_request

            # Update lead status
            if lead.status == "CONTACTED":
                lead.status = "QUALIFIED"
            elif lead.status == "QUALIFIED":
                lead.status = "PROPOSAL_SENT"

            lead.save()

        return product_request, lead

    @staticmethod
    @transaction.atomic
    def mark_lead_converted(lead_id, conversion_type="SUBSCRIPTION"):
        """
        Mark a lead as CONVERTED when fulfillment completes

        conversion_type: 'SUBSCRIPTION' or 'DIRECT_SALE'
        """
        try:
            lead = PublicLead.objects.get(id=lead_id)
            lead.status = "CONVERTED"
            lead.converted_by = None  # Will be set by caller if needed
            lead.save()
            return lead
        except PublicLead.DoesNotExist:
            raise Exception(f"Lead {lead_id} not found")

    @staticmethod
    def get_lead_summary(phone=None, email=None, name=None):
        """Get complete lead journey summary"""
        lead = LeadConversionService._find_matching_lead(phone, email, name)

        if not lead:
            return None

        return {
            "id": lead.id,
            "name": lead.name,
            "phone": lead.phone,
            "email": lead.email,
            "status": lead.status,
            "source": lead.source,
            "created_at": lead.created_at.isoformat(),

            # Conversion journey
            "customer": {
                "id": lead.converted_customer.id,
                "name": lead.converted_customer.name,
                "phone": lead.converted_customer.phone,
            } if lead.converted_customer else None,

            "online_request": {
                "id": lead.converted_online_request.id,
                "request_number": lead.converted_online_request.request_number,
                "status": lead.converted_online_request.status,
            } if lead.converted_online_request else None,

            "product_request": {
                "id": lead.converted_product_request.id,
                "type": lead.converted_product_request.request_type,
                "status": lead.converted_product_request.status,
            } if lead.converted_product_request else None,

            "subscription": {
                "id": lead.converted_subscription.id,
                "plan_type": lead.converted_subscription.plan_type,
                "status": lead.converted_subscription.status,
            } if lead.converted_subscription else None,

            "direct_sale": {
                "id": lead.converted_direct_sale.id,
                "amount": str(lead.converted_direct_sale.grand_total),
                "status": lead.converted_direct_sale.status,
            } if lead.converted_direct_sale else None,
        }
