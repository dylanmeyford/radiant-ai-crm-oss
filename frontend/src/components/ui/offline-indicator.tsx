import { WifiOff, Wifi, Clock } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useIsMutating } from '@tanstack/react-query';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const mutatingCount = useIsMutating();

  if (isOnline && mutatingCount === 0) {
    return null; // Don't show anything when online and no pending operations
  }

  const getIndicatorContent = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="h-4 w-4" />,
        text: 'Offline',
        bgColor: 'bg-red-500',
        description: 'Changes will sync when connection is restored'
      };
    }

    if (mutatingCount > 0) {
      return {
        icon: <Clock className="h-4 w-4 animate-spin" />,
        text: 'Syncing',
        bgColor: 'bg-blue-500',
        description: `${mutatingCount} operation${mutatingCount > 1 ? 's' : ''} in progress`
      };
    }

    return {
      icon: <Wifi className="h-4 w-4" />,
      text: 'Online',
      bgColor: 'bg-green-500',
      description: 'All changes synced'
    };
  };

  const { icon, text, bgColor, description } = getIndicatorContent();

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div 
        className={`${bgColor} text-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-all duration-300`}
        title={description}
      >
        {icon}
        <span className="text-sm font-medium">{text}</span>
      </div>
    </div>
  );
}
