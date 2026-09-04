"""Query-count guard for the admin payment register.

The August audit flagged PaymentAdminSerializer for "chained FK traversal" —
it reads subscription.customer.name and .phone, and subscription__customer is
not in the view's select_related. That looks like a per-row N+1.

Measured 2026-09-05, it is not one: the list costs 8 queries at 3 rows and 8
queries at 9 rows, and only one query touches the customer table (the main
paginated SELECT). Adding subscription__customer changed nothing, so it was
not added.

This test is therefore a forward guard, not a fix. It pins the property that
already holds — cost does not scale with row count — so that a future field or
serializer change that does introduce an N+1 fails here instead of quietly
degrading the register once it carries real volume.
"""
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from payments.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_payment_collection_finance_account,
    create_product,
    create_subscription,
    ensure_test_accounting_posting_prerequisites,
)


class PaymentAdminListQueryCountTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="pay_q_admin", phone="9000004401")
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        self.finance_account = create_payment_collection_finance_account()
        self.product = create_product(name="Query Sofa", base_price=Decimal("15000.00"))
        self.batch = create_batch()
        self.client.force_authenticate(user=self.admin)

    def _make_payment(self, index: int):
        """One payment on its own subscription, so each row has a distinct customer."""
        # create_customer_profile does not forward a username, so every call
        # would reuse the default and collide. Build the user explicitly.
        phone = f"90000045{index:02d}"
        customer = create_customer_profile(
            user=create_customer_user(username=f"query_customer_{index}", phone=phone),
            name=f"Query Customer {index}",
            phone=phone,
        )
        lucky_id = create_lucky_id(batch=self.batch, lucky_number=index)
        subscription = create_subscription(
            customer=customer,
            product=self.product,
            batch=self.batch,
            lucky_id=lucky_id,
        )
        emi = create_emi(subscription=subscription, month_no=1)
        return record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            # Cash without a reference number requires one, so the service can
            # tell a retry apart from a genuine second collection.
            idempotency_key=f"query-count-test-{index}",
        )

    def _get_list(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(reverse("admin-payments-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response, len(ctx.captured_queries)

    def test_query_count_does_not_grow_with_row_count(self):
        """Tripling the rows must not change the query count.

        Row counts stay under the page size so both requests serialize every
        row they create — otherwise pagination would mask a real N+1 by capping
        the work.
        """
        for index in range(1, 4):
            self._make_payment(index)
        _, queries_for_three = self._get_list()

        for index in range(4, 10):
            self._make_payment(index)
        response, queries_for_nine = self._get_list()

        self.assertEqual(
            len(response.data.get("results", response.data)),
            9,
            "both requests must return every row for the comparison to mean anything",
        )
        self.assertEqual(
            queries_for_three,
            queries_for_nine,
            "Admin payment list query count grew with row count "
            f"({queries_for_three} -> {queries_for_nine}). Something added a "
            "per-row query — most likely a serializer field traversing a "
            "relation the view does not select_related.",
        )

    def test_serializer_exposes_the_customer_it_traverses(self):
        """Guards the assumption the query-count test rests on.

        If the serializer stopped reading subscription.customer, the count test
        would keep passing while silently testing nothing.
        """
        self._make_payment(1)

        response, _ = self._get_list()

        rows = response.data.get("results", response.data)
        self.assertTrue(rows, "expected at least one payment row")
        self.assertEqual(rows[0]["customer_name"], "Query Customer 1")
