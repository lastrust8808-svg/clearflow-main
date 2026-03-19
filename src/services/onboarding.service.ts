export type OnboardingPath =
  | 'trust_estate'
  | 'business_entity'
  | 'tax_exempt'
  | 'private_membership'
  | 'personal'
  | 'other_custom';

export type MembershipIntakeDraft = {
  selectedPath: OnboardingPath;
  legalName: string;
  displayName: string;
  ein: string;
  representativeName: string;
  representativeEmail: string;
  representativePhone: string;
  representativeRole: string;
  stateOfFormation: string;
  country: string;
  authorizedRepresentative: boolean;
  googleIdentityMatch: boolean;
  trustType: string;
  exemptClassification: string;
  acceptsDonations: boolean;
  acceptsAssignedAssets: boolean;
  notes: string;
};

export type SavedDraftResponse = {
  success: boolean;
  draft: {
    id: string;
    status: string;
  };
};

export type FullDraftResponse = {
  success: boolean;
  draft: {
    id: string;
    selectedPath: OnboardingPath;
    legalName: string;
    displayName: string;
    ein: string;
    representativeName: string;
    representativeEmail: string;
    representativePhone: string;
    representativeRole: string;
    stateOfFormation: string;
    country: string;
    notes: string;
    status: string;
    files: Array<{
      id: string;
      originalFilename: string;
      mimeType: string;
      storagePath: string;
      documentType?: string;
      processingStatus: string;
      uploadedAt: string;
    }>;
  };
};

const API_BASE = 'http://localhost:4000/api/onboarding';

export const saveOnboardingDraft = async (
  draft: MembershipIntakeDraft,
  draftId?: string | null
): Promise<SavedDraftResponse> => {
  const response = await fetch(`${API_BASE}/drafts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      draftId: draftId || undefined,
      selectedPath: draft.selectedPath,
      legalName: draft.legalName,
      displayName: draft.displayName,
      ein: draft.ein,
      representativeName: draft.representativeName,
      representativeEmail: draft.representativeEmail,
      representativePhone: draft.representativePhone,
      representativeRole: draft.representativeRole,
      stateOfFormation: draft.stateOfFormation,
      country: draft.country,
      notes: draft.notes,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to save onboarding draft.');
  }

  return response.json();
};

export const uploadOnboardingFile = async (
  draftId: string,
  file: File,
  documentType?: string
) => {
  const formData = new FormData();
  formData.append('file', file);
  if (documentType) {
    formData.append('documentType', documentType);
  }

  const response = await fetch(`${API_BASE}/drafts/${draftId}/files`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload onboarding file.');
  }

  return response.json();
};

export const submitOnboardingDraft = async (draftId: string) => {
  const response = await fetch(`${API_BASE}/drafts/${draftId}/submit`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to submit onboarding draft.');
  }

  return response.json();
};

export const getOnboardingDraft = async (draftId: string): Promise<FullDraftResponse> => {
  const response = await fetch(`${API_BASE}/drafts/${draftId}`);

  if (!response.ok) {
    throw new Error('Failed to load onboarding draft.');
  }

  return response.json();
};
