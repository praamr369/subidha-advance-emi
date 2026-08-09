from django.urls import include, path
from api.v1.views.admin_internal_users import AdminInternalUserActivateView
from api.v1.views.admin_internal_users import AdminInternalUserAuditView
from api.v1.views.admin_internal_users import AdminInternalUserCreateView
from api.v1.views.admin_internal_users import AdminInternalUserDeactivateView
from api.v1.views.admin_internal_users import AdminInternalUserDetailView
from api.v1.views.admin_internal_users import AdminInternalUserListView
from api.v1.views.admin_internal_users import AdminInternalUserPasswordResetView
from api.v1.views.admin_leads import AdminLeadAssignView
from api.v1.views.admin_leads import AdminLeadConversionCompleteView
from api.v1.views.admin_leads import AdminLeadDetailView
from api.v1.views.admin_leads import AdminLeadListView
from api.v1.views.admin_leads import AdminLeadNoteUpdateView
from api.v1.views.admin_leads import AdminLeadStatusUpdateView
from api.v1.views.admin_role_capabilities import AdminRolePermissionMatrixView
from api.v1.views.admin_role_capabilities import AdminRolePermissionUpdateView
from api.v1.views.admin_role_capabilities import AdminUserCapabilityOverrideView
from api.v1.views.admin_support_requests import AdminSupportRequestAssignView
from api.v1.views.admin_support_requests import AdminSupportRequestDetailView
from api.v1.views.admin_support_requests import AdminSupportRequestListView
from api.v1.views.admin_support_requests import AdminSupportRequestNoteUpdateView
from api.v1.views.admin_support_requests import AdminSupportRequestResolveView
from api.v1.views.admin_support_requests import AdminSupportRequestStatusUpdateView
from api.v1.views.admin_support_tickets import AdminSupportTicketAssignView
from api.v1.views.admin_support_tickets import AdminSupportTicketCloseView
from api.v1.views.admin_support_tickets import AdminSupportTicketCommentView
from api.v1.views.admin_support_tickets import AdminSupportTicketDashboardView
from api.v1.views.admin_support_tickets import AdminSupportTicketDetailPatchView
from api.v1.views.admin_support_tickets import AdminSupportTicketInternalNoteView
from api.v1.views.admin_support_tickets import AdminSupportTicketLinkView
from api.v1.views.admin_support_tickets import AdminSupportTicketListCreateView
from api.v1.views.admin_support_tickets import AdminSupportTicketRejectView
from api.v1.views.admin_support_tickets import AdminSupportTicketReopenView
from api.v1.views.admin_support_tickets import AdminSupportTicketResolveView
from api.v1.views.product_requests import AdminProductRequestCancelView
from api.v1.views.product_requests import AdminProductRequestDecisionView
from api.v1.views.product_requests import AdminProductRequestDetailView
from api.v1.views.product_requests import AdminProductRequestEditView
from api.v1.views.product_requests import AdminProductRequestListView
from api.v1.views.product_requests import AdminProductRequestOptionsView
from api.v1.views.product_requests import AdminProductRequestStockCheckView
from api.v1.views.subscription_requests import AdminSubscriptionRequestAmendmentView
from api.v1.views.subscription_requests import AdminSubscriptionRequestApproveView
from api.v1.views.subscription_requests import AdminSubscriptionRequestDetailView
from api.v1.views.subscription_requests import AdminSubscriptionRequestHoldView
from api.v1.views.subscription_requests import AdminSubscriptionRequestListView
from api.v1.views.subscription_requests import AdminSubscriptionRequestOptionsView
from api.v1.views.subscription_requests import AdminSubscriptionRequestRejectView

urlpatterns = [
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
    path("subscription-requests/<int:pk>/hold/", AdminSubscriptionRequestHoldView.as_view()),
    path("subscription-requests/<int:pk>/amendment/", AdminSubscriptionRequestAmendmentView.as_view()),
    path("product-request-options/", AdminProductRequestOptionsView.as_view()),
    path("product-requests/", AdminProductRequestListView.as_view()),
    path("product-requests/<int:pk>/decision/", AdminProductRequestDecisionView.as_view()),
    path("product-requests/<int:pk>/cancel/", AdminProductRequestCancelView.as_view()),
    path("product-requests/<int:pk>/edit/", AdminProductRequestEditView.as_view()),
    path("product-requests/<int:pk>/stock-check/", AdminProductRequestStockCheckView.as_view()),
    path("product-requests/<int:pk>/", AdminProductRequestDetailView.as_view()),
    path("support-requests/", AdminSupportRequestListView.as_view()),
    path("support-requests/<int:pk>/", AdminSupportRequestDetailView.as_view()),
    path("support-requests/<int:pk>/status/", AdminSupportRequestStatusUpdateView.as_view()),
    path("support-requests/<int:pk>/assign/", AdminSupportRequestAssignView.as_view()),
    path("support-requests/<int:pk>/notes/", AdminSupportRequestNoteUpdateView.as_view()),
    path("support-requests/<int:pk>/resolve/", AdminSupportRequestResolveView.as_view()),
    path("support/dashboard/", AdminSupportTicketDashboardView.as_view()),
    path("support/tickets/", AdminSupportTicketListCreateView.as_view()),
    path("support/tickets/<int:pk>/", AdminSupportTicketDetailPatchView.as_view()),
    path("support/tickets/<int:pk>/assign/", AdminSupportTicketAssignView.as_view()),
    path("support/tickets/<int:pk>/comment/", AdminSupportTicketCommentView.as_view()),
    path("support/tickets/<int:pk>/internal-note/", AdminSupportTicketInternalNoteView.as_view()),
    path("support/tickets/<int:pk>/link/", AdminSupportTicketLinkView.as_view()),
    path("support/tickets/<int:pk>/resolve/", AdminSupportTicketResolveView.as_view()),
    path("support/tickets/<int:pk>/reject/", AdminSupportTicketRejectView.as_view()),
    path("support/tickets/<int:pk>/close/", AdminSupportTicketCloseView.as_view()),
    path("support/tickets/<int:pk>/reopen/", AdminSupportTicketReopenView.as_view()),
    path("internal-users/", AdminInternalUserListView.as_view()),
    path("internal-users/create/", AdminInternalUserCreateView.as_view()),
    path("internal-users/<int:pk>/", AdminInternalUserDetailView.as_view()),
    path("internal-users/<int:pk>/activate/", AdminInternalUserActivateView.as_view()),
    path("internal-users/<int:pk>/deactivate/", AdminInternalUserDeactivateView.as_view()),
    path("internal-users/<int:pk>/reset-password/", AdminInternalUserPasswordResetView.as_view()),
    path("internal-users/<int:pk>/audit/", AdminInternalUserAuditView.as_view()),
    path("settings/roles-permissions/", AdminRolePermissionMatrixView.as_view()),
    path("settings/roles-permissions/roles/<str:role>/", AdminRolePermissionUpdateView.as_view()),
    path("settings/roles-permissions/users/", AdminUserCapabilityOverrideView.as_view()),
    path("settings/roles-permissions/users/<int:user_id>/", AdminUserCapabilityOverrideView.as_view()),
]
