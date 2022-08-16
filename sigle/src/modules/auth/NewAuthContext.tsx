import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getCsrfToken, signOut as nextAuthSignOut } from 'next-auth/react';
import { useAccount, useDisconnect, useProvider } from 'wagmi';
import { EthereumAuthProvider } from '@ceramicnetwork/blockchain-utils-linking';
import { DIDSession } from 'did-session';

const stub = (): never => {
  throw new Error('You forgot to wrap your component in <AuthProvider>.');
};

interface AuthUser {
  address: string;
}

interface AuthContextInterface {
  /**
   * The current logged in user.
   */
  user?: AuthUser;
  /**
   * Whether the user is currently logged in.
   */
  isAuthenticated: boolean;
  /**
   * Whether the user is currently logging in.
   */
  isLoading: boolean;
  /**
   * Logs the user in with Ceramic and save the did session.
   */
  loginWithCeramic: () => void | Promise<void>;
  /**
   * Logout the user and clear the session.
   */
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextInterface>({
  isLoading: false,
  isAuthenticated: false,
  loginWithCeramic: stub,
  logout: stub,
});

/**
 * There are multiple steps for the auth to be complete:
 * 1. User sign in with a Wallet (e.g. Metamask)
 * 2. User sign a message to create a ceramic session
 * 3. User sign a message to create a Sigle session
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

const AuthProvider = ({ children }: AuthProviderProps) => {
  const [state, setState] = useState<{
    isLoading: boolean;
    isAuthenticated: boolean;
    user?: AuthUser;
    didSession?: DIDSession;
  }>({
    isLoading: true,
    isAuthenticated: false,
  });

  const { address, status } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const provider = useProvider();

  useEffect(() => {
    if (status === 'connected') {
      loginWithCeramic();
    }
  }, [status]);

  /**
   * Load the ceramic session from local storage.
   * If no session is found, create a new one and save it to local storage.
   */
  const loadCeramicSession = async (authProvider: EthereumAuthProvider) => {
    const sessionStr = localStorage.getItem('didsession');
    let session: DIDSession | undefined;

    if (sessionStr) {
      session = await DIDSession.fromSession(sessionStr);
    }

    if (!session || (session.hasSession && session.isExpired)) {
      const nonce = (await getCsrfToken()) as string;
      const domain = `${window.location.protocol}//${window.location.host}`;

      session = await DIDSession.authorize(authProvider, {
        resources: [`ceramic://*`],
        nonce,
        domain,
      });
      localStorage.setItem('didsession', session.serialize());
    }

    return session;
  };

  const loginWithCeramic = useCallback(async () => {
    if (!provider || !address) {
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: undefined,
        didSession: undefined,
      });
      return;
    }

    const authProvider = new EthereumAuthProvider(provider, address);

    const session = await loadCeramicSession(authProvider);

    setState({
      isLoading: false,
      isAuthenticated: true,
      user: { address },
      didSession: session,
    });
  }, []);

  const logout = useCallback(async () => {
    wagmiDisconnect();
    // TODO clear ceramic session
    await nextAuthSignOut();
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: undefined,
      didSession: undefined,
    });
  }, []);

  const contextValue = useMemo(() => {
    return {
      ...state,
      loginWithCeramic,
      logout,
    };
  }, [state, loginWithCeramic, logout]);

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

const useNewAuth = () => React.useContext(AuthContext);

export { AuthProvider as NewAuthProvider, useNewAuth };
