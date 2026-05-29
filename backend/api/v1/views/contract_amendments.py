from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import AccountingBridgePosting
from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from api.v1.serializers.contract_amendments import (
    ContractAmendmentApproveSerializer,
    ContractAmendmentCreateSerializer,
    ContractAmendmentRejectSerializer,
    ContractAmendmentReviewSerializer,
    ContractAmendmentSerializer,
    ContractRecontractEventSerializer,
    ContractRecontractFinancialImpactPreviewSerializer,
    ContractRecontractScheduleLineSerializer,
    ProductRecontractReportRowSerializer,
    ProductRecontractAdminDecisionSerializer,
    ProductRecontractCustomerConsentSerializer,
    ProductRecontractPreviewRequestSerializer,
    ProductRecontractPreviewSerializer,
)
from reconciliation.models import ReconciliationEvidence
from subscriptions.models import ContractAmendment, ContractRecontractEvent, Subscription
from subscriptions.services.product_recontract_accounting_service import POSTING_PURPOSE
from subscriptions.services.contract_amendment_service import (
    approve_amendment,
    create_amendment,
    implement_approved_amendment,
    mark_under_review,
    reject_amendment,
)
from subscriptions.services.product_recontract_execution_service import execute_product_recontract_event
from subscriptions.services.product_recontract_preview_service import (
    create_product_recontract_schedule_preview,
    create_product_recontract_preview_snapshot,
    create_product_recontract_financial_impact_preview,
    preview_product_recontract,
    record_product_recontract_admin_approval,
    record_product_recontract_customer_consent,
)


def _validation_response(exc: DjangoValidationError) -> Response:
    if hasattr(exc, "message_dict"):
        return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
    if hasattr(exc, "messages"):
        messages = exc.messages
        if len(messages) == 1:
            return Response({"detail": messages[0]}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": messages}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _customer_profile_for(user):
    return getattr(user, "customer_profile", None)


def _amendment_queryset():
    return ContractAmendment.objects.select_related(
        "subscription",
        "rent_lease_contract",
        "customer",
        "partner",
        "requested_by",
        "approved_by",
        "implemented_by",
    ).order_by("-created_at", "-id")


def _metadata_int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _recontract_event_is_executed(event: ContractRecontractEvent | None):
    if event is None or not isinstance(event.metadata, dict):
        return False
    return bool(event.metadata.get("execution_performed") is True or event.metadata.get("execution_status") == "EXECUTED")


class CustomerContractAmendmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def get(self, request):
        customer = _customer_profile_for(request.user)
        if not customer:
            return Response({"detail": "Customer profile not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = _amendment_queryset().filter(customer=customer)
        return Response(ContractAmendmentSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        customer = _customer_profile_for(request.user)
        if not customer:
            return Response({"detail": "Customer profile not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ContractAmendmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        source = data.get("subscription") or data.get("rent_lease_contract")
        if source.customer_id != customer.id:
            return Response({"detail": "You can request amendments only for your own contracts."}, status=status.HTTP_403_FORBIDDEN)
        try:
            amendment = create_amendment(
                subscription=data.get("subscription"),
                rent_lease_contract=data.get("rent_lease_contract"),
                contract_type=data["contract_type"],
                amendment_type=data["amendment_type"],
                requested_values=data.get("requested_values") or {},
                reason=data["reason"],
                requested_by=request.user,
                requested_role="CUSTOMER",
                metadata={**(data.get("metadata") or {}), "requested_channel": "CUSTOMER_API"},
            )
            if data.get("effective_date"):
                amendment.effective_date = data["effective_date"]
                amendment.save(update_fields=["effective_date", "updated_at"])
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_201_CREATED)


class CustomerContractAmendmentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_profile_for(request.user)
        if not customer:
            return Response({"detail": "Customer profile not found."}, status=status.HTTP_404_NOT_FOUND)
        amendment = _amendment_queryset().filter(pk=pk, customer=customer).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_200_OK)


class CustomerContractAmendmentProductRecontractConsentView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request, pk: int):
        customer = _customer_profile_for(request.user)
        if not customer:
            return Response({"detail": "Customer profile not found."}, status=status.HTTP_404_NOT_FOUND)
        amendment = _amendment_queryset().filter(pk=pk, customer=customer).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        latest_event = (
            ContractRecontractEvent.objects.filter(amendment=amendment)
            .order_by("-created_at", "-id")
            .first()
        )
        if _recontract_event_is_executed(latest_event):
            return Response({"detail": "Product recontract has already been executed."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ProductRecontractCustomerConsentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            event = record_product_recontract_customer_consent(
                amendment=amendment,
                customer_user=request.user,
                decision=serializer.validated_data["decision"],
                note=serializer.validated_data.get("note", ""),
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractRecontractEventSerializer(event).data, status=status.HTTP_200_OK)


class PartnerContractAmendmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        queryset = _amendment_queryset().filter(
            Q(partner=request.user)
            | Q(subscription__partner=request.user)
            | Q(rent_lease_contract__partner=request.user)
        )
        return Response(ContractAmendmentSerializer(queryset.distinct(), many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = ContractAmendmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        source: Subscription = data.get("subscription") or data.get("rent_lease_contract")
        if source.partner_id != request.user.id:
            return Response({"detail": "You can request amendments only for linked partner contracts."}, status=status.HTTP_403_FORBIDDEN)
        try:
            amendment = create_amendment(
                subscription=data.get("subscription"),
                rent_lease_contract=data.get("rent_lease_contract"),
                contract_type=data["contract_type"],
                amendment_type=data["amendment_type"],
                requested_values=data.get("requested_values") or {},
                reason=data["reason"],
                requested_by=request.user,
                requested_role="PARTNER",
                metadata={**(data.get("metadata") or {}), "requested_channel": "PARTNER_API"},
            )
            if data.get("effective_date"):
                amendment.effective_date = data["effective_date"]
                amendment.save(update_fields=["effective_date", "updated_at"])
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_201_CREATED)


class PartnerContractAmendmentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request, pk: int):
        amendment = _amendment_queryset().filter(
            Q(pk=pk),
            Q(partner=request.user) | Q(subscription__partner=request.user) | Q(rent_lease_contract__partner=request.user),
        ).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_200_OK)


class AdminContractAmendmentListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _amendment_queryset()
        status_filter = request.query_params.get("status")
        contract_type = request.query_params.get("contract_type")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if contract_type:
            queryset = queryset.filter(contract_type=contract_type)
        return Response(ContractAmendmentSerializer(queryset, many=True).data, status=status.HTTP_200_OK)


class AdminContractAmendmentProductRecontractReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = (
            ContractRecontractEvent.objects.select_related(
                "amendment",
                "amendment__customer",
                "subscription",
                "old_product",
                "new_product",
            )
            .prefetch_related("schedule_preview_lines", "financial_impact_previews")
            .order_by("-created_at", "-id")
        )

        executed = request.query_params.get("executed")
        customer_consent_status = request.query_params.get("customer_consent_status")
        admin_approval_status = request.query_params.get("admin_approval_status")
        product = request.query_params.get("product")
        customer = request.query_params.get("customer")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        if customer_consent_status:
            queryset = queryset.filter(customer_consent_status=customer_consent_status.strip().upper())
        if admin_approval_status:
            queryset = queryset.filter(admin_approval_status=admin_approval_status.strip().upper())
        if product:
            product_value = product.strip()
            product_filter = Q(old_product__name__icontains=product_value) | Q(old_product__product_code__icontains=product_value)
            product_filter |= Q(new_product__name__icontains=product_value) | Q(new_product__product_code__icontains=product_value)
            if product_value.isdigit():
                product_filter |= Q(old_product_id=int(product_value)) | Q(new_product_id=int(product_value))
            queryset = queryset.filter(product_filter)
        if customer:
            customer_value = customer.strip()
            customer_filter = Q(amendment__customer__name__icontains=customer_value) | Q(amendment__customer__phone__icontains=customer_value)
            if customer_value.isdigit():
                customer_filter |= Q(amendment__customer_id=int(customer_value))
            queryset = queryset.filter(customer_filter)
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        events = list(queryset)
        if executed:
            normalized = executed.strip().lower()
            if normalized in {"true", "1", "yes", "executed"}:
                events = [event for event in events if _recontract_event_is_executed(event)]
            elif normalized in {"false", "0", "no", "not_executed"}:
                events = [event for event in events if not _recontract_event_is_executed(event)]
        bridge_by_event_id = {
            int(bridge.source_id): bridge
            for bridge in AccountingBridgePosting.objects.select_related("journal_entry").filter(
                source_model="ContractRecontractEvent",
                source_id__in=[str(event.id) for event in events],
                purpose=POSTING_PURPOSE,
            )
            if str(bridge.source_id).isdigit()
        }
        item_ids = []
        for event in events:
            if not isinstance(event.metadata, dict):
                continue
            item_id = _metadata_int(event.metadata.get("reconciliation_item_id") or event.metadata.get("reconciliation_record_id"))
            if item_id:
                item_ids.append(item_id)
        evidence_by_item_id = {}
        if item_ids:
            for item_id, evidence_id in ReconciliationEvidence.objects.filter(item_id__in=item_ids).values_list("item_id", "id"):
                evidence_by_item_id.setdefault(item_id, []).append(evidence_id)

        serializer = ProductRecontractReportRowSerializer(
            events,
            many=True,
            context={
                "accounting_bridges": bridge_by_event_id,
                "reconciliation_evidence_ids": evidence_by_item_id,
            },
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminContractAmendmentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_200_OK)


class AdminContractAmendmentReviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ContractAmendmentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            amendment = mark_under_review(
                amendment=amendment,
                reviewed_by=request.user,
                admin_note=serializer.validated_data.get("admin_note", ""),
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_200_OK)


class AdminContractAmendmentApproveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ContractAmendmentApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            amendment = approve_amendment(
                amendment=amendment,
                approved_by=request.user,
                approved_values=serializer.validated_data.get("approved_values"),
                admin_note=serializer.validated_data.get("admin_note", ""),
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_200_OK)


class AdminContractAmendmentRejectView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ContractAmendmentRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            amendment = reject_amendment(
                amendment=amendment,
                rejected_by=request.user,
                rejection_reason=serializer.validated_data["rejection_reason"],
                admin_note=serializer.validated_data.get("admin_note", ""),
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_200_OK)


class AdminContractAmendmentImplementView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            amendment = implement_approved_amendment(
                amendment=amendment,
                implemented_by=request.user,
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_200_OK)


class AdminContractAmendmentProductRecontractPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductRecontractPreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            preview = preview_product_recontract(
                amendment=amendment,
                preview_tenure_months=serializer.validated_data.get("preview_tenure_months"),
                effective_date=serializer.validated_data.get("effective_date"),
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ProductRecontractPreviewSerializer(preview).data, status=status.HTTP_200_OK)


class AdminContractAmendmentProductRecontractPreviewSaveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductRecontractPreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            event = create_product_recontract_preview_snapshot(
                amendment=amendment,
                requested_by=request.user,
                preview_tenure_months=serializer.validated_data.get("preview_tenure_months"),
                effective_date=serializer.validated_data.get("effective_date"),
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractRecontractEventSerializer(event).data, status=status.HTTP_201_CREATED)


class AdminContractAmendmentProductRecontractDecisionView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        latest_event = (
            ContractRecontractEvent.objects.filter(amendment=amendment)
            .order_by("-created_at", "-id")
            .first()
        )
        if _recontract_event_is_executed(latest_event):
            return Response({"detail": "Product recontract has already been executed."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ProductRecontractAdminDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            event = record_product_recontract_admin_approval(
                amendment=amendment,
                admin_user=request.user,
                decision=serializer.validated_data["decision"],
                note=serializer.validated_data.get("note", ""),
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractRecontractEventSerializer(event).data, status=status.HTTP_200_OK)


class AdminContractAmendmentProductRecontractEventListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        events = (
            ContractRecontractEvent.objects.filter(amendment=amendment)
            .select_related("amendment", "subscription", "old_product", "new_product", "created_by", "customer_consented_by", "admin_approved_by")
            .prefetch_related("schedule_preview_lines")
            .order_by("-created_at", "-id")
        )
        return Response(ContractRecontractEventSerializer(events, many=True).data, status=status.HTTP_200_OK)


class AdminContractAmendmentProductRecontractSchedulePreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            event = create_product_recontract_schedule_preview(amendment=amendment, requested_by=request.user)
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractRecontractEventSerializer(event).data, status=status.HTTP_201_CREATED)

    def get(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        event = (
            ContractRecontractEvent.objects.filter(amendment=amendment, status=ContractRecontractEvent.Status.PREVIEWED)
            .prefetch_related("schedule_preview_lines")
            .order_by("-created_at", "-id")
            .first()
        )
        if not event:
            return Response([], status=status.HTTP_200_OK)
        lines = event.schedule_preview_lines.all().order_by("line_no", "id")
        return Response(ContractRecontractScheduleLineSerializer(lines, many=True).data, status=status.HTTP_200_OK)


class AdminContractAmendmentProductRecontractFinancialImpactPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            preview = create_product_recontract_financial_impact_preview(amendment=amendment, requested_by=request.user)
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractRecontractFinancialImpactPreviewSerializer(preview).data, status=status.HTTP_201_CREATED)

    def get(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        event = (
            ContractRecontractEvent.objects.filter(amendment=amendment)
            .order_by("-created_at", "-id")
            .first()
        )
        if not event:
            return Response([], status=status.HTTP_200_OK)
        previews = event.financial_impact_previews.all().order_by("-created_at", "-id")
        return Response(ContractRecontractFinancialImpactPreviewSerializer(previews, many=True).data, status=status.HTTP_200_OK)


class AdminContractAmendmentProductRecontractExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            event = execute_product_recontract_event(amendment=amendment, executed_by=request.user)
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractRecontractEventSerializer(event).data, status=status.HTTP_200_OK)


class AdminContractAmendmentLuckyBatchPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        
        from subscriptions.services.lucky_batch_preview_service import preview_lucky_id_batch_amendment
        try:
            preview = preview_lucky_id_batch_amendment(amendment)
        except DjangoValidationError as exc:
            return _validation_response(exc)
        
        return Response(preview, status=status.HTTP_200_OK)

    def post(self, request, pk: int):
        return self.get(request, pk)
