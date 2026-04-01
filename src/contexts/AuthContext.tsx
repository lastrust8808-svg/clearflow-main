import React, { createContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { AppData, Entity, User } from '../types/app.models';
import type { CoreDataBundle } from '../types/core';
import { userDataService } from '../services/user-data.service';
import { getDocumentFile } from '../services/documentVault.service';
import { googleDriveService } from '../services/google-drive.service';
import type {
  LocalAuthChallenge,
  LocalAuthContactType,
} from '../services/localAuth.service';
import {
  authenticateLocalPassword,
  findLocalAccountByGoogleEmail,
  saveLocalAuthAppData,
  startLocalAuthChallenge,
  upsertLocalBackupAccount,
  updateLocalAccountCredentials,
  verifyLocalAuthChallenge,
} from '../services/localAuth.service';
import {
  loadAccountAppData,
  saveAccountAppData,
} from '../services/accountPersistence.service';
import { deliverVerificationCode } from '../services/authVerification.service';
import { recordClearFlowAgreementDeposit } from '../services/clearflowInternalLedger.service';
import { getApiBaseUrl, getGoogleClientId } from '../services/runtimeConfig.service';
import {
  applyClearFlowRetentionRecords,
  CLEARFLOW_TERMS_VERSION,
  clearStoredMembershipDraft,
  enrichAppDataFromMembershipDraft,
  hasClearFlowRetentionPackage,
} from '../services/membershipDraft.service';

declare const google: any;

const debounce = (func: (...args: any[]) => void, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

export type AuthStatus = 'unauthenticated' | 'pending-gsi' | 'pending-drive-check' | 'pending-profile-setup' | 'pending-verification' | 'authenticated';
export type SavingStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AuthState {
  appData: AppData | null;
  token: string | null;
  apiAccessToken: string | null;
  localAccountId: string | null;
  status: AuthStatus;
  gsiUser: { name: string, email: string } | null;
  pendingCredentialAuth: LocalAuthChallenge | null;
}

interface AuthContextType {
  isInitialized: boolean;
  isConfigured: boolean;
  hasDriveAccess: boolean;
  currentUser: User | null;
  lastKnownGoogleUser: { name: string; email: string } | null;
  authStatus: AuthStatus;
  savingStatus: SavingStatus;
  appData: AppData | null;
  pendingCredentialAuth: LocalAuthChallenge | null;
  startGoogleSignIn: (mode?: 'new' | 'existing' | 'returning') => Promise<{ success: boolean; error?: string }>;
  renderGoogleButton: (elementId: string) => void;
  mockLogin: (name: string, email: string) => void;
  startCredentialAuth: (input: {
    contactType: LocalAuthContactType;
    contactValue: string;
    name?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  verifyCredentialAuth: (input: {
    code: string;
    userHandle?: string;
    password?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  signInWithPassword: (input: {
    identifier: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string }>;
  cancelCredentialAuth: () => void;
  isLocalCredentialFlow: boolean;
  updateUser: (user: User) => void;
  updateEntities: (entities: Entity[]) => void;
  updateCoreDataSnapshot: (snapshot: CoreDataBundle) => void;
  routeDocumentToDrive: (input: {
    sourceFileId: string;
    fileName: string;
    entityId?: string;
    targetGoogleEmail?: string;
  }) => Promise<{ success: boolean; fileId?: string; error?: string }>;
  updateBackupAccess: (input: {
    userHandle?: string;
    password?: string;
    preferredContactType?: 'email' | 'phone';
  }) => Promise<{ success: boolean; error?: string }>;
  completeProfileSetup: (
    name: string,
    email?: string,
    phone?: string,
    userHandle?: string,
    password?: string,
    acceptedTerms?: boolean,
    signerName?: string
  ) => void;
  completeVerification: () => void;
  logout: () => void;
  requestDriveAccess: () => void;
  continueGoogleOnboardingFallback: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LAST_GOOGLE_USER_STORAGE_KEY = 'clearflow-last-google-user-v1';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    status: 'unauthenticated',
    appData: null,
    token: null,
    apiAccessToken: null,
    localAccountId: null,
    gsiUser: null,
    pendingCredentialAuth: null,
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConfigured] = useState(() => {
    return Boolean(getGoogleClientId());
  });
  const [tokenClient, setTokenClient] = useState<any>(null);
  const tokenClientRef = useRef<any>(null);
  const [savingStatus, setSavingStatus] = useState<SavingStatus>('idle');
  const [lastKnownGoogleUser, setLastKnownGoogleUser] = useState<{
    name: string;
    email: string;
  } | null>(() => {
    try {
      const raw = window.localStorage.getItem(LAST_GOOGLE_USER_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { name: string; email: string }) : null;
    } catch {
      return null;
    }
  });
  const initialDataLoaded = useRef(false);
  const googleScriptPromiseRef = useRef<Promise<void> | null>(null);
  const googleClientsInitializedRef = useRef(false);
  const needsDriveCatchUpRef = useRef(false);
  const clearflowLedgerDepositSyncRef = useRef(false);
  const GOOGLE_DRIVE_SCOPE =
    'openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
  
  const hydrateGoogleAccessSession = useCallback(async (
    accessToken: string,
    providedProfile?: { name?: string; email?: string | null }
  ) => {
    const profile =
      providedProfile?.email
        ? providedProfile
        : await (async () => {
            const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (!profileResponse.ok) {
              throw new Error('Google profile lookup failed after authorization.');
            }

            return profileResponse.json();
          })();

    userDataService.setActiveUserEmail(profile.email);
    const provisionalUser: User = {
      id: crypto.randomUUID(),
      name: profile.name || profile.email,
      email: profile.email,
      isVerified: false,
      primaryContactType: 'google',
    };

    setState((current) => ({
      ...current,
      token: current.token || 'google-oauth-token',
      apiAccessToken: accessToken,
      status: 'pending-drive-check',
      gsiUser: { name: provisionalUser.name, email: provisionalUser.email || '' },
      appData: current.appData || { user: provisionalUser, entities: [] },
    }));
  }, []);

  const exchangeGoogleAuthorizationCode = useCallback(async (code: string) => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/google/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        code,
        redirectUri: window.location.origin,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      throw new Error(
        payload?.error || 'Google authorization exchange failed.'
      );
    }

    return payload as {
      success: true;
      auth: {
        accessToken: string;
        expiresIn?: number | null;
        scope?: string | null;
        tokenType?: string | null;
      };
      profile?: {
        email?: string;
        name?: string;
      };
    };
  }, []);

  const handleAuthorizationCodeResponse = useCallback((response: any) => {
    if (response.error || !response.code) {
        console.error('OAuth Error:', response.error || 'Missing authorization code.');
        setState((current) => {
          if (
            (current.status === 'pending-gsi' || current.status === 'pending-drive-check') &&
            current.appData?.user
          ) {
            return {
              ...current,
              status: 'pending-profile-setup',
              gsiUser: null,
            };
          }

          return {
            ...current,
            status: 'unauthenticated',
            gsiUser: null,
            token: null,
            apiAccessToken: null,
            appData: null,
          };
        });
        return;
    }

    needsDriveCatchUpRef.current = true;
    void exchangeGoogleAuthorizationCode(response.code)
      .then((payload) =>
        hydrateGoogleAccessSession(payload.auth.accessToken, payload.profile)
      )
      .catch((error) => {
        console.error('OAuth profile hydration failed:', error);
        setState((current) => {
          if (current.appData?.user) {
            return {
              ...current,
              status: 'pending-profile-setup',
              gsiUser: null,
            };
          }

          return {
            ...current,
            status: 'unauthenticated',
            gsiUser: null,
            token: null,
            apiAccessToken: null,
            appData: null,
          };
        });
      });
  }, [exchangeGoogleAuthorizationCode, hydrateGoogleAccessSession]);

  const debouncedSave = useCallback(debounce(async (token: string, data: AppData) => {
    if (!token || !data) return;
    try {
      await userDataService.saveUserData(token, data);
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus('idle'), 2500); // Show 'saved' for 2.5s
    } catch (err) {
      console.error("Failed to save data to Google Drive:", err);
      setSavingStatus('error');
    }
  }, 1500), []);

  useEffect(() => {
    // This effect is the central auto-save trigger.
    // It runs ONLY when appData changes.
    
    // Condition 1: Don't save if not in a valid, authenticated state.
    if (state.status !== 'authenticated' || !state.appData) {
      return;
    }
    
    // Condition 2: Don't save the very first time data is loaded from Drive.
    if (!initialDataLoaded.current) {
      initialDataLoaded.current = true;
      return;
    }

    // If conditions pass, it means a user has made a change.
    setSavingStatus('saving');
    if (state.apiAccessToken) {
      debouncedSave(state.apiAccessToken, state.appData);
    }

    if (state.localAccountId) {
      try {
        saveLocalAuthAppData(state.localAccountId, state.appData);
        void saveAccountAppData(state.localAccountId, state.appData).catch((error) => {
          console.warn('Failed to mirror local account data to durable storage.', error);
        });
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2500);
      } catch (err) {
        console.error('Failed to save local user data:', err);
        setSavingStatus('error');
      }
    }

  }, [state.appData, state.apiAccessToken, state.localAccountId, state.status, debouncedSave]);

  useEffect(() => {
    if (
      !state.apiAccessToken ||
      !state.appData ||
      !needsDriveCatchUpRef.current ||
      state.status === 'pending-gsi' ||
      state.status === 'pending-drive-check'
    ) {
      return;
    }

    needsDriveCatchUpRef.current = false;
    setSavingStatus('saving');

    void userDataService
      .saveUserData(state.apiAccessToken, state.appData)
      .then(() => {
        initialDataLoaded.current = true;
        setSavingStatus('saved');
        window.setTimeout(() => setSavingStatus('idle'), 2500);
      })
      .catch((error) => {
        console.warn('Failed to catch up Google Drive workspace sync.', error);
        needsDriveCatchUpRef.current = true;
        setSavingStatus('error');
      });
  }, [state.apiAccessToken, state.appData, state.status]);

  useEffect(() => {
    if (
      !state.appData?.user.clearflowTermsAcceptedAt ||
      !state.appData.coreDataSnapshot
    ) {
      return;
    }

    if (hasClearFlowRetentionPackage(state.appData)) {
      return;
    }

    setState((current) => {
      if (
        !current.appData?.user.clearflowTermsAcceptedAt ||
        !current.appData.coreDataSnapshot
      ) {
        return current;
      }

        return {
          ...current,
          appData: applyClearFlowRetentionRecords(current.appData, {
            acceptedAt: current.appData.user.clearflowTermsAcceptedAt,
            termsVersion:
              current.appData.user.clearflowTermsVersion || CLEARFLOW_TERMS_VERSION,
            signerName:
              current.appData.user.clearflowTermsSignerName ||
              current.appData.user.name,
          }),
        };
      });
  }, [
    state.appData?.coreDataSnapshot,
    state.appData?.user.clearflowRetainedRecordDocumentId,
    state.appData?.user.clearflowTermsAcceptedAt,
    state.appData?.user.clearflowTermsDocumentId,
    state.appData?.user.clearflowTermsVersion,
  ]);

  useEffect(() => {
    if (
      !state.appData?.user.clearflowTermsAcceptedAt ||
      !state.appData.user.clearflowTermsDocumentId ||
      !state.appData.user.clearflowRetainedRecordDocumentId ||
      state.appData.user.clearflowInternalLedgerStatus === 'recorded' ||
      state.appData.user.clearflowInternalLedgerStatus === 'error' ||
      clearflowLedgerDepositSyncRef.current
    ) {
      return;
    }

    clearflowLedgerDepositSyncRef.current = true;
    const primaryEntityId =
      state.appData.entities[0]?.id ?? state.appData.coreDataSnapshot?.entities[0]?.id;

    void recordClearFlowAgreementDeposit({
      depositId: `dep-clearflow-terms-${state.appData.user.id}`,
      userId: state.appData.user.id,
      userEmail: state.appData.user.email,
      signerName: state.appData.user.clearflowTermsSignerName || state.appData.user.name,
      entityId: primaryEntityId,
      termsDocumentId: state.appData.user.clearflowTermsDocumentId,
      retainedRecordDocumentId: state.appData.user.clearflowRetainedRecordDocumentId,
      termsAcceptedAt: state.appData.user.clearflowTermsAcceptedAt,
    })
      .then((response) => {
        setState((current) => {
          if (!current.appData) {
            return current;
          }

          return {
            ...current,
            appData: {
              ...current.appData,
              user: {
                ...current.appData.user,
                clearflowInternalLedgerDepositId: response.result.depositId,
                clearflowInternalLedgerDepositedAt: response.result.recordedAt,
                clearflowInternalLedgerStatus: response.result.status,
              },
            },
          };
        });
      })
      .catch((error) => {
        console.warn('Failed to record ClearFlow internal ledger deposit.', error);
        setState((current) => {
          if (!current.appData) {
            return current;
          }

          return {
            ...current,
            appData: {
              ...current.appData,
              user: {
                ...current.appData.user,
                clearflowInternalLedgerStatus: 'error',
              },
            },
          };
        });
      })
      .finally(() => {
        clearflowLedgerDepositSyncRef.current = false;
      });
  }, [
    state.appData?.coreDataSnapshot,
    state.appData?.entities,
    state.appData?.user.clearflowInternalLedgerStatus,
    state.appData?.user.clearflowRetainedRecordDocumentId,
    state.appData?.user.clearflowTermsAcceptedAt,
    state.appData?.user.clearflowTermsDocumentId,
    state.appData?.user.clearflowTermsSignerName,
    state.appData?.user.email,
    state.appData?.user.id,
    state.appData?.user.name,
  ]);
  
  useEffect(() => {
    const hasCompletedGoogleWorkspace = (appData: AppData) =>
      Boolean(appData.user.clearflowTermsAcceptedAt) &&
      Boolean(appData.entities.length || appData.coreDataSnapshot?.entities?.length);

    const mergeGoogleIdentity = (appData: AppData, googleIdentity: { name: string; email: string }) => ({
      ...appData,
      user: {
        ...appData.user,
        name: appData.user.name || googleIdentity.name,
        email: googleIdentity.email,
        primaryContactType: 'google' as const,
      },
    });

    const checkDrive = async () => {
      if (state.status === 'pending-drive-check' && state.apiAccessToken && state.gsiUser) {
        try {
          userDataService.setActiveUserEmail(state.gsiUser.email);
          const loadedData = await userDataService.loadUserData(
            state.apiAccessToken,
            state.gsiUser.email
          );
          if (loadedData) { // Existing user
            const mergedAppData = mergeGoogleIdentity(loadedData, state.gsiUser);
            setState(current => ({
              ...current,
              status: hasCompletedGoogleWorkspace(mergedAppData)
                ? 'authenticated'
                : 'pending-profile-setup',
              appData: mergedAppData,
              gsiUser: null,
            }));
          } else { // New user
            const localGoogleMatch = findLocalAccountByGoogleEmail(state.gsiUser.email);
            if (localGoogleMatch) {
              let recoveredAppData = localGoogleMatch.appData;

              try {
                const durableAppData = await loadAccountAppData(localGoogleMatch.userId);
                if (durableAppData) {
                  recoveredAppData = durableAppData;
                  saveLocalAuthAppData(localGoogleMatch.userId, durableAppData);
                }
              } catch (error) {
                console.warn('Unable to load durable Google-linked workspace. Falling back to local recovery.', error);
              }

              const mergedAppData = mergeGoogleIdentity(recoveredAppData, state.gsiUser);
              needsDriveCatchUpRef.current = true;
              setState((current) => ({
                ...current,
                localAccountId: localGoogleMatch.userId,
                status: hasCompletedGoogleWorkspace(mergedAppData)
                  ? 'authenticated'
                  : 'pending-profile-setup',
                appData: mergedAppData,
                gsiUser: null,
              }));
              return;
            }

            const newUser: User = { id: crypto.randomUUID(), ...state.gsiUser, isVerified: false, primaryContactType: 'google' };
            const newAppData: AppData = { user: newUser, entities: [] };
            setState(current => ({ ...current, status: 'pending-profile-setup', appData: newAppData, gsiUser: null }));
          }
        } catch (error) {
          console.error('Unable to load workspace after Google sign-in. Continuing with new-user profile setup.', error);
          const localGoogleMatch = findLocalAccountByGoogleEmail(state.gsiUser.email);
          if (localGoogleMatch) {
            const mergedAppData = {
              ...localGoogleMatch.appData,
              user: {
                ...localGoogleMatch.appData.user,
                name: localGoogleMatch.appData.user.name || state.gsiUser.name,
                email: state.gsiUser.email,
                primaryContactType: 'google' as const,
              },
            };
            needsDriveCatchUpRef.current = true;
            setState((current) => ({
              ...current,
              localAccountId: localGoogleMatch.userId,
              status:
                Boolean(mergedAppData.user.clearflowTermsAcceptedAt) &&
                Boolean(mergedAppData.entities.length || mergedAppData.coreDataSnapshot?.entities?.length)
                  ? 'authenticated'
                  : 'pending-profile-setup',
              appData: mergedAppData,
              gsiUser: null,
            }));
            return;
          }

          const newUser: User = { id: crypto.randomUUID(), ...state.gsiUser, isVerified: false, primaryContactType: 'google' };
          const newAppData: AppData = { user: newUser, entities: [] };
          setState(current => ({ ...current, status: 'pending-profile-setup', appData: newAppData, gsiUser: null }));
        }
      }
    };
    checkDrive();
  }, [state.status, state.apiAccessToken, state.gsiUser]);

  useEffect(() => {
    if (state.status !== 'pending-drive-check' || !state.gsiUser) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState((current) => {
        if (current.status !== 'pending-drive-check' || !current.gsiUser) {
          return current;
        }

        const newUser: User = {
          ...(current.appData?.user || {
            id: crypto.randomUUID(),
            ...current.gsiUser,
            isVerified: false,
            primaryContactType: 'google' as const,
          }),
        };

        return {
          ...current,
          status: 'pending-profile-setup',
          appData: current.appData || { user: newUser, entities: [] },
          gsiUser: null,
        };
      });
    }, 8000);

    return () => window.clearTimeout(timeoutId);
  }, [state.status, state.gsiUser]);

  useEffect(() => {
    if (!state.appData?.user.email || state.appData.user.primaryContactType !== 'google') {
      return;
    }

    const nextValue = {
      name: state.appData.user.name || state.appData.user.email,
      email: state.appData.user.email,
    };

    setLastKnownGoogleUser((current) => {
      if (
        current?.email === nextValue.email &&
        current?.name === nextValue.name
      ) {
        return current;
      }

      try {
        window.localStorage.setItem(LAST_GOOGLE_USER_STORAGE_KEY, JSON.stringify(nextValue));
      } catch {
        // ignore local storage errors
      }

      return nextValue;
    });
  }, [state.appData?.user.email, state.appData?.user.name, state.appData?.user.primaryContactType]);

  useEffect(() => {
    if (state.status !== 'pending-gsi' || !state.appData?.user) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState((current) => {
        if (current.status !== 'pending-gsi' || !current.appData?.user) {
          return current;
        }

        return {
          ...current,
          status: 'pending-profile-setup',
          gsiUser: null,
        };
      });
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [state.status, state.appData]);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  const ensureGoogleClients = useCallback(async () => {
    if (!isConfigured) {
      return false;
    }

    if (typeof google !== 'undefined' && google.accounts) {
      if (!googleClientsInitializedRef.current) {
        const client = google.accounts.oauth2.initCodeClient({
          client_id: getGoogleClientId(),
          scope: GOOGLE_DRIVE_SCOPE,
          ux_mode: 'popup',
          callback: handleAuthorizationCodeResponse,
        });
        setTokenClient(client);
        tokenClientRef.current = client;
        googleClientsInitializedRef.current = true;
      }

      return true;
    }

    if (!googleScriptPromiseRef.current) {
      googleScriptPromiseRef.current = new Promise<void>((resolve, reject) => {
        const existingScript = document.querySelector<HTMLScriptElement>(
          'script[data-clearflow-google="true"]'
        );

        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(), { once: true });
          existingScript.addEventListener(
            'error',
            () => reject(new Error('Google sign-in script failed to load.')),
            { once: true }
          );
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.clearflowGoogle = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google sign-in script failed to load.'));
        document.head.appendChild(script);
      });
    }

    try {
      await googleScriptPromiseRef.current;
    } catch (error) {
      console.warn('Unable to load Google sign-in script.', error);
      googleScriptPromiseRef.current = null;
      return false;
    }

    if (typeof google !== 'undefined' && google.accounts && !googleClientsInitializedRef.current) {
      const client = google.accounts.oauth2.initCodeClient({
        client_id: getGoogleClientId(),
        scope: GOOGLE_DRIVE_SCOPE,
        ux_mode: 'popup',
        callback: handleAuthorizationCodeResponse,
      });
      setTokenClient(client);
      tokenClientRef.current = client;
      googleClientsInitializedRef.current = true;
    }

    return typeof google !== 'undefined' && !!google.accounts;
  }, [GOOGLE_DRIVE_SCOPE, handleAuthorizationCodeResponse, isConfigured]);

  const startGoogleSignIn = useCallback(async (mode: 'new' | 'existing' | 'returning' = 'existing') => {
    if (!isConfigured) {
      return { success: false, error: 'Google sign-in is not configured in this environment.' };
    }

    const ready = await ensureGoogleClients();
    const activeTokenClient = tokenClientRef.current || tokenClient;
    if (!ready || !activeTokenClient) {
      return { success: false, error: 'Google sign-in is not ready yet. Try again in a moment.' };
    }

    setState((current) => ({
      ...current,
      status: 'pending-gsi',
      gsiUser: null,
      pendingCredentialAuth: null,
    }));

    activeTokenClient.requestCode({
      prompt:
        mode === 'new'
          ? 'consent select_account'
          : mode === 'existing'
            ? 'select_account'
            : '',
    });

    return { success: true };
  }, [ensureGoogleClients, isConfigured, tokenClient]);

  const renderGoogleButton = useCallback((elementId: string) => {
    if (!isInitialized || !isConfigured) {
      return;
    }

    void ensureGoogleClients().then((ready) => {
      const target = document.getElementById(elementId);
      if (!ready || !target || typeof google === 'undefined' || !google.accounts) {
        return;
      }

      target.replaceChildren();
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'inline-flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-sky-400 hover:bg-sky-50';
      button.textContent = 'Continue with Google';
      button.onclick = () => {
        void startGoogleSignIn('existing');
      };
      target.appendChild(button);
    });
  }, [ensureGoogleClients, isConfigured, isInitialized, startGoogleSignIn]);

  const mockLogin = (name: string, email: string) => {
    const mockUser: User = { id: `mock-${crypto.randomUUID()}`, name, email, isVerified: true };
    setState({
      ...state,
      appData: { user: mockUser, entities: [] },
      token: 'mock-token',
      localAccountId: null,
      status: 'authenticated'
    });
  };

  const startCredentialAuth = async (input: {
    contactType: LocalAuthContactType;
    contactValue: string;
    name?: string;
  }) => {
    const result = startLocalAuthChallenge(input);
    if (!result.success) {
      return result;
    }

    const delivery = await deliverVerificationCode({
      contactType: result.challenge.contactType,
      contactValue: result.challenge.contactValue,
      maskedTarget: result.challenge.maskedTarget,
      code: result.challenge.codePreview || '',
    });

    setState((current) => ({
      ...current,
      pendingCredentialAuth: {
        ...result.challenge,
        deliveryMode: delivery.deliveryMode,
        deliveryMessage: delivery.message,
        codePreview:
          delivery.deliveryMode === 'in_app_preview'
            ? result.challenge.codePreview
            : undefined,
      },
      gsiUser: null,
      token: null,
      apiAccessToken: null,
      localAccountId: null,
      appData: null,
      status: 'unauthenticated',
    }));
    return { success: true };
  };

  const verifyCredentialAuth = async (input: {
    code: string;
    userHandle?: string;
    password?: string;
  }) => {
    const challenge = state.pendingCredentialAuth;
    if (!challenge) {
      return { success: false, error: 'Request a verification code first.' };
    }

    const result = await verifyLocalAuthChallenge({
      contactType: challenge.contactType,
      contactValue: challenge.contactValue,
      code: input.code,
      userHandle: input.userHandle,
      password: input.password,
    });

    if (!result.success) {
      return result;
    }

    const nextStatus: AuthStatus =
      result.appData.user.isVerified
        ? 'authenticated'
        : result.appData.user.name && (result.appData.user.email || result.appData.user.phone)
          ? 'pending-verification'
          : 'pending-profile-setup';

    setState((current) => ({
      ...current,
      appData: result.appData,
      token: 'local-token',
      apiAccessToken: null,
      localAccountId: result.userId,
      gsiUser: null,
      pendingCredentialAuth: null,
      status: nextStatus,
    }));

    void loadAccountAppData(result.userId)
      .then((durableAppData) => {
        if (!durableAppData) {
          return;
        }

        saveLocalAuthAppData(result.userId, durableAppData);
        initialDataLoaded.current = false;

        setState((current) => {
          if (current.localAccountId !== result.userId) {
            return current;
          }

          const durableStatus: AuthStatus =
            durableAppData.user.isVerified
              ? 'authenticated'
              : durableAppData.user.name &&
                  (durableAppData.user.email || durableAppData.user.phone)
                ? 'pending-verification'
                : 'pending-profile-setup';

          return {
            ...current,
            appData: durableAppData,
            status: durableStatus,
          };
        });
      })
      .catch((error) => {
        console.warn('Failed to hydrate local account from durable storage.', error);
      });

    return { success: true };
  };

  const signInWithPassword = async (input: {
    identifier: string;
    password: string;
  }) => {
    const result = await authenticateLocalPassword(input);
    if (!result.success) {
      return result;
    }

    const nextStatus: AuthStatus =
      result.appData.user.isVerified
        ? 'authenticated'
        : result.appData.user.name && (result.appData.user.email || result.appData.user.phone)
          ? 'pending-verification'
          : 'pending-profile-setup';

    setState((current) => ({
      ...current,
      appData: result.appData,
      token: 'local-token',
      apiAccessToken: null,
      localAccountId: result.userId,
      gsiUser: null,
      pendingCredentialAuth: null,
      status: nextStatus,
    }));

    void loadAccountAppData(result.userId)
      .then((durableAppData) => {
        if (!durableAppData) {
          return;
        }

        saveLocalAuthAppData(result.userId, durableAppData);
        initialDataLoaded.current = false;

        setState((current) => {
          if (current.localAccountId !== result.userId) {
            return current;
          }

          const durableStatus: AuthStatus =
            durableAppData.user.isVerified
              ? 'authenticated'
              : durableAppData.user.name &&
                  (durableAppData.user.email || durableAppData.user.phone)
                ? 'pending-verification'
                : 'pending-profile-setup';

          return {
            ...current,
            appData: durableAppData,
            status: durableStatus,
          };
        });
      })
      .catch((error) => {
        console.warn('Failed to hydrate password-auth account from durable storage.', error);
      });

    return { success: true };
  };

  const cancelCredentialAuth = () => {
    setState((current) => ({
      ...current,
      pendingCredentialAuth: null,
    }));
  };
  
  const updateUser = (user: User) => {
    if (state.appData) {
        setState(s => ({ ...s, appData: { ...s.appData!, user } }));
    }
  };

  const updateEntities = (entities: Entity[]) => {
    if (state.appData) {
        setState(s => ({ ...s, appData: { ...s.appData!, entities } }));
    }
  };

  const updateCoreDataSnapshot = (snapshot: CoreDataBundle) => {
    if (state.appData) {
      setState((s) => ({
        ...s,
        appData: s.appData ? { ...s.appData, coreDataSnapshot: snapshot } : null,
      }));
    }
  };

  const routeDocumentToDrive = async (input: {
    sourceFileId: string;
    fileName: string;
    entityId?: string;
    targetGoogleEmail?: string;
  }) => {
    if (!state.apiAccessToken) {
      return { success: false, error: 'Google Drive access is not available yet.' };
    }

    const currentGoogleEmail = state.appData?.user.email?.trim().toLowerCase();
    const targetGoogleEmail = input.targetGoogleEmail?.trim().toLowerCase();
    if (targetGoogleEmail && currentGoogleEmail && targetGoogleEmail !== currentGoogleEmail) {
      return {
        success: false,
        error: `Reconnect Google as ${input.targetGoogleEmail} before routing this entity document to Drive.`,
      };
    }

    try {
      const storedFile = await getDocumentFile(input.sourceFileId);
      if (!storedFile) {
        return { success: false, error: 'The source file could not be found in the vault.' };
      }

      const upload = await googleDriveService.uploadBinaryFile(
        state.apiAccessToken,
        input.fileName || storedFile.fileName,
        storedFile.blob,
        storedFile.mimeType,
      );

      return { success: true, fileId: upload.id };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'The document could not be routed to Google Drive.',
      };
    }
  };

  const updateBackupAccess = async (input: {
    userHandle?: string;
    password?: string;
    preferredContactType?: 'email' | 'phone';
  }) => {
    if (!state.appData) {
      return { success: false, error: 'No active user session was found.' };
    }

    const nextAppData: AppData = {
      ...state.appData,
      user: {
        ...state.appData.user,
        userHandle: input.userHandle?.trim() || state.appData.user.userHandle,
      },
    };

    try {
      if (state.localAccountId) {
        await updateLocalAccountCredentials({
          userId: state.localAccountId,
          appData: nextAppData,
          userHandle: input.userHandle,
          password: input.password,
        });
        saveLocalAuthAppData(state.localAccountId, nextAppData);
        void saveAccountAppData(state.localAccountId, nextAppData).catch((error) => {
          console.warn('Failed to mirror backup access settings to durable storage.', error);
        });
        setState((current) => ({
          ...current,
          appData: nextAppData,
        }));
        return { success: true };
      }

      const backupAccountId = await upsertLocalBackupAccount({
        appData: nextAppData,
        preferredContactType: input.preferredContactType,
        userHandle: input.userHandle,
        password: input.password,
      });

      if (!backupAccountId) {
        return {
          success: false,
          error: 'Add an email or phone number first so backup access has a contact path.',
        };
      }

      setState((current) => ({
        ...current,
        appData: nextAppData,
        localAccountId: backupAccountId,
      }));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Backup access could not be updated.',
      };
    }
  };

  const completeProfileSetup = (
    name: string,
    email?: string,
    phone?: string,
    userHandle?: string,
    password?: string,
    acceptedTerms?: boolean,
    signerName?: string
  ) => {
    if (!state.appData) {
      logout();
      return;
    }

    if (!acceptedTerms) {
      console.error('ClearFlow terms must be accepted before profile setup can complete.');
      return;
    }

    const updatedUser = {
      ...state.appData.user,
      name,
      email: email || state.appData.user.email,
      phone: phone || state.appData.user.phone,
      userHandle: userHandle || state.appData.user.userHandle,
      isVerified: Boolean(state.apiAccessToken) || state.appData.user.isVerified,
      primaryContactType: state.appData.user.primaryContactType || (state.apiAccessToken ? 'google' : state.appData.user.primaryContactType),
    };
    const acceptedAt = new Date().toISOString();
    const enrichedAppData = enrichAppDataFromMembershipDraft({
      ...state.appData,
      user: updatedUser,
    });
    const finalAppData = applyClearFlowRetentionRecords(enrichedAppData, {
      acceptedAt,
      termsVersion: CLEARFLOW_TERMS_VERSION,
      signerName,
    });

    if (state.apiAccessToken) {
      // Real Google flow with Drive persistence and durable email-linked recovery.
      initialDataLoaded.current = true;
      userDataService.setActiveUserEmail(finalAppData.user.email);
      Promise.resolve(
        upsertLocalBackupAccount({
          appData: finalAppData,
          preferredContactType:
            finalAppData.user.primaryContactType === 'phone' ? 'phone' : 'email',
          userHandle,
          password,
        })
      )
        .then((backupAccountId) =>
          userDataService.saveUserData(state.apiAccessToken!, finalAppData).then(() => backupAccountId)
        )
        .then((backupAccountId) => {
          setState((s) => ({
            ...s,
            appData: finalAppData,
            localAccountId: backupAccountId || s.localAccountId,
            status: 'authenticated',
          }));
          clearStoredMembershipDraft();
        })
        .catch(err => {
          console.error("Failed to create user data file in Drive", err);
          logout();
        });
    } else if (state.token === 'mock-token') {
      // Dev login flow, no persistence
      setState(s => ({ ...s, appData: finalAppData, status: 'authenticated' }));
    } else if (state.localAccountId) {
      saveLocalAuthAppData(state.localAccountId, finalAppData);
      void updateLocalAccountCredentials({
        userId: state.localAccountId,
        appData: finalAppData,
        userHandle,
        password,
      }).catch((error) => {
        console.warn('Failed to persist local backup credentials.', error);
      });
      void saveAccountAppData(state.localAccountId, finalAppData).catch((error) => {
        console.warn('Failed to persist local account profile setup to durable storage.', error);
      });
      setState((s) => ({ ...s, appData: finalAppData, status: 'pending-verification' }));
    } else if (state.token) {
      Promise.resolve(
        upsertLocalBackupAccount({
          appData: finalAppData,
          preferredContactType: finalAppData.user.email ? 'email' : 'phone',
        })
      )
        .then((backupAccountId) => {
          if (backupAccountId) {
            saveLocalAuthAppData(backupAccountId, finalAppData);
            void saveAccountAppData(backupAccountId, finalAppData).catch((error) => {
              console.warn('Failed to persist Google fallback onboarding to durable storage.', error);
            });
          }

          setState((s) => ({
            ...s,
            appData: finalAppData,
            localAccountId: backupAccountId || s.localAccountId,
            status: 'authenticated',
          }));
          clearStoredMembershipDraft();
        })
        .catch((error) => {
          console.warn('Unable to provision fallback storage for Google onboarding.', error);
          setState((s) => ({
            ...s,
            appData: finalAppData,
            status: 'authenticated',
          }));
          clearStoredMembershipDraft();
        });
    } else {
      console.error("Incomplete profile setup attempt without access token or mock token.");
      logout();
    }
  };

  const completeVerification = () => {
    if (state.appData?.user) {
        const updatedUser = { ...state.appData.user, isVerified: true };
        const verifiedSnapshot = state.appData.coreDataSnapshot
          ? {
              ...state.appData.coreDataSnapshot,
              entities: state.appData.coreDataSnapshot.entities.map((entity) => ({
                ...entity,
                status: 'active',
              })),
              authorityRecords: state.appData.coreDataSnapshot.authorityRecords.map((record) => ({
                ...record,
                clientAuthorizationStatus: 'active',
              })),
              tokens: state.appData.coreDataSnapshot.tokens.map((token) =>
                token.status === 'issued'
                  ? {
                      ...token,
                      status: 'verified',
                      verifiedAt: new Date().toISOString(),
                      proofReference:
                        token.proofReference ??
                        'Verified during identity and authority onboarding.',
                    }
                  : token
              ),
            }
          : undefined;
        const nextAppData = state.appData
          ? { ...state.appData, user: updatedUser, coreDataSnapshot: verifiedSnapshot }
          : null;

        if (nextAppData && state.localAccountId) {
          saveLocalAuthAppData(state.localAccountId, nextAppData);
          void saveAccountAppData(state.localAccountId, nextAppData).catch((error) => {
            console.warn('Failed to persist verification state to durable storage.', error);
          });
        }

        setState(s => ({
            ...s,
            appData: nextAppData,
            status: 'authenticated',
        }));
        clearStoredMembershipDraft();
    }
  };

  const logout = () => {
    if (typeof google !== 'undefined' && google.accounts) {
      google.accounts.id.disableAutoSelect();
    }
    userDataService.clearCache();
    initialDataLoaded.current = false;
    needsDriveCatchUpRef.current = false;
    tokenClientRef.current = null;
    googleClientsInitializedRef.current = false;
    setSavingStatus('idle');
    setState({
      token: null,
      apiAccessToken: null,
      localAccountId: null,
      status: 'unauthenticated',
      appData: null,
      gsiUser: null,
      pendingCredentialAuth: null,
    });
  };

  const requestDriveAccess = () => {
    const activeTokenClient = tokenClientRef.current || tokenClient;
    if (activeTokenClient) {
      setState((current) => ({
        ...current,
        status:
          current.appData?.user && current.status !== 'unauthenticated'
            ? 'pending-gsi'
            : current.status,
      }));
      activeTokenClient.requestCode({ prompt: 'consent select_account' });
    }
  };

  const continueGoogleOnboardingFallback = () => {
    setState((current) => {
      if (
        (current.status !== 'pending-gsi' &&
          current.status !== 'pending-drive-check') ||
        !current.appData?.user
      ) {
        return current;
      }

      return {
        ...current,
        status: 'pending-profile-setup',
        gsiUser: null,
      };
    });
  };

  const value: AuthContextType = {
    isInitialized,
    isConfigured,
    hasDriveAccess: !!state.apiAccessToken,
    currentUser: state.appData?.user ?? null,
    lastKnownGoogleUser,
    authStatus: state.status,
    savingStatus: savingStatus,
    appData: state.appData,
    pendingCredentialAuth: state.pendingCredentialAuth,
    startGoogleSignIn,
    renderGoogleButton,
    mockLogin,
    startCredentialAuth,
    verifyCredentialAuth,
    signInWithPassword,
    cancelCredentialAuth,
    isLocalCredentialFlow: Boolean(state.localAccountId && !state.apiAccessToken),
    updateUser,
    updateEntities,
    updateCoreDataSnapshot,
    routeDocumentToDrive,
    updateBackupAccess,
    completeProfileSetup,
    completeVerification,
    logout,
    requestDriveAccess,
    continueGoogleOnboardingFallback,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
