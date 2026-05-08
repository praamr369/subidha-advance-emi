# Customer/Partner/Party Account Linking Rules

- Account linking endpoints are admin-only and require a non-empty reason for every link/change/unlink action.
- Customer account-link actions block duplicate active mappings so one user cannot be linked to multiple active customer records.
- Partner account-link actions only allow partner-role users.
- Party account-link actions update party linkage metadata without mutating historical financial or contract records.
- Link changes are audited with old/new user identifiers and operator context.
