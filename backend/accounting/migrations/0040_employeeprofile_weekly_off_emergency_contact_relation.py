from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0039_leasecontract_lease_payment_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="employeeprofile",
            name="emergency_contact_relation",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="weekly_off",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
