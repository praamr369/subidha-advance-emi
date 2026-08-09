"""Enumerate every API endpoint with a concrete, requestable path.

Used by the Layer-A verification tests (auth matrix + endpoint smoke). Builds a
dummy-but-valid path for each URL pattern (substituting `<int:pk>` /
`(?P<pk>...)` placeholders) and reports the view class + its declared
permission classes so tests can assert auth behaviour and no-500 smoke without
hand-listing 2,500+ endpoints.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from django.urls import get_resolver
from django.urls.resolvers import RegexPattern, RoutePattern

# Only these are our own API surface; skip Django admin, static, schema UI, etc.
API_PREFIX = "api/v1/"

_UUID = "11111111-1111-1111-1111-111111111111"


def _dummy_for(name: str) -> str:
    n = (name or "").lower()
    if "uuid" in n:
        return _UUID
    return "1"  # matches int converters and DRF's [^/.]+ string params


def _route_to_path(route: str) -> str | None:
    """`customers/<int:pk>/actions/` -> `customers/1/actions/`."""
    def repl(m):
        inner = m.group(1)
        name = inner.split(":")[-1]
        return _dummy_for(name)

    return re.sub(r"<([^>]+)>", repl, route)


def _regex_to_path(rx: str) -> str | None:
    """DRF-router regex -> a concrete path, or None if it can't be made clean."""
    s = rx
    # drop optional format suffix groups
    s = re.sub(r"\(\?P<format>[^)]*\)\??", "", s)
    s = re.sub(r"\\\.\(\?P<format>[^)]*\)\??", "", s)
    # named groups -> dummy
    s = re.sub(r"\(\?P<([^>]+)>[^)]*\)", lambda m: _dummy_for(m.group(1)), s)
    # anchors / escapes
    s = s.replace("^", "").replace("$", "").replace(r"\Z", "").replace(r"\A", "")
    s = s.replace(r"\.", ".").replace(r"\/", "/").replace("\\", "")
    # bail if regex metacharacters remain (can't build a clean path)
    if re.search(r"[()\[\]?*+|]", s):
        return None
    return s


@dataclass
class Endpoint:
    path: str            # concrete, requestable, e.g. /api/v1/admin/customers/1/
    methods: tuple       # ("GET","POST",...)
    view: str            # module.ClassName
    view_cls: type | None
    perms: tuple         # ("IsAdmin","IsAuthenticated",...)


def _perm_names(cls) -> tuple:
    out = []
    for p in getattr(cls, "permission_classes", []) or []:
        out.append(getattr(p, "__name__", str(p)))
    return tuple(out)


def _http_methods(cls) -> tuple:
    if cls is None:
        return ("GET",)
    ms = [m.upper() for m in ("get", "post", "put", "patch", "delete") if hasattr(cls, m)]
    return tuple(ms) or ("GET",)


def iter_api_endpoints():
    """Yield Endpoint for every resolvable /api/v1/ URL with a buildable path."""
    seen = set()

    def walk(resolver, prefix=""):
        for p in resolver.url_patterns:
            if hasattr(p, "url_patterns"):
                yield from walk(p, prefix + str(p.pattern))
                continue
            raw = prefix + str(p.pattern)
            if API_PREFIX not in raw:
                continue
            if isinstance(p.pattern, RoutePattern) and not isinstance(p.pattern, RegexPattern):
                built = _route_to_path(raw)
            else:
                built = _regex_to_path(raw)
            if not built:
                continue
            path = "/" + built.lstrip("/")
            cb = p.callback
            cls = getattr(cb, "cls", None) or getattr(cb, "view_class", None)
            # Skip DRF router index pages (browsable API root) — not a business
            # endpoint, and its path takes no pk (the walker's dummy /1 is bogus).
            if cls is not None and cls.__name__ == "APIRootView":
                continue
            view = (cls.__module__ + "." + cls.__name__) if cls else getattr(cb, "__qualname__", "?")
            key = (path, view)
            if key in seen:
                continue
            seen.add(key)
            yield Endpoint(
                path=path,
                methods=_http_methods(cls),
                view=view,
                view_cls=cls,
                perms=_perm_names(cls),
            )

    yield from walk(get_resolver())


def requires_auth(ep: Endpoint) -> bool:
    return "AllowAny" not in ep.perms and bool(ep.perms)


def requires_admin(ep: Endpoint) -> bool:
    # IsAdmin, or a *OrAdmin gate — a plain non-admin role must be blocked.
    return any(p == "IsAdmin" for p in ep.perms)
