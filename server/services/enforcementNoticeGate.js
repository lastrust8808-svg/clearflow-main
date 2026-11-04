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
  const preparedAt = packet.preparedAt == null ? null : utc(packet.preparedAt, 'preparedAt');
  if (preparedAt && preparedAt > evaluatedAt) return Object.freeze({status:'incomplete',reason:'preparation_after_evaluation'});
  if (packet.deliveryEvidenceRef != null && (typeof packet.deliveryEvidenceRef !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(packet.deliveryEvidenceRef) || identifiers.includes(packet.deliveryEvidenceRef))) throw new TypeError('Invalid or reused delivery evidence reference');
  if (packet.deliveredAt != null) utc(packet.deliveredAt, 'deliveredAt');
  if (packet.deliveryEvidenceRef == null && packet.deliveredAt == null) return Object.freeze({status:'incomplete',reason:'delivery_evidence_missing'});
  if (packet.deliveryEvidenceRef == null || packet.deliveredAt == null) return Object.freeze({status:'incomplete',reason:'partial_delivery_evidence'});
  const deliveredAt = packet.deliveredAt;
  if (preparedAt && deliveredAt < preparedAt) return Object.freeze({status:'incomplete',reason:'delivery_before_preparation'});
  if (deliveredAt > evaluatedAt) return Object.freeze({status:'incomplete',reason:'delivery_after_evaluation'});
  return Object.freeze({status:'evidence_ready_for_review',reason:'unverified_delivery_claim'});
}
