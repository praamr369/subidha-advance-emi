from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.policy_site import (
    BusinessComplianceDocumentAdminSerializer,
    ComplianceApproveActionSerializer,
    ComplianceReasonActionSerializer,
    PolicyPageAdminSerializer,
    PolicyPublishActionSerializer,
    PolicyReasonActionSerializer,
    PolicySeedActionSerializer,
)
from subscriptions.models_business_setup import (
    BenefitFundingSource,
    BenefitType,
    BusinessComplianceDocument,
    LegalRiskStatus,
    PlanLegalClassification,
    PolicyPage,
    SelectionMethod,
)
from subscriptions.services.business_compliance_governance_service import (
    build_business_compliance_readiness,
    list_business_compliance_templates,
    seed_business_compliance_rows,
)
from subscriptions.services.business_compliance_public_summary_service import (
    get_public_business_compliance_summary,
)
from subscriptions.services.business_compliance_review_actions import (
    approve_document as approve_compliance_document,
    approve_public_summary,
    expire_document,
    get_review_state,
    mark_under_review,
    reject_document,
    revoke_public_summary,
    update_document_metadata,
)
from subscriptions.services.waiver_classification_service import (
    WAIVER_CLASSIFICATION_MATRIX,
    classify_waiver_from_dict,
)
from subscriptions.services.business_rule_policy_service import (
    business_rule_policy_payload,
    update_active_business_rule_policy,
)
from subscriptions.services.policy_governance_service import (
    accept_internal_policy,
    approve_policy,
    archive_policy_page,
    build_policy_coverage_matrix,
    create_draft_from_policy,
    create_policy_page,
    get_latest_policy_by_slug,
    publish_policy_page,
    reject_policy,
    seed_default_policy_pages,
    submit_policy_for_review,
    sync_policy_governance_metadata_from_catalog,
    update_policy_page,
)


class _AdminPolicyBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class BusinessRulePolicyUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    plan_type = serializers.ChoiceField(required=False, choices=PlanLegalClassification.choices)
    benefit_type = serializers.ChoiceField(required=False, choices=BenefitType.choices)
    selection_method = serializers.ChoiceField(required=False, choices=SelectionMethod.choices)
    funding_source = serializers.ChoiceField(required=False, choices=BenefitFundingSource.choices)
    risk_status = serializers.ChoiceField(required=False, choices=LegalRiskStatus.choices)
    refund_sla_working_days = serializers.IntegerField(required=False, min_value=1, max_value=60)
    late_payment_charge_enabled = serializers.BooleanField(required=False)
    late_payment_charge_configured = serializers.BooleanField(required=False)
    late_payment_charge_label = serializers.CharField(required=False, allow_blank=True, max_length=80)
    partner_receipt_admin_approval_required = serializers.BooleanField(required=False)
    kyc_masking_required = serializers.BooleanField(required=False)
    deposit_refund_requires_inspection = serializers.BooleanField(required=False)
    gst_documents_require_hsn_sac = serializers.BooleanField(required=False)
    non_gst_document_labels = serializers.ListField(
        required=False,
        child=serializers.CharField(max_length=80, allow_blank=False),
        allow_empty=False,
    )
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminBusinessRulePolicyView(_AdminPolicyBase):
    def get(self, request):
        return Response(business_rule_policy_payload())

    def patch(self, request):
        serializer = BusinessRulePolicyUpdateSerializer(data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            policy = update_active_business_rule_policy(
                payload=serializer.validated_data,
                performed_by=request.user,
            )
        except Exception as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(business_rule_policy_payload(policy))


class AdminWaiverClassificationMatrixView(_AdminPolicyBase):
    """Returns the static waiver classification matrix and optionally classifies a specific case."""

    def get(self, request):
        return Response({"matrix": WAIVER_CLASSIFICATION_MATRIX})

    def post(self, request):
        data = request.data or {}
        result = classify_waiver_from_dict(data)
        return Response(result)


class AdminPolicyPageListCreateView(_AdminPolicyBase):
    def get(self, request):
        queryset = PolicyPage.objects.all().order_by("slug", "-version", "-id")

        slug = (request.query_params.get("slug") or "").strip().lower()
        status_value = (request.query_params.get("status") or "").strip().upper()
        category = (request.query_params.get("category") or "").strip().upper()

        if slug:
            queryset = queryset.filter(slug=slug)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if category:
            queryset = queryset.filter(category=category)

        data = PolicyPageAdminSerializer(queryset, many=True).data
        return Response({"count": len(data), "results": data})

    def post(self, request):
        serializer = PolicyPageAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            policy = create_policy_page(payload=serializer.validated_data, performed_by=request.user)
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(PolicyPageAdminSerializer(policy).data, status=status.HTTP_201_CREATED)


class AdminPolicyCoverageView(_AdminPolicyBase):
    def get(self, request):
        return Response(build_policy_coverage_matrix())


class AdminPolicyPageDetailView(_AdminPolicyBase):
    def get(self, request, pk: int):
        policy = get_object_or_404(PolicyPage, pk=pk)
        return Response(PolicyPageAdminSerializer(policy).data)

    def patch(self, request, pk: int):
        policy = get_object_or_404(PolicyPage, pk=pk)
        serializer = PolicyPageAdminSerializer(instance=policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = update_policy_page(policy=policy, payload=serializer.validated_data, performed_by=request.user)
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(PolicyPageAdminSerializer(updated).data)


class AdminPolicyPageBySlugView(_AdminPolicyBase):
    def get(self, request, slug: str):
        policy = get_latest_policy_by_slug(slug.strip().lower())
        if policy is None:
            return Response({"policy": None})
        return Response({"policy": PolicyPageAdminSerializer(policy).data})


class _AdminPolicyActionBase(_AdminPolicyBase):
    def get_policy(self, pk: int) -> PolicyPage:
        return get_object_or_404(PolicyPage, pk=pk)

    def serialize(self, policy: PolicyPage) -> Response:
        return Response(PolicyPageAdminSerializer(policy).data)


class AdminPolicyPageSubmitReviewView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        try:
            return self.serialize(submit_policy_for_review(self.get_policy(pk), performed_by=request.user))
        except ValueError as error:
            raise ValidationError({"detail": str(error)})


class AdminPolicyPageApproveView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        try:
            return self.serialize(approve_policy(self.get_policy(pk), performed_by=request.user))
        except ValueError as error:
            raise ValidationError({"detail": str(error)})


class AdminPolicyPageRejectView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        serializer = PolicyReasonActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            return self.serialize(reject_policy(self.get_policy(pk), performed_by=request.user, reason=serializer.validated_data["reason"]))
        except ValueError as error:
            raise ValidationError({"detail": str(error)})


class AdminPolicyPageAcceptInternalView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        try:
            return self.serialize(accept_internal_policy(self.get_policy(pk), performed_by=request.user))
        except ValueError as error:
            raise ValidationError({"detail": str(error)})


class AdminPolicyPageSyncGovernanceMetadataView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        try:
            return self.serialize(sync_policy_governance_metadata_from_catalog(self.get_policy(pk), performed_by=request.user))
        except ValueError as error:
            raise ValidationError({"detail": str(error)})


class AdminPolicyPagePublishView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        policy = self.get_policy(pk)
        serializer = PolicyPublishActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            published = publish_policy_page(
                policy=policy,
                performed_by=request.user,
                effective_date=serializer.validated_data.get("effective_date"),
                review_now=serializer.validated_data.get("review_now", True),
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        return self.serialize(published)


class AdminPolicyPageArchiveView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        policy = self.get_policy(pk)
        serializer = PolicyReasonActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=False)
        reason = serializer.validated_data.get("reason", "") if serializer.is_valid() else request.data.get("reason", "")
        try:
            archived = archive_policy_page(policy=policy, performed_by=request.user, reason=reason)
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        return self.serialize(archived)


class AdminPolicyPageCreateDraftView(_AdminPolicyActionBase):
    def post(self, request, pk: int):
        policy = self.get_policy(pk)
        draft = create_draft_from_policy(policy=policy, performed_by=request.user)
        return Response(PolicyPageAdminSerializer(draft).data, status=status.HTTP_201_CREATED)


class AdminPolicySeedDefaultsView(_AdminPolicyBase):
    def post(self, request):
        serializer = PolicySeedActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = seed_default_policy_pages(
            performed_by=request.user,
            overwrite_existing_drafts=serializer.validated_data.get("overwrite_existing_drafts", False),
        )
        return Response(result)


class AdminBusinessComplianceTemplateListView(_AdminPolicyBase):
    def get(self, request):
        templates = list_business_compliance_templates()
        return Response({"count": len(templates), "results": templates})


class AdminBusinessComplianceSeedRowsView(_AdminPolicyBase):
    def post(self, request):
        return Response(seed_business_compliance_rows(performed_by=request.user))


class AdminBusinessComplianceReadinessView(_AdminPolicyBase):
    def get(self, request):
        return Response(build_business_compliance_readiness())


def _validated_compliance_template_key(value: str) -> str:
    key = (value or "").strip().lower()
    if not key:
        return ""
    allowed_keys = {template["key"] for template in list_business_compliance_templates()}
    if key not in allowed_keys:
        raise ValidationError({"source_template_key": "Unknown compliance template key."})
    return key


class AdminBusinessComplianceDocumentListCreateView(_AdminPolicyBase):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        queryset = BusinessComplianceDocument.objects.all().order_by("document_type", "-created_at", "-id")
        serializer = BusinessComplianceDocumentAdminSerializer(queryset, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data})

    def post(self, request):
        serializer = BusinessComplianceDocumentAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        source_template_key = _validated_compliance_template_key(request.data.get("source_template_key", ""))
        document = serializer.save(uploaded_by=request.user)
        payload = {}
        if source_template_key:
            payload["source_template_key"] = source_template_key
        if document.file:
            payload["file"] = document.file
        if payload:
            document = update_document_metadata(document=document, payload=payload, performed_by=request.user)
        else:
            get_review_state(document)
        return Response(BusinessComplianceDocumentAdminSerializer(document).data, status=status.HTTP_201_CREATED)


class AdminBusinessComplianceDocumentDetailView(_AdminPolicyBase):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, pk: int):
        document = get_object_or_404(BusinessComplianceDocument, pk=pk)
        return Response(BusinessComplianceDocumentAdminSerializer(document).data)

    def patch(self, request, pk: int):
        document = get_object_or_404(BusinessComplianceDocument, pk=pk)
        serializer = BusinessComplianceDocumentAdminSerializer(instance=document, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        if "expires_at" in request.data:
            payload["expires_at"] = request.data.get("expires_at") or None
        if "source_template_key" in request.data:
            payload["source_template_key"] = _validated_compliance_template_key(request.data.get("source_template_key", ""))
        try:
            updated = update_document_metadata(document=document, payload=payload, performed_by=request.user)
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        return Response(BusinessComplianceDocumentAdminSerializer(updated).data)


class _AdminBusinessComplianceDocumentActionBase(_AdminPolicyBase):
    def get_document(self, pk: int) -> BusinessComplianceDocument:
        return get_object_or_404(BusinessComplianceDocument, pk=pk)

    def serialize(self, document: BusinessComplianceDocument) -> Response:
        return Response(BusinessComplianceDocumentAdminSerializer(document).data)


class AdminBusinessComplianceDocumentSubmitReviewView(_AdminBusinessComplianceDocumentActionBase):
    def post(self, request, pk: int):
        document = self.get_document(pk)
        updated = mark_under_review(document, performed_by=request.user)
        return self.serialize(updated)


class AdminBusinessComplianceDocumentApproveView(_AdminBusinessComplianceDocumentActionBase):
    def post(self, request, pk: int):
        document = self.get_document(pk)
        serializer = ComplianceApproveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = approve_compliance_document(
                document,
                performed_by=request.user,
                public_summary_approved_flag=serializer.validated_data.get("public_summary_approved", False),
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        return self.serialize(updated)


class AdminBusinessComplianceDocumentRejectView(_AdminBusinessComplianceDocumentActionBase):
    def post(self, request, pk: int):
        document = self.get_document(pk)
        serializer = ComplianceReasonActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = reject_document(document, performed_by=request.user, reason=serializer.validated_data["reason"])
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        return self.serialize(updated)


class AdminBusinessComplianceDocumentExpireView(_AdminBusinessComplianceDocumentActionBase):
    def post(self, request, pk: int):
        document = self.get_document(pk)
        serializer = ComplianceReasonActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = expire_document(document, performed_by=request.user, reason=serializer.validated_data["reason"])
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        return self.serialize(updated)


class AdminBusinessComplianceDocumentApprovePublicSummaryView(_AdminBusinessComplianceDocumentActionBase):
    def post(self, request, pk: int):
        document = self.get_document(pk)
        try:
            updated = approve_public_summary(document, performed_by=request.user)
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        return self.serialize(updated)


class AdminBusinessComplianceDocumentRevokePublicSummaryView(_AdminBusinessComplianceDocumentActionBase):
    def post(self, request, pk: int):
        document = self.get_document(pk)
        updated = revoke_public_summary(document, performed_by=request.user)
        return self.serialize(updated)


class AdminBusinessComplianceSummaryView(_AdminPolicyBase):
    def get(self, request):
        return Response(get_public_business_compliance_summary())


class AdminPolicyGovernanceSeedView(_AdminPolicyBase):
    """Seed all required policy templates and auto-publish public ones / accept internal ones.

    GET  → dry-run preview (no mutations).
    POST → execute seed + publish + accept.
    """

    def get(self, request):
        from subscriptions.services.policy_coverage_catalog import INTERNAL, PUBLIC, get_policy_coverage_specs
        specs = get_policy_coverage_specs()
        coverage = build_policy_coverage_matrix()
        public_missing = sum(1 for row in coverage["results"] if row["visibility"] == PUBLIC and row["status"] != "PUBLISHED")
        internal_pending = sum(1 for row in coverage["results"] if row["visibility"] == INTERNAL and not row["internal_ready"])
        return Response({
            "mode": "dry_run_preview",
            "public_policies_total": sum(1 for s in specs if s.visibility == PUBLIC),
            "internal_policies_total": sum(1 for s in specs if s.visibility == INTERNAL),
            "public_not_published": public_missing,
            "internal_not_accepted": internal_pending,
            "action": "POST to this endpoint to seed and publish all required policies.",
            "safety_contract": "This endpoint creates policy page records and publishes them. It does not create financial records, journals, receipts, or contracts.",
        })

    def post(self, request):
        from subscriptions.services.policy_coverage_catalog import INTERNAL, PUBLIC, get_policy_coverage_specs
        from subscriptions.services.policy_governance_service import hydrate_policy_governance_metadata

        seed_result = seed_default_policy_pages(performed_by=request.user)
        specs = get_policy_coverage_specs()
        published = accepted = skipped = 0
        errors: list[str] = []
        for spec in specs:
            policy = PolicyPage.objects.filter(slug=spec.slug).order_by("-version", "-id").first()
            if policy is None:
                skipped += 1
                continue
            if spec.visibility == PUBLIC:
                if policy.status == "PUBLISHED":
                    skipped += 1
                    continue
                try:
                    publish_policy_page(policy=policy, performed_by=request.user, review_now=True)
                    published += 1
                except Exception as exc:
                    errors.append(f"{spec.slug}: {exc}")
                    skipped += 1
            elif spec.visibility == INTERNAL:
                meta = hydrate_policy_governance_metadata(policy)
                if meta.internal_acceptance_at or policy.status in {"APPROVED", "PUBLISHED"}:
                    skipped += 1
                    continue
                try:
                    accept_internal_policy(policy, performed_by=request.user)
                    accepted += 1
                except Exception as exc:
                    errors.append(f"{spec.slug}: {exc}")
                    skipped += 1
        return Response({
            "status": "DONE" if not errors else "PARTIAL",
            "seed_result": seed_result,
            "public_published": published,
            "internal_accepted": accepted,
            "skipped": skipped,
            "errors": errors,
            "safety_contract": "Policy seed and publish complete. No financial records were created.",
        }, status=status.HTTP_200_OK)
