import mongoose, { Document, Schema } from 'mongoose';
import {
  IOpportunityIntelligence,
  personRoleEnum,
  ResponsivenessInfo,
} from '../types/contactIntelligence.types';
import Prospect from './Prospect';
import { fetchEmailsAndEventsForContact } from '../services/NylasService';
import { executeContactResearch } from '../services/contactResearchService';
import { validateDomains } from '../utils/domain';

export type EmailFetchStatus = 'IDLE' | 'PENDING' | 'SUCCESS' | 'FAILED';

export interface IContactEmail {
  _id?: mongoose.Types.ObjectId;
  address: string;
  category: 'work' | 'personal' | 'other';
  isPrimary: boolean;
}

export interface IContactMethods {
  getOpportunityIntelligence(
    opportunityId: mongoose.Types.ObjectId
  ): IOpportunityIntelligence | undefined;
  getOrCreateOpportunityIntelligence(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<IOpportunityIntelligence>;
  updateOpportunityScore(
    opportunityId: mongoose.Types.ObjectId,
    newScore: number,
    sourceActivityId: mongoose.Types.ObjectId,
    reasoning?: string,
    activityDate?: Date
  ): Promise<void>;
  addRoleAssignment(
    opportunityId: mongoose.Types.ObjectId,
    role: (typeof personRoleEnum)[number],
    assignedAt: Date
  ): Promise<void>;
  addBehavioralIndicator(
    opportunityId: mongoose.Types.ObjectId,
    indicator: string,
    sourceActivityId: mongoose.Types.ObjectId,
    confidence?: 'High' | 'Medium' | 'Low',
    relevance?: 'High' | 'Medium' | 'Low',
    activityDate?: Date
  ): Promise<void>;
  clearScoreHistory(opportunityId: mongoose.Types.ObjectId): Promise<void>;
  updateCommunicationPatterns(
    opportunityId: mongoose.Types.ObjectId,
    patterns: Omit<IOpportunityIntelligence['communicationPatterns'][0], 'analyzedAt'>
  ): Promise<void>;
  getBehavioralIndicatorsByCategory(
    opportunityId: mongoose.Types.ObjectId,
    category: string
  ): string[];
  // Email helper methods
  getPrimaryEmail(): string | null;
  getPrimaryEmailObject(): IContactEmail | null;
  toEmailRecipient(emailAddress?: string): { name: string; email: string };
}

export interface IContactResearch {
  personalSummary?: string;
  roleAtCompany?: string;
  linkedInProfile?: string;
  backgroundInfo?: string;
  connectionOpportunities?: string[];
  contactScore?: number;
  researchedAt?: Date;
  debug?: {
    noInformationFound: boolean;
    searchQueries: string[];
    informationSources: string[];
  };
}

export interface IContact extends Document, IContactMethods {
  firstName?: string;
  lastName?: string;
  emails: IContactEmail[];
  origin?: string;
  domainExcluded?: boolean;
  phone?: string;
  title?: string;
  department?: string;
  role?: string;
  isPrimary: boolean;
  prospect: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  activities: mongoose.Types.ObjectId[];
  emailActivities: mongoose.Types.ObjectId[];
  opportunities: mongoose.Types.ObjectId[];
  calendarActivities: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  opportunityIntelligence?: IOpportunityIntelligence[];
  emailFetchStatus: EmailFetchStatus;
  contactResearch?: IContactResearch;
}

const ResponsivenessInfoSchema = new Schema<ResponsivenessInfo>(
  {
    status: {
      type: String,
      enum: ['Ghosting', 'Delayed', 'Engaged', 'OOO', 'Handed Off', 'Disengaged', 'Uninvolved'],
      required: true,
    },
    summary: { type: String, required: true },
    isAwaitingResponse: { type: Boolean, required: true },
    activeRespondingContact: { type: String, required: false },
  },
  { _id: false }
);

// Email schema for multiple email addresses per contact
const EmailSchema = new Schema({
  address: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  category: {
    type: String,
    enum: ['work', 'personal', 'other'],
    default: 'work',
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
}, { _id: true });

// Contact research schema for AI-generated intelligence
const ContactResearchSchema = new Schema({
  personalSummary: {
    type: String,
    trim: true,
  },
  roleAtCompany: {
    type: String,
    trim: true,
  },
  linkedInProfile: {
    type: String,
    trim: true,
  },
  backgroundInfo: {
    type: String,
    trim: true,
  },
  connectionOpportunities: [{
    type: String,
    trim: true,
  }],
  contactScore: {
    type: Number,
    min: 1,
    max: 10,
  },
  researchedAt: {
    type: Date,
    default: Date.now,
  },
  debug: {
    noInformationFound: {
      type: Boolean,
      default: false,
    },
    searchQueries: [{
      type: String,
    }],
    informationSources: [{
      type: String,
    }],
  },
}, { _id: false });

const OpportunityIntelligenceSchema = new Schema<IOpportunityIntelligence>(
  {
    opportunity: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
    },
    engagementScore: {
      type: Number,
      default: 0,
      min: -50,
      max: 50,
    },
    scoreHistory: [
      {
        score: Number,
        date: Date,
        sourceActivity: {
          type: Schema.Types.ObjectId,
          ref: 'Activity',
        },
        reasoning: String,
      },
    ],
    behavioralIndicators: [
      {
        indicator: String,
        date: Date,
        sourceActivity: {
          type: Schema.Types.ObjectId,
          ref: 'Activity',
        },
        confidence: {
          type: String,
          enum: ['High', 'Medium', 'Low'],
        },
        relevance: {
          type: String,
          enum: ['High', 'Medium', 'Low'],
          required: true,
        },
      },
    ],
    communicationPatterns: [{
      responseSpeed: Number,
      initiationRatio: Number,
      messageDepth: String,
      tone: String,
      analyzedAt: Date,
      dsrTotalViews: Number,
      dsrTotalDuration: Number,
      dsrTotalClicks: Number,
      dsrLastEngagement: Date,
    }],
    roleAssignments: [
      {
        role: {
          type: String,
          enum: personRoleEnum,
        },
        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    relationshipStory: {
      type: String,
    },
    responsiveness: [
      {
        analyzedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ['Ghosting', 'Delayed', 'Engaged', 'OOO', 'Handed Off', 'Disengaged', 'Uninvolved'],
          required: true,
        },
        summary: { type: String, required: true },
        isAwaitingResponse: { type: Boolean, required: true },
        activeRespondingContact: { type: String, required: false },
      },
    ],
    sentDocuments: [
      {
        documentId: {
          type: Schema.Types.ObjectId,
          ref: 'SalesPlaybook',
          required: true,
        },
        documentType: {
          type: String,
          required: true,
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { _id: false }
);

const ContactSchema = new Schema<IContact>(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    emails: [EmailSchema],
    phone: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      trim: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
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
    activities: [{
      type: Schema.Types.ObjectId,
      ref: 'Activity',
    }],
    emailActivities: [{
      type: Schema.Types.ObjectId,
      ref: 'EmailActivity',
    }],
    calendarActivities: [{
      type: Schema.Types.ObjectId,
      ref: 'CalendarActivity',
    }],
    opportunities: [{
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
    }],
    opportunityIntelligence: [OpportunityIntelligenceSchema],
    emailFetchStatus: {
      type: String,
      enum: ['IDLE', 'PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
    },
    contactResearch: ContactResearchSchema,
    origin: {
      type: String,
      trim: true,
    },
    domainExcluded: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Method implementations
ContactSchema.methods.getOpportunityIntelligence = function (
  opportunityId: mongoose.Types.ObjectId
): IOpportunityIntelligence | undefined {
  return this.opportunityIntelligence?.find(
    (intel: IOpportunityIntelligence) => intel.opportunity.toString() === opportunityId.toString()
  );
};

ContactSchema.methods.getOrCreateOpportunityIntelligence = async function (
  this: IContact,
  opportunityId: mongoose.Types.ObjectId,
): Promise<IOpportunityIntelligence> {
  let intel = this.getOpportunityIntelligence(opportunityId);
  if (intel) {
    return intel;
  }

  if (!this.opportunityIntelligence) {
    this.opportunityIntelligence = [];
  }

  const newIntel: IOpportunityIntelligence = {
    opportunity: opportunityId,
    engagementScore: 0,
    scoreHistory: [],
    behavioralIndicators: [],
    communicationPatterns: [],
    roleAssignments: [],
    relationshipStory: '',
    responsiveness: [],
    sentDocuments: [],
  };

  this.opportunityIntelligence.push(newIntel);
  await this.save();

  // Return the newly created sub-document.
  // It's safer to re-fetch it to ensure we have the hydrated Mongoose document.
  intel = this.getOpportunityIntelligence(opportunityId);
  if (!intel) {
    // This should theoretically never happen after saving.
    throw new Error('Failed to create and retrieve opportunity intelligence.');
  }
  return intel;
}

ContactSchema.methods.updateOpportunityScore = async function (
  this: IContact,
  opportunityId: mongoose.Types.ObjectId,
  newScore: number,
  sourceActivityId: mongoose.Types.ObjectId,
  reasoning?: string,
  activityDate?: Date
) {
  const intel = await this.getOrCreateOpportunityIntelligence(opportunityId);
  
  const dateToUse = activityDate || new Date();

  intel.engagementScore = newScore;
  intel.scoreHistory.push({
    score: newScore,
    date: dateToUse,
    sourceActivity: sourceActivityId,
    reasoning: reasoning,
  });

  await this.save();
};

ContactSchema.methods.addRoleAssignment = async function (
  this: IContact,
  opportunityId: mongoose.Types.ObjectId,
  role: (typeof personRoleEnum)[number],
  assignedAt: Date
) {
  const intel = await this.getOrCreateOpportunityIntelligence(opportunityId);

  // Optional: Prevent duplicate role assignments if the role hasn't changed.
  const latestRole = intel.roleAssignments.sort(
    (a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()
  )[0];

  if (latestRole && latestRole.role === role) {
    return; // Role is already the latest one assigned.
  }

  const newRoleAssignment = { role, assignedAt };

  intel.roleAssignments.push(newRoleAssignment);

  await this.save();
};

ContactSchema.methods.addBehavioralIndicator = async function (
  this: IContact,
  opportunityId: mongoose.Types.ObjectId,
  indicator: string,
  sourceActivityId: mongoose.Types.ObjectId,
  confidence?: 'High' | 'Medium' | 'Low',
  relevance?: 'High' | 'Medium' | 'Low',
  activityDate?: Date
) {
  const intel = await this.getOrCreateOpportunityIntelligence(opportunityId);
  const dateToUse = activityDate || new Date();

  const newIndicator = {
    indicator,
    date: dateToUse,
    sourceActivity: sourceActivityId,
    confidence,
    relevance: relevance || 'Medium', // Default to Medium if not provided
  };

  intel.behavioralIndicators.push(newIndicator);

  await this.save();
};

ContactSchema.methods.clearScoreHistory = async function (
  this: IContact,
  opportunityId: mongoose.Types.ObjectId
) {
  const intel = this.getOpportunityIntelligence(opportunityId);
  if (intel) {
    intel.engagementScore = 0;
    intel.scoreHistory = [];
    await this.save();
  }
};

ContactSchema.methods.updateCommunicationPatterns = async function (
  this: IContact,
  opportunityId: mongoose.Types.ObjectId,
  patterns: Omit<IOpportunityIntelligence['communicationPatterns'][0], 'analyzedAt'>
) {
  const intel = await this.getOrCreateOpportunityIntelligence(opportunityId);
  const newPatternEntry = { ...patterns, analyzedAt: new Date() };

  if (!intel.communicationPatterns) {
    intel.communicationPatterns = [];
  }
  intel.communicationPatterns.push(newPatternEntry);

  await this.save();
};

ContactSchema.methods.getBehavioralIndicatorsByCategory = function (
  this: IContact,
  opportunityId: mongoose.Types.ObjectId,
  category: string
): string[] {
  const intel = this.getOpportunityIntelligence(opportunityId);
  if (!intel) {
    return [];
  }
  const categoryTag = `[${category}]`;
  return intel.behavioralIndicators
    .filter(indicator => indicator.indicator.startsWith(categoryTag))
    .map(indicator => indicator.indicator);
};

// Helper method to get primary email address
ContactSchema.methods.getPrimaryEmail = function(): string | null {
  const primaryEmail = this.emails.find((email: IContactEmail) => email.isPrimary);
  return primaryEmail ? primaryEmail.address : (this.emails[0] ? this.emails[0].address : null);
};

// Helper method to get primary email object
ContactSchema.methods.getPrimaryEmailObject = function(): IContactEmail | null {
  const primaryEmail = this.emails.find((email: IContactEmail) => email.isPrimary);
  return primaryEmail || (this.emails[0] ? this.emails[0] : null);
};

// Helper method to format for email sending (Nylas format)
ContactSchema.methods.toEmailRecipient = function(emailAddress?: string): { name: string; email: string } {
  const email = emailAddress || this.getPrimaryEmail();
  if (!email) return { name: '', email: '' };
  
  const name = `${this.firstName || ''} ${this.lastName || ''}`.trim() || 'Unknown';
  return { name, email };
};

// Static method to convert contacts to email recipients
ContactSchema.statics.toEmailRecipients = function(contacts: any[], emailOverrides?: { [contactId: string]: string }): { name: string; email: string }[] {
  return contacts.map((contact: any) => {
    const overrideEmail = emailOverrides?.[contact._id.toString()];
    return contact.toEmailRecipient(overrideEmail);
  }).filter(recipient => recipient.email);
};

// Indexes for faster queries
ContactSchema.index({ prospect: 1, organization: 1 });
ContactSchema.index({ firstName: 1, lastName: 1, organization: 1 });

// Unique index for email addresses in the emails array to ensure system-wide uniqueness
ContactSchema.index({ organization: 1, 'emails.address': 1 }, { unique: true });

// Indexes for opportunity intelligence
ContactSchema.index({ 'opportunityIntelligence.opportunity': 1 });
ContactSchema.index({ 'opportunityIntelligence.engagementScore': 1 });
ContactSchema.index({ 'opportunityIntelligence.roleAssignments': 1 });

// Helper function to extract domain from email address
function extractDomainFromEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
  const match = email.match(emailRegex);
  return match ? match[1].toLowerCase() : null;
}

// Pre-save hook to enforce exactly one primary email
ContactSchema.pre('save', function(next) {
  if (this.emails && this.emails.length > 0) {
    const primaryEmails = this.emails.filter(email => email.isPrimary);
    
    if (primaryEmails.length === 0) {
      // If no email is marked as primary, make the first one primary
      this.emails[0].isPrimary = true;
    } else if (primaryEmails.length > 1) {
      // If multiple emails are marked as primary, only keep the first one as primary
      let foundFirst = false;
      this.emails.forEach(email => {
        if (email.isPrimary && !foundFirst) {
          foundFirst = true;
        } else if (email.isPrimary) {
          email.isPrimary = false;
        }
      });
    }
  }
  next();
});

// Pre-save middleware to track changes for post-save processing
ContactSchema.pre('save', function(next) {
  // Track if this is a new contact
  if (this.isNew) {
    (this as any).__isNewContact = true;
  }
  
  // Track if emails have been modified
  if (this.isModified('emails')) {
    (this as any).__emailsModified = true;
  }
  
  next();
});

// Pre-findOneAndUpdate middleware to detect email changes in updates
ContactSchema.pre('findOneAndUpdate', async function() {
  const startTime = Date.now();
  
  try {
    console.log('[CONTACT-PRE-UPDATE] Starting email change detection for findOneAndUpdate');
    
    const update = this.getUpdate() as any;
    
    // Check if emails are being updated
    if (!update || !update.emails) {
      console.log('[CONTACT-PRE-UPDATE] No emails in update - skipping');
      return;
    }
    
    const filter = this.getFilter();
    
    if (!filter || !filter._id) {
      console.warn('[CONTACT-PRE-UPDATE] No _id in filter - cannot detect changes');
      return;
    }
    
    // Get the current document to compare emails
    const currentDoc = await Contact.findById(filter._id).lean();
    
    if (!currentDoc) {
      console.warn(`[CONTACT-PRE-UPDATE] Document not found for ID ${filter._id} - may be new document`);
      return;
    }
    
    const currentEmails = currentDoc.emails || [];
    const newEmails = Array.isArray(update.emails) ? update.emails : [];
    const contactInfo = `${currentDoc.firstName || ''} ${currentDoc.lastName || ''} (${currentDoc._id})`.trim();
    
    // Check if emails have actually changed
    const emailsChanged = !arraysEqualByProperty(currentEmails, newEmails, 'address');
    
    if (emailsChanged) {
      const addedEmails = newEmails.filter((newEmail: any) => 
        !currentEmails.some((currentEmail: any) => currentEmail.address === newEmail.address)
      );
      const removedEmails = currentEmails.filter((currentEmail: any) => 
        !newEmails.some((newEmail: any) => newEmail.address === currentEmail.address)
      );
      
      console.log(`[CONTACT-PRE-UPDATE] Email changes detected for ${contactInfo}`);
      console.log(`[CONTACT-PRE-UPDATE] Added emails: ${addedEmails.map((e: any) => e.address).join(', ') || 'none'}`);
      console.log(`[CONTACT-PRE-UPDATE] Removed emails: ${removedEmails.map((e: any) => e.address).join(', ') || 'none'}`);
      console.log(`[CONTACT-PRE-UPDATE] Total emails: ${currentEmails.length} → ${newEmails.length}`);
      
      // Store the contact ID and change info for post middleware
      (this as any).__updateEmailsChanged = true;
      (this as any).__updateContactId = currentDoc._id;
      (this as any).__updateEmailChangeMetrics = {
        added: addedEmails,
        removed: removedEmails,
        total: newEmails.length,
        contactName: `${currentDoc.firstName || ''} ${currentDoc.lastName || ''}`.trim() || 'Unknown'
      };
    } else {
      console.log(`[CONTACT-PRE-UPDATE] No email changes detected for ${contactInfo}`);
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[CONTACT-PRE-UPDATE] Completed email change detection in ${processingTime}ms`);
    
  } catch (error: unknown) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    console.error(`[CONTACT-PRE-UPDATE] Error in email change detection after ${processingTime}ms:`);
    console.error(`[CONTACT-PRE-UPDATE] Error message: ${errorMessage}`);
    console.error(`[CONTACT-PRE-UPDATE] Error stack: ${errorStack}`);
    
    // Don't prevent the update operation for middleware errors
    console.warn('[CONTACT-PRE-UPDATE] Continuing with update operation despite middleware error');
  }
});

// Helper function to compare arrays by a specific property
function arraysEqualByProperty(a: any[], b: any[], property: string): boolean {
  if (a.length !== b.length) return false;
  
  const sortedA = [...a].sort((x, y) => (x[property] || '').localeCompare(y[property] || ''));
  const sortedB = [...b].sort((x, y) => (x[property] || '').localeCompare(y[property] || ''));
  
  return sortedA.every((val, index) => val[property] === sortedB[index][property]);
}

// Post-findOneAndUpdate middleware to trigger email fetch on email changes
ContactSchema.post('findOneAndUpdate', async function(doc: IContact | null) {
  // Only trigger if emails changed and we have a document result
  if (!doc || !(this as any).__updateEmailsChanged) {
    return;
  }
  
  const startTime = Date.now();
  const changeMetrics = (this as any).__updateEmailChangeMetrics;
  const contactInfo = `${changeMetrics?.contactName || doc.firstName || ''} ${doc.lastName || ''} (${doc._id})`.trim();
  
  try {
    console.log(`[CONTACT-POST-UPDATE] Starting email fetch trigger for email changes: ${contactInfo}`);
    
    if (changeMetrics) {
      console.log(`[CONTACT-POST-UPDATE] Email change details - Added: ${changeMetrics.added.length}, Removed: ${changeMetrics.removed.length}, Total: ${changeMetrics.total}`);
    }
    
    // Validate contact data before triggering fetch
    if (!doc._id) {
      throw new Error('Invalid contact: missing _id');
    }
    
    if (!doc.emails || doc.emails.length === 0) {
      console.warn(`[CONTACT-POST-UPDATE] Contact ${contactInfo} has no emails after update - email fetch may not be effective`);
    }
    
    if (!doc.organization) {
      console.warn(`[CONTACT-POST-UPDATE] Contact ${contactInfo} has no organization - skipping email fetch`);
      return;
    }
    
    console.log(`[CONTACT-POST-UPDATE] Triggering asynchronous email fetch for ${contactInfo}`);
    
    // Trigger email fetch asynchronously only if not inside a transaction
    const __opts = (this as any).getOptions?.() || (this as any).options || {};
    const __session = __opts.session || null;
    const __skip = !!__opts.skipPostUpdateFetch;
    if (!__session && !__skip) {
      const orgId = (doc as any).organization?._id ? (doc as any).organization._id.toString() : (doc as any).organization?.toString?.();
      fetchEmailsAndEventsForContact(doc._id.toString(), orgId as string).catch((error: Error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[CONTACT-POST-UPDATE] Email fetch failed for ${contactInfo}: ${errorMessage}`);
      });
    } else {
      console.log(`[CONTACT-POST-UPDATE] Skipping email fetch (${__session ? 'transaction' : 'controller override'}) for ${contactInfo}`);
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[CONTACT-POST-UPDATE] Successfully triggered email fetch for ${contactInfo} in ${processingTime}ms`);
    
  } catch (error: unknown) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    console.error(`[CONTACT-POST-UPDATE] Error triggering email fetch for ${contactInfo} after ${processingTime}ms:`);
    console.error(`[CONTACT-POST-UPDATE] Error message: ${errorMessage}`);
    console.error(`[CONTACT-POST-UPDATE] Error stack: ${errorStack}`);
    
    console.warn(`[CONTACT-POST-UPDATE] Email fetch trigger failed for ${contactInfo} - contact updated successfully but fetch not initiated`);
    
  } finally {
    // Clean up flags and metrics
    delete (this as any).__updateEmailsChanged;
    delete (this as any).__updateContactId;
    delete (this as any).__updateEmailChangeMetrics;
  }
});

// Post-save middleware to update prospect domains from contact emails AND fetch emails
ContactSchema.post('save', async function(doc: IContact) {
  const startTime = Date.now();
  const contactInfo = `${doc.firstName || ''} ${doc.lastName || ''} (${doc._id})`.trim();
  
  try {
    console.log(`[CONTACT-POST-SAVE] Starting post-save processing for contact ${contactInfo}`);
    
    // Validate contact data
    if (!doc.emails || !Array.isArray(doc.emails) || doc.emails.length === 0) {
      console.warn(`[CONTACT-POST-SAVE] Contact ${contactInfo} has no emails - skipping all processing`);
      return;
    }
    
    if (!doc.prospect) {
      console.warn(`[CONTACT-POST-SAVE] Contact ${contactInfo} has no prospect - skipping domain extraction`);
    } else {
      // Process domain extraction for prospect
      await processDomainExtraction(doc, contactInfo);
    }
    
    // Check if we should trigger email fetching (new contact or emails modified)
    const shouldFetchEmails = (this as any).__isNewContact || (this as any).__emailsModified;
    
    if (shouldFetchEmails && doc.organization) {
      console.log(`[CONTACT-POST-SAVE] Triggering email fetch for ${contactInfo} - ${(this as any).__isNewContact ? 'new contact' : 'emails modified'}`);
      
      // Update prospect's intelligence processing state and lastContactAddedAt for new contacts
      if ((this as any).__isNewContact && doc.prospect) {
        try {
          const prospect = await Prospect.findById(doc.prospect);
          if (prospect) {
            await prospect.save();
            console.log(`[CONTACT-POST-SAVE] Updated prospect ${prospect.name} (${prospect._id}) intelligence processing state to PENDING`);
          }
        } catch (error) {
          console.error(`[CONTACT-POST-SAVE] Failed to update prospect intelligence processing state for ${contactInfo}:`, error);
        }
      }
      
      // Trigger email fetching asynchronously only if not inside a transaction
      const __session = (this as any).$session ? (this as any).$session() : null;
      if (!__session) {
        const orgId = (doc as any).organization?._id ? (doc as any).organization._id.toString() : (doc as any).organization?.toString?.();
        fetchEmailsAndEventsForContact(doc._id!.toString(), orgId as string).catch((error: Error) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[CONTACT-POST-SAVE] Email fetch failed for ${contactInfo}: ${errorMessage}`);
        });
      } else {
        console.log(`[CONTACT-POST-SAVE] Skipping email fetch during transaction for ${contactInfo}; controller will trigger post-commit`);
      }
      
      // Trigger contact research for new contacts
      if ((this as any).__isNewContact) {
        console.log(`[CONTACT-POST-SAVE] Triggering contact research for new contact ${contactInfo}`);
        executeContactResearch(doc._id!.toString()).catch((error: Error) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[CONTACT-POST-SAVE] Contact research failed for ${contactInfo}: ${errorMessage}`);
        });
      }
    } else {
      console.log(`[CONTACT-POST-SAVE] Skipping email fetch for ${contactInfo} - no triggering conditions met`);
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[CONTACT-POST-SAVE] Completed post-save processing for ${contactInfo} in ${processingTime}ms`);
    
  } catch (error: unknown) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    console.error(`[CONTACT-POST-SAVE] Error in post-save processing for ${contactInfo} after ${processingTime}ms:`);
    console.error(`[CONTACT-POST-SAVE] Error message: ${errorMessage}`);
    console.error(`[CONTACT-POST-SAVE] Error stack: ${errorStack}`);
    
    // Don't throw the error - post-save middleware errors shouldn't affect the saved contact
    console.warn(`[CONTACT-POST-SAVE] Post-save processing failed for ${contactInfo} - contact saved successfully but additional processing incomplete`);
  } finally {
    // Clean up tracking flags
    delete (this as any).__isNewContact;
    delete (this as any).__emailsModified;
  }
});

// Helper function to process domain extraction (separated for clarity)
async function processDomainExtraction(doc: IContact, contactInfo: string): Promise<void> {
  try {
    // Skip domain extraction for contacts marked as external/blocked domains
    if ((doc as any).domainExcluded || (doc as any).origin === 'external_cc') {
      console.log(`[CONTACT-POST-SAVE] Skipping domain extraction for flagged contact ${contactInfo}`);
      return;
    }

    // Extract domains from all email addresses
    const domains = new Set<string>();
    const invalidEmails: string[] = [];
    const excludedDomains: string[] = [];
    const validDomains: string[] = [];
    const candidateDomains: string[] = [];
    
    for (const email of doc.emails) {
      if (!email.address || typeof email.address !== 'string') {
        invalidEmails.push(String(email.address || 'undefined'));
        continue;
      }
      
      const domain = extractDomainFromEmail(email.address);
      if (!domain) {
        invalidEmails.push(email.address);
        continue;
      }

      candidateDomains.push(domain);
    }
    
    // Log email processing results
    if (invalidEmails.length > 0) {
      console.warn(`[CONTACT-POST-SAVE] Invalid email formats for ${contactInfo}:`, invalidEmails);
    }

    if (candidateDomains.length === 0) {
      console.log(`[CONTACT-POST-SAVE] No business domains to add for ${contactInfo}`);
      return;
    }
    
    // Get the current prospect (with organization for context)
    const prospect = await Prospect.findById(doc.prospect);
    if (!prospect) {
      console.error(`[CONTACT-POST-SAVE] Prospect not found for ID ${doc.prospect} from contact ${contactInfo}`);
      return;
    }
    
    const primaryEmail = doc.emails.find(e => e.isPrimary)?.address;
    const validationResults = await validateDomains(candidateDomains, {
      organizationId: prospect.organization,
      organizationName: (prospect as any).organization?.name,
      organizationIndustry: (prospect as any).organization?.industry,
      prospectId: doc.prospect,
      prospectName: prospect.name,
      prospectIndustry: prospect.industry,
      existingDomains: prospect.domains,
      contactEmail: primaryEmail,
    });

    for (const domain of candidateDomains) {
      const decision = validationResults.get(domain);
      if (decision?.shouldInclude) {
        domains.add(domain);
        validDomains.push(domain);
      } else {
        excludedDomains.push(domain);
      }
    }

    if (excludedDomains.length > 0) {
      console.log(`[CONTACT-POST-SAVE] Domains excluded by validation for ${contactInfo}:`, [...new Set(excludedDomains)]);
    }

    console.log(`[CONTACT-POST-SAVE] Valid business domains found for ${contactInfo}:`, validDomains);
    
    if (domains.size === 0) {
      console.log(`[CONTACT-POST-SAVE] No business domains to add for ${contactInfo}`);
      return;
    }
    
    const prospectInfo = `${prospect.name} (${prospect._id})`;
    const currentDomains = new Set(prospect.domains || []);
    const newDomains = Array.from(domains).filter(domain => !currentDomains.has(domain));
    
    if (newDomains.length === 0) {
      console.log(`[CONTACT-POST-SAVE] No new domains to add to prospect ${prospectInfo} from contact ${contactInfo}`);
      return;
    }
    
    console.log(`[CONTACT-POST-SAVE] Adding ${newDomains.length} new domains to prospect ${prospectInfo}: ${newDomains.join(', ')}`);
    
    // Validate prospect domains before adding
    const invalidNewDomains = newDomains.filter(domain => 
      !domain || typeof domain !== 'string' || !domain.includes('.')
    );
    
    if (invalidNewDomains.length > 0) {
      console.error(`[CONTACT-POST-SAVE] Invalid domain formats detected:`, invalidNewDomains);
      // Filter out valid domains
      const validNewDomains = newDomains.filter(domain => 
        domain && typeof domain === 'string' && domain.includes('.')
      );
      
      if (validNewDomains.length === 0) {
        console.warn(`[CONTACT-POST-SAVE] No valid domains to add after filtering for ${contactInfo}`);
        return;
      }
      
      console.log(`[CONTACT-POST-SAVE] Proceeding with ${validNewDomains.length} valid domains:`, validNewDomains);
    }
    
    // Add new domains to the prospect
    const originalDomainCount = prospect.domains ? prospect.domains.length : 0;
    prospect.domains = [...(prospect.domains || []), ...newDomains];
    
    await prospect.save(); // This will trigger the prospect's domain change middleware
    
    console.log(`[CONTACT-POST-SAVE] Successfully updated prospect ${prospectInfo} domains: ${originalDomainCount} → ${prospect.domains.length}`);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CONTACT-POST-SAVE] Error in domain extraction for ${contactInfo}: ${errorMessage}`);
    // Don't throw - let the calling function handle the error
  }
}

const Contact = mongoose.model<IContact>('Contact', ContactSchema);
export default Contact; 