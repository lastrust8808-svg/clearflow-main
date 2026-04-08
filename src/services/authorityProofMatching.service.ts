const NICKNAME_EQUIVALENTS: Record<string, string> = {
  mike: 'michael',
  mikey: 'michael',
  michael: 'michael',
  matt: 'matthew',
  matthew: 'matthew',
  dave: 'david',
  david: 'david',
  steve: 'steven',
  steven: 'steven',
  stephen: 'steven',
  chris: 'christopher',
  christopher: 'christopher',
  nick: 'nicholas',
  nicholas: 'nicholas',
  joe: 'joseph',
  joseph: 'joseph',
  jim: 'james',
  james: 'james',
  jimmy: 'james',
  bob: 'robert',
  bobby: 'robert',
  robert: 'robert',
  rob: 'robert',
  bill: 'william',
  billy: 'william',
  will: 'william',
  william: 'william',
  liz: 'elizabeth',
  beth: 'elizabeth',
  elizabeth: 'elizabeth',
  kathy: 'katherine',
  katie: 'katherine',
  kate: 'katherine',
  katherine: 'katherine',
  tom: 'thomas',
  thomas: 'thomas',
  heather: 'heather',
};

const COMMON_NAME_STOPWORDS = new Set([
  'certificate',
  'trust',
  'existence',
  'formation',
  'state',
  'secretary',
  'company',
  'limited',
  'liability',
  'member',
  'manager',
  'trustee',
  'authorized',
  'representative',
  'operator',
  'clearflow',
  'entity',
  'business',
  'county',
  'department',
  'organization',
  'articles',
  'incorporation',
]);

export interface AuthorityProofAnalysisResult {
  status: 'missing' | 'review' | 'matched' | 'similar_match' | 'mismatch';
  summary: string;
  uploadedFileName?: string;
  extractedNames: string[];
  requiredAdditionalNames: string[];
  matchedName?: string;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeNameToken(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z]/g, '');
  return NICKNAME_EQUIVALENTS[cleaned] || cleaned;
}

function normalizeFullName(value: string) {
  return normalizeWhitespace(value.replace(/[^A-Za-z\s'-]/g, ' '));
}

function toNameParts(value: string) {
  const parts = normalizeFullName(value)
    .split(' ')
    .map((part) => normalizeNameToken(part))
    .filter(Boolean);
  return {
    parts,
    first: parts[0] || '',
    last: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

function isNameLike(value: string) {
  const parts = normalizeFullName(value).split(' ').filter(Boolean);
  if (parts.length < 2 || parts.length > 4) {
    return false;
  }
  return !parts.some((part) => COMMON_NAME_STOPWORDS.has(part.toLowerCase()));
}

function areNamesSimilar(left: string, right: string) {
  const leftName = toNameParts(left);
  const rightName = toNameParts(right);
  if (!leftName.first || !rightName.first) {
    return false;
  }
  if (leftName.last && rightName.last) {
    return leftName.first === rightName.first && leftName.last === rightName.last;
  }
  return leftName.first === rightName.first;
}

function extractCandidateNames(text: string) {
  const matches = new Set<string>();
  const patterns = [
    /\b(?:trustee|member|manager|organizer|incorporator|president|secretary|officer|beneficiary|grantor|settlor|authorized signatory|authorized representative)\b[:\s-]+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})/g,
    /\b([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = normalizeWhitespace(match[1] || match[0] || '');
      if (candidate && isNameLike(candidate)) {
        matches.add(candidate);
      }
    }
  }

  return Array.from(matches);
}

export async function analyzeAuthorityProofFile(options: {
  file: File | null | undefined;
  operatorName?: string | null;
  representativeName?: string | null;
  entityName?: string | null;
}): Promise<AuthorityProofAnalysisResult> {
  const { file, operatorName, representativeName, entityName } = options;

  if (!file) {
    return {
      status: 'missing',
      summary:
        'No certificate of trust, existence, or similar authority proof was uploaded. Keep outside transactions staged until proof is added and reviewed.',
      extractedNames: [],
      requiredAdditionalNames: [],
    };
  }

  let text = '';
  try {
    text = await file.text();
  } catch (error) {
    console.warn('Unable to read uploaded authority proof for text matching.', error);
  }

  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) {
    return {
      status: 'review',
      summary:
        'Authority proof was uploaded, but the file could not be read as plain text for automatic name matching. Keep transaction release paused until the proof is rechecked.',
      uploadedFileName: file.name,
      extractedNames: [],
      requiredAdditionalNames: [],
    };
  }

  const extractedNames = extractCandidateNames(normalizedText);
  const operatorCandidates = [operatorName, representativeName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => normalizeWhitespace(value));
  const entityTokens = normalizeFullName(entityName || '')
    .split(' ')
    .map((token) => token.toLowerCase())
    .filter(Boolean);

  const matchedName = extractedNames.find((candidate) =>
    operatorCandidates.some((operatorCandidate) => areNamesSimilar(candidate, operatorCandidate)),
  );
  const additionalNamedParties = extractedNames.filter((candidate) => {
    if (matchedName && areNamesSimilar(candidate, matchedName)) {
      return false;
    }
    return !entityTokens.some((token) => candidate.toLowerCase().includes(token));
  });

  if (matchedName && additionalNamedParties.length === 0) {
    const exactMatch = operatorCandidates.some(
      (operatorCandidate) => normalizeFullName(operatorCandidate) === normalizeFullName(matchedName),
    );
    return {
      status: exactMatch ? 'matched' : 'similar_match',
      summary: exactMatch
        ? `Uploaded authority proof names ${matchedName}, which matches the signed-in operator or stated representative.`
        : `Uploaded authority proof names ${matchedName}, which is similar enough to the signed-in operator or stated representative to pass the onboarding match check.`,
      uploadedFileName: file.name,
      extractedNames,
      requiredAdditionalNames: [],
      matchedName,
    };
  }

  if (!matchedName && extractedNames.length) {
    return {
      status: 'mismatch',
      summary: `Uploaded authority proof names ${extractedNames.join(', ')}, but none matched the signed-in operator or the stated representative. Add the named signer or member to the account and recheck before transacting.`,
      uploadedFileName: file.name,
      extractedNames,
      requiredAdditionalNames: extractedNames,
    };
  }

  if (matchedName && additionalNamedParties.length) {
    return {
      status: 'review',
      summary: `Uploaded authority proof matches ${matchedName}, but also names ${additionalNamedParties.join(', ')}. Add the additional signer or member to the account and recheck before external transactions.`,
      uploadedFileName: file.name,
      extractedNames,
      requiredAdditionalNames: additionalNamedParties,
      matchedName,
    };
  }

  return {
    status: 'review',
    summary:
      'Authority proof was uploaded, but ClearFlow could not confidently identify the signer or member names from the file. Keep transaction release paused until the proof is rechecked.',
    uploadedFileName: file.name,
    extractedNames,
    requiredAdditionalNames: [],
  };
}
