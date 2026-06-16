from django.http import HttpResponse
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import SubscriptionAdminDetailSerializer
from api.v1.serializers.contracts import (
    AdminLeaseContractCreateSerializer,
    AdminRentContractCreateSerializer,
)
from subscriptions.services.subscription_financial_service import (
    get_subscription_detail_queryset,
)
from subscriptions.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from subscriptions.models import (
    ContractAmendment,
    ContractAmendmentStatus,
    ProductPossession,
    RentLeaseReturnInspection,
    PlanType,
    Subscription,
)
from subscriptions.services.document_pdf_service import (
    render_lease_contract_pdf,
    render_rent_contract_pdf,
    render_return_inspection_pdf,
)


def _get_subscription_or_404(pk):
    try:
        return get_subscription_detail_queryset().get(pk=pk)
    except Subscription.DoesNotExist:
        return None


class AdminRentContractCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = AdminRentContractCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        subscription = create_rent_contract(
            customer=data["customer"],
            product=data["product"],
            tenure_months=data["tenure_months"],
            start_date=data.get("start_date"),
            security_deposit_percent=data["security_deposit_percent"],
            performed_by=request.user,
            handover_notes=(data.get("handover_notes") or ""),
            contract_terms_snapshot=(data.get("contract_terms_snapshot") or ""),
            save_as_draft=bool(data.get("save_as_draft", False)),
        )

        from subscriptions.services.contract_pdf_service import generate_contract_pdf_for_subscription
        generate_contract_pdf_for_subscription(subscription=subscription, performed_by=request.user)

        refreshed = get_subscription_detail_queryset().get(pk=subscription.pk)
        return Response(
            SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminLeaseContractCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = AdminLeaseContractCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        subscription = create_lease_contract(
            customer=data["customer"],
            product=data["product"],
            tenure_months=data["tenure_months"],
            start_date=data.get("start_date"),
            security_deposit_percent=data["security_deposit_percent"],
            buyout_amount=data.get("buyout_amount"),
            ownership_transfer_allowed=bool(data.get("ownership_transfer_allowed", False)),
            performed_by=request.user,
            handover_notes=(data.get("handover_notes") or ""),
            contract_terms_snapshot=(data.get("contract_terms_snapshot") or ""),
            save_as_draft=bool(data.get("save_as_draft", False)),
        )

        from subscriptions.services.contract_pdf_service import generate_contract_pdf_for_subscription
        generate_contract_pdf_for_subscription(subscription=subscription, performed_by=request.user)

        refreshed = get_subscription_detail_queryset().get(pk=subscription.pk)
        return Response(
            SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminRentContractPdfView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        subscription = (
            Subscription.objects.select_related("customer", "product", "rent_profile")
            .filter(pk=pk, plan_type=PlanType.RENT)
            .first()
        )
        if subscription is None or not hasattr(subscription, "rent_profile"):
            return Response({"detail": "Rent contract not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_rent_contract_pdf(contract=subscription.rent_profile)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="rent-contract-{subscription.id}.pdf"'
        )
        return response


class AdminLeaseContractPdfView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        subscription = (
            Subscription.objects.select_related("customer", "product", "lease_profile")
            .filter(pk=pk, plan_type=PlanType.LEASE)
            .first()
        )
        if subscription is None or not hasattr(subscription, "lease_profile"):
            return Response({"detail": "Lease contract not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_lease_contract_pdf(contract=subscription.lease_profile)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="lease-contract-{subscription.id}.pdf"'
        )
        return response


class AdminReturnInspectionPdfView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        inspection = (
            RentLeaseReturnInspection.objects.select_related("subscription", "subscription__customer")
            .filter(pk=pk)
            .first()
        )
        if inspection is None:
            return Response({"detail": "Return inspection not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_return_inspection_pdf(return_or_inspection_record=inspection)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="return-inspection-{inspection.id}.pdf"'
        )
        return response


# ─── Contract Lifecycle ───────────────────────────────────────────────────────

class ContractApproveView(APIView):
    """POST /api/v1/admin/contracts/<id>/approve/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        sub = _get_subscription_or_404(pk)
        if sub is None:
            return Response({"detail": "Contract not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.contract_lifecycle_service import approve_contract
        from django.core.exceptions import ValidationError
        try:
            sub = approve_contract(subscription=sub, performed_by=request.user)
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)

        refreshed = get_subscription_detail_queryset().get(pk=sub.pk)
        return Response(SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data)


class ContractActivateView(APIView):
    """POST /api/v1/admin/contracts/<id>/activate/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        sub = _get_subscription_or_404(pk)
        if sub is None:
            return Response({"detail": "Contract not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.contract_lifecycle_service import activate_contract
        from django.core.exceptions import ValidationError
        try:
            sub = activate_contract(subscription=sub, performed_by=request.user)
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)

        refreshed = get_subscription_detail_queryset().get(pk=sub.pk)
        return Response(SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data)


class ContractCancelView(APIView):
    """POST /api/v1/admin/contracts/<id>/cancel/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        sub = _get_subscription_or_404(pk)
        if sub is None:
            return Response({"detail": "Contract not found."}, status=status.HTTP_404_NOT_FOUND)

        reason = (request.data.get("reason") or "").strip()
        force = bool(request.data.get("force_after_activation", False))

        from subscriptions.services.operational_cancellation_service import cancel_subscription
        from django.core.exceptions import ValidationError
        try:
            cancel_subscription(
                subscription_id=sub.id,
                actor=request.user,
                reason=reason,
                force_after_activation=force,
            )
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)

        refreshed = get_subscription_detail_queryset().get(pk=sub.pk)
        return Response(SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data)


class ContractCloseView(APIView):
    """POST /api/v1/admin/contracts/<id>/close/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        sub = _get_subscription_or_404(pk)
        if sub is None:
            return Response({"detail": "Contract not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.contract_lifecycle_service import close_contract
        from django.core.exceptions import ValidationError
        try:
            sub = close_contract(subscription=sub, performed_by=request.user)
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)

        refreshed = get_subscription_detail_queryset().get(pk=sub.pk)
        return Response(SubscriptionAdminDetailSerializer(refreshed, context={"request": request}).data)


# ─── Contract Amendments ──────────────────────────────────────────────────────

class _AmendmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractAmendment
        fields = [
            "id", "subscription", "amendment_type", "status",
            "previous_values", "new_values", "reason",
            "requested_by", "approved_by", "approved_at",
            "rejection_reason", "applied_at", "notes", "created_at",
        ]
        read_only_fields = [
            "id", "status", "requested_by", "approved_by", "approved_at",
            "rejection_reason", "applied_at", "created_at",
        ]


class ContractAmendmentListCreateView(APIView):
    """GET /api/v1/admin/contracts/<id>/amendments/
       POST /api/v1/admin/contracts/<id>/amendments/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        amendments = ContractAmendment.objects.filter(subscription_id=pk).order_by("-created_at")
        data = _AmendmentSerializer(amendments, many=True).data
        return Response(data)

    def post(self, request, pk):
        sub = _get_subscription_or_404(pk)
        if sub is None:
            return Response({"detail": "Contract not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.contract_amendment_service import create_amendment
        from django.core.exceptions import ValidationError
        try:
            amendment = create_amendment(
                subscription=sub,
                amendment_type=request.data.get("amendment_type", ""),
                previous_values=request.data.get("previous_values", {}),
                new_values=request.data.get("new_values", {}),
                reason=request.data.get("reason", ""),
                requested_by=request.user,
                notes=request.data.get("notes", ""),
            )
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)

        return Response(_AmendmentSerializer(amendment).data, status=status.HTTP_201_CREATED)


class ContractAmendmentApproveView(APIView):
    """POST /api/v1/admin/contracts/amendments/<amendment_id>/approve/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, amendment_id):
        try:
            amendment = ContractAmendment.objects.get(pk=amendment_id)
        except ContractAmendment.DoesNotExist:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.contract_amendment_service import approve_amendment
        from django.core.exceptions import ValidationError
        try:
            amendment = approve_amendment(amendment=amendment, approved_by=request.user)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_AmendmentSerializer(amendment).data)


class ContractAmendmentRejectView(APIView):
    """POST /api/v1/admin/contracts/amendments/<amendment_id>/reject/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, amendment_id):
        try:
            amendment = ContractAmendment.objects.get(pk=amendment_id)
        except ContractAmendment.DoesNotExist:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.contract_amendment_service import reject_amendment
        from django.core.exceptions import ValidationError
        try:
            amendment = reject_amendment(
                amendment=amendment,
                rejected_by=request.user,
                rejection_reason=request.data.get("rejection_reason", ""),
            )
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_AmendmentSerializer(amendment).data)


class ContractAmendmentApplyView(APIView):
    """POST /api/v1/admin/contracts/amendments/<amendment_id>/apply/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, amendment_id):
        try:
            amendment = ContractAmendment.objects.get(pk=amendment_id)
        except ContractAmendment.DoesNotExist:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.contract_amendment_service import apply_amendment
        from django.core.exceptions import ValidationError
        try:
            # Legacy lifecycle endpoint kept for backward-compatible clients only.
            # It delegates to the guarded amendment service and must not grow
            # direct PRODUCT_UPGRADE, repricing, EMI, payment, accounting,
            # reconciliation, inventory, delivery, lucky ID, or batch behavior.
            amendment = apply_amendment(amendment=amendment, applied_by=request.user)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_AmendmentSerializer(amendment).data)


# ─── Product Possession ───────────────────────────────────────────────────────

class _PossessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPossession
        fields = [
            "id", "subscription", "product", "customer", "status",
            "handover_date", "expected_return_date", "actual_return_date",
            "handover_condition_notes", "return_condition_notes",
            "serial_number", "handed_over_by", "returned_to", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "subscription", "product", "customer", "created_at", "updated_at"]


class ContractPossessionView(APIView):
    """GET/POST /api/v1/admin/contracts/<id>/possession/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        possession = ProductPossession.objects.filter(subscription_id=pk).first()
        if not possession:
            return Response({"detail": "No possession record found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_PossessionSerializer(possession).data)

    def post(self, request, pk):
        sub = _get_subscription_or_404(pk)
        if sub is None:
            return Response({"detail": "Contract not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.product_possession_service import create_possession_record
        from django.core.exceptions import ValidationError
        try:
            possession = create_possession_record(
                subscription=sub,
                expected_return_date=request.data.get("expected_return_date"),
                serial_number=request.data.get("serial_number", ""),
                handover_condition_notes=request.data.get("handover_condition_notes", ""),
                performed_by=request.user,
            )
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_PossessionSerializer(possession).data, status=status.HTTP_201_CREATED)


class ContractHandoverView(APIView):
    """POST /api/v1/admin/contracts/<id>/possession/handover/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        possession = ProductPossession.objects.filter(subscription_id=pk).first()
        if not possession:
            return Response({"detail": "No possession record found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.product_possession_service import record_handover
        from django.core.exceptions import ValidationError
        try:
            possession = record_handover(
                possession=possession,
                handed_over_by=request.user,
                handover_date=request.data.get("handover_date"),
                handover_condition_notes=request.data.get("handover_condition_notes", ""),
            )
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_PossessionSerializer(possession).data)


class ContractInitiateReturnView(APIView):
    """POST /api/v1/admin/contracts/<id>/possession/return/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        possession = ProductPossession.objects.filter(subscription_id=pk).first()
        if not possession:
            return Response({"detail": "No possession record found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.product_possession_service import initiate_return
        from django.core.exceptions import ValidationError
        try:
            possession = initiate_return(
                possession=possession,
                performed_by=request.user,
                actual_return_date=request.data.get("actual_return_date"),
                return_condition_notes=request.data.get("return_condition_notes", ""),
            )
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_PossessionSerializer(possession).data)


# ─── Return Inspections ───────────────────────────────────────────────────────

class _InspectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RentLeaseReturnInspection
        fields = [
            "id", "subscription", "status", "outcome", "inspection_date",
            "condition_recorded", "damage_notes", "damage_deduction_amount",
            "deposit_refund_amount", "deposit_refund_approved",
            "approved_at", "stock_routing_notes",
            "inspected_by", "approved_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "subscription", "created_at", "updated_at"]


class ContractReturnInspectionView(APIView):
    """GET/POST /api/v1/admin/contracts/<id>/return-inspection/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        inspection = RentLeaseReturnInspection.objects.filter(subscription_id=pk).first()
        if not inspection:
            return Response({"detail": "No inspection found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_InspectionSerializer(inspection).data)

    def post(self, request, pk):
        sub = _get_subscription_or_404(pk)
        if sub is None:
            return Response({"detail": "Contract not found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.return_inspection_service import create_return_inspection
        from django.core.exceptions import ValidationError
        try:
            inspection = create_return_inspection(subscription=sub, performed_by=request.user)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_InspectionSerializer(inspection).data, status=status.HTTP_201_CREATED)


class ContractReturnInspectionRecordView(APIView):
    """POST /api/v1/admin/contracts/<id>/return-inspection/record/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        inspection = RentLeaseReturnInspection.objects.filter(subscription_id=pk).first()
        if not inspection:
            return Response({"detail": "No inspection found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.return_inspection_service import record_inspection
        from django.core.exceptions import ValidationError
        from decimal import Decimal, InvalidOperation
        try:
            damage = Decimal(str(request.data.get("damage_deduction_amount", "0")))
            refund = Decimal(str(request.data.get("deposit_refund_amount", "0")))
            inspection = record_inspection(
                inspection=inspection,
                inspected_by=request.user,
                condition=request.data.get("condition_recorded", "NOT_ASSESSED"),
                outcome=request.data.get("outcome", ""),
                damage_notes=request.data.get("damage_notes", ""),
                damage_deduction_amount=damage,
                deposit_refund_amount=refund,
                inspection_date=request.data.get("inspection_date"),
                stock_routing_notes=request.data.get("stock_routing_notes", ""),
            )
        except (ValidationError, InvalidOperation) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_InspectionSerializer(inspection).data)


class ContractReturnInspectionApproveView(APIView):
    """POST /api/v1/admin/contracts/<id>/return-inspection/approve/"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        inspection = RentLeaseReturnInspection.objects.filter(subscription_id=pk).first()
        if not inspection:
            return Response({"detail": "No inspection found."}, status=status.HTTP_404_NOT_FOUND)

        from subscriptions.services.return_inspection_service import approve_inspection
        from django.core.exceptions import ValidationError
        try:
            inspection = approve_inspection(inspection=inspection, approved_by=request.user)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_InspectionSerializer(inspection).data)
