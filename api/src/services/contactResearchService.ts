import { ContactResearchResult, ContactResearchResultSchema } from '../mastra/agents/contactResearchAgent';
import { mastra } from '../mastra';
import Contact, { IContact, IContactResearch } from '../models/Contact';
import mongoose from 'mongoose';

/**
 * Research a contact using AI to gather professional intelligence
 */
export const researchContact = async (
  contactId: mongoose.Types.ObjectId | string
): Promise<IContactResearch | null> => {
  const contactResearchAgent = mastra.getAgent('contactResearchAgent');
  const basicAgent = mastra.getAgent('basicAgent');
  try {
    console.log(`[CONTACT-RESEARCH] Starting research for contact ID: ${contactId}`);
    
    // Validate the contactId format
    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      console.error(`[CONTACT-RESEARCH] Invalid ObjectId format: ${contactId}`);
      return null;
    }
    
    // Add retry logic to handle potential timing issues
    let contact = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!contact && retryCount < maxRetries) {
      if (retryCount > 0) {
        console.log(`[CONTACT-RESEARCH] Retry ${retryCount}/${maxRetries} for contact ID: ${contactId}`);
        // Wait a bit before retry to handle timing issues
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
      
      // Get the contact with prospect information
      contact = await Contact.findById(contactId).populate('prospect');
      retryCount++;
    }
    
    if (!contact) {
      console.error(`[CONTACT-RESEARCH] Contact not found after ${maxRetries} attempts: ${contactId}`);
      
      // Additional debugging - check if contact exists without populate
      const contactExists = await Contact.findById(contactId);
      if (contactExists) {
        console.error(`[CONTACT-RESEARCH] Contact exists but populate failed for: ${contactId}`);
        // Try without populate as fallback
        contact = contactExists;
      } else {
        console.error(`[CONTACT-RESEARCH] Contact does not exist in database: ${contactId}`);
        return null;
      }
    }
    
    console.log(`[CONTACT-RESEARCH] Found contact: ${contact.firstName} ${contact.lastName} (${contact._id})`);
    
    // Validate the contact has the required ObjectId type
    if (!contact._id) {
      console.error(`[CONTACT-RESEARCH] Contact missing _id field: ${contactId}`);
      return null;
    }
    
    // Skip research if already completed recently (within 30 days)
    if (contact.contactResearch?.researchedAt) {
      const daysSinceResearch = Math.floor(
        (Date.now() - contact.contactResearch.researchedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceResearch < 30) {
        console.log(`[CONTACT-RESEARCH] Skipping research for ${contact.firstName} ${contact.lastName} - researched ${daysSinceResearch} days ago`);
        return contact.contactResearch;
      }
    }
    
    // Build contact information for research
    const contactInfo = buildContactInfo(contact);
    if (!contactInfo.hasMinimalInfo) {
      console.log(`[CONTACT-RESEARCH] Insufficient information to research contact: ${contactId}`);
      return {
        personalSummary: 'Insufficient contact information for research',
        debug: {
          noInformationFound: true,
          searchQueries: [],
          informationSources: []
        },
        researchedAt: new Date()
      };
    }
    
    console.log(`[CONTACT-RESEARCH] Researching: ${contactInfo.name} at ${contactInfo.companyName}`);
    
    // Create research prompt
    const prompt = createResearchPrompt(contactInfo);
    
    // Execute research using the agent
    const response = await contactResearchAgent.generateLegacy(
      [{ content: prompt, role: 'user' }],
      {
        providerOptions: {
          openai: {
            metadata: {
              contactId: (contact as any)?._id?.toString() || '',
              file: 'contact-research-service',
              agent: 'contactResearchAgent',
              orgId: (contact?.organization as any)?._id?.toString() || '',
            }
          }
        }
      }
    );
    
    // Parse and validate the response
    let researchResult = response.text;

    const formatWebResponse = await basicAgent.generateLegacy([
      { content: `Format the following web search response into a JSON object: ${researchResult}`, role: 'user' },
    ],
    {
      output: ContactResearchResultSchema
    });

    
    // Create the research record
    const contactResearch: IContactResearch = {
      personalSummary: formatWebResponse.object.personalSummary,
      roleAtCompany: formatWebResponse.object.roleAtCompany,
      linkedInProfile: formatWebResponse.object.linkedInProfile || undefined,
      backgroundInfo: formatWebResponse.object.backgroundInfo,
      connectionOpportunities: formatWebResponse.object.connectionOpportunities,
      contactScore: formatWebResponse.object.contactScore,
      researchedAt: new Date(),
      debug: formatWebResponse.object.debug
    };
    
    // Save research to contact
    await Contact.findByIdAndUpdate(contactId, {
      contactResearch: contactResearch
    });
    
    console.log(`[CONTACT-RESEARCH] Successfully researched ${contactInfo.name} - Score: ${formatWebResponse.object.contactScore}, LinkedIn: ${formatWebResponse.object.linkedInProfile ? 'Found' : 'Not found'}`);
    
    return contactResearch;
    
  } catch (error) {
    console.error(`[CONTACT-RESEARCH] Error researching contact ${contactId}:`, error);
    
    // Save error state to contact
    try {
      await Contact.findByIdAndUpdate(contactId, {
        contactResearch: {
          personalSummary: 'Research failed due to technical error',
          debug: {
            noInformationFound: true,
            searchQueries: [],
            informationSources: []
          },
          researchedAt: new Date()
        }
      });
    } catch (saveError) {
      console.error(`[CONTACT-RESEARCH] Failed to save error state for contact ${contactId}:`, saveError);
    }
    
    return null;
  }
};

/**
 * Build contact information object for research
 */
function buildContactInfo(contact: IContact): {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  department?: string;
  companyName?: string;
  companyDomains?: string[];
  hasMinimalInfo: boolean;
} {
  const prospect = contact.prospect as any;
  const primaryEmail = contact.getPrimaryEmail();
  
  const firstName = contact.firstName?.trim();
  const lastName = contact.lastName?.trim();
  const name = `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown Contact';
  
  const hasMinimalInfo = !!(
    (firstName || lastName) && // Must have at least first or last name
    (primaryEmail || contact.title) && // Must have email or title
    prospect?.name // Must have company name
  );
  
  return {
    name,
    firstName,
    lastName,
    email: primaryEmail || undefined,
    title: contact.title,
    department: contact.department,
    companyName: prospect?.name,
    companyDomains: prospect?.domains,
    hasMinimalInfo
  };
}

/**
 * Create research prompt for the AI agent
 */
function createResearchPrompt(contactInfo: any): string {
  return `
Research this business contact for B2B sales intelligence using the web search preview tool:

**Contact Information:**
- Name: ${contactInfo.name}
- Email: ${contactInfo.email || 'Not provided'}
- Job Title: ${contactInfo.title || 'Not provided'}
- Department: ${contactInfo.department || 'Not provided'}
- Company: ${contactInfo.companyName || 'Not provided'}
- Company Domains: ${contactInfo.companyDomains?.join(', ') || 'Not provided'}

**Research Requirements:**
Please research this contact and provide a structured JSON response with the following information:

1. **personalSummary**: A brief 2-3 sentence summary of who this person is professionally
2. **roleAtCompany**: Their specific role and responsibilities at their current company
3. **linkedInProfile**: Their LinkedIn profile URL (search thoroughly - try multiple query combinations)
4. **backgroundInfo**: Professional background, education, previous roles, or notable achievements
5. **connectionOpportunities**: Array of potential conversation starters or connection points
6. **contactScore**: Score from 1-10 based on their seniority and decision-making authority
7. **debug**: Object with:
   - noInformationFound: true/false if meaningful information was found
   - searchQueries: array of search queries you attempted
   - informationSources: array of source types where you found information

**Search Strategy:**
- Try multiple search combinations with their name and company
- Look specifically for LinkedIn profiles
- Search for recent company news involving them
- Look for professional achievements, speaking engagements, or publications

**Output Format:**
Provide your response as valid JSON wrapped in \`\`\`json code blocks.

Focus on information that would help a B2B salesperson understand this contact's role, authority level, and potential conversation starters.
  `;
}

/**
 * Execute contact research for a new contact (called from middleware)
 */
export const executeContactResearch = async (
  contactId: mongoose.Types.ObjectId | string
): Promise<void> => {
  try {
    console.log(`[CONTACT-RESEARCH] Initiating background research for contact: ${contactId}`);
    
    // Add a small delay to ensure database transaction is fully committed
    // This helps avoid race conditions where the research runs before the contact is fully saved
    setTimeout(async () => {
      try {
        const result = await researchContact(contactId);
        if (result) {
          const debugInfo = result.debug?.noInformationFound ? 'No info found' : 'Research completed';
          console.log(`[CONTACT-RESEARCH] Background research completed for ${contactId}: ${debugInfo}`);
        } else {
          console.log(`[CONTACT-RESEARCH] Background research failed for ${contactId}`);
        }
      } catch (error) {
        console.error(`[CONTACT-RESEARCH] Background research error for ${contactId}:`, error);
      }
    }, 2000); // 2 second delay to ensure database consistency
    
    console.log(`[CONTACT-RESEARCH] Research task initiated for contact: ${contactId} - running in background`);
  } catch (error) {
    console.error(`[CONTACT-RESEARCH] Error initiating contact research for ${contactId}:`, error);
    // Don't throw here since this is meant to be non-blocking
  }
};
