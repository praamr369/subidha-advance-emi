"""
P5A — Growth Foundation: admin config endpoints for PlanTemplate and OfferPackage.

All endpoints: IsAuthenticated + IsAdmin.
No subscription, EMI, payment, JournalEntry, AccountingBridgePosting,
StockLedger, LuckyDraw, Commission, or Payout record is created or mutated.
Offer pricing (price_override, discount_value) is preview/config only.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.growth_offer_service import (
    build_offer_package_preview,
    build_plan_template_preview,
    list_active_offer_packages,
    validate_offer_package_configuration,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _import_models():
    from subscriptions.models_growth_offers import (
        OfferAudienceType,
        OfferDiscountType,
        OfferPackage,
        OfferPackageLine,
        OfferPackageStatus,
        PlanTemplate,
        PlanTemplateType,
    )
    return (
        PlanTemplate, PlanTemplateType,
        OfferPackage, OfferPackageStatus, OfferAudienceType,
        OfferPackageLine, OfferDiscountType,
    )


def _serialize_template(t) -> dict:
    return {
        "id": t.pk,
        "template_code": t.template_code,
        "name": t.name,
        "description": t.description,
        "plan_type": t.plan_type,
        "tenure_months": t.tenure_months,
        "default_down_payment_percent": (
            str(t.default_down_payment_percent) if t.default_down_payment_percent is not None else None
        ),
        "default_security_deposit_percent": (
            str(t.default_security_deposit_percent) if t.default_security_deposit_percent is not None else None
        ),
        "default_grace_days": t.default_grace_days,
        "is_lucky_plan_eligible": t.is_lucky_plan_eligible,
        "requires_batch": t.requires_batch,
        "requires_lucky_id": t.requires_lucky_id,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "created_by_id": t.created_by_id,
        "updated_by_id": t.updated_by_id,
        "metadata": t.metadata or {},
    }


def _serialize_package(pkg) -> dict:
    lines = list(pkg.lines.select_related("product").all())
    return {
        "id": pkg.pk,
        "package_code": pkg.package_code,
        "name": pkg.name,
        "description": pkg.description,
        "plan_template_id": pkg.plan_template_id,
        "plan_template_code": pkg.plan_template.template_code if pkg.plan_template_id else None,
        "plan_type": pkg.plan_template.plan_type if pkg.plan_template_id else None,
        "start_date": pkg.start_date.isoformat() if pkg.start_date else None,
        "end_date": pkg.end_date.isoformat() if pkg.end_date else None,
        "status": pkg.status,
        "audience_type": pkg.audience_type,
        "max_contract_value": str(pkg.max_contract_value) if pkg.max_contract_value is not None else None,
        "min_contract_value": str(pkg.min_contract_value) if pkg.min_contract_value is not None else None,
        "display_priority": pkg.display_priority,
        "is_public_visible": pkg.is_public_visible,
        "requires_approval": pkg.requires_approval,
        "created_at": pkg.created_at.isoformat(),
        "updated_at": pkg.updated_at.isoformat(),
        "created_by_id": pkg.created_by_id,
        "updated_by_id": pkg.updated_by_id,
        "metadata": pkg.metadata or {},
        "lines": [
            {
                "id": line.pk,
                "product_id": line.product_id,
                "product_name": line.product.name if line.product_id else None,
                "quantity": line.quantity,
                "price_override": str(line.price_override) if line.price_override is not None else None,
                "discount_type": line.discount_type,
                "discount_value": str(line.discount_value),
                "metadata": line.metadata or {},
            }
            for line in lines
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# PlanTemplate views
# ─────────────────────────────────────────────────────────────────────────────

class AdminPlanTemplateListView(APIView):
    """
    GET  /api/v1/admin/growth/plan-templates/
    POST /api/v1/admin/growth/plan-templates/
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        (PlanTemplate, PlanTemplateType, *_) = _import_models()
        plan_type = request.query_params.get("plan_type")
        is_active = request.query_params.get("is_active")
        qs = PlanTemplate.objects.all().order_by("plan_type", "template_code")
        if plan_type:
            qs = qs.filter(plan_type=plan_type)
        if is_active is not None:
            qs = qs.filter(is_active=(is_active.lower() != "false"))
        return Response({"results": [_serialize_template(t) for t in qs]})

    def post(self, request):
        (PlanTemplate, PlanTemplateType, *_) = _import_models()
        data = request.data
        required = ["template_code", "name", "plan_type"]
        missing = [f for f in required if not data.get(f)]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {missing}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if data["plan_type"] not in [c[0] for c in PlanTemplateType.choices]:
            return Response(
                {"detail": f"Invalid plan_type. Choices: {[c[0] for c in PlanTemplateType.choices]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if PlanTemplate.objects.filter(template_code=data["template_code"]).exists():
            return Response(
                {"detail": f"template_code '{data['template_code']}' already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            t = PlanTemplate(
                template_code=data["template_code"],
                name=data["name"],
                description=data.get("description", ""),
                plan_type=data["plan_type"],
                tenure_months=data.get("tenure_months"),
                default_down_payment_percent=data.get("default_down_payment_percent"),
                default_security_deposit_percent=data.get("default_security_deposit_percent"),
                default_grace_days=data.get("default_grace_days"),
                is_lucky_plan_eligible=bool(data.get("is_lucky_plan_eligible", False)),
                requires_batch=bool(data.get("requires_batch", False)),
                requires_lucky_id=bool(data.get("requires_lucky_id", False)),
                is_active=bool(data.get("is_active", True)),
                metadata=data.get("metadata") or {},
                created_by=request.user,
                updated_by=request.user,
            )
            t.full_clean()
            t.save()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize_template(t), status=status.HTTP_201_CREATED)


class AdminPlanTemplateDetailView(APIView):
    """
    GET   /api/v1/admin/growth/plan-templates/{id}/
    PATCH /api/v1/admin/growth/plan-templates/{id}/
    """

    permission_classes = [IsAdmin]

    def _get_template(self, pk):
        (PlanTemplate, *_) = _import_models()
        try:
            return PlanTemplate.objects.get(pk=pk)
        except PlanTemplate.DoesNotExist:
            return None

    def get(self, request, pk):
        t = self._get_template(pk)
        if t is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_template(t))

    def patch(self, request, pk):
        t = self._get_template(pk)
        if t is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = request.data
        mutable_fields = [
            "name", "description", "tenure_months",
            "default_down_payment_percent", "default_security_deposit_percent",
            "default_grace_days", "is_lucky_plan_eligible", "requires_batch",
            "requires_lucky_id", "is_active", "metadata",
        ]
        for field in mutable_fields:
            if field in data:
                setattr(t, field, data[field])
        t.updated_by = request.user
        try:
            t.full_clean()
            t.save()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize_template(t))


# ─────────────────────────────────────────────────────────────────────────────
# OfferPackage views
# ─────────────────────────────────────────────────────────────────────────────

class AdminOfferPackageListView(APIView):
    """
    GET  /api/v1/admin/growth/offer-packages/
    POST /api/v1/admin/growth/offer-packages/
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        (_, _, OfferPackage, OfferPackageStatus, OfferAudienceType, *_) = _import_models()
        qs = OfferPackage.objects.select_related("plan_template").order_by(
            "display_priority", "package_code"
        )
        pkg_status = request.query_params.get("status")
        plan_type = request.query_params.get("plan_type")
        if pkg_status:
            qs = qs.filter(status=pkg_status)
        if plan_type:
            qs = qs.filter(plan_template__plan_type=plan_type)
        return Response({"results": [_serialize_package(p) for p in qs]})

    def post(self, request):
        (_, _, OfferPackage, OfferPackageStatus, OfferAudienceType, OfferPackageLine, OfferDiscountType) = _import_models()
        from subscriptions.models_growth_offers import PlanTemplate
        data = request.data
        required = ["package_code", "name", "plan_template_id"]
        missing = [f for f in required if not data.get(f)]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {missing}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if OfferPackage.objects.filter(package_code=data["package_code"]).exists():
            return Response(
                {"detail": f"package_code '{data['package_code']}' already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            template = PlanTemplate.objects.get(pk=data["plan_template_id"])
        except PlanTemplate.DoesNotExist:
            return Response(
                {"detail": f"PlanTemplate {data['plan_template_id']} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            pkg = OfferPackage.objects.create(
                package_code=data["package_code"],
                name=data["name"],
                description=data.get("description", ""),
                plan_template=template,
                start_date=data.get("start_date"),
                end_date=data.get("end_date"),
                status=data.get("status", OfferPackageStatus.DRAFT),
                audience_type=data.get("audience_type", OfferAudienceType.ALL),
                max_contract_value=data.get("max_contract_value"),
                min_contract_value=data.get("min_contract_value"),
                display_priority=int(data.get("display_priority", 100)),
                is_public_visible=bool(data.get("is_public_visible", False)),
                requires_approval=bool(data.get("requires_approval", False)),
                metadata=data.get("metadata") or {},
                created_by=request.user,
                updated_by=request.user,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Create lines if provided
        for line_data in data.get("lines", []):
            from subscriptions.models import Product
            try:
                product = Product.objects.get(pk=line_data["product_id"])
            except Product.DoesNotExist:
                pkg.delete()
                return Response(
                    {"detail": f"Product {line_data['product_id']} not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            OfferPackageLine.objects.create(
                offer_package=pkg,
                product=product,
                quantity=int(line_data.get("quantity", 1)),
                price_override=line_data.get("price_override"),
                discount_type=line_data.get("discount_type", OfferDiscountType.NONE),
                discount_value=line_data.get("discount_value", 0),
                metadata=line_data.get("metadata") or {},
            )

        pkg.refresh_from_db()
        return Response(_serialize_package(pkg), status=status.HTTP_201_CREATED)


class AdminOfferPackageDetailView(APIView):
    """
    GET   /api/v1/admin/growth/offer-packages/{id}/
    PATCH /api/v1/admin/growth/offer-packages/{id}/
    """

    permission_classes = [IsAdmin]

    def _get_pkg(self, pk):
        (_, _, OfferPackage, *_) = _import_models()
        try:
            return OfferPackage.objects.select_related("plan_template").get(pk=pk)
        except OfferPackage.DoesNotExist:
            return None

    def get(self, request, pk):
        pkg = self._get_pkg(pk)
        if pkg is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_package(pkg))

    def patch(self, request, pk):
        pkg = self._get_pkg(pk)
        if pkg is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = request.data
        mutable_fields = [
            "name", "description", "start_date", "end_date", "status",
            "audience_type", "max_contract_value", "min_contract_value",
            "display_priority", "is_public_visible", "requires_approval", "metadata",
        ]
        for field in mutable_fields:
            if field in data:
                setattr(pkg, field, data[field])
        pkg.updated_by = request.user
        try:
            pkg.save()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        pkg.refresh_from_db()
        return Response(_serialize_package(pkg))


class AdminOfferPackagePreviewView(APIView):
    """
    GET /api/v1/admin/growth/offer-packages/{id}/preview/

    Returns a full advisory preview of the offer including eligibility
    against an optional customer (customer_id query param).
    """

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        (_, _, OfferPackage, *_) = _import_models()
        try:
            pkg = OfferPackage.objects.select_related("plan_template").get(pk=pk)
        except OfferPackage.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        customer = None
        customer_id = request.query_params.get("customer_id")
        if customer_id:
            from subscriptions.models import Customer
            try:
                customer = Customer.objects.get(pk=customer_id)
            except Customer.DoesNotExist:
                return Response(
                    {"detail": f"Customer {customer_id} not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        preview = build_offer_package_preview(pkg, customer=customer)
        validation = validate_offer_package_configuration(pkg)
        return Response({**preview, "configuration_validation": validation})
