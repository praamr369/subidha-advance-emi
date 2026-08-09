"""Layer-B: pagination helpers contract.

Admin registers page through `build_paginated_payload` / `get_page_params` and the
opt-in paginator. Proving the envelope shape, the page-size cap, out-of-range
handling, and the opt-in gate once covers every register that uses them.
"""
from types import SimpleNamespace

from django.test import SimpleTestCase

from api.v1.pagination import (
    AdminOptInPagination,
    MAX_PAGE_SIZE,
    build_paginated_payload,
    get_page_params,
)


def _req(**params):
    return SimpleNamespace(query_params=params)


class PaginationContractTest(SimpleTestCase):
    def test_get_page_params_defaults_and_cap(self):
        self.assertEqual(get_page_params(_req()), (1, 25))
        self.assertEqual(get_page_params(_req(page="3", page_size="10")), (3, 10))
        # invalid -> default; over-cap -> capped
        self.assertEqual(get_page_params(_req(page="x", page_size="0")), (1, 25))
        self.assertEqual(get_page_params(_req(page_size="9999")), (1, MAX_PAGE_SIZE))

    def test_envelope_shape_and_slicing(self):
        data = list(range(1, 58))  # 57 items
        payload = build_paginated_payload(
            _req(page="2", page_size="25"), data, serializer=lambda rows: list(rows)
        )
        self.assertEqual(payload["count"], 57)
        self.assertEqual(payload["page"], 2)
        self.assertEqual(payload["page_size"], 25)
        self.assertEqual(payload["num_pages"], 3)
        self.assertEqual(payload["results"], list(range(26, 51)))
        self.assertTrue(payload["has_next"])
        self.assertTrue(payload["has_previous"])

    def test_empty_queryset(self):
        payload = build_paginated_payload(_req(), [], serializer=lambda rows: list(rows))
        self.assertEqual(payload["count"], 0)
        self.assertEqual(payload["results"], [])
        self.assertEqual(payload["num_pages"], 0)
        self.assertFalse(payload["has_next"])

    def test_page_beyond_end_is_safe(self):
        payload = build_paginated_payload(
            _req(page="99", page_size="25"), list(range(10)), serializer=lambda rows: list(rows)
        )
        self.assertEqual(payload["results"], [])
        self.assertTrue(payload["has_previous"])

    def test_extra_is_merged(self):
        payload = build_paginated_payload(
            _req(), [1, 2], serializer=lambda rows: list(rows), extra={"totals": {"x": 1}}
        )
        self.assertEqual(payload["totals"], {"x": 1})

    def test_opt_in_paginator_returns_full_set_without_params(self):
        # No ?page / ?page_size => opt-in paginator does not paginate (None).
        paginator = AdminOptInPagination()
        self.assertIsNone(
            paginator.paginate_queryset([1, 2, 3], _req(), view=None)
        )
