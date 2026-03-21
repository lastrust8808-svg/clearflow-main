import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/app/App';
import { AuthProvider } from './src/contexts/AuthContext';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <AuthProvider>
          <App />
        </AuthProvider>
      </React.StrictMode>
    );
  }
});

// AI Studio always uses an `index.tsx` file for all project types.
