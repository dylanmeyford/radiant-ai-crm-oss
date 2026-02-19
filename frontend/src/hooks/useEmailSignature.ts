import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';

interface EmailSignatureData {
  connectionId: string;
  email: string;
  emailSignature: string;
}

interface UpdateSignatureParams {
  connectionId: string;
  emailSignature: string;
}

export function useEmailSignature() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Get email signature for a specific connection
  const getEmailSignatureQuery = (connectionId: string | null) => {
    return useQuery({
      queryKey: queryKeys.emailSignature.detail(connectionId || ''),
      queryFn: async () => {
        if (!connectionId) return null;
        
        const { data, error: apiError } = await requestWithAuth(
          `api/nylas/${connectionId}/signature`,
          "GET",
          null
        );
        
        if (apiError) throw new Error(apiError);
        
        return data?.data || null;
      },
      enabled: !!connectionId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    });
  };

  // Update email signature mutation
  const updateSignatureMutation = useMutation({
    mutationFn: async ({ connectionId, emailSignature }: UpdateSignatureParams) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/nylas/${connectionId}/signature`,
        "PUT",
        { emailSignature }
      );
      
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.emailSignature.detail(variables.connectionId) 
      });

      // Snapshot the previous value
      const previousSignature = queryClient.getQueryData(
        queryKeys.emailSignature.detail(variables.connectionId)
      );

      // Optimistically update the cache
      queryClient.setQueryData(
        queryKeys.emailSignature.detail(variables.connectionId),
        (old: EmailSignatureData | null) => {
          if (!old) return old;
          return {
            ...old,
            emailSignature: variables.emailSignature
          };
        }
      );

      // Return context for rollback
      return { previousSignature };
    },
    onError: (_err, variables, context) => {
      // Rollback on failure
      if (context?.previousSignature) {
        queryClient.setQueryData(
          queryKeys.emailSignature.detail(variables.connectionId),
          context.previousSignature
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.emailSignature.detail(variables.connectionId) 
      });
    },
  });

  // Wrapper function for easier usage
  const updateSignature = async (connectionId: string, emailSignature: string) => {
    setError(null);
    try {
      const data = await updateSignatureMutation.mutateAsync({ 
        connectionId, 
        emailSignature 
      });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update email signature";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  return {
    // Query function
    getEmailSignatureQuery,
    
    // Mutation states
    isUpdating: updateSignatureMutation.isPending,
    error,
    
    // Actions
    updateSignature,
    clearError: () => setError(null),
  };
}
