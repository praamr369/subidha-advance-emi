from django.urls import path
from api.v1.views.admin_control_month_end import (
    AdminDataQualityView,
    AdminMonthEndExecuteView,
    AdminMonthEndHistoryView,
    AdminMonthEndReadinessView,
)

urlpatterns = [
    path("control/month-end-close/readiness/", AdminMonthEndReadinessView.as_view()),
    path("control/month-end-close/execute/", AdminMonthEndExecuteView.as_view()),
    path("control/month-end-close/history/", AdminMonthEndHistoryView.as_view()),
    path("data-quality/", AdminDataQualityView.as_view()),
]
