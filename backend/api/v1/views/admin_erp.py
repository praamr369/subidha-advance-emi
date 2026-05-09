from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.admin_erp_service import (
    build_admin_crm_workspace,
    build_admin_erp_summary,
    build_admin_global_search,
)


class _AdminErpBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminErpSummaryView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response(payload)


class AdminErpTodayWorkView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response(
            {
                "as_of": payload["as_of"],
                "results": payload["today_work"],
                "quick_actions": payload["quick_actions"],
            }
        )


class AdminCrmWorkspaceView(_AdminErpBase):
    def get(self, request):
        return Response(build_admin_crm_workspace())


class AdminSalesWorkspaceView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response({"as_of": payload["as_of"], **payload["sales_workspace"]})


class AdminProductOperationsWorkspaceView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response({"as_of": payload["as_of"], **payload["product_workspace"]})


class AdminInventoryWorkspaceView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response({"as_of": payload["as_of"], **payload["inventory_workspace"]})


class AdminFinanceWorkspaceView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response({"as_of": payload["as_of"], **payload["finance_workspace"]})


class AdminDeliveryWorkspaceView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response({"as_of": payload["as_of"], **payload["delivery_workspace"]})


class AdminPartnerOperationsWorkspaceView(_AdminErpBase):
    def get(self, request):
        payload = build_admin_erp_summary()
        return Response({"as_of": payload["as_of"], **payload["partner_workspace"]})


class AdminGlobalSearchView(_AdminErpBase):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        return Response(build_admin_global_search(query=query))
