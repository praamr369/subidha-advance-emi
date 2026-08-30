from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from api.v1.permissions import IsAdmin
from core.services.solopreneur_service import get_solopreneur_dashboard_kpis


class SolopreneurUniversalDashboardView(APIView):
    """
    Universal Control Center Dashboard for the Solopreneur Admin.
    Provides aggregated operational visibility across domains.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        data = get_solopreneur_dashboard_kpis()
        return Response(data)
