import mongoose from 'mongoose';
import { z } from 'zod';
import { IContact } from '../../../models/Contact';
import { mastra } from '../../../mastra';
import EmailActivity, { IEmailActivity } from '../../../models/EmailActivity';
import User from '../../../models/User';
import Opportunity from '../../../models/Opportunity';
import chalk from 'chalk';

const communicationPatternSchema = z.object({
  tone: z.enum(['Formal', 'Informal', 'Enthusiastic', 'Hesitant', 'Concerned', 'Neutral']),
  depth: z.enum(['Deep', 'Medium', 'Shallow']),
});

// Define the return type for communication patterns
export interface ProposedCommunicationPatterns {
  lastAnalyzed: Date;
  responseSpeed?: number;
  initiationRatio?: number;
  tone?: 'Formal' | 'Informal' | 'Enthusiastic' | 'Hesitant' | 'Concerned' | 'Neutral';
  messageDepth?: 'Deep' | 'Medium' | 'Shallow';
}

export interface CommunicationPatternResult {
  contactId: mongoose.Types.ObjectId;
  opportunityId: mongoose.Types.ObjectId;
  proposedPatterns: ProposedCommunicationPatterns | null;
}

export class CommunicationPatternService {
  private contact: IContact;
  private opportunityId: mongoose.Types.ObjectId;

  constructor(contact: IContact, opportunityId: mongoose.Types.ObjectId) {
    this.contact = contact;
    this.opportunityId = opportunityId;
  }

  public async analyzeCommunicationPatterns(asOfDate: Date): Promise<CommunicationPatternResult> {
    console.log(chalk.blue.bold(`    [+] Analyzing communication patterns for contact ${this.contact._id}...`));
    
    console.log(chalk.cyan(`    -> Fetching email activities for contact ${this.contact._id}...`));
    const emails = await EmailActivity.find({
      'contacts': this.contact._id,
      'threadId': { $ne: null },
      'date': { $lte: asOfDate }
    }).sort({ date: 'asc' });

    if (emails.length === 0) {
      console.log(chalk.yellow(`    [!] No email activities found for contact ${this.contact._id}, skipping communication pattern analysis`));
      return {
        contactId: this.contact._id as mongoose.Types.ObjectId,
        opportunityId: this.opportunityId,
        proposedPatterns: null
      };
    }

    console.log(chalk.cyan(`    -> Found ${emails.length} email activities, analyzing patterns...`));
    let communicationPatterns: ProposedCommunicationPatterns = { lastAnalyzed: new Date() };

    if (emails.length > 0) {
      console.log(chalk.cyan(`    -> Fetching opportunity and team members for email analysis...`));
      const opportunity = await Opportunity.findById(this.opportunityId);
      if (!opportunity) {
        console.error(chalk.red(`    [!] Opportunity not found, cannot determine team members for email analysis.`));
        // If we can't find the opportunity, we can still analyze content.
      }
      
      const teamMembers = opportunity ? await User.find({ organization: opportunity.organization }) : [];
      const teamMemberEmails = new Set(teamMembers.flatMap(u => u.email ? [u.email] : []));

      if (teamMemberEmails.size > 0) {
        console.log(chalk.cyan(`    -> Calculating communication metrics with ${teamMemberEmails.size} team members...`));
        const { responseSpeed, initiationRatio } = this.calculateMetrics(emails, teamMemberEmails);
        communicationPatterns.responseSpeed = responseSpeed;
        communicationPatterns.initiationRatio = initiationRatio;
      } else {
        console.error(chalk.red(`    [!] Could not determine any user's email for email analysis.`));
      }
      
      console.log(chalk.cyan(`    -> Analyzing communication content and tone...`));
      const { tone, depth } = await this.analyzeContent(emails[emails.length - 1]);
      communicationPatterns.tone = tone;
      communicationPatterns.messageDepth = depth;
    }

    console.log(chalk.gray(`    -> Communication Patterns:`, JSON.stringify(communicationPatterns, null, 2)));

    console.log(chalk.green(`    -> Successfully prepared communication patterns for in-memory processing`));
    
    console.log(chalk.green.bold(`    [+] Successfully analyzed communication patterns for contact ${this.contact._id}`));
    
    return {
      contactId: this.contact._id as mongoose.Types.ObjectId,
      opportunityId: this.opportunityId,
      proposedPatterns: communicationPatterns
    };
  }

  private calculateMetrics(emails: IEmailActivity[], teamMemberEmails: Set<string>): { responseSpeed?: number; initiationRatio: number } {
    console.log(chalk.cyan(`      -> Calculating response speed and initiation metrics...`));
    
    let initiatedByContact = 0;
    let initiatedByUs = 0;
    let totalResponseTime = 0; // in hours
    let responseCount = 0;

    const emailThreads: { [key: string]: IEmailActivity[] } = {};
    emails.forEach(email => {
      if (email.threadId) { // Ensure threadId exists
        if (!emailThreads[email.threadId]) {
          emailThreads[email.threadId] = [];
        }
        emailThreads[email.threadId].push(email);
      }
    });

    console.log(chalk.cyan(`      -> Processing ${Object.keys(emailThreads).length} email threads...`));
    for (const threadId in emailThreads) {
      const thread = emailThreads[threadId].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      let firstUnansweredUserEmail: IEmailActivity | null = null;

      for (const email of thread) {
        const isFromUser = email.from.some(sender => sender.email.toLowerCase() && teamMemberEmails.has(sender.email.toLowerCase()));
        const isFromContact = email.from.some(sender => 
          sender.email && this.contact?.emails?.some(e => e.address.toLowerCase() === sender.email.toLowerCase())
        );

        if (isFromUser) {
          if (firstUnansweredUserEmail === null) {
            firstUnansweredUserEmail = email;
            initiatedByUs++;
          }
        } else if (isFromContact) {
          if (firstUnansweredUserEmail) {
            const responseTime = new Date(email.date).getTime() - new Date(firstUnansweredUserEmail.date).getTime();
            totalResponseTime += responseTime / (1000 * 3600); // Convert ms to hours
            responseCount++;
            firstUnansweredUserEmail = null; // Reset after a response
          } else {
            // This is an initiation from the contact
            initiatedByContact++;
          }
        }
      }
    }

    const initiationRatio = initiatedByUs > 0 ? initiatedByContact / initiatedByUs : (initiatedByContact > 0 ? Infinity : 0);
    const responseSpeed = responseCount > 0 ? totalResponseTime / responseCount : undefined;

    console.log(chalk.gray(`      -> Metrics calculated - Response Speed: ${responseSpeed?.toFixed(2)}h, Initiation Ratio: ${initiationRatio.toFixed(2)}`));
    return { responseSpeed, initiationRatio };
  }

  private async analyzeContent(email: IEmailActivity): Promise<{ tone?: 'Formal' | 'Informal' | 'Enthusiastic' | 'Hesitant' | 'Concerned' | 'Neutral', depth?: 'Deep' | 'Medium' | 'Shallow' }> {
    console.log(chalk.cyan(`      -> Analyzing email content for tone and depth...`));
    
    // Guard against empty email body
    if (!email.body || email.body.trim() === '') {
      console.log(chalk.yellow(`      [!] Email body is empty, skipping content analysis`));
      return { tone: undefined, depth: undefined };
    }
    
    const agent = mastra.getAgent('communicationPatternAgent');
    if (!agent) {
      console.error(chalk.red(`      [!] Communication Pattern Agent not found`));
      throw new Error('Communication Pattern Agent not found');
    }

    const response = await agent.generateLegacy(email.body, { 
      output: communicationPatternSchema,
      providerOptions: {
        openai: {
          metadata: {
            activityId: (email as any)?._id?.toString() || '',
            opportunityId: this.opportunityId.toString() || '',
            file: 'communication-pattern-service',
            agent: 'communicationPatternAgent',
            orgId: (email?.organization as any)?._id?.toString() || '',
          }
        }
      } 
    });
    
    console.log(chalk.gray(`      -> Content analysis result - Tone: ${response.object?.tone}, Depth: ${response.object?.depth}`));
    return {
      tone: response.object?.tone,
      depth: response.object?.depth,
    };
  }
} 