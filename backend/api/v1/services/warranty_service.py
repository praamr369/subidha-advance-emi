"""Warranty & Service management services"""
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth.models import User

from subscriptions.models import Product, Subscription
from service_desk.models import (
    WarrantyClaim,
    ServicePricing,
    WarrantyExtendedPlan,
    ServiceDeskCase,
    DefectClassification,
)


def calculate_warranty_end_date(product: Product, delivery_date: datetime) -> datetime:
    """Calculate warranty end date based on product type (12-24 months)"""
    # Default 12 months, can be extended to 24 for some products
    warranty_months = getattr(product, 'warranty_months', 12)
    return delivery_date + timedelta(days=warranty_months * 30)


def create_warranty_claim(
    service_case: ServiceDeskCase,
    product: Product,
    subscription: Subscription,
    warranty_type: str,
    warranty_start_date: datetime.date,
    warranty_end_date: datetime.date,
    defect_description: str,
    defect_date_discovered: datetime.date,
) -> WarrantyClaim:
    """Create a new warranty claim"""
    is_in_warranty = timezone.localdate() <= warranty_end_date

    claim = WarrantyClaim.objects.create(
        service_case=service_case,
        product=product,
        subscription=subscription,
        warranty_type=warranty_type,
        warranty_start_date=warranty_start_date,
        warranty_end_date=warranty_end_date,
        is_in_warranty=is_in_warranty,
        defect_description=defect_description,
        defect_date_discovered=defect_date_discovered,
    )
    return claim


def assess_defect_classification(
    claim: WarrantyClaim,
    classification: str,
    assessment_notes: str,
    verified_by: User,
) -> WarrantyClaim:
    """Assess and classify the defect"""
    claim.defect_classification = classification
    claim.assessment_notes = assessment_notes
    claim.verified_by = verified_by
    claim.verified_at = timezone.now()
    claim.claim_status = 'UNDER_ASSESSMENT'
    claim.save()
    return claim


def approve_warranty_claim(
    claim: WarrantyClaim,
    approved_by: User,
    remedy: str,
    cost_labor: Decimal = Decimal('0'),
    cost_parts: Decimal = Decimal('0'),
    cost_travel: Decimal = Decimal('0'),
) -> WarrantyClaim:
    """Approve warranty claim with remedy & costs"""
    claim.approve_claim(approved_by, remedy, cost_labor, cost_parts, cost_travel)
    claim.claim_status = 'APPROVED'
    claim.save()
    return claim


def reject_warranty_claim(
    claim: WarrantyClaim,
    rejection_reason: str,
) -> WarrantyClaim:
    """Reject warranty claim"""
    claim.claim_status = 'REJECTED'
    claim.assessment_notes = rejection_reason
    claim.save()
    return claim


def resolve_warranty_claim(claim: WarrantyClaim) -> WarrantyClaim:
    """Mark warranty claim as resolved"""
    claim.claim_status = 'RESOLVED'
    claim.resolved_at = timezone.now()
    claim.save()
    return claim


def enroll_extended_warranty(
    subscription: Subscription,
    product: Product,
    enrollment_date: datetime.date,
    plan_duration_months: int = 12,
) -> WarrantyExtendedPlan:
    """Enroll customer in extended warranty plan"""
    # Calculate plan cost: 5-10% of product price (default 7.5%)
    product_price = Decimal(str(product.price or 0))
    cost_percentage = Decimal('7.5')  # Default 7.5%
    plan_cost = (product_price * cost_percentage) / Decimal('100')

    coverage_start = enrollment_date
    coverage_end = enrollment_date + timedelta(days=plan_duration_months * 30)

    plan = WarrantyExtendedPlan.objects.create(
        subscription=subscription,
        product=product,
        plan_duration_months=plan_duration_months,
        plan_cost=plan_cost,
        plan_cost_percentage=cost_percentage,
        enrollment_date=enrollment_date,
        coverage_start_date=coverage_start,
        coverage_end_date=coverage_end,
    )
    return plan


def mark_extended_warranty_paid(plan: WarrantyExtendedPlan) -> WarrantyExtendedPlan:
    """Mark extended warranty payment as received"""
    plan.payment_status = 'PAID'
    plan.paid_at = timezone.now()
    plan.save()
    return plan


def check_warranty_eligibility(warranty_claim: WarrantyClaim) -> dict:
    """Check warranty claim eligibility"""
    is_in_warranty = warranty_claim.is_in_warranty
    days_to_deadline = warranty_claim.days_to_report_deadline
    is_eligible = warranty_claim.is_claim_eligible

    return {
        'is_in_warranty': is_in_warranty,
        'warranty_end_date': warranty_claim.warranty_end_date.isoformat() if warranty_claim.warranty_end_date else None,
        'days_to_deadline': days_to_deadline,
        'is_claim_eligible': is_eligible,
        'status': 'ELIGIBLE' if is_eligible else ('OUT_OF_WARRANTY' if not is_in_warranty else 'PAST_REPORTING_WINDOW'),
    }


def get_service_pricing(product: Product) -> dict:
    """Get service pricing for a product"""
    try:
        pricing = ServicePricing.objects.get(product=product)
    except ServicePricing.DoesNotExist:
        # Default pricing if not configured
        pricing = ServicePricing(product=product)
        pricing.save()

    return {
        'product_id': product.id,
        'product_name': product.name,
        'warranty_labor_cost': float(pricing.warranty_labor_cost),
        'out_of_warranty_labor_cost': float(pricing.out_of_warranty_labor_cost),
        'home_service_charge': float(pricing.home_service_charge),
        'travel_charge_beyond_5km': float(pricing.travel_charge_beyond_5km),
        'home_visit_days': pricing.home_visit_days,
        'service_completion_days': pricing.service_completion_days,
    }
