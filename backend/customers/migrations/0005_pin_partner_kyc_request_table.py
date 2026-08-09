# Pin customers.PartnerCustomerKycRequest to its real table.
#
# The physical table `subscriptions_partnercustomerkycrequest` was created by
# subscriptions/migrations/0128 and moved to the customers app state-only. The
# model lost its db_table pin, so it resolved to a non-existent
# `customers_partnercustomerkycrequest` table (every query raised
# "relation does not exist"). This aligns Django's state with the existing
# physical table — state-only, no DDL (the table and its indexes already exist).
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0004_fold_aml_from_subscriptions"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameIndex(
                    model_name="partnercustomerkycrequest",
                    new_name="subscriptio_partner_09117e_idx",
                    old_name="customers_p_partner_6ea2cd_idx",
                ),
                migrations.RenameIndex(
                    model_name="partnercustomerkycrequest",
                    new_name="subscriptio_custome_13fece_idx",
                    old_name="customers_p_custome_2d720b_idx",
                ),
                migrations.AlterModelTable(
                    name="partnercustomerkycrequest",
                    table="subscriptions_partnercustomerkycrequest",
                ),
            ],
        ),
    ]
