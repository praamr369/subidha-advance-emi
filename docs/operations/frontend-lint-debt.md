# Frontend Lint Debt

## Current Status
Command used:

```bash
cd frontend
npm run lint
```

Current status: lint is green on the latest pass.

## Inventory (latest run)
- Total findings: `0` (errors: `0`, warnings: `0`)
- Files affected: `0`
- Category breakdown:
  - `no-explicit-any`: `0` (safe cleanup completed in service files)
  - `set-state-in-effect`: `0` (safe cleanup completed in admin enquiry/vendor pages)
  - `missing hook dependencies`: `0`
  - `unused variables/imports`: `0`
  - `accessibility warnings`: `0`
  - `test-only lint issues`: `0`
  - `generated/vendor files`: `0`

## Representative Remaining Warnings
- None in the latest run.

## Safety Policy
- Fixed now (safe to fix):
  - service return types moved from `any` to `unknown`
  - effect patterns updated to avoid synchronous `setState` in effect body
  - callback dependencies tightened in reversal-related pages
- Needs behavior review: none
- Broad legacy debt: none currently blocking lint
- Intentionally deferred: none

## Suggested Cleanup Plan
1. Keep `unknown` payloads and gradually replace with endpoint DTOs by module.
2. For hook warnings that reappear, convert loaders to `useCallback` and verify no extra network churn.
3. Keep lint as blocking gate for touched files in release passes.

## Deferred-Risk Explanation
- No deferred lint blockers remain after this pass.
