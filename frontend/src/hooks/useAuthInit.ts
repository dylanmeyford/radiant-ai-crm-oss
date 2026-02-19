import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthOperations } from './useAuthOperations';
import { useOnlineStatus } from './useOnlineStatus';
import { queryKeys } from './queryKeys';

interface AuthInitState {
  isInitializing: boolean;
  isAuthenticated: boolean | null;
  user: any | null;
  error: string | null;
}

/**
 * Hook to handle authentication initialization on app load or login page visit.
 * Checks for existing tokens, attempts refresh if needed, and validates user session.
 */
export const useAuthInit = () => {
  const [state, setState] = useState<AuthInitState>({
    isInitializing: true,
    isAuthenticated: null,
    user: null,
    error: null,
  });

  const queryClient = useQueryClient();
  const { refreshToken, getMe } = useAuthOperations();
  const hasInitialized = useRef(false);
  const isOnline = useOnlineStatus();

  const initializeAuth = useCallback(async () => {
    // Prevent multiple initializations
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    try {
      setState(prev => ({ ...prev, isInitializing: true, error: null }));

      // Check if we have an access token
      const existingToken = localStorage.getItem('accessToken');
      
      // If offline, use cached data without API validation
      if (!isOnline) {
        console.log('Offline mode: Using cached authentication state');
        
        if (existingToken) {
          // Try to get cached user data from TanStack Query using proper query key
          const cachedUserResponse = queryClient.getQueryData(queryKeys.auth.me()) as { data: any } | undefined;
          const cachedUserData = cachedUserResponse?.data;
          
          if (cachedUserData) {
            console.log('Using cached user data for offline authentication');
            setState({
              isInitializing: false,
              isAuthenticated: true,
              user: cachedUserData,
              error: null,
            });
            return;
          } else {
            // Have token but no cached user data - optimistically authenticate
            // User will get the full app, data will load when online
            console.log('Token exists but no cached user data - optimistic offline auth');
            setState({
              isInitializing: false,
              isAuthenticated: true,
              user: { id: 'offline-user' }, // Minimal user object for offline mode
              error: null,
            });
            return;
          }
        } else {
          // No token and offline - user needs to login when online
          setState({
            isInitializing: false,
            isAuthenticated: false,
            user: null,
            error: null,
          });
          return;
        }
      }

      // Online mode - perform full validation
      if (!existingToken) {
        // No token, try to refresh from httpOnly cookie
        console.log('No access token found, attempting refresh...');
        const refreshSuccess = await refreshToken();
        
        if (!refreshSuccess) {
          // No valid refresh token either, user needs to login
          setState({
            isInitializing: false,
            isAuthenticated: false,
            user: null,
            error: null,
          });
          return;
        }
      }

      // We have a token (either existing or refreshed), validate it by fetching user
      try {
        const userResponse = await getMe();
        
        if (userResponse.error) {
          // Token is invalid, try one more refresh
          console.log('Token validation failed, attempting refresh...');
          const refreshSuccess = await refreshToken();
          
          if (refreshSuccess) {
            // Try getting user again with new token
            const retryUserResponse = await getMe();
            if (retryUserResponse.error) {
              throw new Error('Authentication failed after token refresh');
            }
            
            setState({
              isInitializing: false,
              isAuthenticated: true,
              user: retryUserResponse.data,
              error: null,
            });
          } else {
            // Refresh failed, clear everything
            localStorage.removeItem('accessToken');
            await queryClient.clear();
            setState({
              isInitializing: false,
              isAuthenticated: false,
              user: null,
              error: null,
            });
          }
        } else {
          // User data retrieved successfully
          setState({
            isInitializing: false,
            isAuthenticated: true,
            user: userResponse.data,
            error: null,
          });
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Clear any invalid tokens and reset state
        localStorage.removeItem('accessToken');
        await queryClient.clear();
        setState({
          isInitializing: false,
          isAuthenticated: false,
          user: null,
          error: error instanceof Error ? error.message : 'Authentication failed',
        });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      setState({
        isInitializing: false,
        isAuthenticated: false,
        user: null,
        error: error instanceof Error ? error.message : 'Authentication initialization failed',
      });
    }
  }, [refreshToken, getMe, queryClient, isOnline]);

  useEffect(() => {
    initializeAuth();
  }, []); // Empty dependency array - only run once on mount

  // Re-initialize when coming back online to validate cached auth state
  useEffect(() => {
    if (isOnline && state.isAuthenticated && state.user?.id === 'offline-user') {
      console.log('Back online - re-validating authentication');
      hasInitialized.current = false; // Allow re-initialization
      initializeAuth();
    }
  }, [isOnline, state.isAuthenticated, state.user?.id, initializeAuth]);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem('accessToken');
    queryClient.clear();
    setState({
      isInitializing: false,
      isAuthenticated: false,
      user: null,
      error: null,
    });
    hasInitialized.current = false; // Allow re-initialization if needed
  }, [queryClient]);

  const refreshAuthState = useCallback(async () => {
    hasInitialized.current = false; // Allow re-initialization
    await initializeAuth();
  }, [initializeAuth]);

  return {
    ...state,
    clearAuthState,
    refreshAuthState,
  };
};
