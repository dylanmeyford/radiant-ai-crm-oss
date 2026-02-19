import mongoose, { Schema, Document, Types } from 'mongoose';

// Define interfaces
export interface IPathwayStep extends Document {
  name: string;
  description?: string;
  order: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface IPathway extends Document {
  name: string;
  description?: string;
  steps: Types.ObjectId[];
  organization: Types.ObjectId;
  createdBy: Types.ObjectId;
  isDefault: boolean;
  createdAt: Date;
}

export interface IVisitorProgress extends Document {
  visitor: Types.ObjectId;
  salesRoom: Types.ObjectId;
  pathwayStep: Types.ObjectId;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  createdAt: Date;
  updatedAt: Date;
}

// New interface for sales room level progress
export interface ISalesRoomProgress extends Document {
  salesRoom: Types.ObjectId;
  pathwayStep: Types.ObjectId;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
}

// Define schemas
const PathwayStepSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  order: { type: Number, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

const PathwaySchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  steps: [{ type: Schema.Types.ObjectId, ref: 'PathwayStep' }],
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const VisitorProgressSchema = new Schema({
  visitor: { type: Schema.Types.ObjectId, ref: 'Visitor', required: true },
  salesRoom: { type: Schema.Types.ObjectId, ref: 'DigitalSalesRoom', required: true },
  pathwayStep: { type: Schema.Types.ObjectId, ref: 'PathwayStep', required: true },
  status: { 
    type: String, 
    enum: ['not_started', 'in_progress', 'completed', 'skipped'],
    default: 'not_started',
    required: true 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// New schema for sales room level progress
const SalesRoomProgressSchema = new Schema({
  salesRoom: { type: Schema.Types.ObjectId, ref: 'DigitalSalesRoom', required: true },
  pathwayStep: { type: Schema.Types.ObjectId, ref: 'PathwayStep', required: true },
  status: { 
    type: String, 
    enum: ['not_started', 'in_progress', 'completed', 'skipped'],
    default: 'not_started',
    required: true 
  },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create indexes
PathwaySchema.index({ organization: 1, isDefault: 1 });
VisitorProgressSchema.index({ visitor: 1, salesRoom: 1, pathwayStep: 1 }, { unique: true });
SalesRoomProgressSchema.index({ salesRoom: 1, pathwayStep: 1 }, { unique: true });

// Create models
export const PathwayStep = mongoose.model<IPathwayStep>('PathwayStep', PathwayStepSchema);
export const Pathway = mongoose.model<IPathway>('Pathway', PathwaySchema);
export const VisitorProgress = mongoose.model<IVisitorProgress>('VisitorProgress', VisitorProgressSchema);
export const SalesRoomProgress = mongoose.model<ISalesRoomProgress>('SalesRoomProgress', SalesRoomProgressSchema); 