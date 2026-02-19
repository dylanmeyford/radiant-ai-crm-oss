import { mastra } from '../mastra';
import Opportunity from '../models/Opportunity';
import Prospect from '../models/Prospect';
import mongoose from 'mongoose';

interface ResearchResult {
  businessSummary: string;
  keyDecisionMakers: string;
  timezone: string;
  location: string;
}

/**
 * Generate business research for an opportunity using the research agent
 */
export const researchOpportunityProspect = async (
  opportunityId: mongoose.Types.ObjectId
): Promise<void> => {
  const researchAgent = mastra.getAgent('researchAgent');
  try {
    console.log(`Starting opportunity research for opportunity: ${opportunityId}`);
    
    // Get the opportunity and its prospect
    const opportunity = await Opportunity.findById(opportunityId)
      .populate('prospect')
      .lean();
    
    if (!opportunity) {
      console.error(`Opportunity not found: ${opportunityId}`);
      return;
    }

    const prospect = opportunity.prospect as any;
    if (!prospect) {
      console.error(`No prospect found for opportunity: ${opportunityId}`);
      return;
    }

    // Extract domains for research
    const domains = prospect.domains || [];
    const website = prospect.website;
    
    // Create list of domains to research
    const researchTargets: string[] = [];
    
    if (website) {
      researchTargets.push(website);
    }
    
    // Add domains if they're not already included
    domains.forEach((domain: string) => {
      if (!researchTargets.includes(domain)) {
        researchTargets.push(domain);
      }
    });

    if (researchTargets.length === 0) {
      console.log(`No domains or website found for prospect ${prospect.name} - skipping research`);
      return;
    }

    console.log(`Researching domains for ${prospect.name}: ${researchTargets.join(', ')}`);

    // Create research prompt
    const domainsText = researchTargets.length === 1 
      ? `the domain "${researchTargets[0]}"` 
      : `the domains: ${researchTargets.map(d => `"${d}"`).join(', ')}`;

    const prompt = `
    Research the business associated with ${domainsText} and provide the following information:

    **Business Summary:**
    Provide a brief 2-3 sentence overview of what the business does, their main products/services, and their market position.

    **Key Decision Makers:**
    Identify the key decision makers and executives who would likely be involved in purchasing decisions for business software/services. Include their roles and titles (e.g., CEO, CTO, VP of Sales, etc.). Focus on roles that would be relevant for B2B sales.

    **Location & Timezone:**
    Determine the primary business location and timezone where this company operates. If they have multiple locations, focus on the headquarters or main operational hub.

    Please format your response clearly with these three sections, and keep the information concise but informative for a sales team preparing to engage with this prospect.
    Do not offer any additional advice or information, and do not ask what else you can do.
    `;

    const response = await researchAgent.generateLegacy([{ content: prompt, role: 'user' }], {
      providerOptions: {
        openai: {
          metadata: {
            opportunityId: opportunity._id.toString() || '',
            file: 'opportunity-research-service',
            agent: 'researchAgent',
            orgId: (opportunity.organization as any)?._id?.toString() || '',
          }
        }
      }
    });
    
    if (!response.text) {
      console.error(`No research results generated for opportunity: ${opportunityId}`);
      return;
    }

    // Update the opportunity description with research results
    await Opportunity.findByIdAndUpdate(
      opportunityId,
      { 
        description: response.text,
        lastUpdateTimestamp: new Date()
      },
      { new: true }
    );

    console.log(`Research completed and saved for opportunity: ${opportunityId}`);
    
  } catch (error) {
    console.error('Error in opportunity research:', error);
    // Don't throw the error to prevent blocking opportunity creation
  }
};

/**
 * Schedule asynchronous research for an opportunity
 * This allows the opportunity creation to complete quickly while research runs in background
 */
export const scheduleOpportunityResearch = (opportunityId: string): void => {
  console.log(`Scheduling research for opportunity: ${opportunityId}`);
  
  // Use setTimeout to run research asynchronously after a brief delay
  // This ensures the database transaction has committed
  setTimeout(() => {
    researchOpportunityProspect(new mongoose.Types.ObjectId(opportunityId))
      .catch((error) => {
        console.error(`Scheduled research failed for opportunity ${opportunityId}:`, error);
      });
  }, 1000); // 1 second delay to ensure transaction completion
};
