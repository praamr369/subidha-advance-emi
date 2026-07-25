from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Q
from accounting.models import FinanceAccount
from accounting.services.unified_payable_service import (
    get_unified_payables,
    execute_unified_payable,
    execute_payable_action,
)

class AdminUnifiedPayableView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        payable_type = request.query_params.get("payable_type")
        search = request.query_params.get("search")
        status_category = request.query_params.get("status_category")
        party_type = request.query_params.get("party_type")
        party_id = request.query_params.get("party_id")
        data = get_unified_payables(
            payable_type=payable_type,
            search=search,
            status_category=status_category,
            party_type=party_type,
            party_id=party_id,
        )
        return Response(data)

class AdminPayableActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        payload = request.data
        try:
            result = execute_payable_action(
                payload=payload,
                executed_by=request.user
            )
            return Response(result)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": "An internal error occurred during payable action.", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AdminPayableFinanceAccountsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        accounts = FinanceAccount.objects.select_related("branch").filter(
            is_active=True,
            is_real_settlement_account=True,
            kind__in=["CASH", "BANK", "UPI"]
        )

        results = []
        for a in accounts:
            results.append({
                "id": a.id,
                "name": a.name,
                "kind": a.kind,
                "branch_id": a.branch_id if hasattr(a, 'branch_id') else None,
                "branch_name": a.branch.name if getattr(a, 'branch', None) else None,
            })
        return Response(results)

class AdminPayableExecuteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        payload = request.data
        try:
            result = execute_unified_payable(
                payload=payload,
                executed_by=request.user,
                idempotency_key=request.headers.get("Idempotency-Key"),
                fingerprint=request.headers.get("Idempotency-Fingerprint")
            )
            return Response(result)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": "An internal error occurred during payable execution.", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
