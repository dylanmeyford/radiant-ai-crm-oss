import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface OptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onOptimisticUpdate?: (variables: TVariables, queryClient: any) => void;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  onRollback?: (variables: TVariables) => void;
  queryKeys?: any[][];
  // Helper for common patterns
  optimisticUpdateFn?: (variables: TVariables) => { queryKey: any[]; updater: (old: any) => any };
}

export function useOptimisticMutation<TData, TVariables>({
  mutationFn,
  onOptimisticUpdate,
  onSuccess,
  onError,
  onRollback,
  queryKeys = [],
  optimisticUpdateFn
}: OptimisticMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();
  const [isOptimistic, setIsOptimistic] = useState(false);
  const [optimisticItemId, setOptimisticItemId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn,
    onMutate: async (variables) => {
      setIsOptimistic(true);
      
      // Extract item ID if available for tracking
      const itemId = (variables as any)?.id || (variables as any)?.itemId || null;
      setOptimisticItemId(itemId);
      
      // Cancel any outgoing refetches for relevant queries
      const allQueryKeys = [...queryKeys];
      if (optimisticUpdateFn) {
        const { queryKey } = optimisticUpdateFn(variables);
        allQueryKeys.push(queryKey);
      }
      
      if (allQueryKeys.length > 0) {
        await Promise.all(allQueryKeys.map(key => 
          queryClient.cancelQueries({ queryKey: key })
        ));
      }

      // Snapshot the previous values
      const previousData = allQueryKeys.map(key => ({
        key,
        data: queryClient.getQueryData(key)
      }));

      // Perform optimistic update using helper function if provided
      if (optimisticUpdateFn) {
        const { queryKey, updater } = optimisticUpdateFn(variables);
        queryClient.setQueryData(queryKey, updater);
      }

      // Perform custom optimistic update
      onOptimisticUpdate?.(variables, queryClient);

      // Return context object with the snapshotted value
      return { previousData, itemId };
    },
    onError: (error, variables, context) => {
      setIsOptimistic(false);
      setOptimisticItemId(null);
      
      // Rollback to previous values
      if (context?.previousData) {
        context.previousData.forEach(({ key, data }) => {
          queryClient.setQueryData(key, data);
        });
      }

      // Call custom rollback
      onRollback?.(variables);
      onError?.(error as Error, variables);
      
      // Log error for debugging
      console.warn('Optimistic mutation failed, rolled back:', error);
    },
    onSuccess: (data, variables) => {
      setIsOptimistic(false);
      setOptimisticItemId(null);
      onSuccess?.(data, variables);
    },
    onSettled: (_, __, variables) => {
      setIsOptimistic(false);
      setOptimisticItemId(null);
      
      // Refetch queries to ensure consistency
      const allQueryKeys = [...queryKeys];
      if (optimisticUpdateFn) {
        const { queryKey } = optimisticUpdateFn(variables);
        allQueryKeys.push(queryKey);
      }
      
      if (allQueryKeys.length > 0) {
        allQueryKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    },
  });

  return {
    ...mutation,
    isOptimistic,
    optimisticItemId,
    mutateOptimistically: mutation.mutate,
    mutateOptimisticallyAsync: mutation.mutateAsync,
  };
}

// Helper function for common list update patterns
export function createListUpdater<T>(
  itemId: string | number, 
  updates: Partial<T>
) {
  return (oldList: T[] | undefined): T[] => {
    if (!oldList) return [];
    return oldList.map(item => 
      (item as any).id === itemId || (item as any)._id === itemId
        ? { ...item, ...updates }
        : item
    );
  };
}

// Helper function for moving items between lists (like pipeline stages)
export function createMoveUpdater<T>(
  itemId: string,
  fromList: string,
  toList: string,
  itemUpdates?: Partial<T>
) {
  return {
    queryKey: ['lists'], // Should be customized per use case
    updater: (oldData: Record<string, T[]> | undefined) => {
      if (!oldData) return {};
      
      const newData = { ...oldData };
      const item = newData[fromList]?.find((item: any) => item.id === itemId || item._id === itemId);
      
      if (item) {
        // Remove from source list
        newData[fromList] = newData[fromList].filter((item: any) => 
          item.id !== itemId && item._id !== itemId
        );
        
        // Add to destination list with updates
        const updatedItem = itemUpdates ? { ...item, ...itemUpdates } : item;
        newData[toList] = [...(newData[toList] || []), updatedItem];
      }
      
      return newData;
    }
  };
}
