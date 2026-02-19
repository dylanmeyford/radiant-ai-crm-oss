import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { 
  Calendar, 
  Mail, 
  MessageSquare, 
  Clock, 
  Users,
  FileText,
  ChevronDown,
  ChevronRight,
  Phone,
  CheckCircle,
  AlertCircle,
  Paperclip,
  MessageCircle,
  Linkedin,
  Eye,
  ExternalLink,
  MoreHorizontal
} from 'lucide-react';
import { Activity } from '@/types/prospect';
import { Meeting } from '@/types/dashboard';
import { EmailActivity } from '@/hooks/useEmailOperations';
import { Skeleton } from '@/components/ui/skeleton';

// Unified timeline item interface
interface TimelineItem {
  id: string;
  type: 'activity' | 'calendar' | 'email' | 'email-thread';
  date: Date;
  title: string;
  description?: string;
  items?: TimelineItem[]; // For email threads
  threadId?: string;
  data: Activity | Meeting | EmailActivity | EmailActivity[];
}

interface ActivityTimelineTabProps {
  activities: Activity[];
  meetings: Meeting[];
  emailActivities: EmailActivity[];
  isLoadingActivities: boolean;
  isLoadingMeetings: boolean;
  isLoadingEmailActivities: boolean;
  activitiesError: Error | null;
  meetingsError: Error | null;
  emailActivitiesError: Error | null;
}

// Configure DOMPurify for safe email HTML rendering
function sanitizeEmailHtml(html: string): string {
  if (!html || typeof window === 'undefined') return '';
  
  try {
    // First, let's clean up Microsoft Word/Outlook specific issues
    let cleanHtml = html;
    
    // Remove XML namespaces and Outlook-specific tags
    cleanHtml = cleanHtml.replace(/<html[^>]*>/gi, '<html>');
    cleanHtml = cleanHtml.replace(/<\?xml[^>]*>/gi, '');
    cleanHtml = cleanHtml.replace(/xmlns[^=]*="[^"]*"/gi, '');
    cleanHtml = cleanHtml.replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '');
    cleanHtml = cleanHtml.replace(/<o:p[^>]*\/>/gi, '');
    
    // Remove style blocks that might contain VML or problematic CSS
    cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove comments
    cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/gi, '');
    
    // If we have a full HTML document, extract just the body content
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      cleanHtml = bodyMatch[1];
    }
    
    // Use more permissive DOMPurify settings for email content
    const sanitized = DOMPurify.sanitize(cleanHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'div', 'span', 'a', 'img', 'strong', 'b', 'em', 'i', 'u', 
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'code', 'font',
        'center', 'small', 'big', 'sup', 'sub'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'style', 'class', 'target',
        'width', 'height', 'border', 'cellpadding', 'cellspacing',
        'color', 'size', 'face', 'align', 'valign'
      ],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur'],
      KEEP_CONTENT: true,
      RETURN_DOM_FRAGMENT: false,
      RETURN_DOM: false,
    });
    
    // If sanitization resulted in empty content, try to extract text content
    if (!sanitized || sanitized.trim() === '') {
      // Try to extract meaningful text from the original HTML
      const textMatch = html.match(/>\s*([^<]+)\s*</g);
      if (textMatch && textMatch.length > 0) {
        return textMatch
          .map(match => match.replace(/^>\s*|\s*<$/g, '').trim())
          .filter(text => text.length > 0)
          .join(' ');
      }
    }
    
    return sanitized || '';
  } catch (error) {
    console.warn('Error sanitizing email HTML:', error);
    // Fallback: try to extract text content
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      return tempDiv.textContent || tempDiv.innerText || '';
    } catch {
      return '';
    }
  }
}

const ActivityTimelineTab: React.FC<ActivityTimelineTabProps> = ({
  activities,
  meetings,
  emailActivities,
  isLoadingActivities,
  isLoadingMeetings,
  isLoadingEmailActivities,
  activitiesError,
  meetingsError,
  emailActivitiesError,
}) => {
  const navigate = useNavigate();
  const [expandedThreads, setExpandedThreads] = React.useState<Set<string>>(new Set());
  const [filterType, setFilterType] = React.useState<'all' | 'activity' | 'calendar' | 'email'>('all');
  
  // Group emails by thread (like Gmail)
  const emailThreads = useMemo(() => {
    const threads = new Map<string, EmailActivity[]>();
    
    emailActivities.forEach(email => {
      const threadId = email.threadId || email._id;
      if (!threads.has(threadId)) {
        threads.set(threadId, []);
      }
      threads.get(threadId)!.push(email);
    });
    
    // Sort emails within each thread by date
    threads.forEach(emails => {
      emails.sort((a, b) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime());
    });
    
    return threads;
  }, [emailActivities]);

  // Combine and sort all timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];
    
    // Add regular activities
    activities.forEach(activity => {
      items.push({
        id: activity._id,
        type: 'activity',
        date: activity.date instanceof Date ? activity.date : new Date(activity.date),
        title: activity.title,
        description: activity.description,
        data: activity,
      });
    });
    
    // Add calendar meetings
    meetings.forEach(meeting => {
      items.push({
        id: meeting.id,
        type: 'calendar',
        date: meeting.date instanceof Date ? meeting.date : new Date(meeting.date || new Date()),
        title: meeting.title,
        data: meeting,
      });
    });
    
    // Add email threads
    Array.from(emailThreads.entries()).forEach(([threadId, emails]) => {
      if (emails.length === 1) {
        // Single email, not a thread
        const email = emails[0];
        
        // For description, use a simple text version for preview
        let description = email.body;
        if (email.body && email.body.trim().startsWith('<')) {
          // If it's HTML, try to extract simple text for preview
          try {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = email.body;
            description = tempDiv.textContent || tempDiv.innerText || email.body;
          } catch {
            description = email.body;
          }
        }
        
        items.push({
          id: email._id,
          type: 'email',
          date: email.date instanceof Date ? email.date : new Date(email.date || new Date()),
          title: email.subject,
          description: description,
          data: email,
        });
      } else {
        // Email thread
        const latestEmail = emails[emails.length - 1];
        const threadItems = emails.map(email => {
          // For description, use a simple text version for preview
          let description = email.body;
          if (email.body && email.body.trim().startsWith('<')) {
            // If it's HTML, try to extract simple text for preview
            try {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = email.body;
              description = tempDiv.textContent || tempDiv.innerText || email.body;
            } catch {
              description = email.body;
            }
          }
          
          return {
            id: email._id,
            type: 'email' as const,
            date: email.date instanceof Date ? email.date : new Date(email.date || email.createdAt),
            title: email.subject,
            description: description,
            data: email,
          };
        });
        
        items.push({
          id: threadId,
          type: 'email-thread',
          date: latestEmail.date instanceof Date ? latestEmail.date : new Date(latestEmail.date || latestEmail.createdAt),
          title: `${latestEmail.subject} (${emails.length} messages)`,
          threadId,
          items: threadItems,
          data: emails,
        });
      }
    });
    
    // Sort by date (most recent first) - ensure dates are Date objects
    return items.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
  }, [activities, meetings, emailThreads]);

  // Filter timeline items based on selected filter
  const filteredTimelineItems = useMemo(() => {
    if (filterType === 'all') return timelineItems;
    return timelineItems.filter(item => {
      if (filterType === 'email') return item.type === 'email' || item.type === 'email-thread';
      return item.type === filterType;
    });
  }, [timelineItems, filterType]);

  const toggleThread = (threadId: string) => {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(threadId)) {
      newExpanded.delete(threadId);
    } else {
      newExpanded.add(threadId);
    }
    setExpandedThreads(newExpanded);
  };

  const isLoading = isLoadingActivities || isLoadingMeetings || isLoadingEmailActivities;
  const hasError = activitiesError || meetingsError || emailActivitiesError;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">Activity Timeline</h3>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MessageSquare className="h-8 w-8 text-red-400 mb-3" />
        <p className="text-red-600 text-sm font-medium">
          Error loading activity timeline
        </p>
        <p className="text-red-500 text-xs mt-1">
          {activitiesError?.message || meetingsError?.message || emailActivitiesError?.message}
        </p>
      </div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-8 w-8 text-gray-400 mb-3" />
        <p className="text-gray-600 text-sm font-medium">
          No activity found
        </p>
        <p className="text-gray-500 text-xs mt-1">
          Activities, meetings, and emails will appear here as they're added
        </p>
      </div>
    );
  }

  if (filteredTimelineItems.length === 0 && filterType !== 'all') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900">Activity Timeline</h3>
          </div>
          
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all', label: 'All', icon: Clock },
              { key: 'activity', label: 'Activities', icon: MessageSquare },
              { key: 'calendar', label: 'Meetings', icon: Calendar },
              { key: 'email', label: 'Emails', icon: Mail },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilterType(key as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1 ${
                  filterType === key 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="h-8 w-8 text-gray-400 mb-3" />
          <p className="text-gray-600 text-sm font-medium">
            No {filterType} found
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Try selecting a different filter or check back later
          </p>
        </div>
      </div>
    );
  }

  const getActivityIcon = (type: string, data?: any) => {
    switch (type) {
      case 'calendar':
        return <Calendar className="h-4 w-4 text-blue-600" />;
      case 'email':
      case 'email-thread':
        return <Mail className="h-4 w-4 text-green-600" />;
      case 'activity':
        const activityType = (data as Activity)?.type;
        switch (activityType) {
          case 'note':
            return <FileText className="h-4 w-4 text-purple-600" />;
          case 'call':
            return <Phone className="h-4 w-4 text-orange-600" />;
          case 'sms':
            return <MessageCircle className="h-4 w-4 text-blue-500" />;
          case 'email':
            return <Mail className="h-4 w-4 text-green-600" />;
          case 'linkedin':
            return <Linkedin className="h-4 w-4 text-blue-700" />;
          case 'meeting_notes':
            return <Users className="h-4 w-4 text-indigo-600" />;
          case 'calendar':
            return <Calendar className="h-4 w-4 text-blue-600" />;
          case 'task':
            return <CheckCircle className="h-4 w-4 text-teal-600" />;
          case 'dsr_access':
            return <Eye className="h-4 w-4 text-gray-600" />;
          case 'dsr_document_view':
            return <FileText className="h-4 w-4 text-gray-600" />;
          case 'dsr_link_click':
            return <ExternalLink className="h-4 w-4 text-gray-600" />;
          case 'other':
            return <MoreHorizontal className="h-4 w-4 text-gray-500" />;
          default:
            return <MessageSquare className="h-4 w-4 text-purple-600" />;
        }
      default:
        return <MessageSquare className="h-4 w-4 text-purple-600" />;
    }
  };

  const formatDate = (date: Date | string) => {
    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else {
      try {
        dateObj = new Date(date);
      } catch (e) {
        console.warn(`Invalid date string: ${date}`);
        return 'Invalid Date (check data)';
      }
    }
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date (check data)';
    }
    
    const now = new Date();
    const diffTime = now.getTime() - dateObj.getTime();
    const diffDays = Math.floor(Math.abs(diffTime) / (1000 * 60 * 60 * 24));
    const isFuture = diffTime < 0;
    
    if (diffDays === 0) {
      return `Today at ${dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else if (diffDays === 1) {
      return isFuture 
        ? `Tomorrow at ${dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
        : `Yesterday at ${dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else if (diffDays < 7) {
      return isFuture ? `in ${diffDays} days` : `${diffDays} days ago`;
    } else {
      return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const renderTimelineItem = (item: TimelineItem) => {
    const isThread = item.type === 'email-thread';
    const isExpanded = isThread && expandedThreads.has(item.threadId!);

    return (
      <div key={item.id} className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-8 w-px h-full bg-gray-200"></div>
        
        <div className="flex gap-3">
          {/* Icon */}
          <div className="relative flex-shrink-0">
            <div className="h-8 w-8 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center">
              {getActivityIcon(item.type, item.data)}
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 pb-6 overflow-x-auto">
            <div 
              className={`bg-white rounded-lg border border-gray-200 p-4 transition-colors ${
                item.type === 'calendar' 
                  ? 'cursor-pointer hover:border-gray-300 hover:bg-gray-50' 
                  : ''
              }`}
              onClick={() => {
                if (item.type === 'calendar') {
                  navigate(`/meetings/${item.id}`);
                }
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {isThread && (
                      <button
                        onClick={() => toggleThread(item.threadId!)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <h4 className="text-sm font-medium text-gray-900 line-clamp-1">
                      {item.title}
                    </h4>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(item.date)}
                  </p>
                </div>
                
                {item.type === 'calendar' && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3 w-3" />
                    <span>{(item.data as Meeting).prospect}</span>
                  </div>
                )}
                
                {(item.type === 'email' || item.type === 'email-thread') && (
                  <div className="flex items-center gap-2">
                    {(item.data as EmailActivity | EmailActivity[])instanceof Array ? (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {(item.data as EmailActivity[]).length} messages
                      </span>
                    ) : (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        (item.data as EmailActivity).status === 'draft'
                          ? 'bg-yellow-100 text-yellow-700'
                          : (item.data as EmailActivity).status === 'scheduled'
                          ? 'bg-purple-100 text-purple-700'
                          : (item.data as EmailActivity).status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : (item.data as EmailActivity).status === 'cancelled'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {(item.data as EmailActivity).status === 'draft'
                          ? 'Draft'
                          : (item.data as EmailActivity).status === 'scheduled'
                          ? 'Scheduled'
                          : (item.data as EmailActivity).status === 'failed'
                          ? 'Failed'
                          : (item.data as EmailActivity).status === 'cancelled'
                          ? 'Cancelled'
                          : 'Sent'
                        }
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Email metadata above content for single items */}
              {!isThread && item.type === 'email' && (
                <div className="mt-3 space-y-3">
                  {/* Email metadata */}
                  <div className="space-y-2 text-xs border border-gray-200 bg-gray-50 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 font-medium min-w-[40px]">From:</span>
                      <span className="text-gray-700">
                        {(() => {
                          const email = item.data as any;
                          const fromArray = email.from || [];
                          if (fromArray.length > 0) {
                            const from = fromArray[0];
                            return from.name ? `${from.name} <${from.email}>` : from.email;
                          }
                          return 'Unknown sender';
                        })()}
                      </span>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 font-medium min-w-[40px]">To:</span>
                      <span className="text-gray-700">
                        {(() => {
                          const email = item.data as any;
                          const toArray = email.to || [];
                          if (toArray.length > 0) {
                            return toArray.map((t: any) => 
                              t.name ? `${t.name} <${t.email}>` : t.email
                            ).join(', ');
                          }
                          return 'No recipients';
                        })()}
                      </span>
                    </div>
                    
                    {(() => {
                      const email = item.data as any;
                      const ccArray = email.cc || [];
                      return ccArray.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500 font-medium min-w-[40px]">CC:</span>
                          <span className="text-gray-700">
                            {ccArray.map((cc: any) => 
                              cc.name ? `${cc.name} <${cc.email}>` : cc.email
                            ).join(', ')}
                          </span>
                        </div>
                      );
                    })()}
                    
                    {(() => {
                      const email = item.data as any;
                      const bccArray = email.bcc || [];
                      return bccArray.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500 font-medium min-w-[40px]">BCC:</span>
                          <span className="text-gray-700">
                            {bccArray.map((bcc: any) => 
                              bcc.name ? `${bcc.name} <${bcc.email}>` : bcc.email
                            ).join(', ')}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Email content */}
                  <div className="p-3 bg-white rounded-lg border border-gray-200 overflow-auto max-h-64">
                    {(() => {
                      const email = item.data as EmailActivity;
                      
                      // Check if body contains HTML (starts with < and contains HTML tags)
                      const isHtmlContent = email.body && email.body.trim().startsWith('<') && email.body.includes('</');
                      
                      if (isHtmlContent) {
                        const safe = sanitizeEmailHtml(email.body);

                        
                        if (safe && safe.trim()) {
                          return (
                            <div
                              className="email-content text-sm text-gray-800 [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline"
                              dangerouslySetInnerHTML={{ __html: safe }}
                            />
                          );
                        }
                      }
                      
                      // Check htmlBody as backup
                      if (email.htmlBody && email.htmlBody.trim()) {
                        const safe = sanitizeEmailHtml(email.htmlBody);
                        if (safe && safe.trim()) {
                          return (
                            <div
                              className="email-content text-sm text-gray-800 [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline"
                              dangerouslySetInnerHTML={{ __html: safe }}
                            />
                          );
                        }
                      }
                      
                      // Fallback to plain text
                      if (email.body && email.body.trim()) {
                        return (
                          <div className="whitespace-pre-wrap text-sm text-gray-800">
                            {email.body}
                          </div>
                        );
                      }
                      
                      return (
                        <div className="text-sm text-gray-500 italic">
                          No content available
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              {!isThread && item.type !== 'email' && item.description && (
                <div className="text-sm text-gray-700 line-clamp-3">
                  {item.description}
                </div>
              )}
              
              {/* Thread content */}
              {isThread && isExpanded && item.items && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                                     {item.items.map((threadItem) => (
                    <div key={threadItem.id} className="border-l-2 border-gray-100 pl-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-600">
                            {formatDate(threadItem.date)}
                          </span>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          (threadItem.data as EmailActivity).status === 'draft'
                            ? 'bg-yellow-100 text-yellow-700'
                            : (threadItem.data as EmailActivity).status === 'scheduled'
                            ? 'bg-purple-100 text-purple-700'
                            : (threadItem.data as EmailActivity).status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : (threadItem.data as EmailActivity).status === 'cancelled'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {(threadItem.data as EmailActivity).status === 'draft'
                            ? 'Draft'
                            : (threadItem.data as EmailActivity).status === 'scheduled'
                            ? 'Scheduled'
                            : (threadItem.data as EmailActivity).status === 'failed'
                            ? 'Failed'
                            : (threadItem.data as EmailActivity).status === 'cancelled'
                            ? 'Cancelled'
                            : 'Sent'
                          }
                        </span>
                      </div>
                      <h5 className="text-sm font-medium text-gray-900 mb-2">
                        {threadItem.title}
                      </h5>
                      
                      {/* Thread email metadata - moved above content */}
                      <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                        <div className="space-y-1 text-xs">
                          {/* From */}
                          <div className="flex items-start gap-2">
                            <span className="text-gray-500 font-medium min-w-[30px]">From:</span>
                            <span className="text-gray-700 flex-1 text-xs">
                              {(() => {
                                const email = threadItem.data as any;
                                const fromArray = email.from || [];
                                if (fromArray.length > 0) {
                                  const from = fromArray[0];
                                  return from.name ? `${from.name} <${from.email}>` : from.email;
                                }
                                return 'Unknown sender';
                              })()}
                            </span>
                          </div>
                          
                          {/* To */}
                          <div className="flex items-start gap-2">
                            <span className="text-gray-500 font-medium min-w-[30px]">To:</span>
                            <span className="text-gray-700 flex-1 text-xs">
                              {(() => {
                                const email = threadItem.data as any;
                                const toArray = email.to || [];
                                if (toArray.length > 0) {
                                  return toArray.map((t: any) => 
                                    t.name ? `${t.name} <${t.email}>` : t.email
                                  ).join(', ');
                                }
                                return 'No recipients';
                              })()}
                            </span>
                          </div>
                          
                          {/* CC if present */}
                          {(() => {
                            const email = threadItem.data as any;
                            const ccArray = email.cc || [];
                            return ccArray.length > 0 && (
                              <div className="flex items-start gap-2">
                                <span className="text-gray-500 font-medium min-w-[30px]">CC:</span>
                                <span className="text-gray-700 flex-1 text-xs">
                                  {ccArray.map((cc: any) => 
                                    cc.name ? `${cc.name} <${cc.email}>` : cc.email
                                  ).join(', ')}
                                </span>
                              </div>
                            );
                          })()}
                          
                          {/* BCC if present */}
                          {(() => {
                            const email = threadItem.data as any;
                            const bccArray = email.bcc || [];
                            return bccArray.length > 0 && (
                              <div className="flex items-start gap-2">
                                <span className="text-gray-500 font-medium min-w-[30px]">BCC:</span>
                                <span className="text-gray-700 flex-1 text-xs">
                                  {bccArray.map((bcc: any) => 
                                    bcc.name ? `${bcc.name} <${bcc.email}>` : bcc.email
                                  ).join(', ')}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      
                      {/* Thread email content */}
                      <div className="p-2 bg-white rounded border border-gray-200 overflow-auto max-h-48">
                        {(() => {
                          const email = threadItem.data as EmailActivity;
                          
                          // Check if body contains HTML (starts with < and contains HTML tags)
                          const isHtmlContent = email.body && email.body.trim().startsWith('<') && email.body.includes('</');
                          
                          if (isHtmlContent) {
                            const safe = sanitizeEmailHtml(email.body);
                            console.log('Thread sanitized HTML from body:', safe?.substring(0, 200));
                            
                            if (safe && safe.trim()) {
                              return (
                                <div
                                  className="email-content text-xs text-gray-800 [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline"
                                  dangerouslySetInnerHTML={{ __html: safe }}
                                />
                              );
                            }
                          }
                          
                          // Check htmlBody as backup
                          if (email.htmlBody && email.htmlBody.trim()) {
                            const safe = sanitizeEmailHtml(email.htmlBody);
                            if (safe && safe.trim()) {
                              return (
                                <div
                                  className="email-content text-xs text-gray-800 [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline"
                                  dangerouslySetInnerHTML={{ __html: safe }}
                                />
                              );
                            }
                          }
                          
                          // Fallback to plain text
                          if (email.body && email.body.trim()) {
                            return (
                              <div className="whitespace-pre-wrap text-xs text-gray-800">
                                {email.body}
                              </div>
                            );
                          }
                          
                          return (
                            <div className="text-xs text-gray-500 italic">
                              No content available
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Activity metadata */}
              {item.type === 'activity' && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="capitalize bg-gray-100 text-gray-700 px-2 py-1 rounded">
                      {(() => {
                        const activityType = (item.data as Activity).type;
                        switch (activityType) {
                          case 'meeting_notes': return 'Meeting Notes';
                          case 'dsr_access': return 'Data Room Access';
                          case 'dsr_document_view': return 'Document View';
                          case 'dsr_link_click': return 'Link Click';
                          default: return activityType;
                        }
                      })()}
                    </span>
                    {(item.data as Activity).status && (
                      <div className="flex items-center gap-1">
                        {(item.data as Activity).status === 'completed' ? (
                          <CheckCircle className="h-3 w-3 text-green-600" />
                        ) : (item.data as Activity).status === 'cancelled' ? (
                          <AlertCircle className="h-3 w-3 text-red-600" />
                        ) : (item.data as Activity).status === 'to_do' ? (
                          <Clock className="h-3 w-3 text-blue-600" />
                        ) : (item.data as Activity).status === 'scheduled' ? (
                          <Calendar className="h-3 w-3 text-purple-600" />
                        ) : (
                          <Clock className="h-3 w-3 text-yellow-600" />
                        )}
                        <span className={`capitalize ${
                          (item.data as Activity).status === 'completed' ? 'text-green-700' :
                          (item.data as Activity).status === 'cancelled' ? 'text-red-700' :
                          (item.data as Activity).status === 'to_do' ? 'text-blue-700' :
                          (item.data as Activity).status === 'scheduled' ? 'text-purple-700' :
                          'text-yellow-700'
                        }`}>
                          {(item.data as Activity).status.replace('_', ' ')}
                        </span>
                      </div>
                    )}
                    {(item.data as Activity).duration && (
                      <span className="text-gray-500">{(item.data as Activity).duration} minutes</span>
                    )}
                  </div>
                  
                  {/* Additional metadata for specific activity types */}
                  {(item.data as Activity).metadata && (
                    <div className="text-xs text-gray-600">
                      {(item.data as Activity).type === 'dsr_access' && (item.data as Activity).metadata?.accessType && (
                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded mr-2">
                          Access: {(item.data as Activity).metadata?.accessType}
                        </span>
                      )}
                      {(item.data as Activity).type === 'dsr_document_view' && (item.data as Activity).metadata?.documentName && (
                        <span className="bg-green-50 text-green-700 px-2 py-1 rounded mr-2">
                          Document: {(item.data as Activity).metadata?.documentName}
                        </span>
                      )}
                      {(item.data as Activity).type === 'dsr_link_click' && (item.data as Activity).metadata?.linkUrl && (
                        <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded mr-2">
                          Link: {(item.data as Activity).metadata?.linkUrl}
                        </span>
                      )}
                      {(item.data as Activity).metadata?.opportunityId && (
                        <span className="bg-gray-50 text-gray-600 px-2 py-1 rounded">
                          From: {(item.data as Activity).metadata?.createdVia || 'Activity'}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Tags display */}
                  {(item.data as Activity).tags && (item.data as Activity).tags!.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(item.data as Activity).tags!.map((tag, index) => (
                        <span key={index} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Email attachments and thread info for single emails */}
              {!isThread && item.type === 'email' && (
                <div className="mt-3 flex items-center gap-4 text-xs pt-2 border-t border-gray-200">
                  {(item.data as any).emailAttachments?.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Paperclip className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-500">{(item.data as any).emailAttachments.length} attachment{(item.data as any).emailAttachments.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  
                  {(item.data as any).threadId && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-500">Thread: {(item.data as any).threadId?.substring(0, 8)}...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">Activity Timeline</h3>
          <span className="text-xs text-gray-500">
            {filteredTimelineItems.length} items
            {filterType !== 'all' && ` of ${timelineItems.length}`}
          </span>
        </div>
        
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'all', label: 'All', icon: Clock },
            { key: 'activity', label: 'Activities', icon: MessageSquare },
            { key: 'calendar', label: 'Meetings', icon: Calendar },
            { key: 'email', label: 'Emails', icon: Mail },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilterType(key as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1 ${
                filterType === key 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="relative">
        {filteredTimelineItems.map(renderTimelineItem)}
      </div>
      
      {/* Email content styling */}
      <style>{`
        .email-content {
          /* Reset common Outlook styles */
          font-family: inherit !important;
        }
        
        .email-content * {
          max-width: 100% !important;
          box-sizing: border-box;
        }
        
        .email-content p {
          margin: 0.5em 0;
        }
        
        .email-content table {
          width: auto !important;
          max-width: 100% !important;
          border-collapse: collapse;
        }
        
        .email-content td, .email-content th {
          padding: 4px 8px;
          border: 1px solid #e5e7eb;
        }
        
        .email-content img {
          max-width: 100% !important;
          height: auto !important;
          display: block;
          margin: 0.5em 0;
        }
        
        .email-content a {
          color: #2563eb;
          text-decoration: underline;
          word-break: break-all;
        }
        
        .email-content blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 12px;
          margin: 0.5em 0;
          color: #6b7280;
        }
        
        /* Microsoft specific styles */
        .email-content .MsoNormal {
          margin: 0.5em 0 !important;
        }
        
        .email-content o\\:p {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default ActivityTimelineTab;
