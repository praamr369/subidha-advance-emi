from __future__ import annotations

from rest_framework import serializers
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.capabilities import require_capability
from api.v1.permissions import IsAdmin
from subscriptions.services.phase5_export_service import build_csv_export_response
from subscriptions.services.phase5_filter_service import parse_admin_report_filters
from subscriptions.services.phase5_reconciliation_service import (
    attach_reference,
    mark_reconciled,
    mark_unreconciled,
)
from subscriptions.services.phase5_source_map_service import get_phase5_source_map
from subscriptions.services.phase5_control_center_service import (
    build_accounting_audit_trail,
    build_accounting_cash_bank_summary,
    build_accounting_chart_summary,
    build_accounting_deposit_liability,
    build_accounting_ledger_summary,
    build_accounting_payables,
    build_accounting_payment_method_split,
    build_accounting_receivables,
    build_accounting_reconciliation_control,
    build_accounting_revenue_breakdown,
    build_accounting_unreconciled,
    build_accounting_waiver_loss,
    build_admin_accounting_control_center,
    build_collection_trend_report,
    build_contract_performance_report,
    build_customer_crm_performance_report,
    build_delivery_performance_report,
    build_direct_sale_performance_report,
    build_executive_summary,
    build_finance_performance_report,
    build_inventory_performance_report,
    build_operations_alerts,
    build_operations_command_center,
    build_operations_today,
    build_operations_work_queue,
    build_overdue_aging_report,
    build_partner_performance_report,
    build_product_demand_analysis_report,
    build_reconciliation_analysis_report,
    build_rent_lease_performance_report,
    build_revenue_trend_report,
    build_waiver_loss_analysis_report,
    build_advance_emi_performance_report,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    applicable_filters: set[str] = set()

    def _flt(self, request):
        return parse_admin_report_filters(
            request.query_params,
            applicable_filters=self.applicable_filters,
        )


class AdminAccountingControlCenterView(_AdminBase):
    applicable_filters = {
        "date_from",
        "date_to",
        "contract_type",
        "payment_method",
        "status",
        "partner_id",
        "product_id",
        "customer_id",
        "branch_id",
        "overdue_only",
        "unreconciled_only",
    }

    def get(self, request):
        flt = self._flt(request)
        payload = build_admin_accounting_control_center(flt=flt)
        payload["meta"] = {"ignored_filters": flt.ignored_filters}
        return Response(payload)


class AdminAccountingChartSummaryView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "branch_id"}

    def get(self, request):
        flt = self._flt(request)
        payload = build_accounting_chart_summary(flt=flt)
        payload["meta"] = {"ignored_filters": flt.ignored_filters}
        return Response(payload)


class AdminAccountingLedgerSummaryView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "payment_method", "status", "unreconciled_only", "partner_id", "customer_id"}

    def get(self, request):
        flt = self._flt(request)
        payload = build_accounting_ledger_summary(flt=flt)
        payload["meta"] = {"ignored_filters": flt.ignored_filters}
        return Response(payload)


class AdminAccountingCashBankSummaryView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "payment_method", "contract_type", "partner_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_accounting_cash_bank_summary(flt=self._flt(request)))


class AdminAccountingReceivablesView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "status", "partner_id", "product_id", "customer_id", "branch_id", "overdue_only"}

    def get(self, request):
        return Response(build_accounting_receivables(flt=self._flt(request)))


class AdminAccountingPayablesView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "branch_id"}

    def get(self, request):
        return Response(build_accounting_payables(flt=self._flt(request)))


class AdminAccountingReconciliationControlView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "payment_method", "status", "partner_id", "customer_id", "branch_id", "unreconciled_only"}

    def get(self, request):
        return Response(build_accounting_reconciliation_control(flt=self._flt(request)))


class AdminAccountingUnreconciledView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "payment_method", "status", "partner_id", "customer_id", "branch_id", "unreconciled_only"}

    def get(self, request):
        return Response(build_accounting_unreconciled(flt=self._flt(request)))


class AdminAccountingWaiverLossView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_accounting_waiver_loss(flt=self._flt(request)))


class AdminAccountingDepositLiabilityView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_accounting_deposit_liability(flt=self._flt(request)))


class AdminAccountingRevenueBreakdownView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "payment_method", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_accounting_revenue_breakdown(flt=self._flt(request)))


class AdminAccountingPaymentMethodSplitView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "payment_method", "partner_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_accounting_payment_method_split(flt=self._flt(request)))


class AdminAccountingAuditTrailView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status"}

    def get(self, request):
        return Response(build_accounting_audit_trail(flt=self._flt(request)))


class AdminOperationsCommandCenterView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "status", "partner_id", "product_id", "customer_id", "branch_id", "overdue_only", "unreconciled_only"}

    def get(self, request):
        return Response(build_operations_command_center(flt=self._flt(request)))


class AdminOperationsAlertsView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "status", "partner_id", "product_id", "customer_id", "branch_id", "overdue_only", "unreconciled_only"}

    def get(self, request):
        return Response(build_operations_alerts(flt=self._flt(request)))


class AdminOperationsWorkQueueView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "status", "partner_id", "product_id", "customer_id", "branch_id", "overdue_only", "unreconciled_only"}

    def get(self, request):
        return Response(build_operations_work_queue(flt=self._flt(request)))


class AdminOperationsPendingApprovalsView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "branch_id"}

    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response(
            {
                "contracts_awaiting_approval": queue["contracts_awaiting_approval"],
                "contracts_awaiting_activation": queue["contracts_awaiting_activation"],
            }
        )


class AdminOperationsTodayView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "payment_method", "branch_id"}

    def get(self, request):
        return Response(build_operations_today(flt=self._flt(request)))


class AdminOperationsContractsView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "status", "partner_id", "product_id", "customer_id", "branch_id", "overdue_only"}

    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response(
            {
                "contracts_awaiting_approval": queue["contracts_awaiting_approval"],
                "contracts_awaiting_activation": queue["contracts_awaiting_activation"],
                "overdue_dues": queue["overdue_dues"],
            }
        )


class AdminOperationsDeliveriesView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response({"deliveries_pending": queue["deliveries_pending"]})


class AdminOperationsReturnsView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response(
            {
                "returns_due": queue["returns_due"],
                "return_inspections_pending": queue["return_inspections_pending"],
            }
        )


class AdminOperationsInventoryView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "product_id", "category_id", "branch_id", "status"}

    def get(self, request):
        return Response(build_inventory_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminOperationsPartnersView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "partner_id", "status"}

    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response({"partner_commission_pending": queue["partner_commission_pending"]})


class AdminOperationsCrmView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "customer_id", "partner_id"}

    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response({"kyc_pending": queue["kyc_pending"]})


class AdminReportsExecutiveSummaryView(_AdminBase):
    applicable_filters = {
        "date_from", "date_to", "contract_type", "payment_method", "status", "partner_id", "product_id", "category_id",
        "customer_id", "branch_id", "overdue_only", "unreconciled_only",
    }

    def get(self, request):
        return Response(build_executive_summary(flt=self._flt(request), actor_user=request.user))


class AdminReportsFinancePerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "payment_method", "status", "partner_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_finance_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsContractPerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_contract_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsAdvanceEmiPerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_advance_emi_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsRentLeasePerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_rent_lease_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsDirectSalePerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "payment_method", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_direct_sale_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsInventoryPerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "product_id", "category_id", "status", "branch_id"}

    def get(self, request):
        return Response(build_inventory_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsDeliveryPerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_delivery_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsCustomerCrmPerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "partner_id", "customer_id"}

    def get(self, request):
        return Response(build_customer_crm_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsPartnerPerformanceView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_partner_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsWaiverLossAnalysisView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_waiver_loss_analysis_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsReconciliationAnalysisView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "payment_method", "status", "partner_id", "customer_id", "branch_id", "unreconciled_only"}

    def get(self, request):
        return Response(build_reconciliation_analysis_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsOverdueAgingView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "status", "partner_id", "product_id", "customer_id", "branch_id", "overdue_only"}

    def get(self, request):
        return Response(build_overdue_aging_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsRevenueTrendView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "payment_method", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_revenue_trend_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsCollectionTrendView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "payment_method", "status", "partner_id", "product_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_collection_trend_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsProductDemandAnalysisView(_AdminBase):
    applicable_filters = {"date_from", "date_to", "contract_type", "partner_id", "product_id", "category_id", "customer_id", "branch_id"}

    def get(self, request):
        return Response(build_product_demand_analysis_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsSourceMapView(_AdminBase):
    def get(self, request):
        return Response(get_phase5_source_map())


class AdminReportExportView(_AdminBase):
    applicable_filters = {
        "date_from", "date_to", "contract_type", "payment_method", "status", "partner_id", "product_id", "category_id",
        "customer_id", "branch_id", "overdue_only", "unreconciled_only",
    }

    @require_capability("reports.export")
    def get(self, request):
        export_type = (request.query_params.get("type") or "").strip().lower()
        mutable = request.query_params.copy()
        if "type" in mutable:
            mutable.pop("type")
        flt = parse_admin_report_filters(mutable, applicable_filters=self.applicable_filters)
        if not export_type:
            raise serializers.ValidationError({"type": "Export type is required."})
        if export_type == "finance":
            payload = build_finance_performance_report(flt=flt, actor_user=request.user)
        elif export_type == "collections":
            payload = build_collection_trend_report(flt=flt, actor_user=request.user)
        elif export_type == "overdue":
            payload = build_overdue_aging_report(flt=flt, actor_user=request.user)
        elif export_type == "reconciliation":
            payload = build_reconciliation_analysis_report(flt=flt, actor_user=request.user)
        elif export_type == "inventory":
            payload = build_inventory_performance_report(flt=flt, actor_user=request.user)
        elif export_type == "delivery":
            payload = build_delivery_performance_report(flt=flt, actor_user=request.user)
        elif export_type == "partners":
            payload = build_partner_performance_report(flt=flt, actor_user=request.user)
        elif export_type == "waiver_loss":
            payload = build_waiver_loss_analysis_report(flt=flt, actor_user=request.user)
        else:
            raise serializers.ValidationError({"type": "Unsupported export type."})
        rows = []
        labels = payload.get("labels") or []
        series = payload.get("series") or []
        for idx, label in enumerate(labels):
            row = {"label": label}
            for item in series:
                data = item.get("data") or []
                row[item.get("name") or "series"] = data[idx] if idx < len(data) else ""
            rows.append(row)
        return build_csv_export_response(
            export_type=export_type,
            rows=rows,
            filters=flt.payload(),
            actor=request.user,
        )


class AdminAccountingReconciliationMarkReconciledView(_AdminBase):
    def post(self, request, pk):
        reason = (request.data.get("reason") or "").strip()
        return Response(mark_reconciled(reconciliation_id=pk, performed_by=request.user, reason=reason))


class AdminAccountingReconciliationMarkUnreconciledView(_AdminBase):
    def post(self, request, pk):
        reason = (request.data.get("reason") or "").strip()
        return Response(mark_unreconciled(reconciliation_id=pk, performed_by=request.user, reason=reason))


class AdminAccountingReconciliationAttachReferenceView(_AdminBase):
    def post(self, request, pk):
        reason = (request.data.get("reason") or "").strip()
        reference = (request.data.get("reference") or "").strip()
        return Response(attach_reference(reconciliation_id=pk, performed_by=request.user, reason=reason, reference=reference))

