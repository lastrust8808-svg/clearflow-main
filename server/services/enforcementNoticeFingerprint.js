import { createHash } from 'node:crypto';
import { assessEnforcementNoticeEvidence } from './enforcementNoticeGate.js';

/**
 * Stable, non-authoritative fingerprint of a notice evidence packet.
 * This is an audit comparison aid, never verification of delivery or service.
 */
export function fingerprintEnforcementNoticeEvidence(packet) {
  // Capture one immutable data-only snapshot and validate exactly what is hashed.
  const descriptors = Object.getOwnPropertyDescriptors(packet);
  const keys = Reflect.ownKeys(descriptors);
  const snapshotPacket = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Unsupported or accessor notice field');
    Object.defineProperty(snapshotPacket, key, { value: descriptor.value, enumerable: true, configurable: true });
  }
  const assessment = assessEnforcementNoticeEvidence(snapshotPacket);
  keys.sort();
  const snapshot = keys.map(key => [key, descriptors[key].value]);
  const canonical = JSON.stringify(['clearflow.enforcement-notice-evidence.v1', snapshot]);
  return Object.freeze({
    sha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    status: assessment.status,
    reason: assessment.reason,
    serviceVerified: false
  });
}
