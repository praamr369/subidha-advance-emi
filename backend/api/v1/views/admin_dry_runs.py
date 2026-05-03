from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.dry_runs import DryRunRunRequestSerializer
from subscriptions.services.dry_run_control_service import (
    dry_run_check_catalog,
    list_dry_run_history,
    run_dry_run_checks,
)


class AdminDryRunOptionsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response({"checks": dry_run_check_catalog()})


class AdminDryRunRunView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = DryRunRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        options = dict(data.get("options") or {})
        scopes = data.get("scopes") or []
        if scopes:
            options["target_app_labels"] = tuple(scopes)
        payload = run_dry_run_checks(
            checks=list(data["checks"]),
            options=options,
            performed_by=request.user,
        )
        return Response(payload, status=status.HTTP_200_OK)


class AdminDryRunHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        limit = request.query_params.get("limit") or "30"
        try:
            lim = max(1, min(100, int(limit)))
        except ValueError:
            lim = 30
        return Response({"runs": list_dry_run_history(limit=lim)})
