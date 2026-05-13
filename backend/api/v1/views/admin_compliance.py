from __future__ import annotations

from datetime import date

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import (
    BusinessTaxProfile,
    BusinessTaxRegistrationMode,
    ComplianceAlertThreshold,
    PartyTaxProfile,
    ProductTaxProfile,
)
from accounting.services.gst_transition_service import activate_business_tax_profile
from accounting.services.tax_profile_service import (
    build_tax_profile_snapshot,
    ensure_default_compliance_thresholds,
    get_active_business_tax_profile,
)
from accounting.services.turnover_compliance_service import (
    build_threshold_alerts,
    build_turnover_summary,
)
from api.v1.permissions import IsAdmin
from subscriptions.models import Product


class _AdminComplianceView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class BusinessTaxProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessTaxProfile
        fields = [
            "id",
            "mode",
            "legal_name",
            "gstin",
            "pan",
            "state_code",
            "state_name",
            "effective_from",
            "effective_to",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ActivateTaxProfileSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=BusinessTaxRegistrationMode.choices)
    effective_from = serializers.DateField(required=False)
    gstin = serializers.CharField(required=False, allow_blank=True)
    legal_name = serializers.CharField(required=False, allow_blank=True)
    pan = serializers.CharField(required=False, allow_blank=True)
    state_code = serializers.CharField(required=False, allow_blank=True)
    state_name = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        mode = (attrs.get("mode") or "").strip().upper()
        if mode in {
            BusinessTaxRegistrationMode.GST_REGULAR,
            BusinessTaxRegistrationMode.GST_COMPOSITION,
        }:
            if not (attrs.get("gstin") or "").strip():
                raise serializers.ValidationError({"gstin": "GSTIN is required for GST_REGULAR/GST_COMPOSITION."})
            if not attrs.get("effective_from"):
                raise serializers.ValidationError({"effective_from": "effective_from is required for GST activation."})
        attrs.setdefault("effective_from", timezone.localdate())
        return attrs


class ProductTaxProfileSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ProductTaxProfile
        fields = [
            "id",
            "product",
            "product_code",
            "product_name",
            "hsn_code",
            "tax_category",
            "gst_rate",
            "effective_from",
            "effective_to",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PartyTaxProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = PartyTaxProfile
        fields = [
            "id",
            "party_type",
            "party_id",
            "tax_type",
            "legal_name",
            "gstin",
            "pan",
            "state_code",
            "state_name",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ComplianceTaxProfileView(_AdminComplianceView):
    def get(self, request):
        active = get_active_business_tax_profile()
        history = BusinessTaxProfile.objects.order_by("-effective_from", "-id")[:20]
        return Response(
            {
                "active": BusinessTaxProfileSerializer(active).data,
                "snapshot": build_tax_profile_snapshot(),
                "history": BusinessTaxProfileSerializer(history, many=True).data,
            }
        )

    def post(self, request):
        serializer = ActivateTaxProfileSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        profile = activate_business_tax_profile(**serializer.validated_data)
        return Response(BusinessTaxProfileSerializer(profile).data, status=status.HTTP_201_CREATED)


class ComplianceTaxProfileActivateView(_AdminComplianceView):
    def post(self, request):
        serializer = ActivateTaxProfileSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        profile = activate_business_tax_profile(**serializer.validated_data)
        return Response({"activated": True, "tax_profile": BusinessTaxProfileSerializer(profile).data})


class ComplianceTaxReadinessView(_AdminComplianceView):
    def get(self, request):
        product_total = Product.objects.count()
        product_profile_total = ProductTaxProfile.objects.filter(is_active=True).count()
        party_profile_total = PartyTaxProfile.objects.filter(is_active=True).count()
        missing_product_tax = max(product_total - product_profile_total, 0)

        missing_hsn = ProductTaxProfile.objects.filter(is_active=True).filter(Q(hsn_code="") | Q(hsn_code__isnull=True)).count()
        missing_party_legal_name = PartyTaxProfile.objects.filter(is_active=True).filter(Q(legal_name="") | Q(legal_name__isnull=True)).count()

        return Response(
            {
                "tax_mode": build_tax_profile_snapshot(),
                "product_readiness": {
                    "total_products": product_total,
                    "active_product_tax_profiles": product_profile_total,
                    "missing_product_tax_profiles": missing_product_tax,
                    "missing_hsn_code": missing_hsn,
                },
                "party_readiness": {
                    "active_party_tax_profiles": party_profile_total,
                    "missing_legal_name": missing_party_legal_name,
                },
                "gst_features": {
                    "gstr_enabled": False,
                    "e_invoice_enabled": False,
                },
            }
        )


class ComplianceTurnoverSummaryView(_AdminComplianceView):
    def get(self, request):
        ensure_default_compliance_thresholds()
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        parsed_start = date.fromisoformat(start_date) if start_date else None
        parsed_end = date.fromisoformat(end_date) if end_date else None
        summary = build_turnover_summary(start_date=parsed_start, end_date=parsed_end)
        alerts = build_threshold_alerts(summary=summary)
        return Response({"summary": summary, "alerts": alerts})


class ComplianceProductTaxProfilesView(_AdminComplianceView):
    def get(self, request):
        queryset = ProductTaxProfile.objects.select_related("product").order_by("product_id", "-effective_from", "-id")
        return Response({"count": queryset.count(), "results": ProductTaxProfileSerializer(queryset, many=True).data})

    def post(self, request):
        serializer = ProductTaxProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ProductTaxProfileSerializer(instance).data, status=status.HTTP_201_CREATED)


class CompliancePartyTaxProfilesView(_AdminComplianceView):
    def get(self, request):
        queryset = PartyTaxProfile.objects.order_by("party_type", "party_id", "-id")
        return Response({"count": queryset.count(), "results": PartyTaxProfileSerializer(queryset, many=True).data})

    def post(self, request):
        serializer = PartyTaxProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(PartyTaxProfileSerializer(instance).data, status=status.HTTP_201_CREATED)
