# Backend Module Inventory (auto-generated)

**32** local Django apps. Columns: models / migrations / service files / management commands.

**Per-module pre-production check:** (1) `manage.py check` clean, (2) migrations applied and `makemigrations --check` clean, (3) each service's happy + guard paths covered, (4) each mutating action is audited + permission-gated, (5) money/stock invariants hold (no negative balances, one payment per EMI intent, etc.).

| Module | Models | Migrations | Services | Mgmt cmds |
|---|--:|--:|--:|--:|
| `accounts` | 7 | 12 | 8 | 0 |
| `ai_assistant` | 5 | 3 | 16 | 0 |
| `branch_control` | 3 | 2 | 6 | 2 |
| `crm` | 19 | 11 | 24 | 1 |
| `service_desk` | 8 | 9 | 6 | 0 |
| `accounting` | 71 | 55 | 174 | 8 |
| `inventory` | 33 | 24 | 32 | 3 |
| `manufacturing` | 7 | 2 | 4 | 0 |
| `billing` | 20 | 16 | 26 | 2 |
| `catalog` | 3 | 2 | 6 | 0 |
| `brochures` | 8 | 5 | 14 | 0 |
| `reminders` | 3 | 6 | 12 | 1 |
| `system_jobs` | 3 | 2 | 6 | 0 |
| `customers` | 13 | 5 | 22 | 0 |
| `contracts` | 13 | 3 | 64 | 0 |
| `payments` | 20 | 2 | 36 | 0 |
| `lucky_plan` | 8 | 3 | 20 | 0 |
| `deliveries` | 9 | 2 | 8 | 0 |
| `commissions` | 3 | 2 | 12 | 0 |
| `growth` | 7 | 1 | 0 | 0 |
| `business_setup` | 20 | 2 | 0 | 0 |
| `finance_control` | 7 | 1 | 0 | 0 |
| `audit` | 2 | 1 | 0 | 0 |
| `products_core` | 6 | 2 | 2 | 0 |
| `subscriptions` | 0 | 148 | 112 | 27 |
| `reconciliation` | 6 | 4 | 24 | 0 |
| `settlements` | 7 | 2 | 14 | 0 |
| `smart_fields` | 4 | 1 | 2 | 2 |
| `migration_center` | 5 | 2 | 14 | 0 |
| `privacy` | 9 | 3 | 0 | 0 |
| `documents` | 1 | 2 | 4 | 0 |
| `products_pim` | 8 | 5 | 4 | 4 |
| **TOTAL** | **338** | **340** | **672** | **50** |
