import test from 'node:test';
import assert from 'node:assert/strict';
import { planBankFeedReplay } from '../src/services/bankFeedReplayPlan.service.ts';

const base = () => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  allowedAccountIds: ['acct-a'], existing: [], events: [],
});
const event = () => ({
  kind: 'added', accountId: 'acct-a', transactionId: 'tx-1',
  amountCents: 125, pending: false,
});

test('default-ignorable Unicode cannot distinguish banking replay identity keys', () => {
  for (const character of ['\u034f', '\u180b', '\ufe0f', '\u3164', '\u115f']) {
    for (const field of ['tenantId', 'connectionId', 'accountId', 'transactionId']) {
      const input = base();
      if (field === 'accountId') input.allowedAccountIds = ['acct-a' + character];
      if (field === 'tenantId' || field === 'connectionId') input[field] += character;
      input.events = [{ ...event(), ...(field === 'accountId' ? { accountId: input.allowedAccountIds[0] } : {}),
        ...(field === 'transactionId' ? { transactionId: 'tx-1' + character } : {}) }];
      assert.throws(() => planBankFeedReplay(input), /Invalid authorized|invalid or unauthorized/,
        field + ' U+' + character.codePointAt(0).toString(16));
    }
  }
});

test('ordinary non-ASCII canonical provider IDs remain accepted', () => {
  const input = base();
  input.tenantId = 'équipe';
  input.connectionId = '商店-一号';
  input.allowedAccountIds = ['🙂'];
  input.events = [{ ...event(), accountId: '🙂', transactionId: 'écriture-1' }];
  const result = planBankFeedReplay(input);
  assert.equal(result.applied, 1);
  assert.equal(result.entries[0].transactionId, 'écriture-1');
});
