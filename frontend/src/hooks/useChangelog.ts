import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChangelogEntry, ChangelogData } from '@/types/changelog.types';

const STORAGE_KEY = 'changelog_dismissed_ids';

// Helper functions for localStorage
const getDismissedIds = (): string[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setDismissedIds = (ids: string[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Silently fail if localStorage is not available
  }
};

const addDismissedId = (id: string): void => {
  const currentIds = getDismissedIds();
  if (!currentIds.includes(id)) {
    setDismissedIds([...currentIds, id]);
  }
};

const markAllAsDismissed = (allIds: string[]): void => {
  setDismissedIds(allIds);
};

export function useChangelog() {
  const queryClient = useQueryClient();

  // Fetch changelog data
  const changelogQuery = useQuery({
    queryKey: ['changelog'],
    queryFn: async (): Promise<ChangelogEntry[]> => {
      const response = await fetch('/changelog.json');
      if (!response.ok) {
        throw new Error('Failed to fetch changelog');
      }
      const data: ChangelogData = await response.json();
      return data.notifications;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (id?: string) => {
      const entries = changelogQuery.data || [];
      const dismissedIds = getDismissedIds();
      
      if (id) {
        // Mark specific entry as read
        if (!dismissedIds.includes(id)) {
          addDismissedId(id);
        }
      } else {
        // Mark all entries as read
        const allIds = entries.map(entry => entry.id);
        markAllAsDismissed(allIds);
      }
      
      // Invalidate query to trigger recalculation
      queryClient.invalidateQueries({ queryKey: ['changelog'] });
    },
  });

  // Calculate unread count
  const dismissedIds = getDismissedIds();
  const entries = changelogQuery.data || [];
  const unreadCount = entries.filter(entry => !dismissedIds.includes(entry.id)).length;

  // Sort entries by date (newest first)
  const sortedEntries = [...entries].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    entries: sortedEntries,
    unreadCount,
    isLoading: changelogQuery.isLoading,
    error: changelogQuery.error,
    markAsRead: markAsReadMutation.mutate,
    refetch: changelogQuery.refetch,
  };
}
