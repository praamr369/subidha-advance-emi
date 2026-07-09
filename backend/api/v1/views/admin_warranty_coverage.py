"""Warranty coverage management - product warranty periods & service records"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from api.v1.permissions import IsAdmin
from subscriptions.models import Product
from service_desk.models import WarrantyServiceRecord, WarrantyServiceCall
from billing.models import BillingInvoice


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def product_warranty_coverage_view(request, product_id):
    """Get or update warranty coverage for a product"""
    try:
        product = Product.objects.get(pk=product_id)
    except Product.DoesNotExist:
        return Response({"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response({
            "product_id": product.id,
            "product_name": product.name,
            "warranty_enabled": product.warranty_enabled,
            "warranty_months_manufacturing": product.warranty_months_manufacturing,
            "warranty_months_structural": product.warranty_months_structural,
            "warranty_months_extended_max": product.warranty_months_extended_max,
            "extended_warranty_cost_percentage": str(product.extended_warranty_cost_percentage),
        })

    # PATCH - Update warranty coverage
    if "warranty_enabled" in request.data:
        product.warranty_enabled = request.data["warranty_enabled"]
    if "warranty_months_manufacturing" in request.data:
        product.warranty_months_manufacturing = request.data["warranty_months_manufacturing"]
    if "warranty_months_structural" in request.data:
        product.warranty_months_structural = request.data["warranty_months_structural"]
    if "extended_warranty_cost_percentage" in request.data:
        product.extended_warranty_cost_percentage = request.data["extended_warranty_cost_percentage"]

    product.save()
    return Response({"status": "updated", "product_id": product.id})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_service_records_view(request):
    """List warranty service records with filters"""
    qs = WarrantyServiceRecord.objects.select_related("product", "invoice", "delivery").all()

    # Filters
    product_id = request.query_params.get("product_id")
    in_manufacturing = request.query_params.get("in_manufacturing")
    in_structural = request.query_params.get("in_structural")

    if product_id:
        qs = qs.filter(product_id=product_id)
    if in_manufacturing is not None:
        qs = qs.filter(is_in_manufacturing_warranty=in_manufacturing.lower() == "true")
    if in_structural is not None:
        qs = qs.filter(is_in_structural_warranty=in_structural.lower() == "true")

    rows = [
        {
            "id": r.id,
            "product_id": r.product_id,
            "product_name": r.product.name,
            "delivery_date": r.delivery_date.isoformat(),
            "warranty_manufacturing_end": r.warranty_manufacturing_end.isoformat(),
            "warranty_structural_end": r.warranty_structural_end.isoformat() if r.warranty_structural_end else None,
            "is_in_manufacturing_warranty": r.is_in_manufacturing_warranty,
            "is_in_structural_warranty": r.is_in_structural_warranty,
            "has_extended_warranty": r.has_extended_warranty,
            "days_until_manufacturing_expires": r.days_until_manufacturing_warranty_expires,
            "days_until_structural_expires": r.days_until_structural_warranty_expires,
            "warranty_status": r.warranty_status_display,
            "total_service_calls": r.total_service_calls,
            "total_warranty_claims": r.total_warranty_claims,
            "last_service_date": r.last_service_date.isoformat() if r.last_service_date else None,
        }
        for r in qs[:200]
    ]

    return Response({"count": qs.count(), "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_service_record_detail_view(request, record_id):
    """Get warranty service record with service history"""
    try:
        record = WarrantyServiceRecord.objects.select_related(
            "product", "invoice", "delivery"
        ).get(pk=record_id)
    except WarrantyServiceRecord.DoesNotExist:
        return Response({"error": "Record not found"}, status=status.HTTP_404_NOT_FOUND)

    # Get service calls
    service_calls = WarrantyServiceCall.objects.filter(
        warranty_record=record
    ).order_by("-service_call_date")

    calls_data = [
        {
            "id": call.id,
            "service_call_date": call.service_call_date.isoformat(),
            "service_type": call.service_type,
            "is_warranty_covered": call.is_warranty_covered,
            "coverage_type": call.coverage_type,
            "service_cost": str(call.service_cost),
            "technician_notes": call.technician_notes,
        }
        for call in service_calls
    ]

    return Response({
        "id": record.id,
        "product_id": record.product_id,
        "product_name": record.product.name,
        "delivery_date": record.delivery_date.isoformat(),
        "warranty_manufacturing_end": record.warranty_manufacturing_end.isoformat(),
        "warranty_structural_end": record.warranty_structural_end.isoformat() if record.warranty_structural_end else None,
        "is_in_manufacturing_warranty": record.is_in_manufacturing_warranty,
        "is_in_structural_warranty": record.is_in_structural_warranty,
        "has_extended_warranty": record.has_extended_warranty,
        "warranty_status": record.warranty_status_display,
        "total_service_calls": record.total_service_calls,
        "total_warranty_claims": record.total_warranty_claims,
        "service_calls": calls_data,
        "notes": record.notes,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_invoice_check_view(request, invoice_id):
    """Check warranty status for an invoice/delivery"""
    try:
        invoice = BillingInvoice.objects.get(pk=invoice_id)
    except BillingInvoice.DoesNotExist:
        return Response({"error": "Invoice not found"}, status=status.HTTP_404_NOT_FOUND)

    # Check if warranty record exists
    try:
        warranty_record = invoice.warranty_record
        warranty_record.update_warranty_status()
        return Response({
            "invoice_id": invoice.id,
            "has_warranty": True,
            "product_name": warranty_record.product.name,
            "warranty_status": warranty_record.warranty_status_display,
            "is_in_manufacturing": warranty_record.is_in_manufacturing_warranty,
            "is_in_structural": warranty_record.is_in_structural_warranty,
            "has_extended": warranty_record.has_extended_warranty,
            "days_until_manufacturing_expires": warranty_record.days_until_manufacturing_warranty_expires,
        })
    except WarrantyServiceRecord.DoesNotExist:
        return Response({
            "invoice_id": invoice.id,
            "has_warranty": False,
            "message": "No warranty record found for this invoice",
        })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def warranty_dashboard_summary_view(request):
    """Dashboard summary: products with active warranties, expiring soon, out of warranty"""
    active_count = WarrantyServiceRecord.objects.filter(
        is_in_manufacturing_warranty=True
    ).count()

    expiring_soon = WarrantyServiceRecord.objects.filter(
        is_in_manufacturing_warranty=True,
        warranty_manufacturing_end__lte=timezone.localdate() + timezone.timedelta(days=30)
    ).count()

    out_of_warranty = WarrantyServiceRecord.objects.filter(
        is_in_manufacturing_warranty=False,
        is_in_structural_warranty=False,
        has_extended_warranty=False
    ).count()

    # Top products with most service calls
    from django.db.models import F
    top_products = WarrantyServiceRecord.objects.values('product__name').annotate(
        service_calls=F('total_service_calls')
    ).order_by('-service_calls')[:5]

    return Response({
        "active_warranties": active_count,
        "expiring_soon": expiring_soon,
        "out_of_warranty": out_of_warranty,
        "top_service_products": list(top_products),
    })
