import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { requestWithAuth } from "./requestWithAuth";
import { queryKeys } from "./queryKeys";

interface ActionFilters {
  limit?: number;
  skip?: number;
   status?: string | string[];
  owner?: 'me';
}

export function useActionOperations() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use useQuery for fetching proposed actions with filters
  const useProposedActionsQuery = (filters: ActionFilters = {}) => {
    return useQuery({
      queryKey: queryKeys.actions.proposed(filters),
      queryFn: async () => {
        let url = "api/actions";
        const queryParams = new URLSearchParams();
        if (filters.limit) queryParams.append("limit", String(filters.limit));
        if (filters.skip) queryParams.append("skip", String(filters.skip));
        if (filters.status) {
          if (Array.isArray(filters.status)) {
            filters.status.forEach(status => queryParams.append("status", status));
          } else {
            queryParams.append("status", filters.status);
          }
        }
        if (filters.owner === 'me') queryParams.append('owner', 'me');
        if (queryParams.toString()) url += `?${queryParams.toString()}`;
        
        const { data, error: apiError } = await requestWithAuth(url, "GET", null);
        if (apiError) throw new Error(apiError);
        
        const responseData = (data as any)?.data || data;
        const actionsWithDates = Array.isArray(responseData)
          ? responseData.map((action: any) => ({
              ...action,
              createdAt: new Date(action.createdAt),
              updatedAt: action.updatedAt ? new Date(action.updatedAt) : undefined,
              sourceActivities:
                action.sourceActivities?.map((sa: any) => ({
                  ...sa,
                  activityId:
                    typeof sa.activityId === "string"
                      ? {
                          _id: sa.activityId,
                          title: "Activity",
                          date: new Date(action.createdAt),
                          type: "activity",
                        }
                      : {
                          ...sa.activityId,
                          date: new Date(sa.activityId.date || action.createdAt),
                        },
                })) || [],
            }))
          : [];
        return actionsWithDates;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    });
  };

  // Use useQuery for fetching actions by opportunity ID
  const useActionsByOpportunityQuery = (opportunityId: string) => {
    return useQuery({
      queryKey: queryKeys.actions.byOpportunity(opportunityId),
      queryFn: async () => {
        const { data, error: apiError } = await requestWithAuth(
          `api/actions/opportunities/${opportunityId}`,
          "GET",
          null
        );
        if (apiError) throw new Error(apiError);
        
        const actionsData = (data as any)?.data || [];
        const opportunityData = (data as any)?.opportunity;
        const contactsData = (data as any)?.contacts || [];
        const count = (data as any)?.count || 0;
        
        const actionsWithDates = Array.isArray(actionsData)
          ? actionsData.map((action: any) => ({
              ...action,
              createdAt: new Date(action.createdAt),
              updatedAt: action.updatedAt ? new Date(action.updatedAt) : undefined,
              sourceActivities:
                action.sourceActivities?.map((sa: any) => ({
                  ...sa,
                  activityId:
                    typeof sa.activityId === "string"
                      ? {
                          _id: sa.activityId,
                          title: "Activity",
                          date: new Date(action.createdAt),
                          type: "activity",
                        }
                      : {
                          ...sa.activityId,
                          date: new Date(sa.activityId.date || action.createdAt),
                        },
                })) || [],
            }))
          : [];
          
        return {
          data: actionsWithDates,
          opportunity: opportunityData,
          contacts: contactsData.map((contact: any) => ({
            ...contact,
            opportunity: contact.opportunityIntelligence?.find((o: any) => o.opportunity === opportunityId),
          })),
          count,
        };
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      enabled: !!opportunityId, // Only run query if opportunityId is provided
    });
  };

  // Mutation for updating action status with optimistic updates
  const updateActionMutation = useMutation({
    mutationFn: async ({ actionId, updates }: { actionId: string; updates: any }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/actions/${actionId}`,
        "PUT",
        updates
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [{ scope: 'actions' }] });

      // Snapshot ALL action query caches for rollback
      const queryCache = queryClient.getQueryCache();
      const allActionQueries = queryCache.findAll({ 
        predicate: (query) => {
          const queryKey = query.queryKey as any[];
          return queryKey?.[0]?.scope === 'actions';
        }
      });
      
      const previousQueryStates = new Map();
      allActionQueries.forEach((query) => {
        previousQueryStates.set(query.queryKey, queryClient.getQueryData(query.queryKey));
      });

      // Helper function to update action
      const updateAction = (action: any) => {
        if (action._id === variables.actionId) {
          return { ...action, ...variables.updates };
        }
        return action;
      };

      // Update ALL action query caches optimistically
      allActionQueries.forEach((query) => {
        const queryKey = query.queryKey as any[];
        const entity = queryKey?.[0]?.entity;
        
        if (entity === 'proposed') {
          // Update proposed actions queries (with any filter params)
          queryClient.setQueryData(query.queryKey, (old: any[]) => {
            if (!old || !Array.isArray(old)) return old;
            return old.map(updateAction);
          });
        } else if (entity === 'byOpportunity' || entity === 'opportunity') {
          // Update opportunity-specific queries
          queryClient.setQueryData(query.queryKey, (old: any) => {
            if (!old || !old.data || !Array.isArray(old.data)) return old;
            return {
              ...old,
              data: old.data.map(updateAction)
            };
          });
        }
      });

      return { previousQueryStates };
    },
    onError: (_err, _variables, context) => {
      // Rollback all modified queries on error
      if (context?.previousQueryStates) {
        context.previousQueryStates.forEach((data: any, queryKey: any) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Only refetch active queries to prevent issues when navigating away
      queryClient.invalidateQueries({ 
        queryKey: [{ scope: 'actions' }],
        refetchType: 'active'
      });
    },
  });

  // Mutation for approving main action with optimistic updates
  const approveActionMutation = useMutation({
    mutationFn: async ({ actionId, executeImmediately = false }: { 
      actionId: string; 
      executeImmediately?: boolean 
    }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/actions/${actionId}/approve`,
        "POST",
        { executeImmediately }
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [{ scope: 'actions' }] });

      // Snapshot ALL action query caches for rollback
      const queryCache = queryClient.getQueryCache();
      const allActionQueries = queryCache.findAll({ 
        predicate: (query) => {
          const queryKey = query.queryKey as any[];
          return queryKey?.[0]?.scope === 'actions';
        }
      });
      
      const previousQueryStates = new Map();
      allActionQueries.forEach((query) => {
        previousQueryStates.set(query.queryKey, queryClient.getQueryData(query.queryKey));
      });
      
      // Helper function to update action status
      const updateActionStatus = (action: any) => {
        if (action._id === variables.actionId) {
          return {
            ...action,
            status: variables.executeImmediately ? 'EXECUTED' : 'APPROVED'
          };
        }
        return action;
      };

      // Update ALL action query caches optimistically
      allActionQueries.forEach((query) => {
        const queryKey = query.queryKey as any[];
        const entity = queryKey?.[0]?.entity;
        
        if (entity === 'proposed') {
          // Update proposed actions queries (with any filter params)
          queryClient.setQueryData(query.queryKey, (old: any[]) => {
            if (!old || !Array.isArray(old)) return old;
            return old.map(updateActionStatus);
          });
        } else if (entity === 'byOpportunity' || entity === 'opportunity') {
          // Update opportunity-specific queries
          queryClient.setQueryData(query.queryKey, (old: any) => {
            if (!old || !old.data || !Array.isArray(old.data)) return old;
            return {
              ...old,
              data: old.data.map(updateActionStatus)
            };
          });
        }
      });

      return { previousQueryStates };
    },
    onError: (_err, _variables, context) => {
      // Rollback all modified queries on error
      if (context?.previousQueryStates) {
        context.previousQueryStates.forEach((data: any, queryKey: any) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Only refetch active queries to prevent issues when navigating away
      queryClient.invalidateQueries({ 
        queryKey: [{ scope: 'actions' }],
        refetchType: 'active'
      });
    },
  });

  // Mutation for rejecting main action with optimistic updates
  const rejectActionMutation = useMutation({
    mutationFn: async ({ actionId, reason }: { 
      actionId: string; 
      reason?: string 
    }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/actions/${actionId}/reject`,
        "POST",
        { reason }
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [{ scope: 'actions' }] });

      // Snapshot ALL action query caches for rollback
      const queryCache = queryClient.getQueryCache();
      const allActionQueries = queryCache.findAll({ 
        predicate: (query) => {
          const queryKey = query.queryKey as any[];
          return queryKey?.[0]?.scope === 'actions';
        }
      });
      
      const previousQueryStates = new Map();
      allActionQueries.forEach((query) => {
        previousQueryStates.set(query.queryKey, queryClient.getQueryData(query.queryKey));
      });
      
      // Helper function to update action status
      const updateActionStatus = (action: any) => {
        if (action._id === variables.actionId) {
          return {
            ...action,
            status: 'REJECTED'
          };
        }
        return action;
      };

      // Update ALL action query caches optimistically
      allActionQueries.forEach((query) => {
        const queryKey = query.queryKey as any[];
        const entity = queryKey?.[0]?.entity;
        
        if (entity === 'proposed') {
          // Update proposed actions queries (with any filter params)
          queryClient.setQueryData(query.queryKey, (old: any[]) => {
            if (!old || !Array.isArray(old)) return old;
            return old.map(updateActionStatus);
          });
        } else if (entity === 'byOpportunity' || entity === 'opportunity') {
          // Update opportunity-specific queries
          queryClient.setQueryData(query.queryKey, (old: any) => {
            if (!old || !old.data || !Array.isArray(old.data)) return old;
            return {
              ...old,
              data: old.data.map(updateActionStatus)
            };
          });
        }
      });

      return { previousQueryStates };
    },
    onError: (_err, _variables, context) => {
      // Rollback all modified queries on error
      if (context?.previousQueryStates) {
        context.previousQueryStates.forEach((data: any, queryKey: any) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Only refetch active queries to prevent issues when navigating away
      queryClient.invalidateQueries({ 
        queryKey: [{ scope: 'actions' }],
        refetchType: 'active'
      });
    },
  });

  // Mutation for updating sub-action with optimistic updates
  const updateSubActionMutation = useMutation({
    mutationFn: async ({ actionId, subActionId, updates }: { 
      actionId: string; 
      subActionId: string; 
      updates: any 
    }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/actions/${actionId}/sub-actions/${subActionId}`,
        "PUT",
        updates
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [{ scope: 'actions' }] });

      // Snapshot ALL action query caches for rollback
      const queryCache = queryClient.getQueryCache();
      const allActionQueries = queryCache.findAll({ 
        predicate: (query) => {
          const queryKey = query.queryKey as any[];
          return queryKey?.[0]?.scope === 'actions';
        }
      });
      
      const previousQueryStates = new Map();
      allActionQueries.forEach((query) => {
        previousQueryStates.set(query.queryKey, queryClient.getQueryData(query.queryKey));
      });

      // Helper function to update sub-action in an action
      const updateSubActionInAction = (action: any) => {
        if (action._id === variables.actionId && action.subActions) {
          return {
            ...action,
            subActions: action.subActions.map((subAction: any) =>
              subAction.id === variables.subActionId
                ? { ...subAction, ...variables.updates }
                : subAction
            )
          };
        }
        return action;
      };

      // Update ALL action query caches optimistically
      allActionQueries.forEach((query) => {
        const queryKey = query.queryKey as any[];
        const entity = queryKey?.[0]?.entity;
        
        if (entity === 'proposed') {
          // Update proposed actions queries (with any filter params)
          queryClient.setQueryData(query.queryKey, (old: any[]) => {
            if (!old || !Array.isArray(old)) return old;
            return old.map(updateSubActionInAction);
          });
        } else if (entity === 'byOpportunity' || entity === 'opportunity') {
          // Update opportunity-specific queries
          queryClient.setQueryData(query.queryKey, (old: any) => {
            if (!old || !old.data || !Array.isArray(old.data)) return old;
            return {
              ...old,
              data: old.data.map(updateSubActionInAction)
            };
          });
        }
      });

      return { previousQueryStates };
    },
    onError: (_err, _variables, context) => {
      // Rollback all modified queries on error
      if (context?.previousQueryStates) {
        context.previousQueryStates.forEach((data: any, queryKey: any) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Only refetch active queries to prevent issues when navigating away
      queryClient.invalidateQueries({ 
        queryKey: [{ scope: 'actions' }],
        refetchType: 'active'
      });
    },
  });

  // Wrapper functions for easier usage (maintaining backward compatibility)
  const fetchProposedActions = async (limit?: number, skip?: number, status?: string | string[]) => {
    setError(null);
    try {
      const data = await queryClient.ensureQueryData({
        queryKey: queryKeys.actions.proposed({ limit, skip, status }),
        queryFn: async () => {
          let url = "api/actions";
          const queryParams = new URLSearchParams();
          if (limit) queryParams.append("limit", String(limit));
          if (skip) queryParams.append("skip", String(skip));
          if (status) {
            if (Array.isArray(status)) {
              status.forEach(s => queryParams.append("status", s));
            } else {
              queryParams.append("status", status);
            }
          }
          if (queryParams.toString()) url += `?${queryParams.toString()}`;
          
          const { data, error: apiError } = await requestWithAuth(url, "GET", null);
          if (apiError) throw new Error(apiError);
          
          const responseData = (data as any)?.data || data;
          const actionsWithDates = Array.isArray(responseData)
            ? responseData.map((action: any) => ({
                ...action,
                createdAt: new Date(action.createdAt),
                updatedAt: action.updatedAt ? new Date(action.updatedAt) : undefined,
                sourceActivities:
                  action.sourceActivities?.map((sa: any) => ({
                    ...sa,
                    activityId:
                      typeof sa.activityId === "string"
                        ? {
                            _id: sa.activityId,
                            title: "Activity",
                            date: new Date(action.createdAt),
                            type: "activity",
                          }
                        : {
                            ...sa.activityId,
                            date: new Date(sa.activityId.date || action.createdAt),
                          },
                  })) || [],
              }))
            : [];
          return actionsWithDates;
        },
      });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load proposed actions";
      setError(errorMessage);
      return { success: false, error: errorMessage, data: [] };
    }
  };

  const fetchActionsByOpportunityId = async (opportunityId: string) => {
    setError(null);
    try {
      const result = await queryClient.ensureQueryData({
        queryKey: queryKeys.actions.byOpportunity(opportunityId),
        queryFn: async () => {
          const { data, error: apiError } = await requestWithAuth(
            `api/actions/opportunities/${opportunityId}`,
            "GET",
            null
          );
          if (apiError) throw new Error(apiError);
          
          const actionsData = (data as any)?.data || [];
          const opportunityData = (data as any)?.opportunity;
          const contactsData = (data as any)?.contacts || [];
          const count = (data as any)?.count || 0;
          
          const actionsWithDates = Array.isArray(actionsData)
            ? actionsData.map((action: any) => ({
                ...action,
                createdAt: new Date(action.createdAt),
                updatedAt: action.updatedAt ? new Date(action.updatedAt) : undefined,
                sourceActivities:
                  action.sourceActivities?.map((sa: any) => ({
                    ...sa,
                    activityId:
                      typeof sa.activityId === "string"
                        ? {
                            _id: sa.activityId,
                            title: "Activity",
                            date: new Date(action.createdAt),
                            type: "activity",
                          }
                        : {
                            ...sa.activityId,
                            date: new Date(sa.activityId.date || action.createdAt),
                          },
                  })) || [],
              }))
            : [];
            
          return {
            data: actionsWithDates,
            opportunity: opportunityData,
            contacts: contactsData,
            count,
          };
        },
      });

      return {
        success: true,
        data: result.data,
        opportunity: result.opportunity,
        contacts: result.contacts.map((contact: any) => ({
          ...contact,
          opportunity: contact.opportunityIntelligence?.find((o: any) => o.opportunity === opportunityId),
        })),
        count: result.count,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load actions for opportunity";
      setError(errorMessage);
      return { 
        success: false, 
        error: errorMessage, 
        data: [],
        opportunity: null,
        contacts: [],
        count: 0
      };
    }
  };

  const updateAction = async (actionId: string, updates: any) => {
    setError(null);
    try {
      const data = await updateActionMutation.mutateAsync({ actionId, updates });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update action";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updateSubAction = async (actionId: string, subActionId: string, updates: any) => {
    setError(null);
    try {
      const data = await updateSubActionMutation.mutateAsync({ actionId, subActionId, updates });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update sub-action";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const approveSubAction = async (actionId: string, subActionId: string) => {
    return updateSubAction(actionId, subActionId, { status: 'APPROVED' });
  };

  const rejectSubAction = async (actionId: string, subActionId: string) => {
    return updateSubAction(actionId, subActionId, { status: 'REJECTED' });
  };

  const updateAndApproveSubAction = async (actionId: string, subActionId: string, updates: any) => {
    // The updates object should already include the status, so don't override it
    return updateSubAction(actionId, subActionId, updates);
  };

  const approveAction = async (actionId: string, executeImmediately: boolean = false) => {
    setError(null);
    try {
      const data = await approveActionMutation.mutateAsync({ actionId, executeImmediately });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to approve action";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const rejectAction = async (actionId: string, reason?: string) => {
    setError(null);
    try {
      const data = await rejectActionMutation.mutateAsync({ actionId, reason });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reject action";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    // Query hooks for direct usage
    useProposedActionsQuery,
    useActionsByOpportunityQuery,
    
    // Mutation states
    isUpdatingAction: updateActionMutation.isPending,
    isUpdatingSubAction: updateSubActionMutation.isPending,
    isApprovingAction: approveActionMutation.isPending,
    isRejectingAction: rejectActionMutation.isPending,
    error,
    
    // Legacy wrapper functions (for backward compatibility)
    fetchProposedActions,
    fetchActionsByOpportunityId,
    
    // Actions
    updateAction,
    updateSubAction,
    approveSubAction,
    rejectSubAction,
    updateAndApproveSubAction,
    approveAction,
    rejectAction,
    clearError,
  };
} 