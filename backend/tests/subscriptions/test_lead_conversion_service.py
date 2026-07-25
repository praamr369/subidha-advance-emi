import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from subscriptions.models import Customer, PublicLead, OnlineRequest
from billing.models import DirectSale
from subscriptions.services.lead_conversion_service import LeadConversionService

pytestmark = pytest.mark.django_db

def test_find_or_create_customer():
    # Test creation
    customer, created = LeadConversionService._find_or_create_customer(
        phone="1234567890",
        email="test@example.com",
        name="Test User",
        source="ONLINE"
    )
    assert created is True
    assert customer.name == "Test User"
    assert customer.phone == "1234567890"
    assert customer.customer_source == "ONLINE"
    
    # Test finding existing
    customer2, created2 = LeadConversionService._find_or_create_customer(
        phone="1234567890",
        email="test2@example.com",
        name="Test User 2",
        source="ONLINE"
    )
    assert created2 is False
    assert customer.id == customer2.id

def test_process_online_enquiry():
    online_req, customer, lead, created_customer = LeadConversionService.process_online_enquiry(
        phone="9876543210",
        email="online@example.com",
        name="Online User",
        product_name="Test Product",
        amount="1000.00"
    )
    
    assert created_customer is True
    assert customer.phone == "9876543210"
    assert online_req.customer == customer
    assert online_req.product_name == "Test Product"
    assert online_req.amount == Decimal("1000.00")
    assert lead.converted_customer == customer
    assert lead.converted_online_request == online_req
    assert lead.phone == "9876543210"
    assert lead.status == "CONTACTED"
    
    # Second enquiry with same phone, different name
    online_req2, customer2, lead2, created_customer2 = LeadConversionService.process_online_enquiry(
        phone="9876543210",
        email="online2@example.com",
        name="Online User Changed",
    )
    assert created_customer2 is False
    assert customer2.id == customer.id
    assert lead2.id == lead.id
    assert lead2.converted_online_request == online_req2

def test_process_direct_sale():
    sale, customer, lead, created_customer = LeadConversionService.process_direct_sale(
        phone="5555555555",
        email="sale@example.com",
        name="Sale User",
        product_name="Sale Product",
        amount="2000.00"
    )
    
    assert created_customer is True
    assert customer.phone == "5555555555"
    assert sale.customer == customer
    assert sale.product_name == "Sale Product"
    assert sale.grand_total == Decimal("2000.00")
    assert lead.converted_customer == customer
    assert lead.converted_direct_sale == sale
    assert lead.phone == "5555555555"
    assert lead.status == "QUALIFIED"
