import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';
import {
  MinedDeal,
  AcceptMinedDealPayload,
  AcceptMinedDealResponse,
  DismissMinedDealPayload,
  SnoozeMinedDealPayload,
} from '../types/minedDeal';

export function useMinedDealOperations() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Query for fetching all pending/snoozed mined deals
  const minedDealsQuery = useQuery({
    queryKey: queryKeys.minedDeals.list(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth('api/mined-deals', 'GET', null);
      if (apiError) throw new Error(apiError);

      const dealsData = Array.isArray(data) ? data : data?.data || [];

      // Process dates
      return dealsData.map((deal: MinedDeal) => ({
        ...deal,
        lastActivityDate: new Date(deal.lastActivityDate),
        firstActivityDate: new Date(deal.firstActivityDate),
        createdAt: new Date(deal.createdAt),
        updatedAt: new Date(deal.updatedAt),
        acceptedAt: deal.acceptedAt ? new Date(deal.acceptedAt) : undefined,
        snoozeUntil: deal.snoozeUntil ? new Date(deal.snoozeUntil) : undefined,
      }));
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Query for fetching pending count (for badge)
  const pendingCountQuery = useQuery({
    queryKey: queryKeys.minedDeals.count(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth('api/mined-deals/count', 'GET', null);
      if (apiError) throw new Error(apiError);

      return (data?.data?.count ?? data?.count ?? 0) as number;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Accept mutation - creates prospect and opportunity
  const acceptMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AcceptMinedDealPayload }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/mined-deals/${id}/accept`,
        'POST',
        payload
      );
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as AcceptMinedDealResponse;
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.minedDeals.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.minedDeals.count() });

      // Snapshot previous values
      const previousDeals = queryClient.getQueryData(queryKeys.minedDeals.list());
      const previousCount = queryClient.getQueryData(queryKeys.minedDeals.count());

      // Optimistically remove the deal from the list
      queryClient.setQueryData(queryKeys.minedDeals.list(), (old: MinedDeal[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((deal) => deal._id !== variables.id);
      });

      // Optimistically decrement the count
      queryClient.setQueryData(queryKeys.minedDeals.count(), (old: number | undefined) => {
        if (typeof old !== 'number') return old;
        return Math.max(0, old - 1);
      });

      return { previousDeals, previousCount };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousDeals) {
        queryClient.setQueryData(queryKeys.minedDeals.list(), context.previousDeals);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(queryKeys.minedDeals.count(), context.previousCount);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.count() });
      // Invalidate opportunities and prospects since we created new ones
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.prospects.list() });
    },
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload?: DismissMinedDealPayload }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/mined-deals/${id}/dismiss`,
        'POST',
        payload || {}
      );
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as MinedDeal;
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.minedDeals.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.minedDeals.count() });

      // Snapshot previous values
      const previousDeals = queryClient.getQueryData(queryKeys.minedDeals.list());
      const previousCount = queryClient.getQueryData(queryKeys.minedDeals.count());

      // Optimistically remove the deal from the list
      queryClient.setQueryData(queryKeys.minedDeals.list(), (old: MinedDeal[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((deal) => deal._id !== variables.id);
      });

      // Optimistically decrement the count
      queryClient.setQueryData(queryKeys.minedDeals.count(), (old: number | undefined) => {
        if (typeof old !== 'number') return old;
        return Math.max(0, old - 1);
      });

      return { previousDeals, previousCount };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousDeals) {
        queryClient.setQueryData(queryKeys.minedDeals.list(), context.previousDeals);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(queryKeys.minedDeals.count(), context.previousCount);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.count() });
    },
  });

  // Snooze mutation
  const snoozeMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: SnoozeMinedDealPayload }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/mined-deals/${id}/snooze`,
        'POST',
        payload
      );
      if (apiError) throw new Error(apiError);
      return (data?.data || data) as MinedDeal;
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.minedDeals.list() });
      await queryClient.cancelQueries({ queryKey: queryKeys.minedDeals.count() });

      // Snapshot previous values
      const previousDeals = queryClient.getQueryData(queryKeys.minedDeals.list());
      const previousCount = queryClient.getQueryData(queryKeys.minedDeals.count());

      // Optimistically update the deal status to SNOOZED
      const snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + variables.payload.days);

      queryClient.setQueryData(queryKeys.minedDeals.list(), (old: MinedDeal[] | undefined) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((deal) =>
          deal._id === variables.id
            ? { ...deal, status: 'SNOOZED' as const, snoozeUntil }
            : deal
        );
      });

      // Optimistically decrement the pending count (snoozed deals don't count as pending)
      queryClient.setQueryData(queryKeys.minedDeals.count(), (old: number | undefined) => {
        if (typeof old !== 'number') return old;
        return Math.max(0, old - 1);
      });

      return { previousDeals, previousCount };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousDeals) {
        queryClient.setQueryData(queryKeys.minedDeals.list(), context.previousDeals);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(queryKeys.minedDeals.count(), context.previousCount);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.count() });
    },
  });

  // Trigger mining mutation
  const triggerMiningMutation = useMutation({
    mutationFn: async () => {
      const { data, error: apiError } = await requestWithAuth(
        'api/mined-deals/mine-now',
        'POST',
        {}
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onSettled: () => {
      // Refetch deals after mining is triggered (though results won't be immediate)
      // Set a short delay to allow backend to process
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.list() });
        queryClient.invalidateQueries({ queryKey: queryKeys.minedDeals.count() });
      }, 5000);
    },
  });

  // Wrapper functions for easier component usage
  const acceptMinedDeal = async (id: string, payload: AcceptMinedDealPayload) => {
    setError(null);
    try {
      const data = await acceptMutation.mutateAsync({ id, payload });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept deal';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const dismissMinedDeal = async (id: string, reason?: string) => {
    setError(null);
    try {
      const data = await dismissMutation.mutateAsync({
        id,
        payload: reason ? { reason } : undefined,
      });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to dismiss deal';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const snoozeMinedDeal = async (id: string, days: number) => {
    setError(null);
    try {
      const data = await snoozeMutation.mutateAsync({ id, payload: { days } });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to snooze deal';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const triggerMining = async () => {
    setError(null);
    try {
      const data = await triggerMiningMutation.mutateAsync();
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to trigger mining';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states
    minedDeals: (minedDealsQuery.data || []) as MinedDeal[],
    isLoadingDeals: minedDealsQuery.isLoading,
    isFetchingDeals: minedDealsQuery.isFetching,
    dealsError: minedDealsQuery.error,
    refetchDeals: minedDealsQuery.refetch,

    // Pending count
    pendingCount: (pendingCountQuery.data ?? 0) as number,
    isLoadingCount: pendingCountQuery.isLoading,

    // Mutation states
    isAccepting: acceptMutation.isPending,
    isDismissing: dismissMutation.isPending,
    isSnoozing: snoozeMutation.isPending,
    isTriggeringMining: triggerMiningMutation.isPending,
    error,

    // Actions
    acceptMinedDeal,
    dismissMinedDeal,
    snoozeMinedDeal,
    triggerMining,
    clearError,
  };
}
