"""
P5B — Growth Request Workflow: admin API views.

All endpoints: IsAdmin.
No subscription, EMI, payment, JournalEntry, AccountingBridgePosting,
StockLedger, LuckyDraw, Commission, or Payout record is created or mutated.
Status transitions affect only the CustomerGrowthRequest record.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.growth_request_service import (
    approve_growth_request,
    build_growth_request_preview,
    create_growth_request,
    evaluate_growth_request,
    reject_growth_request,
    submit_growth_request,
)


def _import_models():
    from subscriptions.models_growth_requests import (
        CustomerGrowthRequest,
        GrowthRequestStatus,
        GrowthRequestType,
        GrowthRequestPriority,
    )
    from subscriptions.models import Customer, Product, Subscription
    from subscriptions.models_growth_offers import OfferPackage, PlanTemplate
    return (
        CustomerGrowthRequest, GrowthRequestStatus, GrowthRequestType,
        GrowthRequestPriority, Customer, Product, Subscription,
        OfferPackage, PlanTemplate,
    )


def _serialize_request(req) -> dict:
    return {
        "id": req.pk,
        "request_number": req.request_number,
        "customer_id": req.customer_id,
        "source_subscription_id": req.source_subscription_id,
        "request_type": req.request_type,
        "status": req.status,
        "priority": req.priority,
        "desired_plan_template_id": req.desired_plan_template_id,
        "desired_offer_package_id": req.desired_offer_package_id,
        "requested_product_id": req.requested_product_id,
        "current_product_id": req.current_product_id,
        "expected_value": str(req.expected_value) if req.expected_value is not None else None,
        "reason": req.reason,
        "notes": req.notes,
        "risk_snapshot": req.risk_snapshot or {},
        "approval_required": req.approval_required,
        "approved_by_id": req.approved_by_id,
        "decided_at": req.decided_at.isoformat() if req.decided_at else None,
        "metadata": req.metadata or {},
        "created_at": req.created_at.isoformat(),
        "updated_at": req.updated_at.isoformat(),
        "created_by_id": req.created_by_id,
        "updated_by_id": req.updated_by_id,
    }


class AdminGrowthRequestListView(APIView):
    """
    GET  /api/v1/admin/growth/requests/
    POST /api/v1/admin/growth/requests/
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        (CustomerGrowthRequest, GrowthRequestStatus, GrowthRequestType,
         GrowthRequestPriority, *_) = _import_models()
        qs = CustomerGrowthRequest.objects.select_related("customer").order_by("-created_at")
        req_status = request.query_params.get("status")
        req_type = request.query_params.get("request_type")
        customer_id = request.query_params.get("customer_id")
        if req_status:
            qs = qs.filter(status=req_status)
        if req_type:
            qs = qs.filter(request_type=req_type)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return Response({"results": [_serialize_request(r) for r in qs]})

    def post(self, request):
        (CustomerGrowthRequest, GrowthRequestStatus, GrowthRequestType,
         GrowthRequestPriority, Customer, Product, Subscription,
         OfferPackage, PlanTemplate) = _import_models()
        data = request.data
        required = ["customer_id", "request_type"]
        missing = [f for f in required if not data.get(f)]
        if missing:
            return Response({"detail": f"Missing required fields: {missing}"}, status=status.HTTP_400_BAD_REQUEST)

        valid_types = [c[0] for c in GrowthRequestType.choices]
        if data["request_type"] not in valid_types:
            return Response({"detail": f"Invalid request_type. Choices: {valid_types}"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            customer = Customer.objects.get(pk=data["customer_id"])
        except Customer.DoesNotExist:
            return Response({"detail": f"Customer {data['customer_id']} not found."}, status=status.HTTP_404_NOT_FOUND)

        source_subscription = None
        if data.get("source_subscription_id"):
            try:
                source_subscription = Subscription.objects.get(pk=data["source_subscription_id"])
            except Subscription.DoesNotExist:
                return Response({"detail": "Source subscription not found."}, status=status.HTTP_404_NOT_FOUND)

        desired_plan_template = None
        if data.get("desired_plan_template_id"):
            try:
                desired_plan_template = PlanTemplate.objects.get(pk=data["desired_plan_template_id"])
            except PlanTemplate.DoesNotExist:
                return Response({"detail": "Plan template not found."}, status=status.HTTP_404_NOT_FOUND)

        desired_offer_package = None
        if data.get("desired_offer_package_id"):
            try:
                desired_offer_package = OfferPackage.objects.get(pk=data["desired_offer_package_id"])
            except OfferPackage.DoesNotExist:
                return Response({"detail": "Offer package not found."}, status=status.HTTP_404_NOT_FOUND)

        requested_product = None
        if data.get("requested_product_id"):
            try:
                requested_product = Product.objects.get(pk=data["requested_product_id"])
            except Product.DoesNotExist:
                return Response({"detail": "Requested product not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            growth_req = create_growth_request(
                customer=customer,
                request_type=data["request_type"],
                source_subscription=source_subscription,
                desired_plan_template=desired_plan_template,
                desired_offer_package=desired_offer_package,
                requested_product=requested_product,
                expected_value=data.get("expected_value"),
                reason=data.get("reason", ""),
                notes=data.get("notes", ""),
                priority=data.get("priority", "NORMAL"),
                metadata=data.get("metadata") or {},
                performed_by=request.user,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_serialize_request(growth_req), status=status.HTTP_201_CREATED)


class AdminGrowthRequestDetailView(APIView):
    """
    GET   /api/v1/admin/growth/requests/{id}/
    PATCH /api/v1/admin/growth/requests/{id}/
    """

    permission_classes = [IsAdmin]

    def _get_request(self, pk):
        from subscriptions.models_growth_requests import CustomerGrowthRequest
        try:
            return CustomerGrowthRequest.objects.get(pk=pk)
        except CustomerGrowthRequest.DoesNotExist:
            return None

    def get(self, request, pk):
        req = self._get_request(pk)
        if req is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_request(req))

    def patch(self, request, pk):
        req = self._get_request(pk)
        if req is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if req.is_terminal:
            return Response({"detail": "Cannot edit a request in terminal status."}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data
        mutable = ["reason", "notes", "priority", "expected_value", "metadata"]
        for field in mutable:
            if field in data:
                setattr(req, field, data[field])
        req.updated_by = request.user
        req.save()
        return Response(_serialize_request(req))


class AdminGrowthRequestSubmitView(APIView):
    """POST /api/v1/admin/growth/requests/{id}/submit/"""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        from subscriptions.models_growth_requests import CustomerGrowthRequest
        try:
            req = CustomerGrowthRequest.objects.get(pk=pk)
        except CustomerGrowthRequest.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            updated = submit_growth_request(req, performed_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize_request(updated))


class AdminGrowthRequestApproveView(APIView):
    """POST /api/v1/admin/growth/requests/{id}/approve/"""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        from subscriptions.models_growth_requests import CustomerGrowthRequest
        try:
            req = CustomerGrowthRequest.objects.get(pk=pk)
        except CustomerGrowthRequest.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            updated = approve_growth_request(
                req,
                approved_by=request.user,
                reason=request.data.get("reason", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize_request(updated))


class AdminGrowthRequestRejectView(APIView):
    """POST /api/v1/admin/growth/requests/{id}/reject/"""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        from subscriptions.models_growth_requests import CustomerGrowthRequest
        try:
            req = CustomerGrowthRequest.objects.get(pk=pk)
        except CustomerGrowthRequest.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            updated = reject_growth_request(
                req,
                rejected_by=request.user,
                reason=request.data.get("reason", "No reason given."),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize_request(updated))


class AdminGrowthRequestPreviewView(APIView):
    """GET /api/v1/admin/growth/requests/{id}/preview/"""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        from subscriptions.models_growth_requests import CustomerGrowthRequest
        try:
            req = CustomerGrowthRequest.objects.get(pk=pk)
        except CustomerGrowthRequest.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(build_growth_request_preview(req))
