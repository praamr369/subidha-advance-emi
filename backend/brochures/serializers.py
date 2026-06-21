from __future__ import annotations

from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from brochures.models import (
    BrochureDocument,
    BrochureEnquiry,
    BrochureEnquiryProduct,
    BrochureEnquiryStatusHistory,
    BrochureQuotation,
    BrochureQuotationLine,
    BrochureQuotationStatusHistory,
    ProductBrochureSettings,
)
from brochures.services.brochure_enquiry_duplicate_service import (
    normalize_phone_for_comparison,
)
from subscriptions.models import Product

BROCHURE_SETTINGS_WRITE_FIELDS = (
    "visible_on_public_catalog",
    "visible_on_rent_catalog",
    "visible_on_lease_catalog",
    "visible_on_lucky_emi_catalog",
    "visible_on_sale_catalog",
    "monthly_rent",
    "lease_monthly_amount",
    "security_deposit",
    "brochure_sort_order",
    "brochure_featured",
    "short_description",
    "public_badge",
)


class ProductBrochureSettingsUpdateSerializer(serializers.Serializer):
    visible_on_public_catalog = serializers.BooleanField(required=False)
    visible_on_rent_catalog = serializers.BooleanField(required=False)
    visible_on_lease_catalog = serializers.BooleanField(required=False)
    visible_on_lucky_emi_catalog = serializers.BooleanField(required=False)
    visible_on_sale_catalog = serializers.BooleanField(required=False)
    monthly_rent = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=0,
        required=False,
        allow_null=True,
    )
    lease_monthly_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=0,
        required=False,
        allow_null=True,
    )
    security_deposit = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=0,
        required=False,
        allow_null=True,
    )
    brochure_sort_order = serializers.IntegerField(min_value=0, required=False)
    brochure_featured = serializers.BooleanField(required=False)
    short_description = serializers.CharField(
        max_length=180,
        required=False,
        allow_blank=True,
    )
    public_badge = serializers.CharField(
        max_length=80,
        required=False,
        allow_blank=True,
    )

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected an object.")
        unknown = sorted(set(data) - set(BROCHURE_SETTINGS_WRITE_FIELDS))
        if unknown:
            raise serializers.ValidationError(
                {"unknown_fields": [f"Unsupported field: {field}" for field in unknown]}
            )
        return super().to_internal_value(data)


class ProductBrochureSettingsBulkSerializer(serializers.Serializer):
    product_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    updates = ProductBrochureSettingsUpdateSerializer()

    def validate_product_ids(self, value):
        return list(dict.fromkeys(value))

    def validate_updates(self, value):
        if not value:
            raise serializers.ValidationError("Provide at least one setting to update.")
        return value


def brochure_settings_warnings(product, settings_row) -> list[str]:
    warnings: list[str] = []
    if settings_row.visible_on_rent_catalog and settings_row.monthly_rent is None:
        warnings.append("Rent catalog is visible but monthly rent is missing.")
    if (
        settings_row.visible_on_lease_catalog
        and settings_row.lease_monthly_amount is None
    ):
        warnings.append("Lease catalog is visible but lease monthly amount is missing.")
    if (
        getattr(product, "is_rent_enabled", False)
        or getattr(product, "is_lease_enabled", False)
    ) and settings_row.security_deposit is None:
        warnings.append("Rent/lease product has no brochure security deposit.")
    return warnings


def _product_category(product) -> str:
    master = getattr(product, "category_master", None)
    return (
        str(getattr(master, "name", "") or "").strip()
        or str(getattr(product, "category", "") or "").strip()
        or "Uncategorized"
    )


def serialize_product_brochure_settings(product, request=None) -> dict:
    try:
        settings_row = product.brochure_settings
    except ProductBrochureSettings.DoesNotExist:
        settings_row = None

    image_url = ""
    image = getattr(product, "image", None)
    if image:
        try:
            image_url = image.url
        except (AttributeError, ValueError):
            image_url = ""
    if image_url and request:
        image_url = request.build_absolute_uri(image_url)

    return {
        "product_id": product.id,
        "product_code": str(getattr(product, "product_code", "") or ""),
        "name": str(getattr(product, "name", "") or ""),
        "category": _product_category(product),
        "base_price": (
            str(product.base_price)
            if getattr(product, "base_price", None) is not None
            else None
        ),
        "is_active": bool(getattr(product, "is_active", True)),
        "lifecycle_status": str(getattr(product, "lifecycle_status", "") or ""),
        "image_url": image_url or None,
        "is_emi_enabled": bool(getattr(product, "is_emi_enabled", False)),
        "is_rent_enabled": bool(getattr(product, "is_rent_enabled", False)),
        "is_lease_enabled": bool(getattr(product, "is_lease_enabled", False)),
        "is_direct_sale_enabled": bool(
            getattr(product, "is_direct_sale_enabled", False)
        ),
        "has_settings": settings_row is not None,
        "visible_on_public_catalog": (
            settings_row.visible_on_public_catalog if settings_row else False
        ),
        "visible_on_rent_catalog": (
            settings_row.visible_on_rent_catalog if settings_row else False
        ),
        "visible_on_lease_catalog": (
            settings_row.visible_on_lease_catalog if settings_row else False
        ),
        "visible_on_lucky_emi_catalog": (
            settings_row.visible_on_lucky_emi_catalog if settings_row else False
        ),
        "visible_on_sale_catalog": (
            settings_row.visible_on_sale_catalog if settings_row else False
        ),
        "monthly_rent": (
            str(settings_row.monthly_rent)
            if settings_row and settings_row.monthly_rent is not None
            else None
        ),
        "lease_monthly_amount": (
            str(settings_row.lease_monthly_amount)
            if settings_row and settings_row.lease_monthly_amount is not None
            else None
        ),
        "security_deposit": (
            str(settings_row.security_deposit)
            if settings_row and settings_row.security_deposit is not None
            else None
        ),
        "brochure_sort_order": (
            settings_row.brochure_sort_order if settings_row else 100
        ),
        "brochure_featured": (
            settings_row.brochure_featured if settings_row else False
        ),
        "short_description": settings_row.short_description if settings_row else "",
        "public_badge": settings_row.public_badge if settings_row else "",
        "updated_at": settings_row.updated_at if settings_row else None,
    }


class BrochureRequestSerializer(serializers.Serializer):
    brochure_type = serializers.ChoiceField(
        choices=BrochureDocument.BrochureType.choices
    )
    title = serializers.CharField(max_length=160, required=False, allow_blank=True)
    category = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    product_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=True,
        default=list,
    )
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs):
        attrs["product_ids"] = list(dict.fromkeys(attrs.get("product_ids") or []))
        if (
            attrs["brochure_type"] == BrochureDocument.BrochureType.CUSTOM
            and not attrs["product_ids"]
        ):
            raise serializers.ValidationError(
                {"product_ids": "Select at least one product for a custom brochure."}
            )
        expires_at = attrs.get("expires_at")
        if expires_at and expires_at <= timezone.now():
            raise serializers.ValidationError(
                {"expires_at": "Expiry must be in the future."}
            )
        return attrs


class BrochureProductQuerySerializer(serializers.Serializer):
    brochure_type = serializers.ChoiceField(
        choices=BrochureDocument.BrochureType.choices
    )
    category = serializers.CharField(max_length=120, required=False, allow_blank=True)


def brochure_pdf_url(document: BrochureDocument, request=None) -> str:
    if not document.pdf_file:
        return ""
    url = document.pdf_file.url
    return request.build_absolute_uri(url) if request else url


def brochure_public_url(document: BrochureDocument, request=None) -> str:
    url = reverse(
        "public-brochure-detail", kwargs={"public_token": document.public_token}
    )
    return request.build_absolute_uri(url) if request else url


def brochure_whatsapp_message(document: BrochureDocument, request=None) -> str:
    return (
        "Hello, please check our latest Subidha Furniture product catalog:\n"
        f"{brochure_public_url(document, request)}\n\n"
        "You can rent, lease, buy directly, or ask for Lucky EMI options depending on product availability.\n"
        "Prices are indicative until final confirmation."
    )


class BrochureDocumentSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    public_url = serializers.SerializerMethodField()
    whatsapp_message = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )

    class Meta:
        model = BrochureDocument
        fields = [
            "id",
            "brochure_no",
            "title",
            "brochure_type",
            "status",
            "expires_at",
            "created_at",
            "updated_at",
            "created_by_name",
            "filter_payload",
            "product_snapshot",
            "product_count",
            "pdf_url",
            "public_url",
            "whatsapp_message",
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj):
        return brochure_pdf_url(obj, self.context.get("request"))

    def get_public_url(self, obj):
        return brochure_public_url(obj, self.context.get("request"))

    def get_whatsapp_message(self, obj):
        return brochure_whatsapp_message(obj, self.context.get("request"))

    def get_product_count(self, obj):
        return len(obj.product_snapshot or [])


class PublicBrochureSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    products = serializers.SerializerMethodField()

    class Meta:
        model = BrochureDocument
        fields = [
            "brochure_no",
            "title",
            "brochure_type",
            "status",
            "expires_at",
            "created_at",
            "product_count",
            "products",
            "pdf_url",
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj):
        return brochure_pdf_url(obj, self.context.get("request"))

    def get_product_count(self, obj):
        return len(obj.product_snapshot or [])

    def get_products(self, obj):
        return [
            {
                key: value
                for key, value in row.items()
                if key in SAFE_SNAPSHOT_FIELDS
            }
            for row in (obj.product_snapshot or [])
            if isinstance(row, dict)
        ]


SAFE_SNAPSHOT_FIELDS = {
    "id",
    "product_code",
    "name",
    "category",
    "short_description",
    "public_badge",
    "sale_price",
    "monthly_rent",
    "lease_monthly_amount",
    "security_deposit",
    "availability_label",
    "public_product_url",
    "featured",
    "sort_order",
}


class PublicBrochureEnquiryProductInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    requested_quantity = serializers.IntegerField(min_value=1, max_value=100, default=1)
    preferred_plan = serializers.ChoiceField(
        choices=BrochureEnquiry.PreferredPlan.choices,
        required=False,
        allow_null=True,
    )
    notes = serializers.CharField(max_length=240, required=False, allow_blank=True)


class PublicBrochureEnquirySerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=30)
    alternate_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    location = serializers.CharField(max_length=180, required=False, allow_blank=True)
    address_text = serializers.CharField(required=False, allow_blank=True)
    preferred_plan = serializers.ChoiceField(choices=BrochureEnquiry.PreferredPlan.choices)
    message = serializers.CharField(required=False, allow_blank=True)
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    products = PublicBrochureEnquiryProductInputSerializer(
        many=True,
        required=False,
        default=list,
    )

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected an object.")
        allowed = set(self.fields)
        unknown = sorted(set(data) - allowed)
        if unknown:
            raise serializers.ValidationError(
                {"unknown_fields": [f"Unsupported public field: {field}" for field in unknown]}
            )
        return super().to_internal_value(data)

    def validate_phone(self, value):
        normalized = normalize_phone_for_comparison(value)
        digit_count = sum(character.isdigit() for character in normalized)
        if digit_count < 7 or digit_count > 15:
            raise serializers.ValidationError("Enter a phone number containing 7 to 15 digits.")
        return value.strip()

    def validate_alternate_phone(self, value):
        if not value:
            return ""
        normalized = normalize_phone_for_comparison(value)
        digit_count = sum(character.isdigit() for character in normalized)
        if digit_count < 7 or digit_count > 15:
            raise serializers.ValidationError("Enter a phone number containing 7 to 15 digits.")
        return value.strip()

    def validate(self, attrs):
        brochure = self.context["brochure"]
        snapshots = {
            int(row["id"]): row
            for row in (brochure.product_snapshot or [])
            if isinstance(row, dict) and str(row.get("id", "")).isdigit()
        }
        seen = set()
        resolved_products = []
        for item in attrs.get("products", []):
            product_id = item["product_id"]
            if product_id in seen:
                raise serializers.ValidationError(
                    {"products": f"Product {product_id} was selected more than once."}
                )
            snapshot = snapshots.get(product_id)
            if snapshot is None:
                raise serializers.ValidationError(
                    {"products": f"Product {product_id} is not part of this brochure."}
                )
            seen.add(product_id)
            resolved_products.append(
                {
                    **item,
                    "snapshot": {
                        key: value for key, value in snapshot.items() if key in SAFE_SNAPSHOT_FIELDS
                    },
                }
            )
        attrs["resolved_products"] = resolved_products
        return attrs


class BrochureEnquiryProductAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = BrochureEnquiryProduct
        fields = [
            "id",
            "product_id",
            "product_snapshot",
            "brochure_product_code",
            "brochure_product_name",
            "requested_quantity",
            "preferred_plan",
            "notes",
        ]
        read_only_fields = fields


class BrochureEnquiryStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BrochureEnquiryStatusHistory
        fields = [
            "id",
            "event_type",
            "from_status",
            "to_status",
            "note",
            "changed_by",
            "changed_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_changed_by_name(self, obj):
        if not obj.changed_by:
            return ""
        return obj.changed_by.get_full_name().strip() or obj.changed_by.username


class BrochureEnquiryAdminSerializer(serializers.ModelSerializer):
    products = BrochureEnquiryProductAdminSerializer(many=True, read_only=True)
    brochure_no = serializers.CharField(source="brochure.brochure_no", read_only=True)
    brochure_type = serializers.CharField(source="brochure.brochure_type", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    duplicate_of_enquiry_no = serializers.CharField(
        source="duplicate_of.enquiry_no",
        read_only=True,
        default="",
    )
    crm_summary = serializers.SerializerMethodField()
    status_history = BrochureEnquiryStatusHistorySerializer(many=True, read_only=True)
    quotation_summaries = serializers.SerializerMethodField()

    class Meta:
        model = BrochureEnquiry
        fields = [
            "id",
            "enquiry_no",
            "brochure_id",
            "brochure_no",
            "brochure_type",
            "customer_name",
            "phone",
            "alternate_phone",
            "email",
            "location",
            "address_text",
            "preferred_plan",
            "message",
            "internal_note",
            "expected_delivery_date",
            "follow_up_at",
            "last_contacted_at",
            "status",
            "priority",
            "assigned_to",
            "assigned_to_name",
            "source",
            "is_possible_duplicate",
            "duplicate_of",
            "duplicate_of_enquiry_no",
            "duplicate_reason",
            "crm_link_status",
            "crm_link_message",
            "products",
            "crm_summary",
            "status_history",
            "quotation_summaries",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return ""
        return obj.assigned_to.get_full_name().strip() or obj.assigned_to.username

    def get_crm_summary(self, obj):
        return {
            "party_id": obj.crm_party_id,
            "interaction_id": obj.crm_interaction_id,
            "lead_id": obj.crm_lead_id,
            "warning": obj.crm_sync_warning,
        }

    def get_quotation_summaries(self, obj):
        return [
            {
                "id": quote.id,
                "quotation_no": quote.quotation_no,
                "status": quote.status,
                "quotation_type": quote.quotation_type,
                "created_at": quote.created_at,
            }
            for quote in obj.quotations.all()
        ]

    def to_representation(self, instance):
        output = super().to_representation(instance)
        if not self.context.get("include_internal_detail", False):
            output.pop("internal_note", None)
            output.pop("status_history", None)
        return output


class BrochureEnquiryUpdateSerializer(serializers.ModelSerializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(
            is_active=True,
            role__in=["ADMIN", "CASHIER", "STAFF"],
        ),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = BrochureEnquiry
        fields = [
            "status",
            "priority",
            "assigned_to",
            "internal_note",
            "expected_delivery_date",
            "follow_up_at",
        ]


class BrochureEnquiryAssignSerializer(serializers.Serializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(
            is_active=True,
            role__in=["ADMIN", "CASHIER", "STAFF"],
        ),
        allow_null=True,
    )


class BrochureEnquiryCloseSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            BrochureEnquiry.Status.CLOSED,
            BrochureEnquiry.Status.LOST,
        ],
        default=BrochureEnquiry.Status.CLOSED,
    )
    internal_note = serializers.CharField(required=False, allow_blank=True)


def quotation_pdf_url(quotation: BrochureQuotation, request=None) -> str:
    if not quotation.pdf_file:
        return ""
    url = quotation.pdf_file.url
    return request.build_absolute_uri(url) if request else url


def quotation_public_url(quotation: BrochureQuotation, request=None) -> str:
    path = f"/quotations/{quotation.public_token}"
    return request.build_absolute_uri(path) if request else path


def quotation_whatsapp_message(quotation: BrochureQuotation, request=None) -> str:
    return (
        "Hello, your Subidha Furniture quotation is ready:\n"
        f"{quotation_public_url(quotation, request)}\n\n"
        f"Quotation No: {quotation.quotation_no}\n"
        "Please review the products, pricing, deposit, delivery charges, and terms. "
        "Final booking is subject to admin confirmation and stock availability."
    )


class BrochureQuotationLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = BrochureQuotationLine
        fields = [
            "id",
            "product_id",
            "product_snapshot",
            "product_code",
            "product_name",
            "description",
            "plan_type",
            "quantity",
            "unit_price",
            "monthly_amount",
            "tenure_months",
            "security_deposit",
            "discount_amount",
            "line_total",
            "availability_label",
            "sort_order",
        ]
        read_only_fields = fields


class PublicBrochureQuotationLineSerializer(serializers.ModelSerializer):
    product_snapshot = serializers.SerializerMethodField()

    class Meta:
        model = BrochureQuotationLine
        fields = [
            "product_snapshot",
            "product_code",
            "product_name",
            "description",
            "plan_type",
            "quantity",
            "unit_price",
            "monthly_amount",
            "tenure_months",
            "security_deposit",
            "discount_amount",
            "line_total",
            "availability_label",
        ]
        read_only_fields = fields

    def get_product_snapshot(self, obj):
        return {
            key: value
            for key, value in (obj.product_snapshot or {}).items()
            if key in SAFE_SNAPSHOT_FIELDS
        }


class BrochureQuotationStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BrochureQuotationStatusHistory
        fields = [
            "id",
            "from_status",
            "to_status",
            "note",
            "changed_by",
            "changed_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_changed_by_name(self, obj):
        if not obj.changed_by:
            return ""
        return obj.changed_by.get_full_name().strip() or obj.changed_by.username


class BrochureQuotationAdminSerializer(serializers.ModelSerializer):
    lines = BrochureQuotationLineSerializer(many=True, read_only=True)
    status_history = BrochureQuotationStatusHistorySerializer(many=True, read_only=True)
    pdf_url = serializers.SerializerMethodField()
    public_url = serializers.SerializerMethodField()
    whatsapp_message = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    enquiry_summary = serializers.SerializerMethodField()
    brochure_summary = serializers.SerializerMethodField()
    crm_summary = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()

    class Meta:
        model = BrochureQuotation
        fields = [
            "id",
            "quotation_no",
            "enquiry_id",
            "brochure_id",
            "customer_name",
            "phone",
            "email",
            "location",
            "address_text",
            "quotation_type",
            "status",
            "validity_date",
            "expected_delivery_date",
            "subtotal_amount",
            "discount_amount",
            "delivery_charge",
            "security_deposit_total",
            "total_payable_now",
            "recurring_monthly_total",
            "grand_total",
            "totals",
            "terms_text",
            "internal_note",
            "sent_at",
            "accepted_at",
            "created_at",
            "updated_at",
            "created_by_name",
            "lines",
            "status_history",
            "enquiry_summary",
            "brochure_summary",
            "crm_summary",
            "pdf_url",
            "public_url",
            "whatsapp_message",
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj):
        return quotation_pdf_url(obj, self.context.get("request"))

    def get_public_url(self, obj):
        return quotation_public_url(obj, self.context.get("request"))

    def get_whatsapp_message(self, obj):
        return quotation_whatsapp_message(obj, self.context.get("request"))

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name().strip() or obj.created_by.username

    def get_enquiry_summary(self, obj):
        if not obj.enquiry:
            return None
        return {
            "id": obj.enquiry_id,
            "enquiry_no": obj.enquiry.enquiry_no,
            "status": obj.enquiry.status,
        }

    def get_brochure_summary(self, obj):
        if not obj.brochure:
            return None
        return {
            "id": obj.brochure_id,
            "brochure_no": obj.brochure.brochure_no,
            "title": obj.brochure.title,
        }

    def get_crm_summary(self, obj):
        return {
            "party_id": obj.crm_party_id,
            "lead_id": obj.crm_lead_id,
        }

    def get_totals(self, obj):
        return {
            "subtotal_amount": obj.subtotal_amount,
            "discount_amount": obj.discount_amount,
            "delivery_charge": obj.delivery_charge,
            "security_deposit_total": obj.security_deposit_total,
            "total_payable_now": obj.total_payable_now,
            "recurring_monthly_total": obj.recurring_monthly_total,
            "grand_total": obj.grand_total,
        }

    def to_representation(self, instance):
        output = super().to_representation(instance)
        if not self.context.get("include_internal_detail", False):
            output.pop("internal_note", None)
            output.pop("status_history", None)
        return output


class BrochureQuotationLineWriteSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    product_snapshot = serializers.JSONField(required=False, default=dict)
    product_code = serializers.CharField(max_length=80, required=False, allow_blank=True)
    product_name = serializers.CharField(
        max_length=180, required=False, allow_blank=True
    )
    description = serializers.CharField(max_length=240, required=False, allow_blank=True)
    plan_type = serializers.ChoiceField(choices=BrochureQuotationLine.PlanType.choices)
    quantity = serializers.IntegerField(min_value=1, default=1)
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False
    )
    monthly_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False
    )
    tenure_months = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    security_deposit = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False
    )
    discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    availability_label = serializers.CharField(
        max_length=80, required=False, allow_blank=True
    )
    sort_order = serializers.IntegerField(min_value=0, required=False, default=100)


class BrochureQuotationCreateSerializer(serializers.Serializer):
    enquiry_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    brochure_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    crm_party_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    crm_lead_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=30)
    email = serializers.EmailField(required=False, allow_blank=True)
    location = serializers.CharField(max_length=180, required=False, allow_blank=True)
    address_text = serializers.CharField(required=False, allow_blank=True)
    quotation_type = serializers.ChoiceField(choices=BrochureQuotation.QuotationType.choices)
    validity_date = serializers.DateField(required=False, allow_null=True)
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    delivery_charge = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    terms_text = serializers.CharField(required=False, allow_blank=True)
    internal_note = serializers.CharField(required=False, allow_blank=True)
    lines = BrochureQuotationLineWriteSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        if attrs.get("enquiry_id"):
            attrs["enquiry"] = BrochureEnquiry.objects.filter(
                pk=attrs.pop("enquiry_id")
            ).first()
            if attrs["enquiry"] is None:
                raise serializers.ValidationError({"enquiry_id": "Enquiry not found."})
        if attrs.get("brochure_id"):
            attrs["brochure"] = BrochureDocument.objects.filter(
                pk=attrs.pop("brochure_id")
            ).first()
            if attrs["brochure"] is None:
                raise serializers.ValidationError({"brochure_id": "Brochure not found."})
        return attrs


class BrochureQuotationUpdateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120, required=False)
    phone = serializers.CharField(max_length=30, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    location = serializers.CharField(max_length=180, required=False, allow_blank=True)
    address_text = serializers.CharField(required=False, allow_blank=True)
    validity_date = serializers.DateField(required=False, allow_null=True)
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False
    )
    delivery_charge = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False
    )
    terms_text = serializers.CharField(required=False, allow_blank=True)
    internal_note = serializers.CharField(required=False, allow_blank=True)
    lines = BrochureQuotationLineWriteSerializer(many=True, allow_empty=False, required=False)


class BrochureQuotationStatusActionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)


class PublicBrochureQuotationSerializer(serializers.ModelSerializer):
    lines = PublicBrochureQuotationLineSerializer(many=True, read_only=True)
    pdf_url = serializers.SerializerMethodField()
    business_contact = serializers.SerializerMethodField()
    customer_display_name = serializers.SerializerMethodField()
    disclaimer = serializers.CharField(
        default=(
            "This quotation is not an invoice, receipt, contract, subscription, or "
            "stock reservation. Final billing, payment, stock availability, delivery, "
            "and contract creation require admin approval and separate confirmation."
        ),
        read_only=True,
    )

    class Meta:
        model = BrochureQuotation
        fields = [
            "quotation_no",
            "status",
            "validity_date",
            "customer_display_name",
            "quotation_type",
            "lines",
            "subtotal_amount",
            "discount_amount",
            "delivery_charge",
            "security_deposit_total",
            "total_payable_now",
            "recurring_monthly_total",
            "grand_total",
            "terms_text",
            "pdf_url",
            "business_contact",
            "disclaimer",
            "created_at",
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj):
        return quotation_pdf_url(obj, self.context.get("request"))

    def get_customer_display_name(self, obj):
        parts = obj.customer_name.split()
        return parts[0] if parts else "Customer"

    def get_business_contact(self, obj):
        from subscriptions.services.pdf_branding_service import get_branding_context

        branding = get_branding_context()
        return {
            "business_name": branding.business_name,
            "phone": branding.phone,
            "email": branding.email,
            "address": branding.address,
        }
