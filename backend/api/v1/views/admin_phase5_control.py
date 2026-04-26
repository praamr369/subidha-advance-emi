from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.phase5_control_center_service import (
    Phase5Filter,
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

    def _flt(self, request) -> Phase5Filter:
        return Phase5Filter.from_query_params(request.query_params)


class AdminAccountingControlCenterView(_AdminBase):
    def get(self, request):
        return Response(build_admin_accounting_control_center(flt=self._flt(request)))


class AdminAccountingChartSummaryView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_chart_summary(flt=self._flt(request)))


class AdminAccountingLedgerSummaryView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_ledger_summary(flt=self._flt(request)))


class AdminAccountingCashBankSummaryView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_cash_bank_summary(flt=self._flt(request)))


class AdminAccountingReceivablesView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_receivables(flt=self._flt(request)))


class AdminAccountingPayablesView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_payables(flt=self._flt(request)))


class AdminAccountingReconciliationControlView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_reconciliation_control(flt=self._flt(request)))


class AdminAccountingUnreconciledView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_unreconciled(flt=self._flt(request)))


class AdminAccountingWaiverLossView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_waiver_loss(flt=self._flt(request)))


class AdminAccountingDepositLiabilityView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_deposit_liability(flt=self._flt(request)))


class AdminAccountingRevenueBreakdownView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_revenue_breakdown(flt=self._flt(request)))


class AdminAccountingPaymentMethodSplitView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_payment_method_split(flt=self._flt(request)))


class AdminAccountingAuditTrailView(_AdminBase):
    def get(self, request):
        return Response(build_accounting_audit_trail(flt=self._flt(request)))


class AdminOperationsCommandCenterView(_AdminBase):
    def get(self, request):
        return Response(build_operations_command_center(flt=self._flt(request)))


class AdminOperationsAlertsView(_AdminBase):
    def get(self, request):
        return Response(build_operations_alerts(flt=self._flt(request)))


class AdminOperationsWorkQueueView(_AdminBase):
    def get(self, request):
        return Response(build_operations_work_queue(flt=self._flt(request)))


class AdminOperationsPendingApprovalsView(_AdminBase):
    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response(
            {
                "contracts_awaiting_approval": queue["contracts_awaiting_approval"],
                "contracts_awaiting_activation": queue["contracts_awaiting_activation"],
            }
        )


class AdminOperationsTodayView(_AdminBase):
    def get(self, request):
        return Response(build_operations_today(flt=self._flt(request)))


class AdminOperationsContractsView(_AdminBase):
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
    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response({"deliveries_pending": queue["deliveries_pending"]})


class AdminOperationsReturnsView(_AdminBase):
    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response(
            {
                "returns_due": queue["returns_due"],
                "return_inspections_pending": queue["return_inspections_pending"],
            }
        )


class AdminOperationsInventoryView(_AdminBase):
    def get(self, request):
        return Response(build_inventory_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminOperationsPartnersView(_AdminBase):
    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response({"partner_commission_pending": queue["partner_commission_pending"]})


class AdminOperationsCrmView(_AdminBase):
    def get(self, request):
        queue = build_operations_command_center(flt=self._flt(request))
        return Response({"kyc_pending": queue["kyc_pending"]})


class AdminReportsExecutiveSummaryView(_AdminBase):
    def get(self, request):
        return Response(build_executive_summary(flt=self._flt(request), actor_user=request.user))


class AdminReportsFinancePerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_finance_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsContractPerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_contract_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsAdvanceEmiPerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_advance_emi_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsRentLeasePerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_rent_lease_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsDirectSalePerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_direct_sale_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsInventoryPerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_inventory_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsDeliveryPerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_delivery_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsCustomerCrmPerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_customer_crm_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsPartnerPerformanceView(_AdminBase):
    def get(self, request):
        return Response(build_partner_performance_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsWaiverLossAnalysisView(_AdminBase):
    def get(self, request):
        return Response(build_waiver_loss_analysis_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsReconciliationAnalysisView(_AdminBase):
    def get(self, request):
        return Response(build_reconciliation_analysis_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsOverdueAgingView(_AdminBase):
    def get(self, request):
        return Response(build_overdue_aging_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsRevenueTrendView(_AdminBase):
    def get(self, request):
        return Response(build_revenue_trend_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsCollectionTrendView(_AdminBase):
    def get(self, request):
        return Response(build_collection_trend_report(flt=self._flt(request), actor_user=request.user))


class AdminReportsProductDemandAnalysisView(_AdminBase):
    def get(self, request):
        return Response(build_product_demand_analysis_report(flt=self._flt(request), actor_user=request.user))

