"""Customer-facing warranty endpoints.

The customer warranty pages have called /api/v1/warranty/* since July 2026 and
every request 404'd: the routes were never written. The admin side exists
(/api/v1/admin/warranty-claims/ and friends); only the customer half was
missing.

Everything here is scoped to the requesting customer's own subscriptions. A
warranty endpoint that answered for someone else's purchase would leak what
they bought and when.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from contracts.models import Subscription
from service_desk.models import (
    ServiceDeskCase,
    WarrantyClaim,
    WarrantyExtendedPlan,
    WarrantyType,
)
from service_desk.services.warranty_coverage_service import (
    _add_months,
    build_coverage,
    coverage_start_for_subscription,
)
from subscriptions.models import Product


def _customer_or_404(request):
    customer = getattr(request.user, "customer_profile", None)
    if customer is None:
        raise NotFound("No customer profile is associated with this account.")
    return customer


def _subscription_for_product(customer, product_id):
    """The customer's most recent subscription for this product, if any."""
    return (
        Subscription.objects.filter(customer=customer, product_id=product_id)
        .select_related("product", "delivery")
        .order_by("-start_date", "-id")
        .first()
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def warranty_check_view(request, product_id: int):
    """Warranty coverage for one of the customer's own products."""
    customer = _customer_or_404(request)
    subscription = _subscription_for_product(customer, product_id)

    if subscription is None:
        # 404 rather than an empty coverage object: the customer has no
        # relationship with this product, and saying "not covered" would imply
        # they own it and the warranty lapsed.
        raise NotFound("No subscription found for this product.")

    coverage = build_coverage(product=subscription.product, subscription=subscription)
    return Response(coverage.as_dict())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def warranty_service_history_view(request):
    """Warranty claims this customer has filed."""
    customer = _customer_or_404(request)

    try:
        limit = min(int(request.query_params.get("limit", 20)), 100)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (TypeError, ValueError):
        limit, offset = 20, 0

    queryset = (
        WarrantyClaim.objects.filter(subscription__customer=customer)
        .select_related("product", "subscription")
        .order_by("-claim_submitted_at", "-id")
    )
    total = queryset.count()

    rows = [
        {
            "id": claim.id,
            "product_id": claim.product_id,
            "product_name": claim.product.name if claim.product else None,
            "warranty_type": claim.warranty_type,
            "claim_status": claim.claim_status,
            "defect_description": claim.defect_description,
            "defect_date_discovered": claim.defect_date_discovered.isoformat()
            if claim.defect_date_discovered
            else None,
            "claim_submitted_at": claim.claim_submitted_at.isoformat()
            if claim.claim_submitted_at
            else None,
            "is_in_warranty": claim.is_in_warranty,
            "resolved_at": claim.resolved_at.isoformat() if claim.resolved_at else None,
        }
        for claim in queryset[offset : offset + limit]
    ]
    return Response({"count": total, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def warranty_claim_status_view(request, claim_id: int):
    """Status of one of the customer's own claims.

    Assessment notes and cost breakdowns are deliberately omitted: they are
    internal assessment working, and the admin surface already exposes them to
    staff.
    """
    customer = _customer_or_404(request)
    claim = get_object_or_404(
        WarrantyClaim.objects.select_related("product"),
        pk=claim_id,
        subscription__customer=customer,
    )

    return Response(
        {
            "id": claim.id,
            "product_id": claim.product_id,
            "product_name": claim.product.name if claim.product else None,
            "warranty_type": claim.warranty_type,
            "claim_status": claim.claim_status,
            "defect_description": claim.defect_description,
            "is_in_warranty": claim.is_in_warranty,
            "recommended_remedy": claim.recommended_remedy,
            "claim_submitted_at": claim.claim_submitted_at.isoformat()
            if claim.claim_submitted_at
            else None,
            "approved_at": claim.approved_at.isoformat() if claim.approved_at else None,
            "resolved_at": claim.resolved_at.isoformat() if claim.resolved_at else None,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def warranty_claim_create_view(request):
    """File a warranty claim against one of the customer's subscriptions."""
    customer = _customer_or_404(request)

    subscription_id = request.data.get("subscription_id")
    defect_description = str(request.data.get("defect_description") or "").strip()
    discovered_raw = request.data.get("defect_date_discovered")

    if not subscription_id:
        return Response(
            {"detail": "subscription_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not defect_description:
        return Response(
            {"detail": "defect_description is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    subscription = get_object_or_404(
        Subscription.objects.select_related("product", "delivery"),
        pk=subscription_id,
        customer=customer,
    )

    discovered = timezone.localdate()
    if discovered_raw:
        from datetime import date as _date

        try:
            discovered = _date.fromisoformat(str(discovered_raw))
        except ValueError:
            return Response(
                {"detail": "defect_date_discovered must be YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    coverage = build_coverage(product=subscription.product, subscription=subscription)
    if coverage.purchase_date is None:
        return Response(
            {
                "detail": "Warranty has not started: this product has not been delivered yet.",
                "coverage_basis": coverage.coverage_basis,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Which cover applies is decided here, from the dates — not taken from the
    # request. A claim is recorded even when cover has lapsed: the customer is
    # entitled to a decision and a record, and staff assess it. is_in_warranty
    # carries the honest answer rather than the claim being refused outright.
    if coverage.is_manufacturing_active:
        warranty_type = WarrantyType.MANUFACTURING
        warranty_end = coverage.manufacturing_expiry
    elif coverage.is_structural_active:
        warranty_type = WarrantyType.STRUCTURAL
        warranty_end = coverage.structural_expiry
    else:
        warranty_type = WarrantyType.MANUFACTURING
        warranty_end = coverage.manufacturing_expiry or coverage.purchase_date

    in_warranty = coverage.is_manufacturing_active or coverage.is_structural_active

    with transaction.atomic():
        # WarrantyClaim.service_case is a non-null OneToOne, so a claim cannot
        # exist without a case. Creating one here keeps the customer's claim in
        # the same queue staff already work from.
        case = ServiceDeskCase.objects.create(
            subscription=subscription,
            product=subscription.product,
            issue_summary=f"Warranty claim: {defect_description[:180]}",
        )
        claim = WarrantyClaim.objects.create(
            service_case=case,
            product=subscription.product,
            subscription=subscription,
            warranty_type=warranty_type,
            warranty_start_date=coverage.purchase_date,
            warranty_end_date=warranty_end,
            is_in_warranty=in_warranty,
            defect_description=defect_description,
            defect_date_discovered=discovered,
            defect_classification="UNVERIFIED",
            claim_submitted_at=timezone.now(),
            claim_status="SUBMITTED",
        )

    return Response(
        {
            "id": claim.id,
            "service_case_id": case.id,
            "claim_status": claim.claim_status,
            "warranty_type": claim.warranty_type,
            "is_in_warranty": claim.is_in_warranty,
            "warranty_end_date": claim.warranty_end_date.isoformat(),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def warranty_extended_plans_view(request, product_id: int):
    """Extended-warranty options available for one of the customer's products."""
    customer = _customer_or_404(request)
    subscription = _subscription_for_product(customer, product_id)
    if subscription is None:
        raise NotFound("No subscription found for this product.")

    product = subscription.product
    max_months = int(product.warranty_months_extended_max or 0)
    if not product.warranty_enabled or max_months <= 0:
        return Response({"available": False, "plans": []})

    existing = WarrantyExtendedPlan.objects.filter(
        subscription=subscription, is_active=True
    ).first()

    base_price = Decimal(str(product.base_price or 0))
    pct = Decimal(str(getattr(product, "extended_warranty_cost_percentage", 0) or 0))

    # Offer whole-year options up to the configured maximum, priced pro rata
    # against the configured percentage of the product price.
    plans = []
    for months in (12, 24, 36):
        if months > max_months:
            continue
        cost = (base_price * pct / Decimal("100") * Decimal(months) / Decimal("12")).quantize(
            Decimal("0.01")
        )
        plans.append(
            {
                "plan_duration_months": months,
                "plan_cost": str(cost),
                "plan_cost_percentage": str(pct),
            }
        )

    return Response(
        {
            "available": bool(plans) and existing is None,
            "already_enrolled": existing is not None,
            "max_months": max_months,
            "plans": plans,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def warranty_enroll_extended_view(request):
    """Enrol one of the customer's subscriptions in an extended-warranty plan."""
    customer = _customer_or_404(request)
    subscription_id = request.data.get("subscription_id")
    months_raw = request.data.get("plan_duration_months")

    if not subscription_id or not months_raw:
        return Response(
            {"detail": "subscription_id and plan_duration_months are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        months = int(months_raw)
    except (TypeError, ValueError):
        return Response(
            {"detail": "plan_duration_months must be a whole number of months."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    subscription = get_object_or_404(
        Subscription.objects.select_related("product", "delivery"),
        pk=subscription_id,
        customer=customer,
    )
    product = subscription.product
    max_months = int(product.warranty_months_extended_max or 0)

    if not product.warranty_enabled or max_months <= 0:
        return Response(
            {"detail": "Extended warranty is not offered for this product."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if months <= 0 or months > max_months:
        return Response(
            {"detail": f"Plan duration must be between 1 and {max_months} months."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if WarrantyExtendedPlan.objects.filter(
        subscription=subscription, is_active=True
    ).exists():
        return Response(
            {"detail": "This subscription already has an active extended warranty."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    start, basis = coverage_start_for_subscription(subscription)
    if start is None:
        return Response(
            {
                "detail": "Cannot enrol before delivery: extended cover starts when the base warranty ends.",
                "coverage_basis": basis,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Extended cover begins when the manufacturing warranty ends, so the
    # customer is not paying for months they already have.
    base_end = _add_months(start, int(product.warranty_months_manufacturing or 0))
    base_price = Decimal(str(product.base_price or 0))
    pct = Decimal(str(getattr(product, "extended_warranty_cost_percentage", 0) or 0))
    cost = (base_price * pct / Decimal("100") * Decimal(months) / Decimal("12")).quantize(
        Decimal("0.01")
    )

    plan = WarrantyExtendedPlan.objects.create(
        subscription=subscription,
        product=product,
        plan_duration_months=months,
        plan_cost=cost,
        plan_cost_percentage=pct,
        enrollment_date=timezone.localdate(),
        coverage_start_date=base_end,
        coverage_end_date=_add_months(base_end, months),
        # Enrolment records the intent; payment is confirmed by staff through
        # the existing admin mark-paid endpoint. Treating it as paid here would
        # promise cover that has not been bought.
        payment_status="PENDING",
        is_active=True,
    )

    return Response(
        {
            "id": plan.id,
            "plan_duration_months": plan.plan_duration_months,
            "plan_cost": str(plan.plan_cost),
            "coverage_start_date": plan.coverage_start_date.isoformat(),
            "coverage_end_date": plan.coverage_end_date.isoformat(),
            "payment_status": plan.payment_status,
        },
        status=status.HTTP_201_CREATED,
    )
