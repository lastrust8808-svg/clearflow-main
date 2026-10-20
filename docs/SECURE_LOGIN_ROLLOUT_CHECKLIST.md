# Secure email login rollout checklist (not production-ready)

## Configuration
- Configure `CLEARFLOW_AUTH_DATABASE_URL` with a dedicated Postgres database, or intentionally share `CLEARFLOW_OWNER_DATABASE_URL` after reviewing privileges.
- Configure a random `CLEARFLOW_AUTH_SECRET` of at least 32 characters. Preserve this secret across deployments; rotating it invalidates outstanding verification codes and sessions.
- Configure SMTP; the server does not display verification codes or silently fall back to preview mode.
- Keep this branch out of production until migrations and tests pass.

## Identity and data migration
- A verified email signs into `local:<server-user-uuid>` storage; an existing matching browser backup is copied after verification only if no server workspace exists.
- The original browser backup is retained. Do not remove browser backups until the customer has verified all financial records, files and entity relationships.
- **Not yet migrated:** old server-side data under legacy browser-generated IDs and documents/vaults. A privileged, auditable migration job is required to move those records and verify ownership.
- **Not yet migrated:** phone-only users and password-only users. They must be offered a verified email recovery path, not silently locked out.
- Existing browser passwords must not be trusted for account recovery.
- New session tokens live only in memory, so a reload requires sign-in again.

## Required pre-deployment checks
1. Run TypeScript build and Node tests in CI.
2. Verify SMTP delivery, code expiration, five-attempt lockout and one-minute resend throttle.
3. Verify session revocation, 12-hour expiry and suspended-user denial.
4. Test two distinct customer identities: reads, writes, files, vaults and cache access must be isolated.
5. Verify Google sign-in and account recovery separately.
6. Migrate representative legacy accounts and validate records and files before enabling new login for all customers.
7. Review all other sensitive API routes (Plaid, Mercury, ERP and assistant) for authorization and tenant binding.
8. Validate backup/restore and rollback procedures.

## Important limitations
- The code is not a complete audited identity provider. A security review, integration tests and staged rollout are still required.
- The legacy `/verification/start` path remains available in non-production builds and must not be relied on for authentication.
- No production deployment or live database migration is authorized by this document.
