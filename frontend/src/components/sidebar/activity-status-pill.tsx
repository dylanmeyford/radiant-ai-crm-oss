import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Target, Zap, AlertCircle } from 'lucide-react';
import { useActivityStats } from '@/hooks/useActivityStats';
import { ActivityTicker } from './activity-ticker';

interface ActivityStatusPillProps {
  className?: string;
}

export function ActivityStatusPill({ className }: ActivityStatusPillProps) {
  const { data, isLoading, error } = useActivityStats();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={`rounded-md border border-gray-200 hover:border-gray-300 bg-white ${className ?? ''}`}>
          <ActivityTicker className="w-full" />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-64 p-3">
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
      </PopoverContent>
    </Popover>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <span className="text-xs font-semibold text-gray-900">{value.toLocaleString()}</span>
    </div>
  );
}


