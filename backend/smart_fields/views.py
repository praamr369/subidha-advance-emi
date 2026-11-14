from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin

from .serializers import SuggestionConfirmSerializer
from .services import suggestion_service


class SmartPincodeLookupView(APIView):
    """GET /api/v1/admin/smart/pincode/<pincode>/ -> location options."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pincode: str):
        return Response(suggestion_service.lookup_pincode(pincode))


class SmartHsnSuggestView(APIView):
    """GET /api/v1/admin/smart/hsn/suggest/?q=... -> ranked HSN suggestions."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        query = request.query_params.get("q", "")
        top_n = self._top_n(request)
        return Response({"query": query, "results": suggestion_service.suggest_hsn(query, top_n=top_n)})

    @staticmethod
    def _top_n(request) -> int:
        raw = request.query_params.get("top_n", "5")
        try:
            return max(1, min(int(raw), 20))
        except (TypeError, ValueError):
            return 5


class SmartSuggestView(APIView):
    """GET /api/v1/admin/smart/suggest/?field=<key>&q=... -> generic dispatcher."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        field_key = request.query_params.get("field", "")
        query = request.query_params.get("q", "")
        top_n = SmartHsnSuggestView._top_n(request)
        return Response(
            {
                "field_key": field_key,
                "query": query,
                "results": suggestion_service.suggest(field_key, query, top_n=top_n),
            }
        )


class SmartConfirmView(APIView):
    """POST /api/v1/admin/smart/confirm/ -> record a confirmed suggestion."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = SuggestionConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = suggestion_service.record_confirmation(
            field_key=data["field_key"],
            input_text=data.get("input", ""),
            value=data["value"],
            label=data.get("label", ""),
            gst_rate=data.get("gst_rate"),
        )
        return Response(result, status=status.HTTP_200_OK)
