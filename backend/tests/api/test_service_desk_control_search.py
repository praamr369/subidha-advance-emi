from rest_framework import status
from rest_framework.test import APITestCase

from service_desk.models import ServiceDeskCase, ServiceDeskCaseType
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)

SEARCH_URL = "/api/v1/service-desk/control-search/"
RESOLVE_URL = "/api/v1/service-desk/control-resolve/"


class ServiceControlSearchTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="control_search_admin", phone="9387711001")
        self.customer = create_customer_profile(
            name="Control Center Customer",
            phone="7311100022",
        )
        product = create_product(name="Control Search Product", product_code="CTRL-PRD-1")
        batch = create_batch(batch_code="CTRLBATCH2026", total_slots=100, duration_months=12)
        lucky_id = create_lucky_id(batch=batch, lucky_number=7)
        self.subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            tenure_months=12,
        )
        self.subscription.subscription_number = "CTRL-SUB-0001"
        self.subscription.save(update_fields=["subscription_number"])
        self.case = ServiceDeskCase.objects.create(
            case_type=ServiceDeskCaseType.SERVICE,
            subscription=self.subscription,
            issue_summary="Control search wobbly leg",
            reporter_name_snapshot="Control Center Customer",
            reporter_phone_snapshot="7311100022",
        )

    def _kinds(self, payload):
        return {g["kind"] for g in payload["groups"]}

    # --- auth gating --------------------------------------------------------

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(SEARCH_URL, {"q": "Control"})
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_forbids_non_admin(self):
        self.client.force_authenticate(
            user=create_customer_user(username="ctrl_search_nonadmin", phone="7311100099")
        )
        response = self.client.get(SEARCH_URL, {"q": "Control"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- search resolves each identifier type -------------------------------

    def test_search_by_customer_name(self):
        self.client.force_authenticate(user=self.admin)
        payload = self.client.get(SEARCH_URL, {"q": "Control Center"}).json()
        self.assertIn("customer", self._kinds(payload))

    def test_search_by_phone(self):
        self.client.force_authenticate(user=self.admin)
        payload = self.client.get(SEARCH_URL, {"q": "7311100022"}).json()
        self.assertIn("customer", self._kinds(payload))

    def test_search_by_subscription_number(self):
        self.client.force_authenticate(user=self.admin)
        payload = self.client.get(SEARCH_URL, {"q": self.subscription.subscription_number}).json()
        self.assertIn("contract", self._kinds(payload))

    def test_search_by_case_no(self):
        self.client.force_authenticate(user=self.admin)
        payload = self.client.get(SEARCH_URL, {"q": self.case.case_no}).json()
        self.assertIn("service_case", self._kinds(payload))

    def test_empty_query_returns_nothing(self):
        self.client.force_authenticate(user=self.admin)
        payload = self.client.get(SEARCH_URL, {"q": ""}).json()
        self.assertEqual(payload["total"], 0)
        self.assertEqual(payload["groups"], [])

    # --- resolve timeline ---------------------------------------------------

    def test_resolve_timeline_includes_linked_case(self):
        self.client.force_authenticate(user=self.admin)
        payload = self.client.get(RESOLVE_URL, {"customer": self.customer.id}).json()
        case_nos = {row["label"] for row in payload["service_cases"]}
        self.assertIn(self.case.case_no, case_nos)
