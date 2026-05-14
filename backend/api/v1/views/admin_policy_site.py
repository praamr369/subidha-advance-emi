from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.policy_site import (
    BusinessComplianceDocumentAdminSerializer,
    PolicyPageAdminSerializer,
    PolicyPublishActionSerializer,
    PolicySeedActionSerializer,
)
from subscriptions.models_business_setup import BusinessComplianceDocument, PolicyPage
from subscriptions.services.policy_governance_service import (
    archive_policy_page,
    create_draft_from_policy,
    create_policy_page,
    get_latest_policy_by_slug,
    get_public_business_compliance_summary,
    publish_policy_page,
    seed_default_policy_pages,
    update_policy_page,
)


class _AdminPolicyBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


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
            policy = create_policy_page(
                payload=serializer.validated_data,
                performed_by=request.user,
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(PolicyPageAdminSerializer(policy).data, status=status.HTTP_201_CREATED)


class AdminPolicyPageDetailView(_AdminPolicyBase):
    def get(self, request, pk: int):
        policy = get_object_or_404(PolicyPage, pk=pk)
        return Response(PolicyPageAdminSerializer(policy).data)

    def patch(self, request, pk: int):
        policy = get_object_or_404(PolicyPage, pk=pk)
        serializer = PolicyPageAdminSerializer(instance=policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = update_policy_page(
                policy=policy,
                payload=serializer.validated_data,
                performed_by=request.user,
            )
        except ValueError as error:
            raise ValidationError({"detail": str(error)})

        return Response(PolicyPageAdminSerializer(updated).data)


class AdminPolicyPageBySlugView(_AdminPolicyBase):
    def get(self, request, slug: str):
        policy = get_latest_policy_by_slug(slug.strip().lower())
        if policy is None:
            return Response({"policy": None})
        return Response({"policy": PolicyPageAdminSerializer(policy).data})


class AdminPolicyPagePublishView(_AdminPolicyBase):
    def post(self, request, pk: int):
        policy = get_object_or_404(PolicyPage, pk=pk)
        serializer = PolicyPublishActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        published = publish_policy_page(
            policy=policy,
            performed_by=request.user,
            effective_date=serializer.validated_data.get("effective_date"),
            review_now=serializer.validated_data.get("review_now", True),
        )
        return Response(PolicyPageAdminSerializer(published).data)


class AdminPolicyPageArchiveView(_AdminPolicyBase):
    def post(self, request, pk: int):
        policy = get_object_or_404(PolicyPage, pk=pk)
        archived = archive_policy_page(policy=policy, performed_by=request.user)
        return Response(PolicyPageAdminSerializer(archived).data)


class AdminPolicyPageCreateDraftView(_AdminPolicyBase):
    def post(self, request, pk: int):
        policy = get_object_or_404(PolicyPage, pk=pk)
        draft = create_draft_from_policy(policy=policy, performed_by=request.user)
        return Response(PolicyPageAdminSerializer(draft).data, status=status.HTTP_201_CREATED)


class AdminPolicySeedDefaultsView(_AdminPolicyBase):
    def post(self, request):
        serializer = PolicySeedActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = seed_default_policy_pages(
            performed_by=request.user,
            overwrite_existing_drafts=serializer.validated_data.get(
                "overwrite_existing_drafts", False
            ),
        )
        return Response(result)


class AdminBusinessComplianceDocumentListCreateView(_AdminPolicyBase):
    def get(self, request):
        queryset = BusinessComplianceDocument.objects.all().order_by("-created_at", "-id")
        serializer = BusinessComplianceDocumentAdminSerializer(queryset, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data})

    def post(self, request):
        serializer = BusinessComplianceDocumentAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = serializer.save(uploaded_by=request.user)
        return Response(
            BusinessComplianceDocumentAdminSerializer(document).data,
            status=status.HTTP_201_CREATED,
        )


class AdminBusinessComplianceDocumentDetailView(_AdminPolicyBase):
    def get(self, request, pk: int):
        document = get_object_or_404(BusinessComplianceDocument, pk=pk)
        return Response(BusinessComplianceDocumentAdminSerializer(document).data)

    def patch(self, request, pk: int):
        document = get_object_or_404(BusinessComplianceDocument, pk=pk)
        serializer = BusinessComplianceDocumentAdminSerializer(
            instance=document,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        updated = serializer.save(reviewed_by=request.user)
        return Response(BusinessComplianceDocumentAdminSerializer(updated).data)


class AdminBusinessComplianceSummaryView(_AdminPolicyBase):
    def get(self, request):
        return Response(get_public_business_compliance_summary())
