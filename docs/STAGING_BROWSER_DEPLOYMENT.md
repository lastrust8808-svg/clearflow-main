# Browser staging deployment

Use `deploy/render.staging.yaml` from the release-gate branch to create one free web service named `clearflow-browser-staging` in My Workspace, Ohio. It serves the built UI and authenticated API from one origin. Auto-deploy is off; health uses `/health`. Existing production services, database resources and the cron schedule are not managed by this Blueprint.

The service references the existing private staging database URL, auth secret and vault key from `clearflow-staging-migration-test` inside Render. Do not copy secret values into code or point these variables at production. The public web endpoint is new exposure; review the creation plan before applying it. Do not upgrade the plan or create another database as part of this step.

Before calling browser sign-in verified, configure a staging email delivery provider (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL) or register a staging Google OAuth client/origin. This Blueprint deliberately does not borrow production delivery or banking credentials. Missing email/OAuth configuration is a blocked sign-in gate, not permission to show verification codes in the UI or bypass authentication.

After creation, verify the actual deployed commit and terminal live status, `/health`, root assets and reload paths, unknown API/asset 404s, browser email/Google sign-in, reload and multi-device behavior, session revocation, tenant denial and committed persistence. Register and verify an exact HTTPS Plaid callback only when that origin and live institution testing are separately ready. No banking or payment readiness is implied by a successful web build.

Local validation covers frontend hosting and callback/reload routes, missing assets/API paths, and same-origin API resolution on onrender.com. The Blueprint validates against the current Render JSON Schema. Platform validation of live resource references is still required in Render before applying it.
