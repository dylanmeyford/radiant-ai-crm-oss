import { mastra } from '../mastra';
import SalesPlaybook, { ContentType } from '../models/SalesPlaybook';
import mongoose from 'mongoose';

/**
 * Generate a detailed business overview using the research agent
 */
export const generateBusinessOverview = async (
  domain: string,
  organizationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
): Promise<void> => {
  const researchAgent = mastra.getAgent('researchAgent');
  try {
    console.log(`Starting business overview research for domain: ${domain}`);
    
    const prompt = `
    You work for ${domain}.

    Research our company at domain "${domain}" and create a detailed overview of the business.
    
    Please provide a comprehensive analysis that includes:
    - Company background and history
    - Business model and revenue streams
    - Core products and services offered
    - Market position and competitive landscape
    - Key differentiators and value propositions
    - Company size, structure, and key personnel (if available)
    
    The purpose of this research is to help a new staff member learn about our company.
    Do not offer any additional advice or information, and do not ask what else you can do.
    `;

    const response = await researchAgent.generateLegacy([{ content: prompt, role: 'user' }], {
      providerOptions: {
        openai: {
          metadata: {
            file: 'business-overview-research-service',
            agent: 'researchAgent',
            orgId: organizationId.toString() || '',
          }
        }
      }
    });
    
    // Save the research result to sales playbook
    await SalesPlaybook.create({
      type: ContentType.BUSINESS_INFORMATION,
      title: 'Overview of Business',
      content: response.text,
      contentSummary: `AI-generated business overview for ${domain}`,
      tags: ['business-overview', 'research', 'company-intelligence'],
      keywords: [domain, 'business analysis', 'company overview'],
      useCase: 'Sales preparation and prospect understanding',
      organization: organizationId,
      createdBy: userId,
    });

    console.log(`Business overview research completed and saved for domain: ${domain}`);
  } catch (error) {
    console.error('Error generating business overview:', error);
    throw error;
  }
};

/**
 * Generate customer and buying behavior analysis using the research agent
 */
export const generateCustomerBuyingBehavior = async (
  domain: string,
  organizationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
): Promise<void> => {
  const researchAgent = mastra.getAgent('researchAgent');
  try {
    console.log(`Starting customer buying behavior research for domain: ${domain}`);
    
    const prompt = `
    You work for ${domain}.
    We need to better understand our customers buying behaviour.

    <task>
    Research our business"${domain}", and do the following:
    1. Determine who our target customers are, and 
    2. Generate a report on who our target customers are, and what their buying behaviors will be.
    </task>
    
    <instructions>
    Please provide a detailed analysis of our target customers and their buying behaviors, including:
    
    **Target Customers & Demographics:**
    - Primary target market segments
    - Customer company sizes (enterprise, mid-market, SMB)
    - Industries they primarily serve
    - Geographic markets they focus on
    
    **Buyer Personas & Job Titles in Target Market:**
    - Key decision makers and their typical job titles
    - Influencers in the buying process
    - End users of their products/services
    - Budget holders and approval authorities
    
    **Buying Behaviors & Processes:**
    - Typical buying cycle length for the target customers
    - Decision-making process + complexity
    - Preferred communication channels and touchpoints
    - Seasonality or timing factors in purchasing decisions
    </instructions>.
    
    Format the response as a report a new sales rep at our company could read to better understand who we are selling to.
    `;

    const response = await researchAgent.generateLegacy([{ content: prompt, role: 'user' }], {
      providerOptions: {
        openai: {
          metadata: {
            file: 'customer-buying-behavior-research-service',
            agent: 'researchAgent',
            orgId: organizationId.toString() || '',
          }
        }
      }
    });
    
    // Save the research result to sales playbook
    await SalesPlaybook.create({
      type: ContentType.BUSINESS_INFORMATION,
      title: 'Customers and Buying Behaviour',
      content: response.text,
      contentSummary: `AI-generated customer and buying behavior analysis for ${domain}`,
      tags: ['customer-analysis', 'buying-behavior', 'research', 'sales-intelligence'],
      keywords: [domain, 'customer analysis', 'buying behavior', 'buyer personas'],
      useCase: 'Sales strategy and customer targeting',
      organization: organizationId,
      createdBy: userId,
    });

    console.log(`Customer buying behavior research completed and saved for domain: ${domain}`);
  } catch (error) {
    console.error('Error generating customer buying behavior analysis:', error);
    throw error;
  }
};

/**
 * Execute both research tasks asynchronously for a new signup
 */
export const executeSignupResearch = async (
  domain: string,
  organizationId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
): Promise<void> => {
  try {
    console.log(`Starting async research for new signup - domain: ${domain}`);
    
    // Execute both research tasks in parallel without blocking
    const researchPromises = [
      generateBusinessOverview(domain, organizationId, userId),
      generateCustomerBuyingBehavior(domain, organizationId, userId)
    ];
    
    // Don't await these - let them run in background
    Promise.allSettled(researchPromises).then((results) => {
      const [businessResult, customerResult] = results;
      
      if (businessResult.status === 'rejected') {
        console.error('Business overview research failed:', businessResult.reason);
      } else {
        console.log('Business overview research completed successfully');
      }
      
      if (customerResult.status === 'rejected') {
        console.error('Customer buying behavior research failed:', customerResult.reason);
      } else {
        console.log('Customer buying behavior research completed successfully');
      }
      
      console.log(`All research tasks completed for domain: ${domain}`);
    }).catch((error) => {
      console.error('Unexpected error in research promise handling:', error);
    });
    
    console.log(`Research tasks initiated for domain: ${domain} - running in background`);
  } catch (error) {
    console.error('Error initiating signup research:', error);
    // Don't throw here since this is meant to be non-blocking
  }
};
