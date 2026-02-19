import React, { useState, useEffect } from 'react';
import { Pickaxe, Loader2, Mail, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { MinedDeal } from '@/types/minedDeal';

interface MinedDealsSectionProps {
  minedDeals: MinedDeal[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  selectedDeal: MinedDeal | null;
  onDealSelect: (deal: MinedDeal) => void;
  hasActions?: boolean; // If true, start collapsed
}

// Helper to format relative time
const formatRelativeTime = (date: Date | string): string => {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
};

export const MinedDealsSection: React.FC<MinedDealsSectionProps> = ({
  minedDeals,
  isLoading,
  isFetching,
  error,
  selectedDeal,
  onDealSelect,
  hasActions = false,
}) => {
  // Filter to only show PENDING deals (snoozed ones should be hidden until they wake up)
  const pendingDeals = minedDeals.filter((deal) => deal.status === 'PENDING');

  // Start collapsed if there are actions for today
  const [isCollapsed, setIsCollapsed] = useState(hasActions);

  // Update collapsed state when hasActions changes (e.g., after initial load)
  useEffect(() => {
    if (hasActions && pendingDeals.length > 0) {
      setIsCollapsed(true);
    }
  }, [hasActions]);

  // Expand when a deal is selected from this section
  useEffect(() => {
    if (selectedDeal && pendingDeals.some(d => d._id === selectedDeal._id)) {
      setIsCollapsed(false);
    }
  }, [selectedDeal?._id]);

  // Don't render section if no pending deals and not loading
  if (!isLoading && pendingDeals.length === 0) {
    return null;
  }

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={toggleCollapse}
        className="flex items-center gap-2 w-full text-left hover:bg-gray-50 rounded-md py-1 transition-colors"
      >
        {isFetching && !isLoading ? (
          <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
        ) : (
          <Pickaxe className="h-4 w-4 text-gray-500" />
        )}
        <h3 className="text-sm font-medium text-gray-900">
          Mined Deals
          {pendingDeals.length > 0 && (
            <span className="ml-1.5 text-xs text-gray-500">({pendingDeals.length})</span>
          )}
        </h3>
      </button>

      {error && !isCollapsed && (
        <div className="text-xs text-red-600 pl-6">
          Failed to load mined deals: {error.message}
        </div>
      )}

      {!isCollapsed && (
        <>
          {isLoading ? (
            <MinedDealsSkeleton />
          ) : (
            <div className="space-y-2">
              {pendingDeals.map((deal) => (
                <MinedDealCard
                  key={deal._id}
                  deal={deal}
                  isSelected={selectedDeal?._id === deal._id}
                  onSelect={() => onDealSelect(deal)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface MinedDealCardProps {
  deal: MinedDeal;
  isSelected: boolean;
  onSelect: () => void;
}

const MinedDealCard: React.FC<MinedDealCardProps> = ({ deal, isSelected, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      className={`text-xs p-2 rounded-md cursor-pointer transition-colors ${
        isSelected
          ? 'bg-gray-100 border border-gray-300'
          : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex-1 min-w-0">
        {/* Company name */}
        <div className="font-medium text-gray-900 leading-tight truncate">
          {deal.companyName}
        </div>
        
        {/* Evidence summary */}
        <div className="text-gray-500 mt-1 space-y-0.5">
          <div className="flex items-center gap-1">
            <Mail className="h-3 w-3" />
            <span>
              {deal.threadCount} thread{deal.threadCount !== 1 ? 's' : ''} · {deal.totalMessages} message{deal.totalMessages !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Last activity {formatRelativeTime(deal.lastActivityDate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const MinedDealsSkeleton: React.FC = () => {
  return (
    <div className="space-y-2 pl-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="p-2 space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
};
