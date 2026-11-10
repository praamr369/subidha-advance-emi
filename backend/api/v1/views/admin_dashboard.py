from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from api.v1.permissions import IsAdmin
from api.v1.services.admin_dashboard_service import build_admin_dashboard
from api.v1.services.admin_dashboard_analytics_service import build_dashboard_business_analytics


class AdminDashboardView(APIView):
    """
    Enterprise Admin Dashboard

    Provides aggregated system intelligence:
    - Financial overview
    - EMI health
    - Subscription status
    - Risk engine metrics
    - Batch & draw statistics
    - System financial health
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        dashboard_data = build_admin_dashboard(actor_user=request.user)
        return Response(dashboard_data)


class AdminDashboardAnalyticsView(APIView):
    """
    Dedicated endpoint for Dashboard Business Analytics, mathematical metrics,
    and trend series (Sales, Inventory & Purchasing, Staff & Manufacturing).
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        analytics_data = build_dashboard_business_analytics()
        return Response(analytics_data)
