import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import type { UserData } from '@stacks/auth';
import { Connect, AuthOptions } from '@stacks/connect-react';
import posthog from 'posthog-js';
import { userSession } from '../../utils/blockstack';

/**
 * This interface is needed for now as users connected via Blockstack connect will see their username injected.
 * Can be removed when we remove Blockstack connect.
 */
interface UserDataWithUsername extends UserData {
  username: string;
}

const AuthContext = React.createContext<{
  user?: UserDataWithUsername;
  isLegacy?: boolean;
  loggingIn: boolean;
  setUsername: (username: string) => void;
  logout: () => void;
}>({
  loggingIn: false,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setUsername: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  logout: () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
}

const AuthProvider = ({ children }: AuthProviderProps) => {
  const [state, setState] = useState<{
    loggingIn: boolean;
    isLegacy?: boolean;
    user?: UserDataWithUsername;
  }>({
    loggingIn: true,
  });

  useEffect(() => {
    if (userSession.isUserSignedIn()) {
      handleAuthSignIn();
    } else if (userSession.isSignInPending()) {
      userSession
        .handlePendingSignIn()
        .then(handleAuthSignIn)
        .catch((error: Error) => {
          setState({
            loggingIn: false,
          });
          console.error(error);
          toast.error(error.message);
        });
    } else if (state.loggingIn) {
      setState({
        loggingIn: false,
      });
    }
  }, []);

  useEffect(() => {
    if (state.user) {
      posthog.identify(state.user.profile.stxAddress, {
        username: state.user.username,
        isLegacy: state.isLegacy,
      });
    }
  }, [state.user, state.isLegacy]);

  const handleAuthSignIn = async () => {
    const userData = userSession.loadUserData() as UserDataWithUsername;
    const address = userData.profile.stxAddress.mainnet;

    /**
     * We try to manually inject the user's username into the userData object,
     * to fix the following edge case:
     * 1. Username is not populated for .btc names https://github.com/hirosystems/stacks.js/issues/1144
     * 2. When registering a new free subdomain with Sigle, it takes time to get injected by
     * the Hiro wallet.
     */
    if (userData.username === undefined && address) {
      try {
        const namesResponse = await fetch(
          `https://stacks-node-api.stacks.co/v1/addresses/stacks/${address}`
        );
        const namesJson = await namesResponse.json();
        if ((namesJson.names.length || 0) > 0) {
          userData.username = namesJson.names[0];
        }
      } catch (e) {}
    }

    /**
     * Try to find if a username is registered in localStorage.
     * If userData.username is empty, we will use the username from localStorage.
     * If userData.username value is returned by the API we can clean the localStorage.
     */
    const username = localStorage.getItem(`sigle-username-${address}`);
    if (username) {
      if (username === userData.username) {
        localStorage.removeItem(`sigle-username-${address}`);
      } else {
        userData.username = username;
      }
    }

    setState({
      loggingIn: false,
      user: userData,
      isLegacy: address === undefined,
    });
  };

  const appDetails = {
    name: 'Sigle',
    icon: 'https://app.sigle.io/icon-192x192.png',
  };

  const authOptions: AuthOptions = {
    redirectTo: '/',
    appDetails,
    userSession,
    onFinish: handleAuthSignIn,
  };

  const handleSetUsername = useCallback((username: string) => {
    const userData = userSession.loadUserData();

    setState({
      loggingIn: false,
      user: {
        ...userData,
        username,
      },
    });
  }, []);

  const handleLogout = useCallback(() => {
    userSession.signUserOut();

    setState({
      loggingIn: false,
      user: undefined,
    });
  }, []);

  const userApi = useMemo(() => ({ handleSetUsername, handleLogout }), []);

  return (
    <Connect authOptions={authOptions}>
      <AuthContext.Provider
        value={{
          user: state.user,
          loggingIn: state.loggingIn,
          isLegacy: state.isLegacy,
          setUsername: userApi.handleSetUsername,
          logout: userApi.handleLogout,
        }}
      >
        {children}
      </AuthContext.Provider>
    </Connect>
  );
};

const useAuth = () => React.useContext(AuthContext);

export { AuthProvider, useAuth };
