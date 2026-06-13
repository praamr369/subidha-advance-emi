# Production Accounting Validation Checklist

Use this checklist with the Accounting Bridge Reconciliation page and its Production Accounting Validation section.

## 1. Before Shop Opens

- Confirm accounting period is open for today's posting date.
- Confirm journal numbering is ready.
- Confirm finance accounts used by cash, bank, and UPI collection are active.
- Review mapping blockers and fix only approved accounting mappings.
- Confirm unsupported rows are expected boundaries, especially `StaffAdvance`.

## 2. During Shop Operations

- Cashiers collect EMI, direct-sale, rent/lease, deposit, and advance money only through approved collection screens.
- Do not use validation screens as posting shortcuts.
- Review ready bridge rows before posting.
- Do not post unsupported or abstract rows.
- Treat customer advance application separately from cash receipt.
- Treat security deposit receipt as liability, not revenue.

## 3. End Of Day

- Open Production Accounting Validation.
- Group by domain and review blocked, ready, posted-unverified, and unsupported rows.
- Resolve mapping, finance-account, numbering, and period blockers from their linked setup pages.
- Preview concrete READY_UNPOSTED rows before any admin posting.
- Run reconciliation checks after posting.
- Verify posted-unverified rows only after source evidence, journal lines, and reconciliation evidence match.

## 4. Before Month Close

- Confirm no unreviewed READY_UNPOSTED bridge rows remain for the month.
- Confirm no posted-unverified rows are being treated as reconciled.
- Confirm reconciliation exceptions are resolved or documented.
- Confirm customer advance F2/F20/F21/F23 separation.
- Confirm rent/lease revenue F14 is separate from collection settlement F15C.
- Confirm security deposit receipt F17 is separate from refund F18.
- Confirm period close is executed only through existing explicit close controls.
