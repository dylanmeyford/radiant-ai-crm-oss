import React from 'react';
import { Mail, Calendar, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MobileTooltip } from '@/components/ui/mobile-tooltip';

interface ActivityPillProps {
  activityModel: string;
  summary?: string;
  activityId: string;
  onActivityClick?: (activityId: string) => void;
}

// Map activity models to display names and icons
const getActivityInfo = (activityModel: string) => {
  switch (activityModel) {
    case 'EmailActivity':
      return {
        name: 'Email',
        icon: Mail,
        color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
      };
    case 'CalendarActivity':
      return {
        name: 'Meeting',
        icon: Calendar,
        color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
      };
    case 'Activity':
      return {
        name: 'Activity',
        icon: FileText,
        color: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
      };
    default:
      return {
        name: 'Activity',
        icon: FileText,
        color: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
      };
  }
};

export const ActivityPill: React.FC<ActivityPillProps> = ({
  activityModel,
  summary,
  activityId,
  onActivityClick
}) => {
  const { name, icon: Icon, color } = getActivityInfo(activityModel);

  // Parse JSON summary to extract keyMessage or keyTakeaway
  const getKeyMessage = (summaryText?: string): string | null => {
    if (!summaryText || !summaryText.trim()) return null;
    
    try {
      const parsed = JSON.parse(summaryText);
      // Try keyMessage first, then keyTakeaway, then fall back to original text
      return parsed.keyMessage || parsed.keyTakeaway || summaryText;
    } catch (error) {
      // If it's not JSON, return the original text
      return summaryText;
    }
  };

  const keyMessage = getKeyMessage(summary);

  const pillContent = (
    <Badge 
      variant="outline" 
      className={`inline-flex items-center gap-1 text-xs cursor-help transition-colors ${color}`}
    >
      <Icon className="h-3 w-3" />
      {name}
    </Badge>
  );

  // If we have a key message, wrap in mobile-friendly tooltip
  if (keyMessage && keyMessage.trim() && keyMessage !== 'UNKNOWN') {
    return (
      <MobileTooltip
        content={
          <div className="space-y-1">
            <div className="font-medium text-xs">Key Message</div>
            <div className="text-xs text-gray-200 whitespace-pre-wrap">{keyMessage}</div>
            <div className="text-xs text-gray-400 mt-1">
              {onActivityClick ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onActivityClick(activityId);
                  }}
                  className="hover:text-gray-200 hover:underline cursor-pointer"
                >
                  ID: {activityId}
                </button>
              ) : (
                <>ID: {activityId}</>
              )}
            </div>
          </div>
        }
        side="top"
        contentClassName="max-w-sm"
      >
        {pillContent}
      </MobileTooltip>
    );
  }

  // No key message or it's UNKNOWN, just return the pill without tooltip
  return pillContent;
};
