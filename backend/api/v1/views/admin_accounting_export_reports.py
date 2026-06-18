"""
P4E — Accounting Export Reports admin API views.

Admin-only endpoints. All views are read-only.
No financial records are created or mutated by any view in this module.
"""
from __future__ import annotations

import csv
import io
from datetime import date

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


def _parse_common_params(
    request: Request,
) -> tuple[int | None, int | None, date | None, str]:
    year_str = request.query_params.get("year")
    month_str = request.query_params.get("month")
    as_of_str = request.query_params.get("as_of")
    # Use "export_format" to avoid conflicting with DRF's URL_FORMAT_OVERRIDE
    # which intercepts "format" before the view runs and raises NotAcceptable.
    fmt = (request.query_params.get("export_format") or "json").lower()

    year: int | None = None
    month: int | None = None
    as_of: date | None = None

    if year_str:
        try:
            year = int(year_str)
        except (TypeError, ValueError):
            raise ValueError("year must be an integer.")
        if year < 2000:
            raise ValueError("year must be >= 2000.")

    if month_str:
        try:
            month = int(month_str)
        except (TypeError, ValueError):
            raise ValueError("month must be an integer.")
        if not (1 <= month <= 12):
            raise ValueError("month must be between 1 and 12.")

    if as_of_str:
        try:
            as_of = date.fromisoformat(as_of_str)
        except ValueError:
            raise ValueError(f"Invalid as_of date: {as_of_str!r}. Expected YYYY-MM-DD.")

    if fmt not in ("json", "csv"):
        raise ValueError(f"Unsupported format {fmt!r}. Supported: json, csv.")

    return year, month, as_of, fmt


def _parse_limit(request: Request, default: int = 500, max_value: int = 2000) -> int:
    limit_str = request.query_params.get("limit")
    if not limit_str:
        return default
    try:
        val = int(limit_str)
    except (TypeError, ValueError):
        raise ValueError("limit must be an integer.")
    if val < 1:
        raise ValueError("limit must be >= 1.")
    return min(val, max_value)


def _csv_response(payload: dict, filename: str) -> HttpResponse:
    columns = payload.get("columns", [])
    rows = payload.get("rows", [])
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({col: row.get(col, "") for col in columns})
    response = HttpResponse(buf.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


class AdminAccountingExportIndexView(APIView):
    """
    GET /api/v1/admin/accounting/exports/

    Returns an index of all available P4E accounting export reports.
    Query params: year, month, as_of, export_format=json|csv
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response | HttpResponse:
        try:
            year, month, as_of, fmt = _parse_common_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from accounting.services.accounting_export_service import build_accounting_export_index

        payload = build_accounting_export_index(year=year, month=month, as_of=as_of)
        if fmt == "csv":
            return HttpResponse(
                "report_key,title,description,endpoint,formats\n"
                + "\n".join(
                    f"{r['key']},{r['title']},{r['description']},{r['endpoint']},{','.join(r['formats'])}"
                    for r in payload.get("reports", [])
                ),
                content_type="text/csv",
                headers={"Content-Disposition": 'attachment; filename="accounting-export-index.csv"'},
            )
        return Response(payload, status=status.HTTP_200_OK)


class AdminAccountingTrialBalanceExportView(APIView):
    """
    GET /api/v1/admin/accounting/exports/trial-balance/

    Exports trial balance using P4B source. Read-only.
    Query params: year, month, as_of, export_format=json|csv
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response | HttpResponse:
        try:
            year, month, as_of, fmt = _parse_common_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from accounting.services.accounting_export_service import build_trial_balance_export

        payload = build_trial_balance_export(year=year, month=month, as_of=as_of)
        if fmt == "csv":
            period = payload.get("period", {})
            fname = f"trial-balance-{period.get('year', 'xx')}-{period.get('month', 'xx'):02d}.csv"
            return _csv_response(payload, fname)
        return Response(payload, status=status.HTTP_200_OK)


class AdminAccountingJournalExportView(APIView):
    """
    GET /api/v1/admin/accounting/exports/journals/

    Exports journal entry lines. Posted only by default; voided excluded.
    Query params: year, month, as_of, export_format=json|csv,
                  include_draft=true|false, limit
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response | HttpResponse:
        try:
            year, month, as_of, fmt = _parse_common_params(request)
            limit = _parse_limit(request, default=500, max_value=2000)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        include_draft_str = (request.query_params.get("include_draft") or "false").lower()
        include_draft = include_draft_str in ("true", "1", "yes")

        from accounting.services.accounting_export_service import build_journal_export

        payload = build_journal_export(
            year=year,
            month=month,
            as_of=as_of,
            include_draft=include_draft,
            limit=limit,
        )
        if fmt == "csv":
            period = payload.get("period", {})
            fname = f"journals-{period.get('year', 'xx')}-{period.get('month', 'xx'):02d}.csv"
            return _csv_response(payload, fname)
        return Response(payload, status=status.HTTP_200_OK)


class AdminAccountingLedgerExportView(APIView):
    """
    GET /api/v1/admin/accounting/exports/ledgers/

    Exports account-level ledger summary. Opening balance deferred. Read-only.
    Query params: year, month, as_of, export_format=json|csv
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response | HttpResponse:
        try:
            year, month, as_of, fmt = _parse_common_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from accounting.services.accounting_export_service import build_ledger_export

        payload = build_ledger_export(year=year, month=month, as_of=as_of)
        if fmt == "csv":
            period = payload.get("period", {})
            fname = f"ledger-{period.get('year', 'xx')}-{period.get('month', 'xx'):02d}.csv"
            return _csv_response(payload, fname)
        return Response(payload, status=status.HTTP_200_OK)


class AdminAccountingReceivablesExportView(APIView):
    """
    GET /api/v1/admin/accounting/exports/receivables/

    Exports outstanding receivables. No customer KYC/phone/address data. Read-only.
    Query params: year, month, as_of, export_format=json|csv
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response | HttpResponse:
        try:
            year, month, as_of, fmt = _parse_common_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from accounting.services.accounting_export_service import build_receivables_export

        payload = build_receivables_export(year=year, month=month, as_of=as_of)
        if fmt == "csv":
            period = payload.get("period", {})
            fname = f"receivables-{period.get('year', 'xx')}-{period.get('month', 'xx'):02d}.csv"
            return _csv_response(payload, fname)
        return Response(payload, status=status.HTTP_200_OK)


class AdminAccountingLiabilityExportView(APIView):
    """
    GET /api/v1/admin/accounting/exports/liabilities/

    Exports liability posture using P4C source. Read-only.
    Query params: year, month, as_of, export_format=json|csv
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response | HttpResponse:
        try:
            year, month, as_of, fmt = _parse_common_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from accounting.services.accounting_export_service import build_liability_export

        payload = build_liability_export(year=year, month=month, as_of=as_of)
        if fmt == "csv":
            period = payload.get("period", {})
            fname = f"liabilities-{period.get('year', 'xx')}-{period.get('month', 'xx'):02d}.csv"
            return _csv_response(payload, fname)
        return Response(payload, status=status.HTTP_200_OK)


class AdminAccountingBridgeAuditExportView(APIView):
    """
    GET /api/v1/admin/accounting/exports/bridge-audit/

    Exports AccountingBridgePosting rows for audit. No postings created. Read-only.
    Query params: year, month, as_of, export_format=json|csv, limit
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response | HttpResponse:
        try:
            year, month, as_of, fmt = _parse_common_params(request)
            limit = _parse_limit(request, default=1000, max_value=5000)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from accounting.services.accounting_export_service import build_bridge_audit_export

        payload = build_bridge_audit_export(
            year=year, month=month, as_of=as_of, limit=limit
        )
        if fmt == "csv":
            period = payload.get("period", {})
            fname = f"bridge-audit-{period.get('year', 'xx')}-{period.get('month', 'xx'):02d}.csv"
            return _csv_response(payload, fname)
        return Response(payload, status=status.HTTP_200_OK)
