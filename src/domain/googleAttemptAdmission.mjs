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
    if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
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
      !/[\p{Cc}\p{Cf}\p{Cs}\p{Zs}\p{Zl}\p{Zp}]/u.test(attemptId) &&
      typeof fields.googleAttemptId === 'string' &&
      fields.googleAttemptId === attemptId
    );
  } catch {
    return false;
  }
}

export function admitGoogleAttemptResult(current, attemptId, reducer, expectedStatus = 'pending-gsi') {
  if (!isCurrentGoogleAttempt(current, attemptId, expectedStatus)) return current;
  // A reducer must preserve the originating attempt identity. Refuse malformed
  // or cross-attempt results rather than committing an ambiguous auth state.
  // A failed asynchronous admission reducer must not crash the callback path
  // or replace the active attempt with a partial authentication result.
  let next;
  try {
    next = reducer(current);
  } catch {
    return current;
  }
  // Accessors on untrusted reducer results can throw during validation.
  // Keep admission fail-closed even when a property getter is hostile.
  try {
    if (!next || typeof next !== 'object' || Array.isArray(next)) return current;
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
    if (typeof fields.status !== 'string' || !fields.status ||
        fields.googleAttemptId !== attemptId) return current;
  } catch {
    return current;
  }
  return next;
}
