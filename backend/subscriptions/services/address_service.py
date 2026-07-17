import re
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import transaction
from subscriptions.models import Address, ServiceZone, PincodeDatabase, Customer

def validate_pincode(pincode: str) -> bool:
    """Validate Indian pincode format (6 digits)"""
    return bool(re.match(r'^\d{6}$', str(pincode).strip()))

def lookup_pincode(pincode: str) -> dict:
    """Look up pincode details from database"""
    if not validate_pincode(pincode):
        raise ValidationError({"postal_code": "Invalid pincode format. Must be 6 digits."})
    
    try:
        entry = PincodeDatabase.objects.get(postal_code=pincode)
        return {
            "postal_code": entry.postal_code,
            "city": entry.city,
            "district": entry.district,
            "state": entry.state,
            "latitude": float(entry.latitude) if entry.latitude else None,
            "longitude": float(entry.longitude) if entry.longitude else None,
        }
    except PincodeDatabase.DoesNotExist:
        raise ValidationError({"postal_code": "Pincode not found in database."})

def create_address(customer: Customer, **fields) -> Address:
    """Create a new address for customer"""
    
    if 'postal_code' not in fields:
        raise ValidationError({"postal_code": "Postal code is required."})
    
    # Validate pincode
    pincode = fields.get('postal_code')
    pincode_data = lookup_pincode(pincode)  # Will raise if invalid
    
    # Auto-fill city, state, district from pincode lookup
    fields.setdefault('city', pincode_data['city'])
    fields.setdefault('district', pincode_data['district'])
    fields.setdefault('state', pincode_data['state'])
    fields.setdefault('latitude', pincode_data['latitude'])
    fields.setdefault('longitude', pincode_data['longitude'])
    
    address = Address.objects.create(customer=customer, **fields)
    
    # If this is the first address, make it primary
    if customer.addresses.count() == 1:
        address.is_primary = True
        address.save(update_fields=['is_primary'])
    
    return address

def check_service_availability(vendor_id: int, postal_code: str) -> dict:
    """Check if vendor can serve the given pincode"""
    
    if not validate_pincode(postal_code):
        raise ValidationError({"postal_code": "Invalid pincode format."})
    
    pincode_data = lookup_pincode(postal_code)
    
    try:
        zone = ServiceZone.objects.get(
            vendor_id=vendor_id,
            city=pincode_data['city'],
            state=pincode_data['state'],
            is_active=True
        )
        
        return {
            "available": postal_code in zone.postal_codes,
            "vendor_id": vendor_id,
            "delivery_days": zone.delivery_days,
            "delivery_cost_base": float(zone.delivery_cost_base),
            "city": zone.city,
            "state": zone.state,
        }
    except ServiceZone.DoesNotExist:
        return {
            "available": False,
            "vendor_id": vendor_id,
            "reason": "Vendor does not serve this area.",
        }

def find_vendors_for_area(postal_code: str, product_category: str = None) -> list:
    """Find all vendors who can serve a given pincode"""
    
    if not validate_pincode(postal_code):
        raise ValidationError({"postal_code": "Invalid pincode format."})
    
    pincode_data = lookup_pincode(postal_code)
    
    zones = ServiceZone.objects.filter(
        city=pincode_data['city'],
        state=pincode_data['state'],
        is_active=True
    )
    
    available_vendors = []
    for zone in zones:
        if postal_code in zone.postal_codes:
            available_vendors.append({
                "vendor_id": zone.vendor_id,
                "vendor_name": zone.vendor.username,
                "delivery_days": zone.delivery_days,
                "delivery_cost": float(zone.delivery_cost_base),
            })
    
    return available_vendors

@transaction.atomic
def set_primary_address(customer: Customer, address_id: int) -> None:
    """Set a specific address as primary for customer"""
    
    # Check address belongs to customer
    try:
        address = customer.addresses.get(id=address_id)
    except Address.DoesNotExist:
        raise ValidationError({"address_id": "Address not found for this customer."})
    
    # Remove primary from all other addresses
    customer.addresses.exclude(id=address_id).update(is_primary=False)
    
    # Set this as primary
    address.is_primary = True
    address.save(update_fields=['is_primary'])
