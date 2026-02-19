# Dynamic Page Actions System

This system allows each page component to define its own action buttons that will appear in the sidebar header, providing a clean and context-aware interface.

## How it Works

1. **Context Provider**: The `PageActionsProvider` wraps the entire SidebarLayout and manages the global state of page actions.

2. **SidebarLayout**: Automatically displays action buttons from the current page context in the header area.

3. **Page Components**: Each page uses the `usePageActions` hook to define its specific action buttons.

## Usage in Page Components

```typescript
import { useEffect } from 'react';
import { usePageActions } from '@/context/PageActionsContext';
import { Plus, RefreshCw, Settings } from 'lucide-react';

export default function MyPage() {
  const { setActions, clearActions } = usePageActions();

  useEffect(() => {
    const handleAdd = () => {
      console.log('Add new item');
    };

    const handleRefresh = () => {
      console.log('Refresh data');
    };

    setActions([
      {
        id: 'add-item',
        label: 'Add Item',
        icon: Plus,
        onClick: handleAdd,
        variant: 'default'
      },
      {
        id: 'refresh',
        label: 'Refresh',
        icon: RefreshCw,
        onClick: handleRefresh,
        variant: 'outline',
        loading: isLoading // Dynamic loading state
      }
    ]);

    // Clean up when component unmounts
    return () => {
      clearActions();
    };
  }, [setActions, clearActions, isLoading]);

  return (
    <div>Your page content</div>
  );
}
```

## Action Properties

- **id**: Unique identifier for the action
- **label**: Button text (hidden for icon-only buttons)
- **icon**: Lucide icon component
- **onClick**: Click handler function
- **variant**: Button style ('default', 'outline', 'secondary', 'ghost', 'link', 'destructive')
- **size**: Button size ('default', 'sm', 'lg', 'icon')
- **disabled**: Boolean to disable the button
- **loading**: Boolean to show loading spinner

## Action Groups

For related actions, you can use action groups:

```typescript
setActionGroups([
  {
    id: 'view-options',
    label: 'View',
    actions: [
      { id: 'grid', label: 'Grid', icon: Grid, onClick: handleGrid },
      { id: 'list', label: 'List', icon: List, onClick: handleList }
    ]
  }
]);
```

## Examples

- **Dashboard**: Add Widget, Refresh, Calendar, Reports
- **Pipeline**: Add Opportunity, Refresh, Filter, Export, Settings
- **Contacts**: Add Contact, Import, Export, Search

## Benefits

1. **Context-Aware**: Each page shows only relevant actions
2. **Consistent UI**: All actions appear in the same location
3. **Flexible**: Supports various button styles and states
4. **Clean Code**: Actions are defined alongside the page logic
5. **Automatic Cleanup**: Actions are cleared when navigating away

This system provides a scalable way to add page-specific functionality while maintaining a consistent user interface.
