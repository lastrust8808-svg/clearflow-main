export const invoicePresetOptions = [
  { value: 'general', label: 'General Invoice' },
  { value: 'service', label: 'Service Invoice' },
  { value: 'materials', label: 'Materials Invoice' },
  { value: 'progress', label: 'Progress Billing' },
  { value: 'retainer', label: 'Retainer Invoice' },
];

export const quotePresetOptions = [
  { value: 'general', label: 'General Quote' },
  { value: 'service', label: 'Service Estimate' },
  { value: 'trade', label: 'Trade / Contractor Quote' },
  { value: 'materials', label: 'Materials Quote' },
];

export const paymentTermsOptions = [
  { value: 'due_on_receipt', label: 'Due on Receipt' },
  { value: 'net_7', label: 'Net 7' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_45', label: 'Net 45' },
];

export const numberingModeOptions = [
  { value: 'auto', label: 'Auto Number' },
  { value: 'manual', label: 'Manual Number' },
];

export const invoiceDeliveryOptions = [
  { value: 'email', label: 'Send by Email' },
  { value: 'internal_user', label: 'Send to ClearFlow User' },
  { value: 'export', label: 'Export / Download' },
  { value: 'manual', label: 'Manual Delivery' },
];

export const paymentRailOptions = [
  { value: 'ach', label: 'ACH / Bank Transfer' },
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'digital_asset', label: 'Digital Asset' },
  { value: 'manual', label: 'Manual / Offline' },
];

export const taxModeOptions = [
  { value: 'none', label: 'No Tax' },
  { value: 'state', label: 'Use State Sales Tax' },
];

export const jurisdictionTaxRates: Record<string, number> = {
  MI: 0.06,
  TN: 0.07,
  OH: 0.0575,
  IN: 0.07,
  FL: 0.06,
  TX: 0.0625,
  CA: 0.0725,
  NY: 0.04,
};

export const jurisdictionOptions = Object.keys(jurisdictionTaxRates).map((code) => ({
  value: code,
  label: code,
}));

export const entityBrandProfileOptions = [
  { value: 'primary', label: 'Primary Entity Profile' },
  { value: 'operations', label: 'Operations Profile' },
  { value: 'trust', label: 'Trust Profile' },
];
