# Tables were already physically dropped by 0008's RunSQL. This migration only
# updates Django's migration state so it no longer tracks those models.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("manufacturing", "0008_add_job_type_finishing"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],  # tables already gone — nothing to do in DB
            state_operations=[
                migrations.RemoveField(model_name="polishingservicecharge", name="labor_line"),
                migrations.RemoveField(model_name="polishingmaterialline", name="polishing_order"),
                migrations.RemoveField(model_name="polishingorder", name="created_by"),
                migrations.RemoveField(model_name="polishingorder", name="finished_good_inventory_item"),
                migrations.RemoveField(model_name="polishingservicecharge", name="polishing_order"),
                migrations.DeleteModel(name="PolishingLaborLine"),
                migrations.DeleteModel(name="PolishingMaterialLine"),
                migrations.DeleteModel(name="PolishingOrder"),
                migrations.DeleteModel(name="PolishingServiceCharge"),
            ],
        ),
    ]
