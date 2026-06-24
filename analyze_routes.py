import re
import json
from pathlib import Path
from collections import defaultdict

def extract_routes_from_file(filepath):
    """Extract route patterns from a Django routes file"""
    routes = []
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern: path("xyz", View.as_view()) or path("xyz/", handler)
    pattern = r'path\(["\']([^"\']*)["\'],\s*([^,\)]+)'
    matches = re.findall(pattern, content)
    
    for route, handler in matches:
        if route and not route.startswith(''):  # Skip includes
            routes.append({
                'path': route,
                'handler': handler.strip(),
                'file': Path(filepath).name
            })
    
    return routes

def categorize_route(path):
    """Categorize route into module and subcategory"""
    categories = {
        'Command Center': ['dashboard/', 'summary/', 'control-center/', 'command-center/'],
        'Profiles & Parties': ['customers/', 'customer/', 'partners/', 'partner/', 'accounts/', 'users/', 'profiles/'],
        'CRM & Requests': ['crm/', 'leads/', 'opportunities/', 'follow-ups/', 'collection-requests/', 'partner-payment'],
        'Sales & Contracts': ['contracts/', 'contract-amendments/', 'subscriptions/', 'direct-sale/', 'billing/'],
        'Lucky Plan Control': ['lucky/', 'winners/', 'lucky-draw/', 'lucky-emis/'],
        'Collections & Cashier': ['collections/', 'collection-control/', 'cashier/', 'cash-desk/', 'receipts/'],
        'Finance Operations': ['finance/', 'finance-transfers/', 'deposits/', 'refunds/', 'waiver-loss/'],
        'Accounting & Reconciliation': ['accounting/', 'ledger/', 'reconciliation/', 'gstr/', 'tax', 'journals/'],
        'Inventory & Stock': ['inventory/', 'stock/', 'stock-ledger/', 'warehouses/'],
        'Purchases & Vendors': ['purchase/', 'vendor/', 'vendors/', 'orders/', 'quotations/'],
        'Manufacturing': ['manufacturing/', 'bom/', 'production/', 'jobs/'],
        'Delivery & Service': ['delivery/', 'pod/', 'service-desk/', 'returns/', 'complaints/', 'tickets/'],
        'HR & Staff': ['hr/', 'staff/', 'attendance/', 'payroll/', 'leave-requests/', 'expense-claims/'],
        'BI & Reports': ['reports/', 'bi/', 'insights/', 'executive/'],
        'Growth & Offers': ['growth/', 'offers/', 'offer-packages/', 'plan-templates/'],
        'Settings & Governance': ['settings/', 'internal-users/', 'password-reset/', 'policies/', 'permissions/'],
        'Enterprise Control': ['audit/', 'data-quality/', 'aml/', 'compliance/', 'operations/', 'retention/'],
    }
    
    for module, keywords in categories.items():
        for keyword in keywords:
            if keyword in path.lower():
                return module
    
    return 'Unclassified'

# Extract all routes
all_routes = []
routes_dir = Path('backend/api/v1/routes')

for route_file in sorted(routes_dir.glob('*.py')):
    if route_file.name != '__init__.py' and route_file.name != '__pycache__':
        routes = extract_routes_from_file(route_file)
        all_routes.extend(routes)

# Categorize and organize
categorized = defaultdict(lambda: defaultdict(list))
for route in all_routes:
    module = categorize_route(route['path'])
    
    # Determine subcategory from path
    parts = route['path'].split('/')
    subcategory = parts[0] if parts else 'Other'
    
    categorized[module][subcategory].append(route)

# Print summary
print(f"Total routes found: {len(all_routes)}")
print(f"\nModules breakdown:")
for module in sorted(categorized.keys()):
    total = sum(len(routes) for routes in categorized[module].values())
    print(f"  {module}: {total} routes")
    for subcategory in sorted(categorized[module].keys()):
        print(f"    - {subcategory}: {len(categorized[module][subcategory])}")

# Save for Excel creation
with open('route_analysis.json', 'w') as f:
    data = {}
    for module, subcats in categorized.items():
        data[module] = {}
        for subcat, routes_list in subcats.items():
            data[module][subcat] = [{'path': r['path'], 'handler': r['handler'], 'file': r['file']} for r in routes_list]
    json.dump(data, f, indent=2)

print(f"\nRoute analysis saved to route_analysis.json")
