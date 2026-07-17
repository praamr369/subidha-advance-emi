from rest_framework import serializers
from subscriptions.models import Address, PincodeDatabase, ServiceZone
from subscriptions.services.address_service import validate_pincode, lookup_pincode

class PincodeSerializer(serializers.Serializer):
    """Pincode lookup serializer"""
    postal_code = serializers.CharField(max_length=6, min_length=6)
    
    def validate_postal_code(self, value):
        if not validate_pincode(value):
            raise serializers.ValidationError("Invalid pincode format. Must be 6 digits.")
        return value

class PincodeDetailSerializer(serializers.ModelSerializer):
    """Pincode details response"""
    class Meta:
        model = PincodeDatabase
        fields = ['postal_code', 'city', 'district', 'state', 'region', 'latitude', 'longitude']
        read_only_fields = fields

class AddressListSerializer(serializers.ModelSerializer):
    """Address list serializer (minimal)"""
    pincode_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Address
        fields = [
            'id', 'address_type', 'line1', 'city', 'postal_code',
            'is_primary', 'is_delivery_address', 'is_billing_address',
            'created_at', 'pincode_details'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_pincode_details(self, obj):
        try:
            pincode_data = PincodeDatabase.objects.get(postal_code=obj.postal_code)
            return {
                'city': pincode_data.city,
                'state': pincode_data.state,
                'district': pincode_data.district,
            }
        except PincodeDatabase.DoesNotExist:
            return None

class AddressDetailSerializer(serializers.ModelSerializer):
    """Address detail serializer (full info)"""
    pincode_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Address
        fields = [
            'id', 'address_type', 'line1', 'line2', 'city', 'district',
            'state', 'postal_code', 'country', 'latitude', 'longitude',
            'is_primary', 'is_delivery_address', 'is_billing_address',
            'created_at', 'updated_at', 'pincode_details'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'district', 'state',
            'latitude', 'longitude', 'pincode_details'
        ]
    
    def get_pincode_details(self, obj):
        try:
            pincode_data = PincodeDatabase.objects.get(postal_code=obj.postal_code)
            return {
                'postal_code': pincode_data.postal_code,
                'city': pincode_data.city,
                'state': pincode_data.state,
                'district': pincode_data.district,
                'region': pincode_data.region,
                'latitude': float(pincode_data.latitude) if pincode_data.latitude else None,
                'longitude': float(pincode_data.longitude) if pincode_data.longitude else None,
            }
        except PincodeDatabase.DoesNotExist:
            return None
    
    def validate_postal_code(self, value):
        if not validate_pincode(value):
            raise serializers.ValidationError("Invalid pincode format. Must be 6 digits.")
        try:
            PincodeDatabase.objects.get(postal_code=value)
        except PincodeDatabase.DoesNotExist:
            raise serializers.ValidationError("Pincode not found in our database.")
        return value

class AddressCreateSerializer(serializers.ModelSerializer):
    """Create/update address serializer"""
    class Meta:
        model = Address
        fields = [
            'address_type', 'line1', 'line2', 'city', 'postal_code',
            'is_delivery_address', 'is_billing_address'
        ]
    
    def validate_postal_code(self, value):
        if not validate_pincode(value):
            raise serializers.ValidationError("Invalid pincode format. Must be 6 digits.")
        try:
            PincodeDatabase.objects.get(postal_code=value)
        except PincodeDatabase.DoesNotExist:
            raise serializers.ValidationError("Pincode not found in our database.")
        return value

class ServiceZoneSerializer(serializers.ModelSerializer):
    """Service zone availability"""
    vendor_name = serializers.CharField(source='vendor.username', read_only=True)
    
    class Meta:
        model = ServiceZone
        fields = [
            'id', 'vendor_id', 'vendor_name', 'city', 'state',
            'delivery_days', 'delivery_cost_base', 'delivery_cost_per_km',
            'is_active'
        ]
        read_only_fields = fields

class VendorAvailabilitySerializer(serializers.Serializer):
    """Response for vendor availability check"""
    available = serializers.BooleanField()
    vendor_id = serializers.IntegerField()
    delivery_days = serializers.IntegerField(required=False)
    delivery_cost = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    city = serializers.CharField(required=False)
    state = serializers.CharField(required=False)
    reason = serializers.CharField(required=False)
