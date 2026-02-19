import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNylasConnections } from '@/hooks/useNylasConnections';

export function ExpiredGrantBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { connections, isLoading } = useNylasConnections();

  // Filter expired connections
  const expiredConnections = connections.filter(
    (conn) => conn.syncStatus === 'expired'
  );

  // Log when expired grants are detected
  useEffect(() => {
    if (expiredConnections.length > 0) {
      console.log('[GRANT-EXPIRED] Detected expired grants:', {
        count: expiredConnections.length,
        emails: expiredConnections.map(c => c.email),
        grantIds: expiredConnections.map(c => c.grantId),
      });
    }
  }, [expiredConnections]);

  // Don't show banner if no expired connections or on accounts page
  if (isLoading || expiredConnections.length === 0 || location.pathname === '/settings/accounts') {
    return null;
  }

  const handleReconnectClick = () => {
    navigate('/settings/accounts');
  };

  return (
    <div className="bg-orange-50 border-b border-orange-200">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900">
                {expiredConnections.length === 1
                  ? '1 email account needs reconnection'
                  : `${expiredConnections.length} email accounts need reconnection`}
              </p>
              <p className="text-xs text-orange-700 mt-0.5">
                {expiredConnections.length === 1
                  ? 'Your connection has expired and requires reauthorization to continue syncing.'
                  : 'Some connections have expired and require reauthorization to continue syncing.'}
              </p>
            </div>
          </div>
          <Button
            onClick={handleReconnectClick}
            size="sm"
            className="bg-orange-600 hover:bg-orange-700 text-white flex-shrink-0"
          >
            Reconnect Now
          </Button>
        </div>
      </div>
    </div>
  );
}

