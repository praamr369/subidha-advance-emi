"""Admin views for Proof of Delivery (POD) capture and year-end export."""
import json
import csv
import zipfile
from io import StringIO, BytesIO
from datetime import datetime
from decimal import Decimal

from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from api.v1.permissions import IsAdmin
from rest_framework.response import Response
from rest_framework import status
from django.http import FileResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db.models import Q

from subscriptions.models import (
    Delivery,
    DeliveryOrderStatus,
    ProofOfDelivery,
    PODStatus,
    SubscriptionDelivery,
    DeliveryStatus,
    ProductPossession,
    PossessionStatus,
    RentalAsset,
    RentalAssetStatus,
    AuditLog,
)
from subscriptions.services.audit_service import log_audit

HANDOVER_SIGNER_SALT = "subidha.delivery.handover.v1"
HANDOVER_TOKEN_MAX_AGE = 86400 * 7  # 7 days


def generate_handover_token(delivery_id: int) -> str:
    """Generate a tamper-proof timestamped token for customer/driver handover."""
    signer = TimestampSigner(salt=HANDOVER_SIGNER_SALT)
    return signer.sign(str(delivery_id))


def verify_handover_token(token: str) -> int:
    """Verifies handover token and returns delivery_id. Raises BadSignature or SignatureExpired."""
    signer = TimestampSigner(salt=HANDOVER_SIGNER_SALT)
    delivery_id_str = signer.unsign(token, max_age=HANDOVER_TOKEN_MAX_AGE)
    return int(delivery_id_str)


def resolve_delivery_order(delivery_id: int) -> Delivery | None:
    """
    Finds or provisions the Delivery record.
    Supports either Delivery.pk or SubscriptionDelivery.pk from the admin workbench.
    """
    delivery = Delivery.objects.select_related("subscription", "subscription__customer", "subscription__product").filter(pk=delivery_id).first()
    if delivery:
        return delivery

    sub_del = SubscriptionDelivery.objects.select_related("subscription", "subscription__customer", "subscription__product").filter(pk=delivery_id).first()
    if sub_del and sub_del.subscription:
        delivery, _ = Delivery.objects.get_or_create(
            subscription=sub_del.subscription,
            defaults={
                "status": DeliveryOrderStatus.PENDING,
                "driver_name": sub_del.receiver_name or "",
                "driver_phone": sub_del.receiver_phone or "",
                "delivery_address": sub_del.delivery_address_snapshot or "",
                "scheduled_date": sub_del.scheduled_date,
            },
        )
        return delivery
    return None


def save_additional_furniture_photos(*, subscription, files, delivery_date):
    """
    Saves additional furniture photos (e.g. multi-item rent/lease orders)
    as auditable SubscriptionDocument records under DELIVERY_HANDOVER_NOTE.
    """
    from contracts.models import SubscriptionDocument
    from subscriptions.enums import SubscriptionDocumentType, DocumentVerificationStatus

    date_str = str(delivery_date.date() if hasattr(delivery_date, "date") else delivery_date)
    saved_docs = []
    for idx, f in enumerate(files, start=1):
        doc = SubscriptionDocument.objects.create(
            subscription=subscription,
            document_type=SubscriptionDocumentType.DELIVERY_HANDOVER_NOTE,
            file=f,
            notes=f"Doorstep POD furniture quality photo for item #{idx} captured on {date_str}",
            verification_status=DocumentVerificationStatus.VERIFIED,
        )
        saved_docs.append(doc)
    return saved_docs


def sync_delivery_success_state(*, delivery: Delivery, delivery_date, customer_sig_name: str, driver_phone: str = "", notes: str = "", performed_by=None):
    """
    Synchronizes delivery success across Delivery, SubscriptionDelivery,
    ProductPossession, and RentalAsset models.
    """
    from deliveries.services.delivery_service import mark_subscription_delivery_delivered

    # 1. Update primary Delivery order
    delivery.status = DeliveryOrderStatus.DELIVERED
    delivery.delivered_date = delivery_date.date() if hasattr(delivery_date, "date") else delivery_date
    delivery.save(update_fields=["status", "delivered_date"])

    # 2. Sync any active SubscriptionDelivery for this subscription
    sub_deliveries = SubscriptionDelivery.objects.filter(
        subscription=delivery.subscription,
        status__in=SubscriptionDelivery.ACTIVE_STATUSES,
    )
    for sub_del in sub_deliveries:
        try:
            mark_subscription_delivery_delivered(
                delivery=sub_del,
                performed_by=performed_by,
                receiver_name=customer_sig_name,
                receiver_phone=driver_phone,
                notes=notes,
            )
        except Exception:
            sub_del.status = DeliveryStatus.DELIVERED
            sub_del.delivered_at = delivery_date
            sub_del.receiver_name = customer_sig_name
            sub_del.receiver_phone = driver_phone
            if notes:
                sub_del.notes = notes
            sub_del.save(update_fields=["status", "delivered_at", "receiver_name", "receiver_phone", "notes"])

    # 3. Handover ProductPossession custody
    possession = ProductPossession.objects.filter(subscription=delivery.subscription).first()
    if possession:
        possession.status = PossessionStatus.HANDED_OVER
        possession.handover_date = delivery_date.date() if hasattr(delivery_date, "date") else delivery_date
        if notes:
            possession.handover_condition_notes = notes
        possession.save(update_fields=["status", "handover_date", "handover_condition_notes"])

    # 4. Handover reserved RentalAsset
    asset = RentalAsset.objects.filter(current_subscription=delivery.subscription, status=RentalAssetStatus.RESERVED).first()
    if asset:
        asset.status = RentalAssetStatus.HANDED_OVER
        asset.save(update_fields=["status"])

    # 5. Log audit trail
    log_audit(
        action_type=AuditLog.ActionType.DELIVERY_COMPLETED if hasattr(AuditLog.ActionType, "DELIVERY_COMPLETED") else "DELIVERY_COMPLETED",
        instance=delivery,
        performed_by=performed_by,
        metadata={
            "customer_signature_name": customer_sig_name,
            "driver_phone": driver_phone,
            "delivery_date": delivery_date.isoformat() if hasattr(delivery_date, "isoformat") else str(delivery_date),
            "subscription_id": delivery.subscription_id,
        },
    )

    # 6. Notify customer and admin of confirmed POD handover
    try:
        from subscriptions.services.operational_notification_service import (
            schedule_pod_completed_notification,
        )
        sub = delivery.subscription
        cust = getattr(sub, "customer", None)
        prod = getattr(sub, "product", None)
        del_date_str = (
            delivery_date.strftime("%d %b %Y, %I:%M %p")
            if hasattr(delivery_date, "strftime")
            else str(delivery_date)
        )
        schedule_pod_completed_notification(
            delivery_id=delivery.id,
            customer_user_id=getattr(cust, "user_id", None),
            product_name=getattr(prod, "name", "Furniture") or "Furniture",
            delivery_ref=f"DLV-{delivery.id}",
            delivery_date_str=del_date_str,
        )
    except Exception:
        pass



@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdmin])
def pod_capture_view(request, delivery_id):
    """
    Capture POD (photos + signature) at delivery.
    Accepts either Delivery.pk or SubscriptionDelivery.pk.
    """
    delivery = resolve_delivery_order(delivery_id)
    if not delivery:
        return Response({"error": "Delivery record not found."}, status=status.HTTP_404_NOT_FOUND)

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
    except Exception:
        delivery_date = timezone.now()

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
            pod.gps_latitude = Decimal(str(gps_lat))
            pod.gps_longitude = Decimal(str(gps_lon))
        except Exception:
            pass

    pod.save()

    # Save any additional furniture photos for multi-item orders
    extra_files = request.FILES.getlist("furniture_photos") or request.FILES.getlist("additional_photos")
    if extra_files and delivery.subscription:
        save_additional_furniture_photos(
            subscription=delivery.subscription,
            files=extra_files,
            delivery_date=delivery_date,
        )

    # Synchronize all delivery models & asset handover
    sync_delivery_success_state(
        delivery=delivery,
        delivery_date=delivery_date,
        customer_sig_name=customer_sig_name,
        driver_phone=driver_phone,
        notes=notes,
        performed_by=request.user,
    )

    return Response({
        "success": True,
        "pod_id": pod.id,
        "delivery_id": delivery.id,
        "delivery_date": delivery_date.isoformat(),
        "status": PODStatus.CAPTURED,
        "message": "POD captured successfully.",
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdmin])
def pod_handover_link_view(request, delivery_id):
    """
    Generate or retrieve a secure public handover link for the delivery driver or customer.
    The link allows photo and touchscreen signature capture on mobile without admin credentials.
    """
    delivery = resolve_delivery_order(delivery_id)
    if not delivery:
        return Response({"error": "Delivery record not found."}, status=status.HTTP_404_NOT_FOUND)

    token = generate_handover_token(delivery.id)
    sub = delivery.subscription
    customer = getattr(sub, "customer", None)
    product = getattr(sub, "product", None)

    if delivery.status != DeliveryOrderStatus.DELIVERED:
        try:
            from subscriptions.services.operational_notification_service import (
                schedule_pod_handover_ready_notification,
            )
            schedule_pod_handover_ready_notification(
                delivery_id=delivery.id,
                customer_user_id=getattr(customer, "user_id", None),
                product_name=getattr(product, "name", "Furniture") or "Furniture",
                delivery_ref=f"DLV-{delivery.id}",
                handover_url=f"/delivery-handover/{token}",
            )
        except Exception:
            pass

    return Response({
        "success": True,
        "delivery_id": delivery.id,
        "handover_token": token,
        "handover_url": f"/delivery-handover/{token}",
        "customer_name": getattr(customer, "name", str(customer)),
        "customer_phone": getattr(customer, "phone", ""),
        "product_name": getattr(product, "name", ""),
        "plan_type": getattr(sub, "plan_type", ""),
        "status": delivery.status,
        "is_delivered": delivery.status == DeliveryOrderStatus.DELIVERED,
        "expires_in_days": 7,
    })


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def public_pod_handover_view(request, token):
    """
    Public mobile endpoint for delivery drivers and customers to complete POD at handover.
    GET:  Returns order summary (customer name, address, furniture name, status).
    POST: Accepts photos (photo_1, photo_2), touchscreen signature, and GPS coordinates.
    """
    try:
        delivery_id = verify_handover_token(token)
    except SignatureExpired:
        return Response(
            {"error": "This delivery handover link has expired. Please ask the store admin for a new link."},
            status=status.HTTP_410_GONE,
        )
    except (BadSignature, Exception):
        return Response(
            {"error": "Invalid or tampered delivery handover link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    delivery = resolve_delivery_order(delivery_id)
    if not delivery:
        return Response({"error": "Delivery record not found."}, status=status.HTTP_404_NOT_FOUND)

    sub = delivery.subscription
    customer = getattr(sub, "customer", None)
    product = getattr(sub, "product", None)

    sub_del = SubscriptionDelivery.objects.filter(subscription=sub).order_by("-id").first()
    delivery_ref = getattr(sub_del, "delivery_reference", f"DLV-{delivery.id}")
    delivery_address = delivery.delivery_address or getattr(sub_del, "delivery_address_snapshot", "")

    if request.method == "GET":
        is_completed = (
            delivery.status == DeliveryOrderStatus.DELIVERED
            or (sub_del and sub_del.status == DeliveryStatus.DELIVERED)
        )
        return Response({
            "delivery_id": delivery.id,
            "delivery_reference": delivery_ref,
            "contract_reference": getattr(sub, "contract_reference", f"SUB-{sub.id}"),
            "customer_name": getattr(customer, "name", str(customer)),
            "customer_phone": getattr(customer, "phone", ""),
            "delivery_address": delivery_address,
            "product_name": getattr(product, "name", ""),
            "plan_type": getattr(sub, "plan_type", ""),
            "driver_name": delivery.driver_name,
            "driver_phone": delivery.driver_phone,
            "status": delivery.status,
            "is_completed": is_completed,
            "delivered_date": delivery.delivered_date.isoformat() if delivery.delivered_date else None,
        })

    # POST: Complete handover & capture POD
    if delivery.status == DeliveryOrderStatus.DELIVERED:
        return Response(
            {"error": "This delivery has already been completed and verified."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    driver_name = request.data.get("driver_name", "").strip() or delivery.driver_name or "Delivery Agent"
    driver_phone = request.data.get("driver_phone", "").strip() or delivery.driver_phone
    customer_sig_name = request.data.get("customer_signature_name", "").strip()
    gps_lat = request.data.get("gps_latitude")
    gps_lon = request.data.get("gps_longitude")
    notes = request.data.get("notes", "").strip()

    if not customer_sig_name:
        return Response(
            {"error": "Customer name or signature recipient name is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if "photo_1" not in request.FILES:
        return Response(
            {"error": "Product condition photo (Photo 1) is mandatory to verify product quality."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if "signature_image" not in request.FILES:
        return Response(
            {"error": "Customer touchscreen signature is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    delivery_date = timezone.now()
    delivery_date_str = request.data.get("delivery_date")
    if delivery_date_str:
        try:
            delivery_date = datetime.fromisoformat(delivery_date_str.replace("Z", "+00:00"))
        except Exception:
            pass

    # Save ProofOfDelivery
    pod = ProofOfDelivery(
        delivery=delivery,
        delivery_date=delivery_date,
        driver_name=driver_name,
        driver_phone=driver_phone,
        customer_signature_name=customer_sig_name,
        photo_1=request.FILES["photo_1"],
        photo_2=request.FILES.get("photo_2"),
        signature_image=request.FILES["signature_image"],
        notes=notes,
        status=PODStatus.CAPTURED,
    )

    if gps_lat and gps_lon:
        try:
            pod.gps_latitude = Decimal(str(gps_lat))
            pod.gps_longitude = Decimal(str(gps_lon))
        except Exception:
            pass

    pod.save()

    # Save any additional furniture photos for multi-item orders
    extra_files = request.FILES.getlist("furniture_photos") or request.FILES.getlist("additional_photos")
    if extra_files and delivery.subscription:
        save_additional_furniture_photos(
            subscription=delivery.subscription,
            files=extra_files,
            delivery_date=delivery_date,
        )

    # Synchronize all delivery models & asset handover
    sync_delivery_success_state(
        delivery=delivery,
        delivery_date=delivery_date,
        customer_sig_name=customer_sig_name,
        driver_phone=driver_phone,
        notes=notes,
        performed_by=None,
    )

    return Response({
        "success": True,
        "pod_id": pod.id,
        "delivery_id": delivery.id,
        "delivery_date": delivery_date.isoformat(),
        "status": PODStatus.CAPTURED,
        "message": "Delivery and product quality proof successfully recorded! Furniture is officially handed over.",
    }, status=status.HTTP_201_CREATED)



@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdmin])
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
@permission_classes([IsAuthenticated, IsAdmin])
def pod_detail_view(request, pod_id):
    """Get POD detail with photo/signature URLs."""
    pod = get_object_or_404(ProofOfDelivery, pk=pod_id)
    delivery = pod.delivery
    sub = delivery.subscription

    from contracts.models import SubscriptionDocument
    from subscriptions.enums import SubscriptionDocumentType

    extra_docs = SubscriptionDocument.objects.filter(
        subscription=sub,
        document_type=SubscriptionDocumentType.DELIVERY_HANDOVER_NOTE,
    ).order_by("id")
    extra_photo_urls = [doc.file.url for doc in extra_docs if doc.file]

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
        "additional_furniture_photos": extra_photo_urls,
        "total_furniture_photos": (1 if pod.photo_1 else 0) + (1 if pod.photo_2 else 0) + len(extra_photo_urls),
        "signature_image_url": pod.signature_image.url if pod.signature_image else None,
        "status": pod.status,
        "created_at": pod.created_at.isoformat(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdmin])
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
            'status', 'created_at', 'additional_furniture_photos'
        ])

        # 3. Process each POD
        from contracts.models import SubscriptionDocument
        from subscriptions.enums import SubscriptionDocumentType

        for pod in pods:
            delivery = pod.delivery
            sub = delivery.subscription

            extra_docs = SubscriptionDocument.objects.filter(
                subscription=sub,
                document_type=SubscriptionDocumentType.DELIVERY_HANDOVER_NOTE,
            ).order_by("id")
            extra_photo_files = []
            for idx, doc in enumerate(extra_docs, start=3):
                if doc.file:
                    extra_filename = f"photo_pod_{pod.id}_{idx}.jpg"
                    extra_photo_files.append(extra_filename)
                    try:
                        with doc.file.open('rb') as f:
                            zip_file.writestr(f"images/{extra_filename}", f.read())
                    except Exception:
                        pass

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
                "additional_furniture_photos": extra_photo_files,
                "total_furniture_photos": (1 if pod.photo_1 else 0) + (1 if pod.photo_2 else 0) + len(extra_photo_files),
                "signature_file": f"signature_pod_{pod.id}.jpg",
            })

            # CSV row
            csv_writer.writerow([
                pod.id, delivery.id, sub.id, sub.contract_reference, str(sub.customer),
                pod.delivery_date.isoformat(), pod.driver_name, pod.driver_phone,
                pod.customer_signature_name, pod.gps_latitude, pod.gps_longitude,
                pod.notes, f"photo_pod_{pod.id}_1.jpg", f"photo_pod_{pod.id}_2.jpg" if pod.photo_2 else "",
                f"signature_pod_{pod.id}.jpg", pod.status, pod.created_at.isoformat(),
                ";".join(extra_photo_files)
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
