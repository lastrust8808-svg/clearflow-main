export interface EcfrApiEndpointDefinition {
  key: string;
  label: string;
  endpoint: string;
  bestUse: string;
  workflowUse: string;
}

const ecfrApiCatalog: EcfrApiEndpointDefinition[] = [
  {
    key: 'titles',
    label: 'eCFR Titles',
    endpoint: 'https://www.ecfr.gov/api/versioner/v1/titles',
    bestUse: 'Find available CFR titles and latest amendment dates.',
    workflowUse:
      'Use before routing regulatory research so the app knows which title governs banking, securities, postal, tax, treasury, or entity administration work.',
  },
  {
    key: 'title-structure',
    label: 'Title Structure',
    endpoint: 'https://www.ecfr.gov/api/versioner/v1/structure/{date}/title-{title}.json',
    bestUse: 'Read chapter/part/section structure for a title on a specific date.',
    workflowUse:
      'Use to build targeted CFR navigation for user tasks instead of sending users into broad legal search.',
  },
  {
    key: 'full-title-xml',
    label: 'Full Title XML',
    endpoint: 'https://www.ecfr.gov/api/versioner/v1/full/{date}/title-{title}.xml',
    bestUse: 'Retrieve the full XML for a CFR title on a specific date.',
    workflowUse:
      'Use for retained authority packets, version-specific research, and evidence snapshots when a workflow depends on current or historical federal regulation text.',
  },
  {
    key: 'ancestry',
    label: 'Section Ancestry',
    endpoint: 'https://www.ecfr.gov/api/versioner/v1/ancestry/{date}/title-{title}.json',
    bestUse: 'Resolve where a section lives inside the CFR hierarchy.',
    workflowUse:
      'Use when linking a rule citation back to the correct title/chapter/part/subpart path inside ClearFlow research packets.',
  },
  {
    key: 'search',
    label: 'eCFR Search',
    endpoint: 'https://www.ecfr.gov/api/search/v1/results',
    bestUse: 'Search eCFR text for terms across titles and agencies.',
    workflowUse:
      'Use to find rules for ACH, Fedwire, securities, Treasury checks, postal evidence, privacy, KYC, taxes, and record-retention topics.',
  },
  {
    key: 'changes',
    label: 'Recent Changes',
    endpoint: 'https://www.ecfr.gov/api/versioner/v1/versions/title-{title}.json',
    bestUse: 'Track historical versions and amendment dates for a CFR title.',
    workflowUse:
      'Use to warn users when a compliance workflow may need refreshed legal review because governing text changed.',
  },
  {
    key: 'corrections',
    label: 'Corrections',
    endpoint: 'https://www.ecfr.gov/api/admin/v1/corrections/title/{title}.json',
    bestUse: 'Review official eCFR editorial corrections.',
    workflowUse:
      'Use when producing legal/regulatory reference packets where corrected text or editorial notes matter.',
  },
];

export function getEcfrApiCatalog() {
  return ecfrApiCatalog;
}
