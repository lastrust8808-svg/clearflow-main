# Safe storage migration and recovery

1. Back up the current PostgreSQL database and any attached persistent disk before deployment.
2. Verify CLEARFLOW_STORAGE_DATABASE_URL (or CLEARFLOW_OWNER_DATABASE_URL) targets persistent PostgreSQL.
3. Export every legacy account folder from server/storage-data/accounts on the running host. Never delete originals.
4. For each app-data.json, compare the existing database snapshot. If absent, import as revision 1. If present, retain both copies for manual reconciliation.
5. For each files/*.json, remittance/*.json, plaid/connections.json, transaction-proof-chains/chains.json and extractions/*.json, import only when the corresponding database record is absent. Verify counts and hashes.
6. Perform a dry-run comparison of record counts, account IDs, file sizes and SHA-256 checksums before and after import. Preserve an immutable migration manifest.
7. Test saving, signing out, signing in, opening documents, and cross-device conflict rejection using test accounts.
8. Enable automated encrypted PostgreSQL backups with a retention policy; restore a backup into an isolated test database and verify records and attachments.
9. Deploy only after CI and restore verification pass. Roll back application code without deleting the database if a release fails.

Do not infer successful migration from a database connection alone. Existing filesystem records remain on the original host until explicitly migrated and verified.
