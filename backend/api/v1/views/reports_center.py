from __future__ import annotations

from rest_framework import permissions, serializers, status
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.capabilities import user_has_capability
from api.v1.permissions import IsAdmin
from rest_framework.exceptions import PermissionDenied
from subscriptions.services.phase5_filter_service import SUPPORTED_FILTERS, parse_admin_report_filters
from subscriptions.services.reports_center_export_service import (
    build_reports_center_csv_response,
    build_reports_center_pdf_summary_response,
)
from subscriptions.services.reports_center_service import REPORT_KEYS, get_reports_center_catalog, run_report


class _ReportsExportCsvFormatRenderer(BaseRenderer):
    """
    Satisfies DRF content negotiation for ?format=csv.

    DRF's URL_FORMAT_OVERRIDE defaults to ``format``; without a renderer whose
    ``format`` is ``csv``, negotiation raises Http404 before the view runs.
    This view returns plain HttpResponse for exports, so ``render`` is unused.
    """

    media_type = "text/csv"
    format = "csv"
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return b""


class _ReportsExportPdfFormatRenderer(BaseRenderer):
    """Same as CSV but for ?format=pdf."""

    media_type = "application/pdf"
    format = "pdf"
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return b""


class AdminReportsCenterCatalogView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(get_reports_center_catalog())


class AdminReportsCenterReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, report_key: str):
        normalized = (report_key or "").strip().lower()
        if normalized not in REPORT_KEYS:
            return Response({"detail": "Unknown report."}, status=status.HTTP_404_NOT_FOUND)
        flt = parse_admin_report_filters(request.query_params, applicable_filters=SUPPORTED_FILTERS)
        try:
            payload = run_report(report_key=normalized, flt=flt)
        except ValueError:
            return Response({"detail": "Unknown report."}, status=status.HTTP_404_NOT_FOUND)
        return Response(payload)


class AdminReportsCenterExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    renderer_classes = [
        JSONRenderer,
        _ReportsExportCsvFormatRenderer,
        _ReportsExportPdfFormatRenderer,
    ]

    def get(self, request, report_key: str):
        if not user_has_capability(request.user, "reports.export"):
            raise PermissionDenied(detail="Capability 'reports.export' is required for this action.")
        normalized = (report_key or "").strip().lower()
        if normalized not in REPORT_KEYS:
            return Response({"detail": "Unknown report."}, status=status.HTTP_404_NOT_FOUND)
        qp = request.query_params.copy()
        fmt = (qp.pop("format", None) or "csv")
        if isinstance(fmt, list):
            fmt = fmt[0] if fmt else "csv"
        fmt = (fmt or "csv").strip().lower()
        if fmt not in {"csv", "pdf"}:
            raise serializers.ValidationError({"format": "Supported values: csv, pdf."})
        flt = parse_admin_report_filters(qp, applicable_filters=SUPPORTED_FILTERS)
        payload = run_report(report_key=normalized, flt=flt)
        columns = payload.get("columns") or []
        rows = payload.get("rows") or []
        summary = payload.get("summary") or []
        filters = payload.get("filters_applied") or {}
        title = payload.get("title") or normalized
        if fmt == "csv":
            return build_reports_center_csv_response(
                report_key=normalized,
                columns=columns,
                rows=rows,
                filters=filters,
                actor=request.user,
            )
        return build_reports_center_pdf_summary_response(
            report_key=normalized,
            title=title,
            summary=summary,
            columns=columns,
            rows=rows,
            filters=filters,
            actor=request.user,
        )
