from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0034_vendor_staff_kyc_documents"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendorkycdocument",
            name="expiry_date",
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="staffkycdocument",
            name="expiry_date",
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
    ]
