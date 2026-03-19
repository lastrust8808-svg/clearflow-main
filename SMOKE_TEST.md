# Smoke Test Protocol

Follow these steps to perform a quick smoke test and verify core functionality after making changes.

1.  **Installation**
    - Open a terminal in the project root.
    - Run `npm install` (or your package manager's install command) to ensure all dependencies are up-to-date.

2.  **Start Development Server**
    - In one terminal, start the backend server: `node server.js`
    - In another terminal, start the frontend development server with the command provided by your environment (e.g., `npm run dev`).
    - The application should open in your browser without any build errors.

3.  **Core Functionality Checks**
    - **No Console Errors**: Open the developer console. There should be no red errors related to storage access, component rendering, or state hydration on page load.
    - **Theme (Skin) Switching**:
        - Locate the theme toggle button (moon/sun icon) in the application header.
        - Click the button. The UI theme should switch between light and dark modes instantly.
        - Refresh the page. The selected theme should persist.
    - **Dashboard Rendering**:
        - Use the Dev Login if necessary to access the main dashboard.
        - The `Dashboard` and `ReservesDashboard` components should render correctly with mock data or empty states.
        - Navigate between different views using the sidebar to ensure the application state updates correctly.

4.  **Verification**
    - If all the above steps pass without unexpected behavior or errors, the smoke test is successful.
