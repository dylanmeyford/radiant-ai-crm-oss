import React, { createContext, useContext, ReactNode } from 'react';
import { useAuthInit } from '@/hooks/useAuthInit';

interface AuthContextType {
  isInitializing: boolean;
  isAuthenticated: boolean | null;
  user: any | null;
  error: string | null;
  clearAuthState: () => void;
  refreshAuthState: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const authState = useAuthInit();

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
