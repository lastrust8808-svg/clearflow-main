# Deploy Domain Checklist

This checklist outlines the necessary steps to ensure a smooth transition when deploying the Clear-Flow application to a live domain.

### 1. Environment Variables

The application uses two sets of environment variables.

**A) Frontend (Client-Side)**
These are configured directly in `index.html`. They are public keys and identifiers.

-   **Required Variables**:
    -   `GOOGLE_CLIENT_ID`
    -   `API_KEY` (for Gemini, if used)
    -   `PLAID_CLIENT_ID`
    -   `REACT_APP_API_BASE_URL`
-   **Action Required**:
    -   Update `GOOGLE_CLIENT_ID` with the production OAuth Client ID.
    -   Update `REACT_APP_API_BASE_URL` to point to the live production backend server URL.

**B) Backend (Server-Side)**
These are configured in a `.env` file at the project root for the Node.js server. They include secrets.

-   **Required Variables**:
    -   `PORT`
    -   `PLAID_CLIENT_ID`
    -   `PLAID_SECRET`
    -   `PLAID_ENV` (set to `development` or `production`)
    -   `PLAID_WEBHOOK_URL`
    -   `ENCRYPTION_KEY`
-   **Action Required**: Create a `.env` file on the production server with the appropriate production keys and URLs. Ensure the `ENCRYPTION_KEY` is a securely generated random string.

### 2. OAuth / Redirect URLs

-   **Provider**: Google OAuth 2.0
-   **Action Required**: In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), update the "Authorized JavaScript origins" for your OAuth 2.0 Client ID to include the new production domain (e.g., `https://your-domain.com`).

### 3. CORS / API Endpoints

-   **Backend Endpoint**: Configured via `REACT_APP_API_BASE_URL`.
-   **Action Required**: The backend server must be configured to accept Cross-Origin Resource Sharing (CORS) requests from the new production frontend domain. Update the server's `cors` middleware origin whitelist to include `https://your-domain.com`.

### 4. Plaid Configuration

-   **Action Required**: In the [Plaid Dashboard](https://dashboard.plaid.com/team/api), add your backend's `PLAID_WEBHOOK_URL` to the list of allowed webhook URLs.

### 5. Frontend Routing / Base Path

-   **Current State**: The application does not use a routing library and runs from the domain root.
-   **Action Required**: No action is needed if deploying to a domain root (e.g., `https://your-app.com`). If deploying to a sub-path (e.g., `https://example.com/clear-flow/`), the build configuration will need to be updated to set the correct base path for assets.

### 6. Cache / Service Worker

-   **Service Worker**: The application uses `service-worker.js`.
-   **Action Required**: When deploying a new version, ensure the service worker's cache name (`CACHE_NAME` constant in `service-worker.js`) is updated (e.g., `v1` to `v2`). This forces clients to fetch the latest assets and avoids being stuck on old cached versions.
