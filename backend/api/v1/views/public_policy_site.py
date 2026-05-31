from __future__ import annotations

from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.serializers.policy_site import (
    PolicyPagePublicListSerializer,
    PolicyPagePublicSerializer,
)
from subscriptions.services.business_compliance_public_summary_service import (
    get_public_business_compliance_summary,
)
from subscriptions.services.policy_governance_service import (
    get_public_published_policy,
    list_public_published_policies,
)


class PublicPolicyPageListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        rows = list_public_published_policies()
        serializer = PolicyPagePublicListSerializer(rows, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data})


class PublicPolicyPageDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug: str):
        policy = get_public_published_policy(slug.strip().lower())
        if policy is None:
            raise Http404("Published policy not found.")
        return Response({"policy": PolicyPagePublicSerializer(policy).data})


class PublicBusinessComplianceSummaryView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(get_public_business_compliance_summary())
