from django.urls import path

from api.v1.views.admin_control_cash_desk import (
    AdminCashSessionApproveVarianceView,
    AdminCashSessionCloseView,
    AdminCashSessionListView,
    AdminCashSessionOpenView,
    AdminDailyCloseExecuteView,
    AdminDailyCloseHistoryView,
    AdminDailyCloseReadinessView,
)

urlpatterns = [
    # Cash counter sessions
    path("control/cash-sessions/", AdminCashSessionListView.as_view()),
    path("control/cash-sessions/open/", AdminCashSessionOpenView.as_view()),
    path("control/cash-sessions/<int:pk>/close/", AdminCashSessionCloseView.as_view()),
    path("control/cash-sessions/<int:pk>/approve-variance/", AdminCashSessionApproveVarianceView.as_view()),
    # Daily close
    path("control/daily-close/readiness/", AdminDailyCloseReadinessView.as_view()),
    path("control/daily-close/execute/", AdminDailyCloseExecuteView.as_view()),
    path("control/daily-close/history/", AdminDailyCloseHistoryView.as_view()),
]
