#!/usr/bin/env python3
"""
Comprehensive Module Audit Tool
Checks backend routes and frontend pages sync for all 17 modules
"""

import os
import re
from pathlib import Path
from collections import defaultdict

def count_backend_routes(route_file):
    """Count routes in a backend route file"""
    if not os.path.exists(route_file):
        return 0
    with open(route_file, 'r') as f:
        content = f.read()
        # Count path() and router.register() definitions
        paths = len(re.findall(r'path\(', content))
        registers = len(re.findall(r'router\.register\(', content))
        return paths + registers

def count_frontend_pages(module_path):
    """Count page.tsx files in a frontend module"""
    if not os.path.exists(module_path):
        return 0
    count = 0
    for root, dirs, files in os.walk(module_path):
        for file in files:
            if file == 'page.tsx':
                count += 1
    return count

def get_module_dirs(base_path):
    """Get all module directories"""
    if not os.path.exists(base_path):
        return []
    return sorted([d for d in os.listdir(base_path)
                   if os.path.isdir(os.path.join(base_path, d))
                   and not d.startswith('_')])

def main():
    base_backend = "backend/api/v1/routes"
    base_frontend = "frontend/src/app/(dashboard)/admin"

    print("=" * 120)
    print("COMPREHENSIVE MODULE AUDIT - Backend/Frontend Sync Analysis")
    print("=" * 120)
    print()

    # Module mapping (17 modules)
    modules = {
        "① Command Center": {
            "backend": ["admin.py", "admin_control_foundation.py", "admin_control_month_end.py"],
            "frontend": ["frontend/src/app/(dashboard)/admin"],
            "description": "Dashboard, setup, security, monitoring"
        },
        "② Profiles & Parties": {
            "backend": ["customer.py", "customers.py", "partner.py", "staff.py"],
            "frontend": ["customers", "partners", "staff"],
            "description": "Customers, partners, internal users, account setup"
        },
        "③ CRM & Requests": {
            "backend": ["crm.py", "admin_growth_requests.py"],
            "frontend": ["crm", "growth"],
            "description": "Leads, opportunities, growth requests, partner payments"
        },
        "④ Sales & Contracts": {
            "backend": ["contract_amendments_admin.py"],
            "frontend": ["subscriptions", "contracts"],
            "description": "Subscriptions, direct sales, amendments"
        },
        "⑤ Lucky Plan Control": {
            "backend": ["admin.py"],  # Integrated in admin
            "frontend": ["lucky"],
            "description": "Lucky draw, plans, winners"
        },
        "⑥ Collections & Cashier": {
            "backend": ["cashier.py", "collection_control_center.py"],
            "frontend": ["cashier", "collections"],
            "description": "Cash desk, payments, receipts, outstanding"
        },
        "⑦ Finance Operations": {
            "backend": ["admin_finance_bridge.py"],
            "frontend": ["finance"],
            "description": "Deposits, refunds, waivers, account mapping"
        },
        "⑧ Accounting & Reconciliation": {
            "backend": ["accounting.py", "admin_accounting_bridge_readiness.py", "admin_accounting_export_reports.py"],
            "frontend": ["accounting"],
            "description": "GL, tax docs, GSTR, reconciliation, audit"
        },
        "⑨ Inventory & Stock": {
            "backend": ["inventory.py"],
            "frontend": ["inventory"],
            "description": "Products, stock levels, ledger, warehouse"
        },
        "⑩ Purchases & Vendors": {
            "backend": ["vendor.py"],
            "frontend": ["vendors", "purchases"],
            "description": "Vendors, sourcing, POs, quotes, payments"
        },
        "⑪ Manufacturing": {
            "backend": ["manufacturing.py"],
            "frontend": ["manufacturing"],
            "description": "BOMs, jobs, workcenters"
        },
        "⑫ Delivery & Service": {
            "backend": ["service_desk.py"],
            "frontend": ["delivery", "service-desk"],
            "description": "Handover, POD, returns, inspection, complaints"
        },
        "⑬ HR & Staff": {
            "backend": ["admin_hr_staff.py"],
            "frontend": ["hr"],
            "description": "Staff, documents, attendance, payroll, expense claims"
        },
        "⑭ BI & Reports": {
            "backend": ["admin_financial_intelligence.py", "executive.py", "dashboard_surfaces.py"],
            "frontend": ["bi", "reports"],
            "description": "Executive, performance, analytics, financial, leaderboard"
        },
        "⑮ Growth & Offers": {
            "backend": ["admin_growth_offers.py"],
            "frontend": ["offers", "growth-templates"],
            "description": "Plan templates, offer packages, growth control"
        },
        "⑯ Settings & Governance": {
            "backend": ["admin_password_reset_requests.py", "admin_policy_governance.py"],
            "frontend": ["settings", "governance"],
            "description": "Internal users, password reset, policies, permissions"
        },
        "⑰ Enterprise Control": {
            "backend": ["admin_retention_intelligence.py", "admin_customer_risk.py"],
            "frontend": ["enterprise", "operations"],
            "description": "Operations queue, data quality, compliance, retention"
        }
    }

    total_backend_routes = 0
    total_frontend_pages = 0
    sync_issues = []

    for module_name, config in modules.items():
        backend_routes = 0
        frontend_pages = 0

        # Count backend routes
        for route_file in config["backend"]:
            route_path = os.path.join(base_backend, route_file)
            count = count_backend_routes(route_path)
            backend_routes += count

        # Count frontend pages
        for fe_module in config["frontend"]:
            fe_path = os.path.join(base_frontend, fe_module)
            count = count_frontend_pages(fe_path)
            frontend_pages += count

        total_backend_routes += backend_routes
        total_frontend_pages += frontend_pages

        # Check sync
        sync_ratio = frontend_pages / backend_routes if backend_routes > 0 else 0
        is_synced = 0.5 < sync_ratio < 1.5  # Acceptable range: pages should be 50%-150% of routes

        status = "✅ SYNCED" if is_synced else "⚠️  OUT OF SYNC"
        if not is_synced:
            sync_issues.append({
                "module": module_name,
                "backend": backend_routes,
                "frontend": frontend_pages,
                "ratio": sync_ratio
            })

        print(f"{module_name}")
        print(f"  Backend Routes: {backend_routes:>3}  |  Frontend Pages: {frontend_pages:>3}  |  Ratio: {sync_ratio:.2f}  |  {status}")
        print(f"  Description: {config['description']}")
        print()

    print("=" * 120)
    print(f"TOTAL: Backend Routes = {total_backend_routes}  |  Frontend Pages = {total_frontend_pages}")
    print(f"Overall Sync Ratio: {total_frontend_pages/total_backend_routes:.2f}")
    print("=" * 120)
    print()

    if sync_issues:
        print("⚠️  MODULES OUT OF SYNC (need investigation):")
        print("-" * 120)
        for issue in sync_issues:
            print(f"{issue['module']:20} | Backend: {issue['backend']:3} | Frontend: {issue['frontend']:3} | Ratio: {issue['ratio']:.2f}")
        print()
    else:
        print("✅ All modules are properly synced!")
        print()

if __name__ == "__main__":
    main()
