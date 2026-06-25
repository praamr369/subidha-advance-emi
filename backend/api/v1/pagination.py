from __future__ import annotations

from typing import Callable, Iterable

from django.core.paginator import Paginator
from rest_framework.pagination import PageNumberPagination

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


def _positive_int(raw_value, default: int) -> int:
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def get_page_params(request, default_page_size: int = DEFAULT_PAGE_SIZE) -> tuple[int, int]:
    page = _positive_int(request.query_params.get("page"), 1)
    page_size = _positive_int(request.query_params.get("page_size"), default_page_size)
    page_size = min(page_size, MAX_PAGE_SIZE)
    return page, page_size


def build_paginated_payload(
    request,
    queryset,
    serializer: Callable[[Iterable], list],
    *,
    extra: dict | None = None,
    default_page_size: int = DEFAULT_PAGE_SIZE,
):
    page, page_size = get_page_params(request, default_page_size=default_page_size)
    count = queryset.count()

    payload = {
        "count": count,
        "results": [],
        "page": page,
        "page_size": page_size,
        "num_pages": 0,
        "has_next": False,
        "has_previous": False,
    }

    if count == 0:
        if extra:
            payload.update(extra)
        return payload

    paginator = Paginator(queryset, page_size)
    payload["num_pages"] = paginator.num_pages

    if page > paginator.num_pages:
        payload["has_previous"] = paginator.num_pages > 0
        if extra:
            payload.update(extra)
        return payload

    page_obj = paginator.page(page)
    payload["results"] = serializer(page_obj.object_list)
    payload["has_next"] = page_obj.has_next()
    payload["has_previous"] = page_obj.has_previous()

    if extra:
        payload.update(extra)

    return payload


class AdminAccountingPagination(PageNumberPagination):
    """Honor page_size for chart/finance registers; cap to avoid unbounded queries."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500


class AdminListPagination(PageNumberPagination):
    """Always-on pagination for admin registers that honors ``?page_size``.

    Returns the standard DRF envelope ``{count, next, previous, results}``.
    Unlike the project default paginator, this honors the client page_size so
    server and client agree on page boundaries (page-count math stays exact).
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


class AdminOptInPagination(PageNumberPagination):
    """Backward-compatible, opt-in pagination for admin list endpoints.

    Pagination only activates when the request explicitly asks for it via
    ``?page=`` or ``?page_size=``. Without those params the viewset returns the
    full result array exactly as before, so existing frontend callers that
    expect raw arrays (or that fetch a complete filtered set to compute counts)
    keep working unchanged. Migrated tables opt in by sending ``?page=``.
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500

    def paginate_queryset(self, queryset, request, view=None):
        wants_pagination = (
            request.query_params.get(self.page_query_param) is not None
            or request.query_params.get(self.page_size_query_param) is not None
        )
        if not wants_pagination:
            return None
        return super().paginate_queryset(queryset, request, view=view)
