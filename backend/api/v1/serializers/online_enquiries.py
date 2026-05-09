from rest_framework import serializers

from accounting.models import CustomerPurchaseEnquiry
from api.v1.serializers.vendor_ops import VendorQuoteRequestSerializer


class CustomerPurchaseEnquiryListSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerPurchaseEnquiry
        fields = [
            "id",
            "enquiry_no",
            "customer",
            "customer_name",
            "phone",
            "email",
            "product",
            "product_name",
            "category_text",
            "material",
            "quantity",
            "budget_amount",
            "delivery_address",
            "city",
            "district",
            "state",
            "pincode",
            "status",
            "public_lead",
            "selected_vendor_quote",
            "draft_purchase_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CustomerPurchaseEnquiryDetailSerializer(CustomerPurchaseEnquiryListSerializer):
    quote_requests = serializers.SerializerMethodField()

    class Meta(CustomerPurchaseEnquiryListSerializer.Meta):
        fields = CustomerPurchaseEnquiryListSerializer.Meta.fields + ["quote_requests"]

    def get_quote_requests(self, obj):
        from accounting.models import VendorQuoteRequest

        qs = (
            VendorQuoteRequest.objects.filter(source_type="ONLINE_ORDER", source_id=obj.pk)
            .prefetch_related("quotes__vendor")
            .order_by("-created_at", "-id")
        )
        return VendorQuoteRequestSerializer(qs, many=True).data


class OnlineEnquiryRequestQuotesSerializer(serializers.Serializer):
    vendor_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1)
    send_to_vendors = serializers.BooleanField(required=False, default=True)


class OnlineEnquirySelectQuoteSerializer(serializers.Serializer):
    vendor_quote_id = serializers.IntegerField(min_value=1)
    allow_on_hold_vendor = serializers.BooleanField(required=False, default=False)
    allow_blocked_vendor = serializers.BooleanField(required=False, default=False)


class OnlineEnquiryDraftPurchaseOrderSerializer(serializers.Serializer):
    confirm = serializers.BooleanField(required=True)
    inventory_item_id = serializers.IntegerField(min_value=1)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    stock_location_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
