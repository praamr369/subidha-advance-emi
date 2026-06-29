from decimal import Decimal

from rest_framework import serializers

from subscriptions.models import Customer, Product

from accounting.models import (
    Vendor,
    VendorAddress,
    VendorCategory,
    VendorLedgerEntry,
    VendorProduct,
    VendorQuote,
    VendorQuoteRequest,
    VendorServiceArea,
)
from crm.services.party_service import sync_party_for_vendor


class VendorCategorySerializer(serializers.ModelSerializer):
    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        queryset = VendorCategory.objects.filter(name__iexact=cleaned)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A vendor category with this name already exists.")
        return cleaned

    def validate_code(self, value):
        cleaned = (value or "").strip().upper()
        if not cleaned:
            raise serializers.ValidationError("Code is required.")
        queryset = VendorCategory.objects.filter(code__iexact=cleaned)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A vendor category with this code already exists.")
        return cleaned

    class Meta:
        model = VendorCategory
        fields = "__all__"


class VendorAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorAddress
        fields = "__all__"


class VendorServiceAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorServiceArea
        fields = "__all__"


class VendorProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorProduct
        fields = "__all__"


class VendorLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorLedgerEntry
        fields = "__all__"


_VENDOR_QUOTE_FIELDS = [
    "id",
    "created_at",
    "updated_at",
    "quote_request",
    "vendor",
    "quoted_price",
    "available_quantity",
    "lead_time_days",
    "warranty_months",
    "delivery_available",
    "delivery_charge",
    "quality_note",
    "valid_until",
    "status",
    "submitted_by",
    "submitted_at",
]


class VendorQuoteSerializer(serializers.ModelSerializer):
    vendor_name = serializers.SerializerMethodField()

    class Meta:
        model = VendorQuote
        fields = _VENDOR_QUOTE_FIELDS + ["vendor_name"]

    def get_vendor_name(self, obj):
        v = obj.vendor
        return (v.display_name or v.name or "").strip()


class VendorQuoteRequestSerializer(serializers.ModelSerializer):
    quotes = VendorQuoteSerializer(many=True, read_only=True)

    class Meta:
        model = VendorQuoteRequest
        fields = "__all__"


class VendorQuoteRequestPortalSerializer(serializers.ModelSerializer):
    """Vendor portal: hides competitors' quotes; only exposes the authenticated vendor row."""

    quotes = serializers.SerializerMethodField()

    class Meta:
        model = VendorQuoteRequest
        fields = "__all__"

    def get_quotes(self, obj):
        vendor = self.context.get("vendor")
        if vendor is None:
            return []
        rows = obj.quotes.filter(vendor_id=vendor.id).order_by("id")
        return VendorQuoteSerializer(rows, many=True).data


class VendorQuoteRequestCreateSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(
        choices=["CUSTOMER_ENQUIRY", "DIRECT_SALE_ORDER", "ONLINE_ORDER", "MANUAL"],
        default="MANUAL",
    )
    source_id = serializers.IntegerField(required=False, allow_null=True)
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    customer_pincode = serializers.CharField(required=False, allow_blank=True, default="")
    customer_city = serializers.CharField(required=False, allow_blank=True, default="")
    customer_district = serializers.CharField(required=False, allow_blank=True, default="")
    customer_state = serializers.CharField(required=False, allow_blank=True, default="")
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False, allow_null=True)
    product_name = serializers.CharField(required=False, allow_blank=True, max_length=180, default="")
    category_text = serializers.CharField(required=False, allow_blank=True, max_length=120, default="")
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    required_by = serializers.DateField(required=False, allow_null=True)
    budget_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    vendor_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1)
    send_to_vendors = serializers.BooleanField(required=False, default=False)

    def to_base_payload(self):
        validated = dict(self.validated_data)
        vendor_ids = validated.pop("vendor_ids")
        send_to_vendors = bool(validated.pop("send_to_vendors", False))
        return validated, vendor_ids, send_to_vendors


class VendorOpsSerializer(serializers.ModelSerializer):
    categories = serializers.PrimaryKeyRelatedField(many=True, queryset=VendorCategory.objects.all(), required=False)
    addresses = VendorAddressSerializer(many=True, required=False, read_only=True)
    service_areas = VendorServiceAreaSerializer(many=True, required=False, read_only=True)
    products = VendorProductSerializer(many=True, required=False, read_only=True)

    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        return cleaned

    def validate_vendor_code(self, value):
        cleaned = (value or "").strip().upper()
        if not cleaned:
            return ""
        queryset = Vendor.objects.filter(vendor_code__iexact=cleaned)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A vendor with this code already exists.")
        return cleaned

    def create(self, validated_data):
        vendor = super().create(validated_data)
        request = self.context.get("request")
        sync_party_for_vendor(vendor, performed_by=getattr(request, "user", None))
        return vendor

    def update(self, instance, validated_data):
        vendor = super().update(instance, validated_data)
        request = self.context.get("request")
        sync_party_for_vendor(vendor, performed_by=getattr(request, "user", None))
        return vendor

    class Meta:
        model = Vendor
        fields = [
            "id",
            "vendor_code",
            "name",
            "display_name",
            "legal_name",
            "contact_person",
            "phone",
            "whatsapp",
            "email",
            "address",
            "gstin",
            "pan",
            "state_code",
            "state_name",
            "status",
            "payment_terms",
            "credit_period_days",
            "quality_score",
            "delivery_score",
            "warranty_score",
            "price_score",
            "rating",
            "notes",
            "linked_user",
            "is_active",
            "categories",
            "addresses",
            "service_areas",
            "products",
            "created_at",
            "updated_at",
        ]


class VendorSourcingSuggestSerializer(serializers.Serializer):
    customer_pincode = serializers.CharField(required=False, allow_blank=True, default="")
    customer_city = serializers.CharField(required=False, allow_blank=True, default="")
    customer_district = serializers.CharField(required=False, allow_blank=True, default="")
    customer_state = serializers.CharField(required=False, allow_blank=True, default="")
    customer_branch = serializers.CharField(required=False, allow_blank=True, default="", max_length=120)
    product_id = serializers.IntegerField(required=False, allow_null=True)
    category_text = serializers.CharField(required=False, allow_blank=True, default="")
    product_name = serializers.CharField(required=False, allow_blank=True, default="")
    material = serializers.CharField(required=False, allow_blank=True, default="")
    quantity = serializers.DecimalField(required=False, max_digits=12, decimal_places=3)
    required_by = serializers.DateField(required=False, allow_null=True)
    budget_amount = serializers.DecimalField(required=False, allow_null=True, max_digits=12, decimal_places=2)
    include_out_of_area = serializers.BooleanField(required=False, default=False)


class VendorAccountLinkSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, allow_null=True)
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=1000)
    disable_portal_access = serializers.BooleanField(required=False, default=False)
