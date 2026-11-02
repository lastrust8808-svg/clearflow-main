# Clear.Flow standalone company login — acceptance contract

## Required identities
- Personal owner Google login: independent user principal with explicit memberships in Clear.Flow and the owner's other entities.
- Company Google login: `clearflow.app.5@gmail.com` is a **separate user principal**, assigned membership only in the existing Clear.Flow operating entity, with a company-admin role. It must not inherit personal owner entities, credentials, sessions or Drive access.
- Both principals access the SAME durable Clear.Flow entity ID, not cloned company workspaces.
- Future staff (e.g., Jen or Fox) use their OWN authenticated identities and explicitly granted Clear.Flow-only roles; do not share the company Google account password or Google session.

## Existing-user provisioning
1. On successful Google OAuth login, verify issuer, audience, signature, expiration, nonce and stable Google subject (`sub`) server-side.
2. Resolve the authenticated principal by provider + `sub`; link the company Google identity to the intended existing Clear.Flow principal through a one-time, auditable owner-approved bootstrap.
3. Grant only the existing Clear.Flow entity membership, with no personal owner tenant membership.
4. Do not infer company-admin privilege from matching an email string alone. Do not auto-create or duplicate Clear.Flow entity or grant memberships on unknown identities.
5. If bootstrap is not completed, fail closed with a visible pending-setup state. Never silently treat this company identity as a fresh customer or as the owner's personal profile.

## Google Drive
- Company Drive connection is a separate OAuth consent flow for `clearflow.app.5@gmail.com`, scoped to Clear.Flow entity, with encrypted server-side tokens and auditable folder routing.
- OAuth login does not automatically authorize Drive file access. No application records should depend solely on Drive for durable persistence.

## Tests
- Personal owner login: sees all explicitly authorized entities including Clear.Flow.
- Company login: sees exactly one entity (Clear.Flow), with its existing records/dashboard; cannot enumerate or access owner-only entities by forged ID or direct API request.
- Both logins see consistent Clear.Flow company data after refresh, logout/login and server restart.
- A new unrelated Google identity receives no privileged Clear.Flow membership.
- A separately invited staff account receives only its explicit Clear.Flow role and is revocable.
- OAuth failure, revoked Drive consent and persistence failure surface errors rather than false-success.
- No live account provisioning or Google OAuth credential modifications before authorized authenticated bootstrap and staging verification.
