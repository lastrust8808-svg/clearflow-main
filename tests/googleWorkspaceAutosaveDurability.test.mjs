import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Google workspace autosave awaits durable mirror before saved acknowledgement', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const debouncedSave = useCallback(');
  const end = source.indexOf('  useEffect(() => {', start);
  assert.ok(start >= 0 && end > start, 'autosave must exist');
  const block = source.slice(start, end);
  assert.match(block, /await userDataService\.saveUserData\(token, data\)/);
  assert.match(block, /await saveAccountAppData\(googleDurableAccountId, data\)/);
  assert.doesNotMatch(block, /void saveAccountAppData\(googleDurableAccountId, data\)/);
  assert.ok(block.indexOf('await saveAccountAppData(') < block.indexOf("setSavingStatus('saved')"), 'saved must follow durable mirror');
  assert.match(block, /catch \(err\) \{[\s\S]*setSavingStatus\('error'\)/);
});

test('local workspace autosave does not acknowledge before durable mirror and reports failure', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('    if (state.localAccountId) {', source.indexOf('// This effect is the central auto-save trigger.'));
  const end = source.indexOf('\n  }, [state.appData', start);
  assert.ok(start >= 0 && end > start, 'local autosave branch must exist');
  const block = source.slice(start, end);
  assert.match(block, /saveLocalAuthAppData\(state\.localAccountId, state\.appData\)/);
  assert.match(block, /saveAccountAppData\(state\.localAccountId, state\.appData\)\s*\.then\(\(\) => \{\s*setSavingStatus\('saved'\)/);
  assert.match(block, /\.catch\(\(error\) => \{[\s\S]*?setSavingStatus\('error'\)/);
  assert.doesNotMatch(block, /void saveAccountAppData\(state\.localAccountId, state\.appData\)\.catch/);
});
