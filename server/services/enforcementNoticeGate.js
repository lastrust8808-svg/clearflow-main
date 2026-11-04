/** Non-posting review of claimed enforcement-notice delivery; never proof of service. */
export function assessEnforcementNoticeEvidence(packet) {
  if (!packet || Object.getPrototypeOf(packet) !== Object.prototype) throw new TypeError('Plain notice packet required');
  const fields = new Set(['tenantId','trustId','noteId','noticeId','noticeVersionId','preparedEvidenceRef','deliveryEvidenceRef','preparedAt','deliveredAt','evaluatedAt']);
  const descriptors = Object.getOwnPropertyDescriptors(packet);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !fields.has(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) throw new TypeError('Unsupported or accessor notice field');
  }
  const idFields = ['tenantId','trustId','noteId','noticeId','noticeVersionId','preparedEvidenceRef'];
  for (const key of idFields) {
    if (typeof packet[key] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(packet[key])) throw new TypeError('Invalid notice identifier: ' + key);
  }
  const identifiers = idFields.map(key => packet[key]);
  if (new Set(identifiers).size !== identifiers.length) throw new Error('Notice identifiers and preparation evidence must be distinct');
  const utc = (value, key) => {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('Invalid canonical UTC timestamp: ' + key);
    return value;
  };
  const evaluatedAt = utc(packet.evaluatedAt, 'evaluatedAt');
  const preparedAt = Object.hasOwn(packet, 'preparedAt') ? utc(packet.preparedAt, 'preparedAt') : null;
  // Explicit null is not an omitted field: reject ambiguous evidence claims.\n  if (Object.hasOwn(packet, 'deliveryEvidenceRef') && packet.deliveryEvidenceRef === null) throw new TypeError('Invalid null delivery evidence reference');\n  if (Object.hasOwn(packet, 'deliveredAt') && packet.deliveredAt === null) throw new TypeError('Invalid null delivery timestamp');\n  if (packet.deliveryEvidenceRef != null && (typeof packet.deliveryEvidenceRef !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(packet.deliveryEvidenceRef) || identifiers.includes(packet.deliveryEvidenceRef))) throw new TypeError('Invalid or reused delivery evidence reference');
  if (packet.deliveredAt != null) utc(packet.deliveredAt, 'deliveredAt');
  // Evaluate chronology for every supplied delivery timestamp, even when its
  // supporting reference is absent; partial claims must not mask contradictions.
  const deliveredAt = packet.deliveredAt;
  // An impossible preparation time takes precedence over relative delivery order;
  // otherwise a future preparation can be misreported as early delivery.
  if (preparedAt && preparedAt > evaluatedAt) return Object.freeze({status:'incomplete',reason:'preparation_after_evaluation'});
  if (deliveredAt != null && deliveredAt > evaluatedAt) return Object.freeze({status:'incomplete',reason:'delivery_after_evaluation'});
  if (deliveredAt != null && preparedAt && deliveredAt < preparedAt) return Object.freeze({status:'incomplete',reason:'delivery_before_preparation'});
  if (packet.deliveryEvidenceRef == null && deliveredAt == null) return Object.freeze({status:'incomplete',reason:'delivery_evidence_missing'});
  if (packet.deliveryEvidenceRef == null || deliveredAt == null) return Object.freeze({status:'incomplete',reason:'partial_delivery_evidence'});
  return Object.freeze({status:'evidence_ready_for_review',reason:'unverified_delivery_claim'});
}
