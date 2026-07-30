"""Partner-facing views for PartnerCustomerKycRequest.

Partners submit requests for admin to perform KYC verification or set up
a login ID for a specific customer. Admin reviews and approves/rejects.
Partners can list their own requests and track status.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsPartner
from subscriptions.models import (
    Customer,
    PartnerCustomerKycRequest,
    PartnerCustomerKycRequestStatus,
    PartnerCustomerKycRequestType,
)


def _serialize_request(req: PartnerCustomerKycRequest) -> dict:
    customer_name = (
        req.customer.name if req.customer_id else None
    ) or req.customer_name or ""
    customer_phone = (
        req.customer.phone if req.customer_id else None
    ) or req.customer_phone or ""
    customer_kyc = req.customer.kyc_status if req.customer_id else None
    return {
        "id": req.pk,
        "customer_id": req.customer_id,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "customer_kyc_status": customer_kyc,
        "request_type": req.request_type,
        "notes": req.notes,
        "status": req.status,
        "admin_remarks": req.admin_remarks,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }


class PartnerCustomerKycRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        qs = (
            PartnerCustomerKycRequest.objects
            .filter(partner=request.user)
            .select_related("customer")
            .order_by("-created_at")[:100]
        )
        return Response({"results": [_serialize_request(r) for r in qs]})

    def post(self, request):
        data = request.data
        customer_id = data.get("customer_id")
        request_type = str(data.get("request_type", "")).strip().upper()
        notes = str(data.get("notes", "")).strip()

        if request_type not in PartnerCustomerKycRequestType.values:
            return Response(
                {"detail": "Invalid request type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        customer = None
        customer_name = str(data.get("customer_name", "")).strip()
        customer_phone = str(data.get("customer_phone", "")).strip()

        if customer_id:
            # Validate customer belongs to this partner
            try:
                customer = Customer.objects.get(
                    pk=int(customer_id),
                    subscriptions__partner=request.user,
                )
                customer_name = customer.name
                customer_phone = customer.phone
            except Customer.DoesNotExist:
                return Response(
                    {"detail": "Customer not found or not linked to your account."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if not customer_name or not customer_phone:
                return Response(
                    {"detail": "Please provide customer name and phone number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        req = PartnerCustomerKycRequest.objects.create(
            partner=request.user,
            customer=customer,
            customer_name=customer_name,
            customer_phone=customer_phone,
            request_type=request_type,
            notes=notes,
            status=PartnerCustomerKycRequestStatus.PENDING,
        )
        return Response(_serialize_request(req), status=status.HTTP_201_CREATED)


class PartnerCustomerSearchView(APIView):
    """Quick customer search for the KYC request form autocomplete."""
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        q = str(request.query_params.get("q", "")).strip()
        if not q or len(q) < 2:
            return Response({"results": []})
        customers = (
            Customer.objects
            .filter(
                subscriptions__partner=request.user,
            )
            .filter(
                name__icontains=q
            )
            .distinct()
            .values("id", "name", "phone", "kyc_status")[:20]
        )
        # Also search by phone
        if q.isdigit() or (q.startswith("+") and q[1:].isdigit()):
            phone_hits = (
                Customer.objects
                .filter(
                    subscriptions__partner=request.user,
                    phone__icontains=q,
                )
                .distinct()
                .values("id", "name", "phone", "kyc_status")[:10]
            )
            seen_ids = {c["id"] for c in customers}
            customers = list(customers) + [c for c in phone_hits if c["id"] not in seen_ids]

        return Response({"results": list(customers)})
