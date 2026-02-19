import { useState } from 'react';
import { useMutation, useQueryClient, useQuery, keepPreviousData } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { Meeting, CalendarActivity } from '../types/dashboard';
import { queryKeys } from './queryKeys';

type CalendarScope = 'opportunity' | 'prospect' | 'contact';

export type CalendarRangeParams = {
  entityType?: CalendarScope;
  entityId?: string;
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
  status?: string;    // optional server-side status filter
  calendarId?: string; // optional specific calendar id
};

export const useCalendarOperations = (params?: CalendarRangeParams) => {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Compute scoped list key and endpoint based on provided params
  const hasRange = Boolean(params?.startDate || params?.endDate || params?.status || params?.calendarId);
  const listKey = hasRange
    ? queryKeys.calendars.activitiesByRange({
        startDate: params?.startDate ?? null,
        endDate: params?.endDate ?? null,
        status: params?.status ?? null,
        calendarId: params?.calendarId ?? null,
      })
    : params?.entityType === 'opportunity'
    ? queryKeys.calendars.byOpportunity(params!.entityId as string)
    : params?.entityType === 'prospect'
    ? queryKeys.calendars.byProspect(params!.entityId as string)
    : params?.entityType === 'contact'
    ? queryKeys.calendars.byContact(params!.entityId as string)
    : queryKeys.calendars.activities();

  const listEndpointBase = params?.entityType && params?.entityId
    ? `api/calendar-activities/${params.entityType}/${params.entityId}`
    : 'api/calendar-activities/';

  // If range is provided, append querystring (do NOT introduce leading slash)
  const searchParams = new URLSearchParams();
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.calendarId) searchParams.set('calendarId', params.calendarId);

  // Use TanStack Query for fetching calendar activities (single source of truth)
  const calendarActivitiesQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const endpoint = hasRange
        ? `${listEndpointBase}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
        : listEndpointBase;
      const { data, error: apiError } = await requestWithAuth(endpoint, 'GET', null);
      if (apiError) throw new Error(apiError);
      
      // Process and return clean data structure
      const activitiesData = Array.isArray(data?.data) ? data.data : (data || []);
      
      // Transform calendar activities to Meeting format
      const formattedMeetings = activitiesData
        .filter((activity: CalendarActivity) => activity.status !== 'cancelled')
        .map((activity: CalendarActivity) => {
          let startTime: Date | null = null;
          try {
            const potentialDate = new Date(activity.startTime);
            if (!isNaN(potentialDate.getTime())) {
              startTime = potentialDate;
            } else {
              console.warn(`Invalid startTime for activity ${activity._id}: ${activity.startTime}`);
              startTime = new Date(); // Or set to null, depending on requirements
            }
          } catch (e: unknown) {
            console.warn(`Error parsing startTime for activity ${activity._id}: ${(e as Error).message}`);
            startTime = new Date(); // Fallback
          }

          // Extract attendee names for the prospect display field
          const attendeeNames = activity.attendees
            ?.filter(a => a.responseStatus === 'accepted')
            .map(a => a.name)
            .filter(name => name) // Filter out empty/undefined names
            .join(', ') || 'No attendees';
            
          return {
            id: activity._id,
            title: activity.title,
            date: startTime,
            time: startTime?.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: 'numeric', 
              hour12: true 
            }) ?? 'Invalid Time',
            prospect: activity.location || attendeeNames, // Display string
            prospectRef: (activity as any).prospect as string | null, // Actual prospect reference (can be null)
            status: activity.status,
            agenda: activity.agenda,
            description: activity.description,
            attendees: activity.attendees,
            conferencing: {
              provider: activity.conferencing?.provider,
              details: activity.conferencing?.details
            }
          } as Meeting;
        });

      return formattedMeetings;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: keepPreviousData, // Keep old data visible while fetching new range
  });

  // Individual calendar activity query
  const getCalendarActivityQuery = (calendarId: string) => useQuery({
    queryKey: queryKeys.calendars.activity(calendarId),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(`api/calendar-activities/${calendarId}`, 'GET', null);
      if (apiError) throw new Error(apiError);
      return data;
    },
    enabled: !!calendarId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { error: apiError } = await requestWithAuth(
        'api/nylas/events/sync',
        'POST',
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: listKey });
      
      // Snapshot the previous value for rollback
      const previousActivities = queryClient.getQueryData(listKey);
      
      // Optimistically show syncing state (could add a loading indicator to existing data)
      // For sync operations, we typically don't change the data optimistically
      // but we could show a "syncing" indicator
      
      return { previousActivities };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error if needed
      if (context?.previousActivities) {
        queryClient.setQueryData(listKey, context.previousActivities);
      }
    },
    onSettled: () => {
      // Always refetch after sync to get latest data
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  // Wrapper functions for easier usage
  const syncCalendarEvents = async () => {
    setError(null);
    
    try {
      await syncMutation.mutateAsync();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to sync calendar events";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const fetchCalendarActivity = async (calendarId: string) => {
    setError(null);
    
    try {
      const { data, error: apiError } = await queryClient.ensureQueryData({
        queryKey: queryKeys.calendars.activity(calendarId),
        queryFn: async () => requestWithAuth(`api/calendar-activities/${calendarId}`, 'GET', null),
      });

      if (apiError) {
        throw new Error(apiError);
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch calendar activity";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states (single source of truth)
    meetings: calendarActivitiesQuery.data || [],
    isLoadingMeetings: calendarActivitiesQuery.isLoading,
    isFetchingMeetings: calendarActivitiesQuery.isFetching,
    meetingsError: calendarActivitiesQuery.error,
    refetchMeetings: calendarActivitiesQuery.refetch,
    
    // Mutation states
    isSyncing: syncMutation.isPending,
    error,
    
    // Actions
    syncCalendarEvents,
    fetchCalendarActivity,
    clearError,
    
    // Utility for getting individual activity queries
    getCalendarActivityQuery,
  };
}; 