# SUBIDHA CORE — Recommended Secret/Data Locations

## Production server secrets

```text
/etc/subidha-core/backend.env
/etc/subidha-core/frontend.env
/etc/subidha-core/admin-vite.env
```

Permissions:

```bash
sudo chown root:subidha /etc/subidha-core/*.env
sudo chmod 640 /etc/subidha-core/*.env
```

## Production storage

```text
/var/lib/subidha-core/media
/var/lib/subidha-core/static
/var/lib/subidha-core/private-documents
/var/backups/subidha-core
```

## Database

```text
PostgreSQL database: subidha_core
DB user: subidha_app
```

## Never store here

Do not store real secrets or live customer data in:

```text
AGENTS.md
docs/
.env.example
.env.production.template
GitHub issue comments
Chat screenshots
frontend public files
```
