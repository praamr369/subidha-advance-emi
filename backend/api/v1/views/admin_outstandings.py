from __future__ import annotations

from django.http import HttpResponse
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from billing.services.outstanding_ledger_service import (
    build_outstanding_csv,
    build_outstanding_ledger,
    parse_outstanding_filters,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminOutstandingsView(_AdminBase):
    def get(self, request, *args, **kwargs):
        filters = parse_outstanding_filters(request.query_params)
        payload = build_outstanding_ledger(filters=filters)
        return Response(payload)


class AdminOutstandingsExportCsvView(_AdminBase):
    def get(self, request, *args, **kwargs):
        filters = parse_outstanding_filters(request.query_params)
        csv_text = build_outstanding_csv(filters=filters)
        response = HttpResponse(csv_text, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="admin-outstandings.csv"'
        return response
