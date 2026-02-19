// TEMPLATE: Copy this file when creating new operations hooks
// Replace "Item" with your entity name (e.g., "Opportunity", "Task", "Contact")
// Replace "items" with your entity plural (e.g., "opportunities", "tasks", "contacts")
// NOTE: This is a TEMPLATE file - some imports may show linting errors until implemented

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { requestWithAuth } from "./requestWithAuth";
// import { queryKeys } from './queryKeys';

// 1. Define your interfaces
interface ItemFormData {
  name: string;
  description?: string;
  // Add your specific fields here
}

interface Item {
  _id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt?: Date;
  // Add your specific fields here
}

// 2. REQUIRED: Operations hook following TanStack Query patterns
export function useItemOperations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // 3. REQUIRED: Use useQuery for fetching data (single source of truth)
  const itemsQuery = useQuery({
    queryKey: ['items'], // Replace with: queryKeys.items.list(),
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/items", "GET", null);
      if (apiError) throw new Error(apiError);
      
      // CRITICAL: Process and return clean data structure
      const itemsData = Array.isArray(data) ? data : (data?.data || []);
      
      // Process any date fields or other transformations
      return itemsData.map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // 4. REQUIRED: Create mutation with PROPER optimistic updates
  const createMutation = useMutation({
    mutationFn: async (itemData: ItemFormData) => {
      const { data, error: apiError } = await requestWithAuth(
        "api/items",
        "POST",
        itemData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  // 5. REQUIRED: Update mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async ({ itemId, itemData }: { itemId: string; itemData: Partial<ItemFormData> }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/items/${itemId}`,
        "PUT",
        itemData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['items'] });
      await queryClient.cancelQueries({ queryKey: ['items', variables.itemId] });

      // Snapshot the previous values for rollback
      const previousItems = queryClient.getQueryData(['items']);
      const previousItem = queryClient.getQueryData(['items', variables.itemId]);

      // CRITICAL: Optimistically update cache - match your query structure exactly
      queryClient.setQueryData(['items'], (old: Item[]) => {
        if (!old || !Array.isArray(old)) return old; // Direct array check
        
        return old.map((item: Item) =>
          item._id === variables.itemId
            ? { ...item, ...variables.itemData }
            : item
        );
      });

      // Also update individual item cache if it exists
      queryClient.setQueryData(['items', variables.itemId], (old: Item) => {
        if (!old) return old;
        return { ...old, ...variables.itemData };
      });

      return { previousItems, previousItem }; // For rollback
    },
    onError: (_err, variables, context) => {
      // Rollback on failure - TanStack Query handles this automatically
      if (context?.previousItems) {
        queryClient.setQueryData(['items'], context.previousItems);
      }
      if (context?.previousItem) {
        queryClient.setQueryData(['items', variables.itemId], context.previousItem);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items', variables.itemId] });
    },
  });

  // 6. REQUIRED: Delete mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error: apiError } = await requestWithAuth(
        `api/items/${itemId}`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ['items'] });
      const previousItems = queryClient.getQueryData(['items']);

      // Optimistically remove from cache
      queryClient.setQueryData(['items'], (old: Item[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((item: Item) => item._id !== itemId);
      });

      return { previousItems };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(['items'], context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  // 7. Individual item query (optional, for detail pages)
  const fetchItemDetails = async (itemId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: apiError } = await queryClient.ensureQueryData({
        queryKey: ['items', itemId],
        queryFn: async () => requestWithAuth(`api/items/${itemId}`, "GET", null),
      });

      if (apiError) {
        throw new Error(apiError);
      }

      if (data && (data._id || (data.data && data.data._id))) {
        const itemData = data._id ? data : data.data;
        return { success: true, data: itemData };
      } else {
        return { success: false, error: "No item data found" };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load item details";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  // 8. REQUIRED: Wrapper functions for easier usage
  const createItem = async (itemData: ItemFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await createMutation.mutateAsync(itemData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create item";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const updateItem = async (itemId: string, itemData: Partial<ItemFormData>) => {
    setError(null);

    try {
      const data = await updateMutation.mutateAsync({ itemId, itemData });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update item";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteItem = async (itemId: string) => {
    setError(null);

    try {
      await deleteMutation.mutateAsync(itemId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete item";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  // 9. REQUIRED: Return pattern
  return {
    // Query data and states (single source of truth)
    items: itemsQuery.data || [],
    isLoadingItems: itemsQuery.isLoading,
    itemsError: itemsQuery.error,
    refetchItems: itemsQuery.refetch,
    
    // Mutation states
    isLoading,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    error,
    
    // Actions
    createItem,
    updateItem,
    deleteItem,
    fetchItemDetails,
    clearError,
  };
}

// 10. USAGE EXAMPLE: How to use this hook in components
/*
const MyComponent: React.FC = () => {
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  
  const { 
    items,
    isLoadingItems,
    itemsError,
    updateItem 
  } = useItemOperations();

  const handleUpdate = async (itemId: string, updates: Partial<ItemFormData>) => {
    setUpdatingItemId(itemId);
    try {
      // TanStack Query handles optimistic updates automatically
      const result = await updateItem(itemId, updates);
      if (!result.success) {
        console.error('Update failed:', result.error);
      }
    } catch (error) {
      console.error('Update error:', error);
    } finally {
      setUpdatingItemId(null);
    }
  };

  if (itemsError) {
    return <div>Error: {itemsError.message}</div>;
  }

  return (
    <div>
      {isLoadingItems ? (
        <div>Loading...</div>
      ) : (
        items.map(item => (
          <div 
            key={item._id}
            className={updatingItemId === item._id ? 'ring-2 ring-blue-200 bg-blue-50/30' : ''}
          >
            {item.name}
            {updatingItemId === item._id && <Loader2 className="animate-spin" />}
          </div>
        ))
      )}
    </div>
  );
};
*/
