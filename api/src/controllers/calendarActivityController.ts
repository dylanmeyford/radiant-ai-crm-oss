import { Request, Response } from 'express';
import CalendarActivity, { ICalendarActivity } from '../models/CalendarActivity';
import NylasConnection from '../models/NylasConnection';
import { generateMeetingMediaPresignedUrl, saveMeetingMedia } from '../services/fileStorageService';
import Opportunity from '../models/Opportunity';
import Contact from '../models/Contact';
import { IntelligenceProcessor } from '../services/AI/personIntelligence/intelligenceProcessor';
import { ActionPipelineTriggerService } from '../services/activityProcessingService/actionPipelineTriggerService';
import mongoose from 'mongoose';
import { normalizeTranscript } from '../services/transcriptNormalizationService';

// Get all calendar activities for an opportunity
export const getOpportunityCalendarActivities = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, message: 'User not authenticated' });
    return;
  }

  const opportunity = await Opportunity.findOne({_id: id, organization: user.organization});
  if (!opportunity) {
    res.status(404).json({ success: false, message: 'Opportunity not found' });
    return;
  }

  const contacts = await Contact.find({ prospect: opportunity?.prospect, organization: opportunity?.organization, opportunities: opportunity?._id });
  const calendarActivities = await CalendarActivity.find({ contacts: { $in: contacts.map((contact) => contact._id) } });
  res.status(200).json(calendarActivities);
};

// Get all calendar activities
export const getCalendarActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { 
      startDate, 
      endDate, 
      status, 
      calendarId,
    } = req.query;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Build filter object and always scope to the user's organization
    const filter: any = { organization: user.organization };
    
    if (startDate && endDate) {
      filter.startTime = { $gte: new Date(startDate as string) };
      filter.endTime = { $lte: new Date(endDate as string) };
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (calendarId) {
      filter.calendarId = calendarId;
    }
      // Find the Nylas connection to get the grant ID
      const nylasConnections = await NylasConnection.find({
        user: user._id,
        organization: user.organization
      });

      if (!nylasConnections || nylasConnections.length === 0) {
        // No connected accounts for this user/org → return an empty list
        res.status(200).json({
          success: true,
          data: []
        });
        return;
      }

      // Scope by any of the user's/org's Nylas grant IDs
      filter.nylasGrantId = { $in: nylasConnections.map(conn => conn.grantId) };

    const calendarActivities = await CalendarActivity.find(filter)
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      data: calendarActivities
    });
  } catch (error) {
    console.error('Get calendar activities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching calendar activities' });
  }
};

// Get recorded calendar activities with pagination
export const getRecordedActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    // Default to page 1, 10 items per page if not specified
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    if (!user || !user.organization) {
      res.status(401).json({ success: false, message: 'User not authenticated or not associated with an organization' });
      return;
    }

    const filter: any = {
      organization: user.organization,
      $or: [
        { savedRecordingPath: { $exists: true, $ne: null } },
        { savedTranscriptPath: { $exists: true, $ne: null } }
      ]
    };

    const recordedActivities = await CalendarActivity.find(filter)
    .populate('prospect')
    .populate('contacts')
    .sort({ startTime: -1 }) // Sort by start time, newest first
    .skip(skip)
    .limit(limit);

    const totalRecordedActivities = await CalendarActivity.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: recordedActivities,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRecordedActivities / limit),
        totalItems: totalRecordedActivities,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get recorded calendar activities error:', error);
    if (error instanceof Error) {
      res.status(500).json({ success: false, message: `Error fetching recorded calendar activities: ${error.message}` });
    } else {
      res.status(500).json({ success: false, message: 'An unknown error occurred while fetching recorded calendar activities' });
    }
  }
};

export const getRecordedActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const recordedActivity = await CalendarActivity.findById({_id: id, organization: user.organization});

    if (!recordedActivity) {
      res.status(404).json({ success: false, message: 'Recorded calendar activity not found' });
      return;
    }

    if (recordedActivity.organization.toString() !== user.organization.toString()) {
      res.status(403).json({ success: false, message: 'Unauthorized access to this calendar activity' });
      return;
    }

    res.status(200).json({
      success: true,
      data: recordedActivity
    });
  } catch (error) {
    console.error('Get recorded calendar activity error:', error);
    res.status(500).json({ success: false, message: 'An unknown error occurred while fetching recorded calendar activity' });
  }
};

// Get upcoming calendar activities
export const getUpcomingCalendarActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { limit } = req.query;
    const limitNumber = limit ? parseInt(limit as string) : 10;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Get all activities with startTime greater than now
    const now = new Date();
    
    const calendarActivities = await CalendarActivity.find({
      startTime: { $gte: now },
      status: { $ne: 'cancelled' }
    })
      .sort({ startTime: 1 })
      .limit(limitNumber);

    res.status(200).json({
      success: true,
      data: calendarActivities
    });
  } catch (error) {
    console.error('Get upcoming calendar activities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching upcoming calendar activities' });
  }
};

// Get a single calendar activity
export const getCalendarActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const calendarActivity = await CalendarActivity.findById(id);

    if (!calendarActivity) {
      res.status(404).json({ success: false, message: 'Calendar activity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: calendarActivity
    });
  } catch (error) {
    console.error('Get calendar activity error:', error);
    res.status(500).json({ success: false, message: 'Error fetching calendar activity' });
  }
};

// Update a calendar activity
export const updateCalendarActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the calendar activity
    const calendarActivity = await CalendarActivity.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!calendarActivity) {
      res.status(404).json({ success: false, message: 'Calendar activity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: calendarActivity
    });
  } catch (error) {
    console.error('Update calendar activity error:', error);
    res.status(500).json({ success: false, message: 'Error updating calendar activity' });
  }
};

// Update a calendar activity's status
export const updateCalendarActivityStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Validate status
    const validStatuses = ['to_do', 'scheduled', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ 
        success: false, 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
      return;
    }

    const calendarActivity = await CalendarActivity.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!calendarActivity) {
      res.status(404).json({ success: false, message: 'Calendar activity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: calendarActivity
    });
  } catch (error) {
    console.error('Update calendar activity status error:', error);
    res.status(500).json({ success: false, message: 'Error updating calendar activity status' });
  }
};

// Controller function to get a specific media file (transcript or recording)
export const getRecordedActivityMediaFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, mediaType } = req.params; // id is CalendarActivity._id
    const user = req.user;

    if (!user || !user.organization) {
      res.status(401).json({ success: false, message: 'User not authenticated or not associated with an organization' });
      return;
    }

    const calendarActivity = await CalendarActivity.findOne({ _id: id, organization: user.organization });

    if (!calendarActivity) {
      res.status(404).json({ success: false, message: 'Recorded calendar activity not found' });
      return;
    }

    let fileName: string | undefined;
    let fileTypeForLog: string;

    if (mediaType === 'transcript') {
      fileName = calendarActivity.savedTranscriptPath;
      fileTypeForLog = 'transcript';
    } else if (mediaType === 'recording') {
      fileName = calendarActivity.savedRecordingPath;
      fileTypeForLog = 'recording';
    } else {
      res.status(400).json({ success: false, message: 'Invalid media type specified. Must be "transcript" or "recording".' });
      return;
    }

    if (!fileName) {
      res.status(404).json({ success: false, message: `No ${fileTypeForLog} path found for this activity.` });
      return;
    }

    // Determine content type based on file extension
    const getContentType = (filename: string): string => {
      const ext = filename.toLowerCase().split('.').pop();
      const contentTypeMap: Record<string, string> = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'm4a': 'audio/mp4',
        'txt': 'text/plain',
        'vtt': 'text/vtt',
        'srt': 'application/x-subrip',
        'json': 'application/json'
      };
      return contentTypeMap[ext || ''] || 'application/octet-stream';
    };

    try {
      const expiresIn = 3600; // 1 hour
      const presignedUrl = await generateMeetingMediaPresignedUrl(
        user.organization.toString(),
        id,
        fileName,
        expiresIn
      );

      const contentType = getContentType(fileName);

      res.status(200).json({
        success: true,
        url: presignedUrl,
        expiresIn,
        contentType
      });

    } catch (fileError: any) {
      if (fileError.message.includes('not found')) {
        res.status(404).json({ success: false, message: `The ${fileTypeForLog} file (${fileName}) was not found in storage.` });
      } else {
        console.error(`Error generating URL for ${fileTypeForLog} for activity ${id}:`, fileError);
        res.status(500).json({ success: false, message: `Error generating ${fileTypeForLog} file URL.` });
      }
    }

  } catch (error) {
    console.error('Get recorded activity media file error:', error);
    res.status(500).json({ success: false, message: 'An unknown error occurred while fetching the media file.' });
  }
};

// Upsert transcript text for a calendar activity and trigger processing
export const upsertTranscriptForActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { transcriptionText } = req.body as { transcriptionText?: string };
    const user = req.user;

    if (!user || !user.organization) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!transcriptionText || typeof transcriptionText !== 'string' || transcriptionText.trim().length === 0) {
      res.status(400).json({ success: false, message: 'transcriptionText is required' });
      return;
    }

    const activity = await CalendarActivity.findOne({ _id: id, organization: user.organization });
    if (!activity) {
      res.status(404).json({ success: false, message: 'Calendar activity not found' });
      return;
    }

    // Normalize and persist transcript string on document
    const normalized = normalizeTranscript(transcriptionText);
    const normalizedString = JSON.stringify(normalized);
    activity.transcriptionText = normalizedString;

    // Save transcript to storage for parity with media ingestion
    try {
      const buffer = Buffer.from(normalizedString, 'utf-8');
      const saved = await saveMeetingMedia(
        buffer,
        'transcript_manual.txt',
        user.organization.toString(),
        String(activity._id)
      );
      activity.savedTranscriptPath = saved.filePath;
      activity.transcriptUrl = saved.url;
    } catch (storageErr) {
      // Log but do not fail the request solely due to storage issues
      console.error('Failed to save manual transcript to storage:', storageErr);
    }

    // Optionally mark media status
    if (!activity.mediaStatus || activity.mediaStatus === 'processing' || activity.mediaStatus === 'scheduled') {
      activity.mediaStatus = 'completed';
    }

    await activity.save();

    // Fire-and-forget processing to keep response fast
    (async () => {
      try {
    await IntelligenceProcessor.processActivityDirect(activity);

      const opportunityId = await ActionPipelineTriggerService.getOpportunityIdForActivity(
        activity._id as mongoose.Types.ObjectId,
        'CalendarActivity'
      );

      if (opportunityId) {
        await ActionPipelineTriggerService.triggerAfterActivityProcessing(
          activity._id as mongoose.Types.ObjectId,
          'CalendarActivity',
          opportunityId
        );
        console.log(`Successfully triggered action pipeline for manual transcript activity ${activity._id}`);
      } else {
        console.warn(`Could not find opportunity for manual transcript activity ${activity._id}, skipping action pipeline trigger`);
      }
    } catch (error) {
        console.error(`Error processing manual transcript activity ${activity._id}:`, error);
    }
    })();

    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('Upsert transcript error:', error);
    res.status(500).json({ success: false, message: 'Error saving transcript' });
  }
};

// Delete a calendar activity
export const deleteCalendarActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const calendarActivity = await CalendarActivity.findByIdAndDelete(id);

    if (!calendarActivity) {
      res.status(404).json({ success: false, message: 'Calendar activity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Delete calendar activity error:', error);
    res.status(500).json({ success: false, message: 'Error deleting calendar activity' });
  }
};