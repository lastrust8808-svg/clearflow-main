import { createHash } from 'node:crypto';
import { assessEnforcementNoticeEvidence } from './enforcementNoticeGate.js';

/**
 * Stable, non-authoritative fingerprint of a notice evidence packet.
 * This is an audit comparison aid, never verification of delivery or service.
 */
export function fingerprintEnforcementNoticeEvidence(packet) {
  const assessment = assessEnforcementNoticeEvidence(packet);
  // Revalidate and snapshot own descriptors; do not read user-controlled getters.
  const descriptors = Object.getOwnPropertyDescriptors(packet);
  const keys = Object.keys(descriptors).sort();
  const snapshot = keys.map(key => [key, descriptors[key].value]);
  const canonical = JSON.stringify(['clearflow.enforcement-notice-evidence.v1', snapshot]);
  return Object.freeze({
    sha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    status: assessment.status,
    reason: assessment.reason,
    serviceVerified: false
  });
}
