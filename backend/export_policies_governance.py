#!/usr/bin/env python
"""
Export all policies, governance metadata, and seed templates from production.

Exports:
- PolicyPage (content, status, versioning)
- PolicyGovernanceMetadata (lifecycle, review dates, coverage)
- All supporting data for policy governance cockpit
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


def export_policies_snapshot(output_path: str) -> bool:
    """Export all policies and governance metadata."""

    print("=" * 70)
    print("POLICY GOVERNANCE SNAPSHOT EXPORT")
    print("=" * 70)
    print()

    models_to_export = [
        'subscriptions.PolicyPage',
        'subscriptions.PolicyGovernanceMetadata',
    ]

    snapshot = {
        'version': 1,
        'schema_version': 2,
        'kind': 'policy_governance_snapshot',
        'exported_at': datetime.utcnow().isoformat() + 'Z',
        'exported_by': 'system-export',
        'source_environment': os.getenv('ENVIRONMENT', 'production'),
        'sections': {},
        'counts': {},
        'governance_cockpit': {},
    }

    total_records = 0

    try:
        # Export models
        for model_path in models_to_export:
            try:
                app_label, model_name = model_path.rsplit('.', 1)
                model_class = apps.get_model(app_label, model_name)

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

        # Generate governance cockpit summary
        print()
        print("[GENERATING] Governance cockpit summary...")

        try:
            from subscriptions.models import PolicyPage, PolicyGovernanceMetadata

            policies = PolicyPage.objects.all()
            cockpit = {
                'total_policies': policies.count(),
                'by_status': {},
                'governance_stats': {
                    'under_review': 0,
                    'published': 0,
                    'archived': 0,
                    'requires_legal_review': 0,
                    'metadata_mismatch': 0,
                },
            }

            # Count by status
            for status in ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']:
                count = policies.filter(status=status).count()
                if count > 0:
                    cockpit['by_status'][status] = count

            # Governance metadata stats
            metadata = PolicyGovernanceMetadata.objects.all()
            cockpit['governance_stats']['under_review'] = metadata.filter(
                visibility='PUBLIC'
            ).count()
            cockpit['governance_stats']['published'] = policies.filter(
                status='PUBLISHED'
            ).count()
            cockpit['governance_stats']['archived'] = policies.filter(
                status='ARCHIVED'
            ).count()
            cockpit['governance_stats']['requires_legal_review'] = metadata.filter(
                requires_legal_review=True
            ).count()

            snapshot['governance_cockpit'] = cockpit
            print(f"[OK] Cockpit summary generated")

        except Exception as e:
            print(f"[WARN] Could not generate cockpit summary: {str(e)}")

        # Write snapshot
        print()
        print("=" * 70)
        print(f"Writing snapshot to: {output_path}")
        print("=" * 70)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(snapshot, f, indent=2, default=str)

        print()
        print("[SUCCESS] Policy snapshot exported successfully!")
        print(f"Total policy records: {total_records}")
        print(f"File size: {os.path.getsize(output_path) / 1024:.1f} KB")
        print()

        # Print summary
        print("Summary:")
        for status, count in snapshot['governance_cockpit'].get('by_status', {}).items():
            print(f"  - {status}: {count} policies")

        print()
        return True

    except Exception as e:
        print()
        print("[FAIL] Export failed:")
        print(f"Error: {str(e)}")
        print()
        return False


def _model_to_dict(obj: Any, model_class: Any) -> Dict[str, Any]:
    """Convert model instance to dictionary."""

    result = {}
    for field in model_class._meta.get_fields():
        if field.name.startswith('_'):
            continue

        if hasattr(field, 'many_to_one') and not field.many_to_one:
            if hasattr(field, 'one_to_many') or hasattr(field, 'many_to_many'):
                continue

        try:
            value = getattr(obj, field.name, None)

            # Handle ForeignKey
            if hasattr(field, 'many_to_one') and field.many_to_one:
                if value is not None:
                    result[field.name] = value.pk
                else:
                    result[field.name] = None
            # Skip ManyToMany
            elif hasattr(field, 'many_to_many') and field.many_to_many:
                continue
            # All other fields
            else:
                result[field.name] = value

        except Exception:
            continue

    return result


if __name__ == '__main__':
    output_path = sys.argv[1] if len(sys.argv) > 1 else 'policy-governance-snapshot.json'
    success = export_policies_snapshot(output_path)
    sys.exit(0 if success else 1)
