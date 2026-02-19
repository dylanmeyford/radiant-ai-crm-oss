import mongoose from 'mongoose';
import Activity, { ActivityType } from '../models/Activity';
import { IContact } from '../models/Contact';
import { IDigitalSalesRoom } from '../models/DigitalSalesRoom';
import Opportunity from '../models/Opportunity';
import Contact from '../models/Contact';
import Prospect from '../models/Prospect';
import { IntelligenceProcessor } from './AI/personIntelligence/intelligenceProcessor';
import { isExcludedDomain } from '../utils/domain';

// Helper function to extract name from email address
function extractNameFromEmail(email: string): { firstName: string; lastName: string } {
  try {
    // Get the part before the @ symbol
    const localPart = email.split('@')[0];
    
    // Common patterns to try
    const patterns = [
      // firstname.lastname, firstname_lastname, firstname-lastname
      /^([a-zA-Z]+)[._-]([a-zA-Z]+)$/,
      // firstnamelastname (try to split on capital letters)
      /^([a-z]+)([A-Z][a-z]+)$/,
      // flastname (first initial + last name)
      /^([a-zA-Z])([a-zA-Z]{2,})$/
    ];
    
    for (const pattern of patterns) {
      const match = localPart.match(pattern);
      if (match) {
        return {
          firstName: match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(),
          lastName: match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase()
        };
      }
    }
    
    // If no pattern matches, try splitting on common separators
    const separators = ['.', '_', '-'];
    for (const separator of separators) {
      if (localPart.includes(separator)) {
        const parts = localPart.split(separator);
        if (parts.length >= 2) {
          return {
            firstName: parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase(),
            lastName: parts.slice(1).join(' ').charAt(0).toUpperCase() + parts.slice(1).join(' ').slice(1).toLowerCase()
          };
        }
      }
    }
    
    // Last resort: use the whole local part as first name
    return {
      firstName: localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase(),
      lastName: ''
    };
  } catch (error) {
    console.warn(`Failed to extract name from email ${email}:`, error);
    return { firstName: '', lastName: '' };
  }
}

export class DigitalSalesRoomService {

  /**
   * Creates an Activity record for a DSR interaction.
   * This centralizes activity creation for various DSR events.
   */
  private static async createDsrActivity(
    contact: IContact,
    salesRoom: IDigitalSalesRoom,
    type: ActivityType,
    summary: string,
    details: Record<string, any>
  ): Promise<void> {
    const opportunity = await Opportunity.findById(salesRoom.opportunity);
    if (!opportunity) {
      console.error(`Could not find opportunity ${salesRoom.opportunity} for DSR activity.`);
      return;
    }

    const newActivity = await Activity.create({
      type: type,
      summary: summary,
      title: summary,
      status: 'completed',
      date: new Date(),
      contacts: [contact._id],
      prospect: opportunity.prospect,
      organization: salesRoom.organization,
      createdBy: salesRoom.createdBy,
      opportunity: salesRoom.opportunity,
      details: details,
      source: 'DigitalSalesRoom'
    });

    if (newActivity) {
      contact.activities.push(newActivity._id as mongoose.Types.ObjectId);
      await contact.save();

      // Process the activity through intelligence system
      IntelligenceProcessor.processActivity(newActivity);
    }
  }

  /**
   * Finds an existing contact or creates a new one for the given email if it belongs to the opportunity's prospect.
   * Returns null if the email doesn't match any known domains or if contact creation fails.
   */
  private static async findOrCreateContact(
    visitorEmail: string,
    salesRoom: IDigitalSalesRoom
  ): Promise<IContact | null> {
    // First, try to find an existing contact
    let contact = await Contact.findOne({ 
      'emails.address': visitorEmail,
      organization: salesRoom.organization 
    });
    
    if (contact) {
      return contact;
    }

    // If no contact found, try to auto-create one
    console.log(`No existing contact found for ${visitorEmail}, attempting auto-creation...`);

    try {
      // Get the opportunity to find the associated prospect
      const opportunity = await Opportunity.findById(salesRoom.opportunity).populate('prospect');
      if (!opportunity || !opportunity.prospect) {
        console.log(`No opportunity or prospect found for sales room ${salesRoom._id}`);
        return null;
      }

      // Get the prospect (it should be populated from the query above)
      const prospect = opportunity.prospect as any;

      // Extract domain from email
      const emailDomain = visitorEmail.split('@')[1];
      if (!emailDomain) {
        console.log(`Invalid email format: ${visitorEmail}`);
        return null;
      }

      // Common domains to exclude from auto-creation
      const shouldExclude = await isExcludedDomain(emailDomain, {
        organizationId: salesRoom.organization,
        prospectId: prospect?._id,
        prospectName: prospect?.name,
        prospectIndustry: prospect?.industry,
        existingDomains: prospect?.domains,
        opportunityId: salesRoom.opportunity,
      });

      if (shouldExclude) {
        console.log(`Skipping auto-creation for common domain: ${emailDomain}`);
        return null;
      }
      
      // Check if the email domain matches any of the prospect's domains
      if (!prospect.domains || !prospect.domains.includes(emailDomain)) {
        console.log(`Email domain ${emailDomain} does not match prospect domains for ${visitorEmail}`);
        return null;
      }

      console.log(`Email domain ${emailDomain} matches prospect ${prospect.name}, checking for existing contact by name...`);

      // Extract name from email
      const { firstName, lastName } = extractNameFromEmail(visitorEmail);
      
      // If we extracted names, check if contact exists by name
      if (firstName && lastName) {
        const existingContactByName = await Contact.findOne({
          firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
          lastName: { $regex: new RegExp(`^${lastName}$`, 'i') },
          organization: salesRoom.organization
        });
        
        if (existingContactByName) {
          console.log(`Found existing contact with same name: ${firstName} ${lastName} (${existingContactByName._id}), adding email`);
          
          // Check if this email already exists for this contact
          const emailExists = existingContactByName.emails.some(e => e.address === visitorEmail);
          if (!emailExists) {
            // Add new email to existing contact
            await Contact.findByIdAndUpdate(
              existingContactByName._id,
              { 
                $push: { 
                  emails: {
                    address: visitorEmail,
                    category: 'work',
                    isPrimary: false // Don't make merged emails primary
                  }
                }
              }
            );
            
            console.log(`Added email ${visitorEmail} to existing contact ${firstName} ${lastName}`);
          }
          
          // Ensure the contact is linked to this opportunity if not already
          if (!existingContactByName.opportunities.includes(opportunity._id)) {
            await Contact.findByIdAndUpdate(
              existingContactByName._id,
              { $addToSet: { opportunities: opportunity._id } }
            );
            
            // Also add contact to opportunity if not already there
            await Opportunity.findByIdAndUpdate(
              opportunity._id,
              { $addToSet: { contacts: existingContactByName._id } }
            );
            
            console.log(`Linked existing contact ${firstName} ${lastName} to opportunity ${opportunity.name}`);
          }
          
          return existingContactByName;
        }
      }

      console.log(`Creating new contact for ${visitorEmail}...`);

      // Create a new contact
      const newContact = new Contact({
        emails: [{ address: visitorEmail, category: 'work', isPrimary: true }],
        firstName: firstName || '', // Use extracted name or empty string
        lastName: lastName || '',
        prospect: prospect._id,
        organization: salesRoom.organization,
        createdBy: salesRoom.createdBy,
        opportunities: [opportunity._id]
      });

      const savedContact = await newContact.save();

      // Update the prospect with the new contact
      await Prospect.findByIdAndUpdate(
        prospect._id,
        { $addToSet: { contacts: savedContact._id } }
      );

      // Update the opportunity with the new contact
      await Opportunity.findByIdAndUpdate(
        opportunity._id,
        { $addToSet: { contacts: savedContact._id } }
      );

      console.log(`Successfully created new contact ${savedContact._id} for ${visitorEmail} on prospect ${prospect.name}`);
      return savedContact;

    } catch (error) {
      console.error(`Error auto-creating contact for ${visitorEmail}:`, error);
      return null;
    }
  }

  /**
   * Records when a visitor accesses the sales room.
   */
  public static async recordVisitorAccess(
    visitorEmail: string,
    salesRoom: IDigitalSalesRoom
  ): Promise<void> {
    const contact = await this.findOrCreateContact(visitorEmail, salesRoom);
    if (!contact) {
      console.log(`No contact found or created for ${visitorEmail}, skipping DSR access activity`);
      return;
    }

    await this.createDsrActivity(
      contact,
      salesRoom,
      ActivityType.DSR_ACCESS,
      `${contact.firstName || visitorEmail} accessed the sales room: "${salesRoom.name}".`,
      { salesRoomId: salesRoom._id }
    );
  }

  /**
   * Records when a contact views a document in the DSR.
   * This is intended to be called after the interaction is complete (e.g., user closes the viewer).
   */
  public static async recordDocumentInteraction(
    visitorEmail: string,
    salesRoom: IDigitalSalesRoom,
    documentName: string,
    durationMs: number,
    pageViews?: any[]
  ): Promise<void> {
    const contact = await this.findOrCreateContact(visitorEmail, salesRoom);
    if (!contact) {
      console.log(`No contact found or created for ${visitorEmail}, skipping DSR document interaction activity`);
      return;
    }

    const durationSeconds = Math.round(durationMs / 1000);
    const pageCount = pageViews ? pageViews.length : 0;
    
    let summary = `${contact.firstName || visitorEmail} viewed the document "${documentName}" for ${durationSeconds} seconds.`;
    if (pageCount > 0) {
      summary += ` They viewed ${pageCount} pages.`
    }

    await this.createDsrActivity(
      contact,
      salesRoom,
      ActivityType.DSR_DOCUMENT_VIEW,
      summary,
      {
        salesRoomId: salesRoom._id,
        documentName,
        durationMs,
        pageViews
      }
    );
  }

  /**
   * Records when a contact clicks a link in the DSR.
   */
  public static async recordLinkClick(
    visitorEmail: string,
    salesRoom: IDigitalSalesRoom,
    linkName: string,
    linkUrl: string
  ): Promise<void> {
    const contact = await this.findOrCreateContact(visitorEmail, salesRoom);
    if (!contact) {
      console.log(`No contact found or created for ${visitorEmail}, skipping DSR link click activity`);
      return;
    }

    await this.createDsrActivity(
      contact,
      salesRoom,
      ActivityType.DSR_LINK_CLICK,
      `${contact.firstName || visitorEmail} clicked the link "${linkName}" (${linkUrl}).`,
      {
        salesRoomId: salesRoom._id,
        linkName,
        linkUrl
      }
    );
  }
} 