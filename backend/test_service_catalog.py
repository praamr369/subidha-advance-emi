#!/usr/bin/env python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from inventory.services.service_catalog_list_service import build_service_catalog_list

result = build_service_catalog_list()
print(f"Count: {result['count']}")
print(f"Summary: {result['summary']}")
print(f"Results count: {len(result['results'])}")
for row in result['results']:
    print(f"  - {row['code']}: {row['name']} ({row['status']})")
