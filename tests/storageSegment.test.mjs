import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sanitizeStorageSegment } from '../server/utils/storageSegment.js';

const root = path.resolve('/tmp', 'clearflow-test', 'accounts');

test('rejects filesystem dot traversal and missing storage identifiers', () => {
  for (const value of ['.', '..', '', '  ', null, undefined]) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError);
  }
});

test('encodes slash, backslash, percent, and nested traversal as a single segment', () => {
  for (const value of ['alice/bob', '..\\other', '../other', '%2e%2e', 'member@example.com']) {
    const encoded = sanitizeStorageSegment(value);
    const resolved = path.resolve(root, encoded);
    assert.equal(path.dirname(resolved), root);
    assert.notEqual(encoded, '.');
    assert.notEqual(encoded, '..');
    assert.ok(!encoded.includes('/'));
    assert.ok(!encoded.includes('\\'));
  }
});

test('different account IDs retain distinct storage paths', () => {
  const identifiers = ['member-a', 'member-b', 'a/b', 'a%2Fb', 'member@example.com'];
  const segments = identifiers.map(sanitizeStorageSegment);
  assert.equal(new Set(segments).size, identifiers.length);
});

test('rejects non-string identifiers instead of coercing distinct principals to one directory', () => {
  for (const value of [0, 42, true, false, {}, { toString: () => 'member-a' }, ['member-a'], Symbol('member-a')]) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError);
  }
  assert.equal(sanitizeStorageSegment('42'), '42');
});

test('rejects control characters in storage identifiers without altering valid unicode IDs', () => {
  for (const value of ['a\0b', 'a\nb', 'a\rb', 'a\tb', 'a\u007fb', 'a\u0085b']) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError);
  }
  assert.equal(sanitizeStorageSegment('élève@example.com'), '%C3%A9l%C3%A8ve%40example.com');
});

test('rejects invisible Unicode format controls in account and file identifiers', () => {
  for (const value of [
    'acct\u200B-one', // zero-width space
    'acct\u200C-one', // zero-width non-joiner
    'acct\u200D-one', // zero-width joiner
    'acct\u202E-one', // right-to-left override
    'acct\u2066-one', // left-to-right isolate
    'acct\uFEFF-one', // byte-order mark / zero-width no-break space
  ]) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError, JSON.stringify(value));
  }
  for (const value of ['élève@example.com', '商店-一号', '🙂', 'member@example.com']) {
    assert.equal(sanitizeStorageSegment(value), encodeURIComponent(value), value);
  }
});

test('rejects trailing periods that alias another directory on Windows', () => {
  for (const value of ['member.', 'member..', 'folder.name.', '..\\..']) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError, value);
  }
  assert.equal(sanitizeStorageSegment('member'), 'member');
  assert.equal(sanitizeStorageSegment('folder.name'), 'folder.name');
});

test('rejects reserved Windows device names including names with extensions', () => {
  for (const value of ['CON', 'con', 'con.txt', 'CONIN$', 'conin$.txt', 'CONOUT$', 'conout$.json', 'PRN', 'AUX', 'NUL.json', 'COM1', 'com9.txt', 'LPT1', 'lpt9.csv', 'COM¹', 'com².txt', 'COM³', 'LPT¹', 'lpt².log', 'LPT³']) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError, value);
  }
  for (const value of ['console', 'com10', 'lpt10', 'report.final', 'member@example.com']) {
    assert.equal(sanitizeStorageSegment(value), encodeURIComponent(value), value);
  }
});

test('rejects overlong encoded segments before filesystem I/O, preserving valid boundary values', () => {
  const maxAscii = 'a'.repeat(250);
  assert.equal(sanitizeStorageSegment(maxAscii), maxAscii);
  assert.equal(sanitizeStorageSegment(maxAscii).length + '.json'.length, 255);
  for (const value of ['a'.repeat(251), 'é'.repeat(42), '🙂'.repeat(21)]) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError, value.slice(0, 12));
  }
  assert.equal(sanitizeStorageSegment('é'.repeat(41)).length, 246);
});

test('rejects unpaired UTF-16 surrogates as invalid identifiers but preserves valid pairs', () => {
  for (const value of ['\\uD800', '\\uDC00', 'member\\uD800', '\\uD800a']) {
    const actual = value.replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
    assert.throws(() => sanitizeStorageSegment(actual), TypeError);
  }
  assert.equal(sanitizeStorageSegment('🙂'), '%F0%9F%99%82');
});

test('rejects non-NFC storage identifiers to prevent canonical identity aliases', () => {
  const composed = '\u00e9quipe';
  const decomposed = 'e\u0301quipe';
  assert.notEqual(composed, decomposed);
  assert.equal(decomposed.normalize('NFC'), composed);
  assert.equal(sanitizeStorageSegment(composed), encodeURIComponent(composed));
  assert.throws(() => sanitizeStorageSegment(decomposed), TypeError);
  assert.throws(() => sanitizeStorageSegment('member-' + decomposed), TypeError);
});

test('rejects Unicode line and paragraph separators in storage identities', () => {
  for (const value of ['member\u2028admin', 'member\u2029admin']) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError);
  }
  assert.equal(sanitizeStorageSegment('member-admin'), 'member-admin');
});

test('rejects edge whitespace in storage identities while allowing internal spaces', () => {
  for (const value of [' member', 'member ', '\tmember', 'member\n', '\u00a0member', 'member\u2003']) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError, JSON.stringify(value));
  }
  assert.equal(sanitizeStorageSegment('member account'), 'member%20account');
});


test('rejects noncharacters at every Unicode plane boundary without blocking adjacent scalar values', () => {
  for (let plane = 0; plane <= 16; plane += 1) {
    const end = (plane << 16) + 0xFFFF;
    for (const code of [end - 1, end]) {
      assert.throws(
        () => sanitizeStorageSegment('tenant-' + String.fromCodePoint(code)),
        TypeError,
        'plane ' + plane + ', U+' + code.toString(16),
      );
    }
  }
  for (const code of [0xFDCF, 0xFDD0 - 1, 0xFDF0, 0x1FFFD, 0x10FFFD]) {
    assert.equal(
      sanitizeStorageSegment('tenant-' + String.fromCodePoint(code)),
      encodeURIComponent('tenant-' + String.fromCodePoint(code)),
    );
  }
});

test('rejects Unicode noncharacters in account and document identifiers', () => {
  for (const code of [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x10FFFF]) {
    assert.throws(() => sanitizeStorageSegment('member-' + String.fromCodePoint(code)), TypeError);
  }
  assert.equal(sanitizeStorageSegment('member-🙂'), 'member-%F0%9F%99%82');
});

test('rejects non-ASCII Unicode spacing aliases inside storage identifiers', () => {
  for (const code of [0x00a0, 0x1680, 0x2000, 0x2003, 0x200a, 0x202f, 0x205f, 0x3000]) {
    const value = 'member' + String.fromCodePoint(code) + 'account';
    assert.throws(() => sanitizeStorageSegment(value), TypeError, 'U+' + code.toString(16));
  }
  for (const value of ['member account', '商店 一号', 'member-account']) {
    assert.equal(sanitizeStorageSegment(value), encodeURIComponent(value));
  }
});


test('percent-encoded path spellings cannot alias distinct account identifiers', () => {
  const identifiers = [
    'tenant/a', 'tenant%2Fa', 'tenant%252Fa',
    'tenant\\\\a', 'tenant%5Ca',
    'tenant:a', 'tenant%3Aa',
    'tenant?x', 'tenant%3Fx',
    'tenant#x', 'tenant%23x',
    'tenant space', 'tenant%20space',
    'équipe', '%C3%A9quipe',
  ];
  const encoded = identifiers.map(sanitizeStorageSegment);
  assert.equal(new Set(encoded).size, identifiers.length);
  for (const segment of encoded) {
    assert.equal(path.dirname(path.resolve(root, segment)), root);
    assert.ok(!segment.includes('/') && !segment.includes('\\\\'));
  }
});


test('all ASCII and C1 control code points fail closed as storage identities', () => {
  for (let code = 0; code <= 0x9f; code += 1) {
    if (code > 0x1f && code < 0x7f) continue;
    const value = 'tenant-' + String.fromCodePoint(code) + '-account';
    assert.throws(() => sanitizeStorageSegment(value), TypeError, 'U+' + code.toString(16));
  }
  for (const value of ['tenant-account', 'tenant account', 'tenant_123']) {
    assert.equal(sanitizeStorageSegment(value), encodeURIComponent(value));
  }
});

test('rejects the complete U+FDD0–U+FDEF noncharacter range', () => {
  for (let code = 0xFDD0; code <= 0xFDEF; code += 1) {
    const value = 'tenant-' + String.fromCodePoint(code);
    assert.throws(() => sanitizeStorageSegment(value), TypeError, 'U+' + code.toString(16));
  }
  for (const code of [0xFDCF, 0xFDF0]) {
    const value = 'tenant-' + String.fromCodePoint(code);
    assert.equal(sanitizeStorageSegment(value), encodeURIComponent(value));
  }
});


test('encoded punctuation obeys the filesystem basename limit at exact boundaries', () => {
  // A percent-encoded slash consumes three filename bytes, not one.
  const atLimit = 'a'.repeat(247) + '/';
  assert.equal(sanitizeStorageSegment(atLimit).length, 250);
  assert.equal(sanitizeStorageSegment(atLimit), 'a'.repeat(247) + '%2F');
  assert.throws(() => sanitizeStorageSegment('a'.repeat(248) + '/'), TypeError);

  // Multibyte scalar values are counted after UTF-8 percent encoding.
  const unicodeAtLimit = 'a'.repeat(238) + '🙂';
  assert.equal(sanitizeStorageSegment(unicodeAtLimit).length, 250);
  assert.throws(() => sanitizeStorageSegment('a'.repeat(239) + '🙂'), TypeError);
});


test('encoded tenant identifiers remain single path components on POSIX and Windows', () => {
  const identifiers = [
    'tenant/child', 'tenant\\\\child', '../tenant', '..\\\\tenant',
    'tenant:stream', 'tenant?query', 'tenant*glob', 'tenant|pipe',
    'tenant%2Fchild', 'tenant%5Cchild', 'tenant space', '商店/一号',
  ];
  for (const identifier of identifiers) {
    const segment = sanitizeStorageSegment(identifier);
    for (const implementation of [path.posix, path.win32]) {
      const base = implementation.resolve(implementation.sep, 'clearflow', 'accounts');
      const resolved = implementation.resolve(base, segment + '.json');
      assert.equal(implementation.dirname(resolved), base, identifier);
      assert.equal(implementation.basename(resolved), segment + '.json', identifier);
    }
  }
});


test('encoded tenant identities cannot escape their storage root through dot-like or separator spellings', () => {
  // Trailing literal dots are intentionally rejected on Windows, not encoded.
  for (const rejected of ['..%2f..', 'tenant\\\\..']) {
    assert.throws(() => sanitizeStorageSegment(rejected), TypeError, rejected);
  }
  const identifiers = ['%2e%2e/', '.%2e\\\\', 'tenant/%2e%2e', 'tenant%252fchild'];
  for (const identifier of identifiers) {
    const segment = sanitizeStorageSegment(identifier);
    for (const implementation of [path.posix, path.win32]) {
      const base = implementation.resolve(implementation.sep, 'clearflow', 'accounts');
      const filename = segment + '.json';
      const resolved = implementation.resolve(base, filename);
      assert.equal(implementation.dirname(resolved), base, identifier);
      assert.equal(implementation.basename(resolved), filename, identifier);
    }
  }
});
