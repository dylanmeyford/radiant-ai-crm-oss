import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { PageAction, PageActionGroup } from '@/types/pageActions';

interface PageActionsContextType {
  actions: PageAction[];
  actionGroups: PageActionGroup[];
  setActions: (actions: PageAction[]) => void;
  setActionGroups: (groups: PageActionGroup[]) => void;
  clearActions: () => void;
}

const PageActionsContext = createContext<PageActionsContextType | undefined>(undefined);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<PageAction[]>([]);
  const [actionGroups, setActionGroups] = useState<PageActionGroup[]>([]);

  const clearActions = useCallback(() => {
    setActions([]);
    setActionGroups([]);
  }, []);

  const memoizedSetActions = useCallback((newActions: PageAction[]) => {
    console.log('Context: Setting actions', newActions.map(a => a.id));
    setActions(newActions);
  }, []);

  const memoizedSetActionGroups = useCallback((newGroups: PageActionGroup[]) => {
    setActionGroups(newGroups);
  }, []);

  return (
    <PageActionsContext.Provider
      value={{
        actions,
        actionGroups,
        setActions: memoizedSetActions,
        setActionGroups: memoizedSetActionGroups,
        clearActions,
      }}
    >
      {children}
    </PageActionsContext.Provider>
  );
}

export function usePageActions() {
  const context = useContext(PageActionsContext);
  if (context === undefined) {
    throw new Error('usePageActions must be used within a PageActionsProvider');
  }
  return context;
}
