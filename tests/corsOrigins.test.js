import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredOrigins, isAllowedBrowserOrigin } from '../server/middleware/corsOrigins.js';
const allowed = configuredOrigins('https://clearflow.site,https://www.clearflow.site');
test('accepts exact approved origins and originless authenticated API clients', () => {
  assert.equal(isAllowedBrowserOrigin('https://clearflow.site', allowed), true);
  assert.equal(isAllowedBrowserOrigin(undefined, allowed), true);
});
test('rejects cross-origin impersonation and insecure origins', () => {
  for (const origin of ['https://clearflow.site.evil.com', 'http://clearflow.site', 'null',
    'https://evil.com', 'https://clearflow.site@evil.com', 'https://clearflow.site/path',
    'https://clearflow.site?redirect=x', 'https://clearflow.site/', 'not-an-origin']) {
    assert.equal(isAllowedBrowserOrigin(origin, allowed), false, origin);
  }
});
