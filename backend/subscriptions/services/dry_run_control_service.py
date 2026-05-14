"""
Dry Run Control Center — read-only validation orchestration.

Rules:
- No writes to business/financial domain tables.
- May persist DryRunValidationJob summary/results (metadata only) when requested via API.
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounting.services.accounting_setup_service import AccountingSetupService
from billing.services.direct_sale_workflow_service import classify_direct_sale_stock_status
from billing.models import DirectSale
from inventory.models import (
    InventoryItem,
    OpeningStockEntry,
    OpeningStockEntryStatus,
    PurchaseNeed,
    PurchaseNeedStatus,
    StockLocation,
    StockLocationType,
    Warehouse,
)
from inventory.services.inventory_readiness_service import get_inventory_readiness_snapshot
from accounts.models import User, UserRole
from subscriptions.models import (
    Batch,
    BatchStatus,
    Commission,
    CommissionStatus,
    DryRunValidationJob,
    LuckyDraw,
    Payment,
    PaymentReconciliation,
    Product,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.business_reset_service import BusinessResetOptions, build_business_reset_plan
from subscriptions.services.business_setup_service import get_reset_preview
from subscriptions.services.setup_checklist_service import compute_setup_checklist
from subscriptions.services.document_numbering_service import get_document_numbering_state

# Check category keys (API contract)
CHECK_SETUP_READINESS = "SETUP_READINESS"
CHECK_ACCOUNTING_SETUP = "ACCOUNTING_SETUP"
CHECK_SELECTIVE_RESET_PREVIEW = "SELECTIVE_RESET_PREVIEW"
CHECK_EXPORT_PREVIEW = "EXPORT_PREVIEW"
CHECK_IMPORT_PREVIEW = "IMPORT_PREVIEW"
CHECK_FRONTEND_ROUTE_WORKFLOW = "FRONTEND_ROUTE_WORKFLOW"
CHECK_API_CONTRACT = "API_CONTRACT"
CHECK_LUCKY_PLAN_WORKFLOW = "LUCKY_PLAN_WORKFLOW"
CHECK_PAYMENT_FINANCE_SAFETY = "PAYMENT_FINANCE_SAFETY"
CHECK_INVENTORY_SALES_PURCHASE_READINESS = "INVENTORY_SALES_PURCHASE_READINESS"
CHECK_HR_READINESS = "HR_READINESS"
CHECK_FINANCE_SETUP_READINESS = "FINANCE_SETUP_READINESS"
CHECK_COA_SETUP_READINESS = "COA_SETUP_READINESS"
CHECK_INVENTORY_READINESS = "INVENTORY_READINESS"
CHECK_DIRECT_SALE_WORKFLOW_READINESS = "DIRECT_SALE_WORKFLOW_READINESS"
CHECK_DELIVERY_HANDOFF_READINESS = "DELIVERY_HANDOFF_READINESS"
CHECK_STOCK_NEED_WORKFLOW_READINESS = "STOCK_NEED_WORKFLOW_READINESS"

ALL_CHECK_KEYS: tuple[str, ...] = (
    CHECK_SETUP_READINESS,
    CHECK_ACCOUNTING_SETUP,
    CHECK_SELECTIVE_RESET_PREVIEW,
    CHECK_EXPORT_PREVIEW,
    CHECK_IMPORT_PREVIEW,
    CHECK_FRONTEND_ROUTE_WORKFLOW,
    CHECK_API_CONTRACT,
    CHECK_LUCKY_PLAN_WORKFLOW,
    CHECK_PAYMENT_FINANCE_SAFETY,
    CHECK_INVENTORY_SALES_PURCHASE_READINESS,
    CHECK_HR_READINESS,
    CHECK_FINANCE_SETUP_READINESS,
    CHECK_COA_SETUP_READINESS,
    CHECK_INVENTORY_READINESS,
    CHECK_DIRECT_SALE_WORKFLOW_READINESS,
    CHECK_DELIVERY_HANDOFF_READINESS,
    CHECK_STOCK_NEED_WORKFLOW_READINESS,
)


def dry_run_check_catalog() -> list[dict[str, Any]]:
    """Static catalog for GET options (no DB)."""
    return [
        {
            "key": CHECK_SETUP_READINESS,
            "label": "Setup readiness",
            "description": "Validates business profile, branches, counters, finance accounts, chart, numbering, and staff presence using the same signals as the go-live checklist.",
            "risk_level": "LOW",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_ACCOUNTING_SETUP,
            "label": "Accounting setup",
            "description": "Validates chart/finance accounts and COA mapping purposes, duplicate defaults, inactive mapped accounts, and required mapping coverage.",
            "risk_level": "MEDIUM",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_SELECTIVE_RESET_PREVIEW,
            "label": "Selective reset preview",
            "description": "Read-only counts for default business reset plan (no execution). Surfaces dependency scale and financial record volume.",
            "risk_level": "HIGH",
            "supports_scopes": True,
            "requires_upload": False,
        },
        {
            "key": CHECK_EXPORT_PREVIEW,
            "label": "Export preview",
            "description": "Guidance for export packages: scope selection, estimated record volumes, and personal/financial data sensitivity flags (no file generation).",
            "risk_level": "MEDIUM",
            "supports_scopes": True,
            "requires_upload": False,
        },
        {
            "key": CHECK_IMPORT_PREVIEW,
            "label": "Import preview",
            "description": "When no upload is supplied, returns readiness guidance. Full row-level import validation still uses existing import-preview endpoints with a file.",
            "risk_level": "MEDIUM",
            "supports_scopes": True,
            "requires_upload": True,
        },
        {
            "key": CHECK_FRONTEND_ROUTE_WORKFLOW,
            "label": "Frontend route workflow",
            "description": "Compares ROUTES.admin constants from routes.ts against discovered Next.js App Router pages under src/app/(dashboard)/admin.",
            "risk_level": "MEDIUM",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_API_CONTRACT,
            "label": "API contract (lightweight)",
            "description": "Scans frontend service files for /api/v1/* path strings and flags uncommon prefixes (read-only heuristic, not a full OpenAPI diff).",
            "risk_level": "LOW",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_LUCKY_PLAN_WORKFLOW,
            "label": "Lucky Plan workflow",
            "description": "Read-only checks on products, batches, draw records, and subscription volume vs batch state (no draw execution).",
            "risk_level": "MEDIUM",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_PAYMENT_FINANCE_SAFETY,
            "label": "Payment & finance safety",
            "description": "Counts payments, reconciliation coverage, pending commissions, and payout batch drafts without mutating ledgers.",
            "risk_level": "HIGH",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_INVENTORY_SALES_PURCHASE_READINESS,
            "label": "Inventory & sales readiness",
            "description": "Products, tracked inventory items, opening stock drafts/posts, and demand-facing counts (read-only).",
            "risk_level": "LOW",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_HR_READINESS,
            "label": "HR readiness",
            "description": "Internal admin/cashier user presence and role sanity (read-only).",
            "risk_level": "LOW",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_FINANCE_SETUP_READINESS,
            "label": "Finance settlement desks readiness",
            "description": "Validates presence of settlement-flagged finance accounts, ledger-profile anchor coverage, and settlement-oriented warnings.",
            "risk_level": "MEDIUM",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_COA_SETUP_READINESS,
            "label": "Chart of accounts readiness",
            "description": "Ensures seeded system_code coverage and mapping completeness signals from AccountingSetupService.",
            "risk_level": "MEDIUM",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_INVENTORY_READINESS,
            "label": "Inventory readiness",
            "description": "Read-only ATP/opening-stock/stock-need snapshot without mutating inventory.",
            "risk_level": "LOW",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_DIRECT_SALE_WORKFLOW_READINESS,
            "label": "Direct sale workflow readiness",
            "description": "Document numbering gates plus lightweight stock-status sampling on recent direct sales.",
            "risk_level": "MEDIUM",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_DELIVERY_HANDOFF_READINESS,
            "label": "Delivery desk handoff readiness",
            "description": "Read-only counts on retail delivery desk cases (service desk).",
            "risk_level": "LOW",
            "supports_scopes": False,
            "requires_upload": False,
        },
        {
            "key": CHECK_STOCK_NEED_WORKFLOW_READINESS,
            "label": "Stock need workflow readiness",
            "description": "Confirms warehouses exist and summarizes open purchase/stock needs.",
            "risk_level": "LOW",
            "supports_scopes": False,
            "requires_upload": False,
        },
    ]


def _row(
    *,
    check: str,
    status: str,
    risk_level: str,
    module: str,
    title: str,
    detail: str,
    recommended_action: str,
    action_href: str,
    safe_to_execute: bool,
    findings: list[str] | None = None,
) -> dict[str, Any]:
    row = {
        "check": check,
        "status": status,
        "risk_level": risk_level,
        "module": module,
        "title": title,
        "detail": detail,
        "recommended_action": recommended_action,
        "action_href": action_href,
        "safe_to_execute": safe_to_execute,
    }
    if findings:
        row["findings"] = findings
    return row


def _repo_root() -> Path:
    return Path(settings.BASE_DIR)


def _discovered_next_admin_routes() -> set[str]:
    app_dir = _repo_root() / "frontend" / "src" / "app"
    if not app_dir.is_dir():
        return set()
    out: set[str] = set()
    for page in app_dir.rglob("page.tsx"):
        try:
            rel = page.relative_to(app_dir)
        except ValueError:
            continue
        parts: list[str] = []
        for part in rel.parts[:-1]:
            if part.startswith("(") and part.endswith(")"):
                continue
            parts.append(part)
        route = "/" + "/".join(parts) if parts else "/"
        out.add(route.replace("//", "/"))
    return out


def _parse_admin_route_constants_from_routes_ts() -> list[str]:
    path = _repo_root() / "frontend" / "src" / "lib" / "routes.ts"
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8", errors="ignore")
    try:
        start = text.index("admin: {")
        end = text.index("partner:", start)
    except ValueError:
        return []
    block = text[start:end]
    return sorted(set(m.group(1) for m in re.finditer(r":\s*\"(/admin[^\"]+)\"", block)))


def _route_constant_has_page(const: str, discovered: set[str]) -> bool:
    c = const.rstrip("/") or "/"
    if c in discovered:
        return True
    # Nested dynamic pages: constant may be prefix of a concrete page path
    for d in discovered:
        if d.startswith(c + "/"):
            return True
    return False


def _check_setup_readiness() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    payload = compute_setup_checklist()
    if payload.get("is_ready_for_go_live"):
        rows.append(
            _row(
                check=CHECK_SETUP_READINESS,
                status="PASS",
                risk_level="LOW",
                module="Business Setup",
                title="Go-live checklist satisfied",
                detail=f"Percent complete: {payload.get('percent_complete', 0)}%.",
                recommended_action="Proceed with operational verification in Dry Run Control Center.",
                action_href="/admin/settings/business-setup/checklist",
                safe_to_execute=True,
            )
        )
        return rows
    for item in payload.get("items") or []:
        if item.get("level") != "required":
            continue
        if item.get("status") == "complete":
            continue
        rows.append(
            _row(
                check=CHECK_SETUP_READINESS,
                status="BLOCKED" if item.get("status") == "missing" else "WARNING",
                risk_level="MEDIUM",
                module="Business Setup",
                title=item.get("label") or "Required checklist item",
                detail=item.get("detail") or "",
                recommended_action="Complete this checklist item before go-live.",
                action_href=(item.get("route") or "/admin/settings/business-setup/checklist")[:512],
                safe_to_execute=False,
            )
        )
    if not rows:
        rows.append(
            _row(
                check=CHECK_SETUP_READINESS,
                status="WARNING",
                risk_level="LOW",
                module="Business Setup",
                title="Checklist not ready",
                detail="Required items are incomplete.",
                recommended_action="Review the business setup checklist.",
                action_href="/admin/settings/business-setup/checklist",
                safe_to_execute=False,
            )
        )
    return rows


def _check_accounting_setup() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    validation = AccountingSetupService.validate_accounting_setup()
    warnings = validation.get("warnings") or []
    if not warnings:
        rows.append(
            _row(
                check=CHECK_ACCOUNTING_SETUP,
                status="PASS",
                risk_level="LOW",
                module="Accounting",
                title="Finance account mappings look consistent",
                detail="No mapping warnings from AccountingSetupService.",
                recommended_action="Keep mappings updated when adding new finance accounts.",
                action_href="/admin/accounting/setup",
                safe_to_execute=True,
            )
        )
        return rows
    for w in warnings[:25]:
        msg = w.get("message", str(w))
        code = w.get("code", "WARNING")
        is_block = code in {"MISSING_REQUIRED_PURPOSE", "MAPPING_ACCOUNT_TYPE_MISMATCH"}
        rows.append(
            _row(
                check=CHECK_ACCOUNTING_SETUP,
                status="BLOCKED" if is_block else "WARNING",
                risk_level="HIGH" if is_block else "MEDIUM",
                module="Accounting",
                title=f"Mapping issue: {code}",
                detail=msg,
                recommended_action="Fix finance account to COA mappings in accounting setup.",
                action_href="/admin/accounting/setup",
                safe_to_execute=not is_block,
            )
        )
    if len(warnings) > 25:
        rows.append(
            _row(
                check=CHECK_ACCOUNTING_SETUP,
                status="WARNING",
                risk_level="LOW",
                module="Accounting",
                title="Additional mapping warnings truncated",
                detail=f"{len(warnings) - 25} more warning(s) not shown.",
                recommended_action="Review accounting setup warnings in the accounting setup screen.",
                action_href="/admin/accounting/setup",
                safe_to_execute=True,
            )
        )
    return rows


def _check_selective_reset_preview(*, options: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    preview = get_reset_preview()
    if options.get("target_app_labels"):
        reset_opts = BusinessResetOptions(
            preserve_usernames=tuple(options.get("preserve_usernames") or ()),
            preserve_user_ids=tuple(options.get("preserve_user_ids") or ()),
            preserve_superusers=bool(options.get("preserve_superusers", True)),
            delete_non_preserved_users=bool(options.get("delete_non_preserved_users", False)),
            clear_auth_artifacts=bool(options.get("clear_auth_artifacts", True)),
            target_app_labels=tuple(options["target_app_labels"]),
        )
    else:
        reset_opts = BusinessResetOptions(
            preserve_usernames=tuple(options.get("preserve_usernames") or ()),
            preserve_user_ids=tuple(options.get("preserve_user_ids") or ()),
            preserve_superusers=bool(options.get("preserve_superusers", True)),
            delete_non_preserved_users=bool(options.get("delete_non_preserved_users", False)),
            clear_auth_artifacts=bool(options.get("clear_auth_artifacts", True)),
        )
    plan = build_business_reset_plan(options=reset_opts)
    payments = int(preview.get("payments") or 0)
    subscriptions = int(preview.get("subscriptions") or 0)
    rows.append(
        _row(
            check=CHECK_SELECTIVE_RESET_PREVIEW,
            status="WARNING" if payments > 0 else "PASS",
            risk_level="HIGH" if payments > 0 else "MEDIUM",
            module="Data Management",
            title="Reset scope volume (read-only preview)",
            detail=f"Payments: {payments}, Subscriptions: {subscriptions}, Models in plan: {len(plan.get('model_counts', []))}.",
            recommended_action="Use reset-preview and typed confirmation before any real reset. Never reset production without offline backup.",
            action_href="/admin/settings/business-setup/checklist",
            safe_to_execute=payments == 0,
        )
    )
    return rows


def _check_export_import_preview(*, check: str, options: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    include_personal = bool(options.get("include_personal_data_checks"))
    include_financial = bool(options.get("include_financial_checks", True))
    if check == CHECK_IMPORT_PREVIEW:
        rows.append(
            _row(
                check=CHECK_IMPORT_PREVIEW,
                status="WARNING",
                risk_level="MEDIUM",
                module="Data Management",
                title="Import row validation requires a file",
                detail="Use existing import preview endpoints with an uploaded CSV/package for row-level validation. This control center never stores uploads.",
                recommended_action="Upload to the relevant import preview screen, then re-run import checks after preview passes.",
                action_href="/admin/settings/imports",
                safe_to_execute=True,
            )
        )
        return rows
    scope_note = ""
    labels = options.get("target_app_labels") or options.get("scopes")
    if labels:
        scope_note = f" Requested app scopes: {', '.join(str(x) for x in labels)}."
    rows.append(
        _row(
            check=CHECK_EXPORT_PREVIEW,
            status="PASS",
            risk_level="MEDIUM" if include_personal or include_financial else "LOW",
            module="Data Management",
            title="Export package risk review (metadata only)",
            detail=(
                "Personal-data awareness: "
                + ("ON — expect PII in customer-ledgers exports." if include_personal else "OFF.")
                + " Financial-data awareness: "
                + ("ON." if include_financial else "OFF.")
                + scope_note
            ),
            recommended_action="Use export preview from settings/imports or reports center before distributing files.",
            action_href="/admin/settings/imports",
            safe_to_execute=True,
        )
    )
    return rows


def _check_frontend_route_workflow() -> list[dict[str, Any]]:
    discovered = _discovered_next_admin_routes()
    if not discovered:
        return [
            _row(
                check=CHECK_FRONTEND_ROUTE_WORKFLOW,
                status="WARNING",
                risk_level="LOW",
                module="Admin Navigation",
                title="Frontend source tree not found on server",
                detail="Could not read frontend/src/app (common in API-only deployments).",
                recommended_action="Run this check in CI or a full-stack environment, or mark routes as deferred in navigation config.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=True,
            )
        ]
    constants = _parse_admin_route_constants_from_routes_ts()
    if not constants:
        return [
            _row(
                check=CHECK_FRONTEND_ROUTE_WORKFLOW,
                status="WARNING",
                risk_level="MEDIUM",
                module="Admin Navigation",
                title="Could not parse ROUTES.admin from routes.ts",
                detail="routes.ts may have changed format.",
                recommended_action="Restore ROUTES.admin block shape or extend the parser in dry_run_control_service.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=True,
            )
        ]
    missing = [c for c in constants if not _route_constant_has_page(c, discovered)]
    if not missing:
        return [
            _row(
                check=CHECK_FRONTEND_ROUTE_WORKFLOW,
                status="PASS",
                risk_level="LOW",
                module="Admin Navigation",
                title="All parsed ROUTES.admin entries resolve to pages",
                detail=f"Compared {len(constants)} route constants against {len(discovered)} discovered pages.",
                recommended_action="Keep route registry aligned when adding nav entries.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=True,
            )
        ]
    sample = ", ".join(missing[:8])
    return [
        _row(
            check=CHECK_FRONTEND_ROUTE_WORKFLOW,
            status="BLOCKED",
            risk_level="MEDIUM",
            module="Admin Navigation",
            title="Active route constant(s) may be missing a Next.js page",
            detail=f"Examples: {sample}{' …' if len(missing) > 8 else ''} ({len(missing)} total).",
            recommended_action="Create the missing page under src/app/(dashboard)/admin or mark the entry deferred in navigation.",
            action_href="/admin/settings/business-setup/dry-runs",
            safe_to_execute=False,
        )
    ]


def _check_api_contract() -> list[dict[str, Any]]:
    services_root = _repo_root() / "frontend" / "src"
    if not services_root.is_dir():
        return [
            _row(
                check=CHECK_API_CONTRACT,
                status="WARNING",
                risk_level="LOW",
                module="API",
                title="Frontend services directory not available",
                detail="Skipped heuristic API path scan.",
                recommended_action="Run in full repo checkout or CI.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=True,
            )
        ]
    hits: list[str] = []
    for path in list(services_root.rglob("*.ts")) + list(services_root.rglob("*.tsx")):
        if "node_modules" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for m in re.finditer(r"[`'\"](/api/v1/[a-zA-Z0-9_\-/?=&.]+)[`'\"]", text):
            hits.append(m.group(1))
    hits = sorted(set(hits))
    roots = (
        "/api/v1/admin/",
        "/api/v1/customer/",
        "/api/v1/partner/",
        "/api/v1/cashier/",
        "/api/v1/auth/",
        "/api/v1/inventory/",
        "/api/v1/billing/",
        "/api/v1/accounting/",
        "/api/v1/crm/",
        "/api/v1/branch-control/",
        "/api/v1/dashboards/",
        "/api/v1/notifications/",
        "/api/v1/manufacturing/",
        "/api/v1/public/",
        "/api/v1/executive/",
        "/api/v1/customers/",
        "/api/v1/reminders/",
        "/api/v1/service-desk/",
        "/api/v1/winner/",
    )
    bad = [h for h in hits if not any(h.startswith(r) for r in roots)]
    if not hits:
        return [
            _row(
                check=CHECK_API_CONTRACT,
                status="WARNING",
                risk_level="LOW",
                module="API",
                title="No /api/v1 string literals found under frontend/src",
                detail="Heuristic scan found zero matches (unexpected for this repo).",
                recommended_action="Confirm frontend checkout is complete.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=True,
            )
        ]
    if not bad:
        return [
            _row(
                check=CHECK_API_CONTRACT,
                status="PASS",
                risk_level="LOW",
                module="API",
                title="Service path literals use known /api/v1 roots",
                detail=f"Unique path literals scanned: {len(hits)}.",
                recommended_action="Extend allowed roots in dry_run_control_service if you add API modules.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=True,
            )
        ]
    return [
        _row(
            check=CHECK_API_CONTRACT,
            status="WARNING",
            risk_level="MEDIUM",
            module="API",
            title="Uncommon /api/v1 path prefix in frontend services",
            detail="; ".join(bad[:12]),
            recommended_action="Verify these paths exist in Django routes and match the intended role (admin vs customer).",
            action_href="/admin/settings/roles-permissions",
            safe_to_execute=True,
        )
    ]


def _check_lucky_plan_workflow() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    products_without_price = Product.objects.filter(Q(base_price__isnull=True) | Q(base_price__lte=0)).count()
    if products_without_price:
        rows.append(
            _row(
                check=CHECK_LUCKY_PLAN_WORKFLOW,
                status="WARNING",
                risk_level="MEDIUM",
                module="Lucky Plan",
                title="Products missing positive base_price",
                detail=f"{products_without_price} product(s) have null/zero base price.",
                recommended_action="Fix product master pricing before selling or drawing.",
                action_href="/admin/products",
                safe_to_execute=False,
            )
        )
    locked_batches = Batch.objects.filter(status=BatchStatus.LOCKED).count()
    open_batches = Batch.objects.filter(status=BatchStatus.OPEN).count()
    subs_on_locked = (
        Subscription.objects.filter(batch__status=BatchStatus.LOCKED, status=SubscriptionStatus.ACTIVE).count()
        if locked_batches
        else 0
    )
    if subs_on_locked:
        rows.append(
            _row(
                check=CHECK_LUCKY_PLAN_WORKFLOW,
                status="WARNING",
                risk_level="MEDIUM",
                module="Lucky Plan",
                title="Active subscriptions on LOCKED batches",
                detail=f"{subs_on_locked} active subscription(s) remain on locked batches (may be expected).",
                recommended_action="Validate batch lifecycle and draw commitments with operations.",
                action_href="/admin/batches",
                safe_to_execute=True,
            )
        )
    draws = LuckyDraw.objects.count()
    rows.append(
        _row(
            check=CHECK_LUCKY_PLAN_WORKFLOW,
            status="PASS",
            risk_level="LOW",
            module="Lucky Plan",
            title="Batch and draw inventory (read-only)",
            detail=f"OPEN batches: {open_batches}, LOCKED batches: {locked_batches}, LuckyDraw rows: {draws}.",
            recommended_action="Use lucky draw screens for commit/reveal; this check does not execute draws.",
            action_href="/admin/lucky-draws",
            safe_to_execute=True,
        )
    )
    return rows


def _check_payment_finance_safety(*, options: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not options.get("include_financial_checks", True):
        return [
            _row(
                check=CHECK_PAYMENT_FINANCE_SAFETY,
                status="PASS",
                risk_level="LOW",
                module="Finance",
                title="Financial checks skipped by request options",
                detail="include_financial_checks was false.",
                recommended_action="Re-run with financial checks enabled before go-live.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=True,
            )
        ]
    pay_total = Payment.objects.count()
    missing_rec = Payment.objects.filter(reconciliation__isnull=True).count()
    rec_total = PaymentReconciliation.objects.count()
    pending_comm = Commission.objects.filter(status=CommissionStatus.PENDING).count()
    rows.append(
        _row(
            check=CHECK_PAYMENT_FINANCE_SAFETY,
            status="WARNING" if missing_rec else "PASS",
            risk_level="HIGH" if missing_rec and pay_total else "MEDIUM",
            module="Finance",
            title="Payment vs reconciliation coverage (counts only)",
            detail=f"Payments: {pay_total}, reconciliations: {rec_total}, payments without reconciliation row: {missing_rec}. Pending commissions: {pending_comm}.",
            recommended_action="Investigate unreconciled payments via finance reconciliation tools (no auto-fix here).",
            action_href="/admin/finance/reconciliation",
            safe_to_execute=missing_rec == 0 or pay_total == 0,
        )
    )
    return rows


def _check_inventory_sales_purchase_readiness() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    products = Product.objects.count()
    items = InventoryItem.objects.filter(is_active=True).count()
    drafts = OpeningStockEntry.objects.filter(status=OpeningStockEntryStatus.DRAFT).count()
    posted = OpeningStockEntry.objects.filter(status=OpeningStockEntryStatus.POSTED).count()
    rows.append(
        _row(
            check=CHECK_INVENTORY_SALES_PURCHASE_READINESS,
            status="PASS",
            risk_level="LOW",
            module="Inventory",
            title="Inventory & product baseline",
            detail=f"Products: {products}, active inventory items: {items}, opening stock drafts: {drafts}, posted opening rows: {posted}.",
            recommended_action="Use inventory workspace and opening stock flows for operational readiness.",
            action_href="/admin/inventory/workspace",
            safe_to_execute=True,
        )
    )
    return rows


def _check_hr_readiness() -> list[dict[str, Any]]:
    admins = User.objects.filter(is_active=True, role=UserRole.ADMIN).count()
    cashiers = User.objects.filter(is_active=True, role=UserRole.CASHIER).count()
    staffish = User.objects.filter(is_active=True, is_staff=True).exclude(role=UserRole.CUSTOMER).count()
    rows: list[dict[str, Any]] = []
    if admins == 0:
        rows.append(
            _row(
                check=CHECK_HR_READINESS,
                status="BLOCKED",
                risk_level="HIGH",
                module="HR / Access",
                title="No active admin users",
                detail="At least one active ADMIN user is required for operations.",
                recommended_action="Create or reactivate an admin internal user.",
                action_href="/admin/settings/business-setup/staff",
                safe_to_execute=False,
            )
        )
    else:
        rows.append(
            _row(
                check=CHECK_HR_READINESS,
                status="PASS",
                risk_level="LOW",
                module="HR / Access",
                title="Internal roles present",
                detail=f"Active admins: {admins}, cashiers: {cashiers}, staff (non-customer): {staffish}.",
                recommended_action="Review role capabilities in settings if access is too broad.",
                action_href="/admin/settings/roles-permissions",
                safe_to_execute=True,
            )
        )
    return rows


def _check_finance_setup_readiness() -> list[dict[str, Any]]:
    validation = AccountingSetupService.validate_accounting_setup()
    warn = validation.get("warnings") or []
    settlement_codes = {
        "MISSING_ACTIVE_SETTLEMENT_ACCOUNT",
        "MISSING_LEDGER_PROFILE_ANCHOR",
        "SETTLEMENT_ACCOUNT_WITHOUT_COLLECTION_MAPPING",
        "FINANCE_ACCOUNT_LOOKS_CONCEPTUAL",
        "SETTLEMENT_ACCOUNT_NON_COLLECTION_PURPOSE",
    }
    findings = [w.get("message", "") for w in warn if w.get("code") in settlement_codes]
    status = "PASS"
    if any(w.get("code") in settlement_codes for w in warn):
        status = "WARNING" if validation.get("finance_accounts_ready") else "BLOCKED"
    return [
        _row(
            check=CHECK_FINANCE_SETUP_READINESS,
            status=status,
            risk_level="MEDIUM",
            module="Finance Setup",
            title="Settlement finance desk configuration",
            detail=f"finance_accounts_ready={validation.get('finance_accounts_ready')} ledger_anchor={validation.get('ledger_anchor_present')}.",
            recommended_action="Review /admin/accounting/setup and bootstrap or correct settlement flags on finance accounts.",
            action_href="/admin/settings/business-setup/finance-accounts",
            safe_to_execute=status != "BLOCKED",
            findings=findings or None,
        )
    ]


def _check_coa_setup_readiness() -> list[dict[str, Any]]:
    validation = AccountingSetupService.validate_accounting_setup()
    missing_coa = validation.get("missing_required_accounts") or []
    missing_map = validation.get("missing_required_mappings") or []
    findings: list[str] = []
    findings.extend([f"Missing COA system code: {c}" for c in missing_coa])
    findings.extend([f"Missing mapping purpose: {p}" for p in missing_map])
    code_hits = {w.get("code") for w in (validation.get("warnings") or [])}
    blocked = bool(missing_coa or missing_map or {"DUPLICATE_DEFAULT_MAPPING", "MAPPING_ACCOUNT_TYPE_MISMATCH"} & code_hits)
    status = "PASS"
    if missing_coa or missing_map:
        status = "BLOCKED"
    elif code_hits & {"MISSING_REQUIRED_PURPOSE"}:
        status = "WARNING"
    return [
        _row(
            check=CHECK_COA_SETUP_READINESS,
            status=status,
            risk_level="HIGH" if blocked else "MEDIUM",
            module="Chart of Accounts",
            title="COA + mapping coverage",
            detail=f"coa_ready={validation.get('coa_ready')} mappings_complete={validation.get('mappings_complete')}.",
            recommended_action="Seed or repair chart accounts and finance-to-COA mappings.",
            action_href="/admin/settings/business-setup/chart-accounts",
            safe_to_execute=not blocked,
            findings=findings or None,
        )
    ]


def _check_inventory_readiness_dry() -> list[dict[str, Any]]:
    snap = get_inventory_readiness_snapshot()
    if snap.get("module_not_configured"):
        return [
            _row(
                check=CHECK_INVENTORY_READINESS,
                status="WARNING",
                risk_level="LOW",
                module="Inventory",
                title="Inventory module not fully available",
                detail="Unable to evaluate product/inventory linkage on this deployment.",
                recommended_action="Verify database migrations and PRODUCT master availability.",
                action_href="/admin/inventory/workspace",
                safe_to_execute=True,
                findings=snap.get("warnings") and [w.get("message", "") for w in snap["warnings"]],
            )
        ]
    findings = [w.get("message", "") for w in snap.get("warnings") or []]
    status = "PASS" if snap.get("inventory_ready") else "WARNING"
    if snap.get("products_without_stock_count", 0) and not snap.get("inventory_ready"):
        status = "WARNING"
    return [
        _row(
            check=CHECK_INVENTORY_READINESS,
            status=status,
            risk_level="LOW",
            module="Inventory",
            title="Inventory readiness snapshot",
            detail=f"Tracked items: {snap.get('active_tracked_stock_items', 0)}, opening ready: {snap.get('opening_stock_ready')}.",
            recommended_action="; ".join(snap.get("recommended_actions") or ["Review /admin/inventory/readiness"]),
            action_href="/admin/inventory/readiness",
            safe_to_execute=True,
            findings=findings or None,
        )
    ]


def _check_direct_sale_workflow_readiness() -> list[dict[str, Any]]:
    numbering = get_document_numbering_state()
    numbering_ok = bool(numbering["checks"].get("direct_sale_invoice_numbering_configured"))
    sale = DirectSale.objects.order_by("-id").first()
    findings: list[str] = []
    stock_token = None
    if sale:
        stock_token, _, w = classify_direct_sale_stock_status(sale=sale)
        findings.extend(w)
        findings.append(f"Latest direct sale #{sale.id} stock_status={stock_token}")
    status = "PASS" if numbering_ok else "BLOCKED"
    if numbering_ok and stock_token in {"UNAVAILABLE", "NOT_CONFIGURED"}:
        status = "WARNING"
    return [
        _row(
            check=CHECK_DIRECT_SALE_WORKFLOW_READINESS,
            status=status,
            risk_level="HIGH" if not numbering_ok else "MEDIUM",
            module="Sales",
            title="Direct sale operational readiness",
            detail="Requires document numbering plus healthy stock telemetry for recent sales.",
            recommended_action="Configure document numbering and validate inventory profiles for retail SKUs.",
            action_href="/admin/sales/direct-sale/create",
            safe_to_execute=numbering_ok,
            findings=findings or None,
        )
    ]


def _check_delivery_handoff_readiness() -> list[dict[str, Any]]:
    try:
        from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType

        qs = ServiceDeskCase.objects.filter(case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY)
        open_like = qs.exclude(
            status__in={
                ServiceDeskCaseStatus.CLOSED,
                ServiceDeskCaseStatus.CANCELLED,
                ServiceDeskCaseStatus.RESOLVED,
                ServiceDeskCaseStatus.REJECTED,
            },
        ).count()
        total = qs.count()
    except Exception as exc:
        return [
            _row(
                check=CHECK_DELIVERY_HANDOFF_READINESS,
                status="WARNING",
                risk_level="LOW",
                module="Delivery Desk",
                title="Delivery desk metadata unavailable",
                detail=str(exc),
                recommended_action="Verify service_desk migrations and operational modules.",
                action_href="/admin/deliveries",
                safe_to_execute=True,
            )
        ]

    findings = [f"Retail delivery cases: {total}, non-terminal: {open_like}."]
    status = "PASS" if total or open_like == 0 else "WARNING"
    return [
        _row(
            check=CHECK_DELIVERY_HANDOFF_READINESS,
            status=status,
            risk_level="LOW",
            module="Delivery Desk",
            title="Retail delivery desk volume",
            detail=f"Tracked {total} direct-sale delivery desk case(s); {open_like} still active.",
            recommended_action="Dispatch backlog cases via /admin/deliveries.",
            action_href="/admin/deliveries",
            safe_to_execute=True,
            findings=findings,
        )
    ]


def _check_stock_need_workflow_readiness() -> list[dict[str, Any]]:
    has_active_warehouse_profile = Warehouse.objects.filter(is_active=True).exists()
    has_active_warehouse_location = StockLocation.objects.filter(
        is_active=True,
        location_type=StockLocationType.WAREHOUSE,
    ).exists()
    if not (has_active_warehouse_profile or has_active_warehouse_location):
        return [
            _row(
                check=CHECK_STOCK_NEED_WORKFLOW_READINESS,
                status="BLOCKED",
                risk_level="HIGH",
                module="Stock Needs",
                title="No active warehouse location configured",
                detail="Purchase/stock needs require at least one active warehouse profile or warehouse stock location.",
                recommended_action="Create at least one active warehouse stock location from Inventory Locations setup.",
                action_href="/admin/inventory/locations",
                safe_to_execute=False,
            )
        ]
    open_rows = PurchaseNeed.objects.filter(
        status__in=[
            PurchaseNeedStatus.OPEN,
            PurchaseNeedStatus.IN_REVIEW,
            PurchaseNeedStatus.ORDERED,
            PurchaseNeedStatus.PARTIALLY_FULFILLED,
        ]
    ).count()
    findings = [f"Open workflow stock needs: {open_rows}."]
    status = "WARNING" if open_rows else "PASS"
    return [
        _row(
            check=CHECK_STOCK_NEED_WORKFLOW_READINESS,
            status=status,
            risk_level="LOW",
            module="Stock Needs",
            title="Stock need workflow health",
            detail=f"{open_rows} non-terminal purchase/stock needs.",
            recommended_action="Clear purchase needs via procurement flows.",
            action_href="/admin/inventory/stock-needs",
            safe_to_execute=True,
            findings=findings,
        )
    ]


def _summarize(results: list[dict[str, Any]]) -> dict[str, int]:
    c = Counter((r.get("status") or "FAILED") for r in results)
    return {
        "pass": int(c.get("PASS", 0)),
        "warning": int(c.get("WARNING", 0)),
        "blocked": int(c.get("BLOCKED", 0)),
        "failed": int(c.get("FAILED", 0)),
    }


def run_dry_run_checks(
    *,
    checks: list[str],
    options: dict[str, Any],
    performed_by,
) -> dict[str, Any]:
    run_id = uuid4()
    results: list[dict[str, Any]] = []
    unknown = [c for c in checks if c not in ALL_CHECK_KEYS]
    if unknown:
        results.append(
            _row(
                check="UNKNOWN",
                status="FAILED",
                risk_level="LOW",
                module="Dry Run",
                title="Unknown check keys",
                detail=", ".join(unknown),
                recommended_action="Use only keys returned by /dry-runs/options/.",
                action_href="/admin/settings/business-setup/dry-runs",
                safe_to_execute=False,
            )
        )
    for key in checks:
        if key not in ALL_CHECK_KEYS:
            continue
        if key == CHECK_SETUP_READINESS:
            results.extend(_check_setup_readiness())
        elif key == CHECK_ACCOUNTING_SETUP:
            results.extend(_check_accounting_setup())
        elif key == CHECK_SELECTIVE_RESET_PREVIEW:
            results.extend(_check_selective_reset_preview(options=options))
        elif key in (CHECK_EXPORT_PREVIEW, CHECK_IMPORT_PREVIEW):
            results.extend(_check_export_import_preview(check=key, options=options))
        elif key == CHECK_FRONTEND_ROUTE_WORKFLOW:
            results.extend(_check_frontend_route_workflow())
        elif key == CHECK_API_CONTRACT:
            results.extend(_check_api_contract())
        elif key == CHECK_LUCKY_PLAN_WORKFLOW:
            results.extend(_check_lucky_plan_workflow())
        elif key == CHECK_PAYMENT_FINANCE_SAFETY:
            results.extend(_check_payment_finance_safety(options=options))
        elif key == CHECK_INVENTORY_SALES_PURCHASE_READINESS:
            results.extend(_check_inventory_sales_purchase_readiness())
        elif key == CHECK_HR_READINESS:
            results.extend(_check_hr_readiness())
        elif key == CHECK_FINANCE_SETUP_READINESS:
            results.extend(_check_finance_setup_readiness())
        elif key == CHECK_COA_SETUP_READINESS:
            results.extend(_check_coa_setup_readiness())
        elif key == CHECK_INVENTORY_READINESS:
            results.extend(_check_inventory_readiness_dry())
        elif key == CHECK_DIRECT_SALE_WORKFLOW_READINESS:
            results.extend(_check_direct_sale_workflow_readiness())
        elif key == CHECK_DELIVERY_HANDOFF_READINESS:
            results.extend(_check_delivery_handoff_readiness())
        elif key == CHECK_STOCK_NEED_WORKFLOW_READINESS:
            results.extend(_check_stock_need_workflow_readiness())
    summary = _summarize(results)
    with transaction.atomic():
        job = DryRunValidationJob.objects.create(
            run_id=run_id,
            checks=list(checks),
            options=options or {},
            status=DryRunValidationJob.Status.COMPLETED,
            summary=summary,
            results=results,
            created_by=performed_by,
        )
    return {
        "run_id": str(run_id),
        "job_id": job.id,
        "status": "COMPLETED",
        "summary": summary,
        "results": results,
        "generated_at": timezone.now().isoformat(),
    }


def list_dry_run_history(*, limit: int = 30) -> list[dict[str, Any]]:
    qs = DryRunValidationJob.objects.order_by("-created_at")[:limit]
    out = []
    for j in qs:
        out.append(
            {
                "run_id": str(j.run_id),
                "job_id": j.id,
                "status": j.status,
                "summary": j.summary,
                "checks": j.checks,
                "created_at": j.created_at.isoformat(),
                "created_by_username": getattr(j.created_by, "username", None),
            }
        )
    return out
