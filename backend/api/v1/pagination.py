from __future__ import annotations

from typing import Callable, Iterable

from django.core.paginator import Paginator

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
