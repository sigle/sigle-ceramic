import React from 'react';
import { useRouter } from 'next/router';
import { FullScreenLoading } from '../layout/components/FullScreenLoading';
import { useNewAuth } from './NewAuthContext';

interface Props {
  children: JSX.Element;
}

export const Protected = ({ children }: Props) => {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useNewAuth();

  // We show a big loading screen while the user is signing in
  if (isLoading) {
    return <FullScreenLoading />;
  }

  // If user is not logged in, redirect to login page
  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  return children;
};
