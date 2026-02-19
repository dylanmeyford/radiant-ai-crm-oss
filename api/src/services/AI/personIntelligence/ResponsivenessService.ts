import mongoose from 'mongoose';
import { z } from 'zod';
import { mastra } from '../../../mastra';
import Contact from '../../../models/Contact';
import EmailActivity from '../../../models/EmailActivity';
import CalendarActivity from '../../../models/CalendarActivity';
import { ResponsivenessInfo } from '../../../types/contactIntelligence.types';
import { addEmailThreadSeparators, stripHtml } from '../../../utils/htmlUtils';
import Prospect from '../../../models/Prospect';
import chalk from 'chalk';
import { ActivityDataOptimizer } from './ActivityDataOptimizer';
import { getTokenStats } from '../../../utils/tokenUtils';
import { getOptimizationConfigWithOverrides } from '../../../config/aiOptimization';

const ResponsivenessSchema = z.object({
  status: z.enum(['Ghosting', 'Delayed', 'Engaged', 'OOO', 'Handed Off', 'Disengaged','Uninvolved']),
  summary: z.string().min(1),
  isAwaitingResponse: z.boolean(),
  activeRespondingContact: z.string().optional(),
});

// Define the return type for responsiveness data
export interface ProposedResponsivenessData {
  status: 'Ghosting' | 'Delayed' | 'Engaged' | 'OOO' | 'Handed Off' | 'Disengaged' | 'Uninvolved';
  summary: string;
  isAwaitingResponse: boolean;
  activeRespondingContact?: string;
  analyzedAt: Date;
}

export interface ResponsivenessResult {
  contactId: mongoose.Types.ObjectId;
  opportunityId: mongoose.Types.ObjectId;
  proposedResponsiveness: ProposedResponsivenessData | null;
}

/**
 * Service responsible for analyzing contact responsiveness based on email communication and meeting participation.
 * It orchestrates fetching email and calendar data, invoking the AI agent for analysis,
 * and returning the results for in-memory processing.
 */
class ResponsivenessService {
  /**
   * Analyzes the responsiveness of a contact within a specific opportunity context.
   * @param contactId - The ID of the contact to analyze.
   * @param opportunityId - The ID of the opportunity context.
   * @param activityDate - The date of the activity being processed.
   */
  public async analyzeContactResponsiveness(
    contactId: mongoose.Types.ObjectId,
    opportunityId: mongoose.Types.ObjectId,
    activityDate: Date
  ): Promise<ResponsivenessResult> {
    const responsivenessAgent = mastra.getAgent('responsivenessAgent');
    console.log(chalk.blue.bold(`    [+] Analyzing responsiveness for contact ${contactId}...`));
    
    console.log(chalk.cyan(`    -> Fetching prospect and related contacts...`));
    // 1. Fetch all email activities associated with the contact.
    // We select only the fields necessary for the analysis to minimize data transfer.
    // Emails are sorted by date to provide a chronological thread to the AI.
    const prospect = await Prospect.findOne({contacts: { $in: contactId }}).select('contacts').lean();
    const prospectContacts = prospect?.contacts.map(contact => contact._id);
    
    if (!prospectContacts || prospectContacts.length === 0) {
      console.log(chalk.yellow(`    [!] No prospect or prospect contacts found for contact ${contactId}`));
      return {
        contactId,
        opportunityId,
        proposedResponsiveness: null
      };
    }
    
    console.log(chalk.cyan(`    -> Fetching email activities for ${prospectContacts.length} contacts...`));
    const emailActivities = await EmailActivity.find({
      contacts: { $in: prospectContacts }, 
      'date': { $lte: activityDate }
    })
      .select('from to subject body date')
      .sort({ date: 1 })
      .lean();

    console.log(chalk.cyan(`    -> Fetching calendar activities (meetings) for ${prospectContacts.length} contacts...`));
    const calendarActivities = await CalendarActivity.find({
      contacts: { $in: prospectContacts }, 
      'date': { $lte: activityDate }
    })
      .select('title description startTime endTime date attendees status aiSummary')
      .sort({ date: 1 })
      .lean();

    console.log(chalk.cyan(`    -> Fetching contacts for opportunity context...`));
    const contacts = await Contact.find({ opportunities: { $in: opportunityId } })
    .select('emails firstName lastName')
    .lean();

    if ((!emailActivities || emailActivities.length === 0) && (!calendarActivities || calendarActivities.length === 0)) {
      console.log(chalk.yellow(`    [!] No email activities or calendar activities found for contact ${contactId}`));
      return {
        contactId,
        opportunityId,
        proposedResponsiveness: null
      };
    }

    console.log(chalk.cyan(`    -> Optimizing ${emailActivities.length} email activities and ${calendarActivities.length} calendar activities for analysis...`));
    
    // Get model-specific optimization configuration
    const optimizationConfig = getOptimizationConfigWithOverrides();
    console.log(chalk.gray(`    -> Using optimization config: ${optimizationConfig.maxEmailActivities} emails, ${optimizationConfig.maxCalendarActivities} meetings`));
    
    // Use the ActivityDataOptimizer to ensure we stay within token limits
    const optimizedEmailActivities = ActivityDataOptimizer.optimizeEmailActivities(
      emailActivities,
      {
        maxEmailActivities: optimizationConfig.maxEmailActivities,
        maxTokensPerEmail: optimizationConfig.maxTokensPerEmail,
        prioritizeRecent: optimizationConfig.prioritizeRecent
      }
    );

    const optimizedCalendarActivities = ActivityDataOptimizer.optimizeCalendarActivities(
      calendarActivities,
      {
        maxCalendarActivities: optimizationConfig.maxCalendarActivities,
        maxTokensPerMeeting: optimizationConfig.maxTokensPerMeeting,
        prioritizeRecent: optimizationConfig.prioritizeRecent,
        includeAttendeeDetails: optimizationConfig.includeAttendeeDetails
      }
    );

    // Get optimization statistics
    const optimizationStats = ActivityDataOptimizer.getOptimizationStats(
      emailActivities,
      calendarActivities,
      optimizedEmailActivities,
      optimizedCalendarActivities
    );

    console.log(chalk.gray(`    -> Optimization results:`));
    console.log(chalk.gray(`       Original: ${optimizationStats.original.emails} emails, ${optimizationStats.original.meetings} meetings`));
    console.log(chalk.gray(`       Optimized: ${optimizationStats.optimized.emails} emails, ${optimizationStats.optimized.meetings} meetings`));
    console.log(chalk.gray(`       Total tokens: ${optimizationStats.tokens.total} (${optimizationStats.tokens.percentOfBudget}% of budget)`));

    const targetContact = contacts.filter(contact => contact._id.toString() === contactId.toString())[0];
    if (!targetContact) {
      console.error(chalk.red(`    [!] Target contact not found in opportunity contacts`));
      return {
        contactId,
        opportunityId,
        proposedResponsiveness: null
      };
    }

    // Construct the prompt with optimized data and add context length monitoring
    let promptContent = `
        Analyze the following email thread/s and meeting history with a prospect and return a responsiveness analysis.
        IMPORTANT: **The contact you are analyzing is ${targetContact.firstName} ${targetContact.lastName} <${targetContact.emails?.find(e => e.isPrimary)?.address || targetContact.emails?.[0]?.address || 'No email'}>.**
        
        When analyzing responsiveness, consider both email interactions AND meeting participation:
        - Email responses (or lack thereof) to gauge written communication responsiveness
        - Meeting attendance, participation, and engagement levels
        - Overall communication patterns across all channels
        - Recent activity trends in all channels
        - Which channel is the prospect most responsive on

        Email Activities (${optimizedEmailActivities.length} most recent/relevant):
        ${JSON.stringify(optimizedEmailActivities, null, 2)}

        Meeting Activities (${optimizedCalendarActivities.length} most recent/relevant):
        ${JSON.stringify(optimizedCalendarActivities, null, 2)}
        `;

    // Monitor context length before sending to agent
    const promptStats = getTokenStats(promptContent);
    console.log(chalk.cyan(`    -> Prompt token analysis: ${promptStats.estimatedTokens} tokens (${promptStats.percentOfLimit}% of limit)`));
    
    if (!promptStats.withinLimit) {
      console.log(chalk.red(`    [!] WARNING: Prompt exceeds safe token limit! Attempting emergency reduction...`));
      
      // Emergency fallback: reduce data further using emergency limits
      const emergencyEmailActivities = ActivityDataOptimizer.optimizeEmailActivities(
        emailActivities,
        {
          maxEmailActivities: optimizationConfig.emergencyMaxEmailActivities,
          maxTokensPerEmail: optimizationConfig.emergencyMaxTokensPerEmail,
          prioritizeRecent: optimizationConfig.prioritizeRecent
        }
      );

      const emergencyCalendarActivities = ActivityDataOptimizer.optimizeCalendarActivities(
        calendarActivities,
        {
          maxCalendarActivities: optimizationConfig.emergencyMaxCalendarActivities,
          maxTokensPerMeeting: optimizationConfig.emergencyMaxTokensPerMeeting,
          prioritizeRecent: optimizationConfig.prioritizeRecent,
          includeAttendeeDetails: false // Always disable attendee details in emergency mode
        }
      );

      const emergencyPromptContent = `
        Analyze the following email thread/s and meeting history with a prospect and return a responsiveness analysis.
        IMPORTANT: **The contact you are analyzing is ${targetContact.firstName} ${targetContact.lastName} <${targetContact.emails?.find(e => e.isPrimary)?.address || targetContact.emails?.[0]?.address || 'No email'}>.**
        
        When analyzing responsiveness, consider both email interactions AND meeting participation:
        - Email responses (or lack thereof) to gauge written communication responsiveness
        - Meeting attendance, participation, and engagement levels
        - Overall communication patterns across all channels
        - Recent activity trends in all channels

        Email Activities (${emergencyEmailActivities.length} most recent):
        ${JSON.stringify(emergencyEmailActivities, null, 2)}

        Meeting Activities (${emergencyCalendarActivities.length} most recent):
        ${JSON.stringify(emergencyCalendarActivities, null, 2)}
        `;

      const emergencyStats = getTokenStats(emergencyPromptContent);
      console.log(chalk.yellow(`    -> Emergency reduction: ${emergencyStats.estimatedTokens} tokens (${emergencyStats.percentOfLimit}% of limit)`));
      
      promptContent = emergencyPromptContent;
    }

    console.log(chalk.cyan(`    -> Invoking responsiveness agent for ${targetContact.firstName} ${targetContact.lastName}...`));
    // 2. Invoke the responsiveness agent to analyze the email thread and meeting history.
    // The agent is provided with both email and meeting data and is expected to return a structured JSON object.
    const agentResponse = await responsivenessAgent.generateLegacy(
      [{
        role: 'user',
        content: promptContent,
      }],
      { 
        output: ResponsivenessSchema,
        providerOptions: {
          openai: {
            metadata: {
              contactId: (targetContact as any)?._id?.toString() || '',
              opportunityId: opportunityId.toString() || '',
              file: 'responsiveness-service',
              agent: 'responsivenessAgent',
              orgId: (targetContact?.organization as any)?._id?.toString() || '',
            }
          }
        }
      }
    );

    console.log(chalk.gray(`    -> Responsiveness Agent Response:`, agentResponse.object));

    // 3. Parse and validate the agent's response.
    const responsivenessData = agentResponse.object;

    if (!agentResponse.object) {
      console.log(chalk.yellow(`    [!] Responsiveness agent failed to return data for contact ${contactId}`));
      return {
        contactId,
        opportunityId,
        proposedResponsiveness: null
      };
    }

    console.log(chalk.green(`    -> Successfully prepared responsiveness data for in-memory processing`));

    const proposedResponsiveness: ProposedResponsivenessData = {
      ...responsivenessData,
      analyzedAt: activityDate,
    };

    console.log(chalk.green.bold(`    [+] Completed responsiveness analysis for contact ${contactId}`));
    
    return {
      contactId,
      opportunityId,
      proposedResponsiveness
    };
  }
}

export default new ResponsivenessService(); 