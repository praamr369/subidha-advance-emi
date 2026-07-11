from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="InternalReview",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reviewer_name", models.CharField(max_length=150)),
                ("reviewer_phone", models.CharField(blank=True, max_length=15)),
                ("rating", models.PositiveSmallIntegerField()),
                ("title", models.CharField(blank=True, max_length=200)),
                ("body", models.TextField()),
                ("status", models.CharField(
                    choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")],
                    db_index=True,
                    default="pending",
                    max_length=20,
                )),
                ("is_featured", models.BooleanField(default=False)),
                ("admin_reply", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="reviews",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
