// server.js
// Main application entry point for the Clear-Flow backend.

import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import cors from 'cors';
import plaidApiRoutes from './server/routes/plaid.js';
import erpRoutes from './server/routes/erp.js';

// Load environment variables from .env file
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// --- Middleware ---
// Enable CORS for all routes to allow frontend requests
app.use(cors());
// Use JSON parser for all incoming request bodies
// Note: Webhook verification needs the raw body, so it's handled separately.
app.use('/api/plaid/webhook', bodyParser.raw({ type: 'application/json' }));
// All other routes can use the standard JSON parser.
app.use(bodyParser.json());


// --- API Routes ---
// Mount the modular Plaid router at the /api/plaid base path.
app.use('/api/plaid', plaidApiRoutes);
app.use('/api/erp', erpRoutes);

// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =================================================================
// SERVER START
// =================================================================

app.listen(PORT, () => {
  console.log(`Clear-Flow server is running on http://localhost:${PORT}`);
  console.log(`Plaid environment: ${process.env.PLAID_ENV || 'sandbox'}`);
  console.log(
    `SMTP delivery: ${
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_FROM_EMAIL
        ? 'configured'
        : 'not configured'
    }`
  );
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    console.warn('WARNING: Plaid client ID or secret not configured. API calls will fail.');
  }
});
