import { Request, Response } from 'express';
import { z } from 'zod';
import { createProspectAndOpportunity } from '../services/ExternalOpportunityService';
import { ApiKeyAuthedRequest } from '../middleware/apiKeyAuth';
import { normalizeTranscript } from '../services/transcriptNormalizationService';
import CalendarActivity from '../models/CalendarActivity';
import { saveMeetingMedia } from '../services/fileStorageService';
import { IntelligenceProcessor } from '../services/AI/personIntelligence/intelligenceProcessor';
import { ActionPipelineTriggerService } from '../services/activityProcessingService/actionPipelineTriggerService';
import mongoose from 'mongoose';

const payloadSchema = z.object({
  prospect: z.object({
    name: z.string().min(1),
    domains: z.array(z.string().min(1)).nonempty(),
  }),
  opportunity: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    amount: z.number().positive(),
    stageId: z.string().optional(),
    stageName: z.string().optional(),
    ownerId: z.string().optional(),
    createdDate: z.string().refine((d) => !Number.isNaN(Date.parse(d))),
  }).refine((v) => v.stageId || v.stageName, { message: 'stageId or stageName required', path: ['stageId'] }),
});

export const createOpportunityWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req as ApiKeyAuthedRequest;
    if (!organizationId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const { prospect, opportunity } = parsed.data;

    const result = await createProspectAndOpportunity({
      organizationId,
      prospect,
      opportunity,
    });

    res.status(201).json({ success: true, prospect: result.prospect, opportunity: result.opportunity });
    return;
  } catch (error: any) {
    const message = error?.message || 'Failed to create opportunity';
    const status =
      message.includes('Unauthorized') ? 401 :
      message.includes('not found') ? 404 :
      message.includes('Invalid') || message.includes('required') ? 400 : 500;
    res.status(status).json({ success: false, message });
    return;
  }
};

// Webhook to ingest a transcript by matching organization, meeting start time and title
const ingestTranscriptSchema = z.object({
  title: z.string().min(1),
  startTime: z.string().refine((d) => !Number.isNaN(Date.parse(d))),
  transcriptionText: z.string().min(1),
  transcriptType: z.enum(['json', 'krisp', 'granola', 'vtt', 'plain']).optional(),
});

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const ingestTranscriptFromWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req as ApiKeyAuthedRequest;
    if (!organizationId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = ingestTranscriptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const { title, startTime, transcriptionText, transcriptType } = parsed.data;
    const start = new Date(startTime);
    const titleRegex = new RegExp(`^${escapeRegExp(title.trim())}$`, 'i');

    // Exact match on startTime and case-insensitive equality on title
    const activity = await CalendarActivity.findOne({
      organization: organizationId,
      startTime: start,
      title: { $regex: titleRegex },
    }).lean(false);

    if (!activity) {
      res.status(404).json({ success: false, message: 'No matching meeting found' });
      return;
    }

    // Normalize transcript and persist to storage
    const normalized = normalizeTranscript(transcriptionText);
    if (transcriptType && normalized.metadata) {
      normalized.metadata.originalFormat = transcriptType;
    }
    const normalizedString = JSON.stringify(normalized);
    activity.transcriptionText = normalizedString;
    try {
      const buffer = Buffer.from(normalizedString, 'utf-8');
      const saved = await saveMeetingMedia(buffer, 'transcript_webhook.txt', String(organizationId), String(activity._id));
      activity.savedTranscriptPath = saved.filePath;
      activity.transcriptUrl = saved.url;
    } catch (err) {
      console.error('Failed to save webhook transcript to storage:', err);
    }

    activity.receivedViaWebhookAt = new Date();
    await activity.save();

    // Fire-and-forget processing to keep webhook response fast
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
        console.log(`Successfully triggered action pipeline for webhook transcript activity ${activity._id}`);
      } else {
        console.warn(`Could not find opportunity for webhook transcript activity ${activity._id}, skipping action pipeline trigger`);
      }
    } catch (error) {
        console.error(`Error processing webhook transcript activity ${activity._id}:`, error);
    }
    })();

    res.status(200).json({ success: true, activityId: activity._id });
    return;
  } catch (error: any) {
    console.error('ingestTranscriptFromWebhook error:', error);
    res.status(500).json({ success: false, message: 'Failed to ingest transcript' });
    return;
  }
};


