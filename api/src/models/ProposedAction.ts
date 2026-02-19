import { Schema, model, Document } from 'mongoose';

// This sub-schema tracks which activities an action is in response to.
const SourceActivitySchema = new Schema({
  activityId: { type: Schema.Types.ObjectId, required: true },
  activityModel: {
    type: String,
    required: true,
    enum: ['EmailActivity', 'CalendarActivity', 'Activity']
  }
}, { _id: false });

// This sub-schema tracks which activities were created as a result of executing this action.
const ResultingActivitySchema = new Schema({
  activityId: { type: Schema.Types.ObjectId, required: true },
  activityModel: {
    type: String,
    required: true,
    enum: ['EmailActivity', 'CalendarActivity', 'Activity']
  }
}, { _id: false });

export interface IProposedAction extends Document {
  opportunity: Schema.Types.ObjectId;
  organization: Schema.Types.ObjectId;
  sourceActivities: {
    activityId: Schema.Types.ObjectId;
    activityModel: 'EmailActivity' | 'CalendarActivity' | 'Activity';
  }[];
  resultingActivities?: {
    activityId: Schema.Types.ObjectId;
    activityModel: 'EmailActivity' | 'CalendarActivity' | 'Activity';
  }[];
  type: 'EMAIL' | 'TASK' | 'MEETING' | 'CALL' | 'LINKEDIN MESSAGE' | 'NO_ACTION' | 'LOOKUP' | 'UPDATE_PIPELINE_STAGE' | 'ADD_CONTACT';
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'PROCESSING UPDATES' | 'CANCELLED' | 'PROCESSED_BY_AI';
  details: { [key: string]: any; };
  reasoning: string;
  createdBy: {
      type: 'AI_AGENT' | 'USER';
      id?: Schema.Types.ObjectId;
  };
  lastEditedBy?: {
    type: 'AI_AGENT' | 'USER';
    id?: Schema.Types.ObjectId;
    at: Date;
  };
  approvedBy?: Schema.Types.ObjectId;
  executedAt?: Date;
  scheduledFor?: Date;
}

const ProposedActionSchema = new Schema({
  opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  sourceActivities: [SourceActivitySchema],
  resultingActivities: [ResultingActivitySchema], // Activities created as a result of executing this action
  type: {
    type: String,
    required: true,
    enum: ['EMAIL', 'TASK', 'MEETING', 'CALL', 'LINKEDIN MESSAGE', 'NO_ACTION', 'LOOKUP', 'UPDATE_PIPELINE_STAGE', 'ADD_CONTACT'],
  },
  status: {
    type: String,
    required: true,
    enum: ['PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'PROCESSING UPDATES', 'CANCELLED', 'PROCESSED_BY_AI'],
    default: 'PROPOSED',
  },
  details: { type: Schema.Types.Mixed }, // Stores action-specific data (e.g., for email: { to, subject, body, replyToMessageId? })
  reasoning: { type: String }, // Stores the AI's reasoning for the suggestion
  createdBy: {
    type: { type: String, enum: ['AI_AGENT', 'USER'], required: true },
    id: { type: Schema.Types.ObjectId }
  },
  lastEditedBy: {
    type: {
      type: String,
      enum: ['AI_AGENT', 'USER']
    },
    id: { type: Schema.Types.ObjectId },
    at: { type: Date }
  },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  executedAt: { type: Date },
  scheduledFor: { type: Date } // For scheduling future actions
}, { timestamps: true });

export const ProposedAction = model<IProposedAction>('ProposedAction', ProposedActionSchema); 