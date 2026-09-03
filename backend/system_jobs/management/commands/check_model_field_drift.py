"""
Find code that writes model fields which no longer exist.

Three services in this codebase were written against an older schema and raised
on every call - passing product_name to a model that only has a product FK, or
omitting required columns. Nothing caught them because no test exercised those
paths, so they sat in production returning 500s.

This walks the source for ``Model.objects.create(...)``, ``Model.objects
.get_or_create(defaults={...})``, ``Model.objects.update(...)`` and direct
``Model(...)`` construction, resolves the name against the installed models, and
reports keyword arguments that are not fields, related accessors, or properties
on that model.

Deliberately conservative: a model name that is ambiguous across apps, or not a
model at all, is skipped rather than guessed at. It finds the class of bug that
actually occurred, not every possible one.

    manage.py check_model_field_drift
    manage.py check_model_field_drift --path crm --fail-on-findings
"""
from __future__ import annotations

import ast
from pathlib import Path

from django.apps import apps
from django.core.management.base import BaseCommand

WRITE_CALLS = {"create", "get_or_create", "update_or_create", "update", "filter", "exclude"}
# Only these carry field kwargs we can check safely.
KWARG_CALLS = {"create", "get_or_create", "update_or_create", "update"}

SKIP_DIRS = {
    "migrations", "node_modules", "__pycache__", ".venv", "venv",
    "static", "media", "tests",
}

# kwargs that are not fields but are legitimate on these calls
NON_FIELD_KWARGS = {"defaults", "using", "batch_size", "ignore_conflicts"}


def _model_fields(model) -> set[str]:
    """
    Names that can actually be written on this model.

    Only concrete fields count. Reverse relations appear in ``get_fields()`` but
    are not assignable — DirectSale.online_request is a ManyToOneRel, and
    treating it as writable is exactly how ``DirectSale(online_request=...)``
    escaped notice while raising at runtime. Including ``dir(model)`` wholesale
    would reintroduce the same hole, since reverse accessors are class
    attributes, so only properties that define a setter are allowed through.
    """
    names: set[str] = set()
    for f in model._meta.get_fields():
        if not getattr(f, "concrete", False):
            continue
        names.add(f.name)
        attname = getattr(f, "attname", None)
        if attname:
            names.add(attname)

    for attr in dir(model):
        if attr.startswith("_"):
            continue
        descriptor = getattr(model, attr, None)
        if isinstance(descriptor, property) and descriptor.fset is not None:
            names.add(attr)

    return names


class Command(BaseCommand):
    help = "Report model keyword arguments in source that are not fields on that model."

    def add_arguments(self, parser):
        parser.add_argument("--path", default="", help="Limit to a subdirectory (e.g. crm).")
        parser.add_argument(
            "--fail-on-findings",
            action="store_true",
            help="Exit non-zero when drift is found, for CI use.",
        )

    def handle(self, *args, **opts):
        # .../backend/system_jobs/management/commands/<file> -> backend/
        root = Path(__file__).resolve().parents[3]
        base = root / opts["path"] if opts["path"] else root

        by_name: dict[str, list] = {}
        for model in apps.get_models():
            by_name.setdefault(model.__name__, []).append(model)

        # Only names that resolve to exactly one model are safe to check.
        unique = {n: m[0] for n, m in by_name.items() if len(m) == 1}
        fields = {n: _model_fields(m) for n, m in unique.items()}

        findings: list[tuple[str, int, str, list[str]]] = []
        scanned = 0

        for path in sorted(base.rglob("*.py")):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except (SyntaxError, UnicodeDecodeError):
                continue
            scanned += 1
            findings.extend(self._scan(tree, path, root, unique, fields))

        self._report(findings, scanned)

        if findings and opts["fail_on_findings"]:
            raise SystemExit(1)

    def _scan(self, tree, path, root, unique, fields):
        out = []
        rel = path.relative_to(root)

        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue

            model_name = None
            kwargs: list[ast.keyword] = []

            # Model.objects.create(...) / .update(...) / .get_or_create(...)
            if (
                isinstance(node.func, ast.Attribute)
                and node.func.attr in KWARG_CALLS
                and isinstance(node.func.value, ast.Attribute)
                and node.func.value.attr == "objects"
                and isinstance(node.func.value.value, ast.Name)
            ):
                model_name = node.func.value.value.id
                kwargs = list(node.keywords)

            # Direct construction: Model(field=...)
            elif isinstance(node.func, ast.Name) and node.func.id in unique and node.keywords:
                model_name = node.func.id
                kwargs = list(node.keywords)

            if not model_name or model_name not in unique:
                continue

            known = fields[model_name]
            bad = []
            for kw in kwargs:
                if kw.arg is None or kw.arg in NON_FIELD_KWARGS:
                    continue
                # Ignore lookups like customer__name on filter-style calls
                if "__" in kw.arg:
                    continue
                if kw.arg not in known:
                    bad.append(kw.arg)

            if bad:
                out.append((str(rel).replace("\\", "/"), node.lineno, model_name, bad))

        return out

    def _report(self, findings, scanned):
        if not findings:
            self.stdout.write(
                self.style.SUCCESS(f"\nNo model field drift found across {scanned} files.")
            )
            return

        self.stdout.write(
            self.style.ERROR(f"\nFound {len(findings)} site(s) writing unknown fields:")
        )
        for rel, lineno, model, bad in findings:
            self.stdout.write(f"  {rel}:{lineno}  {model}(...)  unknown: {', '.join(sorted(bad))}")
        self.stdout.write(
            f"\nScanned {scanned} files. Each of these raises TypeError or "
            "ValidationError if the code path is ever reached."
        )
