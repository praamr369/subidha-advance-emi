"""
Serializers for CRM Pipeline workflow
PublicLead → OnlineRequest → ProductRequest/SubscriptionRequest → Subscription/Sale
"""

from rest_framework import serializers
from subscriptions.models import (
    PublicLead,
    OnlineRequest,
    ProductRequest,
    SubscriptionRequest,
)


class PublicLeadListSerializer(serializers.ModelSerializer):
    """List view: PublicLead summary"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    intent_display = serializers.CharField(source='get_intent_display', read_only=True)
    converted_to = serializers.SerializerMethodField()

    class Meta:
        model = PublicLead
        fields = [
            'id',
            'name',
            'phone',
            'email',
            'city',
            'status',
            'status_display',
            'intent',
            'intent_display',
            'source',
            'assigned_to',
            'converted_customer',
            'converted_to',
            'created_at',
            'converted_at',
        ]

    def get_converted_to(self, obj):
        """Show what this lead has converted to"""
        result = []
        if obj.converted_customer:
            result.append({'type': 'customer', 'id': obj.converted_customer.id})
        if obj.converted_online_request:
            result.append({'type': 'online_request', 'id': obj.converted_online_request.id})
        if obj.converted_product_request:
            result.append({'type': 'product_request', 'id': obj.converted_product_request.id})
        if obj.converted_subscription_request:
            result.append({'type': 'subscription_request', 'id': obj.converted_subscription_request.id})
        return result


class PublicLeadDetailSerializer(serializers.ModelSerializer):
    """Detail view: Complete PublicLead info + conversion history"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    intent_display = serializers.CharField(source='get_intent_display', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True, allow_null=True)
    converted_by_name = serializers.CharField(source='converted_by.username', read_only=True, allow_null=True)

    # Conversion history
    conversion_history = serializers.SerializerMethodField()

    class Meta:
        model = PublicLead
        fields = [
            'id',
            'name',
            'phone',
            'email',
            'city',
            'product',
            'product_name',
            'interested_product',
            'preferred_emi_amount',
            'notes',
            'admin_notes',
            'status',
            'status_display',
            'intent',
            'intent_display',
            'source',
            'follow_up_required',
            'follow_up_on',
            'follow_up_note',
            'assigned_to',
            'assigned_to_name',
            'assigned_at',
            'contacted_at',
            'converted_customer',
            'converted_online_request',
            'converted_product_request',
            'converted_subscription_request',
            'converted_subscription',
            'converted_direct_sale',
            'converted_by',
            'converted_by_name',
            'converted_at',
            'closed_at',
            'conversion_history',
            'created_at',
            'updated_at',
        ]

    def get_conversion_history(self, obj):
        """Get complete conversion timeline"""
        history = []

        if obj.created_at:
            history.append({
                'stage': 'PublicLead',
                'timestamp': obj.created_at,
                'description': 'Lead submitted via website',
                'id': obj.id,
            })

        if obj.assigned_at:
            history.append({
                'stage': 'Assigned',
                'timestamp': obj.assigned_at,
                'description': f'Assigned to {obj.assigned_to.username if obj.assigned_to else "unassigned"}',
            })

        if obj.contacted_at:
            history.append({
                'stage': 'Contacted',
                'timestamp': obj.contacted_at,
                'description': 'Admin contacted the lead',
            })

        if obj.converted_online_request:
            history.append({
                'stage': 'OnlineRequest',
                'timestamp': obj.converted_online_request.created_at,
                'description': f'Quote workflow started (ORQ-{obj.converted_online_request.id})',
                'id': obj.converted_online_request.id,
            })

        if obj.converted_customer:
            history.append({
                'stage': 'Registered',
                'timestamp': obj.converted_customer.created_at,
                'description': 'Lead registered as Customer',
                'id': obj.converted_customer.id,
            })

        if obj.converted_product_request:
            history.append({
                'stage': 'ProductRequest',
                'timestamp': obj.converted_product_request.created_at,
                'description': f'Quote accepted → Product Request #{obj.converted_product_request.id}',
                'id': obj.converted_product_request.id,
            })

        if obj.converted_subscription_request:
            history.append({
                'stage': 'SubscriptionRequest',
                'timestamp': obj.converted_subscription_request.created_at,
                'description': f'Quote accepted → Subscription Request #{obj.converted_subscription_request.id}',
                'id': obj.converted_subscription_request.id,
            })

        if obj.converted_subscription:
            history.append({
                'stage': 'Subscription',
                'timestamp': obj.converted_subscription.created_at,
                'description': f'Approved → Subscription #{obj.converted_subscription.id}',
                'id': obj.converted_subscription.id,
            })

        if obj.converted_direct_sale:
            history.append({
                'stage': 'DirectSale',
                'timestamp': obj.converted_direct_sale.created_at,
                'description': f'Approved → Invoice #{obj.converted_direct_sale.id}',
                'id': obj.converted_direct_sale.id,
            })

        if obj.converted_at:
            history.append({
                'stage': 'Converted',
                'timestamp': obj.converted_at,
                'description': f'Fully converted by {obj.converted_by.username if obj.converted_by else "admin"}',
            })

        return history


class PublicLeadCreateSerializer(serializers.ModelSerializer):
    """Create serializer for public form submissions"""
    class Meta:
        model = PublicLead
        fields = [
            'name',
            'phone',
            'email',
            'city',
            'product',
            'interested_product',
            'preferred_emi_amount',
            'notes',
            'source',
        ]

    def create(self, validated_data):
        # Default source to PUBLIC_SITE if not provided
        if 'source' not in validated_data or not validated_data['source']:
            validated_data['source'] = 'PUBLIC_SITE'

        return super().create(validated_data)


class ConvertPublicLeadSerializer(serializers.Serializer):
    """Convert PublicLead to OnlineRequest"""
    request_type = serializers.ChoiceField(
        choices=['ADVANCE_EMI', 'DIRECT_SALE', 'RENT', 'LEASE']
    )
    quantity = serializers.IntegerField(default=1, min_value=1)
    preferred_tenure = serializers.IntegerField(required=False, allow_null=True)
    preferred_lucky_number = serializers.IntegerField(required=False, allow_null=True)
    unit_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )


class AcceptQuoteSerializer(serializers.Serializer):
    """Accept OnlineRequest quote → convert to ProductRequest/SubscriptionRequest"""
    request_target_type = serializers.ChoiceField(
        choices=['product_request', 'subscription_request'],
        help_text='Where to convert: ProductRequest or SubscriptionRequest',
    )
    batch_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text='Required if converting to SubscriptionRequest',
    )
