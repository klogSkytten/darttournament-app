# Database Migrations

Migrations are managed with `node-pg-migrate` from the backend package. Migration files use timestamped JavaScript filenames and define both `exports.up` and `exports.down`.

This folder is still relevant for schema versioning, review, and CI validation. It helps document the evolution of the database and makes changes traceable in git.

For runtime behavior, the backend now also performs a startup bootstrap check. If required tables are missing, it creates them automatically before serving requests. This means the app does not depend on manual `docker compose exec backend npm run db:migrate` commands on the NAS.

If you still want to apply migrations manually for a controlled upgrade or rollback, use:

```sh
docker compose exec backend npm run db:migrate
```

and

```sh
docker compose exec backend npm run db:rollback
```

The startup bootstrap is the default path for local development and small deployments. The migration folder remains useful for explicit database history and change management.
