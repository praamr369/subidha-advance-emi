#!/usr/bin/env python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from rest_framework.request import Request
from api.v1.views.inventory import AdminStockReservationListView

User = get_user_model()

# Get admin user
admin = User.objects.filter(username='admin', is_superuser=True).first()
if not admin:
    print("Admin user not found. Creating...")
    admin = User.objects.create_superuser('admin', 'admin@example.com', 'admin@123')

# Create a fake request
factory = RequestFactory()
django_request = factory.get('/api/v1/admin/inventory/reservations/?page=1&page_size=50')
django_request.user = admin
request = Request(django_request)

# Test the view
view = AdminStockReservationListView()
view.request = request

try:
    response = view.get(request)
    print("=" * 70)
    print("API ENDPOINT TEST - SUCCESS ✓")
    print("=" * 70)
    print()
    print("✓ AdminStockReservationListView.get() executed successfully")
    print(f"✓ Response status code: {response.status_code}")
    print()

    # Parse the response data
    import json
    data = json.loads(response.rendered_content)

    print("Response Data:")
    print(f"  - Count: {data['count']}")
    print(f"  - Page: {data['page']}")
    print(f"  - Page Size: {data['page_size']}")
    print(f"  - Num Pages: {data['num_pages']}")
    print()

    print("KPI Summary:")
    print(f"  - Total Reservations: {data['summary']['total_reservations']}")
    print(f"  - Total Reserved Qty: {data['summary']['total_reserved_qty']}")
    print(f"  - Active Count: {data['summary']['active_count']}")
    print(f"  - Released Count: {data['summary']['released_count']}")
    print(f"  - Source Modules: {', '.join(data['summary']['source_modules'])}")
    print()

    print("Sample Results:")
    for i, row in enumerate(data['results'][:2], 1):
        print(f"  {i}. {row['product_code']} - {row['product_name']}")
        print(f"     Warehouse: {row['warehouse_name']}, Qty: {row['quantity']}, Status: {row['status']}")

    print()
    print("=" * 70)
    print("FIX VERIFIED - Import issue resolved!")
    print("=" * 70)

except Exception as e:
    print("=" * 70)
    print("API ENDPOINT TEST - FAILED ✗")
    print("=" * 70)
    print(f"Error: {type(e).__name__}: {str(e)}")
    import traceback
    traceback.print_exc()
