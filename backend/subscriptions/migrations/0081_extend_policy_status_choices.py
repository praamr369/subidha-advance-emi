# Generated manually for PG-2B lifecycle status expansion.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0080_policy_governance_metadata"),
    ]

    operations = [
        migrations.AlterField(
            model_name="policypage",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Draft"),
                    ("UNDER_REVIEW", "Under Review"),
                    ("APPROVED", "Approved"),
                    ("PUBLISHED", "Published"),
                    ("ARCHIVED", "Archived"),
                ],
                db_index=True,
                default="DRAFT",
                max_length=16,
            ),
        ),
    ]
