import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { requestWithAuth } from './requestWithAuth';
import type { ActivityStatsResponse } from '@/types/activityStats';

export function useActivityStats() {
  const statsQuery = useQuery({
    queryKey: queryKeys.activityStats.current(),
    queryFn: async (): Promise<ActivityStatsResponse> => {
      const { data, error: apiError } = await requestWithAuth('api/activity-stats', 'GET', null);
      if (apiError) {
        throw new Error(apiError);
      }
      return data as ActivityStatsResponse;
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
    staleTime: 10 * 1000,
    gcTime: 60 * 1000,
  });

  const hasLiveActivity = useMemo(() => {
    const live = statsQuery.data?.live;
    return !!live && (live.activitiesBeingProcessed > 0 || live.nextStepsBeingMade > 0);
  }, [statsQuery.data]);

  return {
    data: statsQuery.data,
    isLoading: statsQuery.isLoading,
    isFetching: statsQuery.isFetching,
    error: statsQuery.error,
    refetch: statsQuery.refetch,
    hasLiveActivity,
  };
}


