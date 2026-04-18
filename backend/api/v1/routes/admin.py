from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.admin_business_setup import (
    AdminBusinessProfileView,
    BranchAdminViewSet,
    BusinessSetupChecklistView,
    BusinessSetupResetPreviewView,
    CashDeskAdminViewSet,
    ChartAccountAdminViewSet,
    FinanceAccountAdminViewSet,
    StaffOperationalAssignmentAdminViewSet,
)
from api.v1.views.admin_commissions import (
    AdminCommissionBulkSettleView,
    AdminCommissionListView,
    AdminCommissionReconciliationView,
    AdminCommissionSettleView,
    AdminCommissionStatementExportView,
    AdminCommissionSummaryView,
)
from api.v1.views.admin_dashboard import AdminDashboardView
from api.v1.views.admin_deliveries import (
    AdminDeliveryCancelView,
    AdminDeliveryDetailView,
    AdminDeliveryListCreateView,
    AdminDeliveryMarkDeliveredView,
    AdminDeliveryMarkFailedView,
    AdminDeliveryMarkReturnedView,
    AdminDeliveryRequestReturnView,
    AdminDeliverySummaryView,
    AdminDeliveryTransitionView,
)
from api.v1.views.admin_leads import (
    AdminLeadAssignView,
    AdminLeadConversionCompleteView,
    AdminLeadDetailView,
    AdminLeadListView,
    AdminLeadNoteUpdateView,
    AdminLeadStatusUpdateView,
)
from api.v1.views.views.audit_views import (
    AuditLogListView,
    AuditLogDetailView,
    AuditObjectTimelineView,
    financial_audit_report,
)
from api.v1.views.admin_internal_users import (
    AdminInternalUserActivateView,
    AdminInternalUserAuditView,
    AdminInternalUserCreateView,
    AdminInternalUserDeactivateView,
    AdminInternalUserDetailView,
    AdminInternalUserListView,
    AdminInternalUserPasswordResetView,
)
from api.v1.views.admin_payout_batches import (
    AdminPayoutBatchCancelView,
    AdminPayoutBatchCreateView,
    AdminPayoutBatchDetailView,
    AdminPayoutBatchExportView,
    AdminPayoutBatchFinalizeView,
    AdminPayoutBatchListView,
    AdminPayoutBatchPreviewView,
)
from api.v1.views.admin_resources import (
    BatchAdminViewSet,
    CustomerAdminViewSet,
    EmiAdminViewSet,
    LuckyDrawAdminViewSet,
    LuckyIdAdminViewSet,
    PartnerAdminListViewSet,
    PaymentAdminViewSet,
    ProductAdminViewSet,
)
from api.v1.views.paginated_registers import PaginatedSubscriptionAdminViewSet
from api.v1.views.admin_reconciliation import (
    PaymentReconciliationDetailView,
    PaymentReconciliationFlagView,
    PaymentReconciliationListView,
    PaymentReconciliationLockView,
    PaymentReconciliationNoteView,
    PaymentReconciliationUnlockView,
)
from api.v1.views.admin_partner_collection_requests import (
    AdminPartnerCollectionRequestApproveView,
    AdminPartnerCollectionRequestListView,
    AdminPartnerCollectionRequestRejectView,
)
from api.v1.views.admin_support_requests import (
    AdminSupportRequestAssignView,
    AdminSupportRequestDetailView,
    AdminSupportRequestListView,
    AdminSupportRequestNoteUpdateView,
    AdminSupportRequestResolveView,
    AdminSupportRequestStatusUpdateView,
)
from api.v1.views.subscription_requests import (
    AdminSubscriptionRequestApproveView,
    AdminSubscriptionRequestDetailView,
    AdminSubscriptionRequestListView,
    AdminSubscriptionRequestOptionsView,
    AdminSubscriptionRequestRejectView,
)

router = DefaultRouter()
router.register(r"batches", BatchAdminViewSet, basename="admin-batches")
router.register(r"branches", BranchAdminViewSet, basename="admin-branches")
router.register(r"cash-desks", CashDeskAdminViewSet, basename="admin-cash-desks")
router.register(r"chart-accounts", ChartAccountAdminViewSet, basename="admin-chart-accounts")
router.register(r"customers", CustomerAdminViewSet, basename="admin-customers")
router.register(r"emis", EmiAdminViewSet, basename="admin-emis")
router.register(r"finance-accounts", FinanceAccountAdminViewSet, basename="admin-finance-accounts")
router.register(r"lucky-draws", LuckyDrawAdminViewSet, basename="admin-lucky-draws")
router.register(r"lucky-ids", LuckyIdAdminViewSet, basename="admin-lucky-ids")
router.register(r"partners", PartnerAdminListViewSet, basename="admin-partners")
router.register(r"payments", PaymentAdminViewSet, basename="admin-payments")
router.register(r"products", ProductAdminViewSet, basename="admin-products")
router.register(r"staff-operational-assignments", StaffOperationalAssignmentAdminViewSet, basename="admin-staff-operational-assignments")
router.register(r"subscriptions", PaginatedSubscriptionAdminViewSet, basename="admin-subscriptions")

urlpatterns = [
    path("", include(router.urls)),
    path("business-profile/", AdminBusinessProfileView.as_view()),
    path("business-setup/checklist/", BusinessSetupChecklistView.as_view()),
    path("business-setup/reset-preview/", BusinessSetupResetPreviewView.as_view()),
    path("dashboard/", AdminDashboardView.as_view()),
    path("deliveries/", AdminDeliveryListCreateView.as_view()),
    path("deliveries/summary/", AdminDeliverySummaryView.as_view()),
    path("deliveries/<int:pk>/", AdminDeliveryDetailView.as_view()),
    path("deliveries/<int:pk>/transition/", AdminDeliveryTransitionView.as_view()),
    path("deliveries/<int:pk>/mark-delivered/", AdminDeliveryMarkDeliveredView.as_view()),
    path("deliveries/<int:pk>/mark-failed/", AdminDeliveryMarkFailedView.as_view()),
    path("deliveries/<int:pk>/cancel/", AdminDeliveryCancelView.as_view()),
    path("deliveries/<int:pk>/request-return/", AdminDeliveryRequestReturnView.as_view()),
    path("deliveries/<int:pk>/mark-returned/", AdminDeliveryMarkReturnedView.as_view()),
    path("leads/", AdminLeadListView.as_view()),
    path("leads/<int:pk>/", AdminLeadDetailView.as_view()),
    path("leads/<int:pk>/status/", AdminLeadStatusUpdateView.as_view()),
    path("leads/<int:pk>/assign/", AdminLeadAssignView.as_view()),
    path("leads/<int:pk>/notes/", AdminLeadNoteUpdateView.as_view()),
    path("leads/<int:pk>/convert/", AdminLeadConversionCompleteView.as_view()),
    path("subscription-request-options/", AdminSubscriptionRequestOptionsView.as_view()),
    path("subscription-requests/", AdminSubscriptionRequestListView.as_view()),
    path("subscription-requests/<int:pk>/", AdminSubscriptionRequestDetailView.as_view()),
    path("subscription-requests/<int:pk>/approve/", AdminSubscriptionRequestApproveView.as_view()),
    path("subscription-requests/<int:pk>/reject/", AdminSubscriptionRequestRejectView.as_view()),
    path("support-requests/", AdminSupportRequestListView.as_view()),
    path("support-requests/<int:pk>/", AdminSupportRequestDetailView.as_view()),
    path("support-requests/<int:pk>/status/", AdminSupportRequestStatusUpdateView.as_view()),
    path("support-requests/<int:pk>/assign/", AdminSupportRequestAssignView.as_view()),
    path("support-requests/<int:pk>/notes/", AdminSupportRequestNoteUpdateView.as_view()),
    path("support-requests/<int:pk>/resolve/", AdminSupportRequestResolveView.as_view()),
    path("internal-users/", AdminInternalUserListView.as_view()),
    path("internal-users/create/", AdminInternalUserCreateView.as_view()),
    path("internal-users/<int:pk>/", AdminInternalUserDetailView.as_view()),
    path("internal-users/<int:pk>/activate/", AdminInternalUserActivateView.as_view()),
    path("internal-users/<int:pk>/deactivate/", AdminInternalUserDeactivateView.as_view()),
    path("internal-users/<int:pk>/reset-password/", AdminInternalUserPasswordResetView.as_view()),
    path("internal-users/<int:pk>/audit/", AdminInternalUserAuditView.as_view()),
    path("", include("api.v1.routes.admin_password_reset_requests")),
    path("commissions/<int:pk>/settle/", AdminCommissionSettleView.as_view()),
    path("commissions/", AdminCommissionListView.as_view()),
    path("commissions/summary/", AdminCommissionSummaryView.as_view()),
    path("commissions/reconciliation/", AdminCommissionReconciliationView.as_view()),
    path("commissions/statements/export/", AdminCommissionStatementExportView.as_view()),
    path("commissions/bulk-settle/", AdminCommissionBulkSettleView.as_view()),
    path("commission-payout-batches/", AdminPayoutBatchCreateView.as_view()),
    path("commission-payout-batches/list/", AdminPayoutBatchListView.as_view()),
    path("commission-payout-batches/preview/", AdminPayoutBatchPreviewView.as_view()),
    path("commission-payout-batches/<int:pk>/", AdminPayoutBatchDetailView.as_view()),
    path("commission-payout-batches/<int:pk>/export/", AdminPayoutBatchExportView.as_view()),
    path("commission-payout-batches/<int:pk>/finalize/", AdminPayoutBatchFinalizeView.as_view()),
    path("commission-payout-batches/<int:pk>/cancel/", AdminPayoutBatchCancelView.as_view()),
    path("reconciliations/", PaymentReconciliationListView.as_view()),
    path("reconciliations/<int:pk>/", PaymentReconciliationDetailView.as_view()),
    path("reconciliations/<int:pk>/flag/", PaymentReconciliationFlagView.as_view()),
    path("reconciliations/<int:pk>/note/", PaymentReconciliationNoteView.as_view()),
    path("reconciliations/<int:pk>/lock/", PaymentReconciliationLockView.as_view()),
    path("reconciliations/<int:pk>/unlock/", PaymentReconciliationUnlockView.as_view()),
    path("audit-logs/", AuditLogListView.as_view(), name="admin-audit-log-list"),
    path("audit-logs/<int:pk>/", AuditLogDetailView.as_view(), name="admin-audit-log-detail"),
    path("audit-logs/timeline/<str:model_name>/<str:object_id>/", AuditObjectTimelineView.as_view(), name="admin-audit-object-timeline"),
    path("audit-logs/financial-report/", financial_audit_report, name="admin-financial-audit-report"),
    path("collection-requests/", AdminPartnerCollectionRequestListView.as_view()),
    path("collection-requests/<int:pk>/approve/", AdminPartnerCollectionRequestApproveView.as_view()),
    path("collection-requests/<int:pk>/reject/", AdminPartnerCollectionRequestRejectView.as_view()),
]
