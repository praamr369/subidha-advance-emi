#!/usr/bin/env python
"""
Export comprehensive setup snapshot including:
- Business configuration (already in basic snapshot)
- Public site content and configuration
- Policy pages and governance metadata
- Business compliance documents and review state
- Public content blocks
"""

import os
import sys
import json
import django
from datetime import datetime
from typing import Any, Dict, List

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')
django.setup()

from django.apps import apps
from django.core import serializers


def export_snapshot(output_path: str) -> bool:
    """Export comprehensive snapshot to JSON file."""

    print("=" * 70)
    print("COMPREHENSIVE SETUP SNAPSHOT EXPORT")
    print("=" * 70)
    print()

    # Models to export (in dependency order)
    models_to_export = [
        # Already in basic snapshot but good to have complete
        'subscriptions.BusinessProfile',
        'accounting.BusinessTaxProfile',
        'accounting.ChartOfAccount',
        'accounting.FinanceAccount',
        'accounting.FinanceAccountCoaMapping',
        'accounting.AccountingPostingProfile',
        'branch_control.Branch',
        'branch_control.CashCounter',
        'inventory.StockLocation',
        'subscriptions.ProductCategoryMaster',
        'subscriptions.ProductSubcategoryMaster',

        # Public site & policy governance
        'subscriptions.PublicBusinessProfile',
        'subscriptions.PolicyPage',
        'subscriptions.PolicyGovernanceMetadata',
        'subscriptions.PublicContentBlock',

        # Business compliance
        'subscriptions.BusinessComplianceDocument',
        'subscriptions.BusinessComplianceDocumentReviewState',

        # Policy review dates
        'subscriptions.PolicyReviewDate',
    ]

    snapshot = {
        'version': 1,
        'schema_version': 2,
        'kind': 'comprehensive_setup_snapshot',
        'exported_at': datetime.utcnow().isoformat() + 'Z',
        'exported_by': 'system-export',
        'source_environment': os.getenv('ENVIRONMENT', 'local'),
        'sections': {},
        'counts': {},
    }

    total_records = 0

    try:
        for model_path in models_to_export:
            try:
                app_label, model_name = model_path.rsplit('.', 1)
                model_class = apps.get_model(app_label, model_name)

                # Query all records
                records = model_class.objects.all()
                record_count = records.count()

                if record_count == 0:
                    snapshot['sections'][model_path] = []
                    snapshot['counts'][model_path] = 0
                    print(f"[SKIP] {model_path}: 0 records")
                    continue

                # Serialize records
                serialized = []
                for obj in records:
                    serialized.append({
                        'model': model_path.lower(),
                        'pk': obj.pk,
                        'fields': _model_to_dict(obj, model_class),
                    })

                snapshot['sections'][model_path] = serialized
                snapshot['counts'][model_path] = record_count
                total_records += record_count
                print(f"[OK] {model_path}: {record_count} records")

            except LookupError:
                print(f"[SKIP] {model_path}: Model not found")
            except Exception as e:
                print(f"[WARN] {model_path}: {str(e)}")
                continue

        # Write to file
        print()
        print("=" * 70)
        print(f"Writing snapshot to: {output_path}")
        print("=" * 70)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(snapshot, f, indent=2, default=str)

        print()
        print("[SUCCESS] Snapshot exported successfully!")
        print(f"Total records: {total_records}")
        print(f"File size: {os.path.getsize(output_path) / 1024:.1f} KB")
        print()
        return True

    except Exception as e:
        print()
        print("[FAIL] Export failed:")
        print(f"Error: {str(e)}")
        print()
        return False


def _model_to_dict(obj: Any, model_class: Any) -> Dict[str, Any]:
    """Convert model instance to dictionary, handling all field types."""

    result = {}
    for field in model_class._meta.get_fields():
        if field.name.startswith('_'):
            continue

        # Skip reverse relations
        if hasattr(field, 'many_to_one') and not field.many_to_one:
            if hasattr(field, 'one_to_many') or hasattr(field, 'many_to_many'):
                continue

        try:
            value = getattr(obj, field.name, None)

            # Handle ForeignKey: store only the ID
            if hasattr(field, 'many_to_one') and field.many_to_one:
                if value is not None:
                    result[field.name] = value.pk
                else:
                    result[field.name] = None
            # Handle ManyToMany: skip (can be re-established)
            elif hasattr(field, 'many_to_many') and field.many_to_many:
                continue
            # Handle all other fields
            else:
                result[field.name] = value

        except Exception:
            continue

    return result


if __name__ == '__main__':
    output_path = sys.argv[1] if len(sys.argv) > 1 else 'comprehensive-snapshot.json'
    success = export_snapshot(output_path)
    sys.exit(0 if success else 1)
