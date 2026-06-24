# Generated migration for prepayment + Delivery + ProofOfDelivery

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0103_aml_pep'),
    ]

    operations = [
        # Add prepayment fields to Subscription
        migrations.AddField(
            model_name='subscription',
            name='advance_delivery_unlocked',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name='subscription',
            name='prepayment_amount',
            field=models.DecimalField(decimal_places=2, default='0.00', max_digits=12),
        ),
        migrations.AddField(
            model_name='subscription',
            name='prepayment_date',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # Create Delivery model
        migrations.CreateModel(
            name='Delivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('PENDING', 'Pending — awaiting delivery'), ('SCHEDULED', 'Scheduled'), ('IN_TRANSIT', 'In transit'), ('DELIVERED', 'Delivered'), ('FAILED', 'Delivery failed'), ('CANCELLED', 'Cancelled')], db_index=True, default='PENDING', max_length=20)),
                ('scheduled_date', models.DateField(blank=True, null=True)),
                ('delivered_date', models.DateField(blank=True, db_index=True, null=True)),
                ('driver_name', models.CharField(blank=True, default='', max_length=100)),
                ('driver_phone', models.CharField(blank=True, default='', max_length=20)),
                ('delivery_address', models.TextField(blank=True, default='')),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('subscription', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='delivery', to='subscriptions.subscription')),
            ],
            options={
                'db_table': 'subscriptions_delivery',
                'ordering': ['-created_at'],
            },
        ),
        # Create ProofOfDelivery model
        migrations.CreateModel(
            name='ProofOfDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('delivery_date', models.DateTimeField(db_index=True)),
                ('photo_1', models.ImageField(upload_to='pod/photos/')),
                ('photo_2', models.ImageField(blank=True, null=True, upload_to='pod/photos/')),
                ('signature_image', models.ImageField(upload_to='pod/signatures/')),
                ('driver_name', models.CharField(max_length=100)),
                ('driver_phone', models.CharField(blank=True, default='', max_length=20)),
                ('customer_signature_name', models.CharField(max_length=100)),
                ('gps_latitude', models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ('gps_longitude', models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('CAPTURED', 'Captured'), ('VERIFIED', 'Verified'), ('ARCHIVED', 'Archived')], db_index=True, default='CAPTURED', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('delivery', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='proof_of_delivery', to='subscriptions.delivery')),
            ],
            options={
                'db_table': 'subscriptions_proof_of_delivery',
                'ordering': ['-delivery_date'],
            },
        ),
    ]
