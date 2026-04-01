export interface VendorContractExtractionResult {
  summary: string;
  organizationClass?:
    | 'general'
    | 'large_bank'
    | 'large_corporation'
    | 'utility'
    | 'government'
    | 'servicer';
  remittanceApplicationRule?: string;
  returnInstrumentRule?: string;
  billingErrorProcess?: string;
  disputeResolutionPath?:
    | 'none'
    | 'notice_and_cure'
    | 'notice_mediation_arbitration'
    | 'notice_arbitration'
    | 'court_litigation';
  arbitrationForum?: 'aaa' | 'jams' | 'private_forum' | 'court_only' | 'unspecified';
  mediationStepPresent?: boolean;
  cureOfferRequired?: boolean;
  disputeNoticeDays?: number;
  disputeVenue?: string;
  arbitrationProcedureNotes?: string;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractSentence(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[0] ? normalizeWhitespace(match[0]) : undefined;
}

function extractNoticeDays(text: string) {
  const patterns = [
    /(\d{1,3})\s+days?\s+(?:prior\s+)?written\s+notice/i,
    /(\d{1,3})\s+days?\s+to\s+cure/i,
    /(\d{1,3})\s+days?\s+cure\s+period/i,
    /notice\s+within\s+(\d{1,3})\s+days?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return undefined;
}

function extractVenue(text: string) {
  const patterns = [
    /venue\s+shall\s+be\s+in\s+([^.;\n]+)/i,
    /exclusive\s+venue\s+in\s+([^.;\n]+)/i,
    /seat\s+of\s+arbitration\s+shall\s+be\s+([^.;\n]+)/i,
    /arbitration\s+in\s+([^.;\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  return undefined;
}

function inferOrganizationClass(text: string) {
  const lower = text.toLowerCase();
  if (
    lower.includes('utility') ||
    lower.includes('telecom') ||
    lower.includes('wireless') ||
    lower.includes('electric service') ||
    lower.includes('water service')
  ) {
    return 'utility' as const;
  }
  if (
    lower.includes('lockbox') ||
    lower.includes('bank remittance') ||
    lower.includes('financial institution')
  ) {
    return 'large_bank' as const;
  }
  if (lower.includes('servicer') || lower.includes('loan servicing') || lower.includes('processor')) {
    return 'servicer' as const;
  }
  if (lower.includes('agency') || lower.includes('department') || lower.includes('government')) {
    return 'government' as const;
  }
  if (lower.includes('accounts payable') || lower.includes('corporation')) {
    return 'large_corporation' as const;
  }
  return 'general' as const;
}

export async function extractVendorContractClauses(
  file: File | null | undefined,
): Promise<VendorContractExtractionResult> {
  if (!file) {
    return {
      summary: 'No contract file was provided for clause extraction.',
    };
  }

  let text = '';
  try {
    text = await file.text();
  } catch (error) {
    console.warn('Unable to read uploaded vendor contract for clause extraction.', error);
  }

  const normalizedText = normalizeWhitespace(text);
  const lower = normalizedText.toLowerCase();
  const organizationClass = inferOrganizationClass(lower);
  const mediationStepPresent =
    lower.includes('mediate') || lower.includes('mediation') || lower.includes('good faith negotiation');
  const cureOfferRequired =
    lower.includes('opportunity to cure') ||
    lower.includes('right to cure') ||
    lower.includes('cure period') ||
    lower.includes('days to cure');
  const hasArbitration = lower.includes('arbitration') || lower.includes('arbitrate');
  const disputeResolutionPath = hasArbitration
    ? mediationStepPresent
      ? 'notice_mediation_arbitration'
      : 'notice_arbitration'
    : cureOfferRequired || lower.includes('notice of dispute')
      ? 'notice_and_cure'
      : lower.includes('litigation') || lower.includes('court of competent jurisdiction')
        ? 'court_litigation'
        : 'none';
  const arbitrationForum = lower.includes('american arbitration association') || /\baaa\b/i.test(lower)
    ? 'aaa'
    : lower.includes('jams')
      ? 'jams'
      : hasArbitration
        ? 'private_forum'
        : lower.includes('court')
          ? 'court_only'
          : 'unspecified';

  const remittanceApplicationRule =
    extractSentence(
      normalizedText,
      /(?:payments?|remittances?|application of payments?|lockbox instructions?)[^.]{0,220}\./i,
    ) ||
    extractSentence(normalizedText, /apply[^.]{0,180}payments?[^.]{0,180}\./i);
  const returnInstrumentRule =
    extractSentence(
      normalizedText,
      /(?:returned item|returned payment|dishonor|rejected payment|unsupported tender|exception item)[^.]{0,220}\./i,
    ) || extractSentence(normalizedText, /return[^.]{0,180}(?:payment|item|instrument)[^.]{0,180}\./i);
  const billingErrorProcess =
    extractSentence(
      normalizedText,
      /(?:billing error|dispute notice|written notice|customer service|administrative review)[^.]{0,220}\./i,
    ) || extractSentence(normalizedText, /dispute[^.]{0,200}notice[^.]{0,200}\./i);
  const disputeVenue = extractVenue(normalizedText);
  const disputeNoticeDays = extractNoticeDays(normalizedText);
  const arbitrationProcedureNotes = [
    extractSentence(
      normalizedText,
      /(?:arbitration|arbitrate|mediation|mediate|notice of dispute|written notice|opportunity to cure)[^.]{0,240}\./i,
    ),
    extractSentence(
      normalizedText,
      /(?:american arbitration association|jams|forum rules|seat of arbitration|venue)[^.]{0,240}\./i,
    ),
  ]
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
    .join(' ');

  return {
    summary: normalizedText
      ? 'Best-effort clause extraction completed from the uploaded counterparty terms.'
      : 'Uploaded contract could not be parsed as readable text, so clause extraction stayed in manual-review mode.',
    organizationClass,
    remittanceApplicationRule,
    returnInstrumentRule,
    billingErrorProcess,
    disputeResolutionPath,
    arbitrationForum,
    mediationStepPresent,
    cureOfferRequired,
    disputeNoticeDays,
    disputeVenue,
    arbitrationProcedureNotes: arbitrationProcedureNotes || undefined,
  };
}
