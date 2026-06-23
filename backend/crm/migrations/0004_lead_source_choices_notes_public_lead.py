from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0003_rename_crm_customer_customer_921db4_idx_crm_custome_custome_bea333_idx_and_more"),
        ("subscriptions", "0098_growth_requests_p5b"),
    ]

    operations = [
        migrations.AlterField(
            model_name="lead",
            name="source",
            field=models.CharField(
                choices=[
                    ("WALK_IN", "Walk In"),
                    ("REFERRAL", "Referral"),
                    ("ONLINE_ENQUIRY", "Online Enquiry"),
                    ("PARTNER", "Partner"),
                    ("BROCHURE", "Brochure"),
                    ("EVENT", "Event"),
                    ("SOCIAL_MEDIA", "Social Media"),
                    ("PHONE_CALL", "Phone Call"),
                    ("INTERNAL", "Internal"),
                    ("OTHER", "Other"),
                ],
                db_index=True,
                max_length=60,
            ),
        ),
        migrations.AddField(
            model_name="lead",
            name="notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="lead",
            name="public_lead",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="crm_pipeline_lead",
                to="subscriptions.publiclead",
            ),
        ),
    ]
