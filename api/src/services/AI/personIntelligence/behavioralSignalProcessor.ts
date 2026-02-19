import mongoose from 'mongoose';
import { z } from 'zod';
import { IContact } from '../../../models/Contact';
import { mastra } from '../../../mastra';
import { IActivity } from '../../../models/Activity';
import { ContentType } from '../../../models/SalesPlaybook';
import chalk from 'chalk';
import SalesPlaybook from '../../../models/SalesPlaybook';

const behavioralSignalSchema = z.object({
  signals: z.array(z.object({
    category: z.string(),
    signal: z.string(),
    confidence: z.enum(['High', 'Medium', 'Low']),
    relevance: z.enum(['High', 'Medium', 'Low']).describe('How directly this signal relates to our solution vs general business activities'),
    reasoning: z.string(),
    quote: z.string()
  })),
});

// Define the return type for behavioral indicators
export interface ProposedBehavioralIndicator {
  opportunityId: mongoose.Types.ObjectId;
  indicator: string;
  activityId: mongoose.Types.ObjectId;
  confidence: string;
  relevance: string;
  activityDate: Date;
}

export interface BehavioralSignalResult {
  contactId: mongoose.Types.ObjectId;
  proposedIndicators: ProposedBehavioralIndicator[];
}

export class BehavioralSignalProcessor {
  private contact: IContact;
  private opportunityId: mongoose.Types.ObjectId;

  constructor(contact: IContact, opportunityId: mongoose.Types.ObjectId) {
    this.contact = contact;
    this.opportunityId = opportunityId;
  }

  public async processActivity(activity: IActivity, activityDate: Date): Promise<BehavioralSignalResult> {
    console.log(chalk.blue.bold(`    [+] Processing behavioral signals for contact ${this.contact._id}...`));
    
    const signalAgent = mastra.getAgent('behavioralSignalAgent');
    if (!signalAgent) {
      console.error(chalk.red(`    [!] Behavioral Signal Agent not found`));
      throw new Error('Behavioral Signal Agent not found');
    }

    const summary = activity.aiSummary?.summary || activity.description || '';
    if (!summary) {
      console.log(chalk.yellow(`    [!] No summary or description available for activity - skipping behavioral signal analysis`));
      return {
        contactId: this.contact._id as mongoose.Types.ObjectId,
        proposedIndicators: []
      };
    }

    const businessInformation = await SalesPlaybook.find({ organization: activity.organization, type: ContentType.BUSINESS_INFORMATION });
    const productInformation = await SalesPlaybook.find({ organization: activity.organization, type: ContentType.PRODUCT_INFO });
    const productOverview = await SalesPlaybook.find({ organization: activity.organization, type: ContentType.PRODUCT_OVERVIEW });
    const salesProcess = await SalesPlaybook.find({ organization: activity.organization, type: ContentType.SALES_PROCESS });

    const prompt = `
    ## ABOUT OUR COMPANY
    ${businessInformation.map((info) => info.content).join('\n')}

    ## ABOUT OUR PRODUCTS
    ${productInformation.map((info) => info.content).join('\n')}

    ## ABOUT OUR PRODUCT OVERVIEW
    ${productOverview.map((info) => info.content).join('\n')}

    ## ABOUT OUR SALES PROCESS
    ${salesProcess.map((info) => info.content).join('\n')}

    Name of the person we are evaluating (referred to as "the contact"): ${this.contact.firstName} ${this.contact.lastName}\n
    Person Role: ${this.contact?.contactResearch?.roleAtCompany}\n
    Description of the person: ${this.contact?.contactResearch?.personalSummary}
    
    Activity Summary: ${summary}\n\n
    Analyze the provided activity summary and identify key signals that reveal the prospect's interest, concerns, or intentions.
    `;

    console.log(chalk.cyan(`    -> Invoking behavioral signal agent...`));
    const response = await signalAgent.generateLegacy(prompt, {
      output: behavioralSignalSchema,
      providerOptions: {
        openai: {
          metadata: {
            contactId: (this.contact as any)?._id?.toString() || '',
            opportunityId: this.opportunityId.toString() || '',
            file: 'behavioral-signal-processor',
            agent: 'behavioralSignalAgent',
            orgId: this.contact.organization.toString() || '',
          }
        }
      }
    });

    console.log(chalk.gray(`    -> Behavioral Signal Response:`, JSON.stringify(response.object, null, 2)));

    const proposedIndicators: ProposedBehavioralIndicator[] = [];

    if (response.object?.signals) {
      console.log(chalk.cyan(`    -> Found ${response.object.signals.length} behavioral signals, filtering by relevance...`));
      
      let totalSignals = 0;
      let filteredSignals = 0;
      
      for (const item of response.object.signals) {
        totalSignals++;
        
        // Filter out Low relevance signals
        if (item.relevance === 'Low') {
          console.log(chalk.yellow(`    -> Skipped Low relevance signal: [${item.category}] ${item.signal}`));
          filteredSignals++;
          continue;
        }
        
        const indicator = `[${item.category}] ${item.signal} : ${item.reasoning} - ${item.quote}`;
        proposedIndicators.push({
          opportunityId: this.opportunityId,
          indicator,
          activityId: activity._id as mongoose.Types.ObjectId,
          confidence: item.confidence,
          relevance: item.relevance,
          activityDate
        });
      }
      
      console.log(chalk.cyan(`    -> Processed ${totalSignals} signals, filtered out ${filteredSignals} low-relevance signals`));
      console.log(chalk.green(`    -> Successfully prepared ${proposedIndicators.length} High/Medium relevance behavioral indicators for in-memory processing`));
    } else {
      console.log(chalk.yellow(`    [!] No behavioral signals found in agent response`));
    }
    
    console.log(chalk.green.bold(`    [+] Completed behavioral signal processing for contact ${this.contact._id}`));
    
    return {
      contactId: this.contact._id as mongoose.Types.ObjectId,
      proposedIndicators
    };
  }
} 