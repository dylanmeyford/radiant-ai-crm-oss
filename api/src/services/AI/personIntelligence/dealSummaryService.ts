import mongoose from 'mongoose';
import Contact, { IContact } from '../../../models/Contact';
import Opportunity, { IOpportunity } from '../../../models/Opportunity';
import { mastra } from '../../../mastra';
import { DealAggregationService } from './dealAggregationService';
import { IOpportunityIntelligence } from '../../../types/contactIntelligence.types';
import chalk from 'chalk';
import { z } from 'zod';

// Define the return type for deal summary
export interface ProposedDealSummary {
  opportunityId: mongoose.Types.ObjectId;
  summary: string;
  generatedAt: Date;
}

export interface DealSummaryResult {
  proposedDealSummary: ProposedDealSummary | null;
}

// Zod schema for validating deal summary agent response
const DealSummaryResponseSchema = z.object({
  summary: z.string().min(1, "Summary cannot be empty")
});

export class DealSummaryService {
  /**
   * Generates a deal summary using in-memory data without database operations.
   * @param opportunity The opportunity document (in-memory)
   * @param contacts Array of contact documents with their intelligence data
   */
  public static async generateDealSummary(
    opportunity: IOpportunity,
    contacts: Array<{ contact: IContact; intelligence: IOpportunityIntelligence }>
  ): Promise<DealSummaryResult> {
    console.log(chalk.blue.bold(`    [+] Generating deal summary for opportunity ${opportunity._id} using in-memory data...`));
    const dealSummaryAgent = mastra.getAgent('dealSummaryAgent');
    
    console.log(chalk.cyan(`    -> Calculating deal temperature and momentum from in-memory data...`));
    const temperature = DealAggregationService.calculateDealTemperatureFromMemory(contacts, opportunity._id as mongoose.Types.ObjectId);
    const momentum = DealAggregationService.calculateDealMomentumFromMemory(contacts, opportunity._id as mongoose.Types.ObjectId, new Date());
    
    console.log(chalk.cyan(`    -> Building contacts intelligence summary from in-memory data...`));
    let contactsSummary = '';
    for (const { contact, intelligence } of contacts) {
      const latestRole = [...intelligence.roleAssignments].sort((a,b) => b.assignedAt.getTime() - a.assignedAt.getTime())[0]?.role || 'N/A';
      contactsSummary += `
          - Contact: ${contact.firstName} ${contact.lastName}
            Role: ${contact.contactResearch?.roleAtCompany}
            Deal Role: ${latestRole}
            Engagement Score: ${intelligence.engagementScore}
            Relationship Story: ${intelligence.relationshipStory || 'Not generated yet.'}
            Contact Research: ${contact.contactResearch ? JSON.stringify(contact.contactResearch.personalSummary) : 'No contact research available.'}
        `;
    }

    console.log(chalk.cyan(`    -> Constructing deal summary prompt...`));
    const prompt = this.constructPrompt(opportunity, temperature, momentum, contactsSummary);
    
    console.log(chalk.cyan(`    -> Invoking deal summary agent...`));
    const result = await dealSummaryAgent.generateLegacy([{ content: prompt, role: 'user' }], {
      providerOptions: {
        openai: {
          metadata: {
            opportunityId: (opportunity as any)?._id?.toString() || '',
            file: 'deal-summary-service',
            agent: 'dealSummaryAgent',
            orgId: (opportunity?.organization as any)?._id?.toString() || '',
          }
        }
      }
    });
    console.log(chalk.gray(`    -> Deal Summary Agent Response:`, result.text));
    
    try {
      const rawData = JSON.parse(result.text);
      const validationResult = DealSummaryResponseSchema.safeParse(rawData);
      
      if (!validationResult.success) {
        console.error(chalk.red(`    [!] Invalid deal summary response format:`, validationResult.error.issues));
        throw new Error(`Deal summary validation failed: ${validationResult.error.issues.map(i => i.message).join(', ')}`);
      }
      
      const { summary } = validationResult.data;
      console.log(chalk.green(`    -> Successfully validated and generated deal summary for opportunity ${opportunity._id}`));
      
      const proposedDealSummary: ProposedDealSummary = {
        opportunityId: opportunity._id as mongoose.Types.ObjectId,
        summary,
        generatedAt: new Date()
      };
      
      console.log(chalk.green.bold(`    [+] Completed deal summary processing for opportunity ${opportunity._id}`));
      
      return {
        proposedDealSummary
      };
    } catch (error) {
      console.error(chalk.red(`    [!] Failed to parse or validate deal summary from agent:`, error));
    }
    
    console.log(chalk.green.bold(`    [+] Completed deal summary processing for opportunity ${opportunity._id}`));
    return {
      proposedDealSummary: null
    };
  }

  /**
   * Legacy method that maintains the old database-based approach for backward compatibility.
   * @deprecated Use generateDealSummary with in-memory data instead.
   */
  public static async generateAndSaveDealSummary(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<string | null> {
    console.log(chalk.blue.bold(`    [+] Generating deal summary for opportunity ${opportunityId}...`));
    
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      console.error(chalk.red(`    [!] Opportunity not found for summary generation: ${opportunityId}`));
      return null;
    }
    
    console.log(chalk.cyan(`    -> Fetching contacts for opportunity ${opportunity.name}...`));
    const contacts = await Contact.find({ _id: { $in: opportunity.contacts } });

    console.log(chalk.cyan(`    -> Calculating deal temperature and momentum...`));
    const temperature = await DealAggregationService.calculateDealTemperature(opportunityId);
    const momentum = await DealAggregationService.calculateDealMomentum(opportunityId);
    
    console.log(chalk.cyan(`    -> Building contacts intelligence summary...`));
    let contactsSummary = '';
    for (const contact of contacts) {
      const intel = await contact.getOrCreateOpportunityIntelligence(opportunityId);
      const latestRole = [...intel.roleAssignments].sort((a,b) => b.assignedAt.getTime() - a.assignedAt.getTime())[0]?.role || 'N/A';
      contactsSummary += `
          - Contact: ${contact.firstName} ${contact.lastName}
            Role: ${latestRole}
            Engagement Score: ${intel.engagementScore}
            Relationship Story: ${intel.relationshipStory || 'Not generated yet.'}
        `;
    }

    console.log(chalk.cyan(`    -> Constructing deal summary prompt...`));
    const prompt = this.constructPrompt(opportunity, temperature, momentum, contactsSummary);
    
    console.log(chalk.cyan(`    -> Invoking deal summary agent...`));
    const dealSummaryAgent = mastra.getAgent('dealSummaryAgent');
    const result = await dealSummaryAgent.generateLegacy([{ content: prompt, role: 'user' }]);
    console.log(chalk.gray(`    -> Deal Summary Agent Response:`, result.text));
    
    try {
      const rawData = JSON.parse(result.text);
      const validationResult = DealSummaryResponseSchema.safeParse(rawData);
      
      if (!validationResult.success) {
        console.error(chalk.red(`    [!] Invalid deal summary response format:`, validationResult.error.issues));
        throw new Error(`Deal summary validation failed: ${validationResult.error.issues.map(i => i.message).join(', ')}`);
      }
      
      const { summary } = validationResult.data;
      console.log(chalk.cyan(`    -> Saving deal summary to opportunity record...`));
      opportunity.latestDealNarrative = summary;
      if (!opportunity.dealNarrativeHistory) {
        opportunity.dealNarrativeHistory = [];
      }
      opportunity.dealNarrativeHistory.push({ narrative: summary, date: new Date() });
      await opportunity.save();
      console.log(chalk.green(`    -> Successfully saved deal summary for opportunity ${opportunityId}`));
      return summary;
    } catch (error) {
      console.error(chalk.red(`    [!] Failed to parse or validate deal summary from agent:`, error));
    }
    
    console.log(chalk.green.bold(`    [+] Completed deal summary processing for opportunity ${opportunityId}`));
    return null;
  }

  private static constructPrompt(
    opportunity: IOpportunity,
    temperature: number, 
    momentum: number, 
    contactsSummary: string
  ): string {
    return `
      Please generate an executive summary for the opportunity: "${opportunity.name}", for our global head of sales.
      We need to give him all the information he could possibly require when taking over this deal.
      We need him to intuitively understand the ins and outs of the deal, so he can best decide on the next actions to take.

      Key Contact Insights:
      ${contactsSummary}

      Current Deal Intelligence:
      - Deal Temperature (0-100): ${temperature}
      - Deal Momentum: ${momentum} (Positive means accelerating, negative means decelerating)
      - MEDDPICC: ${JSON.stringify(opportunity.meddpicc, null, 2)}

      Based on this data, provide a summary answering:
      1. Who are the key players, their history and stances?
      2. What are the dynamics of the deal? How are the contact positions? Who is blocking us, and who is helping us? Who is leading the deal and who is following?
      3. What (if any) are the biggest risks right now?
      4. What (if any) are the biggest opportunities right now?
      6. What is the most important thing for a sales person to know about this deal?
    `;
  }
} 