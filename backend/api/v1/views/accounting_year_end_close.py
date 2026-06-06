from __future__ import annotations

from rest_framework import permissions, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.year_end_close_service import YearEndCloseCommand, build_year_end_close_readiness, execute_year_end_close


class YearEndActionSerializer(serializers.Serializer):
    financial_year = serializers.CharField(required=False, allow_blank=True)
    confirmation_text = serializers.CharField()
    acknowledge_warnings = serializers.BooleanField(required=False, default=False)


class AccountingYearEndReadinessView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        financial_year = (request.query_params.get("financial_year") or "").strip() or None
        return Response(build_year_end_close_readiness(financial_year))


class AccountingYearEndCloseView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = YearEndActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        command = YearEndCloseCommand(
            financial_year=serializer.validated_data.get("financial_year") or None,
            confirmation_text=serializer.validated_data["confirmation_text"],
            acknowledge_warnings=serializer.validated_data.get("acknowledge_warnings", False),
        )
        try:
            result = execute_year_end_close(command, performed_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(result, status=status.HTTP_200_OK)
