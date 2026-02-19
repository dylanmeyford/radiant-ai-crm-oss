import mongoose, { Document, Schema } from 'mongoose';
import { searchAndPopulateContacts } from '../services/contactAutoPopulationService';

export interface IProspect extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  website?: string;
  domains?: string[];
  industry?: string;
  size?: string;
  description?: string;
  status: 'lead' | 'qualified' | 'customer' | 'churned' | 'archived';
  organization: mongoose.Types.ObjectId;
  contacts: mongoose.Types.ObjectId[];
  activities: mongoose.Types.ObjectId[];
  opportunities: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  owner: mongoose.Types.ObjectId;
}

const ProspectSchema = new Schema<IProspect>(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      auto: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    domains: [{
      type: String,
      trim: true,
    }],
    industry: {
      type: String,
      trim: true,
    },
    size: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['lead', 'qualified', 'customer', 'churned', 'archived'],
      default: 'lead',
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    contacts: [{
      type: Schema.Types.ObjectId,
      ref: 'Contact'
    }],
    activities: [{
      type: Schema.Types.ObjectId,
      ref: 'Activity',
    }],
    opportunities: [{
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
    }],
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true, virtuals: true }
);

// Index for faster queries
ProspectSchema.index({ name: 1, organization: 1 });
ProspectSchema.index({ domain: 1, organization: 1 });
ProspectSchema.index({ organization: 1 });

// Pre-save middleware to detect domain changes and trigger contact search
ProspectSchema.pre('save', async function() {
  // Track if this is a new prospect for post-save middleware
  if (this.isNew) {
    (this as any).__isNewProspect = true;
  }
  
  // Only check for domain changes on existing prospects (not new ones)
  if (!this.isNew && this.isModified('domains')) {
    const startTime = Date.now();
    const prospectInfo = `${this.name} (${this._id})`;
    
    try {
      console.log(`[PROSPECT-PRE-SAVE] Starting domain change detection for ${prospectInfo}`);
      
      // Validate domains array
      if (this.domains && !Array.isArray(this.domains)) {
        throw new Error(`Invalid domains field: expected array, got ${typeof this.domains}`);
      }
      
      // Get the original document to compare domains
      const originalDoc = await Prospect.findById(this._id).lean();
      
      if (!originalDoc) {
        console.warn(`[PROSPECT-PRE-SAVE] Original document not found for ${prospectInfo} - skipping domain comparison`);
        return;
      }
      
      const currentDomains = this.domains || [];
      const originalDomains = originalDoc.domains || [];
      
      // Validate domain formats
      const invalidDomains = currentDomains.filter(domain => 
        !domain || typeof domain !== 'string' || !domain.includes('.')
      );
      
      if (invalidDomains.length > 0) {
        console.error(`[PROSPECT-PRE-SAVE] Invalid domain formats detected for ${prospectInfo}:`, invalidDomains);
        // Continue processing valid domains
      }
      
      // Check if domains have actually changed
      const domainsChanged = !arraysEqual(currentDomains, originalDomains);
      
      if (domainsChanged) {
        const addedDomains = currentDomains.filter(d => !originalDomains.includes(d));
        const removedDomains = originalDomains.filter(d => !currentDomains.includes(d));
        
        console.log(`[PROSPECT-PRE-SAVE] Domain changes detected for ${prospectInfo}`);
        console.log(`[PROSPECT-PRE-SAVE] Added domains: ${addedDomains.join(', ') || 'none'}`);
        console.log(`[PROSPECT-PRE-SAVE] Removed domains: ${removedDomains.join(', ') || 'none'}`);
        console.log(`[PROSPECT-PRE-SAVE] Total domains: ${originalDomains.length} → ${currentDomains.length}`);
        
        // Store the flag to trigger contact search in post-save
        (this as any).__domainsChanged = true;
        (this as any).__domainChangeMetrics = {
          added: addedDomains,
          removed: removedDomains,
          total: currentDomains.length
        };
      } else {
        console.log(`[PROSPECT-PRE-SAVE] No domain changes detected for ${prospectInfo}`);
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`[PROSPECT-PRE-SAVE] Completed domain change detection for ${prospectInfo} in ${processingTime}ms`);
      
    } catch (error: unknown) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';
      
      console.error(`[PROSPECT-PRE-SAVE] Error in domain change detection for ${prospectInfo} after ${processingTime}ms:`);
      console.error(`[PROSPECT-PRE-SAVE] Error message: ${errorMessage}`);
      console.error(`[PROSPECT-PRE-SAVE] Error stack: ${errorStack}`);
      
      // Don't prevent the save operation for middleware errors
      // Log the error and continue
      console.warn(`[PROSPECT-PRE-SAVE] Continuing with save operation despite middleware error for ${prospectInfo}`);
    }
  }
});

// Helper function to compare arrays
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
}

// Pre-findOneAndUpdate middleware to detect domain changes in updates
ProspectSchema.pre('findOneAndUpdate', async function() {
  const startTime = Date.now();
  
  try {
    console.log('[PROSPECT-PRE-UPDATE] Starting domain change detection for findOneAndUpdate');
    
    // Get the update object
    const update = this.getUpdate() as any;
    
    // Check if domains are being updated
    if (!update || !update.domains) {
      console.log('[PROSPECT-PRE-UPDATE] No domains in update - skipping');
      return;
    }
    
    // Get the filter to find the document being updated
    const filter = this.getFilter();
    
    if (!filter || !filter._id) {
      console.warn('[PROSPECT-PRE-UPDATE] No _id in filter - cannot detect changes');
      return;
    }
    
    // Get the current document to compare domains
    const currentDoc = await Prospect.findById(filter._id).lean();
    
    if (!currentDoc) {
      console.warn(`[PROSPECT-PRE-UPDATE] Document not found for ID ${filter._id} - may be new document`);
      return;
    }
    
    const currentDomains = currentDoc.domains || [];
    const newDomains = Array.isArray(update.domains) ? update.domains : [];
    const prospectInfo = `${currentDoc.name} (${currentDoc._id})`;
    
    // Validate domain formats
    const invalidDomains = newDomains.filter((domain: any) => 
      !domain || typeof domain !== 'string' || !domain.includes('.')
    );
    
    if (invalidDomains.length > 0) {
      console.error(`[PROSPECT-PRE-UPDATE] Invalid domain formats detected for ${prospectInfo}:`, invalidDomains);
    }
    
    // Check if domains have actually changed
    const domainsChanged = !arraysEqual(currentDomains, newDomains);
    
    if (domainsChanged) {
      const addedDomains = newDomains.filter((d: string) => !currentDomains.includes(d));
      const removedDomains = currentDomains.filter((d: string) => !newDomains.includes(d));
      
      console.log(`[PROSPECT-PRE-UPDATE] Domain changes detected for ${prospectInfo}`);
      console.log(`[PROSPECT-PRE-UPDATE] Added domains: ${addedDomains.join(', ') || 'none'}`);
      console.log(`[PROSPECT-PRE-UPDATE] Removed domains: ${removedDomains.join(', ') || 'none'}`);
      console.log(`[PROSPECT-PRE-UPDATE] Total domains: ${currentDomains.length} → ${newDomains.length}`);
      
      // Store the prospect ID and change info for post middleware
      (this as any).__updateDomainsChanged = true;
      (this as any).__updateProspectId = currentDoc._id;
      (this as any).__updateDomainChangeMetrics = {
        added: addedDomains,
        removed: removedDomains,
        total: newDomains.length,
        prospectName: currentDoc.name
      };
    } else {
      console.log(`[PROSPECT-PRE-UPDATE] No domain changes detected for ${prospectInfo}`);
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[PROSPECT-PRE-UPDATE] Completed domain change detection in ${processingTime}ms`);
    
  } catch (error: unknown) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    console.error(`[PROSPECT-PRE-UPDATE] Error in domain change detection after ${processingTime}ms:`);
    console.error(`[PROSPECT-PRE-UPDATE] Error message: ${errorMessage}`);
    console.error(`[PROSPECT-PRE-UPDATE] Error stack: ${errorStack}`);
    
    // Don't prevent the update operation for middleware errors
    console.warn('[PROSPECT-PRE-UPDATE] Continuing with update operation despite middleware error');
  }
});

// Post-findOneAndUpdate middleware to trigger contact search on domain changes
ProspectSchema.post('findOneAndUpdate', async function(doc: IProspect | null) {
  // Only trigger if domains changed and we have a document result
  if (!doc || !(this as any).__updateDomainsChanged) {
    return;
  }
  
  const startTime = Date.now();
  const changeMetrics = (this as any).__updateDomainChangeMetrics;
  const prospectInfo = `${changeMetrics?.prospectName || doc.name} (${doc._id})`;
  
  try {
    console.log(`[PROSPECT-POST-UPDATE] Starting contact search trigger for domain changes: ${prospectInfo}`);
    
    if (changeMetrics) {
      console.log(`[PROSPECT-POST-UPDATE] Domain change details - Added: ${changeMetrics.added.length}, Removed: ${changeMetrics.removed.length}, Total: ${changeMetrics.total}`);
    }
    
    // Validate prospect data before triggering search
    if (!doc._id) {
      throw new Error('Invalid prospect: missing _id');
    }
    
    // Use the updated domains from the document instead of relying on searchAndPopulateContacts to fetch again
    if (!doc.domains || doc.domains.length === 0) {
      console.warn(`[PROSPECT-POST-UPDATE] Prospect ${prospectInfo} has no domains after update - contact search may not be effective`);
    }
    
    if (typeof searchAndPopulateContacts !== 'function') {
      throw new Error('searchAndPopulateContacts is not a function - service import failed');
    }
    
    console.log(`[PROSPECT-POST-UPDATE] Triggering asynchronous contact search for ${prospectInfo} with domains: ${doc.domains?.join(', ') || 'none'}`);
    
    // Add a small delay to ensure the transaction has committed
    setTimeout(() => {
      // Trigger contact search asynchronously
      searchAndPopulateContacts(doc._id.toString()).catch((error: Error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        
        console.error(`[PROSPECT-POST-UPDATE] Contact search failed for ${prospectInfo}:`);
        console.error(`[PROSPECT-POST-UPDATE] Service error message: ${errorMessage}`);
        console.error(`[PROSPECT-POST-UPDATE] Service error stack: ${errorStack}`);
      });
    }, 100); // 100ms delay to ensure transaction commit
    
    const processingTime = Date.now() - startTime;
    console.log(`[PROSPECT-POST-UPDATE] Successfully triggered contact search for ${prospectInfo} in ${processingTime}ms`);
    
  } catch (error: unknown) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    console.error(`[PROSPECT-POST-UPDATE] Error triggering contact search for ${prospectInfo} after ${processingTime}ms:`);
    console.error(`[PROSPECT-POST-UPDATE] Error message: ${errorMessage}`);
    console.error(`[PROSPECT-POST-UPDATE] Error stack: ${errorStack}`);
    
    console.warn(`[PROSPECT-POST-UPDATE] Contact search trigger failed for ${prospectInfo} - prospect updated successfully but search not initiated`);
    
  } finally {
    // Clean up flags and metrics
    delete (this as any).__updateDomainsChanged;
    delete (this as any).__updateProspectId;
    delete (this as any).__updateDomainChangeMetrics;
  }
});

// Post-save middleware to trigger contact search on prospect creation and domain changes
ProspectSchema.post('save', async function(doc: IProspect) {
  // Trigger contact search for newly created prospects or when domains have changed
  const shouldTriggerSearch = (this as any).__isNewProspect || (this as any).__domainsChanged;
  
  if (shouldTriggerSearch) {
    const startTime = Date.now();
    const prospectInfo = `${doc.name} (${doc._id})`;
    const reason = (this as any).__isNewProspect ? 'new prospect creation' : 'domain changes';
    const changeMetrics = (this as any).__domainChangeMetrics;
    
    try {
      console.log(`[PROSPECT-POST-SAVE] Starting contact search trigger for ${reason}: ${prospectInfo}`);
      
      if (reason === 'domain changes' && changeMetrics) {
        console.log(`[PROSPECT-POST-SAVE] Domain change details - Added: ${changeMetrics.added.length}, Removed: ${changeMetrics.removed.length}, Total: ${changeMetrics.total}`);
      }
      
      // Validate prospect data before triggering search
      if (!doc._id) {
        throw new Error('Invalid prospect: missing _id');
      }
      
      if (!doc.name || doc.name.trim().length === 0) {
        console.warn(`[PROSPECT-POST-SAVE] Prospect ${doc._id} has no name - proceeding with search anyway`);
      }
      
      // For new prospects, only trigger search if they have domains
      if ((this as any).__isNewProspect && (!doc.domains || doc.domains.length === 0)) {
        console.log(`[PROSPECT-POST-SAVE] Skipping contact search for new prospect ${prospectInfo} - no domains provided`);
        return;
      }
      
      if (!doc.domains || doc.domains.length === 0) {
        console.warn(`[PROSPECT-POST-SAVE] Prospect ${prospectInfo} has no domains - contact search may not be effective`);
      }
      
      if (typeof searchAndPopulateContacts !== 'function') {
        throw new Error('searchAndPopulateContacts is not a function - service import failed');
      }
      
      console.log(`[PROSPECT-POST-SAVE] Triggering asynchronous contact search for ${prospectInfo} with domains: ${doc.domains?.join(', ') || 'none'}`);
      
      // Trigger contact search asynchronously with enhanced error handling
      searchAndPopulateContacts(doc._id.toString()).catch((error: Error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        
        console.error(`[PROSPECT-POST-SAVE] Contact search failed for ${prospectInfo}:`);
        console.error(`[PROSPECT-POST-SAVE] Service error message: ${errorMessage}`);
        console.error(`[PROSPECT-POST-SAVE] Service error stack: ${errorStack}`);
        
        // TODO: Could implement retry logic or dead letter queue here
        // For now, just log the failure
      });
      
      const processingTime = Date.now() - startTime;
      console.log(`[PROSPECT-POST-SAVE] Successfully triggered contact search for ${prospectInfo} in ${processingTime}ms`);
      
    } catch (error: unknown) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';
      
      console.error(`[PROSPECT-POST-SAVE] Error triggering contact search for ${prospectInfo} after ${processingTime}ms:`);
      console.error(`[PROSPECT-POST-SAVE] Error message: ${errorMessage}`);
      console.error(`[PROSPECT-POST-SAVE] Error stack: ${errorStack}`);
      
      // Don't throw the error - post-save middleware errors shouldn't affect the saved document
      console.warn(`[PROSPECT-POST-SAVE] Contact search trigger failed for ${prospectInfo} - prospect saved successfully but search not initiated`);
      
    } finally {
      // Clean up flags and metrics regardless of success/failure
      delete (this as any).__isNewProspect;
      delete (this as any).__domainsChanged;
      delete (this as any).__domainChangeMetrics;
    }
    
  } else {
    console.log(`[PROSPECT-POST-SAVE] No contact search needed for ${doc.name} (${doc._id}) - no triggering conditions met`);
  }
});

const Prospect = mongoose.model<IProspect>('Prospect', ProspectSchema);
export default Prospect; 