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
# Stops at "<" and ">" as well as quotes and whitespace. Without that, a URL
# written in prose inside a JSX tag — <code>/api/v1/admin/customers/search/</code>
# — was captured with the closing tag attached, and the path-converter regex
# below then turned "</code>" into "{}", inventing an endpoint nobody calls.
_FRONTEND_URL = re.compile(r"/api/v1/[^\s\"'`)<>\\]*")

# API_BASE_URL already ends with "/api/v1" (see frontend lib/env.ts), and
# apiFetch accepts both forms — so most call sites write the path WITHOUT the
# prefix: apiFetch("/admin/accounting/assets/"). Matching only the prefixed
# form checked a minority of the surface. This catches the relative literals
# passed directly to apiFetch; they are prefixed before comparison.
_APIFETCH_RELATIVE = re.compile(
    r"""apiFetch(?:<[^>]*>)?\(\s*[`'"](/(?!api/v1)[a-zA-Z0-9][^\s"'`)<>\\]*)"""
)

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
    # Dynamic segments are collapsed BEFORE the query string is stripped.
    # Django re_path patterns contain a literal "?" inside named groups —
    # "(?P<pk>[^/.]+)" — so splitting on "?" first truncated every route
    # registered through a DRF router at the opening parenthesis. Those routes
    # then matched nothing, and the tool reported working endpoints as missing.
    url = _TEMPLATE_EXPR.sub("{}", url)
    url = _REGEX_GROUP.sub("{}", url)
    url = _PATH_CONVERTER.sub("{}", url)
    url = url.split("?", 1)[0].split("#", 1)[0]
    url = url.replace("^", "").replace("$", "")
    url = re.sub(r"/{2,}", "/", url)
    if not url.startswith("/"):
        url = "/" + url
    if not url.endswith("/"):
        url += "/"
    # A segment that is entirely an interpolation leaves an empty piece behind
    # when the template spans a slash; collapse those too.
    return url


_BASELINE_HEADER = """\
# Frontend /api/v1 calls that currently have no backend route.
#
# This is a ratchet, not an allowlist of acceptable state. Every line is a
# feature the UI offers and the backend cannot serve: the page renders, accepts
# input, and 404s. CI fails on anything NOT in this file, so the count can only
# go down.
#
# Regenerate deliberately (never to silence a failure):
#   python manage.py check_frontend_api_urls --baseline api_url_baseline.txt \\
#       --write-baseline
#
# Adding a line here to make CI pass is hiding a broken feature from the only
# check that looks for one.
"""


def _read_baseline(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def _matches(url: str, routes: set[str]) -> bool:
    """Whether a frontend URL corresponds to a real route.

    Exact first. Failing that, a frontend call may spell out a value where the
    route declares a parameter — the audit-log timeline is written as
    ".../timeline/Customer/${id}/" against a route of
    ".../timeline/{model}/{pk}/". Generalising one literal segment at a time
    catches that without loosening the check into uselessness: a URL still has
    to align with a real route on every other segment.
    """
    if url in routes:
        return True

    parts = url.strip("/").split("/")
    for index, part in enumerate(parts):
        if part == "{}":
            continue
        candidate = list(parts)
        candidate[index] = "{}"
        if "/" + "/".join(candidate) + "/" in routes:
            return True
    return False


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
        found = list(_FRONTEND_URL.findall(text))
        # Relative apiFetch paths carry the same meaning once prefixed.
        found += ["/api/v1" + m for m in _APIFETCH_RELATIVE.findall(text)]

        for raw in found:
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
            "--baseline",
            default=None,
            help=(
                "File of already-known unmatched URLs, one per line. With "
                "--fail-on-missing, only URLs absent from it fail the run. This "
                "is a ratchet: the existing breakage is recorded, and the count "
                "can only go down."
            ),
        )
        parser.add_argument(
            "--write-baseline",
            action="store_true",
            help="Rewrite the --baseline file from the current state.",
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
            if not _matches(url, routes) and not _is_noise(url)
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

        baseline_path = Path(options["baseline"]) if options["baseline"] else None

        if options["write_baseline"]:
            if baseline_path is None:
                self.stderr.write("--write-baseline requires --baseline PATH")
                raise SystemExit(2)
            baseline_path.write_text(
                _BASELINE_HEADER + "".join(f"{url}\n" for url in sorted(missing)),
                encoding="utf-8",
            )
            self.stdout.write(f"\nBaseline written: {baseline_path} ({len(missing)})")
            return

        if baseline_path is None:
            if missing and options["fail_on_missing"]:
                raise SystemExit(1)
            return

        known = _read_baseline(baseline_path)
        new_breakage = sorted(url for url in missing if url not in known)
        # A baseline entry that now resolves is good news, but leaving it in the
        # file lets real breakage hide behind it later.
        resolved = sorted(url for url in known if url not in missing)

        self.stdout.write("")
        self.stdout.write(f"Known (baseline)    : {len(known)}")
        self.stdout.write(f"New breakage        : {len(new_breakage)}")
        self.stdout.write(f"Fixed since baseline: {len(resolved)}")

        if new_breakage:
            self.stdout.write("")
            self.stdout.write("NEW: frontend calls with no backend route")
            for url in new_breakage:
                files = sorted(
                    {Path(f).as_posix().split("/src/", 1)[-1] for f in missing[url]}
                )
                self.stdout.write(f"  {url}")
                for f in files[:4]:
                    self.stdout.write(f"      src/{f}")

        if resolved:
            self.stdout.write("")
            self.stdout.write("FIXED — remove these from the baseline:")
            for url in resolved:
                self.stdout.write(f"  {url}")

        if new_breakage and options["fail_on_missing"]:
            raise SystemExit(1)
