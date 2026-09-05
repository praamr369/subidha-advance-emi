"""Reconcile every /api/v1 URL the frontend calls against the real URLconf.

Motivation: the whole customer warranty, privacy and KYC surface was calling
endpoints that do not exist. Seventeen of seventeen URLs returned 404 in
production. Nothing caught it — the frontend typechecks fine, because a wrong
string is still a string, and the backend test suite never sees the frontend.

This closes that gap. It parses the URL literals out of the frontend source,
normalises both sides to a comparable shape, and reports frontend calls with no
matching route.

    python manage.py check_frontend_api_urls
    python manage.py check_frontend_api_urls --fail-on-missing   # CI gate

Deliberately one-directional: backend routes with no frontend caller are
normal (admin tooling, integrations, future work), so they are only reported
under --show-unused.
"""
from __future__ import annotations

import re
from pathlib import Path

from django.core.management.base import BaseCommand
from django.urls import get_resolver

# A URL literal in TS/TSX: starts /api/v1/, runs until the quote or an
# interpolation boundary. Query strings are stripped later.
_FRONTEND_URL = re.compile(r"/api/v1/[^\s\"'`)\\]*")

# Django path() converters: <int:pk>, <str:slug>, <uuid:id>, and bare <pk>.
_PATH_CONVERTER = re.compile(r"<[^>]+>")
# re_path() named groups: (?P<pk>[^/.]+)
_REGEX_GROUP = re.compile(r"\(\?P<[^>]+>[^)]*\)")
# Template interpolation: ${...}
_TEMPLATE_EXPR = re.compile(r"\$\{[^}]*\}")


def _normalise(url: str) -> str:
    """Reduce a URL to a comparable skeleton.

    Every dynamic segment becomes {} so that `/warranty/check/${id}/` and
    `warranty/check/<int:product_id>/` compare equal.
    """
    url = url.split("?", 1)[0].split("#", 1)[0]
    url = _TEMPLATE_EXPR.sub("{}", url)
    url = _REGEX_GROUP.sub("{}", url)
    url = _PATH_CONVERTER.sub("{}", url)
    url = url.replace("^", "").replace("$", "")
    url = re.sub(r"/{2,}", "/", url)
    if not url.startswith("/"):
        url = "/" + url
    if not url.endswith("/"):
        url += "/"
    # A segment that is entirely an interpolation leaves an empty piece behind
    # when the template spans a slash; collapse those too.
    return url


def _is_noise(url: str) -> bool:
    """Filter shapes that are not really endpoint calls.

    Base-URL constants, doc-comment placeholders and glob patterns all match the
    literal regex but describe nothing callable. Reporting them buries the real
    findings, which is how a broken surface stays unnoticed.
    """
    if url in {"/api/v1/", "/api/v1/.../", "/api/v1/api/v1/.../"}:
        return True
    if "*" in url or "/./" in url or "..." in url:
        return True
    # A shape whose only dynamic part swallowed the path (e.g. "/api/v1/{}/")
    # carries no information about which endpoint was meant.
    if url.strip("/").replace("api/v1", "").strip("/") in {"", "{}"}:
        return True
    return False


def _backend_routes() -> set[str]:
    routes: set[str] = set()

    def walk(resolver, prefix=""):
        for pattern in resolver.url_patterns:
            piece = str(pattern.pattern)
            if hasattr(pattern, "url_patterns"):
                walk(pattern, prefix + piece)
            else:
                routes.add(_normalise(prefix + piece))

    walk(get_resolver())
    return routes


def _frontend_calls(frontend_src: Path) -> dict[str, list[str]]:
    """Map normalised URL -> the files that call it."""
    calls: dict[str, list[str]] = {}
    for path in frontend_src.rglob("*"):
        if path.suffix not in {".ts", ".tsx"} or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for raw in _FRONTEND_URL.findall(text):
            # A trailing interpolation with no closing brace on the same match
            # means the regex clipped mid-expression; skip those rather than
            # invent a shape.
            if raw.count("${") != raw.count("}"):
                continue
            normalised = _normalise(raw)
            calls.setdefault(normalised, []).append(str(path))
    return calls


class Command(BaseCommand):
    help = "Report frontend /api/v1 calls that match no backend route."

    def add_arguments(self, parser):
        parser.add_argument(
            "--frontend",
            default=None,
            help="Path to the frontend src directory (default: ../frontend/src).",
        )
        parser.add_argument(
            "--fail-on-missing",
            action="store_true",
            help="Exit non-zero when any frontend call has no route. For CI.",
        )
        parser.add_argument(
            "--show-unused",
            action="store_true",
            help="Also list backend routes no frontend file calls.",
        )

    def handle(self, *args, **options):
        base = Path(__file__).resolve().parents[4]
        frontend_src = Path(options["frontend"]) if options["frontend"] else base / "frontend" / "src"
        if not frontend_src.exists():
            self.stderr.write(f"Frontend source not found: {frontend_src}")
            return

        routes = _backend_routes()
        calls = _frontend_calls(frontend_src)

        missing = {
            url: files
            for url, files in calls.items()
            if url not in routes and not _is_noise(url)
        }

        self.stdout.write(f"Backend routes      : {len(routes)}")
        self.stdout.write(f"Frontend URL shapes : {len(calls)}")
        self.stdout.write(f"Unmatched           : {len(missing)}")

        if missing:
            self.stdout.write("")
            self.stdout.write("FRONTEND CALLS WITH NO BACKEND ROUTE")
            for url in sorted(missing):
                files = sorted({Path(f).as_posix().split("/src/", 1)[-1] for f in missing[url]})
                self.stdout.write(f"  {url}")
                for f in files[:4]:
                    self.stdout.write(f"      src/{f}")
                if len(files) > 4:
                    self.stdout.write(f"      ... and {len(files) - 4} more")

        if options["show_unused"]:
            called = set(calls)
            unused = sorted(r for r in routes if r.startswith("/api/v1/") and r not in called)
            self.stdout.write("")
            self.stdout.write(f"BACKEND ROUTES WITH NO FRONTEND CALLER ({len(unused)})")
            for route in unused[:60]:
                self.stdout.write(f"  {route}")
            if len(unused) > 60:
                self.stdout.write(f"  ... and {len(unused) - 60} more")

        if missing and options["fail_on_missing"]:
            raise SystemExit(1)
