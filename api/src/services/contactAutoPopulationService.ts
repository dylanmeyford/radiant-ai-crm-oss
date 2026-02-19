/**
 * Contact Auto Population Service
 * Handles automatic contact search and population from Nylas based on prospect domains
 */

import mongoose from 'mongoose';
import Nylas from 'nylas';
import Prospect from '../models/Prospect';
import Contact from '../models/Contact';
import Opportunity from '../models/Opportunity';
import NylasConnection from '../models/NylasConnection';
import { validateDomains, normalizeDomain } from '../utils/domain';

// Helper function to extract domain from email address
function extractDomainFromEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
  const match = email.match(emailRegex);
  return match ? match[1].toLowerCase() : null;
}

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
    console.warn(`[CONTACT-AUTO-POPULATION] Failed to extract name from email ${email}:`, error);
    return { firstName: '', lastName: '' };
  }
}

// Helper function to parse name from Nylas contact
function parseContactName(nylasContact: any): { firstName: string; lastName: string } {
  const firstName = nylasContact.given_name || nylasContact.givenName || '';
  const lastName = nylasContact.surname || '';
  
  // If no structured name, try to parse from display name
  if (!firstName && !lastName && nylasContact.name) {
    const nameParts = nylasContact.name.trim().split(' ');
    return {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || ''
    };
  }
  
  // If we still don't have names, try to extract from email address
  if (!firstName && !lastName && nylasContact.emails && nylasContact.emails.length > 0) {
    const primaryEmail = nylasContact.emails[0].email;
    if (primaryEmail) {
      console.log(`[CONTACT-AUTO-POPULATION] No structured name found, extracting from email: ${primaryEmail}`);
      return extractNameFromEmail(primaryEmail);
    }
  }
  
  return { firstName, lastName };
}

async function linkContactToProspectAndOpportunities(
  contactId: mongoose.Types.ObjectId | string | unknown,
  prospectId: mongoose.Types.ObjectId | string | unknown,
  organizationId: mongoose.Types.ObjectId | string | unknown
): Promise<void> {
  const normalizedContactId = normalizeObjectId(contactId, 'contactId');
  const normalizedProspectId = normalizeObjectId(prospectId, 'prospectId');
  const normalizedOrganizationId = normalizeObjectId(organizationId, 'organizationId');

  await Prospect.findOneAndUpdate(
    { _id: normalizedProspectId, organization: normalizedOrganizationId },
    { $addToSet: { contacts: normalizedContactId } }
  );

  const opportunities = await Opportunity.find(
    { prospect: normalizedProspectId, organization: normalizedOrganizationId },
    { _id: 1 }
  );

  if (opportunities.length === 0) {
    return;
  }

  const opportunityIds = opportunities.map(opportunity => opportunity._id);
  await Opportunity.updateMany(
    { _id: { $in: opportunityIds }, organization: normalizedOrganizationId },
    { $addToSet: { contacts: normalizedContactId } }
  );

  await Contact.findByIdAndUpdate(
    normalizedContactId,
    { $addToSet: { opportunities: { $each: opportunityIds } } }
  );
}

function normalizeObjectId(
  value: mongoose.Types.ObjectId | string | unknown,
  label: string
): mongoose.Types.ObjectId {
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  const asString = typeof value === 'string' ? value : String(value ?? '');
  if (!mongoose.Types.ObjectId.isValid(asString)) {
    throw new Error(`[CONTACT-AUTO-POPULATION] Invalid ${label}: ${asString}`);
  }

  return new mongoose.Types.ObjectId(asString);
}

/**
 * Search and populate contacts for a prospect from Nylas
 * @param prospectId - The ID of the prospect to search contacts for
 * @param additionalNylasConnections - Optional additional Nylas connections to include (useful for uncommitted connections)
 */
export async function searchAndPopulateContacts(
  prospectId: string, 
  additionalNylasConnections?: any[]
): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log(`[CONTACT-AUTO-POPULATION] Starting contact search for prospect ${prospectId}`);
    
    // Initialize Nylas client
    const nylas = new Nylas({
      apiKey: process.env.NYLAS_API_KEY!,
      apiUri: process.env.NYLAS_API_URI,
    });
    
    // Validate prospect ID
    if (!prospectId || !mongoose.Types.ObjectId.isValid(prospectId)) {
      throw new Error(`Invalid prospect ID: ${prospectId}`);
    }
    
    // Get the prospect
    const prospect = await Prospect.findById(prospectId).populate('organization');
    if (!prospect) {
      console.warn(`[CONTACT-AUTO-POPULATION] Prospect ${prospectId} not found`);
      return;
    }
    
    const organizationId = (prospect as any).organization?._id ?? prospect.organization;
    const prospectInfo = `${prospect.name} (${prospect._id})`;
    console.log(`[CONTACT-AUTO-POPULATION] Found prospect: ${prospectInfo}`);
    
    // Validate prospect has domains
    if (!prospect.domains || prospect.domains.length === 0) {
      console.warn(`[CONTACT-AUTO-POPULATION] Prospect ${prospectInfo} has no domains to search`);
      return;
    }
    
    // Filter out public domains using AI-aware validation
    const validationResults = await validateDomains(prospect.domains, {
      organizationId: prospect.organization,
      organizationName: (prospect as any).organization?.name,
      organizationIndustry: (prospect as any).organization?.industry,
      prospectId: prospect._id,
      prospectName: prospect.name,
      prospectIndustry: prospect.industry,
      existingDomains: prospect.domains,
    });

    const businessDomains = prospect.domains.filter(domain => {
      if (!domain || typeof domain !== 'string') return false;
      const decision = validationResults.get(normalizeDomain(domain));
      return decision?.shouldInclude;
    });
    
    if (businessDomains.length === 0) {
      console.warn(`[CONTACT-AUTO-POPULATION] Prospect ${prospectInfo} has no business domains after filtering public domains`);
      return;
    }
    
    console.log(`[CONTACT-AUTO-POPULATION] Searching ${businessDomains.length} business domains: ${businessDomains.join(', ')}`);
    
    // Get all Nylas connections for the organization
    const existingNylasConnections = await NylasConnection.find({ 
      organization: prospect.organization 
    }).populate('user');
    
    // Combine existing connections with any additional connections provided
    const nylasConnections = [...existingNylasConnections];
    if (additionalNylasConnections && additionalNylasConnections.length > 0) {
      nylasConnections.push(...additionalNylasConnections);
      console.log(`[CONTACT-AUTO-POPULATION] Added ${additionalNylasConnections.length} additional Nylas connection(s)`);
    }
    
    if (nylasConnections.length === 0) {
      console.warn(`[CONTACT-AUTO-POPULATION] No Nylas connections found for organization ${prospect.organization}`);
      return;
    }
    
    console.log(`[CONTACT-AUTO-POPULATION] Found ${nylasConnections.length} Nylas connection(s) for organization`);
    
    let totalContactsFound = 0;
    let totalContactsCreated = 0;
    let totalErrors = 0;
    
    // Search contacts across all domains and grant IDs
    for (const domain of businessDomains) {
      console.log(`[CONTACT-AUTO-POPULATION] Searching domain: ${domain}`);
      
      for (const connection of nylasConnections) {
        if (!connection.grantId) {
          console.warn(`[CONTACT-AUTO-POPULATION] Nylas connection ${connection._id} has no grantId`);
          continue;
        }
        
        try {
          console.log(`[CONTACT-AUTO-POPULATION] Searching domain ${domain} using grant ${connection.grantId}`);
          
          // Search Nylas contacts for this domain
          const contactsResponse = await nylas.contacts.list({
            identifier: connection.grantId,
            queryParams: {
              source: 'inbox',
              email: domain,
              select: 'emails,given_name,surname'
            }
          });
          
          if (!contactsResponse.data || contactsResponse.data.length === 0) {
            console.log(`[CONTACT-AUTO-POPULATION] No contacts found for domain ${domain} using grant ${connection.grantId}`);
            continue;
          }
          
          console.log(`[CONTACT-AUTO-POPULATION] Found ${contactsResponse.data.length} contacts for domain ${domain}`);
          totalContactsFound += contactsResponse.data.length;
          
          // Process each contact
          for (const nylasContact of contactsResponse.data) {
            try {
              // Validate contact has emails
              if (!nylasContact.emails || nylasContact.emails.length === 0) {
                console.warn(`[CONTACT-AUTO-POPULATION] Nylas contact ${nylasContact.id} has no emails, skipping`);
                continue;
              }
              
              // Filter emails that match our target domain
              const domainEmails = nylasContact.emails.filter((email: any) => {
                if (!email.email) return false;
                const emailDomain = extractDomainFromEmail(email.email);
                return emailDomain === domain;
              });
              
              if (domainEmails.length === 0) {
                console.log(`[CONTACT-AUTO-POPULATION] Nylas contact ${nylasContact.id} has no emails matching domain ${domain}, skipping`);
                continue;
              }
              
              // Parse contact name
              const { firstName, lastName } = parseContactName(nylasContact);
              console.log(`[CONTACT-AUTO-POPULATION] Parsed contact name: ${firstName} ${lastName}`);
              
              // Check if contact already exists in our database by email
              const existingEmailAddresses = domainEmails.map((email: any) => email.email);
              let existingContact = await Contact.findOne({
                'emails.address': { $in: existingEmailAddresses },
                organization: organizationId
              });
              
              if (existingContact) {
                console.log(`[CONTACT-AUTO-POPULATION] Contact with email(s) ${existingEmailAddresses.join(', ')} already exists, skipping`);
                await linkContactToProspectAndOpportunities(existingContact._id, prospect._id, organizationId);
                continue;
              }
              
              // If no match by email, check if contact exists by name (for contacts with multiple emails)
              if (!existingContact && firstName && lastName) {
                existingContact = await Contact.findOne({
                  firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
                  lastName: { $regex: new RegExp(`^${lastName}$`, 'i') },
                  organization: organizationId
                });
                
                if (existingContact) {
                  console.log(`[CONTACT-AUTO-POPULATION] Found existing contact with same name: ${firstName} ${lastName} (${existingContact._id}), merging emails`);
                  
                  // Create contact emails array for the new emails
                  const newContactEmails = domainEmails.map((email: any) => ({
                    address: email.email,
                    category: email.type || 'work',
                    isPrimary: false // Don't make merged emails primary
                  }));
                  
                  // Filter out emails that already exist
                  const existingEmailAddresses = existingContact.emails.map(e => e.address);
                  const emailsToAdd = newContactEmails.filter(newEmail => 
                    !existingEmailAddresses.includes(newEmail.address)
                  );
                  
                  if (emailsToAdd.length > 0) {
                    // Use document save to ensure Mongoose change detection hooks (isModified) run
                    existingContact.emails.push(...emailsToAdd);
                    await existingContact.save();
                    
                    console.log(`[CONTACT-AUTO-POPULATION] Added ${emailsToAdd.length} new email(s) to existing contact: ${emailsToAdd.map(e => e.address).join(', ')}`);
                    totalContactsCreated++; // Count as a successful update
                  } else {
                    console.log(`[CONTACT-AUTO-POPULATION] No new emails to add to existing contact ${firstName} ${lastName}`);
                  }
                  
                  await linkContactToProspectAndOpportunities(existingContact._id, prospect._id, organizationId);
                  continue; // Skip creating new contact
                }
              }
              
              // Create contact emails array
              const contactEmails = domainEmails.map((email: any, index: number) => ({
                address: email.email,
                category: email.type || 'work',
                isPrimary: index === 0 // First email is primary
              }));
              
              // Create new contact
              const newContact = new Contact({
                firstName: firstName || undefined,
                lastName: lastName || undefined,
                emails: contactEmails,
                title: (nylasContact as any).job_title || (nylasContact as any).jobTitle || undefined,
                department: undefined, // Nylas doesn't provide department info
                role: (nylasContact as any).job_title || (nylasContact as any).jobTitle || undefined,
                phone: (nylasContact as any).phone_numbers?.[0]?.number || undefined,
                prospect: prospect._id,
                organization: organizationId,
                isPrimary: false
              });
              
              let savedContact: typeof newContact | null = null;

              try {
                savedContact = await newContact.save();
                console.log(`[CONTACT-AUTO-POPULATION] Created contact: ${firstName} ${lastName} (${savedContact._id}) with emails: ${existingEmailAddresses.join(', ')}`);
                totalContactsCreated++;
              } catch (createError: any) {
                if (createError.code === 11000) {
                  console.log(`[CONTACT-AUTO-POPULATION] Contact with email(s) ${existingEmailAddresses.join(', ')} already exists (race condition), finding existing...`);
                  savedContact = await Contact.findOne({
                    organization: organizationId,
                    'emails.address': { $in: existingEmailAddresses.map(email => email.toLowerCase()) }
                  });
                  if (savedContact) {
                    console.log(`[CONTACT-AUTO-POPULATION] Found existing contact ${savedContact._id} for emails ${existingEmailAddresses.join(', ')}`);
                  } else {
                    console.error(`[CONTACT-AUTO-POPULATION] Duplicate key error but contact not found for emails ${existingEmailAddresses.join(', ')}`);
                  }
                } else {
                  throw createError;
                }
              }

              if (savedContact) {
                await linkContactToProspectAndOpportunities(savedContact._id, prospect._id, organizationId);
              }
              
            } catch (contactError: unknown) {
              totalErrors++;
              const errorMessage = contactError instanceof Error ? contactError.message : 'Unknown error';
              console.error(`[CONTACT-AUTO-POPULATION] Error processing Nylas contact ${nylasContact.id}: ${errorMessage}`);
              // Continue with other contacts
            }
          }
          
        } catch (grantError: unknown) {
          totalErrors++;
          const errorMessage = grantError instanceof Error ? grantError.message : 'Unknown error';
          console.error(`[CONTACT-AUTO-POPULATION] Error searching domain ${domain} with grant ${connection.grantId}: ${errorMessage}`);
          // Continue with other grants/domains
        }
      }
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[CONTACT-AUTO-POPULATION] Completed contact search for prospect ${prospectInfo} in ${processingTime}ms`);
    console.log(`[CONTACT-AUTO-POPULATION] Results - Found: ${totalContactsFound}, Created: ${totalContactsCreated}, Errors: ${totalErrors}`);
    
  } catch (error: unknown) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    console.error(`[CONTACT-AUTO-POPULATION] Fatal error for prospect ${prospectId} after ${processingTime}ms:`);
    console.error(`[CONTACT-AUTO-POPULATION] Error message: ${errorMessage}`);
    console.error(`[CONTACT-AUTO-POPULATION] Error stack: ${errorStack}`);
    
    // Re-throw error so middleware can handle it appropriately
    throw error;
  }
} 