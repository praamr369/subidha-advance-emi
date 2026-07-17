from rest_framework import serializers
from subscriptions.models_online_request import OnlineRequest, OnlineRequestAction


class OnlineRequestActionSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(
        source='performed_by.get_full_name',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = OnlineRequestAction
        fields = [
            'id',
            'action_type',
            'performed_by',
            'performed_by_name',
            'notes',
            'metadata',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class OnlineRequestListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = OnlineRequest
        fields = [
            'id',
            'request_number',
            'customer',
            'customer_name',
            'product',
            'product_name',
            'request_type',
            'quantity',
            'total_amount',
            'status',
            'status_display',
            'created_at',
        ]
        read_only_fields = ['id', 'request_number', 'created_at']


class OnlineRequestDetailSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    batch_name = serializers.CharField(source='batch.name', read_only=True, allow_null=True)
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True,
        allow_null=True,
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    request_type_display = serializers.CharField(
        source='get_request_type_display',
        read_only=True,
    )
    actions = OnlineRequestActionSerializer(many=True, read_only=True)
    can_accept_quote = serializers.BooleanField(read_only=True)
    can_approve = serializers.BooleanField(read_only=True)
    is_quote_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = OnlineRequest
        fields = [
            'id',
            'request_number',
            'customer',
            'customer_name',
            'product',
            'product_name',
            'request_type',
            'request_type_display',
            'quantity',
            'preferred_tenure',
            'preferred_lucky_number',
            'batch',
            'batch_name',
            'unit_price',
            'sub_total',
            'tax_percentage',
            'gst_amount',
            'delivery_cost',
            'discount_amount',
            'total_amount',
            'status',
            'status_display',
            'quote_expiry_date',
            'is_quote_expired',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'approval_notes',
            'can_accept_quote',
            'can_approve',
            'created_at',
            'updated_at',
            'actions',
        ]
        read_only_fields = [
            'id',
            'request_number',
            'sub_total',
            'gst_amount',
            'total_amount',
            'quote_expiry_date',
            'created_at',
            'updated_at',
        ]


class OnlineRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnlineRequest
        fields = [
            'product',
            'request_type',
            'quantity',
            'preferred_tenure',
            'preferred_lucky_number',
            'batch',
            'unit_price',
        ]


class OnlineRequestQuoteSerializer(serializers.Serializer):
    discount_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=0,
    )
    delivery_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=0,
    )


class OnlineRequestApprovalSerializer(serializers.Serializer):
    approval_notes = serializers.CharField(required=False, allow_blank=True)
    create_transaction = serializers.BooleanField(required=False, default=True)


class OnlineRequestCompleteSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)
