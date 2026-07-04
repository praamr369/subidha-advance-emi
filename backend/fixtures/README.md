# Production bootstrap fixture

`production_bootstrap.json` contains **configuration data only** — no customers,
subscriptions, payments, or any other test records. It seeds a fresh production
database with everything the app needs to start working:

| Area | Models |
|---|---|
| Financial years & numbering | `accounting.FinancialYear`, `accounting.DocumentSequence` |
| Chart of accounts | `accounting.ChartOfAccount` (39), `accounting.CostCentre`, `subscriptions.ChartAccount` |
| Finance accounts | `accounting.FinanceAccount`, `subscriptions.FinanceAccount` |
| Posting configuration | `accounting.AccountingPostingProfile` (35), `accounting.RentLeasePostingBridgeConfig` |
| Tax | `accounting.BusinessTaxProfile` |
| Branches & cash | `branch_control.Branch`, `branch_control.CashCounter`, `subscriptions.Branch`, `subscriptions.CashDesk` |
| Smart fields reference | `smart_fields.PincodeLocation` (49), `smart_fields.HsnCode` (35), `smart_fields.FieldSuggestionMapping` |
| Business identity & policies | `subscriptions.BusinessProfile`, `subscriptions.BusinessPolicy`, `subscriptions.BusinessRulePolicy`, `subscriptions.PolicyPage` (39), `subscriptions.PolicyGovernanceMetadata` |
| Plans & printing | `subscriptions.PlanTemplate`, `subscriptions.DocumentPrintSettings` |

Deliberately **excluded**:

- `accounts.Capability` / `accounts.RoleCapability` — auto-created by a
  post-migrate signal; loading them causes unique-constraint conflicts.
- `billing.BillingProfile`, `subscriptions.RentSubscriptionProfile`,
  `subscriptions.LeaseSubscriptionProfile` — these are per-subscription records,
  not configuration.
- `subscriptions.EmailSMTPSettings` — may contain credentials; configure it
  manually in production.
- Products / EMI schemes / brochure settings — review the catalog manually
  before launch instead of carrying test products over.

## Fresh production database procedure (order matters)

```bash
python manage.py migrate                 # 1. schema + auto capability sync
python manage.py createsuperuser         # 2. MUST be the first user (pk=1) —
                                         #    PolicyPage rows reference user 1;
                                         #    the custom user model requires a phone
python manage.py loaddata fixtures/production_bootstrap.json   # 3. 268 config objects
python manage.py check --deploy          # 4. sanity
# 5. REQUIRED: createsuperuser leaves role=CUSTOMER (the model default) and the
#    frontend routes by role — without this the superuser lands on the customer
#    portal instead of the admin dashboard:
python manage.py shell -c "from django.contrib.auth import get_user_model; u=get_user_model().objects.get(pk=1); u.role='ADMIN'; u.save()"
```

After loading, review in the admin: business profile details, document sequence
prefixes/counters, policy pages, and business policies — they carry the values
from the development machine at export time.

## Re-exporting after config changes

```bash
python manage.py dumpdata accounting.FinancialYear branch_control.Branch branch_control.CashCounter \
  accounting.DocumentSequence accounting.ChartOfAccount accounting.FinanceAccount accounting.CostCentre \
  accounting.AccountingPostingProfile accounting.BusinessTaxProfile accounting.RentLeasePostingBridgeConfig \
  smart_fields.PincodeLocation smart_fields.HsnCode smart_fields.FieldSuggestionMapping \
  subscriptions.BusinessProfile subscriptions.Branch subscriptions.FinanceAccount subscriptions.CashDesk \
  subscriptions.ChartAccount subscriptions.DocumentPrintSettings subscriptions.BusinessPolicy \
  subscriptions.PlanTemplate subscriptions.BusinessRulePolicy subscriptions.PolicyPage \
  subscriptions.PolicyGovernanceMetadata \
  --indent 2 -o fixtures/production_bootstrap.json
```

On Windows set `PYTHONUTF8=1` first, otherwise the dump is written in the
console codepage and `loaddata` fails with a UnicodeDecodeError.

## Verifying the fixture loads into an empty database

`core/settings/bootstrap_check.py` points at a throwaway SQLite file:

```bash
set DJANGO_SETTINGS_MODULE=core.settings.bootstrap_check
python manage.py migrate
python manage.py shell -c "from django.contrib.auth import get_user_model; get_user_model().objects.create_superuser(username='admin', password='<temp>', phone='9999999999')"
python manage.py loaddata fixtures/production_bootstrap.json
```

Delete `bootstrap_check.sqlite3` afterwards.
