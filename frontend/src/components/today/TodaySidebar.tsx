import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  Calendar,
  CheckSquare,
  MessageSquare,
  Search,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ArrowUpDown
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent } from '@/components/ui/sheet';

import { useActionOperations } from '@/hooks/useActionOperations';
import { useCalendarOperations } from '@/hooks/useCalendarOperations';
import { useMinedDealOperations } from '@/hooks/useMinedDealOperations';
import { usePipelines } from '@/hooks/usePipelines';
import { Meeting } from '@/types/dashboard';
import { MinedDeal } from '@/types/minedDeal';
import { MinedDealsSection } from './MinedDealsSection';

interface TodaySidebarProps {
  isLoading?: boolean;
  selectedAction?: any;
  onActionSelect?: (action: any) => void;
  selectedMinedDeal?: MinedDeal | null;
  onMinedDealSelect?: (deal: MinedDeal) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

// Helper function to get icon for action type
const getActionIcon = (type: string) => {
  switch (type) {
    case 'EMAIL':
      return <Mail className="h-3 w-3" />;
    case 'CALL':
      return <Phone className="h-3 w-3" />;
    case 'MEETING':
      return <Calendar className="h-3 w-3" />;
    case 'TASK':
      return <CheckSquare className="h-3 w-3" />;
    case 'LINKEDIN MESSAGE':
      return <MessageSquare className="h-3 w-3" />;
    case 'LOOKUP':
      return <Search className="h-3 w-3" />;
    case 'UPDATE_PIPELINE_STAGE':
      return <ArrowUpDown className="h-3 w-3" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
};

export const TodaySidebar: React.FC<TodaySidebarProps> = ({ 
  isLoading = false,
  selectedAction,
  onActionSelect,
  selectedMinedDeal,
  onMinedDealSelect,
  isOpen = false,
  onClose = () => {},
}) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { useProposedActionsQuery } = useActionOperations();
  const { minedDeals, isLoadingDeals, isFetchingDeals, dealsError } = useMinedDealOperations();
  const { defaultPipeline } = usePipelines();
  const [ownerScope, setOwnerScope] = useState<'me' | 'all'>('me');
  
  // Handler to navigate to opportunity detail page
  const handleOpportunityClick = (opportunityId: string) => {
    const pipelineId = defaultPipeline?._id || 'default';
    navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`, {
      state: { from: 'today' }
    });
    if (isMobile) {
      onClose();
    }
  };
  
  // State for selected day navigation
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Dynamic date range that expands as user navigates
  // Initialize with current week (Sun-Sat)
  const [fetchedRange, setFetchedRange] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day; // go back to Sunday
    const start = new Date(d.getFullYear(), d.getMonth(), diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(0, 0, 0, 0);
    return { start, end };
  });

  // Helper to expand range if needed (returns new range or null if no change needed)
  const expandRangeIfNeeded = (targetDate: Date): { start: Date; end: Date } | null => {
    const targetStart = new Date(targetDate);
    targetStart.setHours(0, 0, 0, 0);
    const targetEnd = new Date(targetStart);
    targetEnd.setDate(targetEnd.getDate() + 1);
    
    let newStart = fetchedRange.start;
    let newEnd = fetchedRange.end;
    let needsUpdate = false;
    
    // If navigating before current range, expand backwards by 1 week
    if (targetStart < fetchedRange.start) {
      newStart = new Date(fetchedRange.start);
      newStart.setDate(newStart.getDate() - 7);
      needsUpdate = true;
    }
    
    // If navigating after current range, expand forwards by 1 week
    if (targetEnd > fetchedRange.end) {
      newEnd = new Date(fetchedRange.end);
      newEnd.setDate(newEnd.getDate() + 7);
      needsUpdate = true;
    }
    
    return needsUpdate ? { start: newStart, end: newEnd } : null;
  };

  const { meetings, isLoadingMeetings, isFetchingMeetings, meetingsError } = useCalendarOperations({
    startDate: fetchedRange.start.toISOString(),
    endDate: fetchedRange.end.toISOString(),
  });
  
  // Prefetch when within 3 days of the boundary (e.g., Wednesday of a week)
  useEffect(() => {
    const selectedStart = new Date(selectedDate);
    selectedStart.setHours(0, 0, 0, 0);
    
    // Calculate days from each boundary
    const daysFromStart = Math.floor((selectedStart.getTime() - fetchedRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const daysFromEnd = Math.floor((fetchedRange.end.getTime() - selectedStart.getTime()) / (1000 * 60 * 60 * 24));
    
    const PREFETCH_THRESHOLD = 3; // Prefetch when within 3 days of boundary
    
    let newStart = fetchedRange.start;
    let newEnd = fetchedRange.end;
    let needsUpdate = false;
    
    // If within 3 days of start boundary, expand backwards
    if (daysFromStart <= PREFETCH_THRESHOLD) {
      newStart = new Date(fetchedRange.start);
      newStart.setDate(newStart.getDate() - 7);
      needsUpdate = true;
    }
    
    // If within 3 days of end boundary, expand forwards
    if (daysFromEnd <= PREFETCH_THRESHOLD) {
      newEnd = new Date(fetchedRange.end);
      newEnd.setDate(newEnd.getDate() + 7);
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      setFetchedRange({ start: newStart, end: newEnd });
    }
  }, [selectedDate, fetchedRange.start, fetchedRange.end]);
  
  // Helper functions for day navigation
  const goToPreviousDay = () => {
    const previousDay = new Date(selectedDate);
    previousDay.setDate(previousDay.getDate() - 1);
    
    // Check if we need to expand the fetched range
    const newRange = expandRangeIfNeeded(previousDay);
    if (newRange) {
      setFetchedRange(newRange);
    }
    
    setSelectedDate(previousDay);
  };
  
  const goToNextDay = () => {
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // Check if we need to expand the fetched range
    const newRange = expandRangeIfNeeded(nextDay);
    if (newRange) {
      setFetchedRange(newRange);
    }
    
    setSelectedDate(nextDay);
  };
  
  // Helper function to get day label
  const getDayLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Reset time for comparison
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    yesterday.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    
    if (dateOnly.getTime() === today.getTime()) {
      return "Today's Meetings";
    } else if (dateOnly.getTime() === yesterday.getTime()) {
      return "Yesterday's Meetings";
    } else if (dateOnly.getTime() === tomorrow.getTime()) {
      return "Tomorrow's Meetings";
    } else {
      return `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} Meetings`;
    }
  };
  
  // Fetch only actionable actions (PROPOSED and PROCESSING UPDATES)
  const { data: actions = [], isLoading: actionsLoading, isFetching: actionsFetching, error: actionsError } = useProposedActionsQuery({
    status: ['PROPOSED', 'PROCESSING UPDATES'],
    owner: ownerScope === 'me' ? 'me' : undefined,
  });
  
  // Filter meetings for selected day
  const selectedDayMeetings = useMemo(() => {
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0); // Start of selected day
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1); // Start of next day
    
    return meetings.filter((meeting: Meeting) => {
      if (!meeting.date) return false;
      const meetingDate = new Date(meeting.date);
      return meetingDate >= startOfDay && meetingDate < endOfDay;
    });
  }, [meetings, selectedDate]);

  // Group actions by opportunity (filtering is now handled by the backend)
  const groupedActions = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    
    // Additional frontend filtering for optimistic updates
    // Backend already filters to PROPOSED and PROCESSING UPDATES, but we need this for optimistic UI
    // When an action is approved/updated/cancelled via optimistic update, it should disappear immediately
    const completedStatuses = ['APPROVED', 'UPDATED', 'CANCELLED', 'EXECUTED', 'REJECTED'];
    const pendingActions = actions.filter((action: any) => {
      const isCompleted = completedStatuses.includes(action.status);
      return !isCompleted;
    });
    
    pendingActions.forEach((action: any) => {
      // Handle both populated and non-populated opportunity objects
      const opportunityId = typeof action.opportunity === 'object' 
        ? action.opportunity._id 
        : action.opportunity;
      
      if (!groups[opportunityId]) {
        groups[opportunityId] = [];
      }
      groups[opportunityId].push(action);
    });
    
    return groups;
  }, [actions]);


  // Create the sidebar content component
  const SidebarContent = () => (
    <div className="bg-white flex flex-col h-full">
      {/* Content */}
      <div className={`space-y-4 overflow-y-auto flex-1 ${isMobile ? 'p-3' : 'p-4'}`}>
        {/* Day's Meetings Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isFetchingMeetings && !isLoadingMeetings ? (
                <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4 text-gray-600" />
              )}
              <h3 className="text-sm font-medium text-gray-900">{getDayLabel(selectedDate)}</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={goToPreviousDay}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                title="Previous day"
              >
                <ArrowLeft className="h-3 w-3 text-gray-600" />
              </button>
              <button
                onClick={goToNextDay}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                title="Next day"
              >
                <ArrowRight className="h-3 w-3 text-gray-600" />
              </button>
            </div>
          </div>
          
          {meetingsError && (
            <div className="text-xs text-red-600 pl-6">
              Failed to load meetings: {meetingsError.message}
            </div>
          )}
          
          {selectedDayMeetings.length === 0 && !meetingsError ? (
            <div className="text-xs text-gray-500 pl-6">
              No meetings scheduled for this day
            </div>
          ) : (
            <div className="space-y-2">
              {selectedDayMeetings.map((meeting: Meeting) => {
                // Check if meeting has already occurred
                const meetingDate = meeting.date ? new Date(meeting.date) : null;
                const isPastMeeting = meetingDate ? meetingDate < new Date() : false;
                
                return (
                  <div 
                    key={meeting.id} 
                    className={`text-xs p-2 rounded-md hover:bg-gray-50 cursor-pointer transition-opacity ${
                      isPastMeeting ? 'opacity-50' : ''
                    }`}
                    onClick={() => onActionSelect?.({ calendarActivity: meeting, isCalendarActivity: true })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 leading-tight break-words">{meeting.title}</div>
                      <div className="text-gray-500 mt-1 space-y-0.5">
                        <div>{meeting.time}</div>
                        {meeting.prospect && (
                          <div className="truncate text-xs">{meeting.prospect}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Mined Deals Section */}
        <MinedDealsSection
          minedDeals={minedDeals}
          isLoading={isLoadingDeals}
          isFetching={isFetchingDeals}
          error={dealsError}
          selectedDeal={selectedMinedDeal || null}
          onDealSelect={(deal) => {
            onMinedDealSelect?.(deal);
            if (isMobile) {
              onClose();
            }
          }}
          hasActions={Object.keys(groupedActions).length > 0}
        />

        {minedDeals.filter(d => d.status === 'PENDING').length > 0 && (
          <Separator className="my-4" />
        )}

        {/* Proposed Actions Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {actionsFetching && !actionsLoading ? (
              <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-gray-600" />
            )}
            <h3 className="text-sm font-medium text-gray-900">Proposed Actions</h3>
            <div className="ml-auto flex items-center gap-1 text-xs">
              <button
                onClick={() => setOwnerScope('all')}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  ownerScope === 'all' 
                    ? 'text-gray-900 font-medium' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                All
              </button>
              <span className="text-gray-300">/</span>
              <button
                onClick={() => setOwnerScope('me')}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  ownerScope === 'me' 
                    ? 'text-gray-900 font-medium' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Mine
              </button>
            </div>
          </div>

          {actionsError && (
            <div className="text-xs text-red-600 pl-6">
              Failed to load actions: {actionsError.message}
            </div>
          )}

          {Object.keys(groupedActions).length === 0 && !actionsError ? (
            <div className="text-xs text-gray-500 pl-6">
              No proposed actions available
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedActions).map(([opportunityId, opportunityActions]) => (
                <div key={opportunityId} className="space-y-2">
                  {/* Opportunity Header */}
                  <div 
                    className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900 hover:bg-gray-50 rounded-md p-1 -ml-1 transition-colors"
                    onClick={() => handleOpportunityClick(opportunityId)}
                  >
                    <ChevronDown className="h-3 w-3" />
                    {typeof opportunityActions[0].opportunity === 'object' 
                      ? opportunityActions[0].opportunity.prospect?.name || opportunityActions[0].opportunity.name || 'Unknown Opportunity'
                      : 'Loading...'
                    }
                  </div>

                  {/* Actions for this opportunity */}
                  <div className="space-y-2 pl-4">
                    {opportunityActions.map((action: any) => (
                      <div key={action._id} className="space-y-1">
                        {/* Main Action */}
                        <div 
                          className={`flex items-center gap-2 text-xs p-2 rounded-md cursor-pointer transition-colors ${
                            selectedAction?._id === action._id 
                              ? 'bg-blue-50 border border-blue-200' 
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => onActionSelect?.(action)}
                        >
                          {getActionIcon(action.type)}
                          <span className="flex-1 truncate">{action.type}</span>
                        </div>

                        {/* Sub-actions if they exist - filter out completed ones */}
                        {action.subActions && action.subActions.length > 0 && (
                          <div className="space-y-1 pl-4 border-l border-gray-200">
                            {action.subActions
                              .filter((subAction: any) => {
                                // Filter out completed sub-actions - only show ones that need user attention
                                // Since we're only fetching actionable parent actions, we still need to filter sub-actions
                                const completedSubActionStatuses = ['APPROVED', 'UPDATED', 'CANCELLED', 'REJECTED'];
                                const isCompleted = completedSubActionStatuses.includes(subAction.status);
                                return !isCompleted;
                              })
                              .map((subAction: any) => (
                              <div 
                                key={subAction.id} 
                                className={`flex items-center gap-2 text-xs text-gray-600 p-2 rounded-md cursor-pointer transition-colors ${
                                  selectedAction?.id === subAction.id && 
                                  selectedAction?.isSubAction && 
                                  selectedAction?.parentAction?._id === action._id
                                    ? 'bg-blue-50 border border-blue-200' 
                                    : 'hover:bg-gray-50'
                                }`}
                                onClick={() => onActionSelect?.({...subAction, isSubAction: true, parentAction: action})}
                              >
                                {getActionIcon(subAction.type)}
                                <span className="flex-1 truncate">{subAction.type}</span>
                                <span className="text-xs text-gray-400">#{subAction.priority}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Create the loading content component
  const LoadingContent = () => (
    <div className="bg-white flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="p-4 space-y-4">
        {/* Day's Meetings skeleton */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-5 rounded" />
            </div>
          </div>
          <div className="space-y-2 pl-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 p-2">
                <Skeleton className="h-3 w-3 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <Separator className="my-4" />
        
        {/* Action groups skeleton */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2 pl-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
            <Separator className="my-4" />
          </div>
        ))}
      </div>
    </div>
  );

  // Mobile: render in a Sheet
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="left" className="p-0 w-80">
          {isLoading || actionsLoading || isLoadingMeetings || isLoadingDeals ? <LoadingContent /> : <SidebarContent />}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: render normally
  return (
    <div className="w-80 border-r border-gray-200 h-full">
      {isLoading || actionsLoading || isLoadingMeetings || isLoadingDeals ? <LoadingContent /> : <SidebarContent />}
    </div>
  );
};
