// Deterministic, offline-only transaction simulator. Never calls a bank or payment rail.
export function createMockLedger(openingBalances = {}) {
  const balances = new Map(Object.entries(openingBalances));
  const events = new Map();
  const history = [];
  function post({ id, from, to, amountCents, currency = 'USD', outcome = 'settled' }) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid transaction ID');
    if (events.has(id)) return { ...events.get(id), duplicate: true };
    if (typeof from !== 'string' || typeof to !== 'string' || !from || !to || from === to) throw new Error('Invalid counterparties');
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Invalid amount');
    if (currency !== 'USD') throw new Error('Unsupported mock currency');
    if (!['settled', 'failed', 'pending'].includes(outcome)) throw new Error('Invalid outcome');
    const available = balances.get(from) ?? 0;
    const status = outcome === 'settled' && available < amountCents ? 'failed_insufficient_funds' : outcome;
    if (status === 'settled') {
      balances.set(from, available - amountCents);
      balances.set(to, (balances.get(to) ?? 0) + amountCents);
    }
    const event = Object.freeze({ id, from, to, amountCents, currency, status });
    events.set(id, event);
    history.push(event);
    return event;
  }
  return {
    post,
    balance(account) { return balances.get(account) ?? 0; },
    events() { return [...history]; },
    reconcile() {
      const totalOpening = Object.values(openingBalances).reduce((a, b) => a + b, 0);
      const totalCurrent = [...balances.values()].reduce((a, b) => a + b, 0);
      return { balanced: totalOpening === totalCurrent, totalOpening, totalCurrent };
    },
  };
}
