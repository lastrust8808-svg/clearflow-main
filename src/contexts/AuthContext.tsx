import React, { createContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { AppData, Entity, User } from '../types/app.models';
import type { CoreDataBundle } from '../types/core';
import { userDataService } from '../services/user-data.service';
import type {
  LocalAuthChallenge,
  LocalAuthContactType,
} from '../services/localAuth.service';
import {
  authenticateLocalPassword,
  saveLocalAuthAppData,
  startLocalAuthChallenge,
  updateLocalAccountCredentials,
  verifyLocalAuthChallenge,
} from '../services/localAuth.service';
import {
  loadAccountAppData,
  saveAccountAppData,
} from '../services/accountPersistence.service';
import { deliverVerificationCode } from '../services/authVerification.service';
import {
  clearStoredMembershipDraft,
  enrichAppDataFromMembershipDraft,
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
  authStatus: AuthStatus;
  savingStatus: SavingStatus;
  appData: AppData | null;
  pendingCredentialAuth: LocalAuthChallenge | null;
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
  completeProfileSetup: (
    name: string,
    email?: string,
    phone?: string,
    userHandle?: string,
    password?: string
  ) => void;
  completeVerification: () => void;
  logout: () => void;
  requestDriveAccess: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    // FIX: Cast window to 'any' to access the custom 'process' property
    // defined in index.html for environment variables.
    const env = (window as any).process?.env;
    if (!env) return false;
    const googleId = env.GOOGLE_CLIENT_ID;
    const baseUrl = env.REACT_APP_API_BASE_URL;
    return (
      !!googleId && 
      googleId !== 'YOUR_GOOGLE_CLIENT_ID_HERE' && 
      googleId !== '%VITE_GOOGLE_CLIENT_ID%' &&
      !!baseUrl && 
      baseUrl !== 'YOUR_NGROK_OR_SERVER_URL_HERE' &&
      baseUrl !== '%VITE_API_BASE_URL%'
    );
  });
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [savingStatus, setSavingStatus] = useState<SavingStatus>('idle');
  const initialDataLoaded = useRef(false);


  const handleCredentialResponse = useCallback((response: any) => {
    const idToken = response.credential;
    const decodedToken = JSON.parse(atob(idToken.split('.')[1]));
    setState(current => ({
      ...current,
      token: idToken,
      status: 'pending-gsi',
      gsiUser: { name: decodedToken.name, email: decodedToken.email }
    }));
  }, []);

  const handleAccessTokenResponse = useCallback((response: any) => {
    if (response.error) {
        console.error('OAuth Error:', response.error);
        logout();
        return;
    }
    setState(current => ({ ...current, apiAccessToken: response.access_token, status: 'pending-drive-check' }));
  }, []);

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
      return;
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
    if (state.status === 'pending-gsi' && tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  }, [state.status, tokenClient]);

  useEffect(() => {
    const checkDrive = async () => {
      if (state.status === 'pending-drive-check' && state.apiAccessToken && state.gsiUser) {
        const loadedData = await userDataService.loadUserData(state.apiAccessToken);
        if (loadedData) { // Existing user
          if (loadedData.user.isVerified) {
            setState(current => ({ ...current, status: 'authenticated', appData: loadedData, gsiUser: null }));
          } else {
            setState(current => ({ ...current, status: 'pending-verification', appData: loadedData, gsiUser: null }));
          }
        } else { // New user
          const newUser: User = { id: crypto.randomUUID(), ...state.gsiUser, isVerified: false };
          const newAppData: AppData = { user: newUser, entities: [] };
          setState(current => ({ ...current, status: 'pending-profile-setup', appData: newAppData, gsiUser: null }));
        }
      }
    };
    checkDrive();
  }, [state.status, state.apiAccessToken, state.gsiUser]);

  useEffect(() => {
    const initializeGsi = () => {
      if (!isConfigured) {
        setIsInitialized(true);
        return;
      }
      google.accounts.id.initialize({
        // FIX: Access GOOGLE_CLIENT_ID from the custom window.process object.
        client_id: (window as any).process.env.GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
      });
      const client = google.accounts.oauth2.initTokenClient({
        // FIX: Access GOOGLE_CLIENT_ID from the custom window.process object.
        client_id: (window as any).process.env.GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file',
        callback: handleAccessTokenResponse,
      });
      setTokenClient(client);
      setIsInitialized(true);
    };

    const intervalId = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts) {
        clearInterval(intervalId);
        initializeGsi();
      }
    }, 100);
    return () => clearInterval(intervalId);
  }, [handleCredentialResponse, handleAccessTokenResponse, isConfigured]);

  const renderGoogleButton = useCallback((elementId: string) => {
    if (isInitialized && isConfigured && document.getElementById(elementId)) {
      google.accounts.id.renderButton(
        document.getElementById(elementId),
        { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with', width: '280' }
      );
    }
  }, [isInitialized, isConfigured]);

  const mockLogin = (name: string, email: string) => {
    const mockUser: User = { id: `mock-${crypto.randomUUID()}`, name, email, isVerified: false };
    setState({
      ...state,
      appData: { user: mockUser, entities: [] },
      token: 'mock-token',
      localAccountId: null,
      status: 'pending-profile-setup'
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

  const completeProfileSetup = (
    name: string,
    email?: string,
    phone?: string,
    userHandle?: string,
    password?: string
  ) => {
    if (!state.appData) {
      logout();
      return;
    }

    const updatedUser = {
      ...state.appData.user,
      name,
      email: email || state.appData.user.email,
      phone: phone || state.appData.user.phone,
      userHandle: userHandle || state.appData.user.userHandle,
      isVerified: false,
    };
    const finalAppData = enrichAppDataFromMembershipDraft({
      ...state.appData,
      user: updatedUser,
    });

    if (state.apiAccessToken) {
      // Real GSI flow with Drive persistence
      initialDataLoaded.current = true; // Mark as loaded to prevent immediate re-save
      userDataService.saveUserData(state.apiAccessToken, finalAppData)
        .then(() => {
          setState(s => ({ ...s, appData: finalAppData, status: 'pending-verification' }));
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
    } else {
      // Invalid state, logout
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
    if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' });
  };

  const value: AuthContextType = {
    isInitialized,
    isConfigured,
    hasDriveAccess: !!state.apiAccessToken,
    currentUser: state.appData?.user ?? null,
    authStatus: state.status,
    savingStatus: savingStatus,
    appData: state.appData,
    pendingCredentialAuth: state.pendingCredentialAuth,
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
    completeProfileSetup,
    completeVerification,
    logout,
    requestDriveAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
