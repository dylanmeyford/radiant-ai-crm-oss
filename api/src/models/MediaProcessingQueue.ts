import mongoose, { Document, Schema } from 'mongoose';

export interface IMediaProcessingQueueItem extends Document {
  _id: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  calendarActivity: mongoose.Types.ObjectId;
  
  // Media details
  nylasNotetakerId: string;
  grantId: string;
  recordingUrl?: string;
  transcriptUrl?: string;
  actionItemsUrl?: string;
  summaryUrl?: string;
  thumbnailUrl?: string;
  recordingDuration?: number;
  
  // Processing status
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number; // Lower numbers = higher priority
  addedAt: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  processingNode?: string; // To track which server instance is processing
  
  // File size tracking for memory management
  estimatedRecordingSize?: number;
  estimatedTranscriptSize?: number;
  
  createdAt: Date;
  updatedAt: Date;
}

const MediaProcessingQueueSchema = new Schema<IMediaProcessingQueueItem>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    calendarActivity: {
      type: Schema.Types.ObjectId,
      ref: 'CalendarActivity',
      required: true,
    },
    nylasNotetakerId: {
      type: String,
      required: true,
    },
    grantId: {
      type: String,
      required: true,
    },
    recordingUrl: {
      type: String,
    },
    transcriptUrl: {
      type: String,
    },
    actionItemsUrl: {
      type: String,
    },
    summaryUrl: {
      type: String,
    },
    thumbnailUrl: {
      type: String,
    },
    recordingDuration: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    priority: {
      type: Number,
      required: true,
      index: 1,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    processingStartedAt: {
      type: Date,
    },
    processingCompletedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
    processingNode: {
      type: String,
    },
    estimatedRecordingSize: {
      type: Number,
    },
    estimatedTranscriptSize: {
      type: Number,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
MediaProcessingQueueSchema.index({ status: 1, priority: 1 });
MediaProcessingQueueSchema.index({ organization: 1, status: 1 });
MediaProcessingQueueSchema.index({ processingStartedAt: 1, status: 1 }); // For stuck processing detection

// Unique constraint to prevent duplicate queue entries for the same notetaker
MediaProcessingQueueSchema.index({ nylasNotetakerId: 1 }, { unique: true });

const MediaProcessingQueue = mongoose.model<IMediaProcessingQueueItem>('MediaProcessingQueue', MediaProcessingQueueSchema);
export default MediaProcessingQueue;
