# SUBIDHA CORE — Payment Methods Fill-Blanks

| Payment mode | Enabled? | Settlement account | Requires reference? | Admin approval required? |
|---|---:|---|---:|---:|
| Cash | `YES / NO` | `Cash` | `NO` | `YES for partner request` |
| UPI | `YES / NO` | `UPI Clearing` | `YES` | `YES for partner request` |
| Bank transfer | `YES / NO` | `Bank` | `YES` | `YES for partner request` |
| Cheque | `YES / NO` | `Bank/Cheque Clearing` | `YES` | `YES` |
| Card/POS | `YES / NO` | `Card Settlement` | `YES` | `YES if manual` |

## Rule

Partner can create only `receipt request`. Final receipt only after admin verifies actual money received.
