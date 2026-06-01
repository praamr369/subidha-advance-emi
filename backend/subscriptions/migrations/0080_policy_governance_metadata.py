# Generated manually for PG-2B additive policy governance metadata.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill_policy_governance_metadata(apps, schema_editor):
    PolicyPage = apps.get_model("subscriptions", "PolicyPage")
    PolicyGovernanceMetadata = apps.get_model("subscriptions", "PolicyGovernanceMetadata")

    from subscriptions.services.policy_coverage_catalog import get_policy_spec_by_slug

    for policy in PolicyPage.objects.all().iterator():
        spec = get_policy_spec_by_slug(policy.slug)
        if spec:
            defaults = {
                "visibility": spec.visibility,
                "governance_category": spec.category,
                "coverage_group": spec.group,
                "requires_legal_review": spec.requires_legal_review,
                "requires_admin_acceptance": spec.requires_admin_acceptance,
                "source_template_key": spec.slug,
            }
        else:
            defaults = {
                "visibility": "PUBLIC",
                "governance_category": policy.category or "GENERAL",
                "coverage_group": "Public Legal",
                "requires_legal_review": True,
                "requires_admin_acceptance": False,
                "source_template_key": "",
            }
        PolicyGovernanceMetadata.objects.get_or_create(policy_id=policy.id, defaults=defaults)


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0079_backfill_business_compliance_review_state"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PolicyGovernanceMetadata",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, auto_now_add=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("visibility", models.CharField(choices=[("PUBLIC", "Public"), ("INTERNAL", "Internal")], db_index=True, default="PUBLIC", max_length=16)),
                ("governance_category", models.CharField(blank=True, db_index=True, default="", max_length=80)),
                ("coverage_group", models.CharField(blank=True, db_index=True, default="", max_length=120)),
                ("requires_legal_review", models.BooleanField(default=True)),
                ("requires_admin_acceptance", models.BooleanField(default=False)),
                ("submitted_for_review_at", models.DateTimeField(blank=True, null=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("review_due_date", models.DateField(blank=True, db_index=True, null=True)),
                ("internal_acceptance_at", models.DateTimeField(blank=True, null=True)),
                ("rejection_reason", models.TextField(blank=True, default="")),
                ("archive_reason", models.TextField(blank=True, default="")),
                ("source_template_key", models.CharField(blank=True, db_index=True, default="", max_length=120)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_policy_governance_records", to=settings.AUTH_USER_MODEL)),
                ("archived_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="archived_policy_governance_records", to=settings.AUTH_USER_MODEL)),
                ("internal_accepted_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="accepted_internal_policy_governance_records", to=settings.AUTH_USER_MODEL)),
                ("owner", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="owned_policy_governance_records", to=settings.AUTH_USER_MODEL)),
                ("policy", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="governance_metadata", to="subscriptions.policypage")),
                ("reviewer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reviewed_policy_governance_records", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "policy_governance_metadata",
                "ordering": ["policy__slug", "-policy__version", "-id"],
                "indexes": [
                    models.Index(fields=["visibility", "governance_category"], name="policy_gov_visibility_cat_idx"),
                    models.Index(fields=["coverage_group", "visibility"], name="policy_gov_group_vis_idx"),
                ],
            },
        ),
        migrations.RunPython(backfill_policy_governance_metadata, migrations.RunPython.noop),
    ]
