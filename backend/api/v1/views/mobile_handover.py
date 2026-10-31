import logging
import uuid
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

HANDOVER_CACHE_TIMEOUT = 900  # 15 minutes


@api_view(["POST"])
@permission_classes([AllowAny])
def create_handover_session_view(request):
    """
    Creates an ephemeral handover session for signature or customer ID scanning between laptop and mobile.
    """
    session_type = (request.data.get("session_type") or "SIGNATURE").strip().upper()
    title = (request.data.get("title") or "").strip()
    customer_name = (request.data.get("customer_name") or "").strip()
    customer_phone = (request.data.get("customer_phone") or "").strip()

    session_id = uuid.uuid4().hex

    session_data = {
        "session_id": session_id,
        "session_type": session_type,
        "title": title or ("Customer Digital Signature" if session_type == "SIGNATURE" else "Scan Customer ID / Card"),
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "status": "WAITING",
        "data": {},
    }

    cache.set(f"mho_{session_id}", session_data, timeout=HANDOVER_CACHE_TIMEOUT)

    return Response(
        {
            "session_id": session_id,
            "session_type": session_type,
            "status": "WAITING",
            "handover_url": f"/mobile-handover/{session_id}",
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def get_handover_session_view(request, session_id: str):
    """
    Reads the current state of a handover session. Polled by laptop and loaded by mobile.
    """
    data = cache.get(f"mho_{session_id}")
    if not data:
        return Response(
            {"error": "Handover session expired or not found. Please generate a new QR code on your laptop."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def submit_handover_session_view(request, session_id: str):
    """
    Called by mobile phone to submit the captured touch signature or customer ID data.
    """
    data = cache.get(f"mho_{session_id}")
    if not data:
        return Response(
            {"error": "Handover session expired or not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    submission_data = request.data or {}
    data["status"] = "COMPLETED"
    data["data"] = submission_data

    cache.set(f"mho_{session_id}", data, timeout=HANDOVER_CACHE_TIMEOUT)

    return Response(
        {"status": "COMPLETED", "message": "Successfully transmitted to laptop webapp."},
        status=status.HTTP_200_OK,
    )
