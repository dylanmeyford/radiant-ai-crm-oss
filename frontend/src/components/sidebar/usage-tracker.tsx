import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useBillingOperations } from '@/hooks/useBillingOperations';

interface UsageTrackerProps {
  className?: string;
}

export function UsageTracker({ className }: UsageTrackerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { liveUsage, isLoadingLiveUsage, liveUsageError } = useBillingOperations();

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate progress percentage for each category
  const getProgressPercentage = (current: number, limit: number) => {
    if (limit <= 0) return 0;
    return Math.min((current / limit) * 100, 100);
  };

  // Loading state
  if (isLoadingLiveUsage) {
    return (
      <div className={`px-3 py-2 ${className}`}>
        <div className="flex-1">
          <Skeleton className="h-3 w-12 mb-1" />
          <Skeleton className="h-2 w-20" />
        </div>
      </div>
    );
  }

  // Error state
  if (liveUsageError) {
    return (
      <div className={`px-3 py-2 text-red-600 ${className}`}>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs">Usage unavailable</span>
        </div>
      </div>
    );
  }

  // No data state
  if (!liveUsage || !liveUsage.usage) {
    return (
      <div className={`px-3 py-2 text-gray-400 ${className}`}>
        <span className="text-xs">No usage data</span>
      </div>
    );
  }

  const { usage } = liveUsage;
  
  // Visual scale for progress bars (not a limit, just for visual reference)
  const visualScale = 500;
  const totalUsed = usage?.totalCost || 0;
  const totalProgress = getProgressPercentage(totalUsed, visualScale);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      {/* Total Usage Row (always visible, clickable) */}
      <CollapsibleTrigger asChild>
        <div className="px-3 py-2 w-full space-y-1 cursor-pointer hover:bg-gray-50 rounded-md">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600">This month</span>
            <span className="text-xs font-semibold text-gray-900">
              {formatCurrency(totalUsed)}
            </span>
          </div>
          <div className="rounded">
            <Progress value={totalProgress} className="h-1.5 bg-gray-200" />
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="px-3 pb-2">
        <div className="space-y-3 mt-2">
          {/* Processing */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Processing</span>
              <span className="text-xs font-semibold text-gray-900">
                {formatCurrency(usage.breakdown?.processing?.cost || 0)}
              </span>
            </div>
            <Progress 
              value={getProgressPercentage(usage.breakdown?.processing?.cost || 0, visualScale)} 
              className="h-1.5 bg-gray-200"
            />
          </div>

          {/* Research */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Research</span>
              <span className="text-xs font-semibold text-gray-900">
                {formatCurrency(usage.breakdown?.research?.cost || 0)}
              </span>
            </div>
            <Progress 
              value={getProgressPercentage(usage.breakdown?.research?.cost || 0, visualScale)} 
              className="h-1.5 bg-gray-200"
            />
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Actions</span>
              <span className="text-xs font-semibold text-gray-900">
                {formatCurrency(usage.breakdown?.actions?.cost || 0)}
              </span>
            </div>
            <Progress 
              value={getProgressPercentage(usage.breakdown?.actions?.cost || 0, visualScale)} 
              className="h-1.5 bg-gray-200"
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
