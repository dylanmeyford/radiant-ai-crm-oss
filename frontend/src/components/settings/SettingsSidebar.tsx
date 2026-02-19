import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Mail,
  FileText,
  Settings,
  Users,
  Code,
  CreditCard
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface SettingsSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

// Settings navigation items
const settingsNavItems = [
  {
    id: 'accounts',
    label: 'Accounts',
    href: '/settings/accounts',
    icon: Mail,
    description: 'Connect and manage your email and calendar accounts'
  },
  {
    id: 'signature',
    label: 'Signature',
    href: '/settings/signature',
    icon: FileText,
    description: 'Customize your email signature'
  },
  {
    id: 'team',
    label: 'Team',
    href: '/settings/team',
    icon: Users,
    description: 'Manage team members and invitations'
  },
  {
    id: 'billing',
    label: 'Billing',
    href: '/settings/billing',
    icon: CreditCard,
    description: 'Manage subscription, payment methods, and view AI usage'
  },
  {
    id: 'developers',
    label: 'Developers',
    href: '/settings/developers',
    icon: Code,
    description: 'Manage API keys and view webhook documentation'
  }
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ 
  isOpen = false,
  onClose = () => {},
}) => {
  const isMobile = useIsMobile();
  const location = useLocation();

  // Create the sidebar content component
  const SidebarContent = () => (
    <div className="bg-white flex flex-col h-full">
      {/* Header */}
      <div className={`border-b border-gray-200 ${isMobile ? 'p-3' : 'p-4'}`}>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-gray-600" />
          <h2 className="text-sm font-medium text-gray-900">Settings</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">Configure your account and preferences</p>
      </div>

      {/* Navigation */}
      <div className={`space-y-2 overflow-y-auto flex-1 ${isMobile ? 'p-3' : 'p-4'}`}>
        {settingsNavItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.id}
              to={item.href}
              onClick={isMobile ? onClose : undefined}
              className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
                isActive 
                  ? 'bg-gray-900 text-white' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <IconComponent className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-900'}`}>
                  {item.label}
                </div>
                <div className={`text-xs mt-1 ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                  {item.description}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );

  // Mobile: render in a Sheet
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="left" className="p-0 w-80">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: render normally
  return (
    <div className="w-80 border-r border-gray-200 h-full">
      <SidebarContent />
    </div>
  );
};
