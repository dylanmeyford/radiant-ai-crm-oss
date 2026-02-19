import mongoose, { Document, Schema } from 'mongoose';

export interface IActivityProcessingQueueItem extends Document {
  _id: mongoose.Types.ObjectId;
  prospect: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  
  // For individual activity processing
  activity?: mongoose.Types.ObjectId;
  activityType?: 'Activity' | 'EmailActivity' | 'CalendarActivity';
  activityDate?: Date;
  
  // For opportunity reprocessing
  opportunity?: mongoose.Types.ObjectId;
  
  // Common fields
  queueItemType: 'activity' | 'opportunity_reprocessing';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number; // Lower numbers = higher priority, used for chronological ordering
  addedAt: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  processingNode?: string; // To track which server instance is processing
  
  // For opportunity reprocessing debouncing
  scheduledFor?: Date; // When this item should be processed (for debouncing)
  debounceReason?: string; // Why this reprocessing was triggered
  
  createdAt: Date;
  updatedAt: Date;
}

const ActivityProcessingQueueSchema = new Schema<IActivityProcessingQueueItem>(
  {
    prospect: {
      type: Schema.Types.ObjectId,
      ref: 'Prospect',
      required: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    
    // For individual activity processing
    activity: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    activityType: {
      type: String,
      enum: ['Activity', 'EmailActivity', 'CalendarActivity'],
      required: false,
    },
    activityDate: {
      type: Date,
      required: false,
    },
    
    // For opportunity reprocessing
    opportunity: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: false,
    },
    
    // Common fields
    queueItemType: {
      type: String,
      enum: ['activity', 'opportunity_reprocessing'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    priority: {
      type: Number,
      required: true,
      index: 1, // Index for efficient sorting
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
    
    // For opportunity reprocessing debouncing
    scheduledFor: {
      type: Date,
    },
    debounceReason: {
      type: String,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
ActivityProcessingQueueSchema.index({ prospect: 1, status: 1, priority: 1 });
ActivityProcessingQueueSchema.index({ organization: 1, status: 1 });
ActivityProcessingQueueSchema.index({ status: 1, priority: 1 });
ActivityProcessingQueueSchema.index({ processingStartedAt: 1, status: 1 }); // For stuck processing detection
ActivityProcessingQueueSchema.index({ queueItemType: 1, status: 1, scheduledFor: 1 }); // For opportunity debouncing

// Unique constraint to prevent duplicate queue entries for the same activity
ActivityProcessingQueueSchema.index({ activity: 1, activityType: 1 }, { 
  unique: true, 
  partialFilterExpression: { queueItemType: 'activity' } 
});

// Unique constraint to prevent duplicate opportunity reprocessing entries
ActivityProcessingQueueSchema.index({ opportunity: 1, queueItemType: 1 }, { 
  unique: true, 
  partialFilterExpression: { queueItemType: 'opportunity_reprocessing' } 
});

// Validation to ensure required fields are present based on queue item type
ActivityProcessingQueueSchema.pre('save', function() {
  if (this.queueItemType === 'activity') {
    if (!this.activity || !this.activityType || !this.activityDate) {
      throw new Error('Activity processing items must have activity, activityType, and activityDate');
    }
  } else if (this.queueItemType === 'opportunity_reprocessing') {
    if (!this.opportunity) {
      throw new Error('Opportunity reprocessing items must have opportunity');
    }
  }
});

const ActivityProcessingQueue = mongoose.model<IActivityProcessingQueueItem>('ActivityProcessingQueue', ActivityProcessingQueueSchema);
export default ActivityProcessingQueue; 