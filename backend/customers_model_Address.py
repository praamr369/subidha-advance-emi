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