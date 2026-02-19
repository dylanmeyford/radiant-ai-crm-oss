export interface Document {
  _id: string;
  name: string;
  description?: string;
  fileType: string;
  fileSize: number;
  url?: string;
  uploadedBy?: string; // Optional for public data room context
  uploadedAt: Date | string; // Support both Date and string for flexibility
  metadata?: Record<string, any>;
  type?: 'file' | 'link';
}

// Link interface for public data room context
export interface Link {
  _id: string;
  name: string;
  description?: string;
  url: string;
  type: 'link';
  uploadedAt: string;
}

// SalesRoom interface for public data room context
export interface SalesRoom {
  id: string;
  name: string;
  description?: string;
  documents: Document[];
  links: Link[];
}

export interface DocumentAccess {
  _id: string;
  document: string;
  visitorEmail: string;
  accessedAt: Date;
  durationMs?: number;
  pageViews?: Array<{
    page: number;
    durationMs: number;
  }>;
  metadata?: Record<string, any>;
}

export interface Visitor {
  _id: string;
  email: string;
  lastVisitedAt: Date;
  totalVisits: number;
  verifiedAt?: Date;
  metadata?: Record<string, any>;
}

export interface DigitalSalesRoom {
  _id: string;
  name: string;
  description?: string;
  opportunity: string;
  createdBy: string;
  organization: string;
  uniqueId: string;
  accessCode?: string;
  documents: string[] | Document[];
  links?: string[] | Document[];
  visitors: string[] | Visitor[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface SalesRoomAnalytics {
  totalVisitors: number;
  totalDocumentViews: number;
  totalLinkClicks: number;
  documentAnalytics: DocumentAnalytics[];
  linkAnalytics: LinkAnalytics[];
  visitorAnalytics: VisitorAnalytics[];
}

export interface DocumentAnalytics {
  documentId: string;
  documentName: string;
  totalViews: number;
  totalUniqueVisitors: number;
  averageDurationMs: number;
  pageAnalytics: Record<number, { views: number; totalDurationMs: number }>;
  visitorDetails?: Array<{
    email: string;
    viewCount: number;
    totalDurationMs: number;
  }>;
}

export interface LinkAnalytics {
  linkId: string;
  linkName: string;
  linkUrl: string;
  totalClicks: number;
  totalUniqueVisitors: number;
  averageDurationMs: number;
  referrers: Record<string, number>;
}

export interface VisitorAnalytics {
  visitorEmail: string;
  totalVisits: number;
  lastVisitedAt: string;
  documentsViewed: number;
  linksClicked: number;
  totalTimeSpentMs: number;
  documentEngagement: {
    documentId: string;
    documentName: string;
    accessedAt: string;
    durationMs: number;
    pageEngagement?: { page: number; durationMs: number }[];
  }[];
  linkEngagement?: {
    linkId: string;
    linkName: string;
    linkUrl: string;
    accessedAt: string;
    durationMs: number;
    referrer?: string;
  }[];
}

export interface VerificationRequest {
  email: string;
}

export interface VerificationResponse {
  success: boolean;
  message: string;
  code?: string; // Only included in development
}

export interface VerificationSubmit {
  email: string;
  code: string;
}

export interface TrackingData {
  durationMs: number;
  pageViews?: { page: number; durationMs: number }[];
  referrer?: string;
} 