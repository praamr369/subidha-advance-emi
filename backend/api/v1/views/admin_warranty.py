"""Admin warranty & service management endpoints"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from service_desk.models import WarrantyClaim, WarrantyExtendedPlan, ServicePricing
from api.v1.services.warranty_service import (
    create_warranty_claim,
    assess_defect_classification,
    approve_warranty_claim,
    reject_warranty_claim,
    resolve_warranty_claim,
    enroll_extended_warranty,
    mark_extended_warranty_paid,
    check_warranty_eligibility,
    get_service_pricing,
)


def _warranty_claim_row(claim: WarrantyClaim) -> dict:
    """Format warranty claim for API response"""
    return {
        "id": claim.id,
        "service_case_id": claim.service_case_id,
        "product_id": claim.product_id,
        "product_name": claim.product.name,
        "subscription_id": claim.subscription_id,
        "warranty_type": claim.warranty_type,
        "warranty_end_date": claim.warranty_end_date.isoformat(),
        "is_in_warranty": claim.is_in_warranty,
        "defect_description": claim.defect_description,
        "defect_classification": claim.defect_classification,
        "claim_status": claim.claim_status,
        "claim_submitted_at": claim.claim_submitted_at.isoformat(),
        "verified_at": claim.verified_at.isoformat() if claim.verified_at else None,
        "approved_at": claim.approved_at.isoformat() if claim.approved_at else None,
        "recommended_remedy": claim.recommended_remedy,
        "total_cost": str(claim.total_cost),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_claims_list_view(request):
    """List warranty claims with filters"""
    qs = WarrantyClaim.objects.select_related("product", "subscription").all()

    # Filters
    status_filter = request.query_params.get("status")
    product_id = request.query_params.get("product_id")
    in_warranty = request.query_params.get("in_warranty")

    if status_filter:
        qs = qs.filter(claim_status=status_filter)
    if product_id:
        qs = qs.filter(product_id=product_id)
    if in_warranty is not None:
        qs = qs.filter(is_in_warranty=in_warranty.lower() == "true")

    rows = [_warranty_claim_row(c) for c in qs[:200]]
    return Response({
        "count": qs.count(),
        "results": rows,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_claim_detail_view(request, claim_id):
    """Get warranty claim details"""
    try:
        claim = WarrantyClaim.objects.select_related(
            "product",
            "subscription",
            "verified_by",
            "approved_by",
        ).get(pk=claim_id)
    except WarrantyClaim.DoesNotExist:
        return Response({"error": "Warranty claim not found."}, status=status.HTTP_404_NOT_FOUND)

    eligibility = check_warranty_eligibility(claim)
    row = _warranty_claim_row(claim)
    row["eligibility"] = eligibility
    row["assessment_notes"] = claim.assessment_notes
    row["verified_by_name"] = claim.verified_by.get_full_name() if claim.verified_by else None
    row["approved_by_name"] = claim.approved_by.get_full_name() if claim.approved_by else None
    row["remedy_cost_labor"] = str(claim.remedy_cost_labor),
    row["remedy_cost_parts"] = str(claim.remedy_cost_parts),
    row["remedy_cost_travel"] = str(claim.remedy_cost_travel),

    return Response(row)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_claim_assess_view(request, claim_id):
    """Assess warranty claim defect"""
    try:
        claim = WarrantyClaim.objects.get(pk=claim_id)
    except WarrantyClaim.DoesNotExist:
        return Response({"error": "Warranty claim not found."}, status=status.HTTP_404_NOT_FOUND)

    classification = request.data.get("classification")
    assessment_notes = request.data.get("assessment_notes", "")

    if not classification:
        return Response(
            {"error": "classification is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    claim = assess_defect_classification(claim, classification, assessment_notes, request.user)
    return Response(_warranty_claim_row(claim))


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_claim_approve_view(request, claim_id):
    """Approve warranty claim with remedy"""
    try:
        claim = WarrantyClaim.objects.get(pk=claim_id)
    except WarrantyClaim.DoesNotExist:
        return Response({"error": "Warranty claim not found."}, status=status.HTTP_404_NOT_FOUND)

    remedy = request.data.get("remedy")
    cost_labor = float(request.data.get("cost_labor", 0))
    cost_parts = float(request.data.get("cost_parts", 0))
    cost_travel = float(request.data.get("cost_travel", 0))

    if not remedy:
        return Response(
            {"error": "remedy is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    claim = approve_warranty_claim(claim, request.user, remedy, cost_labor, cost_parts, cost_travel)
    return Response(_warranty_claim_row(claim))


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_claim_reject_view(request, claim_id):
    """Reject warranty claim"""
    try:
        claim = WarrantyClaim.objects.get(pk=claim_id)
    except WarrantyClaim.DoesNotExist:
        return Response({"error": "Warranty claim not found."}, status=status.HTTP_404_NOT_FOUND)

    rejection_reason = request.data.get("rejection_reason", "")
    claim = reject_warranty_claim(claim, rejection_reason)

    return Response({"status": "rejected", "claim_id": claim.id})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_claim_resolve_view(request, claim_id):
    """Mark warranty claim as resolved"""
    try:
        claim = WarrantyClaim.objects.get(pk=claim_id)
    except WarrantyClaim.DoesNotExist:
        return Response({"error": "Warranty claim not found."}, status=status.HTTP_404_NOT_FOUND)

    claim = resolve_warranty_claim(claim)
    return Response({"status": "resolved", "claim_id": claim.id})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def service_pricing_view(request, product_id):
    """Get service pricing for a product"""
    from subscriptions.models import Product

    try:
        product = Product.objects.get(pk=product_id)
    except Product.DoesNotExist:
        return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    pricing = get_service_pricing(product)
    return Response(pricing)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def extended_warranty_list_view(request):
    """List extended warranty plans (GET) or enroll customer (POST)"""
    if request.method == "GET":
        qs = WarrantyExtendedPlan.objects.select_related("subscription", "product").all()

        subscription_id = request.query_params.get("subscription_id")
        active_only = request.query_params.get("active_only", "").lower() == "true"

        if subscription_id:
            qs = qs.filter(subscription_id=subscription_id)
        if active_only:
            qs = qs.filter(is_active=True)

        rows = [
            {
                "id": p.id,
                "subscription_id": p.subscription_id,
                "product_id": p.product_id,
                "product_name": p.product.name,
                "plan_duration_months": p.plan_duration_months,
                "plan_cost": str(p.plan_cost),
                "coverage_start_date": p.coverage_start_date.isoformat(),
                "coverage_end_date": p.coverage_end_date.isoformat(),
                "payment_status": p.payment_status,
                "is_active": p.is_active,
            }
            for p in qs[:100]
        ]

        return Response({"count": qs.count(), "results": rows})

    # POST - Enroll in extended warranty
    from subscriptions.models import Subscription, Product

    subscription_id = request.data.get("subscription_id")
    product_id = request.data.get("product_id")

    if not subscription_id or not product_id:
        return Response(
            {"error": "subscription_id and product_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        subscription = Subscription.objects.get(pk=subscription_id)
        product = Product.objects.get(pk=product_id)
    except (Subscription.DoesNotExist, Product.DoesNotExist):
        return Response(
            {"error": "Subscription or product not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    from datetime import date
    plan = enroll_extended_warranty(subscription, product, date.today())

    return Response({
        "id": plan.id,
        "plan_cost": str(plan.plan_cost),
        "coverage_start_date": plan.coverage_start_date.isoformat(),
        "coverage_end_date": plan.coverage_end_date.isoformat(),
        "payment_status": plan.payment_status,
    }, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def extended_warranty_mark_paid_view(request, plan_id):
    """Mark extended warranty plan payment as received"""
    try:
        plan = WarrantyExtendedPlan.objects.get(pk=plan_id)
    except WarrantyExtendedPlan.DoesNotExist:
        return Response({"error": "Plan not found."}, status=status.HTTP_404_NOT_FOUND)

    plan = mark_extended_warranty_paid(plan)
    return Response({
        "id": plan.id,
        "payment_status": plan.payment_status,
        "paid_at": plan.paid_at.isoformat() if plan.paid_at else None,
    })
