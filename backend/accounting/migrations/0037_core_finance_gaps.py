# Generated migration for core finance gaps: IFRS-16 lease, cost centre, depreciation, deferred tax

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0036_tds_tcs_statutory'),
        ('branch_control', '0001_initial'),
        ('subscriptions', '0104_prepayment_delivery_pod'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # CostCentre
        migrations.CreateModel(
            name='CostCentre',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, max_length=20, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('centre_type', models.CharField(choices=[('BRANCH', 'Branch'), ('TEAM', 'Team'), ('DEPT', 'Department')], db_index=True, max_length=20)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='cost_centres', to='branch_control.branch')),
                ('manager', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='managed_cost_centres', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'accounting_cost_centres',
                'ordering': ['code'],
            },
        ),

        # LeaseContract
        migrations.CreateModel(
            name='LeaseContract',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('lease_type', models.CharField(choices=[('OPERATING', 'Operating Lease'), ('FINANCE', 'Finance Lease'), ('EQUIPMENT', 'Equipment Lease')], db_index=True, default='FINANCE', max_length=20)),
                ('asset_description', models.CharField(max_length=200)),
                ('lease_start_date', models.DateField(db_index=True)),
                ('lease_end_date', models.DateField(db_index=True)),
                ('lease_term_months', models.PositiveIntegerField()),
                ('monthly_lease_payment', models.DecimalField(decimal_places=2, max_digits=14)),
                ('discount_rate', models.DecimalField(decimal_places=2, help_text='Interest rate %', max_digits=5)),
                ('rou_asset_amount', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('initial_lease_liability', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('status', models.CharField(choices=[('ACTIVE', 'Active'), ('COMPLETED', 'Completed'), ('TERMINATED', 'Terminated')], db_index=True, default='ACTIVE', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('lease_expense_account', models.ForeignKey(blank=True, limit_choices_to={'account_type': 'EXPENSE'}, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='lease_expense_records', to='accounting.chartofaccounts')),
                ('lease_liability_account', models.ForeignKey(blank=True, limit_choices_to={'account_type': 'LIABILITY'}, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='lease_liability_records', to='accounting.chartofaccounts')),
                ('rou_asset_account', models.ForeignKey(blank=True, limit_choices_to={'account_type': 'ASSET'}, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='rou_asset_leases', to='accounting.chartofaccounts')),
                ('subscription', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='lease_contract', to='subscriptions.subscription')),
            ],
            options={
                'db_table': 'accounting_lease_contracts',
                'ordering': ['-lease_start_date'],
            },
        ),

        # LeaseSchedule
        migrations.CreateModel(
            name='LeaseSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month_number', models.PositiveIntegerField()),
                ('payment_date', models.DateField(db_index=True)),
                ('opening_liability', models.DecimalField(decimal_places=2, max_digits=14)),
                ('interest_expense', models.DecimalField(decimal_places=2, max_digits=14)),
                ('payment_amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('closing_liability', models.DecimalField(decimal_places=2, max_digits=14)),
                ('rou_depreciation', models.DecimalField(decimal_places=2, max_digits=14)),
                ('gl_posted', models.BooleanField(db_index=True, default=False)),
                ('gl_entry', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lease_schedules', to='accounting.journalentry')),
                ('lease', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payment_schedule', to='accounting.leasecontract')),
            ],
            options={
                'db_table': 'accounting_lease_schedules',
                'ordering': ['lease', 'month_number'],
                'unique_together': {('lease', 'month_number')},
            },
        ),

        # FixedAssetDepreciation
        migrations.CreateModel(
            name='FixedAssetDepreciation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('asset_code', models.CharField(db_index=True, max_length=20, unique=True)),
                ('asset_name', models.CharField(max_length=100)),
                ('asset_type', models.CharField(choices=[('PLANT_MACHINERY', 'Plant & Machinery'), ('BUILDING', 'Building'), ('FURNITURE_FIXTURES', 'Furniture & Fixtures'), ('VEHICLES', 'Vehicles'), ('COMPUTERS', 'Computers & IT Equipment'), ('OTHER', 'Other')], db_index=True, max_length=30)),
                ('acquisition_date', models.DateField(db_index=True)),
                ('acquisition_cost', models.DecimalField(decimal_places=2, max_digits=14)),
                ('useful_life_years', models.PositiveIntegerField()),
                ('depreciation_rate', models.DecimalField(decimal_places=2, help_text='Annual %', max_digits=5)),
                ('depreciation_method', models.CharField(choices=[('STRAIGHT_LINE', 'Straight-line'), ('DECLINING_BALANCE', 'Declining Balance')], default='STRAIGHT_LINE', max_length=20)),
                ('salvage_value', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('accumulated_depreciation', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('net_book_value', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('status', models.CharField(choices=[('ACTIVE', 'Active'), ('FULLY_DEPRECIATED', 'Fully Depreciated'), ('DISPOSED', 'Disposed')], db_index=True, default='ACTIVE', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('accumulated_depreciation_account', models.ForeignKey(limit_choices_to={'account_type': 'ASSET'}, on_delete=django.db.models.deletion.PROTECT, related_name='accumulated_depreciation', to='accounting.chartofaccounts')),
                ('asset_account', models.ForeignKey(limit_choices_to={'account_type': 'ASSET'}, on_delete=django.db.models.deletion.PROTECT, related_name='fixed_assets', to='accounting.chartofaccounts')),
                ('depreciation_expense_account', models.ForeignKey(limit_choices_to={'account_type': 'EXPENSE'}, on_delete=django.db.models.deletion.PROTECT, related_name='depreciation_expenses', to='accounting.chartofaccounts')),
            ],
            options={
                'db_table': 'accounting_fixed_assets',
                'ordering': ['-acquisition_date'],
            },
        ),

        # DepreciationSchedule
        migrations.CreateModel(
            name='DepreciationSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period_start', models.DateField(db_index=True)),
                ('period_end', models.DateField()),
                ('opening_net_book_value', models.DecimalField(decimal_places=2, max_digits=14)),
                ('depreciation_expense', models.DecimalField(decimal_places=2, max_digits=14)),
                ('closing_net_book_value', models.DecimalField(decimal_places=2, max_digits=14)),
                ('gl_posted', models.BooleanField(db_index=True, default=False)),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='depreciation_schedule', to='accounting.fixedassetdepreciation')),
                ('gl_entry', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='depreciation_schedules', to='accounting.journalentry')),
            ],
            options={
                'db_table': 'accounting_depreciation_schedules',
                'ordering': ['asset', '-period_start'],
                'unique_together': {('asset', 'period_start', 'period_end')},
            },
        ),

        # DeferredTax
        migrations.CreateModel(
            name='DeferredTax',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, max_length=20, unique=True)),
                ('description', models.CharField(max_length=200)),
                ('tax_type', models.CharField(choices=[('ASSET', 'Deferred Tax Asset'), ('LIABILITY', 'Deferred Tax Liability')], db_index=True, max_length=20)),
                ('originating_date', models.DateField(db_index=True)),
                ('book_amount', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('tax_amount', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('temporary_difference', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('tax_rate', models.DecimalField(decimal_places=2, max_digits=5)),
                ('dta_dtl_amount', models.DecimalField(decimal_places=2, default='0.00', max_digits=14)),
                ('expected_reversal_year', models.PositiveIntegerField(blank=True, null=True)),
                ('status', models.CharField(choices=[('ACTIVE', 'Active'), ('REVERSED', 'Reversed')], db_index=True, default='ACTIVE', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'accounting_deferred_tax',
                'ordering': ['-originating_date'],
            },
        ),

        # CostAllocationRule
        migrations.CreateModel(
            name='CostAllocationRule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, max_length=20, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('allocation_method', models.CharField(choices=[('EQUAL', 'Equal split'), ('PERCENTAGE', 'Percentage split'), ('DRIVER', 'Cost driver (headcount, revenue, etc)')], default='EQUAL', max_length=20)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('source_account', models.ForeignKey(limit_choices_to={'account_type': 'EXPENSE'}, on_delete=django.db.models.deletion.PROTECT, related_name='cost_allocation_rules', to='accounting.chartofaccounts')),
            ],
            options={
                'db_table': 'accounting_cost_allocation_rules',
                'ordering': ['code'],
            },
        ),

        # CostAllocationDetail
        migrations.CreateModel(
            name='CostAllocationDetail',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('allocation_percentage', models.DecimalField(decimal_places=2, default='0.00', max_digits=5)),
                ('allocation_amount', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('cost_centre', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='cost_allocations', to='accounting.costcentre')),
                ('rule', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='detail_lines', to='accounting.costallocationrule')),
            ],
            options={
                'db_table': 'accounting_cost_allocation_details',
                'ordering': ['rule', 'cost_centre'],
                'unique_together': {('rule', 'cost_centre')},
            },
        ),
    ]
