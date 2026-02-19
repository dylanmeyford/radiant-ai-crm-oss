import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from "./queryKeys";

interface Calendar {
  id: string;
  name: string;
  description?: string;
  isSubscribed: boolean;
}

export function useCalendars(connectionId: string) {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for fetching calendars
  const calendarsQuery = useQuery({
    queryKey: queryKeys.calendars.byConnection(connectionId),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth(
        `api/nylas/calendars`, 
        "POST", 
        { nylasConnectionId: connectionId }
      );
      if (apiError) throw new Error(apiError);
      
      // Process and combine calendar data
      const allCalendars: Calendar[] = [
        // Current subscribed calendars
        ...data.currentCalendars.map((calId: string) => {
          const matchingCal = data.calendarsToSubscribe.find((c: any) => c.id === calId);
          return {
            id: calId,
            name: matchingCal?.name || "Calendar",
            description: matchingCal?.description,
            isSubscribed: true
          };
        }),
        // All available calendars with subscription status
        ...data.calendarsToSubscribe.map((cal: any) => ({
          id: cal.id,
          name: cal.name,
          description: cal.description,
          isSubscribed: data.currentCalendars.includes(cal.id)
        }))
      ];
      
      // Remove duplicates by id
      const uniqueCalendars = allCalendars.reduce((acc: Calendar[], current) => {
        const exists = acc.find(cal => cal.id === current.id);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, []);
      
      return uniqueCalendars;
    },
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const subscribeMutation = useMutation({
    mutationFn: async ({ calendarId, isSubscribed }: { calendarId: string; isSubscribed: boolean }) => {
      const endpoint = isSubscribed ? "api/nylas/calendars/subscribe" : "api/nylas/calendars/unsubscribe";
      const { error: apiError } = await requestWithAuth(endpoint, "POST", {
        nylasConnectionId: connectionId,
        calendarId
      });
      if (apiError) throw new Error(`Failed to ${isSubscribed ? "subscribe to" : "unsubscribe from"} calendar`);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.calendars.byConnection(connectionId) });

      // Snapshot the previous values
      const previousCalendars = queryClient.getQueryData(queryKeys.calendars.byConnection(connectionId));

      // Optimistically update the cache
      queryClient.setQueryData(queryKeys.calendars.byConnection(connectionId), (old: Calendar[]) => {
        if (!old || !Array.isArray(old)) return old;
        
        return old.map((calendar: Calendar) =>
          calendar.id === variables.calendarId
            ? { ...calendar, isSubscribed: variables.isSubscribed }
            : calendar
        );
      });

      return { previousCalendars };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousCalendars) {
        queryClient.setQueryData(queryKeys.calendars.byConnection(connectionId), context.previousCalendars);
      }
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.byConnection(connectionId) });
    },
  });

  const updateSubscription = async (calendarId: string, isSubscribed: boolean) => {
    setError(null);
    
    try {
      await subscribeMutation.mutateAsync({ calendarId, isSubscribed });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${isSubscribed ? "subscribe to" : "unsubscribe from"} calendar`;
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query data and states
    calendars: calendarsQuery.data || [],
    isLoadingCalendars: calendarsQuery.isLoading,
    calendarsError: calendarsQuery.error,
    refetchCalendars: calendarsQuery.refetch,
    
    // Mutation states
    isUpdatingSubscription: subscribeMutation.isPending,
    error,
    
    // Actions
    updateSubscription,
    clearError,
  };
} 