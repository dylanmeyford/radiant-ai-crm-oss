import { useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

export default function SettingsPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  // If we're on the base /settings route, redirect to /settings/accounts
  if (location.pathname === '/settings') {
    return <Navigate to="/settings/accounts" replace />;
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile sidebar trigger */}
      {isMobile && (
        <div className="fixed top-16 left-4 z-40">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSidebarOpen(true)}
            className="bg-white shadow-sm"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Sidebar */}
      <SettingsSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
