from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ai_assistant", "0002_aiknowledgesource_content_text"),
    ]

    operations = [
        migrations.AddField(
            model_name="aiquerylog",
            name="degraded",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="aiquerylog",
            name="degraded_reason",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="aiquerylog",
            name="requested_retrieval_mode",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddIndex(
            model_name="aiquerylog",
            index=models.Index(fields=["requested_retrieval_mode", "created_at"], name="ai_query_lo_request_bce5ef_idx"),
        ),
    ]

