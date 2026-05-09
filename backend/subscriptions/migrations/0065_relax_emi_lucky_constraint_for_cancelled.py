from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0064_operationalcancellation_manual_source"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="subscription",
            name="chk_batch_and_lucky_required_for_emi",
        ),
        migrations.AddConstraint(
            model_name="subscription",
            constraint=models.CheckConstraint(
                condition=(
                    Q(
                        plan_type="EMI",
                        status="CANCELLED",
                        batch__isnull=False,
                    )
                    | Q(
                        plan_type="EMI",
                        batch__isnull=False,
                        lucky_id__isnull=False,
                    )
                    & ~Q(status="CANCELLED")
                    | ~Q(plan_type="EMI")
                ),
                name="chk_batch_and_lucky_required_for_emi",
            ),
        ),
    ]
