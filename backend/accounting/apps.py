from django.apps import AppConfig
from django.db.models.signals import post_migrate

def create_raw_sql_tables(sender, **kwargs):
    from django.db import connection
    # Only inject this for SQLite (which is used in test/playwright syncdb).
    # Production uses Postgres and runs the actual migration 0014.
    if connection.vendor != 'sqlite':
        return

    with connection.cursor() as cursor:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS accounting_operational_accounting_postings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_model VARCHAR(120) NOT NULL,
                source_id VARCHAR(120) NOT NULL,
                event_type VARCHAR(80) NOT NULL,
                idempotency_key VARCHAR(220) NOT NULL UNIQUE,
                amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
                status VARCHAR(20) NOT NULL DEFAULT 'PREVIEWED',
                journal_entry_id BIGINT NULL,
                mapping_snapshot JSONB NOT NULL DEFAULT '{}',
                preview_payload JSONB NOT NULL DEFAULT '{}',
                failure_reason TEXT NOT NULL DEFAULT '',
                posted_by_id BIGINT NULL,
                posted_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        ''')
        try:
            cursor.execute("ALTER TABLE accounting_rent_lease_account_mappings ADD COLUMN customer_advance_liability_account_id BIGINT NULL;")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE accounting_rent_lease_account_mappings ADD COLUMN rent_income_account_id BIGINT NULL;")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE accounting_rent_lease_account_mappings ADD COLUMN lease_income_account_id BIGINT NULL;")
        except Exception:
            pass
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS accounting_customer_advance_source_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id BIGINT NULL,
                amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
                transaction_type VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
                payment_method VARCHAR(20) NOT NULL DEFAULT '',
                finance_account_id BIGINT NULL,
                reference_no VARCHAR(120) NULL UNIQUE,
                notes TEXT NOT NULL DEFAULT '',
                created_by_id BIGINT NULL,
                approved_by_id BIGINT NULL,
                approved_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        ''')

class AccountingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounting"

    def ready(self):
        post_migrate.connect(create_raw_sql_tables, sender=self)
