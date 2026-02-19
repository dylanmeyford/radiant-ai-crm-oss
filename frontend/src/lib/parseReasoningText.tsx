import React from 'react';
import { ActivityPill } from '@/components/ui/ActivityPill';

interface SourceActivity {
  activityId: string;
  activityModel?: string;
  activityDetails?: {
    _id: string;
    aiSummary?: {
      summary: string;
    };
    [key: string]: any;
  };
}

/**
 * Parses reasoning text and replaces MongoDB activity IDs with interactive activity pills
 * @param text The reasoning text containing activity IDs
 * @param sourceActivities Array of source activities with their details
 * @param onActivityClick Optional callback when an activity ID is clicked
 * @returns JSX elements with activity pills replacing IDs
 */
export const parseReasoningText = (
  text: string,
  sourceActivities: SourceActivity[] = [],
  onActivityClick?: (activityId: string) => void
): React.ReactNode => {
  if (!text || !sourceActivities.length) {
    return text;
  }

  // Create a map of activity IDs to their details for quick lookup
  const activityMap = new Map<string, SourceActivity>();
  sourceActivities.forEach(activity => {
    // Handle both string and object activityId formats
    const id = typeof activity.activityId === 'string' 
      ? activity.activityId 
      : activity.activityDetails?._id;
    if (id && typeof id === 'string') {
      activityMap.set(id, activity);
    }
  });

  // MongoDB ObjectId pattern (24 character hex string)
  const mongoIdPattern = /\b[0-9a-fA-F]{24}\b/g;
  
  // Find all potential MongoDB IDs in the text
  const matches = Array.from(text.matchAll(mongoIdPattern));
  
  if (matches.length === 0) {
    return text;
  }

  // Split text and replace activity IDs with pills
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const matchId = match[0];
    const matchStart = match.index!;
    const matchEnd = matchStart + matchId.length;
    
    // Add text before the match
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart));
    }
    
    // Check if this ID exists in our source activities
    const activity = activityMap.get(matchId);
    
    if (activity) {
      // Replace with activity pill
      const summary = activity.activityDetails?.aiSummary?.summary;
      const activityModel = activity.activityModel || 'Activity';
      
      parts.push(
        <ActivityPill
          key={`activity-${matchId}-${index}`}
          activityId={matchId}
          activityModel={activityModel}
          summary={summary}
          onActivityClick={onActivityClick}
        />
      );
    } else {
      // Not a recognized activity ID, keep as text
      parts.push(matchId);
    }
    
    lastIndex = matchEnd;
  });
  
  // Add remaining text after the last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={index}>{part}</React.Fragment>
      ))}
    </>
  );
};
