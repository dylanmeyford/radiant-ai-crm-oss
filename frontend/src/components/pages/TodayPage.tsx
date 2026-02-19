import { useEffect, useState } from 'react';
import { TodaySidebar } from '@/components/today/TodaySidebar';
import { ActionViewer } from '@/components/today/ActionViewer';
import { useIsMobile } from '@/hooks/use-mobile';
import { CheckCircle2 } from 'lucide-react';
import { usePageActions } from '@/context/PageActionsContext';
import { MinedDeal } from '@/types/minedDeal';

export default function TodayPage() {
  const [selectedAction, setSelectedAction] = useState<any>(null);
  const [selectedMinedDeal, setSelectedMinedDeal] = useState<MinedDeal | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const { setActions, clearActions } = usePageActions();

  const handleActionSelect = (action: any) => {
    setSelectedAction(action);
    // Clear mined deal selection when an action is selected
    setSelectedMinedDeal(null);
    // Close sidebar on mobile when action is selected
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleMinedDealSelect = (deal: MinedDeal) => {
    setSelectedMinedDeal(deal);
    // Clear action selection when a mined deal is selected
    setSelectedAction(null);
    // Close sidebar on mobile when deal is selected
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleActionClose = () => {
    setSelectedAction(null);
    setSelectedMinedDeal(null);
  };

  const handleActionSave = (updatedAction: any) => {
    // Update the selected action with the new data
    setSelectedAction(updatedAction);
  };

  const handleSubActionSelect = (subAction: any) => {
    setSelectedAction(subAction);
    // Clear mined deal selection when a sub-action is selected
    setSelectedMinedDeal(null);
    // Close sidebar on mobile when sub-action is selected
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Put the mobile toggle in the global header actions
  useEffect(() => {
    if (isMobile) {
      setActions([
        {
          id: 'toggle-today-sidebar',
          label: 'Today',
          icon: CheckCircle2,
          onClick: toggleSidebar,
          variant: 'ghost',
          size: 'icon',
        },
      ]);
    } else {
      clearActions();
    }

    return () => {
      clearActions();
    };
  }, [isMobile, setActions, clearActions]);

  // Generate a unique key for the ActionViewer
  const getViewerKey = () => {
    if (selectedMinedDeal) {
      return `mined-deal-${selectedMinedDeal._id}`;
    }
    if (selectedAction) {
      return `action-${selectedAction._id || selectedAction.id}-${selectedAction.isSubAction ? 'sub' : 'main'}-${selectedAction.isCalendarActivity ? 'calendar' : 'action'}`;
    }
    return 'no-selection';
  };

  return (
    <div className={`h-full overflow-hidden ${isMobile ? 'flex flex-col' : 'flex'}`}>
      {/* Sidebar */}
      <TodaySidebar 
        selectedAction={selectedAction}
        onActionSelect={handleActionSelect}
        selectedMinedDeal={selectedMinedDeal}
        onMinedDealSelect={handleMinedDealSelect}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      {/* Main Content */}
      <ActionViewer 
        key={getViewerKey()}
        action={selectedAction?.isCalendarActivity ? null : selectedAction}
        calendarActivity={selectedAction?.isCalendarActivity ? selectedAction.calendarActivity : null}
        minedDeal={selectedMinedDeal}
        onClose={handleActionClose}
        onSave={handleActionSave}
        onSubActionSelect={handleSubActionSelect}
      />
    </div>
  );
}