from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


class AdminBadDebtListView(APIView):
    """GET /admin/finance/bad-debt/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from payments.services.bad_debt_service import list_bad_debt_cases

        include_written_off = request.query_params.get("include_written_off", "").lower() == "true"
        results = list_bad_debt_cases(include_written_off=include_written_off)
        return Response({"count": len(results), "results": results})


class AdminBadDebtAgingReportView(APIView):
    """GET /admin/finance/bad-debt/aging-report/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from payments.services.bad_debt_service import aging_report

        return Response(aging_report())


class AdminBadDebtClassifyNpaView(APIView):
    """POST /admin/finance/bad-debt/{id}/classify-npa/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, *args, **kwargs):
        from payments.services.bad_debt_service import classify_npa

        try:
            result = classify_npa(recovery_case_id=int(pk), actor=request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class AdminBadDebtRecordNoticeView(APIView):
    """POST /admin/finance/bad-debt/{id}/legal-notice/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, *args, **kwargs):
        from payments.services.bad_debt_service import record_legal_notice

        notice_date = request.data.get("notice_date")
        notice_ref = (request.data.get("notice_ref") or "").strip()
        if not notice_date or not notice_ref:
            return Response({"detail": "'notice_date' and 'notice_ref' are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = record_legal_notice(
                recovery_case_id=int(pk),
                notice_date=notice_date,
                notice_ref=notice_ref,
                actor=request.user,
            )
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class AdminBadDebtWriteOffView(APIView):
    """POST /admin/finance/bad-debt/{id}/write-off/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, *args, **kwargs):
        from payments.services.bad_debt_service import write_off

        try:
            result = write_off(recovery_case_id=int(pk), actor=request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
