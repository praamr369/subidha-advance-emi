#!/usr/bin/env python
"""
Load production setup snapshot into database.
Use after deploying to production when database is fresh/reset.
"""

import os
import sys
import json
import django
from pathlib import Path
from typing import Any, Dict

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')
django.setup()

from django.apps import apps
from django.db import transaction

def load_snapshot(snapshot_path: str) -> bool:
    """Load setup snapshot into database."""

    if not Path(snapshot_path).exists():
        print(f"❌ Snapshot file not found: {snapshot_path}")
        return False

    with open(snapshot_path, 'r') as f:
        snapshot = json.load(f)

    print("=" * 70)
    print("PRODUCTION SETUP SNAPSHOT LOADER")
    print("=" * 70)
    print(f"Environment: {snapshot.get('source_environment', 'unknown')}")
    print(f"Exported: {snapshot.get('exported_at', 'unknown')}")
    print(f"Exported by: {snapshot.get('exported_by', 'unknown')}")
    print()

    sections = snapshot.get('sections', {})
    total_loaded = 0

    try:
        with transaction.atomic():
            for model_path, records in sections.items():
                if not records:
                    print(f"⊘ {model_path}: 0 records (skipped)")
                    continue

                try:
                    # Parse model_path like "subscriptions.BusinessProfile"
                    app_label, model_name = model_path.rsplit('.', 1)
                    model_class = apps.get_model(app_label, model_name)

                    count = 0
                    for record in records:
                        pk = record.get('pk')
                        fields = record.get('fields', {})

                        # Create or update
                        obj, created = model_class.objects.update_or_create(
                            pk=pk,
                            defaults=fields
                        )
                        count += 1

                    print(f"✓ {model_path}: {count} records loaded")
                    total_loaded += count

                except Exception as e:
                    print(f"✗ {model_path}: ERROR - {str(e)}")
                    raise

        print()
        print("=" * 70)
        print(f"✅ SNAPSHOT LOADED SUCCESSFULLY")
        print(f"Total records: {total_loaded}")
        print("=" * 70)
        return True

    except Exception as e:
        print()
        print("=" * 70)
        print("❌ SNAPSHOT LOAD FAILED")
        print("=" * 70)
        print(f"Error: {str(e)}")
        print()
        print("IMPORTANT: Database transaction rolled back.")
        print("Your database is unchanged.")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python setup_snapshot_loader.py <snapshot_path>")
        print()
        print("Example:")
        print("  python setup_snapshot_loader.py /path/to/subidha-settings-snapshot-2026-07-05.json")
        sys.exit(1)

    snapshot_path = sys.argv[1]
    success = load_snapshot(snapshot_path)
    sys.exit(0 if success else 1)
