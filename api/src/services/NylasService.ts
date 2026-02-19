import Nylas, { Calendar } from 'nylas';
import CalendarActivity, { ICalendarActivity } from '../models/CalendarActivity';
import Contact, { IContact } from '../models/Contact';
import EmailActivity from '../models/EmailActivity';
import NylasConnection, { INylasConnection } from '../models/NylasConnection';
import User, { IUser } from '../models/User';
import Prospect from '../models/Prospect';
import Opportunity, { IOpportunity } from '../models/Opportunity';
import { getEmailAttachment, cleanupEmailAttachments } from './emailAttachmentService';
import pLimit from 'p-limit';


import { 
  NotetakerConfig, 
  InviteNotetakerToMeetingResponse, 
  InviteNotetakerSuccessData, 
  CancelNotetakerResponse, 
  ListNotetakersResponse, 
  FindNotetakerByIdResponse, 
  NylasSDKNotetaker } from '../types/notetaker.types';
import fileStorageService, { saveMeetingMediaStream, saveMeetingMedia } from './fileStorageService';
import { sanitizeHtmlForQuoting, escapeHtml } from '../utils/htmlUtils';
import fetch from 'node-fetch';
import { generateMeetingTitle } from './AI/generateMeetingTitle';
import { IntelligenceProcessor } from './AI/personIntelligence/intelligenceProcessor';
import retry from 'async-retry';
import mongoose from 'mongoose';
import { searchAndPopulateContacts } from './contactAutoPopulationService';
import { NylasRateLimitedClient } from './NylasRateLimitedClient';
import { getDomainDecision } from '../utils/domain';

const parseNylasScopes = (value?: string): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  const scopes = value
    .split(/[,\s]+/)
    .map(scope => scope.trim())
    .filter(Boolean);

  return scopes.length > 0 ? scopes : undefined;
};

const nylasConfig = {
  clientId: process.env.NYLAS_CLIENT_ID,
  callbackUri: `${process.env.CLIENT_URL}/connectaccount`,
  apiKey: process.env.NYLAS_API_KEY,
  apiUri: process.env.NYLAS_API_URI,
  scopes: parseNylasScopes(process.env.NYLAS_SCOPES),
};

const nylas = new Nylas({
  apiKey: nylasConfig.apiKey!,
  apiUri: nylasConfig.apiUri,
});

// Create rate-limited client for production API calls
const rateLimitedNylas = new NylasRateLimitedClient(nylas);

// Export rate-limited client for use by other services (e.g., DealMiningService)
export { rateLimitedNylas };

/**
 * Get rate limiting statistics for monitoring
 */
export const getRateLimitStats = () => {
  return rateLimitedNylas.getStats();
};

// Route to initialize authentication
export const getAuthUrl = async (): Promise<string> => {
  try {
    const authConfig: {
      clientId: string;
      redirectUri: string;
      scope?: string[];
    } = {
      clientId: nylasConfig.clientId!,
      redirectUri: nylasConfig.callbackUri,
    };

    if (nylasConfig.scopes?.length) {
      authConfig.scope = nylasConfig.scopes;
    }

    const authUrl = rateLimitedNylas.auth.urlForOAuth2(authConfig);

    return authUrl;
  } catch (error) {
    console.error('Error getting auth URL:', error);
    throw error;
  }
};  

// Route to handle the callback from Nylas, and get the grant id etc.
export const handleCallback = async (code: string): Promise<{
  grantId: string;
  email: string;
  accessToken: string;
  provider: string;
}> => {
  
  if (!code) {
    throw new Error("No authorization code returned from Nylas");
  }

  try {
    const response = await rateLimitedNylas.auth.exchangeCodeForToken({
      clientSecret: nylasConfig.apiKey,
      clientId: nylasConfig.clientId!,
      redirectUri: nylasConfig.callbackUri,
      code,
    });
    
    const { grantId, email, accessToken, provider } = response;

    if (!grantId) {
      throw new Error("No grantId returned from Nylas");
    }

    return { grantId, email, accessToken, provider: provider || 'other' };

  } catch (error) {
    console.error(error);
    throw error;
  }

}

// Supporting function for getAllEmailThreads
const getEmailThreads = async (grantId: string, contacts: string[], pageToken?: string) => {
  try {
    const threads = await rateLimitedNylas.listThreads({
      identifier: grantId,
      queryParams: {
        anyEmail: contacts,
        ...(pageToken ? { pageToken } : {}),
      }
    });

    return threads;
  } catch (error) {
    console.error('Error getting email threads:', error);
    throw error;
  }
};

// Get all email threads for a given grant id and array of contacts. Returns a list of thread ids
export const getAllEmailThreads = async (grantId: string, contacts: string[]) => {
  try {
    let allThreadsData: any[] = [];
    
    // Get initial threads
    let currentThreads = await getEmailThreads(grantId, contacts);
    allThreadsData = [...allThreadsData, ...currentThreads.data];
    
    // Continue fetching as long as there's a next page
    while (currentThreads.nextCursor) {
      currentThreads = await getEmailThreads(grantId, contacts, currentThreads.nextCursor);
      allThreadsData = [...allThreadsData, ...currentThreads.data];
    }

    return allThreadsData;
  } catch (error) {
    // Error is already logged in getEmailThreads, rethrow it
    throw error;
  }
};

// Supporting function for getEmailThread
const getEmails = async (grantId: string, threadId: string) => {
  try {
    let allEmails: any[] = [];

    //get initial emails
    let currentEmails = await rateLimitedNylas.listMessages({
      identifier: grantId,
      queryParams: {
        threadId: threadId,
      }
    });
    
    allEmails = [...allEmails, ...currentEmails.data];

    //continue fetching as long as there's a next page
    while (currentEmails.nextCursor) {
      currentEmails = await rateLimitedNylas.listMessages({
        identifier: grantId,
        queryParams: {
          threadId: threadId,
          pageToken: currentEmails.nextCursor,
        }
      });
      allEmails = [...allEmails, ...currentEmails.data];
    }

    return allEmails;
  } catch (error) {
    console.error('Error getting emails:', error);
    throw error;
  }
};

// Get's all emails for a series of thread ids
export const getEmailThread = async (grantId: string, threadIds: string[], contact: IContact, user: IUser) => {
  try {
    let allEmails: any[] = [];
    
    for (const threadId of threadIds) {
      const emails = await getEmails(grantId, threadId);
      allEmails = [...allEmails, ...emails];
    }

    for (const email of allEmails) {

      let emailActivity = {
        messageId: email.id,
        threadId: email.threadId,
        from: email.from,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        body: email.body,
        htmlBody: email.htmlBody,
        attachments: Array.isArray(email.attachments) ? email.attachments.map((attachment: any) => attachment.id || '') : [],
        emailAttachments: email.attachments,
        receivedDate: email.receivedDate ? new Date(email.receivedDate * 1000) : null,
        date: email.date ? new Date(email.date * 1000) : new Date(),
        folders: email.folders,
        headers: email.headers,
        in_reply_to: email.in_reply_to,
        metadata: email.metadata,
        reply_to: email.reply_to,
        snippet: email.snippet,
        starred: email.starred,
        raw_mime: email.raw_mime,
        isDraft: email.isDraft,
        isSent: email.isSent,
        isRead: !email.unread,
        nylasGrantId: email.nylasGrantId,
        nylasMessageId: email.nylasMessageId,
        nylasThreadId: email.nylasThreadId,
        title: email.title,
        status: email.status,
        contacts: [contact._id],
        organization: user.organization,
        createdBy: user._id,
        prospect: contact.prospect,
      }

      const emailActivityDoc = await EmailActivity.findOneAndUpdate(
        { messageId: email.id }, 
        emailActivity, 
        { upsert: true, new: true }
      );
      
      // Update the contact's emailActivity field with this message
      await Contact.findByIdAndUpdate(
        contact._id,
        { $addToSet: { emailActivities: emailActivityDoc._id } }
      );
    }
    return allEmails;
  } catch (error) {
    // Error is already logged in getEmails or database operations, rethrow it
    console.error('Error in getEmailThread:', error);
    throw error;
  }
};

export interface NylasSendMessageResponse {
  success: boolean;
  data?: any;
  error?: any;
  message?: string;
}

export interface NylasEventMutationResponse {
  success: boolean;
  data?: any;
  error?: any;
  message?: string;
}

type MeetingEventPayload = {
  title: string;
  description?: string;
  location?: string;
  startTime: number;
  endTime: number;
  attendees: Array<{ email: string; name?: string }>;
  notifyParticipants?: boolean;
};

const getConferencingProviderForConnection = async (
  grantId: string
): Promise<'Google Meet' | 'Microsoft Teams' | null> => {
  const connection = await NylasConnection.findOne({ grantId }).select('provider');
  const provider = (connection?.provider || '').toLowerCase();

  if (provider === 'google' || provider === 'gmail') return 'Google Meet';
  if (provider === 'microsoft' || provider === 'outlook') return 'Microsoft Teams';
  return null;
};

export const nylasCreateEvent = async (
  grantId: string,
  calendarId: string,
  eventData: MeetingEventPayload
): Promise<NylasEventMutationResponse> => {
  try {
    const conferencingProvider = await getConferencingProviderForConnection(grantId);
    const createdEvent = await rateLimitedNylas.createEvent({
      identifier: grantId,
      requestBody: {
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        when: {
          startTime: eventData.startTime,
          endTime: eventData.endTime
        },
        participants: eventData.attendees.map((attendee) => ({
          email: attendee.email,
          name: attendee.name || '',
          status: 'noreply'
        })),
        ...(conferencingProvider ? { conferencing: { provider: conferencingProvider, autocreate: {} } } : {})
      },
      queryParams: {
        calendarId,
        notifyParticipants: eventData.notifyParticipants ?? true
      }
    });

    return { success: true, data: createdEvent };
  } catch (error: any) {
    console.error('Failed to create event:', error);
    return {
      success: false,
      error,
      message: 'Failed to create event'
    };
  }
};

export const nylasUpdateEvent = async (
  grantId: string,
  calendarId: string,
  eventId: string,
  eventData: MeetingEventPayload
): Promise<NylasEventMutationResponse> => {
  try {
    const updatedEvent = await rateLimitedNylas.updateEvent({
      identifier: grantId,
      eventId,
      requestBody: {
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        when: {
          startTime: eventData.startTime,
          endTime: eventData.endTime
        },
        participants: eventData.attendees.map((attendee) => ({
          email: attendee.email,
          name: attendee.name || '',
          status: 'noreply'
        }))
      },
      queryParams: {
        calendarId,
        notifyParticipants: eventData.notifyParticipants ?? true
      }
    });

    return { success: true, data: updatedEvent };
  } catch (error: any) {
    console.error('Failed to update event:', error);
    return {
      success: false,
      error,
      message: 'Failed to update event'
    };
  }
};

export const nylasCancelEvent = async (
  grantId: string,
  calendarId: string,
  eventId: string,
  notifyParticipants: boolean = true
): Promise<NylasEventMutationResponse> => {
  try {
    const queryParams: Record<string, any> = { calendarId };
    if (typeof notifyParticipants === 'boolean') {
      queryParams.notifyParticipants = notifyParticipants;
    }

    const cancelledEvent = await rateLimitedNylas.destroyEvent({
      identifier: grantId,
      eventId,
      queryParams
    });

    return { success: true, data: cancelledEvent };
  } catch (error: any) {
    console.error('Failed to cancel event:', error);
    return {
      success: false,
      error,
      message: 'Failed to cancel event'
    };
  }
};

/**
 * Append quoted email history (like Gmail) when replying to a message.
 * Looks up the previous message by EmailActivity.messageId; if not found, tries Nylas API.
 */
async function appendQuotedHistoryIfReply(
  replyToMessageId?: string,
  htmlBody?: string,
  body?: string,
  grantId?: string
): Promise<string> {
  // If we have plain text but no HTML, and we're replying, convert plain text to HTML
  // so that we can properly quote the previous message
  let effectiveHtmlBody = htmlBody;
  if (!effectiveHtmlBody && body && replyToMessageId) {
    // Check if body is already HTML or plain text
    if (/<[^>]+>/.test(body)) {
      // Body contains HTML tags, use as-is
      effectiveHtmlBody = body;
    } else {
      // Plain text - convert to HTML with proper escaping
      effectiveHtmlBody = '<p>' + escapeHtml(body).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>') + '</p>';
    }
  }
  
  const baseContent = effectiveHtmlBody || body || '';
  if (!replyToMessageId) {
    return baseContent;
  }

  try {
    // Try to find the previous message in our DB first
    let previous: any | null = await EmailActivity.findOne({ messageId: replyToMessageId });

    // If not found, best-effort fetch directly from Nylas
    if (!previous && grantId) {
      try {
        const found = await rateLimitedNylas.findMessage({
          identifier: grantId,
          messageId: replyToMessageId
        });
        const d: any = found?.data || {};
        previous = {
          htmlBody: d.htmlBody,
          body: d.body,
          from: d.from,
          date: d.date ? new Date(d.date * 1000) : undefined,
          subject: d.subject
        };
      } catch (e) {
        // Ignore fetch failure and proceed without quoting
      }
    }

    if (!previous) {
      return baseContent;
    }

    const senderName = Array.isArray(previous.from) && previous.from.length > 0
      ? previous.from[0].name || previous.from[0].email || ''
      : '';
    const senderEmail = Array.isArray(previous.from) && previous.from.length > 0
      ? previous.from[0].email || ''
      : '';
    const sentDate: Date | undefined = previous.date instanceof Date ? previous.date : (previous.date ? new Date(previous.date) : undefined);
    
    // Format date like Gmail: "Fri, Oct 24, 2025 at 23:50:14"
    let gmailDateStr = '';
    if (sentDate) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayName = days[sentDate.getDay()];
      const monthName = months[sentDate.getMonth()];
      const day = sentDate.getDate();
      const year = sentDate.getFullYear();
      const hours = String(sentDate.getHours()).padStart(2, '0');
      const minutes = String(sentDate.getMinutes()).padStart(2, '0');
      const seconds = String(sentDate.getSeconds()).padStart(2, '0');
      gmailDateStr = `${dayName}, ${monthName} ${day}, ${year} at ${hours}:${minutes}:${seconds}`;
    }

    // Build HTML quoted block (we now always have HTML due to conversion above)
    if (effectiveHtmlBody) {
      let quotedInner = '';
      if (previous.htmlBody) {
        quotedInner = sanitizeHtmlForQuoting(previous.htmlBody);
        // Double-check: if sanitized content still has document tags, fall back to plain text
        if (quotedInner && /<\/?(html|head|body|doctype)[^>]*>/i.test(quotedInner)) {
          // Sanitization failed, extract plain text instead
          const plainText = previous.body || stripHtmlTags(previous.htmlBody || '');
          quotedInner = `<div style="white-space:pre-wrap">${escapeHtml(plainText).replace(/\n/g, '<br/>')}</div>`;
        }
      }
      if (!quotedInner) {
        // If previous message has body, try to sanitize it first
        if (previous.body) {
          // Check if body contains HTML tags (is it HTML or plain text?)
          if (/<[^>]+>/.test(previous.body)) {
            const sanitized = sanitizeHtmlForQuoting(previous.body);
            if (sanitized && !/<\/?(html|head|body|doctype)[^>]*>/i.test(sanitized)) {
              quotedInner = sanitized;
            } else {
              // Sanitization failed, extract plain text
              const plainText = stripHtmlTags(previous.body);
              quotedInner = `<div style="white-space:pre-wrap">${escapeHtml(plainText).replace(/\n/g, '<br/>')}</div>`;
            }
          } else {
            // Plain text body
            quotedInner = `<div style="white-space:pre-wrap">${escapeHtml(previous.body).replace(/\n/g, '<br/>')}</div>`;
          }
        } else {
          quotedInner = '<div>No previous message content</div>';
        }
      }

      const safeSenderName = senderName ? escapeHtml(senderName) : '';
      const safeSenderEmail = senderEmail ? escapeHtml(senderEmail) : '';
      const emailLink = safeSenderEmail
        ? `<span dir="ltr">&lt;<a href="mailto:${safeSenderEmail}" target="_blank">${safeSenderEmail}</a>&gt;</span>`
        : '';
      const identityParts = [safeSenderName, emailLink].filter(Boolean);
      const identityHtml = identityParts.length > 0 ? identityParts.join(' ').trim() : 'the sender';
      const attribution = gmailDateStr
        ? `On ${gmailDateStr}, ${identityHtml} wrote:`
        : `${identityHtml} wrote:`;

      // Match Gmail's exact structure: attribution with <br/> followed by blockquote
      const quotedBlock = `<br clear="all"/><div class="gmail_quote">${attribution}<br/><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${quotedInner}</blockquote></div>`;
      return `${baseContent}${quotedBlock}`;
    }

    // Plain text quoting (when no HTML body is provided)
    const prevText = previous.body || stripHtmlTags(previous.htmlBody || '');
    const quotedText = prefixLines(prevText, '> ');
    const sender = senderName && senderEmail ? `${senderName} <${senderEmail}>` : (senderName || senderEmail || 'sender');
    const sentDateStr = sentDate ? sentDate.toUTCString() : '';
    const headerLine = sentDateStr ? `On ${sentDateStr}, ${sender} wrote:` : `${sender} wrote:`;
    return `${baseContent}\n\n${headerLine}\n${quotedText}`;
  } catch (err) {
    // On any error, just return original body
    return baseContent;
  }
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, '');
}

function prefixLines(input: string, prefix: string): string {
  return input.split(/\r?\n/).map(line => `${prefix}${line}`).join('\n');
}

export const nylasSendMessage = async (
  grantId: string, 
  subject: string, 
  to: { name: string, email: string }[], 
  cc?: { name: string, email: string }[],
  bcc?: { name: string, email: string }[],
  replyToMessageId?: string,
  attachments?: { id: string, filename: string, filePath?: string, contentType: string, size: number }[],
  htmlBody?: string,
  body?: string,
  organizationId?: string
): Promise<NylasSendMessageResponse> => {
  
  try {
    // Build the final body, appending quoted history if replying
    const finalBody = await appendQuotedHistoryIfReply(replyToMessageId, htmlBody, body, grantId);
    // If attachments, use multipart approach
    if (attachments && attachments?.length > 0) {
      return await sendMessageWithMultipartAttachments(grantId, subject, to, cc, bcc, replyToMessageId, attachments, htmlBody, body, organizationId);
    }

    // Build message data structure
    const messageData = {
      subject: subject,
      to: to,
      ...(cc && cc.length > 0 && { cc }),
      ...(bcc && bcc.length > 0 && { bcc }),
      body: finalBody,
      ...(replyToMessageId && { replyToMessageId })
    };
    
    // Use rate-limited client which handles retries, timeouts, and rate limiting
    const sentMessage = await rateLimitedNylas.sendMessage({
      identifier: grantId,
      requestBody: messageData
    });
    
    return { success: true, data: sentMessage };
    
  } catch (error: any) {
    console.error('Failed to send message:', error);
    
    // Check if it's a rate limit error with additional context
    const isRateLimit = error.isRateLimit || error.status === 429 || error.statusCode === 429;
    
    return {
      success: false,
      error: error,
      message: isRateLimit 
        ? `Rate limit exceeded for ${error.provider || 'unknown provider'}. ${error.retryAfter ? `Retry after ${error.retryAfter}ms.` : 'Please try again later.'}` 
        : 'Failed to send message'
    };
  }
}

/**
 * Send email with attachments using multipart/form-data
 * This function handles the multipart upload as recommended by Nylas documentation
 */
const sendMessageWithMultipartAttachments = async (
  grantId: string,
  subject: string,
  to: { name: string, email: string }[],
  cc?: { name: string, email: string }[],
  bcc?: { name: string, email: string }[],
  replyToMessageId?: string,
  attachments?: { id: string, filename: string, filePath?: string, contentType: string, size: number }[],
  htmlBody?: string,
  body?: string,
  organizationId?: string
): Promise<NylasSendMessageResponse> => {
  try {
    // Add message data as JSON
    const finalBody = await appendQuotedHistoryIfReply(replyToMessageId, htmlBody, body, grantId);
    const messageData = {
      subject: subject,
      to: to,
      ...(cc && cc.length > 0 && { cc }),
      ...(bcc && bcc.length > 0 && { bcc }),
      body: finalBody,
      ...(replyToMessageId && { replyToMessageId })
    };
    
    // Prepare attachments for Nylas SDK
    const attachmentFiles: any[] = [];
    if (attachments && attachments.length > 0 && organizationId) {
      for (const attachment of attachments) {
        if (attachment.filePath) {
          try {
            const fileData = await getEmailAttachment(attachment.filePath, organizationId);
            
            // According to Nylas SDK docs, for files < 3MB use base64 string
            // For files >= 3MB, use buffer or readable stream
            const content = fileData.buffer.length >= 3 * 1024 * 1024 
              ? fileData.buffer  // Keep as buffer for files >= 3MB
              : fileData.buffer.toString('base64');  // Convert to base64 for smaller files
            
            attachmentFiles.push({
              filename: attachment.filename,
              contentType: attachment.contentType,
              content: content,
              size: fileData.buffer.length  // Use actual file size
            });
          } catch (error) {
            console.error(`Error loading attachment ${attachment.filename}:`, error);
            // Continue with other attachments
          }
        }
      }
    }

    // Prepare the complete message data for Nylas SDK
    const messageDataWithAttachments = {
      ...messageData,
      ...(attachmentFiles.length > 0 && { attachments: attachmentFiles })
    };

    // Use the Nylas SDK to send the message with attachments
    const result = await rateLimitedNylas.sendMessage({
      identifier: grantId,
      requestBody: messageDataWithAttachments
    });
    
    // Clean up temporary attachment files after successful send
    if (attachments && attachments.length > 0 && organizationId) {
      try {
        await cleanupEmailAttachments(
          attachments.map(att => ({
            id: att.id,
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            filePath: att.filePath
          })),
          organizationId
        );
      } catch (cleanupError) {
        console.error('Error cleaning up attachments after send:', cleanupError);
        // Don't fail the send operation due to cleanup errors
      }
    }
    
    return { success: true, data: result };
    
  } catch (error: any) {
    console.error('Error sending message with multipart attachments:', error);
    return {
      success: false,
      error: error,
      message: `Failed to send message with attachments: ${error.message}`
    };
  }
};

// Get up to 5 calendars for a given grant id
export const getAvailableCalendars = async (grantId: string) => {
    try {
    const calendars = await rateLimitedNylas.listCalendars({
      identifier: grantId,
      limit: 5
  })

  return calendars;
  } catch (error) {
    console.error('Error fetching calendars:', error)
    throw error;
  }
}

// Get all events for a given grant id, calendar id and prospect
export const getAllAvailableEventsForProspect = async (grantId: string, calendarId: string, prospect: any) => {
  const contacts = prospect?.contacts;

  if (!contacts || contacts.length === 0) {
    return []; // Return empty array if no contacts found
  }

  const attendees = contacts?.flatMap((contact: any) => 
    contact.emails?.map((e: any) => e.address) || []
  ).filter(Boolean); // Filter out null/undefined emails
  let allEvents: any[] = [];
  
  for (const attendee of attendees) {
    try {
      const events = await rateLimitedNylas.listEvents({
        identifier: grantId,
        queryParams: {
          calendarId: calendarId,
          attendees: attendee,
          start: `${Math.floor(new Date().setFullYear(new Date().getFullYear() - 3) / 1000)}`,
        }
      });
      allEvents = [...allEvents, ...events.data];
    } catch (error) {
      console.error('Error fetching events:', error);
      // Continue with other attendees even if one fails
      continue;
    }
  }

  // Process and save events to CalendarActivity
  const calendarActivities = await processCalendarEvents(allEvents, grantId, calendarId, prospect);
  
  return calendarActivities;
}

// Helper function to process and save events
const processCalendarEvents = async (events: any[], grantId: string, calendarId: string, prospect: any, createdBy?: mongoose.Types.ObjectId) => {
  const processed = [];

  for (const event of events) {
    try {
      // Validate required properties to avoid Invalid Date errors
      if (!event.when || typeof event.when.startTime !== 'number' || typeof event.when.endTime !== 'number') {
        console.warn('Skipping event with invalid or missing when/time properties:', event.id);
        continue;
      }

      const contacts = prospect?.contacts;
      console.log('contacts', contacts);

      // Determine createdBy - use provided value or find a user from the organization
      let activityCreatedBy = createdBy;
      if (!activityCreatedBy) {
        // Find a user from the organization as fallback
        const User = mongoose.model('User');
        const defaultUser = await User.findOne({ organization: prospect.organization });
        activityCreatedBy = defaultUser?._id;
      }

      // Map Nylas event to CalendarActivity format - only include fields in the schema
      const startTime = new Date(event.when.startTime * 1000);
      const calendarActivityData = {
        organization: prospect.organization,
        type: 'calendar',
        calendarId: event.calendar_id || event.calendarId,
        eventId: event.id,
        title: event.title || 'Untitled Event',
        description: event.description,
        status: mapEventStatus(event.status, event.when.endTime),
        startTime: startTime,
        endTime: new Date(event.when.endTime * 1000),
        date: startTime, // Required field: date equals startTime
        timezone: event.when?.startTimezone || event.when?.timezone || 'UTC',
        location: event.location,
        attendees: mapParticipants(event.participants),
        contacts: contacts.filter((contact: any) => 
          event.participants.some((participant: any) => 
            contact.emails.some((e: any) => e.address === participant.email)
          )
        ).map((contact: any) => contact._id),
        prospect: prospect._id, // Required field: prospect reference
        createdBy: activityCreatedBy, // Required field: user who created this
        nylasGrantId: grantId,
        nylasCalendarId: calendarId,
        nylasEventId: event.id,
        busy: event.busy || false,
        htmlLink: event.html_link,
        icalUid: event.ical_uid,
        readOnly: event.read_only || false,
        hideParticipants: event.hide_participants || false,
        creator: event.creator,
        organizer: event.organizer,
        conferencing: event.conferencing,
        reminders: event.reminders,
      };

      // Find existing calendar activity or create a new one
      let calendarActivity = await CalendarActivity.findOne({ 
        organization: prospect.organization,
        nylasEventId: event.id,
        nylasCalendarId: calendarId
      });

      if (calendarActivity) {
        // Update existing activity
        Object.assign(calendarActivity, calendarActivityData);
        await calendarActivity.save();
      } else {
        // Create new activity
        calendarActivity = new CalendarActivity(calendarActivityData);
        await calendarActivity.save();
      }

      // Update each contact's calendarActivities array with this calendar activity
      if (contacts && event.participants && event.participants.length > 0) {
        let updateContacts = contacts.filter((contact: any) => 
          event.participants?.some((participant: any) => 
            contact.emails.some((e: any) => e.address === participant.email)
          )
        ).map((contact: any) => contact._id);

        for (const contactId of updateContacts) {
          await Contact.findByIdAndUpdate(
            contactId,
            { $addToSet: { calendarActivities: calendarActivity._id } },
            { new: true }
          );
        }
      }

      processed.push(calendarActivity);
    } catch (error) {
      console.error('Error processing event:', error);
      // Continue with other events
    }
  }

  return processed;
};

// Map Nylas event status to CalendarActivity status
const mapEventStatus = (status: string, endTime?: number): 'to_do' | 'scheduled' | 'completed' | 'cancelled' => {
  // If event is confirmed and already passed, mark as completed
  if (status === 'confirmed' && endTime && (endTime * 1000) < Date.now()) {
    return 'completed';
  }

  switch (status) {
    case 'confirmed':
      return 'scheduled';
    case 'cancelled':
      return 'cancelled';
    case 'tentative':
      return 'to_do';
    default:
      return 'scheduled';
  }
};

// Map Nylas participants to CalendarActivity attendees
const mapParticipants = (participants: any[] = []) => {
  return participants.map(participant => ({
    email: participant.email,
    name: participant.name,
    responseStatus: mapParticipantStatus(participant.status)
  }));
};

// Map Nylas participant status to CalendarActivity response status
const mapParticipantStatus = (status: string): 'accepted' | 'declined' | 'tentative' | 'needsAction' => {
  switch (status) {
    case 'yes':
      return 'accepted';
    case 'no':
      return 'declined';
    case 'maybe':
      return 'tentative';
    default:
      return 'needsAction';
  }
};

/**
 * Expected payload structure for message.created notifications (as of 05.07.2024):
 * {
 *   "specversion": "1.0",
 *   "type": "message.created",
 *   "source": "/google/emails/realtime",
 *   "id": "<WEBHOOK_ID>",
 *   "time": 1723821985,
 *   "webhook_delivery_attempt": 1,
 *   "data": {
 *     "application_id": "<NYLAS_APPLICATION_ID>",
 *     "object": {
 *       "attachments": [{
 *         "content_disposition": "attachment; filename=\"image.jpg\"",
 *         "content_id": "<CID>",
 *         "content_type": "image/jpeg; name=\"image.jpg\"",
 *         "filename": "image.jpg",
 *         "grant_id": "<NYLAS_GRANT_ID>",
 *         "id": "<ATTACHMENT_ID>",
 *         "is_inline": false,
 *         "size": 4860136
 *       }],
 *       "bcc": [{
 *         "email": "example@email.com"
 *       }],
 *       "body": "<div dir=\"ltr\">Message content</div>\r\n",
 *       "cc": [{
 *         "email": "example@email.com"
 *       }],
 *       "date": 1723821981,
 *       "folders": ["SENT"],
 *       "from": [{
 *         "email": "sender@email.com",
 *         "name": "Sender Name"
 *       }],
 *       "grant_id": "<NYLAS_GRANT_ID>",
 *       "id": "<MESSAGE_ID>",
 *       "metadata": {
 *         "key1": "value1",
 *         "key2": "value2"
 *       },
 *       "object": "message",
 *       "reply_to": [],
 *       "snippet": "Message snippet",
 *       "starred": false,
 *       "subject": "Message subject",
 *       "thread_id": "<THREAD_ID>",
 *       "to": [{
 *         "email": "recipient@email.com"
 *       }],
 *       "unread": false
 *     }
 *   }
 * }
 */
// Process a new email activity from webhook
export const processNewEmailActivity = async (email: any) => {
  try {
    // Check if the message is truncated and fetch the full message if needed
    if (email.truncated) {
      try {
        //no longer uses webhook formatting.
        const fullMessage = await rateLimitedNylas.findMessage({
          identifier: email.grant_id,
          messageId: email.id
        });
        
        // Replace the truncated email with the full message
        // Transform camelCase properties to snake_case format
        const data = fullMessage.data as any;
        email = {
          ...data,
          grant_id: email.grant_id, // Preserve original grant_id
          id: data.id,
          thread_id: data.threadId,
          html_body: data.htmlBody,
          is_draft: data.isDraft,
          is_sent: data.isSent,
          unread: !data.isRead,
          raw_mime: data.rawMime,
          attachments: data.attachments
        };
      } catch (error) {
        console.error('Error fetching full message:', error);
        // Continue with truncated message if we can't fetch the full one
      }
    }
    
    const nylasConnection = await NylasConnection.findOne({ grantId: email.grant_id });

    if (!nylasConnection) {
      console.log('No Nylas connection found');
      return;
    }
    
    const user = await User.findById(nylasConnection.user);

    if (!user) {
      console.log('No user found');
      return;
    }

    
    
    // Get all organization domains to exclude from contact creation
    const orgNylasConnections = await NylasConnection.find({ organization: user.organization }, 'email');
    const organizationDomains = new Set<string>();
    
    orgNylasConnections.forEach(connection => {
      if (connection.email) {
        const domain = connection.email.split('@')[1];
        if (domain) {
          organizationDomains.add(domain);
        }
      }
    });
    
    console.log(`[NYLAS-EMAIL] Organization domains to exclude: ${Array.from(organizationDomains).join(', ')}`);
    
    // Find all contacts that match any email address in the message
    const emailAddresses: string[] = [];
    const normalizeEmail = (addr?: string) => (typeof addr === 'string' ? addr.trim().toLowerCase() : '');
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Add from addresses
    if (email.from && email.from.length > 0) {
      emailAddresses.push(normalizeEmail(email.from[0].email));
    }
    
    // Add to addresses
    if (email.to && email.to.length > 0) {
      email.to.forEach((recipient: { email: string }) => {
        emailAddresses.push(normalizeEmail(recipient.email));
      });
    }
    
    // Add cc addresses
    if (email.cc && email.cc.length > 0) {
      email.cc.forEach((recipient: { email: string }) => {
        emailAddresses.push(normalizeEmail(recipient.email));
      });
    }
    
    // Add bcc addresses
    if (email.bcc && email.bcc.length > 0) {
      email.bcc.forEach((recipient: { email: string }) => {
        emailAddresses.push(normalizeEmail(recipient.email));
      });
    }
    
    // Dedupe and filter out organization domains from email addresses
    const dedupedEmails = Array.from(new Set(emailAddresses.filter(Boolean)));
    const externalEmailAddresses = dedupedEmails.filter(emailAddr => {
      const domain = emailAddr.split('@')[1];
      const isOrgDomain = organizationDomains.has(domain);
      if (isOrgDomain) {
        console.log(`[NYLAS-EMAIL] Filtering out organization email: ${emailAddr}`);
      }
      return !isOrgDomain;
    });
    
    console.log(`[NYLAS-EMAIL] Processing ${externalEmailAddresses.length} external emails (filtered ${emailAddresses.length - externalEmailAddresses.length} organization emails)`);
    
    // Find all contacts that match any of the external email addresses (case-insensitive, scoped by org)
    let contacts = [] as any[];
    if (externalEmailAddresses.length > 0) {
      const emailRegexes = externalEmailAddresses.map(e => new RegExp(`^${escapeRegex(e)}$`, 'i'));
      contacts = await Contact.find({
        organization: user.organization,
        $or: emailRegexes.map(rx => ({ 'emails.address': rx }))
      });
    }
    
    // For external email addresses without a contact, check if they belong to a prospect
    const existingEmails = contacts.flatMap(contact => contact.emails.map((e: any) => normalizeEmail(e.address)));
    const newEmailAddresses = externalEmailAddresses.filter(email => !existingEmails.includes(normalizeEmail(email)));
    
    if (newEmailAddresses.length > 0) {
      const contactProspectIds = contacts.map(c => c.prospect).filter(Boolean);
      const uniqueProspectIds = [...new Set(contactProspectIds.map((id: any) => id.toString()))];
      const singleProspectContextId = uniqueProspectIds.length === 1 ? uniqueProspectIds[0] : null;

      // Pre-fetch prospect context for AI domain validation
      let prospectContext: { name?: string; domains?: string[] } = {};
      if (singleProspectContextId) {
        try {
          const contextProspect = await Prospect.findById(singleProspectContextId).select('name domains').lean();
          if (contextProspect) {
            prospectContext = {
              name: contextProspect.name,
              domains: contextProspect.domains || [],
            };
            console.log(`[NYLAS-EMAIL] Using prospect context for domain validation: ${contextProspect.name} (domains: ${contextProspect.domains?.join(', ') || 'none'})`);
          }
        } catch (err) {
          console.warn('[NYLAS-EMAIL] Failed to fetch prospect context for domain validation', err);
        }
      }

      // Process each new email address
      for (const emailAddress of newEmailAddresses) {
        // Extract domain
        const domain = emailAddress.split('@')[1];
        let prospect: any = null;
        let decision: any = null;
        let contextName = prospectContext.name;
        let contextDomains = prospectContext.domains;

        // First, see if the domain already maps to a known prospect (cheap lookup, no LLM)
        if (domain) {
          prospect = await Prospect.findOne({ domains: { $in: [domain] }, organization: user.organization });
          if (prospect) {
            contextName = prospect.name;
            contextDomains = prospect.domains || [];
          }
        }

        // If we have no prospect and no single-prospect context, skip entirely (avoid LLM)
        if (!prospect && !singleProspectContextId) {
          console.log(`[NYLAS-EMAIL] Skipping ${emailAddress} - no prospect context available for domain ${domain}`);
          continue;
        }

        // Single decision call for both domain inclusion and personhood (only when we have context)
        decision = await getDomainDecision(domain, {
          organizationId: user.organization,
          opportunityId: email.opportunityId || undefined,
          contactEmail: emailAddress,
          emailContext: email.subject,
          prospectName: contextName,
          existingDomains: contextDomains,
        });

        // Personhood check (service/no-reply guard)
        if (decision.isPersonLikely === false) {
          console.log(`[NYLAS-EMAIL] Skipping contact creation for ${emailAddress} (service/no-reply): ${decision.reasoning}`);
          continue;
        }

        const excludeDomain = !decision.shouldInclude;

        if (domain && !excludeDomain) {
          // If we still don't have a prospect, try smart association using the single prospect context
          if (!prospect && singleProspectContextId) {
            try {
              console.log(`[NYLAS-EMAIL] Attempting smart domain association for ${domain} with single prospect context`);
              
              const existingProspect = await Prospect.findById(singleProspectContextId);
              
              if (!existingProspect) {
                console.error(`[NYLAS-EMAIL] Prospect ${singleProspectContextId} not found for smart domain association`);
              } else {
                const prospectInfo = `${existingProspect.name} (${existingProspect._id})`;
                
                // Validate domain before adding
                if (!domain || typeof domain !== 'string' || !domain.includes('.')) {
                  console.error(`[NYLAS-EMAIL] Invalid domain format for smart association: ${domain}`);
                } else if (existingProspect.domains?.includes(domain)) {
                  console.log(`[NYLAS-EMAIL] Domain ${domain} already exists in prospect ${prospectInfo}`);
                  prospect = existingProspect;
                } else {
                  console.log(`[NYLAS-EMAIL] Adding domain ${domain} to existing prospect ${prospectInfo} based on email context`);
                  
                  try {
                    existingProspect.domains = [...(existingProspect.domains || []), domain];
                    await existingProspect.save(); // This triggers our domain change detection middleware!
                    prospect = existingProspect;
                    console.log(`[NYLAS-EMAIL] Successfully associated domain ${domain} with prospect ${prospectInfo}`);
                  } catch (saveError: unknown) {
                    const errorMessage = saveError instanceof Error ? (saveError as Error).message : 'Unknown save error';
                    console.error(`[NYLAS-EMAIL] Failed to save domain ${domain} to prospect ${prospectInfo}: ${errorMessage}`);
                  }
                }
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.error(`[NYLAS-EMAIL] Error in smart domain association for ${domain}: ${errorMessage}`);
              // Continue processing - don't let smart association errors break contact creation
            }
          }
        } else if (excludeDomain && singleProspectContextId) {
          // Excluded domain but we have a clear prospect context -> allow contact creation without domain linkage
          prospect = await Prospect.findById(singleProspectContextId);
          if (prospect) {
            console.log(`[NYLAS-EMAIL] Creating contact for excluded domain ${domain} using existing prospect context ${prospect._id}`);
          }
        }
        
        if (prospect) {
          // Create a new contact for this email
          const fullName = email.from && normalizeEmail(email.from[0]?.email) === normalizeEmail(emailAddress) ? (email.from[0]?.name || '') : '';
          
          let firstName = '';
          let lastName = '';
          
          if (fullName) {
            const nameParts = fullName.trim().split(' ');
            if (nameParts.length === 1) {
              firstName = nameParts[0];
            } else if (nameParts.length > 1) {
              firstName = nameParts[0];
              lastName = nameParts.slice(1).join(' ');
            }
          }
          
          let existingContact = null;
          if (firstName && lastName) {
            existingContact = await Contact.findOne({
              firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
              lastName: { $regex: new RegExp(`^${lastName}$`, 'i') },
              prospect: prospect._id,
              organization: user.organization
            });
            
            if (existingContact) {
              console.log(`[NYLAS-EMAIL] Found existing contact with same name: ${firstName} ${lastName} (${existingContact._id}), merging email`);
              
              const existingEmailAddresses = existingContact.emails.map((e: any) => normalizeEmail(e.address));
              const normalizedToAdd = normalizeEmail(emailAddress);
              if (!existingEmailAddresses.includes(normalizedToAdd)) {
                await Contact.findByIdAndUpdate(
                  existingContact._id,
                  { $addToSet: { emails: { address: normalizedToAdd, category: 'work', isPrimary: false } } }
                );
                console.log(`[NYLAS-EMAIL] Added email ${normalizedToAdd} to existing contact: ${firstName} ${lastName}`);
              } else {
                console.log(`[NYLAS-EMAIL] Email ${normalizedToAdd} already exists on contact ${firstName} ${lastName}`);
              }
              
              contacts.push(existingContact);
            }
          }
          
          let savedContact = existingContact;
          if (!existingContact) {
            const normalizedEmail = normalizeEmail(emailAddress);
            
            try {
              const newContact = new Contact({
                emails: [{
                  address: normalizedEmail,
                  category: 'work',
                  isPrimary: true
                }],
                firstName,
                lastName,
                prospect: prospect._id,
                organization: user.organization,
                createdBy: user._id,
                domainExcluded: excludeDomain,
                origin: excludeDomain ? 'external_cc' : 'nylas_email',
              });
              
              savedContact = await newContact.save();
              
              contacts.push(savedContact);
              
              await Prospect.findByIdAndUpdate(
                prospect._id,
                { $addToSet: { contacts: savedContact._id } }
              );
              
              console.log(`Created new contact for ${emailAddress} on prospect ${prospect._id} (domainExcluded=${excludeDomain})`);
            } catch (createError: any) {
              // Handle duplicate key error (race condition - contact created by parallel process)
              if (createError.code === 11000) {
                console.log(`[NYLAS-EMAIL] Contact with email ${normalizedEmail} already exists (race condition), finding existing...`);
                savedContact = await Contact.findOne({
                  organization: user.organization,
                  'emails.address': { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i') }
                });
                if (savedContact) {
                  contacts.push(savedContact);
                  console.log(`[NYLAS-EMAIL] Found existing contact ${savedContact._id} for ${normalizedEmail}`);
                } else {
                  console.error(`[NYLAS-EMAIL] Duplicate key error but contact not found for ${normalizedEmail}`);
                }
              } else {
                throw createError;
              }
            }
          }

          if (savedContact) {
            const allOpportunities = await Opportunity.find({ 
              prospect: prospect._id 
            }).populate('stage');

            if (allOpportunities.length > 0) {
              let targetOpportunity: IOpportunity;

              if (allOpportunities.length === 1) {
                targetOpportunity = allOpportunities[0];
              } else {
                const activeOpportunities = allOpportunities.filter(
                  (opp) => {
                    const stage = opp.stage as any;
                    return !stage?.isClosedWon && !stage?.isClosedLost;
                  }
                );

                if (activeOpportunities.length === 1) {
                  targetOpportunity = activeOpportunities[0];
                  console.log(`Adding contact ${savedContact._id} to the single active opportunity: ${activeOpportunities[0]._id}`);
                } else if (activeOpportunities.length > 1) {
                  activeOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
                  targetOpportunity = activeOpportunities[0];
                  console.log(`Adding contact ${savedContact._id} to most recently updated active opportunity: ${targetOpportunity._id}`);
                } else {
                  allOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
                  targetOpportunity = allOpportunities[0];
                  console.log(`Adding contact ${savedContact._id} to most recently updated closed opportunity: ${targetOpportunity._id}`);
                }
              }

              await Opportunity.findByIdAndUpdate(
                targetOpportunity._id,
                { $addToSet: { contacts: savedContact._id } }
              );
              
              await Contact.findByIdAndUpdate(
                savedContact._id,
                { $addToSet: { opportunities: targetOpportunity._id } }
              );

              console.log(`Successfully linked contact ${savedContact._id} to opportunity ${targetOpportunity._id}`);
            } else {
              console.log(`No opportunities found for prospect ${prospect._id} - contact ${savedContact._id} not linked to opportunity`);
            }
          }
        }
      }
    }
    
    if (contacts.length === 0) {
      console.log('No contacts found or created for any email addresses in the message');
      return;
    }
    
    // Get contact IDs for the email activity
    const uniqueEmailContacts = new Map<string, any>();
    for (const c of contacts) {
      const key = String(c._id);
      if (!uniqueEmailContacts.has(key)) uniqueEmailContacts.set(key, c._id);
    }
    const contactIds = Array.from(uniqueEmailContacts.values());
    
    // Create/update email activity
    let emailActivity = {
      messageId: email.id,
      threadId: email.thread_id,
      from: email.from,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      body: email.body,
      htmlBody: email.html_body,
      attachments: Array.isArray(email.attachments) ? email.attachments.map((attachment: any) => attachment.id || '') : [],
      emailAttachments: email.attachments,
      receivedDate: email.receivedDate ? new Date(email.receivedDate * 1000) : null,
      date: email.date ? new Date(email.date * 1000) : new Date(),
      folders: email.folders,
      headers: email.headers,
      in_reply_to: email.in_reply_to,
      metadata: email.metadata,
      reply_to: email.reply_to,
      snippet: email.snippet,
      starred: email.starred,
      raw_mime: email.raw_mime,
      isDraft: email.is_draft,
      isSent: email.is_sent,
      isRead: !email.unread,
      nylasGrantId: email.nylasGrantId,
      nylasMessageId: email.nylasMessageId,
      nylasThreadId: email.nylasThreadId,
      title: email.title,
      status: email.status,
      contacts: contactIds, // Use all matching contact IDs
      organization: user.organization,
      createdBy: user._id,
      prospect: contacts[0].prospect,
      receivedViaWebhookAt: new Date()
    }

    // Check if this is a new email activity or just an update
    const existingEmailActivity = await EmailActivity.findOne({ messageId: email.id });
    const isNewActivity = !existingEmailActivity;

    const emailActivityDoc = await EmailActivity.findOneAndUpdate(
      { messageId: email.id }, 
      emailActivity, 
      { upsert: true, new: true }
    );

    // Only process with intelligence if this is a new email activity. Not if it's an email update.
    if (isNewActivity) {
      IntelligenceProcessor.processActivity(emailActivityDoc);
    } else {
      console.log(`[NYLAS-EMAIL] Skipping intelligence processing for existing email activity: ${email.id}`);
    }
    
    // Update each matching contact's emailActivity field with this message
    for (const contactId of contactIds) {
      await Contact.findByIdAndUpdate(
        contactId,
        { $addToSet: { emailActivities: emailActivityDoc._id } }
      );
    }
    
    return emailActivityDoc;
  } catch (error) {
    console.error('Error processing new email activity:', error);
    throw error; // Re-throw to allow caller to handle if needed
  }
}

// Process a new calendar activity from webhook
/**
 * Expected payload structure for event.created notifications (as of 05.07.2024):
 * {
 *  "specversion": "1.0",
 *  "type": "event.created",
 *  "source": "/google/events/realtime",
 *  "id": "<WEBHOOK_ID>",
 *  "time": 1695415185,
 *  "webhook_delivery_attempt": 1,
 *  "data": {
 *    "application_id": "<NYLAS_APPLICATION_ID>",
 *    "object": {
 *      "account_id": "<NYLAS_V2_ACCOUNT_ID>",
 *      "busy": true,
 *      "calendar_id": "<CALENDAR_ID>",
 *      "conferencing": {
 *        "details": {
 *          "meeting_code": "<MEETING_CODE>",
 *          "phone": ["<MEETING_PHONE_NUMBER>"],
 *          "pin": "<MEETING_PIN>",
 *          "url": "<MEETING_URL>"
 *        },
 *        "provider": "<PROVIDER>"
 *      },
 *      "created_at": 1545355476,
 *      "creator": {
 *        "email": "leyah@example.com",
 *        "name": "Leyah Miller"
 *      },
 *      "description": "<p>Weekly one-on-one.</p>",
 *      "grant_id": "<NYLAS_GRANT_ID>",
 *      "hide_participants": true,
 *      "html_link": "<EVENT_LINK>",
 *      "ical_uid": "<ICAL_UID>",
 *      "id": "<EVENT_ID>",
 *      "location": "Room 103",
 *      "metadata": {
 *        "key1": "all-meetings",
 *        "key2": "on-site"
 *      },
 *      "object": "event",
 *      "occurrences": ["<EVENT_ID>"],
 *      "organizer": {
 *        "email": "leyah@example.com",
 *        "name": "Leyah Miller"
 *      },
 *      "participants": [{
 *        "email": "nyla@example.com",
 *        "status": "yes"
 *      }],
 *      "read_only": true,
 *      "recurrence": ["RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20230420T065959Z;INTERVAL=2"],
 *      "reminders": {
 *        "overrides": [],
 *        "use_default": true
 *      },
 *      "resources": [],
 *      "sequence": 17,
 *      "status": "confirmed",
 *      "title": "One-on-one",
 *      "updated_at": 1724359724,
 *      "visibility": "default",
 *      "when": {
 *        "end_time": 1680800100,
 *        "end_timezone": "America/Los_Angeles",
 *        "object": "timespan",
 *        "start_time": 1680796800,
 *        "start_timezone": "America/Los_Angeles"
      }
 *    }
 *  }
 * }
 * 
 * Expected payload structure for event.updated notifications (as of 05.07.2024):
 * {
 *  "specversion": "1.0",
 *  "type": "event.updated",
 *  "source": "/google/events/realtime",
 *  "id": "<WEBHOOK_ID>",
 *  "time": 1732575192,
 *  "webhook_delivery_attempt": 1,
 *  "data": {
 *    "application_id": "<NYLAS_APPLICATION_ID>",
 *    "object": {
 *      "account_id": "<NYLAS_V2_ACCOUNT_ID>",
 *      "busy": true,
 *      "calendar_id": "<CALENDAR_ID>",
 *      "cancelled_occurrences": ["<EVENT_ID>"],
 *      "conferencing": {
 *        "details": {
 *          "url": "<MEETING_URL>"
 *        },
 *        "provider": "<PROVIDER>"
 *      },
 *      "created_at": 1732573232,
 *      "description": "Weekly one-on-one.",
 *      "grant_id": "<NYLAS_GRANT_ID>",
 *      "hide_participants": false,
 *      "html_link": "<EVENT_LINK>",
 *      "ical_uid": "<ICAL_UID>",
 *      "id": "<EVENT_ID>",
 *      "location": "Room 103",
 *      "object": "event",
 *      "metadata": {
 *        "key1": "all-meetings",
 *        "key2": "on-site"
 *      },
 *      "occurrences": ["<EVENT_ID>"],
 *      "organizer": {
 *        "email": "nyla@example.com",
 *        "name": "Nyla"
      },
 *      "participants": [{
 *        "email": "leyahe@example.com",
 *        "name": "Leyah Miller",
 *        "status": "noreply"
 *      }],
 *      "read_only": false,
 *      "recurrence": ["RRULE:FREQ=WEEKLY;UNTIL=20241219T000000Z;BYDAY=TH"],
 *      "reminders": {
 *        "overrides": [],
 *        "use_default": true
 *      },
 *      "resources": [],
 *      "status": "confirmed",
 *      "title": "One-on-one",
 *      "updated_at": 1732575179,
 *      "visibility": "public",
 *      "when": {
 *        "end_time": 1732811400,
 *        "end_timezone": "EST5EDT",
 *        "object": "timespan",
 *        "start_time": 1732809600,
 *        "start_timezone": "EST5EDT"
 *      }
 *    }
 *  }
 * }
 * 
 */
export const processNewCalendarActivity = async (event: any) => {
  try {
    // Check if the event is truncated and fetch the full event if needed
    if (event.truncated) {
      try {
        const fullEvent = await rateLimitedNylas.findEvent({
          identifier: event.grant_id,
          eventId: event.id,
          queryParams: { calendarId: event.calendar_id || 'primary' }
        });
        
        if (fullEvent.data) {
          const data = fullEvent.data;
          const whenData: any = data.when || {};
          event = {
            ...data,
            grant_id: event.grant_id,
            id: data.id,
            calendar_id: data.calendarId || event.calendar_id,
            when: {
              start_time: whenData.startTime,
              end_time: whenData.endTime,
              startTime: whenData.startTime,
              endTime: whenData.endTime,
              startTimezone: whenData.startTimezone,
              endTimezone: whenData.endTimezone
            },
            participants: data.participants
          };
        }
      } catch (error) {
        console.error('Error fetching full calendar event:', error);
      }
    }
    
    const nylasConnection = await NylasConnection.findOne({ grantId: event.grant_id });
    if (!nylasConnection) {
      console.log('No Nylas connection found for grant_id:', event.grant_id);
      return;
    }
    
    const user = await User.findById(nylasConnection.user);
    if (!user) {
      console.log('No user found for Nylas connection:', nylasConnection._id);
      return;
    }
    
    // Get all organization domains to exclude from contact creation (same approach as email processing)
    const orgNylasConnections = await NylasConnection.find({ organization: user.organization }, 'email');
    const organizationDomains = new Set<string>();
    
    orgNylasConnections.forEach(connection => {
      if (connection.email) {
        const domain = connection.email.split('@')[1];
        if (domain) {
          organizationDomains.add(domain);
        }
      }
    });
    
    console.log(`[NYLAS-CALENDAR] Organization domains to exclude: ${Array.from(organizationDomains).join(', ')}`);
    
    if (!event.participants || event.participants.length === 0) {
      console.log('No participants found in the event, skipping CalendarActivity creation:', event.id);
      return;
    }
    
    const normalizeEmail = (addr?: string) => (typeof addr === 'string' ? addr.trim().toLowerCase() : '');
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const participantEmails: string[] = event.participants
      .map((p: any) => normalizeEmail(p.email))
      .filter((val: string) => !!val);
    if (participantEmails.length === 0) {
      console.log('No valid participant emails found in the event, skipping CalendarActivity creation:', event.id);
      return;
    }
    
    // Filter out organization domains from participant emails
    const dedupedParticipantEmails: string[] = Array.from(new Set<string>(participantEmails));
    const externalParticipantEmails: string[] = dedupedParticipantEmails.filter((emailAddr: string) => {
      const domain = emailAddr.split('@')[1];
      const isOrgDomain = organizationDomains.has(domain);
      if (isOrgDomain) {
        console.log(`[NYLAS-CALENDAR] Filtering out organization email: ${emailAddr}`);
      }
      return !isOrgDomain;
    });
    
    console.log(`[NYLAS-CALENDAR] Processing ${externalParticipantEmails.length} external participant emails (filtered ${participantEmails.length - externalParticipantEmails.length} organization emails)`);
    
    if (externalParticipantEmails.length === 0) {
      console.log('No external participant emails found after filtering, skipping CalendarActivity creation:', event.id);
      return;
    }
    
    let crmContacts = [] as any[];
    if (externalParticipantEmails.length > 0) {
      const emailRegexes = externalParticipantEmails.map((e: string) => new RegExp(`^${escapeRegex(e)}$`, 'i'));
      crmContacts = await Contact.find({
        organization: user.organization,
        $or: emailRegexes.map(rx => ({ 'emails.address': rx }))
      });
    }
    
    const existingContactEmails = crmContacts.flatMap(contact => contact.emails.map((e: any) => normalizeEmail(e.address)));
    const newParticipantEmailsDetails = event.participants.filter((p: any) => {
      const normalized = normalizeEmail(p.email);
      if (!normalized || existingContactEmails.includes(normalized)) return false;
      
      // Only include if email is external (not from organization domains)
      const domain = normalized.split('@')[1];
      return !organizationDomains.has(domain);
    });
    
    if (newParticipantEmailsDetails.length > 0) {
      const contactProspectIds = crmContacts.map(c => c.prospect).filter(Boolean);
      const uniqueProspectIds = [...new Set(contactProspectIds.map((id: any) => id.toString()))];
      const singleProspectContextId = uniqueProspectIds.length === 1 ? uniqueProspectIds[0] : null;

      // Pre-fetch prospect context for AI domain validation
      let prospectContext: { name?: string; domains?: string[] } = {};
      if (singleProspectContextId) {
        try {
          const contextProspect = await Prospect.findById(singleProspectContextId).select('name domains').lean();
          if (contextProspect) {
            prospectContext = {
              name: contextProspect.name,
              domains: contextProspect.domains || [],
            };
            console.log(`[NYLAS-CALENDAR] Using prospect context for domain validation: ${contextProspect.name} (domains: ${contextProspect.domains?.join(', ') || 'none'})`);
          }
        } catch (err) {
          console.warn('[NYLAS-CALENDAR] Failed to fetch prospect context for domain validation', err);
        }
      }

      for (const participant of newParticipantEmailsDetails) {
        const emailAddress = participant.email;
        const domain = emailAddress.split('@')[1];
        let prospect = null;
        let decision: any = null;
        let contextName = prospectContext.name;
        let contextDomains = prospectContext.domains;

        // First, see if the domain already maps to a known prospect (cheap lookup, no LLM)
        if (domain) {
          prospect = await Prospect.findOne({ domains: { $in: [domain] }, organization: user.organization });
          if (prospect) {
            contextName = prospect.name;
            contextDomains = prospect.domains || [];
          }
        }

        // If we have no prospect and no single-prospect context, skip entirely (avoid LLM)
        if (!prospect && !singleProspectContextId) {
          console.log(`[NYLAS-CALENDAR] Skipping ${emailAddress} - no prospect context available for domain ${domain}`);
          continue;
        }

        // Single decision call for both domain inclusion and personhood
        // Now includes prospect context so AI can determine if domain belongs to the prospect
        decision = await getDomainDecision(domain, {
          organizationId: user.organization,
          opportunityId: event.opportunityId || undefined,
          contactEmail: emailAddress,
          emailContext: event.title,
          prospectName: contextName,
          existingDomains: contextDomains,
        });

        // Personhood check (service/no-reply guard)
        if (decision.isPersonLikely === false) {
          console.log(`[NYLAS-CALENDAR] Skipping contact creation for ${emailAddress} (service/no-reply): ${decision.reasoning}`);
          continue;
        }

        const excludeDomain = !decision.shouldInclude;

        if (domain && !excludeDomain) {
          // If no prospect found for this domain, check if other participants in this event
          // belong to an existing prospect - smart domain association
          if (!prospect && singleProspectContextId) {
            try {
              console.log(`[NYLAS-CALENDAR] Attempting smart domain association for ${domain} with single prospect context`);
              
              const existingProspect = await Prospect.findById(singleProspectContextId);
              
              if (!existingProspect) {
                console.error(`[NYLAS-CALENDAR] Prospect ${singleProspectContextId} not found for smart domain association`);
              } else {
                const prospectInfo = `${existingProspect.name} (${existingProspect._id})`;
                
                // Validate domain before adding
                if (!domain || typeof domain !== 'string' || !domain.includes('.')) {
                  console.error(`[NYLAS-CALENDAR] Invalid domain format for smart association: ${domain}`);
                } else if (existingProspect.domains?.includes(domain)) {
                  console.log(`[NYLAS-CALENDAR] Domain ${domain} already exists in prospect ${prospectInfo}`);
                  prospect = existingProspect;
                } else {
                  console.log(`[NYLAS-CALENDAR] Adding domain ${domain} to existing prospect ${prospectInfo} based on calendar event context`);
                  
                  try {
                    existingProspect.domains = [...(existingProspect.domains || []), domain];
                    await existingProspect.save(); // This triggers our domain change detection middleware!
                    prospect = existingProspect;
                    console.log(`[NYLAS-CALENDAR] Successfully associated domain ${domain} with prospect ${prospectInfo}`);
                  } catch (saveError: unknown) {
                    const errorMessage = saveError instanceof Error ? (saveError as Error).message : 'Unknown save error';
                    console.error(`[NYLAS-CALENDAR] Failed to save domain ${domain} to prospect ${prospectInfo}: ${errorMessage}`);
                  }
                }
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.error(`[NYLAS-CALENDAR] Error in smart domain association for ${domain}: ${errorMessage}`);
              // Continue processing - don't let smart association errors break contact creation
            }
          }
        } else if (excludeDomain && singleProspectContextId) {
          prospect = await Prospect.findById(singleProspectContextId);
          if (prospect) {
            console.log(`[NYLAS-CALENDAR] Creating contact for excluded domain ${domain} using existing prospect context ${prospect._id}`);
          }
        }
        
        // Only create contact if we found a prospect (since prospect field is required)
        if (prospect) {
          const fullName = participant.name || '';
          let firstName = '';
          let lastName = '';
          if (fullName) {
            const nameParts = fullName.trim().split(' ');
            firstName = nameParts[0] || '';
            if (nameParts.length > 1) {
              lastName = nameParts.slice(1).join(' ');
            }
          }
          
          // Check if contact with same name already exists for this prospect
          let existingContact = null;
          if (firstName && lastName) {
            existingContact = await Contact.findOne({
              firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
              lastName: { $regex: new RegExp(`^${lastName}$`, 'i') },
              prospect: prospect._id,
              organization: user.organization
            });
            
            if (existingContact) {
              console.log(`[NYLAS-CALENDAR] Found existing contact with same name: ${firstName} ${lastName} (${existingContact._id}), merging email`);
              
              // Check if email already exists on this contact
              const existingEmailAddresses = existingContact.emails.map((e: any) => normalizeEmail(e.address));
              const normalizedToAdd = normalizeEmail(emailAddress);
              if (!existingEmailAddresses.includes(normalizedToAdd)) {
                await Contact.findByIdAndUpdate(
                  existingContact._id,
                  { $addToSet: { emails: { address: normalizedToAdd, category: 'work', isPrimary: false } } }
                );
                console.log(`[NYLAS-CALENDAR] Added email ${normalizedToAdd} to existing contact: ${firstName} ${lastName}`);
              } else {
                console.log(`[NYLAS-CALENDAR] Email ${normalizedToAdd} already exists on contact ${firstName} ${lastName}`);
              }
              
              // Add the existing contact to our crmContacts list
              crmContacts.push(existingContact);
            }
          }
          
          // Only create new contact if we didn't find an existing one
          if (!existingContact) {
            const normalizedEmail = normalizeEmail(emailAddress);
            
            try {
              const newContact = new Contact({
                emails: [{
                  address: normalizedEmail,
                  category: 'work',
                  isPrimary: true
                }],
                firstName,
                lastName,
                prospect: prospect._id,
                organization: user.organization,
                createdBy: user._id,
                domainExcluded: excludeDomain,
                origin: excludeDomain ? 'external_cc' : 'nylas_calendar',
              });
              
              const savedContact = await newContact.save();
              crmContacts.push(savedContact);
              
              await Prospect.findByIdAndUpdate(prospect._id, { $addToSet: { contacts: savedContact._id } });
              console.log(`Created new contact for ${emailAddress} and linked to prospect ${prospect._id} (domainExcluded=${excludeDomain})`);
            } catch (createError: any) {
              // Handle duplicate key error (race condition - contact created by parallel process)
              if (createError.code === 11000) {
                console.log(`[NYLAS-CALENDAR] Contact with email ${normalizedEmail} already exists (race condition), finding existing...`);
                const existingDupContact = await Contact.findOne({
                  organization: user.organization,
                  'emails.address': { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i') }
                });
                if (existingDupContact) {
                  crmContacts.push(existingDupContact);
                  console.log(`[NYLAS-CALENDAR] Found existing contact ${existingDupContact._id} for ${normalizedEmail}`);
                } else {
                  console.error(`[NYLAS-CALENDAR] Duplicate key error but contact not found for ${normalizedEmail}`);
                }
              } else {
                throw createError;
              }
            }
          }
        } else {
          console.log(`Skipping contact creation for ${emailAddress} - no prospect found for domain ${domain}`);
        }
      }
    }
    
    // All crmContacts (existing and newly created) are now in the crmContacts array.
    // Create/Update a single CalendarActivity for this event, linked to the user and all found/created CRM contacts.

    const startTime = event.when?.start_time || event.when?.startTime;
    const endTime = event.when?.end_time || event.when?.endTime;
      
    if (!event.when || typeof startTime !== 'number' || typeof endTime !== 'number') {
      console.warn('Skipping event with invalid or missing when/time properties:', event.id);
      return; // Return null or handle as an error appropriately
    }

    const uniqueCalendarContacts = new Map<string, any>();
    for (const c of crmContacts) {
      const key = String(c._id);
      if (!uniqueCalendarContacts.has(key)) uniqueCalendarContacts.set(key, c._id);
    }
    const contactIds = Array.from(uniqueCalendarContacts.values());
    const status = event.status;
    
    // Determine prospect from contacts or find a default one
    let prospectId = null;
    if (crmContacts.length > 0) {
      // Use the prospect from the first contact
      prospectId = crmContacts[0].prospect;
    }
      
    const startTimeDate = new Date(startTime * 1000);
    const calendarActivityData = {
      type: 'calendar',
      calendarId: event.calendar_id || event.calendarId,
      eventId: event.id,
      title: event.title || 'Untitled Event',
      description: event.description,
      status: mapEventStatus(status, endTime),
      startTime: startTimeDate,
      endTime: new Date(endTime * 1000),
      date: startTimeDate, // Required field: date equals startTime
      timezone: event.when?.startTimezone || event.when?.timezone || 'UTC',
      location: event.location,
      attendees: mapParticipants(event.participants), // Raw participants from Nylas
      contacts: contactIds, // IDs of CRM Contact documents
      prospect: prospectId ? prospectId : null, // Required field: prospect reference
      nylasGrantId: event.grant_id,
      nylasCalendarId: event.calendar_id || event.calendarId,
      nylasEventId: event.id,
      busy: event.busy || false,
      htmlLink: event.html_link || event.htmlLink,
      icalUid: event.ical_uid || event.icalUid,
      readOnly: event.read_only || event.readOnly || false,
      hideParticipants: event.hide_participants || event.hideParticipants || false,
      creator: event.creator,
      organizer: event.organizer,
      conferencing: event.conferencing,
      reminders: event.reminders,
      organization: user.organization, // Link to user's organization
      createdBy: user._id, // Link to user
      receivedViaWebhookAt: new Date()
    };
      
    const calendarActivity = await CalendarActivity.findOneAndUpdate(
      { 
        eventId: event.id  // eventId has a unique index, so this alone is sufficient to find or create
      },
      calendarActivityData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
      
    // Update each CRM contact's calendarActivities array
    for (const contactId of contactIds) {
      await Contact.findByIdAndUpdate(
        contactId,
        { $addToSet: { calendarActivities: calendarActivity._id } }
      );
    }
    
    // Find and add each contact to the most recently active opportunity (same logic as email processing)
    for (const contact of crmContacts) {
      if (!contact.prospect) continue;
      
      const allOpportunities = await Opportunity.find({ 
        prospect: contact.prospect 
      }).populate('stage');

      if (allOpportunities.length > 0) {
        let targetOpportunity: IOpportunity;

        if (allOpportunities.length === 1) {
          targetOpportunity = allOpportunities[0];
        } else {
          const activeOpportunities = allOpportunities.filter(
            (opp) => {
              const stage = opp.stage as any;
              return !stage?.isClosedWon && !stage?.isClosedLost;
            }
          );

          if (activeOpportunities.length === 1) {
            targetOpportunity = activeOpportunities[0];
            console.log(`Adding contact ${contact._id} to the single active opportunity: ${activeOpportunities[0]._id}`);
          } else if (activeOpportunities.length > 1) {
            // If multiple are active, default to the most recently updated one
            activeOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            targetOpportunity = activeOpportunities[0];
            console.log(`Adding contact ${contact._id} to most recently updated active opportunity: ${targetOpportunity._id}`);
          } else {
            // No active opportunities. Default to the most recently updated closed opportunity
            allOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            targetOpportunity = allOpportunities[0];
            console.log(`Adding contact ${contact._id} to most recently updated closed opportunity: ${targetOpportunity._id}`);
          }
        }

        // Add contact to opportunity and opportunity to contact
        await Opportunity.findByIdAndUpdate(
          targetOpportunity._id,
          { $addToSet: { contacts: contact._id } }
        );
        
        await Contact.findByIdAndUpdate(
          contact._id,
          { $addToSet: { opportunities: targetOpportunity._id } }
        );

        console.log(`Successfully linked contact ${contact._id} to opportunity ${targetOpportunity._id} from calendar event`);
      } else {
        console.log(`No opportunities found for prospect ${contact.prospect} - contact ${contact._id} not linked to opportunity`);
      }
    }
      
    console.log(`Processed and saved CalendarActivity ${calendarActivity._id} for event ${event.id}`);
    IntelligenceProcessor.processActivity(calendarActivity);
    
    return [calendarActivity]; // Return as an array to maintain consistency with previous structure if needed elsewhere

  } catch (error) {
    console.error('Error processing new calendar activity:', error);
    throw error; 
  }
}

// Helper function to process and save a single event
// This function might need review or deprecation if processNewCalendarActivity handles all cases.
// For now, ensure its contact association logic is consistent if it's still used by syncCalendarEvents directly.
const processCalendarEvent = async (event: any, grantId: string, calendarId: string, prospect: any, contactIds: string[]) => {
  try {
    // Validate required properties to avoid Invalid Date errors - handle both snake_case and camelCase
    const startTime = event.when?.start_time || event.when?.startTime;
    const endTime = event.when?.end_time || event.when?.endTime;
    
    if (!event.when || typeof startTime !== 'number' || typeof endTime !== 'number') {
      console.warn('Skipping event with invalid or missing when/time properties:', event.id);
      return null;
    }

    // Map Nylas event to CalendarActivity format - only include fields in the schema
    const calendarActivityData = {
      organization: prospect.organization,
      type: 'calendar',
      calendarId: event.calendar_id || event.calendarId || calendarId,
      eventId: event.id,
      title: event.title || 'Untitled Event',
      description: event.description,
      status: mapEventStatus(event.status, endTime),
      startTime: new Date(startTime * 1000),
      endTime: new Date(endTime * 1000),
      date: new Date(startTime * 1000), // Required field: date equals startTime
      timezone: event.when?.startTimezone || event.when?.timezone || 'UTC',
      location: event.location,
      attendees: mapParticipants(event.participants),
      contacts: contactIds,
      prospect: prospect._id,
      createdBy: prospect.createdBy || prospect.organization, // Required field: Use prospect's creator or organization as fallback
      nylasGrantId: grantId,
      nylasCalendarId: calendarId,
      nylasEventId: event.id,
      busy: event.busy || false,
      htmlLink: event.html_link || event.htmlLink,
      icalUid: event.ical_uid || event.icalUid,
      readOnly: event.read_only || event.readOnly || false,
      hideParticipants: event.hide_participants || event.hideParticipants || false,
      creator: event.creator,
      organizer: event.organizer,
      conferencing: event.conferencing,
      reminders: event.reminders,
      receivedViaWebhookAt: new Date()
    };

    // Use findOneAndUpdate instead of find + save to avoid version conflicts
    const calendarActivity = await CalendarActivity.findOneAndUpdate(
      { 
        eventId: event.id  // eventId has a unique index, so this alone is sufficient to find or create
      },
      calendarActivityData,
      { upsert: true, new: true }
    );

    // Update each contact's calendarActivities array with this calendar activity
    for (const contactId of contactIds) {
      await Contact.findByIdAndUpdate(
        contactId,
        { $addToSet: { calendarActivities: calendarActivity._id } },
        { new: true }
      );
    }

    return calendarActivity;
  } catch (error) {
    console.error('Error processing event:', error);
    return null;
  }
};

// Sync all events for a specific calendar and save them
export const syncCalendarEvents = async (grantId: string, calendarId: string, userId: string, orgId: string) => {
  try {
    // Get current time minus 1 month to fetch recent events
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const startTimestamp = Math.floor(oneMonthAgo.getTime() / 1000);

    // Fetch all events from the calendar
    const events = await rateLimitedNylas.listEvents({
      identifier: grantId,
      queryParams: {
        calendarId: calendarId,
        start: `${startTimestamp}`,
      }
    });

    // Find prospects in the organization to associate events with
    const prospects = await Prospect.find({ organization: orgId }).populate('contacts');
    
    // Process each event to find matching contacts and prospects
    const processedEvents = [];
    
    for (const event of events.data) {
      // Skip events without participants
      if (!event.participants || event.participants.length === 0) {
        continue;
      }
      
      // Extract participant emails
      const participantEmails = event.participants.map((p: any) => p.email);
      
      // Find matching prospects for this event
      for (const prospect of prospects) {
        const contacts = prospect.contacts || [];
        
        // Check if any contact's email matches any participant
        const matchingContacts = contacts.filter((contact: any) => 
          contact.emails.some((e: any) => participantEmails.includes(e.address))
        );
        
        if (matchingContacts.length > 0) {
          // Process and save this event for the matching prospect
          const processedEvent = await processCalendarEvent(
            event, 
            grantId, 
            calendarId, 
            prospect, 
            matchingContacts.map((c: any) => c._id)
          );
          
          if (processedEvent) {
            processedEvents.push(processedEvent);
          }
        }
      }
    }
    
    return processedEvents;
  } catch (error) {
    console.error('Error syncing calendar events:', error);
    throw error;
  }
};

/**
 * Handles event deletion webhooks from Nylas
 * Expected payload structure (as of 13.05.2025):
 * {
 *   "specversion": "1.0",
 *   "type": "event.deleted",
 *   "source": "/google/events/incremental",
 *   "id": "mock-id",
 *   "data": {
 *     "application_id": "NYLAS_APPLICATION_ID",
 *     "object": {
 *       "grant_id": "NYLAS_GRANT_ID",
 *       "calendar_id": "CALENDAR_ID",
 *       "id": "mock-data-id",
 *       "master_event_id": "mock-recurring-event-master-event-id",
 *       "object": "event"
 *     }
 *   }
 * }
 */
export const handleDeletedCalendarEvent = async (payload: any): Promise<{ success: boolean, message: string }> => {
  try {
    // Extract event information from payload
    const { data } = payload;
    
    if (!data || !data.object) {
      return { success: false, message: 'Invalid payload structure' };
    }
    
    const { grant_id, calendar_id, id } = data.object;
    
    if (!id) {
      return { success: false, message: 'Event ID missing from payload' };
    }
    
    // Find the calendar activity
    const calendarActivity = await CalendarActivity.findOne({
      $or: [
        { nylasEventId: id },
        { eventId: id }
      ]
    });
    
    if (!calendarActivity) {
      return { success: false, message: 'Calendar activity not found' };
    }
    
    // Find all contacts that have this calendar activity
    const contactIds = calendarActivity.contacts || [];
    
    // Remove this calendar activity from all associated contacts
    if (contactIds.length > 0) {
      await Contact.updateMany(
        { _id: { $in: contactIds } },
        { $pull: { calendarActivities: calendarActivity._id } }
      );
    }
    
    // Delete the calendar activity
    await CalendarActivity.findByIdAndDelete(calendarActivity._id);
    
    return { 
      success: true, 
      message: `Successfully deleted calendar activity (ID: ${id})` 
    };
  } catch (error) {
    console.error('Error handling deleted calendar event:', error);
    return { 
      success: false, 
      message: `Error handling deleted calendar event: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
};

// Configure a calendar for Notetaker functionality
export const configureCalendarForNotetaker = async (
  grantId: string, 
  calendarId: string, 
  config: NotetakerConfig
): Promise<Calendar> => {
  try {
    const calendarResponse = await rateLimitedNylas.findCalendar({
      identifier: grantId,
      calendarId: calendarId,
    });

    if (!calendarResponse.data) {
      throw new Error(`Calendar with ID ${calendarId} not found for grant ${grantId}`);
    }

    let notetaker = {};

    if (config.enabled) {
      
      notetaker = {
        name: 'Radiant Notetaker',
        meetingSettings: {
          audioRecording: true,
          transcription: true,
          videoRecording: true,
        },
      };
    }

    const updatedCalendar = await rateLimitedNylas.updateCalendar({
      identifier: grantId,
      calendarId: calendarId,
      requestBody: {
        notetaker: notetaker,
      }
    });

    if (!updatedCalendar.data) {
      throw new Error(`Failed to update calendar ${calendarId} for grant ${grantId}`);
    }

    console.log(`Calendar ${calendarId} updated for Notetaker with config:`, config);
    return updatedCalendar.data;

  } catch (error: any) {
    console.error('Error configuring calendar for Notetaker:', error);
    if (error.name === 'NylasApiError') {
      let message = 'A Nylas API error occurred while configuring the calendar for Notetaker.';
      switch (error.statusCode) {
        case 401:
        case 403:
          message = 'Authentication failed with Nylas. Please check your credentials or grant.';
          break;
        case 404:
          message = `Calendar with ID ${calendarId} not found or not accessible.`;
          break;
        case 429:
          message = 'Rate limit exceeded with Nylas API. Please try again later.';
          break;
        case 503:
          message = 'Nylas service is temporarily unavailable. Please try again later.';
          break;
        default:
          message = error.message || message;
      }
      // Log providerError if it exists
      if (error.providerError) {
        console.error('Nylas Provider Error:', error.providerError);
      }
      // Throw a new error with a more specific message, including original status code
      throw new Error(`${message} (Status Code: ${error.statusCode})`);
    }
    throw error; // Re-throw other types of errors
  }
};

// Invite a Notetaker to a meeting
export const inviteNotetakerToMeeting = async (
  grantId: string, 
  inviteUrl: string, 
): Promise<InviteNotetakerToMeetingResponse> => {
  try {
    const notetaker = await rateLimitedNylas.createNotetaker({
      identifier: grantId,
      requestBody: {
        meetingLink: inviteUrl,
        meetingSettings: {
          audioRecording: true,
          transcription: true,
        }
      }
    });

    if (!notetaker.data || !notetaker.data.id) {
      console.error('Nylas Notetaker create did not return expected data:', notetaker);
      return {
        success: false,
        message: 'Failed to invite notetaker: No notetaker ID returned from Nylas.',
        error: notetaker, 
      };
    }
    
    const sdkNotetakerData = notetaker.data; // This is of type SDK's Notetaker

    // Manually construct the response data from sdkNotetakerData and function inputs
    const responseData: InviteNotetakerSuccessData = {
        notetakerId: sdkNotetakerData.id,
        grantId: grantId, 
        status: sdkNotetakerData.state as string, 
        returnedMeetingLink: sdkNotetakerData.meetingLink,
        joinTime: sdkNotetakerData.joinTime, 
    };

    return {
      success: true,
      data: responseData,
    };

  } catch (error: any) {
    console.error('Error inviting Notetaker to meeting:', error);
    let responseMessage = 'An unexpected error occurred while inviting the notetaker.';
    let statusCode = 500;
    let nylasErrorPayload;

    if (error.name === 'NylasApiError') {
      statusCode = error.statusCode;
      nylasErrorPayload = {
        name: error.name,
        statusCode: error.statusCode,
        message: error.message,
        requestId: error.requestId,
        providerError: error.providerError
      };
      switch (error.statusCode) {
        case 400:
          responseMessage = 'Invalid request to invite Notetaker. Please check the meeting link or details.';
          if (error.providerError?.type === 'INVALID_MEETING_LINK_ERROR') {
            responseMessage = 'The provided meeting link is invalid or not supported by Nylas Notetaker.';
          } else if (error.providerError?.type === 'NOTETAKER_ALREADY_JOINED_ERROR') {
            responseMessage = 'A notetaker has already been invited or is present in this meeting.';
          }
          break;
        case 401:
        case 403:
          responseMessage = 'Authentication failed with Nylas. Cannot invite Notetaker.';
          break;
        case 404:
          responseMessage = 'The specified resource (e.g., grant) was not found by Nylas.';
          break;
        case 422: // Unprocessable Entity - often used by Nylas for Notetaker specific operational errors
            responseMessage = 'Nylas Notetaker could not join the meeting. This might be due to meeting restrictions, capacity, or other reasons.';
            if (error.providerError?.message) {
                responseMessage = `Nylas Notetaker Error: ${error.providerError.message}`;
            }
            break;
        case 429:
          responseMessage = 'Rate limit exceeded with Nylas API. Please try again later.';
          break;
        case 503:
          responseMessage = 'Nylas service is temporarily unavailable. Please try again later.';
          break;
        default:
          responseMessage = error.message || responseMessage;
      }
      if (error.providerError) {
        console.error('Nylas Provider Error (inviteNotetakerToMeeting):', error.providerError);
      }
    } else {
      responseMessage = error.message || responseMessage;
    }
    
    return {
      success: false,
      message: responseMessage,
      error: nylasErrorPayload || error, // Return Nylas specific error structure if available
    };
  }
};

// Cancel a scheduled Notetaker
export const cancelScheduledNotetaker = async (
  grantId: string,
  notetakerId: string
): Promise<CancelNotetakerResponse> => {
  try {
    const cancelResponse = await rateLimitedNylas.cancelNotetaker({
      identifier: grantId,
      notetakerId: notetakerId,
    });

    // NylasBaseResponse typically doesn't have a 'data' field like other responses.
    // Success is often implied by lack of error, but we check if cancelResponse itself is truthy.
    // The actual structure of NylasBaseResponse is { requestId: string, data: {} (empty object usually) }
    // or sometimes just { requestId: string }. We aim for robustness.
    if (cancelResponse && cancelResponse.requestId) {
      return {
        success: true,
        requestId: cancelResponse.requestId,
        message: 'Notetaker cancellation request processed successfully.',
      };
    } else {
      // This case might indicate an unexpected response structure from Nylas
      console.error('Nylas Notetaker cancel did not return expected response:', cancelResponse);
      return {
        success: false,
        message: 'Failed to cancel notetaker: Unexpected response from Nylas.',
        error: cancelResponse, 
      };
    }

  } catch (error: any) {
    console.error('Error cancelling Notetaker:', error);
    let responseMessage = 'An unexpected error occurred while cancelling the notetaker.';
    let statusCode = 500;
    let nylasErrorPayload;

    if (error.name === 'NylasApiError') {
      statusCode = error.statusCode;
      nylasErrorPayload = {
        name: error.name,
        statusCode: error.statusCode,
        message: error.message,
        requestId: error.requestId,
        providerError: error.providerError
      };
      switch (error.statusCode) {
        case 401:
        case 403:
          responseMessage = 'Authentication failed with Nylas. Cannot cancel Notetaker.';
          break;
        case 404:
          responseMessage = `Notetaker with ID ${notetakerId} not found or already cancelled/completed.`;
          break;
        case 429:
          responseMessage = 'Rate limit exceeded with Nylas API. Please try again later.';
          break;
        case 503:
          responseMessage = 'Nylas service is temporarily unavailable. Please try again later.';
          break;
        default:
          responseMessage = error.message || responseMessage;
      }
      if (error.providerError) {
        console.error('Nylas Provider Error (cancelScheduledNotetaker):', error.providerError);
      }
    } else {
      responseMessage = error.message || responseMessage;
    }
    
    return {
      success: false,
      message: responseMessage,
      error: nylasErrorPayload || error,
    };
  }
};

// Make a Notetaker leave a meeting
export const makeNotetakerLeaveMeeting = async (
  grantId: string,
  notetakerId: string
): Promise<CancelNotetakerResponse> => {
  try {
    const leaveResponse = await rateLimitedNylas.leaveNotetaker({
      identifier: grantId,
      notetakerId: notetakerId,
    });

    if (leaveResponse && leaveResponse.requestId) {
      return {
        success: true,
        requestId: leaveResponse.requestId,
        message: 'Notetaker leave request processed successfully.',
      };
    } else {
      console.error('Nylas Notetaker leave did not return expected response:', leaveResponse);
      return {
        success: false,
        message: 'Failed to make notetaker leave: Unexpected response from Nylas.',
        error: leaveResponse,
      };
    }
  } catch (error: any) {
    console.error('Error making Notetaker leave meeting:', error);
    let responseMessage = 'An unexpected error occurred while making the notetaker leave.';
    let statusCode = 500;
    let nylasErrorPayload;

    if (error.name === 'NylasApiError') {
      statusCode = error.statusCode;
      nylasErrorPayload = {
        name: error.name,
        statusCode: error.statusCode,
        message: error.message,
        requestId: error.requestId,
        providerError: error.providerError
      };
      switch (error.statusCode) {
        case 401:
        case 403:
          responseMessage = 'Authentication failed with Nylas. Cannot make Notetaker leave.';
          break;
        case 404:
          responseMessage = `Notetaker with ID ${notetakerId} not found, not in a meeting, or already left.`;
          break;
        case 429:
          responseMessage = 'Rate limit exceeded with Nylas API. Please try again later.';
          break;
        case 503:
          responseMessage = 'Nylas service is temporarily unavailable. Please try again later.';
          break;
        default:
          responseMessage = error.message || responseMessage;
      }
      if (error.providerError) {
        console.error('Nylas Provider Error (makeNotetakerLeaveMeeting):', error.providerError);
      }
    } else {
      responseMessage = error.message || responseMessage;
    }

    return {
      success: false,
      message: responseMessage,
      error: nylasErrorPayload || error,
    };
  }
};

// List Notetakers
export const listNotetakers = async (
  grantId: string,
  pageToken?: string,
  limit?: number
): Promise<ListNotetakersResponse> => {
  try {
    const response = await rateLimitedNylas.listNotetakers({
      identifier: grantId,
      queryParams: {
        pageToken: pageToken,
        limit: limit,
      }
    });

    if (response.data) {
      return {
        success: true,
        data: response.data as unknown as NylasSDKNotetaker[], // Cast to our defined type
        nextCursor: response.nextCursor,
      };
    } else {
      // This case might indicate an unexpected response structure from Nylas
      console.error('Nylas Notetaker list did not return expected data:', response);
      return {
        success: false,
        message: 'Failed to list notetakers: Unexpected response from Nylas.',
        error: response,
      };
    }
  } catch (error: any) {
    console.error('Error listing Notetakers:', error);
    let responseMessage = 'An unexpected error occurred while listing notetakers.';
    let statusCode = 500;
    let nylasErrorPayload;

    if (error.name === 'NylasApiError') {
      statusCode = error.statusCode;
      nylasErrorPayload = {
        name: error.name,
        statusCode: error.statusCode,
        message: error.message,
        requestId: error.requestId,
        providerError: error.providerError
      };
      switch (error.statusCode) {
        case 401:
        case 403:
          responseMessage = 'Authentication failed with Nylas. Cannot list Notetakers.';
          break;
        case 429:
          responseMessage = 'Rate limit exceeded with Nylas API. Please try again later.';
          break;
        case 503:
          responseMessage = 'Nylas service is temporarily unavailable. Please try again later.';
          break;
        default:
          responseMessage = error.message || responseMessage;
      }
      if (error.providerError) {
        console.error('Nylas Provider Error (listNotetakers):', error.providerError);
      }
    } else {
      responseMessage = error.message || responseMessage;
    }
    
    return {
      success: false,
      message: responseMessage,
      error: nylasErrorPayload || error,
    };
  }
};

// Find Notetaker by ID
export const findNotetakerById = async (
  grantId: string,
  notetakerId: string
): Promise<FindNotetakerByIdResponse> => {
  try {
    const response = await rateLimitedNylas.findNotetaker({
      identifier: grantId,
      notetakerId: notetakerId,
    });

    if (response.data) {
      return {
        success: true,
        data: response.data as unknown as NylasSDKNotetaker, // Cast to our defined type
      };
    } else {
      // This case might indicate an unexpected response structure from Nylas
      // (e.g., if notetaker not found, though Nylas might throw 404 error instead)
      console.error('Nylas Notetaker find did not return expected data or notetaker not found:', response);
      return {
        success: false,
        message: 'Failed to find notetaker or notetaker not found: Unexpected response from Nylas.',
        error: response,
      };
    }
  } catch (error: any) {
    console.error('Error finding Notetaker by ID:', error);
    let responseMessage = 'An unexpected error occurred while finding the notetaker.';
    let statusCode = 500;
    let nylasErrorPayload;

    if (error.name === 'NylasApiError') {
      statusCode = error.statusCode;
      nylasErrorPayload = {
        name: error.name,
        statusCode: error.statusCode,
        message: error.message,
        requestId: error.requestId,
        providerError: error.providerError
      };
      switch (error.statusCode) {
        case 401:
        case 403:
          responseMessage = 'Authentication failed with Nylas. Cannot find Notetaker.';
          break;
        case 404:
          responseMessage = `Notetaker with ID ${notetakerId} not found.`;
          break;
        case 429:
          responseMessage = 'Rate limit exceeded with Nylas API. Please try again later.';
          break;
        case 503:
          responseMessage = 'Nylas service is temporarily unavailable. Please try again later.';
          break;
        default:
          responseMessage = error.message || responseMessage;
      }
      if (error.providerError) {
        console.error('Nylas Provider Error (findNotetakerById):', error.providerError);
      }
    } else {
      responseMessage = error.message || responseMessage;
    }

    return {
      success: false,
      message: responseMessage,
      error: nylasErrorPayload || error,
    };
  }
};

// Download media (recording/transcript) from Nylas and store it
export const downloadAndStoreNylasMedia = async (
  orgId: string,
  meetingId: string, // This will be CalendarActivity._id.toString()
  nylasNotetakerId: string,
  recordingUrl?: string, 
  transcriptUrl?: string
): Promise<{
  savedRecordingPath?: string;
  recordingStorageUrl?: string;
  savedTranscriptPath?: string;
  transcriptStorageUrl?: string;
  transcriptText?: string;
  error?: string;
}> => {
  // Redirect to the streaming version for better memory efficiency
  const result = await downloadAndStoreNylasMediaStreaming(
    orgId,
    meetingId,
    nylasNotetakerId,
    recordingUrl,
    transcriptUrl
  );
  
  // Return in the expected format for backward compatibility
  return {
    savedRecordingPath: result.savedRecordingPath,
    recordingStorageUrl: result.recordingStorageUrl,
    savedTranscriptPath: result.savedTranscriptPath,
    transcriptStorageUrl: result.transcriptStorageUrl,
    transcriptText: result.transcriptText,
    error: result.error
  };
};

// True streaming version of media download - handles files of any size without memory constraints
export const downloadAndStoreNylasMediaStreaming = async (
  orgId: string,
  meetingId: string, // This will be CalendarActivity._id.toString()
  nylasNotetakerId: string,
  recordingUrl?: string, 
  transcriptUrl?: string,
  actionItemsUrl?: string,
  summaryUrl?: string,
  thumbnailUrl?: string
): Promise<{
  savedRecordingPath?: string;
  recordingStorageUrl?: string;
  savedTranscriptPath?: string;
  transcriptStorageUrl?: string;
  transcriptText?: string;
  actionItemsText?: string;
  summaryText?: string;
  savedThumbnailPath?: string;
  thumbnailStorageUrl?: string;
  error?: string;
  /** Critical errors that should block AI processing (e.g., transcript failure) */
  criticalError?: string;
  /** Non-critical errors that shouldn't block AI processing (e.g., thumbnail failure) */
  nonCriticalErrors?: string[];
}> => {
  const results: any = {};
  const errors: string[] = [];
  const criticalErrors: string[] = [];
  const nonCriticalErrors: string[] = [];

  try {
    // Download and store recording if URL is provided
    if (recordingUrl) {
      try {
        console.log(`Streaming download of recording for notetaker ${nylasNotetakerId}`);
        const recordingResponse = await fetch(recordingUrl);
        if (!recordingResponse.ok) {
          throw new Error(`Failed to download recording: ${recordingResponse.statusText}`);
        }

        // Get content length for logging and optimization
        const contentLength = recordingResponse.headers.get('content-length');
        const contentLengthNum = contentLength ? parseInt(contentLength) : undefined;
        
        if (contentLengthNum) {
          const sizeInMB = contentLengthNum / (1024 * 1024);
          console.log(`Recording size: ${sizeInMB.toFixed(2)} MB - using streaming upload`);
        }

        // Use streaming to handle files of any size without memory constraints
        const recordingFileName = `recording_${nylasNotetakerId}.mp4`; // Most Nylas recordings are MP4
        
        try {
          const storedRecording = await saveMeetingMediaStream(
            recordingResponse.body as any, // node-fetch response body is a readable stream
            recordingFileName,
            orgId,
            meetingId,
            contentLengthNum
          );
          results.savedRecordingPath = storedRecording.filePath;
          results.recordingStorageUrl = storedRecording.url;
          console.log(`Recording for notetaker ${nylasNotetakerId} stored successfully via streaming`);
        } catch (streamingError) {
          console.warn(`Streaming upload failed for recording, attempting fallback: ${streamingError instanceof Error ? streamingError.message : 'Unknown error'}`);
          
          // Fallback: re-download and use buffered approach
          const fallbackResponse = await fetch(recordingUrl);
          if (!fallbackResponse.ok) {
            throw new Error(`Failed to re-download recording for fallback: ${fallbackResponse.statusText}`);
          }
          
          const buffer = Buffer.from(await fallbackResponse.arrayBuffer());
          const storedRecording = await saveMeetingMedia(
            buffer,
            recordingFileName,
            orgId,
            meetingId
          );
          results.savedRecordingPath = storedRecording.filePath;
          results.recordingStorageUrl = storedRecording.url;
          console.log(`Recording for notetaker ${nylasNotetakerId} stored successfully via fallback buffered upload`);
        }
      } catch (error) {
        const errorMsg = `Recording download failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        nonCriticalErrors.push(errorMsg); // Recording is non-critical for AI processing
        console.error(errorMsg);
      }
    }

    // Download and store transcript if URL is provided
    if (transcriptUrl) {
      try {
        console.log(`Downloading transcript for notetaker ${nylasNotetakerId}`);
        const transcriptResponse = await fetch(transcriptUrl);
        if (!transcriptResponse.ok) {
          throw new Error(`Failed to download transcript: ${transcriptResponse.statusText}`);
        }
        
        // For transcripts, we still need the text content for processing
        // But we can use streaming for storage to be consistent
        results.transcriptText = await transcriptResponse.text();
        const transcriptFileName = `transcript_${nylasNotetakerId}.json`;
        
        // Create a stream from the text for consistent streaming storage
        const { Readable } = await import('stream');
        const transcriptStream = Readable.from([results.transcriptText]);
        const contentLength = Buffer.byteLength(results.transcriptText, 'utf-8');

        const storedTranscript = await saveMeetingMediaStream(
          transcriptStream,
          transcriptFileName,
          orgId,
          meetingId,
          contentLength
        );
        results.savedTranscriptPath = storedTranscript.filePath;
        results.transcriptStorageUrl = storedTranscript.url;
        console.log(`Transcript for notetaker ${nylasNotetakerId} stored successfully`);
      } catch (error) {
        const errorMsg = `Transcript download failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        criticalErrors.push(errorMsg); // Transcript is critical for AI processing quality
        console.error(errorMsg);
      }
    }

    // Download and store action items if URL is provided
    if (actionItemsUrl) {
      try {
        console.log(`Downloading action items for notetaker ${nylasNotetakerId}`);
        const actionItemsResponse = await fetch(actionItemsUrl);
        if (!actionItemsResponse.ok) {
          throw new Error(`Failed to download action items: ${actionItemsResponse.statusText}`);
        }
        results.actionItemsText = await actionItemsResponse.text();
        console.log(`Action items for notetaker ${nylasNotetakerId} downloaded successfully`);
      } catch (error) {
        const errorMsg = `Action items download failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        nonCriticalErrors.push(errorMsg); // Action items are non-critical, we generate our own
        console.error(errorMsg);
      }
    }

    // Download and store summary if URL is provided
    if (summaryUrl) {
      try {
        console.log(`Downloading summary for notetaker ${nylasNotetakerId}`);
        const summaryResponse = await fetch(summaryUrl);
        if (!summaryResponse.ok) {
          throw new Error(`Failed to download summary: ${summaryResponse.statusText}`);
        }
        results.summaryText = await summaryResponse.text();
        console.log(`Summary for notetaker ${nylasNotetakerId} downloaded successfully`);
      } catch (error) {
        const errorMsg = `Summary download failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        nonCriticalErrors.push(errorMsg); // Summary is non-critical, we generate our own
        console.error(errorMsg);
      }
    }

    // Download and store thumbnail if URL is provided
    if (thumbnailUrl) {
      try {
        console.log(`Downloading thumbnail for notetaker ${nylasNotetakerId}`);
        const thumbnailResponse = await fetch(thumbnailUrl);
        if (!thumbnailResponse.ok) {
          throw new Error(`Failed to download thumbnail: ${thumbnailResponse.statusText}`);
        }
        
        // Get content length for optimization
        const contentLength = thumbnailResponse.headers.get('content-length');
        const contentLengthNum = contentLength ? parseInt(contentLength) : undefined;
        
        const thumbnailFileName = `thumbnail_${nylasNotetakerId}.png`;

        try {
          const storedThumbnail = await saveMeetingMediaStream(
            thumbnailResponse.body as any,
            thumbnailFileName,
            orgId,
            meetingId,
            contentLengthNum
          );
          results.savedThumbnailPath = storedThumbnail.filePath;
          results.thumbnailStorageUrl = storedThumbnail.url;
          console.log(`Thumbnail for notetaker ${nylasNotetakerId} stored successfully via streaming`);
        } catch (streamingError) {
          console.warn(`Streaming upload failed for thumbnail, attempting fallback: ${streamingError instanceof Error ? streamingError.message : 'Unknown error'}`);
          
          // Fallback: re-download and use buffered approach
          const fallbackResponse = await fetch(thumbnailUrl);
          if (!fallbackResponse.ok) {
            throw new Error(`Failed to re-download thumbnail for fallback: ${fallbackResponse.statusText}`);
          }
          
          const buffer = Buffer.from(await fallbackResponse.arrayBuffer());
          const storedThumbnail = await saveMeetingMedia(
            buffer,
            thumbnailFileName,
            orgId,
            meetingId
          );
          results.savedThumbnailPath = storedThumbnail.filePath;
          results.thumbnailStorageUrl = storedThumbnail.url;
          console.log(`Thumbnail for notetaker ${nylasNotetakerId} stored successfully via fallback buffered upload`);
        }
      } catch (error) {
        const errorMsg = `Thumbnail download failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        nonCriticalErrors.push(errorMsg); // Thumbnail is purely cosmetic, non-critical
        console.error(errorMsg);
      }
    }

    // Return results with categorized errors
    if (errors.length > 0) {
      results.error = errors.join('; ');
    }
    if (criticalErrors.length > 0) {
      results.criticalError = criticalErrors.join('; ');
    }
    if (nonCriticalErrors.length > 0) {
      results.nonCriticalErrors = nonCriticalErrors;
    }

    return results;

  } catch (error) {
    console.error('Error in streaming media download:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error during streaming media processing'
    };
  }
};

export const createActivityFromInstantMeeting = async (
  nylasGrantId: string,
  nylasNotetakerId: string,
  userId: string,
  organizationId: string,
  recordingUrl?: string,
  transcriptUrl?: string
): Promise<ICalendarActivity | null> => {
  console.log(`Creating activity for instant meeting: notetakerId=${nylasNotetakerId}, grantId=${nylasGrantId}`);
  try {
    let transcriptText: string | undefined;
    let title = `Instant Meeting - ${new Date().toLocaleString()}`;

    if (transcriptUrl) {
      try {
        const response = await fetch(transcriptUrl);
        if (response.ok) {
          transcriptText = await response.text();
          title = await generateMeetingTitle(transcriptText);
        } else {
          console.warn(`Failed to download transcript for instant meeting title generation: ${response.statusText}`);
        }
      } catch (fetchError) {
        console.warn('Error fetching transcript for title generation:', fetchError);
      }
    }

    const now = new Date();
    const newActivity = new CalendarActivity({
      organization: organizationId,
      createdBy: userId,
      title: title,
      status: 'completed', // Assuming instant meetings are completed once media is available
      mediaStatus: 'available',
      startTime: now, 
      endTime: new Date(now.getTime() + 30 * 60000), // Default to 30 mins duration
      date: now, // Required field: date equals startTime
      timezone: 'UTC', // Or user's timezone if available
      nylasGrantId: nylasGrantId,
      nylasNotetakerId: nylasNotetakerId,
      recordingUrl: recordingUrl,
      transcriptUrl: transcriptUrl,
      attendees: [], // No attendees known initially for instant meetings via this flow
      contacts: [],  // No contacts known initially
      // Default other required fields from your schema if any
      calendarId: 'instant_meeting', // Placeholder calendarId
      eventId: `instant_${nylasNotetakerId}`, // Unique eventId
      type: 'calendar' // ensure type is set as per schema enum
    });

    await newActivity.save();
    console.log(`Created new CalendarActivity ${newActivity._id} for instant meeting (notetaker: ${nylasNotetakerId})`);

    // Download and store media files
    if (newActivity._id && (recordingUrl || transcriptUrl)) {
      const mediaStorageResult = await downloadAndStoreNylasMedia(
        organizationId,
        newActivity._id.toString(),
        nylasNotetakerId,
        recordingUrl,
        transcriptUrl,
      );

      if (mediaStorageResult.savedRecordingPath) {
        newActivity.savedRecordingPath = mediaStorageResult.savedRecordingPath;
      }
      if (mediaStorageResult.savedTranscriptPath) {
        newActivity.savedTranscriptPath = mediaStorageResult.savedTranscriptPath;
      }
      if (transcriptText) {
        newActivity.transcriptionText = transcriptText;
      }
      if (mediaStorageResult.error) {
        console.error(`Error storing media for new instant meeting activity ${newActivity._id}: ${mediaStorageResult.error}`);
        newActivity.mediaStatus = 'error'; // Update status if media saving failed
      }
      await newActivity.save(); // Save again with media paths
      IntelligenceProcessor.processActivity(newActivity);
    }
    return newActivity;
  } catch (error) {
    console.error(`Error creating activity from instant meeting (notetaker: ${nylasNotetakerId}):`, error);
    return null;
  }
};

// Fetch emails and calendar events for a specific contact after creation or email addition
export const fetchEmailsAndEventsForContact = async (contactId: string, organizationId: string): Promise<void> => {
  const startTime = Date.now();
  
  try {
    console.log(`[NYLAS-FETCH] Starting email and calendar fetch for contact ${contactId}`);
    
    // Get the contact with all email addresses and populate prospect
    const contact = await Contact.findById(contactId).populate('prospect');
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }
    const prospect = await Prospect.findById(contact.prospect).populate('contacts').lean();
    
    const contactInfo = `${contact.firstName || ''} ${contact.lastName || ''} (${contact._id})`.trim();
    
    // Validate contact has emails
    if (!contact.emails || contact.emails.length === 0) {
      console.warn(`[NYLAS-FETCH] Contact ${contactInfo} has no email addresses - skipping fetch`);
      await Contact.findByIdAndUpdate(contactId, { emailFetchStatus: 'SUCCESS' });
      return;
    }
    
    // Find ALL Nylas connections for the organization
    const nylasConnections = await NylasConnection.find({
      organization: organizationId
    }).populate('user');
    
    if (!nylasConnections || nylasConnections.length === 0) {
      console.warn(`[NYLAS-FETCH] No Nylas connections found for organization ${organizationId} - skipping email and calendar fetch for ${contactInfo}`);
      await Contact.findByIdAndUpdate(contactId, { emailFetchStatus: 'SUCCESS' });
      return;
    }
    
    // Extract all email addresses from the contact
    const emailAddresses = contact.emails
      .map(email => email.address)
      .filter(address => address && typeof address === 'string');
    
    if (emailAddresses.length === 0) {
      console.warn(`[NYLAS-FETCH] No valid email addresses found for contact ${contactInfo}`);
      await Contact.findByIdAndUpdate(contactId, { emailFetchStatus: 'SUCCESS' });
      return;
    }
    
    console.log(`[NYLAS-FETCH] Fetching emails and calendar events for ${emailAddresses.length} email addresses across ${nylasConnections.length} Nylas connections: ${emailAddresses.join(', ')}`);
    
    let totalThreadsFound = 0;
    let totalEventsFound = 0;
    let successfulConnections = 0;
    const failedConnections: string[] = [];
    
    // Process each Nylas connection
    for (const nylasConnection of nylasConnections) {
      const user = nylasConnection.user as any; // Should be populated
      
      if (!user) {
        console.warn(`[NYLAS-FETCH] No user found for Nylas connection ${nylasConnection._id} - skipping`);
        failedConnections.push(`Connection ${nylasConnection._id} (no user)`);
        continue;
      }
      
      const userInfo = `${user.email || user._id}`;
      console.log(`[NYLAS-FETCH] Processing connection for user ${userInfo} (grant: ${nylasConnection.grantId})`);
      
      // Wrap each connection's fetching logic in retry block
      await retry(async (bail) => {
        try {
          // 1. Fetch email threads
          const threads = await getAllEmailThreads(nylasConnection.grantId, emailAddresses);
          
          if (threads && threads.length > 0) {
            console.log(`[NYLAS-FETCH] Found ${threads.length} email threads for contact ${contactInfo} in connection ${userInfo}`);
            totalThreadsFound += threads.length;
            
            // Process all threads and create/update email activities
            const threadIds = threads.map(thread => thread.id);
            await getEmailThread(nylasConnection.grantId, threadIds, contact, user);
          } else {
            console.log(`[NYLAS-FETCH] No email threads found for contact ${contactInfo} in connection ${userInfo}`);
          }
          
          // 2. Fetch calendar events
          try {
            // Get available calendars for this connection
            const calendarsResponse = await getAvailableCalendars(nylasConnection.grantId);
            
            if (calendarsResponse && calendarsResponse.data && calendarsResponse.data.length > 0) {
              console.log(`[NYLAS-FETCH] Found ${calendarsResponse.data.length} calendars for connection ${userInfo}`);
              
              // For each calendar, fetch events that include the contact's email addresses
              for (const calendar of calendarsResponse.data) {
                try {
                  // Get events for this calendar involving the contact's email addresses
                  let calendarEvents: any[] = [];
                  
                  for (const emailAddress of emailAddresses) {
                    try {
                                             const events = await rateLimitedNylas.listEvents({
                         identifier: nylasConnection.grantId,
                         queryParams: {
                           calendarId: calendar.id,
                           attendees: [emailAddress],
                           start: `${Math.floor(new Date().setFullYear(new Date().getFullYear() - 3) / 1000)}`,
                         }
                       });
                      
                      if (events.data && events.data.length > 0) {
                        calendarEvents = [...calendarEvents, ...events.data];
                      }
                    } catch (eventError) {
                      console.warn(`[NYLAS-FETCH] Error fetching events for ${emailAddress} in calendar ${calendar.id}: ${eventError instanceof Error ? eventError.message : 'Unknown error'}`);
                      // Continue with other email addresses
                    }
                  }
                  
                  if (calendarEvents.length > 0) {
                    console.log(`[NYLAS-FETCH] Found ${calendarEvents.length} calendar events for contact ${contactInfo} in calendar ${calendar.id}`);
                    totalEventsFound += calendarEvents.length;
                    
                    
                    await processCalendarEvents(
                      calendarEvents, 
                      nylasConnection.grantId, 
                      calendar.id, 
                      prospect
                    );
                  }
                } catch (calendarError) {
                  console.warn(`[NYLAS-FETCH] Error processing calendar ${calendar.id} for contact ${contactInfo}: ${calendarError instanceof Error ? calendarError.message : 'Unknown error'}`);
                  // Continue with other calendars
                }
              }
            } else {
              console.log(`[NYLAS-FETCH] No calendars found for connection ${userInfo}`);
            }
          } catch (calendarError) {
            console.warn(`[NYLAS-FETCH] Error fetching calendars for connection ${userInfo}: ${calendarError instanceof Error ? calendarError.message : 'Unknown error'}`);
            // Continue - calendar errors shouldn't break email processing
          }
          
          successfulConnections++;
          
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[NYLAS-FETCH] Retry attempt failed for contact ${contactInfo} in connection ${userInfo}:`, error);
          
          // Check if this is a permanent error that shouldn't be retried
          if (errorMessage.includes('Contact not found')) {
            console.log(`[NYLAS-FETCH] Permanent error detected, not retrying: ${errorMessage}`);
            bail(error instanceof Error ? error : new Error(errorMessage));
            return;
          }
          
          // For other errors, let async-retry handle the retry logic
          throw error;
        }
      }, {
        retries: 3, // Reduced retries per connection since we have multiple connections
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        randomize: true,
        onRetry: (error: Error, attempt: number) => {
          console.log(`[NYLAS-FETCH] Retry attempt ${attempt}/3 for contact ${contactInfo} in connection ${userInfo}: ${error.message}`);
        }
      }).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[NYLAS-FETCH] Failed to fetch data for contact ${contactInfo} from connection ${userInfo} after retries: ${errorMessage}`);
        failedConnections.push(`${userInfo} (${errorMessage})`);
      });
    }
    
    console.log(`[NYLAS-FETCH] Data fetch completed for contact ${contactInfo}: ${successfulConnections}/${nylasConnections.length} connections successful, ${totalThreadsFound} email threads found, ${totalEventsFound} calendar events found`);
    
    if (failedConnections.length > 0) {
      console.warn(`[NYLAS-FETCH] Failed connections for contact ${contactInfo}: ${failedConnections.join(', ')}`);
    }
    
    // Update contact's email fetch status based on results
    let emailFetchStatus = 'SUCCESS';
    if (successfulConnections === 0) {
      emailFetchStatus = 'FAILED';
    } else if (failedConnections.length > 0) {
      // Some connections succeeded, some failed - still mark as SUCCESS but log the partial failure
      console.warn(`[NYLAS-FETCH] Partial success for contact ${contactInfo}: ${successfulConnections}/${nylasConnections.length} connections successful`);
    }
    
    await Contact.findByIdAndUpdate(contactId, { emailFetchStatus });
    
    const processingTime = Date.now() - startTime;
    console.log(`[NYLAS-FETCH] Data fetch ${emailFetchStatus.toLowerCase()} for contact ${contactInfo} in ${processingTime}ms`);
    
  } catch (error: unknown) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    console.error(`[NYLAS-FETCH] Error fetching data for contact ${contactId} after ${processingTime}ms:`);
    console.error(`[NYLAS-FETCH] Error message: ${errorMessage}`);
    console.error(`[NYLAS-FETCH] Error stack: ${errorStack}`);
    
    // After all retry attempts fail, update the contact's email fetch status to FAILED
    await Contact.findByIdAndUpdate(contactId, { emailFetchStatus: 'FAILED' });
    
    // Don't throw - we don't want data fetch failures to break contact operations
    console.warn(`[NYLAS-FETCH] Data fetch failed for contact ${contactId} - contact operations will continue`);
  }
};

// Create a new Nylas connection and trigger email fetch for all contacts in the organization
export const createNylasConnectionWithEmailFetch = async (
  userId: string, 
  organizationId: string, 
  email: string, 
  provider: string, 
  grantId: string, 
  accessToken: string
): Promise<INylasConnection> => {
  const session = await mongoose.startSession();
  
  try {
    let nylasConnection: INylasConnection;
    
    await session.withTransaction(async () => {
      // Create the Nylas connection within the transaction
      nylasConnection = new NylasConnection({
        user: userId,
        organization: organizationId,
        email,
        provider,
        grantId,
        syncStatus: 'active',
        lastSyncAt: new Date(),
        metadata: {
          accessToken,
          lastConnectedAt: new Date()
        }
      });

      await nylasConnection.save({ session });
      
      console.log(`[NYLAS-CONNECTION-SERVICE] Created new connection: ${email} (${nylasConnection._id})`);
    });

    // After successful connection creation, trigger email fetch for all contacts in the organization
    const startTime = Date.now();
    const connectionInfo = `${email} (${nylasConnection!._id})`;
    
    try {
      console.log(`[NYLAS-CONNECTION-SERVICE] Starting contact discovery and email fetch for new connection: ${connectionInfo}`);
      
      // First, discover contacts from recent emails in the new account
      await searchAndPopulateContactsForAllProspects(nylasConnection!);
      
      const contactModel = mongoose.model('Contact');
      
      // Find all contacts in the same organization (including newly discovered ones)
      const contacts = await contactModel.find({ 
        organization: organizationId 
      }).select('_id firstName lastName emails emailFetchStatus');
      
      if (!contacts || contacts.length === 0) {
        console.log(`[NYLAS-CONNECTION-SERVICE] No contacts found in organization ${organizationId} for new connection ${connectionInfo}`);
        return nylasConnection!;
      }
      
      console.log(`[NYLAS-CONNECTION-SERVICE] Found ${contacts.length} contacts to fetch emails for with new connection ${connectionInfo}`);
      
      // Set all contacts' email fetch status to PENDING before triggering fetch
      const contactIds = contacts.map((c: any) => c._id);
      await contactModel.updateMany(
        { _id: { $in: contactIds } },
        { emailFetchStatus: 'PENDING' }
      );
      
      console.log(`[NYLAS-CONNECTION-SERVICE] Set ${contacts.length} contacts to PENDING status for new connection ${connectionInfo}`);
      
      // Trigger email fetch with concurrency limit to prevent memory exhaustion
      const emailFetchLimit = pLimit(3); // Process max 3 contacts concurrently
      
      const fetchPromises = contacts.map((contact: any) => {
        const contactInfo = `${contact.firstName || ''} ${contact.lastName || ''} (${contact._id})`.trim();
        
        return emailFetchLimit(async () => {
          try {
            await fetchEmailsAndEventsForContact(contact._id.toString(), organizationId);
            console.log(`[NYLAS-CONNECTION-SERVICE] Email fetch completed for contact ${contactInfo} with new connection ${connectionInfo}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[NYLAS-CONNECTION-SERVICE] Email fetch failed for contact ${contactInfo} with new connection ${connectionInfo}: ${errorMessage}`);
          }
        });
      });
      
      // Run all fetches with concurrency control (don't block the response)
      Promise.all(fetchPromises).then(() => {
        const completionTime = Date.now() - startTime;
        console.log(`[NYLAS-CONNECTION-SERVICE] All email fetches completed for ${contacts.length} contacts with new connection ${connectionInfo} in ${completionTime}ms`);
      }).catch((error) => {
        console.error(`[NYLAS-CONNECTION-SERVICE] Error during batch email fetch for new connection ${connectionInfo}:`, error);
      });
      
      const processingTime = Date.now() - startTime;
      console.log(`[NYLAS-CONNECTION-SERVICE] Successfully triggered email fetch for ${contacts.length} contacts with new connection ${connectionInfo} in ${processingTime}ms (processing with concurrency limit of 3)`);
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[NYLAS-CONNECTION-SERVICE] Error triggering email fetch for new connection ${connectionInfo} after ${processingTime}ms: ${errorMessage}`);
      console.warn(`[NYLAS-CONNECTION-SERVICE] Email fetch trigger failed for new connection ${connectionInfo} - connection created successfully but email fetch not initiated`);
    }
    
    return nylasConnection!;
    
  } catch (error) {
    console.error('Error creating Nylas connection with email fetch:', error);
    throw error;
  } finally {
    await session.endSession();
  }
};

export const searchAndPopulateContactsForAllProspects = async (nylasConnection: INylasConnection): Promise<void> => {
  console.log(`[NYLAS-CONNECTION-SERVICE] Starting contact discovery for new connection: ${nylasConnection.email} (${nylasConnection._id})`);
  const startTime = Date.now();

  try {
    
    // Get all prospects for this organization
    const prospects = await Prospect.find({ 
      organization: nylasConnection.organization 
    });
    
    if (prospects.length === 0) {
      console.log(`[NYLAS-CONNECTION-SERVICE] No prospects found for organization ${nylasConnection.organization}`);
      return;
    }
    
    console.log(`[NYLAS-CONNECTION-SERVICE] Found ${prospects.length} prospects to process for organization ${nylasConnection.organization}`);
    
    let processedCount = 0;
    let errorCount = 0;
    
    // Process each prospect
    for (const prospect of prospects) {
      try {
        console.log(`[NYLAS-CONNECTION-SERVICE] Processing prospect ${prospect.name} (${prospect._id})`);
        // Pass the current nylasConnection to ensure it's included in the search
        await searchAndPopulateContacts(prospect._id.toString(), [nylasConnection]);
        processedCount++;
        console.log(`[NYLAS-CONNECTION-SERVICE] Successfully processed prospect ${prospect.name}`);
      } catch (error) {
        errorCount++;
        console.error(`[NYLAS-CONNECTION-SERVICE] Error processing prospect ${prospect.name} (${prospect._id}):`, error);
        // Continue to next prospect
      }
    }
    
    const processTime = Date.now() - startTime;
    console.log(`[NYLAS-CONNECTION-SERVICE] Finished contact discovery for new connection ${nylasConnection.email} in ${processTime}ms.`);
    console.log(`[NYLAS-CONNECTION-SERVICE] Results - Processed: ${processedCount}, Errors: ${errorCount}, Total Prospects: ${prospects.length}`);
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[NYLAS-CONNECTION-SERVICE] Error during contact discovery for connection ${nylasConnection.email} after ${totalTime}ms:`, error);
  }
};

/**
 * Perform keep-alive operations for a grant to prevent expiration due to inactivity
 * Makes lightweight API calls:
 * - List messages (limit=1) - maintains email access
 * - List calendars (limit=1) - maintains calendar access
 * 
 * @param grantId - The Nylas grant ID to keep alive
 * @throws Error if any API call fails
 */
export const performKeepAliveForGrant = async (grantId: string): Promise<void> => {
  try {
    // Perform lightweight list messages call
    await rateLimitedNylas.listMessages({
      identifier: grantId,
      queryParams: { limit: 1 }
    });

    // Perform lightweight list calendars call
    await rateLimitedNylas.listCalendars({
      identifier: grantId,
      limit: 1
    });

    console.log(`[NYLAS-KEEP-ALIVE] Successfully performed keep-alive for grant ${grantId}`);
  } catch (error) {
    console.error(`[NYLAS-KEEP-ALIVE] Error performing keep-alive for grant ${grantId}:`, error);
    throw error;
  }
};
