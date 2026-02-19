import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Loader2, 
  AlertCircle, 
  Calendar,
  Activity
} from 'lucide-react';

interface ProcessingStatus {
  type: 'batch' | 'individual';
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'scheduled';
  processed?: number;
  total?: number;
  pending?: number;
  isScheduled?: boolean;
  isRunning?: boolean;
}

interface ProcessingStatusIndicatorProps {
  status: ProcessingStatus;
  isLoading?: boolean;
}

export const ProcessingStatusIndicator: React.FC<ProcessingStatusIndicatorProps> = ({ 
  status, 
  isLoading = false 
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  const getStatusConfig = () => {
    switch (status.status) {
      case 'idle':
        return {
          icon: CheckCircle2,
          text: 'Intelligence up to date',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'scheduled':
        return {
          icon: Calendar,
          text: 'Processing scheduled',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
      case 'pending':
        return {
          icon: Clock,
          text: status.type === 'batch' 
            ? `${status.total || 0} activities queued`
            : `${status.pending || 0} activities pending`,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200'
        };
      case 'processing':
        return {
          icon: Loader2,
          text: status.type === 'batch' 
            ? `Processed ${status.processed || 0} of ${status.total || 0}`
            : `Processed ${status.pending || 0} activities`,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
      case 'completed':
        return {
          icon: CheckCircle2,
          text: 'Processing completed',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'failed':
        return {
          icon: AlertCircle,
          text: 'Processing failed',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      default:
        return {
          icon: Activity,
          text: 'Status unknown',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        };
    }
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;
  const isSpinning = status.status === 'processing';

  // Show progress bar for batch processing
  const showProgress = status.type === 'batch' && 
    status.status === 'processing' && 
    status.total && 
    status.processed !== undefined;

  return (
    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border ${config.bgColor} ${config.borderColor}`}>
      <IconComponent 
        className={`h-3 w-3 ${config.color} ${isSpinning ? 'animate-spin' : ''}`} 
      />
      <span className={`text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
      
      {showProgress && (
        <div className="flex items-center gap-1 ml-1">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ 
                width: `${Math.round((status.processed! / status.total!) * 100)}%` 
              }}
            />
          </div>
          <span className={`text-xs ${config.color} ml-1`}>
            {Math.round((status.processed! / status.total!) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
};
