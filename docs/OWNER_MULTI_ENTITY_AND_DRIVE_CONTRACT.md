# Clear.Flow owner profile, independent entity and Drive acceptance contract

## Account and entity model
- The owner's authenticated personal profile is one user principal with explicitly granted memberships in L.A.S. Trust, All-Around Construction, Skymoon, and the independent Clear.Flow operating entity (and any other authorized entities).
- Clear.Flow is an ordinary entity with its own immutable entity ID, tenant scope, dashboards, accounting, documents, members, billing and audit records. Do not special-case global access by email address.
- The owner can select Clear.Flow from the same entity switcher as the other entities. A selected entity must never determine authorization on its own; enforce server-side membership and role checks on every request.
- Future customers register separate principals and entities. They see only their own authorized records and dashboards, never Clear.Flow's internal company records or the owner's other entities.
- Administrative/support access to customer data must be separately authorized, explicitly scoped, audited and time-limited; ownership of the software does not implicitly grant access.

## Google Drive integration
- Clear.Flow entity has its own OAuth-authorized Google Drive connection, using the designated Clear.Flow Google account, stored as an encrypted server-side connection reference scoped to that entity.
- Store Clear.Flow's own generated documents, membership agreements, QR-related records and company files in its authorized Drive folder. Maintain durable internal database metadata and references; Drive alone is not the application database.
- Other entities may independently authorize their own Drive connections and storage destinations. Never silently write another entity's documents into Clear.Flow's Drive.
- Enforce OAuth scope restrictions, token encryption, token refresh/revocation, folder permissions, and audit trails. No credentials or tokens in repository or browser storage.

## Acceptance tests
1. Owner login lists only memberships explicitly granted, including Clear.Flow and other authorized entities.
2. Switch to Clear.Flow, create and save a company document; verify entity-bound DB record and authorized Drive destination.
3. Logout, restart/reload, login again: same document and entity memberships persist.
4. Switch to AAC: Clear.Flow company records do not appear in AAC queries, dashboards or Drive routing.
5. Separate synthetic customer account cannot enumerate or access any owner entity, even with forged IDs.
6. Google OAuth revoked/expired or Drive write failure must fail visibly and retry safely, never claim a successful save or delivery.
7. Two different user principals may be granted access to one entity with independently scoped roles; revocation takes effect on server immediately.
8. Test entity creation and customer onboarding without assigning new users any of the owner's existing entities.

## Constraints
No production migration, Google OAuth changes, Drive writes, real payments, deployment, or main merge until integrated staging tests pass. Do not infer authorization solely from a matching Gmail address.
