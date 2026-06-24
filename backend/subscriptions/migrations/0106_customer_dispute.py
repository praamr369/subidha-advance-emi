from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0105_recoverycase_updated_at_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CustomerDispute',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('dispute_ref', models.CharField(db_index=True, max_length=30, unique=True)),
                ('dispute_type', models.CharField(choices=[
                    ('PAYMENT_DISPUTE', 'Payment Dispute'),
                    ('DELIVERY_DISPUTE', 'Delivery Dispute'),
                    ('PRODUCT_DEFECT', 'Product Defect'),
                    ('BILLING_ERROR', 'Billing Error'),
                    ('KYC_ISSUE', 'KYC Issue'),
                    ('OTHER', 'Other'),
                ], db_index=True, max_length=30)),
                ('subject', models.CharField(max_length=200)),
                ('description', models.TextField()),
                ('stage', models.CharField(choices=[
                    ('OPEN', 'Open'),
                    ('UNDER_REVIEW', 'Under Review'),
                    ('RESOLVED', 'Resolved'),
                    ('REJECTED', 'Rejected'),
                    ('ESCALATED', 'Escalated'),
                ], db_index=True, default='OPEN', max_length=20)),
                ('priority', models.CharField(choices=[
                    ('LOW', 'Low'),
                    ('MEDIUM', 'Medium'),
                    ('HIGH', 'High'),
                ], default='MEDIUM', max_length=10)),
                ('resolution_notes', models.TextField(blank=True, default='')),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='disputes', to='subscriptions.customer')),
                ('subscription', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='disputes', to='subscriptions.subscription')),
                ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_disputes', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_disputes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'subscriptions_customer_disputes',
                'ordering': ['-created_at'],
            },
        ),
    ]
