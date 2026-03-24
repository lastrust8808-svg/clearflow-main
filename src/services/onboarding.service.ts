import { getApiBaseUrl } from './runtimeConfig.service';

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

function getOnboardingApiBase() {
  return `${getApiBaseUrl()}/api/onboarding`;
}

function buildLocalDraftResponse(draftId?: string | null, status = 'local_draft'): SavedDraftResponse {
  return {
    success: true,
    draft: {
      id: draftId || `local-${crypto.randomUUID()}`,
      status,
    },
  };
}

export const saveOnboardingDraft = async (
  draft: MembershipIntakeDraft,
  draftId?: string | null
): Promise<SavedDraftResponse> => {
  try {
    const response = await fetch(`${getOnboardingApiBase()}/drafts`, {
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

    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    console.warn('Falling back to local onboarding draft storage.', error);
  }

  return buildLocalDraftResponse(draftId);
};

export const uploadOnboardingFile = async (
  draftId: string,
  file: File,
  documentType?: string
) => {
  if (draftId.startsWith('local-')) {
    return {
      success: true,
      file: {
        id: `local-file-${crypto.randomUUID()}`,
        originalFilename: file.name,
        documentType,
        processingStatus: 'stored_locally',
      },
    };
  }

  const formData = new FormData();
  formData.append('file', file);
  if (documentType) {
    formData.append('documentType', documentType);
  }

  try {
    const response = await fetch(`${getOnboardingApiBase()}/drafts/${draftId}/files`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    console.warn('Unable to upload onboarding file to backend. Keeping local reference only.', error);
  }

  return {
    success: true,
    file: {
      id: `local-file-${crypto.randomUUID()}`,
      originalFilename: file.name,
      documentType,
      processingStatus: 'stored_locally',
    },
  };
};

export const submitOnboardingDraft = async (draftId: string) => {
  if (draftId.startsWith('local-')) {
    return buildLocalDraftResponse(draftId, 'submitted_locally');
  }

  try {
    const response = await fetch(`${getOnboardingApiBase()}/drafts/${draftId}/submit`, {
      method: 'POST',
    });

    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    console.warn('Unable to submit onboarding draft to backend. Completing locally.', error);
  }

  return buildLocalDraftResponse(draftId, 'submitted_locally');
};

export const getOnboardingDraft = async (draftId: string): Promise<FullDraftResponse> => {
  const response = await fetch(`${getOnboardingApiBase()}/drafts/${draftId}`);

  if (!response.ok) {
    throw new Error('Failed to load onboarding draft.');
  }

  return response.json();
};
