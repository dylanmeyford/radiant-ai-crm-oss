# Optimistic UI Patterns - Development Standards

> **⚠️ DEPRECATED**: This file has been moved to workspace rules. 
> 
> **Use the official patterns**: [optimistic-patterns.mdc](mdc:.cursor/rules/optimistic-patterns.mdc)
> 
> **Template for new hooks**: [useOperationsTemplate.ts](mdc:src/hooks/useOperationsTemplate.ts)
> 
> **Working example**: [OptimisticPatternExample.tsx](mdc:src/components/examples/OptimisticPatternExample.tsx)

## Overview
All user interactions in our application should follow optimistic UI patterns for enterprise-grade user experience. This means the UI responds instantly to user actions, with graceful fallback and error handling.

## Core Principles

### 1. Instant Feedback
- UI updates immediately when user performs an action
- No waiting for server responses for basic interactions
- Visual loading states show progress without blocking interaction

### 2. Graceful Degradation
- Failed operations rollback gracefully
- Clear error messaging when things go wrong
- Offline operations queue and sync when online

### 3. Contextual Loading States
- Loading indicators appear on the specific item being updated
- Subtle, elegant visual feedback (rings, spinners, background tints)
- Non-intrusive - don't block other interactions

## Standard Implementation Pattern

### For Mutations (Create, Update, Delete)

```typescript
const [optimisticState, setOptimisticState] = useState(initialData);
const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

const handleUpdate = async (itemId: string, updates: UpdateData) => {
  // 1. Store previous state for rollback
  const previousState = [...optimisticState];
  
  // 2. Set loading state for specific item
  setUpdatingItemId(itemId);
  
  // 3. Apply optimistic update immediately
  const newState = optimisticState.map(item => 
    item.id === itemId ? { ...item, ...updates } : item
  );
  setOptimisticState(newState);
  
  try {
    // 4. Make API call
    const result = await updateItemMutation(itemId, updates);
    
    if (!result.success) {
      // 5. Rollback on API failure
      setOptimisticState(previousState);
      console.error('Update failed:', result.error);
    }
  } catch (error) {
    // 6. Rollback on network/other errors
    setOptimisticState(previousState);
    console.error('Update error:', error);
  } finally {
    // 7. Always clear loading state
    setUpdatingItemId(null);
  }
};
```

### Visual Loading States

```typescript
// In your component JSX
<div className={`
  transition-all duration-200 
  ${isUpdating ? 'ring-2 ring-blue-200 bg-blue-50/30' : ''}
`}>
  <div className="flex items-center gap-2">
    <span>{item.name}</span>
    {isUpdating && (
      <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
    )}
  </div>
</div>
```

## Required Hook Patterns

### All Mutation Hooks Should Include:
1. **Optimistic state management**
2. **Individual item loading tracking**
3. **Automatic rollback on failure**
4. **TanStack Query integration**
5. **Offline queueing support**

### Example Hook Structure:
```typescript
export function useItemOperations() {
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  
  const updateMutation = useMutation({
    mutationFn: updateItemApi,
    onMutate: async (variables) => {
      // Cancel outgoing refetches & snapshot previous value
      await queryClient.cancelQueries({ queryKey: queryKeys.items.list() });
      const previousItems = queryClient.getQueryData(queryKeys.items.list());
      
      // Optimistically update cache
      queryClient.setQueryData(queryKeys.items.list(), (old: Item[]) =>
        old?.map(item => 
          item.id === variables.id ? { ...item, ...variables.updates } : item
        )
      );
      
      return { previousItems };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData(queryKeys.items.list(), context.previousItems);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.items.list() });
    },
  });
  
  return {
    updateItem: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    // ... other operations
  };
}
```

## UI Component Standards

### Loading States
- Use `Loader2` icon with `animate-spin`
- Blue color scheme: `text-blue-500`
- Ring borders: `ring-2 ring-blue-200`
- Background tints: `bg-blue-50/30`
- Smooth transitions: `transition-all duration-200`

### Error States
- Red color scheme for errors
- Toast notifications for critical failures
- Inline error messages for form validation
- Automatic retry for network errors

### Success States
- Green accents for confirmed operations
- Subtle success indicators (checkmarks, green borders)
- Auto-hide after confirmation

## Implementation Checklist

For every new component with user interactions:

- [ ] Implements optimistic updates
- [ ] Shows contextual loading states
- [ ] Handles rollback scenarios
- [ ] Integrates with TanStack Query
- [ ] Supports offline operations
- [ ] Has proper error boundaries
- [ ] Uses consistent visual patterns
- [ ] Includes accessibility features

## Examples in Codebase

- **Pipeline Page**: Drag & drop with per-card loading states
- **Offline Indicator**: Real-time connection status
- **Query Client**: Configured for optimal retry and persistence

## Benefits

1. **Perceived Performance**: App feels instant and responsive
2. **Enterprise Grade**: Professional user experience
3. **Offline Support**: Works seamlessly without connection
4. **Error Resilience**: Graceful handling of failures
5. **User Confidence**: Clear feedback builds trust

## Next Steps

- Update all existing hooks to follow these patterns
- Create reusable optimistic mutation utilities
- Add visual loading components to UI library
- Document component-specific patterns as they emerge
