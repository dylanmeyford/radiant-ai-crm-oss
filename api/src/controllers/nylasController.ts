import { Request, Response } from 'express';
import { 
    getAuthUrl as getAuthUrlService, 
    handleCallback as handleCallbackService,
    getAvailableCalendars as getAvailableCalendarsService,
    getAllAvailableEventsForProspect,
    processNewEmailActivity,
    syncCalendarEvents,
    processNewCalendarActivity,
    handleDeletedCalendarEvent,
    downloadAndStoreNylasMedia,
    createActivityFromInstantMeeting,
    findNotetakerById,
    createNylasConnectionWithEmailFetch
} from '../services/NylasService';

import NylasConnection from '../models/NylasConnection';
import Prospect from '../models/Prospect';
import Organization from '../models/Organization';
import CalendarActivityModel, { ICalendarActivity } from '../models/CalendarActivity';
import mongoose from 'mongoose';
import pLimit from 'p-limit';
import { IntelligenceProcessor } from '../services/AI/personIntelligence/intelligenceProcessor';
import { MediaProcessingService } from '../services/mediaProcessingService';
import * as StripeService from '../services/StripeService';
import { DealMiningService } from '../services/dealMining/DealMiningService';

// Define Nylas API response types based on the example
interface NylasEventParticipant {
  email: string;
  name?: string;
  status: string;
}

interface NylasEventWhen {
  start_time: number;
  end_time: number;
  start_timezone?: string;
  end_timezone?: string;
  object?: string;
}

interface NylasEvent {
  id: string;
  title: string;
  description: string | null;
  location?: string;
  participants?: NylasEventParticipant[];
  when?: NylasEventWhen;
  status?: string;
  recurrence?: any;
  busy?: boolean;
  calendar_id?: string;
  created_at?: number;
  updated_at?: number;
  organizer?: {
    email: string;
    name?: string;
  };
  html_link?: string;
}

export const getAuthUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const authUrl = await getAuthUrlService();
    res.status(200).json({ url: authUrl });
  } catch (error) {
    console.error('Error getting auth URL:', error);
    res.status(500).json({ success: false, message: 'Failed to get authentication URL' });
  }
};

export const handleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.body.code as string;
    const user = req.user;
    
    if (!user || !user.organization) {
      res.status(401).json({ success: false, message: 'User not authenticated or missing organization' });
      return;
    }

    // CHECK BILLING STATUS BEFORE ALLOWING NEW CONNECTION
    const organization = await Organization.findById(user.organization);
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }

    // Require billing setup before connecting accounts
    if (!organization.paymentMethodAdded) {
      res.status(403).json({ 
        success: false, 
        message: 'Please set up billing before connecting email accounts',
        code: 'BILLING_REQUIRED'
      });
      return;
    }

    // Require active subscription
    if (organization.subscriptionStatus !== 'active' && organization.subscriptionStatus !== 'trialing') {
      res.status(403).json({ 
        success: false, 
        message: 'Active subscription required to connect email accounts',
        code: 'SUBSCRIPTION_REQUIRED'
      });
      return;
    }

    const { grantId, email, accessToken, provider } = await handleCallbackService(code);

    // Check if this grantId already exists (re-auth flow)
    const existingConnection = await NylasConnection.findOne({ grantId });
    
    let nylasConnection;
    let isReauth = false;

    if (existingConnection) {
      // Re-auth flow: Update existing connection
      console.log(`[NYLAS-CONTROLLER] Re-auth detected for grantId: ${grantId}`);
      
      existingConnection.email = email;
      existingConnection.provider = provider as 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'other' | 'google' | 'microsoft';
      existingConnection.syncStatus = 'active';
      existingConnection.error = undefined; // Clear any previous errors
      existingConnection.lastSyncAt = new Date();
      existingConnection.metadata = {
        accessToken,
        lastConnectedAt: new Date()
      };
      
      nylasConnection = await existingConnection.save();
      isReauth = true;
      
      console.log(`[NYLAS-CONTROLLER] Updated existing connection for email: ${email}`);
    } else {
      // New connection flow: Create new Nylas connection and trigger email fetch
      console.log(`[NYLAS-CONTROLLER] New connection detected for grantId: ${grantId}`);
      
      nylasConnection = await createNylasConnectionWithEmailFetch(
        (user._id as any).toString(),
        (user.organization as any).toString(),
        email,
        provider,
        grantId,
        accessToken
      );
    }

    // AUTO-UPDATE SUBSCRIPTION to account for new connection (skip for re-auth)
    if (!isReauth) {
      try {
        if (organization.stripeSubscriptionId) {
          const accountCount = await NylasConnection.countDocuments({
            organization: user.organization,
            syncStatus: 'active',
          });

          await StripeService.updateSubscription(
            organization.stripeSubscriptionId,
            accountCount
          );

          console.log(`[NYLAS-CONTROLLER] Updated subscription for org ${user.organization} to ${accountCount} accounts`);
        }
      } catch (subscriptionError) {
        console.error('[NYLAS-CONTROLLER] Error updating subscription:', subscriptionError);
        // Don't fail the connection if subscription update fails
      }
    } else {
      console.log(`[NYLAS-CONTROLLER] Skipping subscription update for re-auth flow`);
    }

    // Trigger deal mining for new connections (async - don't block response)
    // This provides the immediate "wow" moment when users connect their email
    if (!isReauth) {
      setImmediate(async () => {
        try {
          console.log(`[NYLAS-CONTROLLER] Triggering deal mining for new connection: user ${user._id}`);
          await DealMiningService.mineDealsForUser((user._id as any).toString(), { isNewConnection: true });
        } catch (error) {
          console.error('[NYLAS-CONTROLLER] Error during deal mining for new connection:', error);
          // Don't fail - deal mining is a nice-to-have, not critical
        }
      });
    }

    res.status(200).json({ status: 'success', nylasConnection });
  } catch (error) {
    console.error('Error handling Nylas callback:', error);
    res.status(500).json({ success: false, message: 'Failed to handle Nylas callback' });
  }
};

export const getNylasConnections = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const nylasConnections = await NylasConnection.find({ user: user._id });

    if (nylasConnections.length === 0) {
      res.status(404).json({ success: false, message: 'No Nylas connections found for this user' });
      return;
    }

    res.status(200).json({ status: 'success', nylasConnections });
  } catch (error) {
    console.error('Error fetching Nylas connections:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Nylas connections' });
  }
};

export const getAvailableCalendars = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const nylasConnectionId = req.body.nylasConnectionId as string;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const nylasConnections = await NylasConnection.find({ user: user._id, _id: nylasConnectionId });

    if (nylasConnections.length === 0) {
      res.status(400).json({ success: false, message: 'No Nylas connections found' });
      return;
    }

    const calendars = await getAvailableCalendarsService(nylasConnections[0].grantId);

    const currentCalendars = nylasConnections[0].calendars; 

    const calendarsToSubscribe = calendars.data.filter((calendar: any) => !currentCalendars.includes(calendar.id));
    
    res.status(200).json({ status: 'success', currentCalendars, calendarsToSubscribe });
  } catch (error) {
    console.error('Error fetching available calendars:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available calendars' });
  }
};

export const subscribeToCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const nylasConnectionId = req.body.nylasConnectionId as string;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const { calendarId } = req.body;
    if (!calendarId) {
        res.status(400).json({ success: false, message: 'Calendar ID is required' });
        return;
    }

    let nylasConnection = await NylasConnection.findOne({ user: user._id, _id: nylasConnectionId });

    if (!nylasConnection) {
      res.status(400).json({ success: false, message: 'No Nylas connections found' });
      return;
    }

    // Step 1: Subscribe to the calendar (simple update, no transaction needed)
    if (!nylasConnection.calendars.includes(calendarId)) {
      nylasConnection.calendars.push(calendarId);
      await nylasConnection.save();
    }

    // Respond immediately - calendar subscription is complete
    res.status(200).json({ 
      status: 'success',
      message: `Successfully subscribed to calendar ${calendarId}. Historical events are being processed in the background.`,
      calendarEventsProcessed: 0 // Will be processed async
    });

    // Step 2: Process historical events in background (after response sent)
    // This runs after the response is sent to avoid Heroku's 30s timeout
    const grantId = nylasConnection.grantId;
    const organizationId = user.organization;
    
    setImmediate(async () => {
      try {
        console.log(`[CALENDAR-SUBSCRIBE] Starting background processing for calendar ${calendarId}`);
        const prospects = await Prospect.find({ organization: organizationId }).populate('contacts').lean();
        
        // Process prospects concurrently with limit to avoid overwhelming the rate limiter
        const limit = pLimit(3);
        let totalProcessed = 0;

        const results = await Promise.allSettled(
          prospects.map(prospect => 
            limit(async () => {
              const calendarActivities = await getAllAvailableEventsForProspect(grantId, calendarId, prospect);
              return calendarActivities.length;
            })
          )
        );

        // Aggregate results and log any failures
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled') {
            totalProcessed += result.value;
          } else {
            console.error(`[CALENDAR-SUBSCRIBE] Error processing prospect ${prospects[i]._id}:`, result.reason);
          }
        }
        
        console.log(`[CALENDAR-SUBSCRIBE] Completed background processing for calendar ${calendarId}. Processed ${totalProcessed} events.`);
      } catch (bgError) {
        console.error(`[CALENDAR-SUBSCRIBE] Background processing error for calendar ${calendarId}:`, bgError);
      }
    });

  } catch (error) {
    console.error('Error subscribing to calendar:', error);
    res.status(500).json({ success: false, message: 'Failed to subscribe to calendar' });
  }
};

/**
 * Handle grant expiration webhook
 * Updates the NylasConnection status to 'expired' when a grant expires
 */
export const handleGrantExpired = async (grantId: string): Promise<void> => {
  try {
    console.log(`[GRANT-EXPIRED] Processing grant expiration for grantId: ${grantId}`);
    
    const connection = await NylasConnection.findOne({ grantId });
    
    if (!connection) {
      console.error(`[GRANT-EXPIRED] No connection found for grantId: ${grantId}`);
      return;
    }
    
    connection.syncStatus = 'expired';
    connection.error = {
      message: 'Grant has expired and needs to be re-authenticated',
      code: '25009',
      timestamp: new Date(),
    };
    
    await connection.save();
    
    console.log(`[GRANT-EXPIRED] Updated connection status for email: ${connection.email}, grantId: ${grantId}`);
  } catch (error) {
    console.error(`[GRANT-EXPIRED] Error processing grant expiration for grantId ${grantId}:`, error);
  }
};

export const receiveNylasWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Received Nylas webhook');

    if (req.query.challenge) {
      console.log(`Received challenge code! - ${req.query.challenge}`);
      
      // Enable the webhook by responding with the challenge parameter.
      res.send(req.query.challenge);
      return;
    }

    // Send success response before since these functions are async and we want to ensure Nylas knows we've received the webhook
    res.status(200).json({ success: true, message: 'Webhook received and processed' });
    
    const webhookData = req.body.data.object;
    switch (req.body.type) {
      case 'event.created':
      case 'event.updated':
        await processNewCalendarActivity(webhookData);
        break;
      case 'event.deleted':
        await handleDeletedCalendarEvent(req.body);
        break;
      case 'message.created':
      case 'message.created.truncated':
      case 'message.updated':
      case 'message.updated.truncated':
        await processNewEmailActivity({...webhookData, truncated: req.body.type.includes('.truncated')});
        break;
      case 'notetaker.created':
        console.log('Received notetaker.created webhook:', webhookData);
        if (webhookData.id && webhookData.grant_id) {
            const event = await findNotetakerById(webhookData.grant_id, webhookData.id);
            if (event.success) {
              const notetaker = event.data;
              console.log(`Found notetaker ${notetaker?.id} for event ${webhookData.id} and grant ${webhookData.grant_id}`);
              const eventId = notetaker?.eventId;
              if (eventId) {
                const existingActivity = await CalendarActivityModel.findOne(
                  { nylasEventId: eventId, nylasGrantId: webhookData.grant_id }
              );
              if (existingActivity) {
                existingActivity.nylasNotetakerId = webhookData.id;
                await existingActivity.save();
                }
              }
            }
        } else {
          console.warn('Received notetaker.created webhook with missing event_id, id, or grant_id:', webhookData);
        }
        break;
      case 'notetaker.meeting_state':
        console.log('Received notetaker.meeting_state webhook:', webhookData);
        if (webhookData.id && webhookData.grant_id && webhookData.status === 'connecting') {
            const event = await findNotetakerById(webhookData.grant_id, webhookData.id);
            if (event.success) {
              const notetaker = event.data;
              console.log(`Found notetaker ${notetaker?.id} for event ${webhookData.id} and grant ${webhookData.grant_id}`);
              const eventId = notetaker?.eventId;
              if (eventId) {
                const existingActivity = await CalendarActivityModel.findOne(
                  { nylasEventId: eventId, nylasGrantId: webhookData.grant_id }
              );
              if (existingActivity) {
                existingActivity.nylasNotetakerId = webhookData.id;
                await existingActivity.save();
                }
              }
            }
        } else {
          console.warn('Received notetaker.created webhook with missing event_id, id, or grant_id:', webhookData);
        }
        break;
      case 'notetaker.updated':
        console.log('Received notetaker.updated webhook:', webhookData);
        if (webhookData.id && webhookData.state) {
          //technically this is also being used as a general status field, though it is called media status
          const updatedActivity = await CalendarActivityModel.findOneAndUpdate(
            { nylasNotetakerId: webhookData.id },
            { mediaStatus: `notetaker_${webhookData.state}` }, 
            { new: true }
          );
          if (updatedActivity) {
            console.log(`Updated CalendarActivity ${updatedActivity._id} status based on notetaker state: ${webhookData.state}`);
          } else {
             console.warn(`No CalendarActivity found for notetaker_id: ${webhookData.id} to update status from notetaker.updated webhook`);
          }
        }
        break;
      case 'notetaker.deleted':
        console.log('Received notetaker.deleted webhook:', webhookData);
        if (webhookData.id) {
          const activity = await CalendarActivityModel.findOneAndUpdate(
            { nylasNotetakerId: webhookData.id },
            {
              nylasNotetakerId: null, 
              mediaStatus: 'notetaker_deleted',
            },
            { new: true }
          );
          if (activity) {
            console.log(`Processed notetaker.deleted for CalendarActivity ${activity._id}, removed notetaker ID ${webhookData.id}`);
          } else {
            console.warn(`No CalendarActivity found for notetaker_id: ${webhookData.id} to process notetaker.deleted webhook`);
          }
        }
        break;
      case 'notetaker.media':
        console.log('Received notetaker.media webhook:', webhookData);
        const notetakerId = webhookData.id;
        const mediaState = webhookData.state; // 'available', 'deleted', 'error', 'processing'
        const mediaPayload = webhookData.media; // { recording: "url", transcript: "url" }
        const grantId = webhookData.grant_id; // Sourced from data.object.grant_id based on provided payload

        if (!notetakerId) {
          console.warn('Received notetaker.media webhook with missing notetaker id:', webhookData);
          break; 
        }

        // Find the CalendarActivity associated with this notetaker
        // Assuming 'nylasNotetakerId' is the field storing the notetaker ID in your CalendarActivity model
        const calendarActivity = await CalendarActivityModel.findOne({ nylasNotetakerId: notetakerId });

        if (!calendarActivity) {
          if (mediaState === 'available') {
            console.log(`No CalendarActivity found for notetaker_id: ${notetakerId}. This might be an instant meeting.`);
            if (!grantId) {
              console.error('CRITICAL: grant_id missing from notetaker.media webhook payload. Cannot create instant meeting activity.', req.body.data);
              break;
            }
            // Call a new service to handle instant meeting creation
            // This service will internally find user/org from grantId, download transcript, create title, create activity, and store media.
            const nylasConnection = await NylasConnection.findOne({ grantId: grantId });
            if (!nylasConnection) {
              console.error(`No NylasConnection found for grantId ${grantId} from notetaker.media webhook. Cannot create instant meeting activity.`);
              break;
            }
            const userId = nylasConnection.user.toString();
            const organizationId = nylasConnection.organization.toString();

            console.log(`Attempting to create new activity for instant meeting: notetakerId=${notetakerId}, grantId=${grantId}`);
            await createActivityFromInstantMeeting(
              grantId, 
              notetakerId, 
              userId, 
              organizationId, 
              mediaPayload?.recording, 
              mediaPayload?.transcript
            );
            
          } else {
            console.warn(`No CalendarActivity found for notetaker_id: ${notetakerId} to process notetaker.media state: ${mediaState}`);
          }
          break;
        }

        // Update CalendarActivity based on mediaState
        switch (mediaState) {
          case 'available':
            if (mediaPayload?.recording) {
              calendarActivity.recordingUrl = mediaPayload.recording;
            }
            if (mediaPayload?.transcript) {
              calendarActivity.transcriptUrl = mediaPayload.transcript;
            }
            calendarActivity.mediaStatus = 'processing';
            
            // Queue media download for background processing to prevent webhook timeout
            if (calendarActivity.organization && calendarActivity._id) {
              try {
                await MediaProcessingService.enqueueMediaProcessing(
                  calendarActivity.organization.toString(),
                  calendarActivity._id.toString(),
                  notetakerId, // nylasNotetakerId
                  grantId, // grantId
                  {
                    recordingUrl: mediaPayload?.recording,
                    transcriptUrl: mediaPayload?.transcript,
                    // intentionally skipping actionItemsUrl and summaryUrl
                    thumbnailUrl: mediaPayload?.thumbnail,
                  },
                  mediaPayload?.recording_duration
                );
                console.log(`Queued media processing for notetaker ${notetakerId}`);
              } catch (error) {
                console.error(`Error queueing media processing for notetaker ${notetakerId}:`, error);
                calendarActivity.mediaStatus = 'error';
              }
            } else {
              console.warn(`Missing organization or _id on CalendarActivity ${calendarActivity._id}, cannot queue media processing.`);
            }
            calendarActivity.date = new Date();
            const thisActivity = await calendarActivity.save();
            IntelligenceProcessor.processActivity(thisActivity);
            console.log(`Updated CalendarActivity ${calendarActivity._id} with media URLs and queued media processing. Status: processing.`);
            break;
          case 'processing':
            calendarActivity.mediaStatus = 'processing';
            await calendarActivity.save();
            console.log(`CalendarActivity ${calendarActivity._id} media is processing.`);
            break;
          case 'deleted':
            calendarActivity.recordingUrl = undefined; 
            calendarActivity.transcriptUrl = undefined;
            calendarActivity.mediaStatus = 'deleted';
            await calendarActivity.save();
            console.log(`CalendarActivity ${calendarActivity._id} media has been deleted.`);
            break;
          case 'error':
            calendarActivity.mediaStatus = 'error';
            await calendarActivity.save();
            console.log(`CalendarActivity ${calendarActivity._id} media processing encountered an error.`);
            break;
          default:
            console.warn(`Received unknown media state: ${mediaState} for notetaker_id: ${notetakerId}`);
        }
        break;
      case 'grant.expired':
        console.log('Received grant.expired webhook:', webhookData);
        if (webhookData.grant_id) {
          await handleGrantExpired(webhookData.grant_id);
        } else {
          console.error('[GRANT-EXPIRED] Webhook received without grant_id:', webhookData);
        }
        break;
    }
  } catch (error) {
    console.error('Error processing Nylas webhook:', error);
    // Only send error response if we haven't already sent a response
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error processing webhook' });
    }
  }
};

export const syncAllCalendarEvents = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;

  if (!user) {
    res.status(400).json({ success: false, message: 'User ID and Organization ID are required' });
    return;
  }

  try {
    // Find all Nylas connections for the user
    const nylasConnections = await NylasConnection.find({ 
      user: user._id, 
      organization: user.organization
    });

    if (nylasConnections.length === 0) {
      res.status(404).json({ success: false, message: 'No Nylas connections found for this user' });
      return;
    }

    let totalEventsSynced = 0;
    
    // For each connection, sync events from all calendars
    for (const connection of nylasConnections) {
      if (connection.calendars.length === 0) {
        continue;
      }
      
      // Sync events for each calendar
      for (const calendarId of connection.calendars) {
        const syncedEvents = await syncCalendarEvents(connection.grantId, calendarId, user.id, user.organization.toString());
        totalEventsSynced += syncedEvents.length;
      }
    }

    res.status(200).json({ 
      status: 'success', 
      message: `Successfully synced ${totalEventsSynced} events across all calendars`,
      totalEventsSynced
    });
  } catch (error) {
    console.error('Error syncing calendar events:', error);
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to sync calendar events' 
    });
  }
};

// Get email signature for a specific Nylas connection
export const getEmailSignature = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { connectionId } = req.params;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!connectionId) {
      res.status(400).json({ success: false, message: 'Connection ID is required' });
      return;
    }

    const connection = await NylasConnection.findOne({
      _id: connectionId,
      user: user._id,
      organization: user.organization
    });

    if (!connection) {
      res.status(404).json({ success: false, message: 'Nylas connection not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        connectionId: connection._id,
        email: connection.email,
        emailSignature: connection.emailSignature || ''
      }
    });
  } catch (error) {
    console.error('Error getting email signature:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching email signature' 
    });
  }
};

// Update email signature for a specific Nylas connection
export const updateEmailSignature = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { connectionId } = req.params;
    const { emailSignature } = req.body;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!connectionId) {
      res.status(400).json({ success: false, message: 'Connection ID is required' });
      return;
    }

    if (emailSignature === undefined) {
      res.status(400).json({ success: false, message: 'Email signature is required' });
      return;
    }

    const connection = await NylasConnection.findOneAndUpdate(
      {
        _id: connectionId,
        user: user._id,
        organization: user.organization
      },
      { emailSignature },
      { new: true }
    );

    if (!connection) {
      res.status(404).json({ success: false, message: 'Nylas connection not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        connectionId: connection._id,
        email: connection.email,
        emailSignature: connection.emailSignature
      },
      message: 'Email signature updated successfully'
    });
  } catch (error) {
    console.error('Error updating email signature:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating email signature' 
    });
  }
};