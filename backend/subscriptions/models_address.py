from django.db import models
from django.conf import settings
from django.core.validators import RegexValidator

PIN_VALIDATOR = RegexValidator(
    regex=r'^\d{6}$',
    message='PIN must be exactly 6 digits',
    code='invalid_pin'
)

class Address(models.Model):
    """Multiple addresses for customers, vendors, and partners"""
    
    ADDRESS_TYPE_CHOICES = [
        ('HOME', 'Home'),
        ('OFFICE', 'Office'),
        ('OTHER', 'Other'),
    ]
    
    # Link to customer or partner
    customer = models.ForeignKey(
        'Customer',
        on_delete=models.CASCADE,
        related_name='addresses',
        null=True,
        blank=True,
    )
    
    # Address fields
    address_type = models.CharField(
        max_length=10,
        choices=ADDRESS_TYPE_CHOICES,
        default='HOME'
    )
    line1 = models.CharField(max_length=200, help_text="Street address")
    line2 = models.CharField(max_length=200, blank=True, help_text="Apartment, suite, etc.")
    city = models.CharField(max_length=100)
    district = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(
        max_length=6,
        validators=[PIN_VALIDATOR],
        db_index=True,
        help_text="6-digit postal index number"
    )
    country = models.CharField(max_length=100, default='India')
    
    # Geolocation
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True
    )
    
    # Flags
    is_primary = models.BooleanField(default=False)
    is_delivery_address = models.BooleanField(default=True)
    is_billing_address = models.BooleanField(default=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = "addresses"
        ordering = ["-is_primary", "-created_at"]
        indexes = [
            models.Index(fields=["customer", "is_primary"]),
            models.Index(fields=["postal_code"]),
            models.Index(fields=["city", "state"]),
        ]
    
    def __str__(self):
        return f"{self.line1}, {self.city} {self.postal_code}"


class ServiceZone(models.Model):
    """Defines which vendors/partners can serve which areas"""
    
    vendor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='service_zones'
    )
    
    city = models.CharField(max_length=100, db_index=True)
    state = models.CharField(max_length=100)
    postal_codes = models.JSONField(default=list, help_text="List of service postal codes")
    
    # Delivery info
    delivery_days = models.IntegerField(default=3, help_text="Standard delivery days")
    delivery_cost_base = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_cost_per_km = models.DecimalField(max_digits=5, decimal_places=2, default=50)
    
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "service_zones"
        unique_together = [['vendor', 'city', 'state']]
        indexes = [
            models.Index(fields=["vendor", "is_active"]),
            models.Index(fields=["city"]),
        ]
    
    def __str__(self):
        return f"{self.vendor.username} - {self.city}, {self.state}"


class PincodeDatabase(models.Model):
    """Database of pincodes for quick lookup"""
    
    postal_code = models.CharField(
        max_length=6,
        validators=[PIN_VALIDATOR],
        unique=True,
        db_index=True,
        primary_key=True
    )
    city = models.CharField(max_length=100, db_index=True)
    district = models.CharField(max_length=100)
    state = models.CharField(max_length=100, db_index=True)
    region = models.CharField(max_length=100, blank=True)
    
    # Geolocation
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    class Meta:
        db_table = "pincode_database"
        indexes = [
            models.Index(fields=["city"]),
            models.Index(fields=["state"]),
        ]
    
    def __str__(self):
        return f"{self.postal_code} - {self.city}, {self.state}"
