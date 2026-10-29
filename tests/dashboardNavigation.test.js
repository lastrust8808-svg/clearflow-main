import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const overview = source('../src/components/pages/OverviewPage.tsx');
const app = source('../src/app/App.tsx');
const accounting = source('../src/components/pages/AccountingPage.tsx');
const entities = source('../src/components/pages/EntitiesPage.tsx');
const documents = source('../src/components/pages/DocumentsPage.tsx');

test('all twelve Odoo workspace tiles point to registered sections', () => {
  const tiles = overview.match(/const workspaceApps = \[([\s\S]*?)\];/)?.[1];
  assert.ok(tiles, 'workspace app tiles must exist');
  const routes = [...tiles.matchAll(/hash: '(#[^']+)'/g)].map((match) => match[1]);
  assert.equal(routes.length, 12);
  for (const route of routes) {
    const section = route.slice(1).split(':')[0];
    assert.ok(app.includes("'" + section + "'"), 'unregistered section: ' + route);
    if (route.startsWith('#accounting:')) {
      const subsection = route.slice('#accounting:'.length);
      assert.ok(accounting.includes("'" + subsection + "'"), 'unregistered accounting subsection: ' + route);
    }
  }
});

test('quick actions map to real handlers', () => {
  for (const action of ['new-bill', 'new-payment', 'new-intercompany']) {
    assert.ok(accounting.includes("'" + action + "'"), 'missing action: ' + action);
  }
  assert.ok(entities.includes('#entities:new'));
  assert.ok(documents.includes('#documents:upload'));
});

test('entity selector and responsive app tiles remain wired', () => {
  assert.ok(overview.includes('onSelectActiveEntity?.(event.target.value || null)'));
  assert.ok(overview.includes('records.filter((item) => item.entityId === activeEntityId)'));
  assert.ok(overview.includes('onClick={() => navigate(app.hash)}'));
  for (const minWidth of [205, 220, 230, 280]) {
    assert.ok(overview.includes(`minmax(min(100%, ${minWidth}px), 1fr)`), `grid must fit narrow screens: ${minWidth}px`);
  }
});
