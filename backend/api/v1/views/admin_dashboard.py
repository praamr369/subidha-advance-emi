from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from api.v1.permissions import IsAdmin
from api.v1.services.admin_dashboard_service import build_admin_dashboard


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
