import { IEmailActivity } from '../../../models/EmailActivity';
import { ICalendarActivity } from '../../../models/CalendarActivity';
import { estimateTokenCount, truncateToTokenLimit, O3_MODEL_LIMITS } from '../../../utils/tokenUtils';
import { addEmailThreadSeparators, stripHtml } from '../../../utils/htmlUtils';
import chalk from 'chalk';

/**
 * Optimized activity data structures for AI analysis
 */
export interface OptimizedEmailActivity {
  _id: string;
  from: Array<{ email: string; name?: string }>;
  to: Array<{ email: string; name?: string }>;
  subject: string;
  body: string;
  date: Date;
  type: 'email';
  tokens?: number;
}

export interface OptimizedCalendarActivity {
  _id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  date: Date;
  attendees: Array<{ email: string; name?: string; responseStatus: string }>;
  status: string;
  content: string;
  type: 'meeting';
  tokens?: number;
}

/**
 * Configuration for data optimization strategies
 */
export interface OptimizationConfig {
  maxEmailActivities: number;
  maxCalendarActivities: number;
  maxTokensPerEmail: number;
  maxTokensPerMeeting: number;
  totalTokenBudget: number;
  prioritizeRecent: boolean;
  includeAttendeeDetails: boolean;
}

/**
 * Default optimization configuration
 */
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  maxEmailActivities: 15,
  maxCalendarActivities: 10,
  maxTokensPerEmail: 1000,
  maxTokensPerMeeting: 500,
  totalTokenBudget: O3_MODEL_LIMITS.ACTIVITY_DATA_LIMIT,
  prioritizeRecent: true,
  includeAttendeeDetails: true
};

/**
 * Service for optimizing activity data to fit within token limits
 */
export class ActivityDataOptimizer {
  
  /**
   * Optimize email activities for AI analysis
   */
  static optimizeEmailActivities(
    emailActivities: any[],
    config: Partial<OptimizationConfig> = {}
  ): OptimizedEmailActivity[] {
    const fullConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
    
    console.log(chalk.cyan(`    -> Optimizing ${emailActivities.length} email activities...`));
    
    // Sort by date (most recent first if prioritizing recent)
    const sortedEmails = [...emailActivities].sort((a, b) => {
      return fullConfig.prioritizeRecent 
        ? new Date(b.date).getTime() - new Date(a.date).getTime()
        : new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    // Take only the most relevant emails
    const limitedEmails = sortedEmails.slice(0, fullConfig.maxEmailActivities);
    
    const optimizedEmails: OptimizedEmailActivity[] = [];
    let totalTokens = 0;
    
    for (const email of limitedEmails) {
      // Clean and optimize email body
      let cleanBody = email.body ? addEmailThreadSeparators(stripHtml(email.body)) : '';
      
      // Truncate body if too long
      cleanBody = truncateToTokenLimit(cleanBody, fullConfig.maxTokensPerEmail);
      
      const optimizedEmail: OptimizedEmailActivity = {
        _id: email._id?.toString() || 'unknown',
        from: this.optimizeEmailParticipants(email.from),
        to: this.optimizeEmailParticipants(email.to),
        subject: email.subject || '',
        body: cleanBody,
        date: email.date,
        type: 'email'
      };
      
      // Calculate tokens for this email
      const emailTokens = estimateTokenCount(JSON.stringify(optimizedEmail));
      optimizedEmail.tokens = emailTokens;
      
      // Check if adding this email would exceed budget
      if (totalTokens + emailTokens > fullConfig.totalTokenBudget * 0.7) { // Reserve 30% for meetings
        console.log(chalk.yellow(`    -> Stopped adding emails at ${optimizedEmails.length} to stay within token budget`));
        break;
      }
      
      optimizedEmails.push(optimizedEmail);
      totalTokens += emailTokens;
    }
    
    console.log(chalk.green(`    -> Optimized to ${optimizedEmails.length} emails (~${totalTokens} tokens)`));
    return optimizedEmails;
  }
  
  /**
   * Optimize calendar activities for AI analysis
   */
  static optimizeCalendarActivities(
    calendarActivities: any[],
    config: Partial<OptimizationConfig> = {}
  ): OptimizedCalendarActivity[] {
    const fullConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
    
    console.log(chalk.cyan(`    -> Optimizing ${calendarActivities.length} calendar activities...`));
    
    // Sort by date (most recent first if prioritizing recent)
    const sortedMeetings = [...calendarActivities].sort((a, b) => {
      return fullConfig.prioritizeRecent 
        ? new Date(b.date).getTime() - new Date(a.date).getTime()
        : new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    // Take only the most relevant meetings
    const limitedMeetings = sortedMeetings.slice(0, fullConfig.maxCalendarActivities);
    
    const optimizedMeetings: OptimizedCalendarActivity[] = [];
    let totalTokens = 0;
    
    for (const meeting of limitedMeetings) {
      // Create optimized content from available fields
      let content = this.createMeetingContent(meeting);
      content = truncateToTokenLimit(content, fullConfig.maxTokensPerMeeting);
      
      const optimizedMeeting: OptimizedCalendarActivity = {
        _id: meeting._id?.toString() || 'unknown',
        title: meeting.title || 'Untitled Meeting',
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        date: meeting.date,
        attendees: fullConfig.includeAttendeeDetails 
          ? this.optimizeAttendees(meeting.attendees)
          : [],
        status: meeting.status || 'scheduled',
        content,
        type: 'meeting'
      };
      
      // Calculate tokens for this meeting
      const meetingTokens = estimateTokenCount(JSON.stringify(optimizedMeeting));
      optimizedMeeting.tokens = meetingTokens;
      
      // Check if adding this meeting would exceed budget
      if (totalTokens + meetingTokens > fullConfig.totalTokenBudget * 0.3) { // Use remaining 30% for meetings
        console.log(chalk.yellow(`    -> Stopped adding meetings at ${optimizedMeetings.length} to stay within token budget`));
        break;
      }
      
      optimizedMeetings.push(optimizedMeeting);
      totalTokens += meetingTokens;
    }
    
    console.log(chalk.green(`    -> Optimized to ${optimizedMeetings.length} meetings (~${totalTokens} tokens)`));
    return optimizedMeetings;
  }
  
  /**
   * Optimize email participants (remove unnecessary data)
   */
  private static optimizeEmailParticipants(participants: any[]): Array<{ email: string; name?: string }> {
    if (!participants || !Array.isArray(participants)) return [];
    
    return participants.map(p => ({
      email: p.email || '',
      name: p.name || undefined
    })).filter(p => p.email); // Remove entries without email
  }
  
  /**
   * Optimize attendee information
   */
  private static optimizeAttendees(attendees: any[]): Array<{ email: string; name?: string; responseStatus: string }> {
    if (!attendees || !Array.isArray(attendees)) return [];
    
    return attendees.map(a => ({
      email: a.email || '',
      name: a.name || undefined,
      responseStatus: a.responseStatus || 'needsAction'
    })).filter(a => a.email); // Remove entries without email
  }
  
  /**
   * Create optimized meeting content from available fields
   */
  private static createMeetingContent(meeting: any): string {
    const contentParts: string[] = [];
    
    // Add description if available
    if (meeting.description && meeting.description.trim()) {
      contentParts.push(`Description: ${meeting.description.trim()}`);
    }
    
    // Add AI summary if available and description is not present
    if (meeting.aiSummary?.summary) {
      contentParts.push(`AI Summary: ${meeting.aiSummary.summary}`);
    }
    
    // If no content available, provide basic info
    if (contentParts.length === 0) {
      contentParts.push(`Meeting: ${meeting.title || 'Untitled'} - No additional content available`);
    }
    
    return contentParts.join('\n\n');
  }
  
  /**
   * Get optimization statistics
   */
  static getOptimizationStats(
    originalEmails: any[],
    originalMeetings: any[],
    optimizedEmails: OptimizedEmailActivity[],
    optimizedMeetings: OptimizedCalendarActivity[]
  ) {
    const emailTokens = optimizedEmails.reduce((sum, email) => sum + (email.tokens || 0), 0);
    const meetingTokens = optimizedMeetings.reduce((sum, meeting) => sum + (meeting.tokens || 0), 0);
    const totalTokens = emailTokens + meetingTokens;
    
    return {
      original: {
        emails: originalEmails.length,
        meetings: originalMeetings.length,
        total: originalEmails.length + originalMeetings.length
      },
      optimized: {
        emails: optimizedEmails.length,
        meetings: optimizedMeetings.length,
        total: optimizedEmails.length + optimizedMeetings.length
      },
      tokens: {
        emails: emailTokens,
        meetings: meetingTokens,
        total: totalTokens,
        percentOfBudget: (totalTokens / O3_MODEL_LIMITS.ACTIVITY_DATA_LIMIT * 100).toFixed(1)
      }
    };
  }
}
