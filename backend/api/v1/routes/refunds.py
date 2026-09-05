"""Customer refund-request routes.

Only the four endpoints that rest on rules the models already enforce.

Not mounted, deliberately: assess-damage/, assess-damage/<id>/, inspect/<id>/,
inspection-jobs/ and <id>/advance/. The frontend expects a damage-assessment
domain — condition bands, inspection photos, a deduction percentage — that no
model carries. A deduction reduces money returned to a customer and posts to
the ledger through CustomerRefund, so those need a stated policy (bands, caps,
who may approve, and how it sits with the Consumer Protection Act 2019) before
any of it is safe to implement. They stay in api_url_baseline.txt until then.
"""
from django.urls import path

from api.v1.views.customer_refunds import (
    refund_admin_list_view,
    refund_history_view,
    refund_request_view,
    refund_status_view,
)

urlpatterns = [
    path("request/", refund_request_view, name="refund-request"),
    path("status/<int:request_id>/", refund_status_view, name="refund-status"),
    path("history/", refund_history_view, name="refund-history"),
    path("admin-list/", refund_admin_list_view, name="refund-admin-list"),
]
