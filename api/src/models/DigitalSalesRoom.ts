import mongoose, { Document as DocumentInterface, Schema } from 'mongoose';

export interface IVersion extends DocumentInterface {
  versionNumber: number;
  timestamp: Date;
  uploadedBy: mongoose.Types.ObjectId;
  fileSize?: number;
  filePath?: string;
  url?: string;
  metadata?: Record<string, any>;
}

export interface IDocument extends DocumentInterface {
  name: string;
  description?: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  s3Key?: string; // S3 key for cloud storage (when using S3)
  originalFilename?: string; // Original filename as uploaded
  mimeType?: string; // MIME type of the file
  url?: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
  versions?: mongoose.Types.ObjectId[];
  currentVersion?: mongoose.Types.ObjectId;
  metadata?: Record<string, any>;
}

export interface IDocumentAccess extends DocumentInterface {
  document: mongoose.Types.ObjectId;
  salesRoom: mongoose.Types.ObjectId;
  visitorEmail: string;
  accessedAt: Date;
  durationMs?: number;
  pageViews?: Array<{
    page: number;
    durationMs: number;
  }>;
  metadata?: Record<string, any>;
}

export interface ILinkAccess extends DocumentInterface {
  link: mongoose.Types.ObjectId;
  salesRoom: mongoose.Types.ObjectId;
  visitorEmail: string;
  accessedAt: Date;
  durationMs?: number;
  referrer?: string;
  metadata?: Record<string, any>;
}

export interface IVisitor extends DocumentInterface {
  email: string;
  lastVisitedAt: Date;
  totalVisits: number;
  verifiedAt?: Date;
  metadata?: Record<string, any>;
}

export interface ILink extends DocumentInterface {
  name: string;
  description?: string;
  url: string;
  type: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
  metadata?: Record<string, any>;
}

export interface IDigitalSalesRoom extends DocumentInterface {
  name: string;
  description?: string;
  opportunity: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  uniqueId: string;
  accessCode?: string;
  documents: mongoose.Types.ObjectId[];
  links: mongoose.Types.ObjectId[];
  visitors: mongoose.Types.ObjectId[];
  pathway?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

// Version Schema
const VersionSchema = new Schema<IVersion>(
  {
    versionNumber: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fileSize: {
      type: Number,
    },
    filePath: {
      type: String,
    },
    url: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Document Schema
const DocumentSchema = new Schema<IDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    fileType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    s3Key: {
      type: String,
      trim: true,
      index: true, // Index for efficient S3 operations
    },
    originalFilename: {
      type: String,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    versions: [{
      type: Schema.Types.ObjectId,
      ref: 'Version',
    }],
    currentVersion: {
      type: Schema.Types.ObjectId,
      ref: 'Version',
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { 
    timestamps: { 
      createdAt: 'uploadedAt',
      updatedAt: false
    } 
  }
);

// Document Access Schema
const DocumentAccessSchema = new Schema<IDocumentAccess>(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    salesRoom: {
      type: Schema.Types.ObjectId,
      ref: 'DigitalSalesRoom',
      required: true,
    },
    visitorEmail: {
      type: String,
      required: true,
    },
    accessedAt: {
      type: Date,
      default: Date.now,
    },
    durationMs: {
      type: Number,
    },
    pageViews: [{
      page: Number,
      durationMs: Number,
    }],
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Link Access Schema
const LinkAccessSchema = new Schema<ILinkAccess>(
  {
    link: {
      type: Schema.Types.ObjectId,
      ref: 'Link',
      required: true,
    },
    salesRoom: {
      type: Schema.Types.ObjectId,
      ref: 'DigitalSalesRoom',
      required: true,
    },
    visitorEmail: {
      type: String,
      required: true,
    },
    accessedAt: {
      type: Date,
      default: Date.now,
    },
    durationMs: {
      type: Number,
    },
    referrer: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Visitor Schema
const VisitorSchema = new Schema<IVisitor>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    lastVisitedAt: {
      type: Date,
      default: Date.now,
    },
    totalVisits: {
      type: Number,
      default: 1,
    },
    verifiedAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Link Schema
const LinkSchema = new Schema<ILink>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      default: 'link',
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { 
    timestamps: { 
      createdAt: 'uploadedAt',
      updatedAt: false
    } 
  }
);

// Digital Sales Room Schema
const DigitalSalesRoomSchema = new Schema<IDigitalSalesRoom>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    opportunity: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    uniqueId: {
      type: String,
      required: true,
    },
    accessCode: {
      type: String,
    },
    documents: [{
      type: Schema.Types.ObjectId,
      ref: 'Document',
    }],
    links: [{
      type: Schema.Types.ObjectId,
      ref: 'Link',
    }],
    visitors: [{
      type: Schema.Types.ObjectId,
      ref: 'Visitor',
    }],
    pathway: {
      type: Schema.Types.ObjectId,
      ref: 'Pathway',
    },
    expiresAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
DocumentSchema.index({ uploadedBy: 1 });
LinkSchema.index({ uploadedBy: 1 });
DocumentAccessSchema.index({ document: 1, visitorEmail: 1 });
DocumentAccessSchema.index({ salesRoom: 1, visitorEmail: 1 });
DocumentAccessSchema.index({ salesRoom: 1, document: 1 });
LinkAccessSchema.index({ link: 1, visitorEmail: 1 });
LinkAccessSchema.index({ salesRoom: 1, visitorEmail: 1 });
LinkAccessSchema.index({ salesRoom: 1, link: 1 });
VisitorSchema.index({ email: 1 });
DigitalSalesRoomSchema.index({ opportunity: 1, organization: 1 });
DigitalSalesRoomSchema.index({ uniqueId: 1 }, { unique: true });

// Pre-save hook to generate a unique ID if not provided
DigitalSalesRoomSchema.pre('save', function(next) {
  if (!this.uniqueId) {
    this.uniqueId = generateUniqueId();
  }
  next();
});

// Function to generate a unique ID
function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

const Document = mongoose.model<IDocument>('Document', DocumentSchema);
const DocumentAccess = mongoose.model<IDocumentAccess>('DocumentAccess', DocumentAccessSchema);
const LinkAccess = mongoose.model<ILinkAccess>('LinkAccess', LinkAccessSchema);
const Visitor = mongoose.model<IVisitor>('Visitor', VisitorSchema);
const Link = mongoose.model<ILink>('Link', LinkSchema);
const DigitalSalesRoom = mongoose.model<IDigitalSalesRoom>('DigitalSalesRoom', DigitalSalesRoomSchema);
const Version = mongoose.model<IVersion>('Version', VersionSchema);

export { Document, DocumentAccess, LinkAccess, Visitor, Link, DigitalSalesRoom, Version }; 