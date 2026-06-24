"""Admin views for Proof of Delivery (POD) capture and year-end export."""
import json
import csv
import zipfile
from io import StringIO, BytesIO
from datetime import datetime
from decimal import Decimal

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.http import FileResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db.models import Q

from subscriptions.models import Delivery, DeliveryOrderStatus, ProofOfDelivery, PODStatus


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pod_capture_view(request, delivery_id):
    """
    Capture POD (photos + signature) at delivery.

    Request (multipart/form-data):
    {
      "delivery_date": "2026-01-15T14:30:00Z",
      "driver_name": "Amit Singh",
      "driver_phone": "9876543210",
      "customer_signature_name": "John Doe",
      "photo_1": <file>,
      "photo_2": <file (optional)>,
      "signature_image": <file>,
      "gps_latitude": "28.6139" (optional),
      "gps_longitude": "77.2090" (optional),
      "notes": "Delivered successfully"
    }

    Response:
    {
      "success": true,
      "pod_id": 789,
      "delivery_id": 456,
      "delivery_date": "2026-01-15T14:30:00Z",
      "status": "CAPTURED",
      "message": "POD captured successfully."
    }
    """
    delivery = get_object_or_404(Delivery, pk=delivery_id)

    # Extract form data
    delivery_date_str = request.data.get('delivery_date')
    driver_name = request.data.get('driver_name', '').strip()
    driver_phone = request.data.get('driver_phone', '').strip()
    customer_sig_name = request.data.get('customer_signature_name', '').strip()
    gps_lat = request.data.get('gps_latitude')
    gps_lon = request.data.get('gps_longitude')
    notes = request.data.get('notes', '').strip()

    # Validate required fields
    if not all([delivery_date_str, driver_name, customer_sig_name]):
        return Response(
            {"error": "delivery_date, driver_name, and customer_signature_name are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if 'photo_1' not in request.FILES or 'signature_image' not in request.FILES:
        return Response(
            {"error": "photo_1 and signature_image files are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        delivery_date = datetime.fromisoformat(delivery_date_str.replace('Z', '+00:00'))
    except:
        return Response(
            {"error": "Invalid delivery_date format."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Create POD record
    pod = ProofOfDelivery(
        delivery=delivery,
        delivery_date=delivery_date,
        driver_name=driver_name,
        driver_phone=driver_phone,
        customer_signature_name=customer_sig_name,
        photo_1=request.FILES['photo_1'],
        photo_2=request.FILES.get('photo_2'),
        signature_image=request.FILES['signature_image'],
        notes=notes,
        status=PODStatus.CAPTURED,
    )

    if gps_lat and gps_lon:
        try:
            pod.gps_latitude = Decimal(gps_lat)
            pod.gps_longitude = Decimal(gps_lon)
        except:
            pass

    pod.save()

    # Update delivery status
    delivery.status = DeliveryOrderStatus.DELIVERED
    delivery.delivered_date = delivery_date.date()
    delivery.save(update_fields=['status', 'delivered_date'])

    return Response({
        "success": True,
        "pod_id": pod.id,
        "delivery_id": delivery.id,
        "delivery_date": delivery_date.isoformat(),
        "status": PODStatus.CAPTURED,
        "message": "POD captured successfully.",
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pod_list_view(request):
    """List PODs with optional year/month filter."""
    year = request.query_params.get('year')
    month = request.query_params.get('month')

    pods = ProofOfDelivery.objects.select_related('delivery__subscription__customer').order_by('-delivery_date')

    if year:
        try:
            year_int = int(year)
            pods = pods.filter(delivery_date__year=year_int)
        except:
            pass

    if month and year:
        try:
            month_int = int(month)
            year_int = int(year)
            pods = pods.filter(delivery_date__year=year_int, delivery_date__month=month_int)
        except:
            pass

    results = []
    for pod in pods[:500]:  # Limit to 500 for API response
        delivery = pod.delivery
        sub = delivery.subscription
        results.append({
            "pod_id": pod.id,
            "delivery_id": delivery.id,
            "subscription_id": sub.id,
            "contract_ref": sub.contract_reference,
            "customer_name": str(sub.customer),
            "delivery_date": pod.delivery_date.isoformat(),
            "driver_name": pod.driver_name,
            "status": pod.status,
            "photos": 2 if pod.photo_2 else 1,
            "signature": bool(pod.signature_image),
        })

    return Response({
        "count": len(results),
        "results": results,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pod_detail_view(request, pod_id):
    """Get POD detail with photo/signature URLs."""
    pod = get_object_or_404(ProofOfDelivery, pk=pod_id)
    delivery = pod.delivery
    sub = delivery.subscription

    return Response({
        "pod_id": pod.id,
        "delivery_id": delivery.id,
        "subscription_id": sub.id,
        "contract_ref": sub.contract_reference,
        "customer_name": str(sub.customer),
        "delivery_date": pod.delivery_date.isoformat(),
        "driver_name": pod.driver_name,
        "driver_phone": pod.driver_phone,
        "customer_signature_name": pod.customer_signature_name,
        "gps_latitude": str(pod.gps_latitude) if pod.gps_latitude else None,
        "gps_longitude": str(pod.gps_longitude) if pod.gps_longitude else None,
        "notes": pod.notes,
        "photo_1_url": pod.photo_1.url if pod.photo_1 else None,
        "photo_2_url": pod.photo_2.url if pod.photo_2 else None,
        "signature_image_url": pod.signature_image.url if pod.signature_image else None,
        "status": pod.status,
        "created_at": pod.created_at.isoformat(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pod_export_year_view(request):
    """
    Year-end batch export of PODs.

    Request:
    {
      "year": 2026
    }

    Response: ZIP file download
    - pod_index.json (metadata)
    - pod_data.csv (tabular)
    - images/ (all photos + signatures)
    """
    year = request.data.get('year')

    if not year:
        return Response(
            {"error": "year parameter is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        year_int = int(year)
    except:
        return Response(
            {"error": "year must be an integer."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Fetch all PODs for the year
    pods = ProofOfDelivery.objects.filter(
        delivery_date__year=year_int
    ).select_related('delivery__subscription__customer').order_by('delivery_date')

    if not pods.exists():
        return Response(
            {"error": f"No POD records found for year {year_int}."},
            status=status.HTTP_404_NOT_FOUND
        )

    # Create ZIP in memory
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # 1. Create JSON index
        json_data = {
            "export_date": timezone.now().isoformat(),
            "year": year_int,
            "total_records": pods.count(),
            "records": []
        }

        # 2. Create CSV
        csv_buffer = StringIO()
        csv_writer = csv.writer(csv_buffer)
        csv_writer.writerow([
            'pod_id', 'delivery_id', 'subscription_id', 'contract_ref', 'customer_name',
            'delivery_date', 'driver_name', 'driver_phone', 'customer_signature_name',
            'gps_latitude', 'gps_longitude', 'notes', 'photo_1', 'photo_2', 'signature',
            'status', 'created_at'
        ])

        # 3. Process each POD
        image_index = 1
        for pod in pods:
            delivery = pod.delivery
            sub = delivery.subscription

            # JSON entry
            json_data['records'].append({
                "pod_id": pod.id,
                "delivery_id": delivery.id,
                "subscription_id": sub.id,
                "contract_ref": sub.contract_reference,
                "customer_name": str(sub.customer),
                "delivery_date": pod.delivery_date.isoformat(),
                "driver_name": pod.driver_name,
                "status": pod.status,
                "photo_1_file": f"photo_pod_{pod.id}_1.jpg",
                "photo_2_file": f"photo_pod_{pod.id}_2.jpg" if pod.photo_2 else None,
                "signature_file": f"signature_pod_{pod.id}.jpg",
            })

            # CSV row
            csv_writer.writerow([
                pod.id, delivery.id, sub.id, sub.contract_reference, str(sub.customer),
                pod.delivery_date.isoformat(), pod.driver_name, pod.driver_phone,
                pod.customer_signature_name, pod.gps_latitude, pod.gps_longitude,
                pod.notes, f"photo_pod_{pod.id}_1.jpg", f"photo_pod_{pod.id}_2.jpg" if pod.photo_2 else "",
                f"signature_pod_{pod.id}.jpg", pod.status, pod.created_at.isoformat()
            ])

            # Add images to ZIP
            if pod.photo_1:
                try:
                    with pod.photo_1.open('rb') as f:
                        zip_file.writestr(f"images/photo_pod_{pod.id}_1.jpg", f.read())
                except:
                    pass

            if pod.photo_2:
                try:
                    with pod.photo_2.open('rb') as f:
                        zip_file.writestr(f"images/photo_pod_{pod.id}_2.jpg", f.read())
                except:
                    pass

            if pod.signature_image:
                try:
                    with pod.signature_image.open('rb') as f:
                        zip_file.writestr(f"images/signature_pod_{pod.id}.jpg", f.read())
                except:
                    pass

        # Write JSON and CSV to ZIP
        zip_file.writestr('pod_index.json', json.dumps(json_data, indent=2))
        zip_file.writestr('pod_data.csv', csv_buffer.getvalue())

    zip_buffer.seek(0)

    return FileResponse(
        zip_buffer,
        as_attachment=True,
        filename=f"pod_export_{year_int}.zip",
        content_type="application/zip"
    )
