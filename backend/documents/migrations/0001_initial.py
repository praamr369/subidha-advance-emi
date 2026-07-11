from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import documents.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumentRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category", models.CharField(
                    choices=[
                        ("invoice", "Invoice"),
                        ("purchase_invoice", "Purchase Invoice"),
                        ("receipt", "Receipt"),
                        ("contract", "Contract"),
                        ("kyc", "KYC Document"),
                        ("po", "Purchase Order"),
                        ("journal", "Journal Entry"),
                        ("legal", "Legal Document"),
                        ("other", "Other"),
                    ],
                    db_index=True,
                    max_length=30,
                )),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("file", models.FileField(upload_to=documents.models.document_upload_path)),
                ("original_filename", models.CharField(blank=True, max_length=255)),
                ("file_size", models.PositiveBigIntegerField(default=0)),
                ("mime_type", models.CharField(blank=True, max_length=100)),
                ("object_id", models.PositiveBigIntegerField(blank=True, null=True)),
                ("retention_date", models.DateField(blank=True, null=True)),
                ("tags", models.CharField(blank=True, max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("content_type", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to="contenttypes.contenttype",
                )),
                ("uploaded_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="uploaded_documents",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="documentrecord",
            index=models.Index(fields=["category", "created_at"], name="documents_d_categor_idx"),
        ),
    ]
