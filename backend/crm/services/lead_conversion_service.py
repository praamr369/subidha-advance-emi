"""
Lead Conversion & Customer Registration Service
Automatically links online enquiries/direct sales to existing leads
Handles complete lead-to-customer-to-fulfillment workflow
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model

from subscriptions.models import Customer, PublicLead, OnlineRequest, ProductRequest, Subscription
from billing.models import DirectSale
from products_core.models import Product


class LeadConversionError(ValueError):
    """Operator-correctable input problem (surfaced to the caller as a 400)."""


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
    def _resolve_product(product_name):
        """
        Resolve a free-text product name to a real Product row.

        OnlineRequest.product and DirectSaleLine.product are both required FKs,
        so a name that matches nothing is an operator error, not a server fault.
        """
        name = (product_name or "").strip()
        if not name:
            raise LeadConversionError("product_name is required.")

        product = Product.objects.filter(name__iexact=name, is_active=True).first()
        if product:
            return product

        matches = list(Product.objects.filter(name__icontains=name, is_active=True)[:2])
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise LeadConversionError(
                f"Product name '{name}' matches more than one active product; use the exact name."
            )
        raise LeadConversionError(f"No active product found matching '{name}'.")

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
            user = get_user_model().objects.create_user(
                username=f"cust_{phone}_{timezone.now().timestamp()}",
                email=email or "",
                phone=phone,
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

        product = LeadConversionService._resolve_product(product_name)
        unit_price = Decimal(str(amount)) if amount else (product.base_price or Decimal("0"))

        # Step 3: Ensure the lead exists BEFORE the online request. The
        # OnlineRequest post_save signal (sync_online_request_to_pipeline) will
        # otherwise invent a PublicLead keyed on name alone, which duplicates
        # this lead and breaks on the next enquiry for the same name.
        if not lead:
            lead = PublicLead.objects.create(
                name=name,
                phone=phone,
                email=email,
                product=product,
                interested_product=product.name,
                status="CONTACTED",
                source="ONLINE_ENQUIRY",
                converted_customer=customer,
            )

        # Step 4: Create online request, anchored to that lead
        from crm.services.crm_pipeline_service import _generate_online_request_number

        online_request = OnlineRequest.objects.create(
            request_number=request_number or _generate_online_request_number(),
            customer=customer,
            product=product,
            request_type="DIRECT_SALE",
            quantity=1,
            unit_price=unit_price,
            sub_total=unit_price,
            total_amount=unit_price,
            status="DRAFT",
            source_public_lead=lead,
        )

        # Step 5: Link lead to customer and online request
        lead.converted_customer = customer
        lead.converted_online_request = online_request
        if lead.status == "NEW":
            lead.status = "CONTACTED"
        lead.save()

        return online_request, customer, lead, created_customer

    @staticmethod
    @transaction.atomic
    def process_direct_sale(phone, email, name, product_name=None, amount=None, sale_details=None, created_by=None):
        """
        Raise a direct-sale request for approval and link it to the lead.

        This deliberately does NOT book a sale. A numbered DirectSale is a real
        accounting document, and issuing one straight from a lead screen skipped
        the quote/approval gate every other route through the system respects.
        The request lands as a DRAFT OnlineRequest; approving it
        (crm_approval_service.approve_online_request with DIRECT_SALE) is what
        issues the document.

        Returns: (online_request, customer, lead, created_customer)
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

        product = LeadConversionService._resolve_product(product_name)
        unit_price = Decimal(str(amount)) if amount else (product.base_price or Decimal("0"))

        # Step 3: Ensure the lead exists before the request, so the OnlineRequest
        # post_save signal does not invent a second lead for the same person.
        if not lead:
            lead = PublicLead.objects.create(
                name=name,
                phone=phone,
                email=email,
                product=product,
                interested_product=product.name,
                status="CONTACTED",
                source="DIRECT_SALE",
                converted_customer=customer,
            )

        # Step 4: Raise the request, pending approval
        from crm.services.crm_pipeline_service import _generate_online_request_number

        online_request = OnlineRequest.objects.create(
            request_number=_generate_online_request_number(),
            customer=customer,
            product=product,
            request_type="DIRECT_SALE",
            quantity=1,
            unit_price=unit_price,
            sub_total=unit_price,
            total_amount=unit_price,
            status="DRAFT",
            source_public_lead=lead,
        )

        # Step 5: Link the lead. The lead is not CONVERTED — nothing is booked
        # until someone approves the request.
        lead.converted_customer = customer
        lead.converted_online_request = online_request
        if lead.status == "NEW":
            lead.status = "CONTACTED"
        lead.save()

        return online_request, customer, lead, created_customer

    @staticmethod
    @transaction.atomic
    def process_product_request(customer_id, requester, lead_id=None, product_name=None, request_type="DIRECT_SALE"):
        """
        Process a product request and update lead status

        Returns: (product_request, lead)
        """
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            raise LeadConversionError(f"Customer {customer_id} not found")
        if requester is None:
            raise LeadConversionError("A requester user is required to raise a product request.")

        product = LeadConversionService._resolve_product(product_name)

        # Find the lead first so the request can record where it came from.
        lead = None
        if lead_id:
            lead = PublicLead.objects.filter(id=lead_id).first()
        if not lead:
            lead = PublicLead.objects.filter(phone=customer.phone).first()

        product_request = ProductRequest.objects.create(
            requester=requester,
            requester_role_snapshot=getattr(requester, "role", "") or "",
            customer=customer,
            product=product,
            request_type=request_type,
            status="SUBMITTED",
            source_public_lead=lead,
            notes=f"Raised from lead conversion for {customer.name}",
        )

        # Link lead to product request
        if lead:
            lead.converted_product_request = product_request
            if lead.status == "NEW":
                lead.status = "CONTACTED"
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

        # Check for existing customer mapping (explicit or by phone matching)
        customer = lead.converted_customer
        if not customer and phone:
            # Try to find existing customer by phone (smart matching)
            customer = Customer.objects.filter(phone=phone).first()

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
                "id": customer.id,
                "name": customer.name,
                "phone": customer.phone,
                "email": customer.user.email if customer.user else None,
                "kyc_status": customer.kyc_status or "PENDING",
                "city": customer.city or "N/A",
                "created_at": customer.created_at.isoformat() if customer.created_at else None,
            } if customer else None,

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
