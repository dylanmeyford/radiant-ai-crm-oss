import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { requestNoAuth } from './requestNoAuth';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';

export const useAuthOperations = () => {
  const queryClient = useQueryClient();
  
  /**
   * Refresh the access token using the httpOnly refresh token cookie
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${baseUrl}/api/auth/refresh-token`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('Token refresh failed with status:', response.status);
        return false;
      }

      const data = await response.json();
      if (data.success && data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        console.log('Token refreshed successfully');
        return true;
      }
      
      console.log('Token refresh response missing access token');
      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }, []);

  /**
   * Validate current token and get user data
   */
  const validateToken = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      return { isValid: false, user: null, error: 'No token found' };
    }

    try {
      const response = await requestWithAuth('api/auth/me', 'GET', null);
      if (response.error) {
        return { isValid: false, user: null, error: response.error };
      }
      return { isValid: true, user: response.data, error: null };
    } catch (error) {
      return { 
        isValid: false, 
        user: null, 
        error: error instanceof Error ? error.message : 'Token validation failed' 
      };
    }
  };

  /**
   * Get user data using TanStack Query cache
   */
  const getMe = useCallback(async () => {
    return queryClient.ensureQueryData({
      queryKey: queryKeys.auth.me(),
      queryFn: async () => {
        const response = await requestWithAuth('api/auth/me', 'GET', null);
        if (response.error) {
          throw new Error(response.error);
        }
        return response;
      },
      staleTime: 60_000, // 1 minute
      gcTime: 5 * 60_000, // 5 minutes
    });
  }, [queryClient]);

  /**
   * Login with email and password
   */
  const login = useCallback(async (email: string, password: string) => {
    const response = await requestNoAuth('api/auth/login', 'POST', { email, password });
    
    // If login successful, invalidate any existing auth cache
    if (!response.error && response.data?.accessToken) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    }
    
    return response;
  }, [queryClient]);

  /**
   * Register new user
   */
  const signup = async (name: string, email: string, password: string) => {
    return requestNoAuth('api/auth/register', 'POST', { name, email, password });
  };

  /**
   * Register new user with invitation token
   */
  const signupWithToken = useCallback(async (name: string, email: string, password: string, invitationToken: string) => {
    const response = await requestNoAuth('api/auth/register', 'POST', { 
      name, 
      email, 
      password, 
      invitationToken 
    });
    
    // If registration successful, invalidate any existing auth cache
    if (!response.error && response.data?.accessToken) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    }
    
    return response;
  }, [queryClient]);

  /**
   * Logout current session
   */
  const logout = async () => {
    try {
      const res = await requestWithAuth('api/auth/logout', 'POST', null);
      
      // Clear local storage and all queries regardless of API response
      localStorage.removeItem('accessToken');
      await queryClient.clear();
      
      return res;
    } catch (error) {
      // Even if logout API fails, clear local state
      localStorage.removeItem('accessToken');
      await queryClient.clear();
      
      return { 
        data: null, 
        error: error instanceof Error ? error.message : 'Logout failed' 
      };
    }
  };

  /**
   * Logout all sessions
   */
  const logoutAll = async () => {
    try {
      const res = await requestWithAuth('api/auth/logout-all', 'POST', null);
      
      // Clear local storage and all queries regardless of API response
      localStorage.removeItem('accessToken');
      await queryClient.clear();
      
      return res;
    } catch (error) {
      // Even if logout API fails, clear local state
      localStorage.removeItem('accessToken');
      await queryClient.clear();
      
      return { 
        data: null, 
        error: error instanceof Error ? error.message : 'Logout all failed' 
      };
    }
  };

  /**
   * Check if user has a valid token (without making API call)
   */
  const hasToken = (): boolean => {
    return !!localStorage.getItem('accessToken');
  };

  /**
   * Clear all auth state (useful for forced logout scenarios)
   */
  const clearAuthState = useCallback(async () => {
    localStorage.removeItem('accessToken');
    await queryClient.clear();
  }, [queryClient]);

  return { 
    refreshToken, 
    validateToken,
    getMe, 
    login, 
    signup,
    signupWithToken, 
    logout, 
    logoutAll,
    hasToken,
    clearAuthState
  };
}; 