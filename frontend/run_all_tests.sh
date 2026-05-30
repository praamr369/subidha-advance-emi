#!/bin/bash
echo "Running auth.spec.ts"
npx playwright test tests/e2e/auth.spec.ts --project=chromium-smoke --timeout=180000
echo "Running setup_readiness.spec.ts"
npx playwright test tests/e2e/setup_readiness.spec.ts --project=chromium-smoke --timeout=180000
echo "Running accounting_journal_ledger_print_smoke.spec.ts"
npx playwright test tests/e2e/accounting_journal_ledger_print_smoke.spec.ts --project=chromium-smoke --timeout=180000
echo "Running document_print_smoke.spec.ts"
npx playwright test tests/e2e/document_print_smoke.spec.ts --project=chromium-smoke --timeout=180000
echo "Running contract_amendments_phase2.spec.ts"
npx playwright test tests/e2e/contract_amendments_phase2.spec.ts --project=chromium-smoke --timeout=180000
echo "Running amendment_decision_sheet_print.spec.ts"
npx playwright test tests/e2e/amendment_decision_sheet_print.spec.ts --project=chromium-smoke --timeout=180000
echo "Done"
