import { useState } from 'react';
import { Activity, Target, Zap, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { useActivityStats } from '@/hooks/useActivityStats';
import { ActivityTicker } from './activity-ticker';

interface ActivityFeedProps {
  className?: string;
}

export function ActivityFeed({ className }: ActivityFeedProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useActivityStats();

  return (
    <div className={className}>
      <ActivityTicker onClick={() => setOpen((v) => !v)} />

      {open && (
        <div className="px-3 pb-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs">Activity unavailable</span>
            </div>
          ) : (
            <div className="space-y-2">
              <StatRow
                icon={<Activity className="h-4 w-4 text-gray-600" />}
                label="Activities processed"
                value={data?.metrics.activitiesProcessedThisMonth ?? 0}
              />
              <StatRow
                icon={<Target className="h-4 w-4 text-gray-600" />}
                label="Opportunities managed"
                value={data?.metrics.opportunitiesManaged ?? 0}
              />
              <StatRow
                icon={<Zap className="h-4 w-4 text-gray-600" />}
                label="Next steps created"
                value={data?.metrics.nextStepsCreatedThisMonth ?? 0}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <AnimatedNumber value={value} className="text-xs font-semibold text-gray-900" />
    </div>
  );
}


