import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';

export interface NylasOAuthResult {
  success: boolean;
  message?: string;
}

export const useNylasOAuth = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('Processing...');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const oauthCallbackMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await requestWithAuth(
        'api/nylas/oauth/callback',
        'POST',
        { code }
      );
      if (response.error) throw new Error(response.error);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  const handleOAuthCallback = useCallback(async (code: string): Promise<NylasOAuthResult> => {
    setIsProcessing(true);
    setError(null);
    setProgress(0);

    try {
      setProgress(25);
      setStatus('Validating authorization code...');

      if (!code) {
        throw new Error('No authorization code provided');
      }

      setProgress(50);
      setStatus('Connecting to Nylas...');

      const response = await oauthCallbackMutation.mutateAsync(code);

      setProgress(75);
      setStatus('Finalizing connection...');

      if (response.data?.status === 'success') {
        setProgress(100);
        setStatus('Successfully connected!');
        
        return { success: true };
      } else {
        throw new Error('Failed to connect account');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during authorization';
      setError(errorMessage);
      
      return { success: false, message: errorMessage };
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const resetState = useCallback(() => {
    setIsProcessing(false);
    setProgress(0);
    setStatus('Processing...');
    setError(null);
  }, []);

  return {
    // Operations
    handleOAuthCallback,
    resetState,
    // State
    isProcessing,
    progress,
    status,
    error,
  };
}; 