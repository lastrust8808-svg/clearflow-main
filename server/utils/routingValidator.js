const SUPPORTED_RAILS_BY_ROUTING = {
  '021000021': ['Fedwire', 'FedACH', 'FedNow'],
  '026009593': ['Fedwire', 'FedACH', 'RTP'],
  '031000503': ['Fedwire', 'FedACH'],
};

export function isValidRoutingNumber(routingNumber) {
  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }

  const digits = routingNumber.split('').map(Number);
  const checksum =
    3 * (digits[0] + digits[3] + digits[6]) +
    7 * (digits[1] + digits[4] + digits[7]) +
    (digits[2] + digits[5] + digits[8]);

  return checksum % 10 === 0;
}

export function isRoutingNumberEligible(routingNumber, rail) {
  if (!isValidRoutingNumber(routingNumber)) {
    return false;
  }

  const rails = SUPPORTED_RAILS_BY_ROUTING[routingNumber] || ['Fedwire', 'FedACH'];
  return rails.includes(rail);
}
