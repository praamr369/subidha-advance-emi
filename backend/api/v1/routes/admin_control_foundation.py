from django.urls import path

from api.v1.views.admin_control_foundation import (
    AdminApprovalApproveView,
    AdminApprovalListView,
    AdminApprovalRejectView,
    AdminExceptionAcknowledgeView,
    AdminExceptionListView,
    AdminExceptionResolveView,
    AdminExceptionSuppressView,
    AdminPolicyListView,
    AdminPolicyUpdateView,
)

urlpatterns = [
    # Approvals
    path("control/approvals/", AdminApprovalListView.as_view()),
    path("control/approvals/<int:pk>/approve/", AdminApprovalApproveView.as_view()),
    path("control/approvals/<int:pk>/reject/", AdminApprovalRejectView.as_view()),
    # Policies
    path("control/policies/", AdminPolicyListView.as_view()),
    path("control/policies/set/", AdminPolicyUpdateView.as_view()),
    # Exceptions
    path("control/exceptions/", AdminExceptionListView.as_view()),
    path("control/exceptions/<int:pk>/acknowledge/", AdminExceptionAcknowledgeView.as_view()),
    path("control/exceptions/<int:pk>/resolve/", AdminExceptionResolveView.as_view()),
    path("control/exceptions/<int:pk>/suppress/", AdminExceptionSuppressView.as_view()),
]
