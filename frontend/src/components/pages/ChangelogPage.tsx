import React from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useChangelog } from '@/hooks/useChangelog';
import { ChangelogEntry } from '@/types/changelog.types';

const ChangelogEntryCard: React.FC<{ entry: ChangelogEntry }> = ({ entry }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'feature':
        return 'text-green-600 bg-green-50';
      case 'bugfix':
        return 'text-orange-600 bg-orange-50';
      case 'improvement':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-medium text-gray-900">{entry.title}</h3>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getTypeColor(entry.type)}`}>
                {entry.type}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-2">{entry.description}</p>
            <p className="text-xs text-gray-500">{formatDate(entry.date)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChangelogSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[...Array(3)].map((_, i) => (
      <div key={i} className="bg-white rounded-lg border border-gray-200">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    ))}
  </div>
);

export default function ChangelogPage() {
  const { entries, unreadCount, isLoading, error, markAsRead } = useChangelog();

  const handleMarkAllAsRead = () => {
    markAsRead(undefined);
  };

  if (error) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 text-center">
              <p className="text-sm text-red-600">Failed to load changelog</p>
              <p className="text-xs text-gray-500 mt-1">Please try refreshing the page</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-5 w-5 text-gray-600" />
            <h1 className="text-xl font-semibold text-gray-900">Changelog</h1>
          </div>
          <p className="text-sm text-gray-500">
            Stay updated with the latest features, improvements, and bug fixes
          </p>
          
          {unreadCount > 0 && (
            <div className="mt-4">
              <Button
                onClick={handleMarkAllAsRead}
                size="sm"
                className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
              >
                <Check className="h-3 w-3 mr-1" />
                Mark all as read
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <ChangelogSkeleton />
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 text-center">
              <p className="text-sm text-gray-600">No changelog entries available</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl">
            {entries.map((entry) => (
              <ChangelogEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
