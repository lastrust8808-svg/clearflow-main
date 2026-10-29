/**
 * Pure trustee-signing eligibility check against a supplied governance snapshot.
 * This is NOT authentication, evidence of identity/signature, proof of trustee
 * authority, or a legal opinion. The caller must authenticate the tenant,
 * authorize access to the trust, and verify the instrument and appointments.
 * No records, signatures, payments, or notices are created by this function.
 *
 * Dates are calendar dates (YYYY-MM-DD). `revokedOn` is exclusive: an
 * appointment is inactive on and after that date. `acceptedOn` is mandatory
 * for an appointment to become active. Only independent and unanimous-joint
 * policies are supported; quorum, successor priorities and delegated powers
 * require separate reviewed rules and must not be inferred.
 */
function id(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${field} must be a nonempty unpadded string`);
  }
  return value;
}

function calendarDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${field} must be a YYYY-MM-DD calendar date`);
  }
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    throw new RangeError(`${field} is not a valid calendar date`);
  }
  return value;
}

/**
 * @param {{tenantId:string, entityId:string, trustId:string,
 *   asOfDate:string, mode:'independent'|'joint', signerIds:string[],
 *   appointments:Array<{trusteeId:string,tenantId:string,entityId:string,
 *     trustId:string,effectiveOn:string,acceptedOn?:string,revokedOn?:string}>}} snapshot
 * @returns {{eligible:boolean,reason:string,activeTrusteeCount:number,
 *   signerCount:number}} Frozen policy assessment, not an authorization token.
 */
export function evaluateTrusteeSigningPolicy(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('Governance snapshot required');
  }
  const tenantId = id(snapshot.tenantId, 'tenantId');
  const entityId = id(snapshot.entityId, 'entityId');
  const trustId = id(snapshot.trustId, 'trustId');
  const asOfDate = calendarDate(snapshot.asOfDate, 'asOfDate');
  if (snapshot.mode !== 'independent' && snapshot.mode !== 'joint') {
    throw new TypeError('Unsupported trustee signing mode');
  }
  if (!Array.isArray(snapshot.appointments) || !Array.isArray(snapshot.signerIds)) {
    throw new TypeError('appointments and signerIds must be arrays');
  }
  const trustees = new Set();
  const active = new Set();
  for (const appointment of snapshot.appointments) {
    if (!appointment || typeof appointment !== 'object' || Array.isArray(appointment)) {
      throw new TypeError('Invalid trustee appointment');
    }
    const trusteeId = id(appointment.trusteeId, 'appointment.trusteeId');
    if (trustees.has(trusteeId)) throw new Error('Duplicate trustee appointment');
    trustees.add(trusteeId);
    if (appointment.tenantId !== tenantId || appointment.entityId !== entityId ||
        appointment.trustId !== trustId) {
      throw new Error('Trustee appointment tenant/entity/trust mismatch');
    }
    const effectiveOn = calendarDate(appointment.effectiveOn, 'appointment.effectiveOn');
    const acceptedOn = appointment.acceptedOn == null ? null :
      calendarDate(appointment.acceptedOn, 'appointment.acceptedOn');
    const revokedOn = appointment.revokedOn == null ? null :
      calendarDate(appointment.revokedOn, 'appointment.revokedOn');
    if (revokedOn !== null && revokedOn < effectiveOn) {
      throw new RangeError('Revocation precedes appointment effective date');
    }
    // Revocation is exclusive. An appointment cannot be accepted on or after
    // its revocation date; otherwise a revoked trustee could be represented
    // as having subsequently accepted an authority that no longer exists.
    if (revokedOn !== null && acceptedOn !== null && acceptedOn >= revokedOn) {
      throw new RangeError('Trustee acceptance must precede revocation');
    }
    if (effectiveOn <= asOfDate && acceptedOn !== null && acceptedOn <= asOfDate &&
        (revokedOn === null || asOfDate < revokedOn)) {
      active.add(trusteeId);
    }
  }
  const signers = new Set();
  for (const signer of snapshot.signerIds) {
    const signerId = id(signer, 'signerIds item');
    if (signers.has(signerId)) throw new Error('Duplicate signer ID');
    signers.add(signerId);
  }
  const activeTrusteeCount = active.size;
  const signerCount = signers.size;
  const result = (eligible, reason) => Object.freeze({
    eligible, reason, activeTrusteeCount, signerCount,
  });
  if (activeTrusteeCount === 0) return result(false, 'no_active_accepted_trustees');
  if ([...signers].some(signer => !active.has(signer))) {
    return result(false, 'signer_not_active');
  }
  if (snapshot.mode === 'independent') {
    return signerCount === 1 ? result(true, 'eligible_under_supplied_policy') :
      result(false, 'independent_requires_one_active_signer');
  }
  return signerCount === activeTrusteeCount ? result(true, 'eligible_under_supplied_policy') :
    result(false, 'joint_requires_all_active_signers');
}
