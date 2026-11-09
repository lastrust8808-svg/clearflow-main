import { types as nodeTypes } from 'node:util';

/**
 * A callback may advance only the OAuth attempt that initiated it.
 * These guards do not validate Google tokens or replace provider-side state
 * verification. They prevent an older asynchronous result from mutating a
 * newer UI attempt after a retry, cancellation or timeout.
 */
export function isCurrentGoogleAttempt(current, attemptId, expectedStatus = 'pending-gsi') {
  // A malformed or proxied state can throw while its fields are read.
  // Never let that exception advance or crash an OAuth callback.
  try {
    // The active attempt must also have explicit own data fields; inherited
    // values and getters cannot establish which callback owns this state.
    if (!current || typeof current !== 'object' || Array.isArray(current) ||
        nodeTypes.isProxy(current)) return false;
    // Active authentication state must be an ordinary record. A class or Date
    // with forged own identity fields cannot establish a pending OAuth attempt.
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const fields = {};
    for (const key of ['status', 'googleAttemptId']) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      fields[key] = descriptor.value;
    }
    // Admission is only valid during an in-flight Google authentication stage.
    // A caller-supplied status must never reopen a completed or logged-out session.
    return Boolean(
      (expectedStatus === 'pending-gsi' || expectedStatus === 'pending-drive-check') &&
      fields.status === expectedStatus &&
      typeof attemptId === 'string' &&
      attemptId.trim().length > 0 &&
      attemptId.length <= 128 &&
      attemptId === attemptId.normalize('NFC') &&
      !/[\p{Cc}\p{Cf}\p{Cs}\p{Zs}\p{Zl}\p{Zp}\uFDD0-\uFDEF\uFFFE\uFFFF]|[\u{1FFFE}-\u{1FFFF}\u{2FFFE}-\u{2FFFF}\u{3FFFE}-\u{3FFFF}\u{4FFFE}-\u{4FFFF}\u{5FFFE}-\u{5FFFF}\u{6FFFE}-\u{6FFFF}\u{7FFFE}-\u{7FFFF}\u{8FFFE}-\u{8FFFF}\u{9FFFE}-\u{9FFFF}\u{AFFFE}-\u{AFFFF}\u{BFFFE}-\u{BFFFF}\u{CFFFE}-\u{CFFFF}\u{DFFFE}-\u{DFFFF}\u{EFFFE}-\u{EFFFF}\u{FFFFE}-\u{FFFFF}\u{10FFFE}-\u{10FFFF}]/u.test(attemptId) &&
      typeof fields.googleAttemptId === 'string' &&
      fields.googleAttemptId === attemptId
    );
  } catch {
    return false;
  }
}

// Clone ordinary nested records before invoking an untrusted admission reducer.
// A shallow spread leaves nested profile/workspace objects aliased to live state.
function snapshotAdmissionState(value, seen = new WeakMap()) {
  // Executable values must not be admitted into authentication snapshots.
  if (typeof value === 'function') throw new TypeError('Executable admission state');
  if (!value || typeof value !== 'object') return value;
  // Proxy traps can impersonate plain records and run code during cloning.
  if (nodeTypes.isProxy(value)) throw new TypeError('Proxy-backed admission state');
  if (seen.has(value)) return seen.get(value);
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    throw new TypeError('Unsupported mutable admission state');
  }
  const copy = Array.isArray(value) ? [] : Object.create(proto);
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Accessor-backed admission state');
    }
    Object.defineProperty(copy, key, {
      ...descriptor,
      value: snapshotAdmissionState(descriptor.value, seen),
    });
  }
  return Object.freeze(copy);
}

export function admitGoogleAttemptResult(current, attemptId, reducer, expectedStatus = 'pending-gsi') {
  if (!isCurrentGoogleAttempt(current, attemptId, expectedStatus)) return current;
  // A reducer must preserve the originating attempt identity. Refuse malformed
  // or cross-attempt results rather than committing an ambiguous auth state.
  // A failed asynchronous admission reducer must not crash the callback path
  // or replace the active attempt with a partial authentication result.
  let next;
  try {
    // Pass a frozen snapshot so a reducer cannot mutate the active attempt
    // before its returned state has passed admission validation.
    next = reducer(snapshotAdmissionState(current));
  } catch {
    return current;
  }
  // Accessors on untrusted reducer results can throw during validation.
  // Keep admission fail-closed even when a property getter is hostile.
  try {
    if (!next || typeof next !== 'object' || Array.isArray(next) ||
        nodeTypes.isProxy(next)) return current;
    // Authentication state must be a plain record, not a Date, class instance,
    // or other object carrying hidden state or inherited behavior.
    const prototype = Object.getPrototypeOf(next);
    if (prototype !== Object.prototype && prototype !== null) return current;
    // Reject accessor-backed result fields before React or downstream consumers
    // read them. A valid identity descriptor alone cannot make a hostile
    // profile/workspace getter safe to commit into authentication state.
    for (const key of Reflect.ownKeys(next)) {
      const descriptor = Object.getOwnPropertyDescriptor(next, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return current;
    }
    // Validate nested reducer output without invoking getters or accepting
    // mutable class instances. This traversal is cycle-safe and does not
    // change the returned state object's identity.
    snapshotAdmissionState(next);
    // Inspect thenability without invoking a potentially side-effecting getter.
    // Promise instances inherit a callable `then` from their prototype.
    let candidate = next;
    while (candidate !== null) {
      const thenDescriptor = Object.getOwnPropertyDescriptor(candidate, 'then');
      if (thenDescriptor) {
        if (!Object.hasOwn(thenDescriptor, 'value') || typeof thenDescriptor.value === 'function') return current;
        break;
      }
      candidate = Object.getPrototypeOf(candidate);
    }
    // Read identity from own data descriptors, not potentially hostile Proxy
    // get traps that can disagree with the identity actually stored on state.
    const fields = {};
    for (const key of ['status', 'googleAttemptId']) {
      const field = Object.getOwnPropertyDescriptor(next, key);
      if (!field || !Object.hasOwn(field, 'value')) return current;
      fields[key] = field.value;
    }
    if (!['unauthenticated', 'pending-gsi', 'pending-drive-check', 'pending-profile-setup', 'pending-verification', 'authenticated'].includes(fields.status) ||
        fields.googleAttemptId !== attemptId) return current;
  } catch {
    return current;
  }
  return next;
}
