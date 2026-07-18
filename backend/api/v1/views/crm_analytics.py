from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.crm_analytics_service import (
    get_funnel_analytics,
    get_product_performance,
    get_timeline_analytics,
    get_request_type_analytics,
    get_analytics_summary,
)


class CRMFunnelAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        if days < 1 or days > 365:
            days = 30

        analytics = get_funnel_analytics(days)
        return Response(analytics)


class CRMProductPerformanceView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        if days < 1 or days > 365:
            days = 30

        analytics = get_product_performance(days)
        return Response({'products': analytics, 'period_days': days})


class CRMTimelineAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        if days < 1 or days > 365:
            days = 30

        analytics = get_timeline_analytics(days)
        return Response(analytics)


class CRMRequestTypeAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        if days < 1 or days > 365:
            days = 30

        analytics = get_request_type_analytics(days)
        return Response({'by_type': analytics, 'period_days': days})


class CRMAnalyticsSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        if days < 1 or days > 365:
            days = 30

        analytics = get_analytics_summary(days)
        return Response(analytics)
