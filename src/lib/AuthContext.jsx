import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import {
  hydrateAccountPreferences,
  installAccountPreferenceSync,
} from '@/lib/accountPreferenceSync';
import { mediaGodAuthReturnUrl } from '@/lib/mediaGodAuth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const checkUserAuth = async ({ markAuthRequired = false } = {}) => {
    setIsLoadingAuth(true);

    try {
      // Always ask the Media God backend instead of relying only on whether an
      // access token happened to arrive in this page URL. This recognises a
      // valid token restored from local storage after reopening the app and
      // also allows the platform to recognise any valid persisted session.
      const currentUser = await base44.auth.me();

      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      setAuthChecked(true);

      try {
        await hydrateAccountPreferences(currentUser);
      } catch (syncError) {
        console.warn('Account preference hydration failed:', syncError);
      }

      return currentUser;
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);

      if (markAuthRequired && (error?.status === 401 || error?.status === 403)) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required',
        });
      } else if (error?.status !== 401 && error?.status !== 403) {
        console.error('User auth check failed:', error);
      }

      return null;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId,
        },
        token: appParams.token,
        interceptResponses: true,
      });

      try {
        const publicSettings = await appClient.get(
          `/prod/public-settings/by-id/${appParams.appId}`
        );

        setAppPublicSettings(publicSettings);

        // Media God is public-with-optional-login. A 401 from /User/me here is
        // a normal signed-out state and should display our own login/register
        // screens, not Base44's workspace-member gate.
        await checkUserAuth({ markAuthRequired: false });
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;

          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required',
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app',
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message,
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app',
          });
        }

        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred',
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkAppState();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    return installAccountPreferenceSync();
  }, [isAuthenticated]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      base44.auth.logout(mediaGodAuthReturnUrl('/login'));
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.assign(mediaGodAuthReturnUrl('/login'));
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
