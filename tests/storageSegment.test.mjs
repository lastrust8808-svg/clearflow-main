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

test('rejects trailing periods that alias another directory on Windows', () => {
  for (const value of ['member.', 'member..', 'folder.name.', '..\\..']) {
    assert.throws(() => sanitizeStorageSegment(value), TypeError, value);
  }
  assert.equal(sanitizeStorageSegment('member'), 'member');
  assert.equal(sanitizeStorageSegment('folder.name'), 'folder.name');
});

test('rejects reserved Windows device names including names with extensions', () => {
  for (const value of ['CON', 'con', 'con.txt', 'PRN', 'AUX', 'NUL.json', 'COM1', 'com9.txt', 'LPT1', 'lpt9.csv']) {
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
