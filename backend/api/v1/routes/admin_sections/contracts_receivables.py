from django.urls import include, path
from api.v1.views.admin_contracts import AdminLeaseContractCreateView
from api.v1.views.admin_contracts import AdminLeaseContractPdfView
from api.v1.views.admin_contracts import AdminRentContractCreateView
from api.v1.views.admin_contracts import AdminRentContractPdfView
from api.v1.views.admin_contracts import AdminReturnInspectionPdfView
from api.v1.views.admin_contracts import ContractActivateView
from api.v1.views.admin_contracts import ContractAmendmentApplyView
from api.v1.views.admin_contracts import ContractAmendmentApproveView
from api.v1.views.admin_contracts import ContractAmendmentListCreateView
from api.v1.views.admin_contracts import ContractAmendmentRejectView
from api.v1.views.admin_contracts import ContractApproveView
from api.v1.views.admin_contracts import ContractCancelView
from api.v1.views.admin_contracts import ContractCloseView
from api.v1.views.admin_contracts import ContractHandoverView
from api.v1.views.admin_contracts import ContractInitiateReturnView
from api.v1.views.admin_contracts import ContractPossessionView
from api.v1.views.admin_contracts import ContractReturnInspectionApproveView
from api.v1.views.admin_contracts import ContractReturnInspectionRecordView
from api.v1.views.admin_contracts import ContractReturnInspectionView
from api.v1.views.contract_references import AdminContractReferenceListView
from api.v1.views.contract_references import AdminContractReferenceResolveView
from api.v1.views.contract_references import AdminReceivablesSearchView
from api.v1.views.contract_references import AdminUnifiedReceivableCollectView
from api.v1.views.contract_references import AdminUnifiedReceivablePreviewView
from api.v1.views.contract_references import AdminUnifiedReceivableWorkbenchView
from api.v1.views.customer_intelligence import CustomerOperationalSummaryView
from api.v1.views.payables import AdminPayableActionView
from api.v1.views.payables import AdminPayableExecuteView
from api.v1.views.payables import AdminPayableFinanceAccountsView
from api.v1.views.payables import AdminUnifiedPayableView
from api.v1.views.username_change import AdminUserUsernameChangeView

urlpatterns = [
    path("users/<int:user_id>/username/", AdminUserUsernameChangeView.as_view()),
    path(
        "customers/<int:pk>/operational-summary/",
        CustomerOperationalSummaryView.as_view(),
        name="admin-customer-operational-summary",
    ),
    path("contracts/rent/", AdminRentContractCreateView.as_view()),
    path("contracts/lease/", AdminLeaseContractCreateView.as_view()),
    path("rent-contracts/<int:pk>/pdf/", AdminRentContractPdfView.as_view()),
    path("lease-contracts/<int:pk>/pdf/", AdminLeaseContractPdfView.as_view()),
    # Phase 3: contract lifecycle transitions
    path("contracts/<int:pk>/approve/", ContractApproveView.as_view()),
    path("contracts/<int:pk>/activate/", ContractActivateView.as_view()),
    path("contracts/<int:pk>/cancel/", ContractCancelView.as_view()),
    path("contracts/<int:pk>/close/", ContractCloseView.as_view()),
    # Phase 3: contract amendments
    path("contracts/<int:pk>/amendments/", ContractAmendmentListCreateView.as_view()),
    path("contracts/amendments/<int:amendment_id>/approve/", ContractAmendmentApproveView.as_view()),
    path("contracts/amendments/<int:amendment_id>/reject/", ContractAmendmentRejectView.as_view()),
    path("contracts/amendments/<int:amendment_id>/apply/", ContractAmendmentApplyView.as_view()),
    # Phase 3: product possession
    path("contracts/<int:pk>/possession/", ContractPossessionView.as_view()),
    path("contracts/<int:pk>/possession/handover/", ContractHandoverView.as_view()),
    path("contracts/<int:pk>/possession/return/", ContractInitiateReturnView.as_view()),
    # Phase 3: return inspection
    path("contracts/<int:pk>/return-inspection/", ContractReturnInspectionView.as_view()),
    path("contracts/<int:pk>/return-inspection/record/", ContractReturnInspectionRecordView.as_view()),
    path("contracts/<int:pk>/return-inspection/approve/", ContractReturnInspectionApproveView.as_view()),
    path("returns/<int:pk>/inspection-pdf/", AdminReturnInspectionPdfView.as_view()),
    path("contract-references/", AdminContractReferenceListView.as_view()),
    path("contract-references/<int:pk>/resolve/", AdminContractReferenceResolveView.as_view()),
    path("receivables/search/", AdminReceivablesSearchView.as_view()),
    path("receivables/preview/", AdminUnifiedReceivablePreviewView.as_view()),
    path("receivables/collect/", AdminUnifiedReceivableCollectView.as_view()),
    path("receivables/workbench/", AdminUnifiedReceivableWorkbenchView.as_view()),

    # Payables
    path("payables/", AdminUnifiedPayableView.as_view()),
    path("payables/action/", AdminPayableActionView.as_view()),
    path("payables/finance-accounts/", AdminPayableFinanceAccountsView.as_view()),
    path("payables/execute/", AdminPayableExecuteView.as_view()),
]
