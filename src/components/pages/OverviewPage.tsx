import type { CSSProperties } from 'react';
import type { CoreDataBundle } from '../../types/core';
import type { User } from '../../types/app.models';

interface Props {
  data: CoreDataBundle;
  currentUser?: User | null;
  activeEntityId?: string | null;
  onSelectActiveEntity?: (id: string | null) => void;
  hasDriveAccess?: boolean;
}
const apps = [
  { title: 'ERP & Accounting', detail: 'Invoices, bills, journals, receivables and financial reports', route: '#accounting:dashboard', symbol: '▦' },
  { title: 'Banking & Payments', detail: 'Bank feeds, payment approvals and reconciliation', route: '#accounting:bankFeed', symbol: '↔' },
  { title: 'Business Portal', detail: 'Business operations, customers, vendors and inventory', route: '#accounting:dashboard', symbol: '▤' },
  { title: 'Trusts & Holdings', detail: 'Trust records, holdings, fiduciary authority and reserves', route: '#entities', symbol: '◇' },
  { title: 'Documents & Vault', detail: 'Upload, organize and retrieve entity records', route: '#documents', symbol: '▧' },
  { title: 'Entity Creation', detail: 'Create organizations and review authority documents', route: '#entities:new', symbol: '+' },
  { title: 'Logo & Seal Studio', detail: 'Create branded marks and document assets in the studio', route: '#aiStudio', symbol: '✦' },
  { title: 'Assets & Inventory', detail: 'Track equipment, properties and reserves', route: '#assets', symbol: '◈' },
  { title: 'Transactions', detail: 'Internal transfers and settlement tracking', route: '#transactions', symbol: '⇄' },
  { title: 'Compliance & Reports', detail: 'Review controls, audit evidence and reporting', route: '#compliance', symbol: '✓' },
  { title: 'Credit Building', detail: 'Credit accounts, reporting and review plans', route: '#credit', symbol: '▥' },
  { title: 'Administration', detail: 'Workspace preferences and connected services', route: '#settings', symbol: '⚙' },
] as const;
const card: CSSProperties = {
  border: '1px solid var(--cf-border)', borderRadius: 18,
  background: 'rgba(255,255,255,0.035)', color: 'var(--cf-text)',
  minHeight: 142, padding: 16, display: 'grid', gap: 8,
  textAlign: 'left', cursor: 'pointer', alignContent: 'start'
};
const action: CSSProperties = {
  border: '1px solid var(--cf-border)', borderRadius: 11,
  background: 'rgba(54,215,255,0.09)', color: 'var(--cf-text)',
  minHeight: 42, padding: '10px 14px', cursor: 'pointer', fontWeight: 700
};
function go(route: string) { if (typeof window !== 'undefined') window.location.hash = route; }

export default function OverviewPage({ data, currentUser, activeEntityId, onSelectActiveEntity, hasDriveAccess = false }: Props) {
  const selected = data.entities.find(entity => entity.id === activeEntityId);
  const isTrust = selected?.type === 'trust';
  const featured = apps.filter(app => !selected ||
    (isTrust ? app.title !== 'Business Portal' : app.title !== 'Trusts & Holdings'));
  return <main style={{ display: 'grid', gap: 22 }}>
    <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, alignItems: 'center' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 850 }}>Your Clear.Flow Workspace</h1>
        <p style={{ color: 'var(--cf-muted)', margin: '7px 0 0' }}>Choose an app to open its focused workspace.</p>
      </div>
      <label style={{ display: 'grid', gap: 5, color: 'var(--cf-muted)', fontSize: 12 }}>
        Active entity <span title="Choose the organization whose records you want to view." aria-label="Help: active entity">ⓘ</span>
        <select aria-label="Active entity" value={activeEntityId || ''} onChange={e => onSelectActiveEntity?.(e.target.value || null)}
          style={{ minHeight: 44, borderRadius: 11, border: '1px solid var(--cf-border)', padding: '0 12px', background: 'var(--cf-sidebar-bg, #10181d)', color: 'var(--cf-text)' }}>
          <option value="">Collective workspace</option>
          {data.entities.map(entity => <option key={entity.id} value={entity.id}>{entity.displayName || entity.name}</option>)}
        </select>
      </label>
    </header>
    <section aria-label="Applications" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 13 }}>
      {featured.map(app => <button type="button" key={app.title} style={card} onClick={() => go(app.route)}>
        <span aria-hidden="true" style={{ width: 43, height: 43, display: 'grid', placeItems: 'center', borderRadius: 12,
          background: 'linear-gradient(135deg, #005A9E, #4CAF50)', color: 'white', fontSize: 24 }}>{app.symbol}</span>
        <strong style={{ fontSize: 15 }}>{app.title}</strong>
        <span style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.5 }}>{app.detail}</span>
      </button>)}
    </section>
    <section aria-label="Quick actions" style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>Quick actions <span title="Actions open their dedicated forms. Save, cancel and edit options depend on the record's lifecycle and permissions." style={{ fontSize: 13, color: 'var(--cf-muted)' }}>ⓘ</span></h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        <button type="button" style={action} onClick={() => go('#accounting:new-invoice')}>+ Invoice</button>
        <button type="button" style={action} onClick={() => go('#accounting:new-bill')}>+ Bill</button>
        <button type="button" style={action} onClick={() => go('#documents:upload')}>+ Document</button>
        <button type="button" style={action} onClick={() => go('#entities:new')}>+ Entity</button>
        <button type="button" style={action} onClick={() => go('#accounting:new-intercompany')}>+ Intercompany</button>
      </div>
      {!hasDriveAccess && <p style={{ color: 'var(--cf-muted)', fontSize: 12, margin: 0 }}>Document cloud storage is not connected. <button type="button" onClick={() => go('#settings')} style={{ ...action, minHeight: 32, padding: '4px 9px' }}>Configure storage</button></p>}
    </section>
    <p style={{ color: 'var(--cf-muted)', fontSize: 12, margin: 0 }}>Signed in as {currentUser?.email || 'workspace member'}. Financial transfers remain subject to verified permissions and provider approval.</p>
  </main>;
}
