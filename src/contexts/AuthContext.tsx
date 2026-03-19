import React, { createContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { AppData, Entity, User } from '../types/app.models';
import { userDataService } from '../services/user-data.service';

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
  status: AuthStatus;
  gsiUser: { name: string, email: string } | null;
}

interface AuthContextType {
  isInitialized: boolean;
  isConfigured: boolean;
  hasDriveAccess: boolean;
  currentUser: User | null;
  authStatus: AuthStatus;
  savingStatus: SavingStatus;
  appData: AppData | null;
  renderGoogleButton: (elementId: string) => void;
  mockLogin: (name: string, email: string) => void;
  updateUser: (user: User) => void;
  updateEntities: (entities: Entity[]) => void;
  completeProfileSetup: (name: string, email: string) => void;
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
    gsiUser: null,
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
    if (state.status !== 'authenticated' || !state.apiAccessToken || !state.appData) {
      return;
    }
    
    // Condition 2: Don't save the very first time data is loaded from Drive.
    if (!initialDataLoaded.current) {
      initialDataLoaded.current = true;
      return;
    }

    // If conditions pass, it means a user has made a change.
    setSavingStatus('saving');
    debouncedSave(state.apiAccessToken, state.appData);

  }, [state.appData, state.apiAccessToken, state.status, debouncedSave]);
  
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
        status: 'pending-profile-setup'
    });
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

  const completeProfileSetup = (name: string, email: string) => {
    if (!state.appData) {
      logout();
      return;
    }

    const updatedUser = { ...state.appData.user, name, email, isVerified: false };
    const finalAppData = { ...state.appData, user: updatedUser };

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
    } else {
      // Invalid state, logout
      console.error("Incomplete profile setup attempt without access token or mock token.");
      logout();
    }
  };

  const completeVerification = () => {
    if (state.appData?.user) {
        const updatedUser = { ...state.appData.user, isVerified: true };
        setState(s => ({
            ...s,
            appData: s.appData ? { ...s.appData, user: updatedUser } : null,
            status: 'authenticated',
        }));
    }
  };

  const logout = () => {
    if (typeof google !== 'undefined' && google.accounts) {
      google.accounts.id.disableAutoSelect();
    }
    userDataService.clearCache();
    initialDataLoaded.current = false;
    setSavingStatus('idle');
    setState({ user: null, token: null, apiAccessToken: null, status: 'unauthenticated', appData: null, gsiUser: null });
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
    renderGoogleButton,
    mockLogin,
    updateUser,
    updateEntities,
    completeProfileSetup,
    completeVerification,
    logout,
    requestDriveAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
