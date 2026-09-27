from django.test.runner import DiscoverRunner


class ProjectTestRunner(DiscoverRunner):
    """
    Project-level test discovery for the top-level backend/tests package.

    Django's default no-label discovery only searches installed apps. This repo
    keeps its backend suite in a dedicated top-level tests package, so bare
    `manage.py test` needs explicit default labels.
    """

    # Run the whole backend suite. This was ["tests.api", "tests.domain"], so
    # bare `manage.py test` - which is what CI runs - executed 916 of 2723
    # tests. CI passed while roughly 1,800 tests never ran, including every
    # accounting, growth, crm and products_pim test.
    default_test_labels = ["tests"]

    def setup_databases(self, **kwargs):
        old_config = super().setup_databases(**kwargs)
        from django.db import connections
        from django.conf import settings
        if getattr(settings, 'MIGRATION_MODULES', {}).get('accounting') is None:
            for alias in connections:
                with connections[alias].cursor() as cursor:
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
        return old_config

    def build_suite(self, test_labels=None, *args, **kwargs):
        labels = list(test_labels or [])
        if not labels:
            labels = list(self.default_test_labels)
        return super().build_suite(labels, *args, **kwargs)
