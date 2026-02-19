import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Contact from '../models/Contact';
import Prospect from '../models/Prospect';
import Opportunity from '../models/Opportunity';
import Activity from '../models/Activity';
import EmailActivity from '../models/EmailActivity';
import CalendarActivity from '../models/CalendarActivity';
import { fetchEmailsAndEventsForContact } from '../services/NylasService';

// Create a new contact
export const createContact = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  let createdContactId: mongoose.Types.ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const { 
        firstName, 
        lastName, 
        email, // Backwards compatibility for old single email field
        emails, // New emails array
        phone, 
        title, 
        department, 
        role, 
        isPrimary,
        prospectId,
        addToOpportunities = true
      } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Verify prospect exists and belongs to organization
      const prospectDoc = await Prospect.findOne({
        _id: prospectId,
        organization: user.organization
      }).session(session);

      if (!prospectDoc) {
        throw new Error('Prospect not found');
      }

      // Process emails - support both old single email field and new emails array
      let processedEmails: Array<{address: string, category: string, isPrimary: boolean}> = [];
      
      if (emails && Array.isArray(emails) && emails.length > 0) {
        // New format: emails array
        processedEmails = emails.map((emailObj: any) => ({
          address: emailObj.address?.toLowerCase()?.trim() || '',
          category: emailObj.category || 'work',
          isPrimary: emailObj.isPrimary || false
        })).filter(emailObj => emailObj.address); // Filter out empty addresses
      } else if (email && typeof email === 'string') {
        // Old format: single email field
        processedEmails = [{
          address: email.toLowerCase().trim(),
          category: 'work',
          isPrimary: true
        }];
      }

      if (processedEmails.length === 0) {
        throw new Error('At least one valid email address is required');
      }

      // Ensure exactly one email is marked as primary
      const primaryEmails = processedEmails.filter(e => e.isPrimary);
      if (primaryEmails.length === 0) {
        // If no email is marked as primary, make the first one primary
        processedEmails[0].isPrimary = true;
      } else if (primaryEmails.length > 1) {
        // If multiple emails are marked as primary, only keep the first one as primary
        let foundFirst = false;
        processedEmails.forEach(emailObj => {
          if (emailObj.isPrimary && !foundFirst) {
            foundFirst = true;
          } else if (emailObj.isPrimary) {
            emailObj.isPrimary = false;
          }
        });
      }

      // If this is a primary contact, unset any existing primary contacts for this prospect
      if (isPrimary) {
        await Contact.updateMany(
          { 
            prospect: prospectId,
            organization: user.organization,
            isPrimary: true 
          },
          { isPrimary: false },
          { session }
        );
      }

      const contact = new Contact({
        firstName,
        lastName,
        emails: processedEmails,
        phone,
        title,
        department,
        role,
        isPrimary,
        prospect: prospectId,
        organization: user.organization
      });
      await contact.save({ session });
      createdContactId = contact._id as mongoose.Types.ObjectId;

      // Update the prospect's contacts array
      await Prospect.findByIdAndUpdate(
        prospectId,
        { $push: { contacts: contact._id } },
        { session }
      );

      // Add contact to all opportunities associated with this prospect if requested
      if (addToOpportunities) {
        const opportunities = await Opportunity.find({ 
          prospect: prospectId,
          organization: user.organization
        }).session(session);
        
        if (opportunities.length > 0) {
          const opportunityIds = opportunities.map(opp => opp._id);
          // Update each opportunity to include this contact
          await Opportunity.updateMany(
            { _id: { $in: opportunityIds }, organization: user.organization },
            { $addToSet: { contacts: contact._id } },
            { session }
          );
          
          // Update the contact to include these opportunities
          await Contact.findByIdAndUpdate(
            contact._id,
            { $addToSet: { opportunities: { $each: opportunityIds } } },
            { session }
          );
        }
      }

      res.status(201).json({
        success: true,
        data: contact
      });
    });

  } catch (error) {
    console.error('Create contact error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error creating contact';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Prospect not found') statusCode = 404;
    if (errorMessage === 'At least one valid email address is required') statusCode = 400;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    let orgId: string | undefined;
    const userOrg = (req.user as any)?.organization;
    if (typeof userOrg === 'string') {
      orgId = userOrg;
    } else if (userOrg && typeof userOrg === 'object' && (userOrg as any)._id) {
      orgId = String((userOrg as any)._id);
    }
    // After the transaction commits, trigger async fetch for the newly created contact
    if (createdContactId && orgId) {
      const fetchPromise = fetchEmailsAndEventsForContact(String(createdContactId), orgId);
      if (fetchPromise && typeof (fetchPromise as Promise<void>).catch === 'function') {
        fetchPromise.catch((err: Error) => {
          console.error(`[CONTACT-CONTROLLER] Post-commit email/calendar fetch failed for contact ${createdContactId}:`, err.message);
        });
      }
    }
    await session.endSession();
  }
};

// Get all contacts for a prospect
export const getProspectContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prospectId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const contacts = await Contact.find({
      prospect: prospectId,
      organization: user.organization
    })
      .populate('prospect')
      .populate('opportunities');


    res.status(200).json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Get prospect contacts error:', error);
    res.status(500).json({ success: false, message: 'Error fetching contacts' });
  }
};

// Get all contacts for the organization
export const getOrganizationContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const contacts = await Contact.find({ organization: user.organization })
      .populate('prospect')
      .populate('opportunities');

    res.status(200).json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Get organization contacts error:', error);
    res.status(500).json({ success: false, message: 'Error fetching contacts' });
  }
};

// Get a single contact
export const getContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const contact = await Contact.findOne({
      _id: id,
      organization: user.organization
    })
      .populate('prospect')
      .populate('opportunities');

    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ success: false, message: 'Error fetching contact' });
  }
};

// Update a contact
export const updateContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // If updating to primary contact, unset any existing primary contacts for this prospect
    if (updates.isPrimary) {
      const contact = await Contact.findOne({
        _id: id,
        organization: user.organization
      });

      if (contact) {
        await Contact.updateMany(
          {
            prospect: contact.prospect,
            organization: user.organization,
            isPrimary: true,
            _id: { $ne: id }
          },
          { isPrimary: false }
        );
      }
    }

    const contact = await Contact.findOneAndUpdate(
      { _id: id, organization: user.organization },
      updates,
      { new: true, runValidators: true, skipPostUpdateFetch: true }
    )
      .populate('prospect')
      .populate('opportunities');

    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: contact
    });

    // Post-update: trigger background fetch for emails and events
    try {
      const orgId = typeof (user as any).organization === 'string'
        ? (user as any).organization
        : (user as any).organization?._id?.toString?.();
      if (orgId) {
        fetchEmailsAndEventsForContact(String(contact._id), String(orgId)).catch((err: Error) => {
          console.error(`[CONTACT-CONTROLLER] Post-update fetch failed for contact ${contact._id}:`, err.message);
        });
      }
    } catch (bgErr) {
      console.error('[CONTACT-CONTROLLER] Error scheduling post-update fetch:', (bgErr as Error).message);
    }
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ success: false, message: 'Error updating contact' });
  }
};

// Delete a contact
export const deleteContact = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      const contact = await Contact.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!contact) {
        throw new Error('Contact not found');
      }

      // Remove contact from any opportunities it's associated with
      await Opportunity.updateMany(
        { contacts: contact._id, organization: user.organization }, // Ensure we only update opportunities in the same org
        { $pull: { contacts: contact._id } },
        { session }
      );

      // Remove contact from its prospect
      if (contact.prospect) {
        await Prospect.findByIdAndUpdate(
          contact.prospect, // Assuming prospect object/ID is valid
          { $pull: { contacts: contact._id } },
          { session }
        );
      }
      
      // Handle activities: delete if contact is the only one, otherwise remove contact from array
      
      // Handle Activity records
      const activities = await Activity.find({
        contacts: contact._id,
        organization: user.organization
      }).session(session);
      
      for (const activity of activities) {
        if (activity.contacts.length === 1) {
          // Contact is the only one in the array - delete the entire activity
          await Activity.deleteOne({ _id: activity._id }, { session });
        } else {
          // Multiple contacts - just remove this contact from the array
          await Activity.updateOne(
            { _id: activity._id },
            { $pull: { contacts: contact._id } },
            { session }
          );
        }
      }

      // Handle EmailActivity records
      const emailActivities = await EmailActivity.find({
        contacts: contact._id,
        organization: user.organization
      }).session(session);
      
      for (const emailActivity of emailActivities) {
        if (emailActivity.contacts.length === 1) {
          // Contact is the only one in the array - delete the entire activity
          await EmailActivity.deleteOne({ _id: emailActivity._id }, { session });
        } else {
          // Multiple contacts - just remove this contact from the array
          await EmailActivity.updateOne(
            { _id: emailActivity._id },
            { $pull: { contacts: contact._id } },
            { session }
          );
        }
      }

      // Handle CalendarActivity records
      const calendarActivities = await CalendarActivity.find({
        contacts: contact._id,
        organization: user.organization
      }).session(session);
      
      for (const calendarActivity of calendarActivities) {
        if (calendarActivity.contacts.length === 1) {
          // Contact is the only one in the array - delete the entire activity
          await CalendarActivity.deleteOne({ _id: calendarActivity._id }, { session });
        } else {
          // Multiple contacts - just remove this contact from the array
          await CalendarActivity.updateOne(
            { _id: calendarActivity._id },
            { $pull: { contacts: contact._id } },
            { session }
          );
        }
      }

      // Delete the contact
      await Contact.deleteOne({ _id: contact._id, organization: user.organization }, { session });

      res.status(200).json({
        success: true,
        data: {}
      });
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting contact';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Contact not found') statusCode = 404;
    
    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Add an email address to a contact
export const addContactEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { contactId } = req.params;
    const { address, category = 'work', isPrimary = false } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!address) {
      res.status(400).json({ success: false, message: 'Email address is required' });
      return;
    }

    // Find the contact and verify ownership
    const contact = await Contact.findOne({
      _id: contactId,
      organization: user.organization
    });

    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found' });
      return;
    }

    // Check if email already exists for this contact
    const emailExists = contact.emails.some(email => email.address === address.toLowerCase().trim());
    if (emailExists) {
      res.status(400).json({ success: false, message: 'Email address already exists for this contact' });
      return;
    }

    // If setting as primary, update existing primary email
    if (isPrimary) {
      contact.emails.forEach(email => {
        email.isPrimary = false;
      });
    }

    // Add the new email
    contact.emails.push({
      address: address.toLowerCase().trim(),
      category,
      isPrimary
    });

    await contact.save();

    res.status(201).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Add contact email error:', error);
    // Handle duplicate key error (email address already exists system-wide)
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      res.status(400).json({ success: false, message: 'Email address already exists in the system' });
      return;
    }
    res.status(500).json({ success: false, message: 'Error adding email address' });
  }
};

// Update a contact's email category
export const updateContactEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { contactId, emailId } = req.params;
    const { category } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!category) {
      res.status(400).json({ success: false, message: 'Email category is required' });
      return;
    }

    if (!['work', 'personal', 'other'].includes(category)) {
      res.status(400).json({ success: false, message: 'Invalid email category. Must be: work, personal, or other' });
      return;
    }

    // Find the contact and verify ownership
    const contact = await Contact.findOne({
      _id: contactId,
      organization: user.organization
    });

    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found' });
      return;
    }

    // Find the email by ID
    const emailToUpdate = contact.emails.find(email => email._id?.toString() === emailId);
    if (!emailToUpdate) {
      res.status(404).json({ success: false, message: 'Email not found' });
      return;
    }

    // Update the category
    emailToUpdate.category = category;

    await contact.save();

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Update contact email error:', error);
    res.status(500).json({ success: false, message: 'Error updating email category' });
  }
};

// Delete a contact's email
export const deleteContactEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { contactId, emailId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the contact and verify ownership
    const contact = await Contact.findOne({
      _id: contactId,
      organization: user.organization
    });

    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found' });
      return;
    }

    // Find the email by ID
    const emailToDelete = contact.emails.find(email => email._id?.toString() === emailId);
    if (!emailToDelete) {
      res.status(404).json({ success: false, message: 'Email not found' });
      return;
    }

    // Prevent deletion if this is the only email
    if (contact.emails.length === 1) {
      res.status(400).json({ success: false, message: 'Cannot delete the only email address for this contact' });
      return;
    }

    // If deleting the primary email, set another email as primary
    const wasPrimary = emailToDelete.isPrimary;
    
    // Remove the email from the array
    contact.emails = contact.emails.filter(email => email._id?.toString() !== emailId);

    // If we deleted the primary email, set the first remaining email as primary
    if (wasPrimary && contact.emails.length > 0) {
      contact.emails[0].isPrimary = true;
    }

    await contact.save();

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Delete contact email error:', error);
    res.status(500).json({ success: false, message: 'Error deleting email address' });
  }
};

// Set a contact's email as primary
export const setContactPrimaryEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { contactId, emailId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the contact and verify ownership
    const contact = await Contact.findOne({
      _id: contactId,
      organization: user.organization
    });

    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found' });
      return;
    }

    // Find the email by ID
    const emailToSetPrimary = contact.emails.find(email => email._id?.toString() === emailId);
    if (!emailToSetPrimary) {
      res.status(404).json({ success: false, message: 'Email not found' });
      return;
    }

    // Check if this email is already primary
    if (emailToSetPrimary.isPrimary) {
      res.status(400).json({ success: false, message: 'This email is already the primary email' });
      return;
    }

    // Set all emails to not primary
    contact.emails.forEach(email => {
      email.isPrimary = false;
    });

    // Set the specified email as primary
    emailToSetPrimary.isPrimary = true;

    await contact.save();

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Set contact primary email error:', error);
    res.status(500).json({ success: false, message: 'Error setting primary email' });
  }
};