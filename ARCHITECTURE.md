# Clear-Flow Architecture Overview

This document provides a high-level overview of the Clear-Flow application's architecture.

## Frontend

-   **Framework**: React 18 with TSX.
-   **Structure**: The application is a Single Page Application (SPA) without a formal routing library (like `react-router-dom`). View switching is handled internally via React state.
-   **Entrypoint**: The application's entrypoint is `index.tsx`, which renders the main `App` component into the `root` div in `index.html`.
-   **Styling**: Tailwind CSS is loaded via a CDN script in `index.html`. Global styles and light/dark theme variables are also defined in `index.html`.
-   **State Management**:
    -   **Global State**: React Context is used for global state, primarily for authentication and user data (`src/contexts/AuthContext.tsx`).
    -   **Local State**: Standard React hooks (`useState`, `useEffect`, `useMemo`, etc.) are used for component-level state.
-   **Data Persistence**: User and entity data is persisted across sessions by saving it to a JSON file in the user's Google Drive App Data folder. The `user-data.service.ts` handles this logic.

## Backend

-   **Framework**: A simple Node.js server using Express, located in `server.js` and the `server/` directory.
-   **Purpose**: The backend's primary role is to securely handle server-to-server integrations, specifically with the Plaid API. It manages Plaid secrets, exchanges tokens, and processes webhooks.
-   **Configuration**: The backend is configured using environment variables defined in a `.env` file at the project root.

## Authentication

-   **Provider**: Google Sign-In (GSI) for Web (OAuth 2.0).
-   **Flow**:
    1.  The `AuthContext` initializes the Google GSI client.
    2.  The user signs in with their Google account via the button rendered on the `Welcome` screen.
    3.  `AuthContext` receives the ID token and requests an access token with Google Drive API scopes (`drive.appdata`).
    4.  With the access token, the `user-data.service.ts` attempts to load the `clear-flow-app-data.json` file from the user's App Data folder on Google Drive.
    5.  If the file exists, the user is authenticated and their data is loaded. If not, the user is guided through a first-time profile setup.
    6.  All subsequent data changes are debounced and saved back to the same file in Google Drive.

## Folder Structure

-   `src/app`: Contains the main `App.tsx` component, which serves as the root of the React application.
-   `src/components`: Contains all reusable React components, organized by feature.
-   `src/contexts`: Contains React Context providers for global state.
-   `src/services`: Contains client-side services that encapsulate business logic and API calls (e.g., `gemini.service.ts`, `plaid.service.ts`).
-   `src/types`: Contains all shared TypeScript type definitions and interfaces (`app.models.ts`).
-   `src/utils`: Contains utility functions (e.g., `storage.ts`).
-   `server/`: Contains all backend Node.js/Express code.
