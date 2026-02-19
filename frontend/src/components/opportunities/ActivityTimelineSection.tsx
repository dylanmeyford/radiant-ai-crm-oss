import React from 'react';
import { useMemo, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { Clock, Calendar, Mail, FileText, Phone, MessageCircle, ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from '@/types/prospect';
import { Meeting } from '@/types/dashboard';
import { EmailActivity } from '@/hooks/useEmailOperations';
import { useActivityOperations } from '@/hooks/useActivityOperations';
import { useEmailOperations } from '@/hooks/useEmailOperations';
import { useCalendarOperations } from '@/hooks/useCalendarOperations';

interface ActivityTimelineSectionProps {
  opportunityId: string;
  focusMessageId?: string;
  focusActivityId?: string;
}

// Safe email HTML sanitization (adapted from ActivityTimelineTab)
function sanitizeEmailHtml(html: string): string {
  if (!html || typeof window === 'undefined') return '';
  try {
    let cleanHtml = html;
    cleanHtml = cleanHtml.replace(/<html[^>]*>/gi, '<html>');
    cleanHtml = cleanHtml.replace(/<\?xml[^>]*>/gi, '');
    cleanHtml = cleanHtml.replace(/xmlns[^=]*="[^"]*"/gi, '');
    cleanHtml = cleanHtml.replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '');
    cleanHtml = cleanHtml.replace(/<o:p[^>]*\/>/gi, '');
    cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/gi, '');
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) cleanHtml = bodyMatch[1];
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
    if (!sanitized || sanitized.trim() === '') {
      const textMatch = html.match(/>\s*([^<]+)\s*</g);
      if (textMatch && textMatch.length > 0) {
        return textMatch
          .map(match => match.replace(/^>\s*|\s*<$/g, '').trim())
          .filter(text => text.length > 0)
          .join(' ');
      }
    }
    return sanitized || '';
  } catch {
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      return tempDiv.textContent || tempDiv.innerText || '';
    } catch {
      return '';
    }
  }
}

type TimelineType = 'activity' | 'calendar' | 'email';

interface TimelineItem {
  id: string;
  type: TimelineType;
  date: Date;
  title: string;
  description?: string;
  data: Activity | Meeting | EmailActivity;
}

const getIconForItem = (item: TimelineItem) => {
  if (item.type === 'calendar') return <Calendar className="h-4 w-4 text-blue-600" />;
  if (item.type === 'email') return <Mail className="h-4 w-4 text-green-600" />;
  // Activity sub-types
  const activity = item.data as Activity;
  switch (activity?.type) {
    case 'note':
      return <FileText className="h-4 w-4 text-purple-600" />;
    case 'call':
      return <Phone className="h-4 w-4 text-orange-600" />;
    case 'sms':
      return <MessageCircle className="h-4 w-4 text-blue-500" />;
    case 'email':
      return <Mail className="h-4 w-4 text-green-600" />;
    case 'calendar':
      return <Calendar className="h-4 w-4 text-blue-600" />;
    default:
      return <MessageCircle className="h-4 w-4 text-purple-600" />;
  }
};

const formatDate = (date: Date | string) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
  const isFuture = diffMs < 0;
  if (diffDays === 0) return `Today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  if (diffDays === 1) return isFuture ? `Tomorrow at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : `Yesterday at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  if (diffDays < 7) return isFuture ? `in ${diffDays} days` : `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const ActivityTimelineSection: React.FC<ActivityTimelineSectionProps> = ({ opportunityId, focusMessageId, focusActivityId }) => {
  const navigate = useNavigate();

  const { activities, isLoadingActivities, activitiesError } = useActivityOperations({ entityType: 'opportunity', entityId: opportunityId });
  const { emailActivities, isLoadingEmailActivities, emailActivitiesError } = useEmailOperations({ entityType: 'opportunity', entityId: opportunityId });
  const { meetings, isLoadingMeetings, meetingsError } = useCalendarOperations({ entityType: 'opportunity', entityId: opportunityId });

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = React.useState<number>(1);
  const [pendingScrollTarget, setPendingScrollTarget] = React.useState<{ itemId: string; itemIndex: number } | null>(null);

  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];

    // Activities
    (activities as Activity[]).forEach((a: Activity) => {
      items.push({
        id: a._id,
        type: 'activity',
        date: a.date instanceof Date ? a.date : new Date(a.date),
        title: a.title,
        description: a.description,
        data: a,
      });
    });

    // Meetings
    (meetings as Meeting[]).forEach((m: Meeting) => {
      items.push({
        id: m.id,
        type: 'calendar',
        date: m.date instanceof Date ? m.date : new Date(m.date || new Date()),
        title: m.title,
        data: m,
      });
    });

    // Emails (no thread bundling)
    (emailActivities as EmailActivity[]).forEach((e: EmailActivity) => {
      // Description preview as plain text
      let description = e.body;
      if (e.body && e.body.trim().startsWith('<')) {
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = e.body;
          description = tempDiv.textContent || tempDiv.innerText || e.body;
        } catch {
          description = e.body;
        }
      }
      items.push({
        id: e._id,
        type: 'email',
        date: (e as any).date instanceof Date ? (e as any).date : new Date((e as any).date || e.createdAt),
        title: e.subject,
        description,
        data: e,
      });
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activities, meetings, emailActivities]);

  // Expand most recent item by default
  useEffect(() => {
    if (timelineItems.length > 0) {
      setExpandedIds((prev) => {
        if (prev.size === 0) {
          const s = new Set(prev);
          s.add(timelineItems[0].id);
          return s;
        }
        return prev;
      });
    }
  }, [timelineItems]);

  const isLoading = isLoadingActivities || isLoadingEmailActivities || isLoadingMeetings;
  const hasError = activitiesError || emailActivitiesError || meetingsError;

  // Focus and expand a specific email by messageId when requested
  useEffect(() => {
    if (!focusMessageId || timelineItems.length === 0) return;
    // Find matching email item by messageId
    const targetIndex = timelineItems.findIndex((it) => {
      if (it.type !== 'email') return false;
      const email = it.data as EmailActivity;
      return email.messageId === focusMessageId || it.id === focusMessageId;
    });
    if (targetIndex >= 0) {
      // Ensure item is visible
      const newVisibleCount = Math.max(visibleCount, targetIndex + 1);
      if (newVisibleCount > visibleCount) {
        setVisibleCount(newVisibleCount);
        return; // Let the next effect handle scrolling after visibleCount updates
      }

      // Expand it
      setExpandedIds((prev) => {
        const s = new Set(prev);
        s.add(timelineItems[targetIndex].id);
        return s;
      });

      // Smooth scroll into view after DOM updates
      setTimeout(() => {
        const elByMsg = document.getElementById(`timeline-email-${focusMessageId}`);
        const elById = document.getElementById(`timeline-item-${timelineItems[targetIndex].id}`);
        const el = elByMsg || elById;
        if (el) {
          // Find the scrollable parent container
          let scrollContainer = el.parentElement;
          while (scrollContainer && scrollContainer !== document.body) {
            const style = window.getComputedStyle(scrollContainer);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
              break;
            }
            scrollContainer = scrollContainer.parentElement;
          }

          if (scrollContainer && scrollContainer !== document.body && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
            // Scroll within the container
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = el.getBoundingClientRect();
            const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
            scrollContainer.scrollTo({
              top: scrollTop,
              behavior: 'smooth'
            });
          } else {
            // Fallback to scrollIntoView
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          // Add visual feedback
          el.style.transition = 'background-color 0.3s ease';
          el.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
          setTimeout(() => {
            el.style.backgroundColor = '';
          }, 1000);
        }
      }, 100);
    }
  }, [focusMessageId, timelineItems, visibleCount]);

  // Focus and expand any activity by ID when requested
  useEffect(() => {
    if (!focusActivityId || timelineItems.length === 0) return;

    // Find matching item by activity ID (check all types)
    const targetIndex = timelineItems.findIndex((it) => {
      // Check the timeline item ID
      if (it.id === focusActivityId) return true;

      // Also check the underlying data for alternative IDs
      if (it.type === 'email') {
        const emailData = it.data as EmailActivity;
        if (emailData.messageId === focusActivityId) return true;
      }
      if (it.type === 'calendar') {
        const meetingData = it.data as Meeting;
        if (meetingData.id === focusActivityId) return true;
        // Also check if it's an object with _id (for notetaker meetings)
        if ((meetingData as any)._id === focusActivityId) return true;
      }
      if (it.type === 'activity') {
        const activityData = it.data as Activity;
        if (activityData._id === focusActivityId) return true;
      }

      return false;
    });

    if (targetIndex >= 0) {
      // Ensure item is visible
      const newVisibleCount = Math.max(visibleCount, targetIndex + 1);
      if (newVisibleCount > visibleCount) {
        setVisibleCount(newVisibleCount);
        // Set pending scroll target to handle scrolling after DOM update
        setPendingScrollTarget({ itemId: timelineItems[targetIndex].id, itemIndex: targetIndex });
        return;
      }

      // Expand it
      setExpandedIds((prev) => {
        const s = new Set(prev);
        s.add(timelineItems[targetIndex].id);
        return s;
      });

      // Scroll immediately since item is already visible
      performScroll(timelineItems[targetIndex].id, targetIndex);
    }
  }, [focusActivityId, timelineItems, visibleCount]);

  // Handle scrolling after visibleCount updates
  useEffect(() => {
    if (pendingScrollTarget && visibleCount >= pendingScrollTarget.itemIndex + 1) {
      // Expand the item
      setExpandedIds((prev) => {
        const s = new Set(prev);
        s.add(pendingScrollTarget.itemId);
        return s;
      });

      // Now scroll
      performScroll(pendingScrollTarget.itemId, pendingScrollTarget.itemIndex);
      setPendingScrollTarget(null);
    }
  }, [visibleCount, pendingScrollTarget]);

  // Helper function to perform the actual scrolling
  const performScroll = (itemId: string, itemIndex: number) => {
    setTimeout(() => {
      // Get the timeline item to determine the correct DOM ID
      const timelineItem = timelineItems[itemIndex];
      let domId = `timeline-item-${itemId}`;

      // For emails, the DOM ID might be different if there's a messageId
      if (timelineItem?.type === 'email') {
        const emailData = timelineItem.data as EmailActivity;
        if (emailData.messageId) {
          domId = `timeline-email-${emailData.messageId}`;
        }
      }

      const el = document.getElementById(domId);
      if (el) {
        // Find the scrollable parent container
        let scrollContainer = el.parentElement;
        while (scrollContainer && scrollContainer !== document.body) {
          const style = window.getComputedStyle(scrollContainer);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            break;
          }
          scrollContainer = scrollContainer.parentElement;
        }

        if (scrollContainer && scrollContainer !== document.body && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
          // Scroll within the container
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = el.getBoundingClientRect();
          const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
          scrollContainer.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        } else {
          // Fallback to scrollIntoView
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Add visual feedback - briefly highlight the item
        el.style.transition = 'background-color 0.3s ease';
        el.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; // blue-500 with opacity
        setTimeout(() => {
          el.style.backgroundColor = '';
        }, 1000);
      }
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">Recent Activity</h3>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (hasError) {
    return null; // Hide section on error per spec to avoid clutter
  }

  if (timelineItems.length === 0) {
    return null; // Hide section when no previous activities
  }

  const visibleItems = timelineItems.slice(0, visibleCount);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const renderItem = (item: TimelineItem) => {
    const expanded = expandedIds.has(item.id);
    const commonHeader = (
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpanded(item.id); }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            <h4 className="text-sm font-medium text-gray-800 truncate">{item.title}</h4>
          </div>
          <p className="text-xs text-gray-400">{formatDate(item.date)}</p>
        </div>
      </div>
    );

    if (item.type === 'email') {
      const email = item.data as EmailActivity;
      const isHtmlContent = email.body && email.body.trim().startsWith('<') && email.body.includes('</');
      let content: React.ReactNode = null;
      if (expanded) {
        if (isHtmlContent) {
          const safe = sanitizeEmailHtml(email.body);
          if (safe && safe.trim()) {
            content = (
              <div
                className="email-content text-sm text-gray-800 [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: safe }}
              />
            );
          }
        }
        if (!content && email.htmlBody && email.htmlBody.trim()) {
          const safe = sanitizeEmailHtml(email.htmlBody);
          if (safe && safe.trim()) {
            content = (
              <div
                className="email-content text-sm text-gray-800 [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: safe }}
              />
            );
          }
        }
        if (!content) {
          content = (
            <div className="whitespace-pre-wrap text-sm text-gray-800">
              {email.body || 'No content available'}
            </div>
          );
        }
      }

      return (
        <div key={item.id} id={email.messageId ? `timeline-email-${email.messageId}` : `timeline-item-${item.id}`} className="flex gap-3 py-2">
          <div className="relative flex-shrink-0">
            <div className="h-5 w-5 bg-gray-100 rounded-full flex items-center justify-center">
              {getIconForItem(item)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="space-y-1">
              {commonHeader}
              {!expanded && item.description && (
                <div className="text-sm text-gray-600 line-clamp-1">{item.description}</div>
              )}
              {expanded && (
                <>
                  {/* Email metadata */}
                  <div className="mt-2 space-y-1 text-xs bg-gray-50 rounded p-2">
                    <div className="flex items-start gap-2"><span className="text-gray-500 font-medium min-w-[36px]">From:</span><span className="text-gray-700">{email.from?.name ? `${email.from.name} <${email.from.email}>` : email.from?.email || 'Unknown'}</span></div>
                    {email.to?.length ? (
                      <div className="flex items-start gap-2"><span className="text-gray-500 font-medium min-w-[36px]">To:</span><span className="text-gray-700">{email.to.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ')}</span></div>
                    ) : null}
                    {email.cc?.length ? (
                      <div className="flex items-start gap-2"><span className="text-gray-500 font-medium min-w-[36px]">CC:</span><span className="text-gray-700">{email.cc.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ')}</span></div>
                    ) : null}
                    {email.bcc?.length ? (
                      <div className="flex items-start gap-2"><span className="text-gray-500 font-medium min-w-[36px]">BCC:</span><span className="text-gray-700">{email.bcc.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ')}</span></div>
                    ) : null}
                  </div>
                  {/* Body */}
                  <div className="mt-2 p-2 bg-gray-50 rounded overflow-auto max-h-24">
                    {content}
                  </div>
                  {/* Attachments */}
                  {email.attachments?.length ? (
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <Paperclip className="h-3 w-3" />
                      <span>{email.attachments.length} attachment{email.attachments.length !== 1 ? 's' : ''}</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (item.type === 'calendar') {
      const meeting = item.data as Meeting;
      return (
        <div key={item.id} id={`timeline-item-${item.id}`} className="flex gap-3 py-2">
          <div className="relative flex-shrink-0">
            <div className="h-5 w-5 bg-gray-100 rounded-full flex items-center justify-center">
              {getIconForItem(item)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="space-y-1 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 -my-1"
              onClick={() => navigate(`/meetings/${item.id}`)}
            >
              {commonHeader}
              {expanded && (
                <div className="text-sm text-gray-600">
                  {meeting.description ? (
                    <div className="whitespace-pre-wrap">{meeting.description}</div>
                  ) : (
                    <div className="text-gray-500 italic">No additional details</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // activity
    const activity = item.data as Activity;
    return (
      <div key={item.id} id={`timeline-item-${item.id}`} className="flex gap-3 py-2">
        <div className="relative flex-shrink-0">
          <div className="h-5 w-5 bg-gray-100 rounded-full flex items-center justify-center">
            {getIconForItem(item)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="space-y-1">
            {commonHeader}
            {!expanded && item.description && (
              <div className="text-sm text-gray-600 line-clamp-1">{item.description}</div>
            )}
            {expanded && (
              <>
                {item.description && (
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">{item.description}</div>
                )}
                <div className="mt-1 flex items-center gap-4 text-xs">
                  {activity.status && (
                    <span className="capitalize bg-gray-100 text-gray-700 px-2 py-1 rounded">{activity.status.replace('_', ' ')}</span>
                  )}
                  {activity.duration ? (
                    <span className="text-gray-500">{activity.duration} minutes</span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-3 w-3 text-gray-400" />
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recent Activity</h3>
      </div>
      <div className="relative space-y-1">
        {visibleItems.map(renderItem)}
      </div>
      {timelineItems.length > visibleCount && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setVisibleCount((c) => c + 5)}
            className="px-3 py-1 text-xs font-medium rounded transition-colors text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          >
            Show more activity
          </button>
        </div>
      )}
      <style>{`
        .email-content * { max-width: 100% !important; box-sizing: border-box; }
        .email-content p { margin: 0.5em 0; }
        .email-content table { width: auto !important; max-width: 100% !important; border-collapse: collapse; }
        .email-content td, .email-content th { padding: 4px 8px; border: 1px solid #e5e7eb; }
        .email-content img { max-width: 100% !important; height: auto !important; display: block; margin: 0.5em 0; }
        .email-content a { color: #2563eb; text-decoration: underline; word-break: break-all; }
        .email-content blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; margin: 0.5em 0; color: #6b7280; }
      `}</style>
    </div>
  );
};

export default ActivityTimelineSection;
