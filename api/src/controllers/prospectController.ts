import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Prospect from '../models/Prospect';
import Contact from '../models/Contact';
import Opportunity from '../models/Opportunity';
import Activity from '../models/Activity';
import Intel from '../models/Intel';
import EmailActivity from '../models/EmailActivity';
import CalendarActivity from '../models/CalendarActivity';
import { DigitalSalesRoom } from '../models/DigitalSalesRoom';
import { getProspectTimeline } from '../utils/getProspectTimeline';

// Create a new prospect
export const createProspect = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, website, domains, industry, size, description, status } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Check if a prospect with any of these domains already exists in the organization
    if (domains && Array.isArray(domains) && domains.length > 0) {
      const existingProspect = await Prospect.findOne({
        organization: user.organization,
        domains: { $in: domains }
      });

      if (existingProspect) {
        // Return the existing prospect instead of creating a duplicate
        res.status(200).json({
          success: true,
          data: existingProspect,
          message: 'Prospect with this domain already exists'
        });
        return;
      }
    }

    const prospect = await Prospect.create({
      name,
      website,
      domains,
      industry,
      size,
      description,
      organization: user.organization,
      owner: user._id,
      status: status || 'lead'
    });

    res.status(201).json({
      success: true,
      data: prospect
    });
  } catch (error) {
    console.error('Create prospect error:', error);
    res.status(500).json({ success: false, message: 'Error creating prospect' });
  }
};

// Get all prospects for the organization
export const getProspects = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const prospects = await Prospect.find({ organization: user.organization })
      .populate('contacts', 'firstName lastName')

    res.status(200).json({
      success: true,
      data: prospects
    });
  } catch (error) {
    console.error('Get prospects error:', error);
    res.status(500).json({ success: false, message: 'Error fetching prospects' });
  }
};

// Get a single prospect
export const getProspect = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const prospect = await Prospect.findOne({
      _id: id,
      organization: user.organization
    })
      .populate({
        path: 'contacts', 
        populate: [
          {
            path: 'emailActivities',
          },
          {
            path: 'calendarActivities',
          }
        ]
      })
      .populate('activities')
      .populate('opportunities');

    if (!prospect) {
      res.status(404).json({ success: false, message: 'Prospect not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: prospect
    });
  } catch (error) {
    console.error('Get prospect error:', error);
    res.status(500).json({ success: false, message: 'Error fetching prospect' });
  }
};

// Helper function to extract domain from email address
function extractDomainFromEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
  const match = email.match(emailRegex);
  return match ? match[1].toLowerCase() : null;
}

// Helper function to remove emails from contacts based on removed domains
async function removeEmailsFromContactsForRemovedDomains(
  prospectId: string,
  removedDomains: string[],
  organizationId: string,
  session: mongoose.ClientSession
): Promise<void> {
  if (removedDomains.length === 0) return;

  console.log(`[PROSPECT-UPDATE] Starting email cleanup for removed domains: ${removedDomains.join(', ')}`);

  // Find all contacts for this prospect
  const contacts = await Contact.find({
    prospect: prospectId,
    organization: organizationId
  }).session(session);

  console.log(`[PROSPECT-UPDATE] Found ${contacts.length} contacts to process for email cleanup`);

  for (const contact of contacts) {
    const originalEmailCount = contact.emails.length;
    let emailsRemoved = 0;
    let primaryEmailRemoved = false;

    // Filter out emails that match removed domains
    const updatedEmails = contact.emails.filter(email => {
      const emailDomain = extractDomainFromEmail(email.address);
      const shouldRemove = emailDomain && removedDomains.includes(emailDomain);
      
      if (shouldRemove) {
        emailsRemoved++;
        if (email.isPrimary) {
          primaryEmailRemoved = true;
        }
        console.log(`[PROSPECT-UPDATE] Removing email ${email.address} from contact ${contact.firstName} ${contact.lastName} (${contact._id})`);
      }
      
      return !shouldRemove;
    });

    // Only update if emails were actually removed
    if (emailsRemoved > 0) {
      // If primary email was removed and there are remaining emails, make the first one primary
      if (primaryEmailRemoved && updatedEmails.length > 0) {
        const hasPrimary = updatedEmails.some(email => email.isPrimary);
        if (!hasPrimary) {
          updatedEmails[0].isPrimary = true;
          console.log(`[PROSPECT-UPDATE] Set new primary email ${updatedEmails[0].address} for contact ${contact.firstName} ${contact.lastName} (${contact._id})`);
        }
      }

      // Update the contact with filtered emails - use session-less update to avoid hook conflicts
      await Contact.findByIdAndUpdate(
        contact._id,
        { 
          emails: updatedEmails,
          // Add a flag to prevent hooks from triggering background operations during domain cleanup
          $unset: { __skipEmailFetch: 1 }
        },
        { 
          // Don't use session to avoid conflicts with hooks that may run async operations
          runValidators: true,
          // Add this flag to indicate this is a domain cleanup operation
          context: 'domainCleanup'
        }
      );

      const contactInfo = `${contact.firstName || ''} ${contact.lastName || ''} (${contact._id})`.trim();
      console.log(`[PROSPECT-UPDATE] Updated contact ${contactInfo}: removed ${emailsRemoved} emails (${originalEmailCount} → ${updatedEmails.length})`);
    }
  }

  console.log(`[PROSPECT-UPDATE] Completed email cleanup for removed domains`);
}

// Update a prospect
export const updateProspect = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const updates = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // First, get the current prospect to compare domains
      const currentProspect = await Prospect.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!currentProspect) {
        throw new Error('Prospect not found');
      }

      // Detect domain changes if domains are being updated
      if (updates.domains && Array.isArray(updates.domains)) {
        const currentDomains = new Set(currentProspect.domains || []);
        const newDomains = new Set(updates.domains);
        
        // Find removed domains
        const removedDomains = [...currentDomains].filter(domain => !newDomains.has(domain));
        
        if (removedDomains.length > 0) {
          console.log(`[PROSPECT-UPDATE] Domains being removed: ${removedDomains.join(', ')}`);
          
          // Remove emails from contacts that match the removed domains
          await removeEmailsFromContactsForRemovedDomains(
            id,
            removedDomains,
            user.organization.toString(),
            session
          );
        }
      }

      // Update the prospect
      const prospect = await Prospect.findOneAndUpdate(
        { _id: id, organization: user.organization },
        updates,
        { new: true, runValidators: true, session }
      );

      if (!prospect) {
        throw new Error('Prospect not found after update');
      }

      res.status(200).json({
        success: true,
        data: prospect
      });
    });

  } catch (error) {
    console.error('Update prospect error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error updating prospect';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Prospect not found' || errorMessage === 'Prospect not found after update') statusCode = 404;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Delete a prospect
export const deleteProspect = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log(`[PROSPECT-DELETE] Starting cascade deletion for prospect ${id}`);

      // First, verify the prospect exists and belongs to the user's organization
      const prospect = await Prospect.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!prospect) {
        throw new Error('Prospect not found');
      }

      console.log(`[PROSPECT-DELETE] Found prospect: ${prospect.name} (${prospect._id})`);

      // Step 1: Find all related opportunities
      const opportunities = await Opportunity.find({
        prospect: prospect._id,
        organization: user.organization
      }).session(session);

      console.log(`[PROSPECT-DELETE] Found ${opportunities.length} opportunities to delete`);

      // Step 2: Find all related contacts
      const contacts = await Contact.find({
        prospect: prospect._id,
        organization: user.organization
      }).session(session);

      console.log(`[PROSPECT-DELETE] Found ${contacts.length} contacts to delete`);

      // Step 3: Find all related activities
      const activities = await Activity.find({
        prospect: prospect._id,
        organization: user.organization
      }).session(session);

      console.log(`[PROSPECT-DELETE] Found ${activities.length} activities to delete`);

      // Step 4: Find all related intel records
      const intelRecords = await Intel.find({
        prospect: prospect._id,
        organization: user.organization
      }).session(session);

      console.log(`[PROSPECT-DELETE] Found ${intelRecords.length} intel records to delete`);

      // Step 5: Find email activities through contacts
      const contactIds = contacts.map(c => c._id);
      const emailActivities = contactIds.length > 0 ? await EmailActivity.find({
        contacts: { $in: contactIds },
        organization: user.organization
      }).session(session) : [];

      console.log(`[PROSPECT-DELETE] Found ${emailActivities.length} email activities to delete`);

      // Step 6: Find calendar activities through contacts
      const calendarActivities = contactIds.length > 0 ? await CalendarActivity.find({
        contacts: { $in: contactIds },
        organization: user.organization
      }).session(session) : [];

      console.log(`[PROSPECT-DELETE] Found ${calendarActivities.length} calendar activities to delete`);

      // Step 7: Find digital sales rooms through opportunities
      const opportunityIds = opportunities.map((o: any) => o._id);
      const digitalSalesRooms = opportunityIds.length > 0 ? await DigitalSalesRoom.find({
        opportunity: { $in: opportunityIds },
        organization: user.organization
      }).session(session) : [];

      console.log(`[PROSPECT-DELETE] Found ${digitalSalesRooms.length} digital sales rooms to delete`);

      // Now perform deletions in the correct order (dependencies first)

      // Delete digital sales rooms first (they depend on opportunities)
      if (digitalSalesRooms.length > 0) {
        const salesRoomIds = digitalSalesRooms.map((dsr: any) => dsr._id);
        await DigitalSalesRoom.deleteMany({
          _id: { $in: salesRoomIds }
        }, { session });
        console.log(`[PROSPECT-DELETE] Deleted ${digitalSalesRooms.length} digital sales rooms`);
      }

      // Delete email and calendar activities (they depend on contacts)
      if (emailActivities.length > 0) {
        const emailActivityIds = emailActivities.map((ea: any) => ea._id);
        await EmailActivity.deleteMany({
          _id: { $in: emailActivityIds }
        }, { session });
        console.log(`[PROSPECT-DELETE] Deleted ${emailActivities.length} email activities`);
      }

      if (calendarActivities.length > 0) {
        const calendarActivityIds = calendarActivities.map((ca: any) => ca._id);
        await CalendarActivity.deleteMany({
          _id: { $in: calendarActivityIds }
        }, { session });
        console.log(`[PROSPECT-DELETE] Deleted ${calendarActivities.length} calendar activities`);
      }

      // Delete activities (they depend on prospect and contacts)
      if (activities.length > 0) {
        const activityIds = activities.map((a: any) => a._id);
        await Activity.deleteMany({
          _id: { $in: activityIds }
        }, { session });
        console.log(`[PROSPECT-DELETE] Deleted ${activities.length} activities`);
      }

      // Delete intel records (they depend on prospect)
      if (intelRecords.length > 0) {
        const intelIds = intelRecords.map((i: any) => i._id);
        await Intel.deleteMany({
          _id: { $in: intelIds }
        }, { session });
        console.log(`[PROSPECT-DELETE] Deleted ${intelRecords.length} intel records`);
      }

      // Delete opportunities (they depend on prospect and contacts)
      if (opportunities.length > 0) {
        const opportunityIds = opportunities.map((o: any) => o._id);
        await Opportunity.deleteMany({
          _id: { $in: opportunityIds }
        }, { session });
        console.log(`[PROSPECT-DELETE] Deleted ${opportunities.length} opportunities`);
      }

      // Delete contacts (they depend on prospect)
      if (contacts.length > 0) {
        const contactIds = contacts.map((c: any) => c._id);
        await Contact.deleteMany({
          _id: { $in: contactIds }
        }, { session });
        console.log(`[PROSPECT-DELETE] Deleted ${contacts.length} contacts`);
      }

      // Finally, delete the prospect itself
      await Prospect.deleteOne({
        _id: prospect._id,
        organization: user.organization
      }, { session });

      console.log(`[PROSPECT-DELETE] Successfully deleted prospect ${prospect.name} (${prospect._id}) and all associated entities`);

      res.status(200).json({
        success: true,
        data: {}
      });
    });

  } catch (error) {
    console.error('Delete prospect error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting prospect';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Prospect not found') statusCode = 404;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
}; 