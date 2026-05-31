from django.urls import path

from api.v1.views.admin_password_reset_requests import (
    admin_password_reset_request_detail,
    admin_password_reset_request_invalidate,
    admin_password_reset_request_list,
    admin_password_reset_request_resend,
)
from api.v1.views.admin_policy_site import AdminPolicyCoverageView

urlpatterns = [
    path("settings/policies/coverage/", AdminPolicyCoverageView.as_view(), name="admin-policy-coverage"),
    path("password-reset-requests/", admin_password_reset_request_list, name="admin-password-reset-request-list"),
    path("password-reset-requests/<int:request_id>/", admin_password_reset_request_detail, name="admin-password-reset-request-detail"),
    path("password-reset-requests/<int:request_id>/invalidate/", admin_password_reset_request_invalidate, name="admin-password-reset-request-invalidate"),
    path("password-reset-requests/<int:request_id>/resend/", admin_password_reset_request_resend, name="admin-password-reset-request-resend"),
]
