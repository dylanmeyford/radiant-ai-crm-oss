import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { queryClient } from '../../lib/queryClient';

export function QueryProvider({ children }: PropsWithChildren) {
  const persister = typeof window !== 'undefined'
    ? createSyncStoragePersister({ storage: window.localStorage })
    : undefined;

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        // Ensure auth data is persisted for offline access
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Always persist auth queries for offline access
            const firstKey = query.queryKey[0];
            if (typeof firstKey === 'object' && firstKey && 'scope' in firstKey && firstKey.scope === 'auth') {
              return true;
            }
            // Persist other queries based on success and staleness
            return query.state.status === 'success';
          },
        },
      }}
      onSuccess={() => {
        // Resume paused mutations and refetch data when persistence is restored
        queryClient
          .resumePausedMutations()
          .then(() => {
            // Only invalidate queries if we're online
            if (navigator.onLine) {
              queryClient.invalidateQueries();
            }
          })
          .catch((error) => {
            console.warn('Error resuming mutations after persistence restore:', error);
          });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export default QueryProvider;


