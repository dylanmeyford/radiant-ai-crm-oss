import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';
import type {
  BillingStatus,
  SetupIntentResponse,
  CreateSubscriptionResponse,
  BillingPortalResponse,
} from '@/types/billing';

/**
 * useBilling Hook
 * 
 * Manages billing operations with TanStack Query:
 * - Fetch billing status
 * - Setup billing (create customer & setup intent)
 * - Create subscription
 * - Open billing portal
 */

export const useBilling = () => {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch billing status
  const billingStatusQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(
        'api/billing/status',
        'GET',
        null
      );
      if (apiError) throw new Error(apiError);
      return data as BillingStatus;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Setup billing mutation
  const setupBillingMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data, error: apiError } = await requestWithAuth(
        'api/billing/setup-billing',
        'POST',
        { email }
      );
      if (apiError) throw new Error(apiError);
      return data as SetupIntentResponse;
    },
    onSuccess: () => {
      // Invalidate billing status to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.status() });
    },
  });

  // Create subscription mutation
  const createSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const { data, error: apiError } = await requestWithAuth(
        'api/billing/create-subscription',
        'POST',
        {}
      );
      if (apiError) throw new Error(apiError);
      return data as CreateSubscriptionResponse;
    },
    onSuccess: () => {
      // Invalidate billing status to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.status() });
    },
  });

  // Update subscription mutation (called when accounts change)
  const updateSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const { data, error: apiError } = await requestWithAuth(
        'api/billing/update-subscription',
        'POST',
        {}
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.status() });
    },
  });

  // Open billing portal mutation
  const openBillingPortalMutation = useMutation({
    mutationFn: async (returnUrl?: string) => {
      const { data, error: apiError } = await requestWithAuth(
        'api/billing/portal',
        'POST',
        { returnUrl: returnUrl || window.location.href }
      );
      if (apiError) throw new Error(apiError);
      return data as BillingPortalResponse;
    },
    onSuccess: (data) => {
      // Open billing portal in new tab
      window.open(data.url, '_blank');
    },
  });

  // Wrapper functions for easier usage
  const setupBilling = async (email: string) => {
    setError(null);
    try {
      const data = await setupBillingMutation.mutateAsync(email);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to setup billing';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const createSubscription = async () => {
    setError(null);
    try {
      const data = await createSubscriptionMutation.mutateAsync();
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create subscription';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const openBillingPortal = async (returnUrl?: string) => {
    setError(null);
    try {
      await openBillingPortalMutation.mutateAsync(returnUrl);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to open billing portal';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Helper to check if billing is required
  const checkBillingRequired = () => {
    const status = billingStatusQuery.data;
    if (!status) return true;
    
    return !status.paymentMethodAdded || 
           (status.subscriptionStatus !== 'active' && status.subscriptionStatus !== 'trialing');
  };

  return {
    // Query data and states
    billingStatus: billingStatusQuery.data,
    isLoadingBillingStatus: billingStatusQuery.isLoading,
    billingStatusError: billingStatusQuery.error,
    refetchBillingStatus: billingStatusQuery.refetch,

    // Mutation states
    isSettingUpBilling: setupBillingMutation.isPending,
    isCreatingSubscription: createSubscriptionMutation.isPending,
    isUpdatingSubscription: updateSubscriptionMutation.isPending,
    isOpeningBillingPortal: openBillingPortalMutation.isPending,

    // Error state
    error,
    clearError: () => setError(null),

    // Actions
    setupBilling,
    createSubscription,
    openBillingPortal,
    checkBillingRequired,
  };
};

