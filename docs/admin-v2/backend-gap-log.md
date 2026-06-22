# Admin V2 Backend Gap Log

This file tracks backend capabilities that the V2 UI must not fake.

If a gap remains unverified, the UI should show:

- `Backend endpoint required`
- disabled action state
- a short operational note

## Gaps called out in the handover

| Gap | Status | Notes |
|---|---|---|
| Lucky Plan winners dedicated endpoint | Pending confirmation | The workbench should reuse draw detail or settlement data until a dedicated endpoint is confirmed. |
| Staff document verify/reject endpoint | Pending confirmation | Do not fake document approval states in the browser. |
| Dedicated customer credits/refunds endpoints | Pending confirmation | Use reversal-control or existing approved paths only. |
| Vendor returns aggregate endpoint | Pending confirmation | Show raw return records or an explicit gap state. |
| Global search payload shape for V2 command palette | Pending confirmation | Command palette should only expose what the backend returns. |
| Admin navigation badge API shape for V2 sidebar counters | Pending confirmation | Sidebar counts should not be invented client-side. |
| KYC approve/reject/upload APIs for customer, partner, staff, vendor | Mixed / pending confirmation | Only wire actions that have a known backend path. |

## Known UI safety rules

- no frontend stock arithmetic
- no frontend journal math
- no frontend payment posting
- no frontend waiver generation
- no frontend reconciliation completion
- no frontend refund creation without backend support

## Gap handling rule

When a backend action is missing, the correct behavior is:

1. show the data that already exists
2. disable the unsafe button
3. document the missing endpoint here
4. keep the old admin route as fallback

