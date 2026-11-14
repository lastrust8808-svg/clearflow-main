/** Non-posting review of claimed enforcement-notice delivery; never proof of service. */
export function assessEnforcementNoticeEvidence(packet) {
  if (!packet || Object.getPrototypeOf(packet) !== Object.prototype) throw new TypeError('Plain notice packet required');
  const fields = new Set(['tenantId','trustId','noteId','noticeId','noticeVersionId','preparedEvidenceRef','deliveryEvidenceRef','preparedAt','deliveredAt','evaluatedAt']);
  const descriptors = Object.getOwnPropertyDescriptors(packet);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !fields.has(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) throw new TypeError('Unsupported or accessor notice field');
  }
  // Use inspected own data descriptors, never property reads that a Proxy can trap.
  const ownValue = key => Object.hasOwn(descriptors, key) ? descriptors[key].value : undefined;
  const idFields = ['tenantId','trustId','noteId','noticeId','noticeVersionId','preparedEvidenceRef'];
  for (const key of idFields) {
    if (typeof ownValue(key) !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(ownValue(key))) throw new TypeError('Invalid notice identifier: ' + key);
  }
  const identifiers = idFields.map(key => ownValue(key));
  if (new Set(identifiers).size !== identifiers.length) throw new Error('Notice identifiers and preparation evidence must be distinct');
  const utc = (value, key) => {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('Invalid canonical UTC timestamp: ' + key);
    return value;
  };
  const evaluatedAt = utc(ownValue('evaluatedAt'), 'evaluatedAt');
  const preparedAt = Object.hasOwn(descriptors, 'preparedAt') ? utc(ownValue('preparedAt'), 'preparedAt') : null;
  // Explicit null is not an omitted field: reject ambiguous evidence claims.
  if (Object.hasOwn(descriptors, 'deliveryEvidenceRef') && ownValue('deliveryEvidenceRef') === undefined) throw new TypeError('Undefined delivery evidence reference must be omitted');
  if (Object.hasOwn(descriptors, 'deliveredAt') && ownValue('deliveredAt') === undefined) throw new TypeError('Undefined delivery timestamp must be omitted');
  if (Object.hasOwn(descriptors, 'deliveryEvidenceRef') && ownValue('deliveryEvidenceRef') === null) throw new TypeError('Invalid null delivery evidence reference');
  if (Object.hasOwn(descriptors, 'deliveredAt') && ownValue('deliveredAt') === null) throw new TypeError('Invalid null delivery timestamp');
  const deliveryEvidenceRef = Object.hasOwn(descriptors, 'deliveryEvidenceRef') ? ownValue('deliveryEvidenceRef') : undefined;
  const suppliedDeliveredAt = Object.hasOwn(descriptors, 'deliveredAt') ? ownValue('deliveredAt') : undefined;
  if (deliveryEvidenceRef != null && (typeof deliveryEvidenceRef !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(deliveryEvidenceRef) || identifiers.includes(deliveryEvidenceRef))) throw new TypeError('Invalid or reused delivery evidence reference');
  if (suppliedDeliveredAt != null) utc(suppliedDeliveredAt, 'deliveredAt');
  // Evaluate chronology for every supplied delivery timestamp, even when its
  // supporting reference is absent; partial claims must not mask contradictions.
  const deliveredAt = suppliedDeliveredAt;
  // An impossible preparation time takes precedence over relative delivery order;
  // otherwise a future preparation can be misreported as early delivery.
  if (preparedAt && preparedAt > evaluatedAt) return Object.freeze({status:'incomplete',reason:'preparation_after_evaluation'});
  if (deliveredAt != null && deliveredAt > evaluatedAt) return Object.freeze({status:'incomplete',reason:'delivery_after_evaluation'});
  if (deliveredAt != null && preparedAt && deliveredAt < preparedAt) return Object.freeze({status:'incomplete',reason:'delivery_before_preparation'});
  if (deliveryEvidenceRef == null && deliveredAt == null) return Object.freeze({status:'incomplete',reason:'delivery_evidence_missing'});
  // Without a preparation timestamp, the claimed delivery cannot be checked
  // against preparation chronology. Never mark it ready for human review.
  if (preparedAt == null) return Object.freeze({status:'incomplete',reason:'preparation_timestamp_missing'});
  if (deliveryEvidenceRef == null || deliveredAt == null) return Object.freeze({status:'incomplete',reason:'partial_delivery_evidence'});
  return Object.freeze({status:'evidence_ready_for_review',reason:'unverified_delivery_claim'});
}
