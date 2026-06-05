# Additive operational accounting bridge for rent/lease source records.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0013_financeaccountcoamapping"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS accounting_operational_accounting_postings (
                id BIGSERIAL PRIMARY KEY,
                source_model VARCHAR(120) NOT NULL,
                source_id VARCHAR(120) NOT NULL,
                event_type VARCHAR(80) NOT NULL,
                idempotency_key VARCHAR(220) NOT NULL UNIQUE,
                amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
                status VARCHAR(20) NOT NULL DEFAULT 'PREVIEWED',
                journal_entry_id BIGINT NULL REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
                mapping_snapshot JSONB NOT NULL DEFAULT '{}',
                preview_payload JSONB NOT NULL DEFAULT '{}',
                failure_reason TEXT NOT NULL DEFAULT '',
                posted_by_id BIGINT NULL,
                posted_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS accounting_oap_source_idx
                ON accounting_operational_accounting_postings(source_model, source_id);
            CREATE INDEX IF NOT EXISTS accounting_oap_event_status_idx
                ON accounting_operational_accounting_postings(event_type, status);
            CREATE INDEX IF NOT EXISTS accounting_oap_posted_at_idx
                ON accounting_operational_accounting_postings(posted_at);

            ALTER TABLE accounting_rent_lease_account_mappings
                ADD COLUMN customer_advance_liability_account_id BIGINT NULL REFERENCES accounting_chart_of_accounts(id) ON DELETE RESTRICT;
            ALTER TABLE accounting_rent_lease_account_mappings
                ADD COLUMN rent_income_account_id BIGINT NULL REFERENCES accounting_chart_of_accounts(id) ON DELETE RESTRICT;
            ALTER TABLE accounting_rent_lease_account_mappings
                ADD COLUMN lease_income_account_id BIGINT NULL REFERENCES accounting_chart_of_accounts(id) ON DELETE RESTRICT;

            CREATE INDEX IF NOT EXISTS accounting_rlmap_customer_advance_idx
                ON accounting_rent_lease_account_mappings(customer_advance_liability_account_id);
            CREATE INDEX IF NOT EXISTS accounting_rlmap_rent_income_idx
                ON accounting_rent_lease_account_mappings(rent_income_account_id);
            CREATE INDEX IF NOT EXISTS accounting_rlmap_lease_income_idx
                ON accounting_rent_lease_account_mappings(lease_income_account_id);

            CREATE TABLE IF NOT EXISTS accounting_customer_advance_source_records (
                id BIGSERIAL PRIMARY KEY,
                customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
                amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
                transaction_type VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
                payment_method VARCHAR(20) NOT NULL DEFAULT '',
                finance_account_id BIGINT NULL REFERENCES accounting_finance_accounts(id) ON DELETE RESTRICT,
                reference_no VARCHAR(120) NULL UNIQUE,
                notes TEXT NOT NULL DEFAULT '',
                created_by_id BIGINT NULL,
                approved_by_id BIGINT NULL,
                approved_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS accounting_customer_adv_customer_idx
                ON accounting_customer_advance_source_records(customer_id);
            CREATE INDEX IF NOT EXISTS accounting_customer_adv_status_idx
                ON accounting_customer_advance_source_records(transaction_type, status);
            CREATE INDEX IF NOT EXISTS accounting_customer_adv_created_idx
                ON accounting_customer_advance_source_records(created_at);
            """,
            reverse_sql="""
            DROP TABLE IF EXISTS accounting_customer_advance_source_records;
            DROP INDEX IF EXISTS accounting_rlmap_lease_income_idx;
            DROP INDEX IF EXISTS accounting_rlmap_rent_income_idx;
            DROP INDEX IF EXISTS accounting_rlmap_customer_advance_idx;
            ALTER TABLE accounting_rent_lease_account_mappings DROP COLUMN IF EXISTS lease_income_account_id;
            ALTER TABLE accounting_rent_lease_account_mappings DROP COLUMN IF EXISTS rent_income_account_id;
            ALTER TABLE accounting_rent_lease_account_mappings DROP COLUMN IF EXISTS customer_advance_liability_account_id;
            DROP TABLE IF EXISTS accounting_operational_accounting_postings;
            """,
        ),
    ]
