import mongoose from 'mongoose';
import Contact, { IContact, IContactResearch } from '../../../models/Contact';
import Opportunity, { IOpportunity } from '../../../models/Opportunity';
import { mastra } from '../../../mastra';
import { format } from 'date-fns';
import { IOpportunityIntelligence } from '../../../types/contactIntelligence.types';
import chalk from 'chalk';
import { z } from 'zod';

// Define the return type for relationship story
export interface RelationshipStoryResult {
  contactId: mongoose.Types.ObjectId;
  opportunityId: mongoose.Types.ObjectId;
  relationshipStory: string | null;
}

// Zod schema for validating relationship story agent response
const RelationshipStoryResponseSchema = z.object({
  story: z.string().min(1, "Story cannot be empty")
});

export class RelationshipStoryService {
  /**
   * Generates a relationship story using in-memory data without database operations.
   * @param contact - The contact document (in-memory)
   * @param opportunity - The opportunity document (in-memory)
   * @param intelligence - The opportunity intelligence data (in-memory)
   */
  public static async generateRelationshipStory(
    contact: IContact,
    opportunity: IOpportunity,
    intelligence: IOpportunityIntelligence
  ): Promise<RelationshipStoryResult> {
    console.log(chalk.blue.bold(`    [+] Generating relationship story for contact ${contact._id} on opportunity ${opportunity._id}...`));
    const relationshipStoryAgent = mastra.getAgent('relationshipStoryAgent');
    
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const opportunityName = opportunity.name;
    const contactResearch = contact?.contactResearch;

    console.log(chalk.cyan(`    -> Constructing relationship story prompt for ${contactName}...`));
    const prompt = this.constructPrompt(intelligence, contactName, opportunityName, contactResearch);
    
    console.log(chalk.cyan(`    -> Invoking relationship story agent...`));
    const result = await relationshipStoryAgent.generateLegacy([{ content: prompt, role: 'user' }], {
      output: RelationshipStoryResponseSchema,
      providerOptions: {
        openai: {
          metadata: {
            contactId: (contact as any)?._id?.toString() || '',
            opportunityId: opportunity._id.toString() || '',
            file: 'relationship-story-service',
            agent: 'relationshipStoryAgent',
            orgId: (contact?.organization as any)?._id?.toString() || '',
          }
        }
      }
    });
    
    try {
      // With structured output, result.object contains the validated data
      const { story } = result.object;
      console.log(chalk.gray(`    -> Relationship Story Generated:`, story));
      console.log(chalk.green(`    -> Successfully validated and generated relationship story for ${contactName}`));
      console.log(chalk.green.bold(`    [+] Completed relationship story processing for contact ${contact._id}`));
      
      return {
        contactId: contact._id as mongoose.Types.ObjectId,
        opportunityId: opportunity._id as mongoose.Types.ObjectId,
        relationshipStory: story
      };
    } catch (error) {
      console.error(chalk.red(`    [!] Failed to parse or validate relationship story from agent:`, error));
    }

    console.log(chalk.green.bold(`    [+] Completed relationship story processing for contact ${contact._id}`));
    return {
      contactId: contact._id as mongoose.Types.ObjectId,
      opportunityId: opportunity._id as mongoose.Types.ObjectId,
      relationshipStory: null
    };
  }

  /**
   * Legacy method that maintains the old database-based approach for backward compatibility.
   * @deprecated Use generateRelationshipStory with in-memory data instead.
   */
  public static async generateAndSaveRelationshipStory(
    opportunityId: mongoose.Types.ObjectId,
    contactId: mongoose.Types.ObjectId
  ): Promise<string | null> {
    console.log(chalk.blue.bold(`    [+] Generating relationship story for contact ${contactId} on opportunity ${opportunityId}...`));
    
    const contact = await Contact.findById(contactId);
    const opportunity = await Opportunity.findById(opportunityId);

    if (!contact || !opportunity) {
      console.error(chalk.red(`    [!] Contact or Opportunity not found - Contact: ${!!contact}, Opportunity: ${!!opportunity}`));
      return null;
    }

    console.log(chalk.cyan(`    -> Fetching contact intelligence data...`));
    const intel = await contact.getOrCreateOpportunityIntelligence(opportunityId);

    const contactName = `${contact.firstName} ${contact.lastName}`;
    const contactResearch = contact.contactResearch;
    const opportunityName = opportunity.name;

    console.log(chalk.cyan(`    -> Constructing relationship story prompt for ${contactName}...`));
    const prompt = this.constructPrompt(intel, contactName, opportunityName, contactResearch);
    const relationshipStoryAgent = mastra.getAgent('relationshipStoryAgent');
    console.log(chalk.cyan(`    -> Invoking relationship story agent...`));
    const result = await relationshipStoryAgent.generateLegacy([{ content: prompt, role: 'user' }],
      {
        output: RelationshipStoryResponseSchema,
        providerOptions: {
          openai: {
            metadata: {
              contactId: (contact as any)?._id?.toString() || '',
              opportunityId: opportunityId.toString() || '',
              file: 'relationship-story-service-legacy',
              agent: 'relationshipStoryAgent',
              orgId: (contact?.organization as any)?._id?.toString() || '',
            }
          }
        }
      } 
    );
    
    try {
      // With structured output, result.object contains the validated data
      const { story } = result.object;
      console.log(chalk.gray(`    -> Relationship Story Generated:`, story));
      
      intel.relationshipStory = story;
      await contact.save();
      console.log(chalk.green(`    -> Successfully saved relationship story for ${contactName}`));
      return story;
    } catch (error) {
      console.error(chalk.red(`    [!] Failed to parse or validate relationship story from agent:`, error));
    }

    console.log(chalk.green.bold(`    [+] Completed relationship story processing for contact ${contactId}`));
    return null;
  }

  private static constructPrompt(data: IOpportunityIntelligence, contactName: string, opportunityName: string, contactResearch: IContactResearch | undefined): string {
    return `
      Generate a relationship story for contact "${contactName}" in the context of opportunity "${opportunityName}".
      The story should be a professional, insightful narrative summarizing their journey and engagement level over time. 
      Ideal to arm our new junior sales agent with everything the would need to understand where this person sits in an opportunity.
      Use timestamps (DD-MM-YYYY) to indicate when each part of the story occurred.

      About the contact:
      ${JSON.stringify(contactResearch) ? JSON.stringify(contactResearch) : 'No contact research available.'}

      Current Relationship Story:
      ${data.relationshipStory || 'No relationship story available.'}

      Key Data Points. This information is sliced to the last 15 items for engagement score history, 10 items for responsiveness, and 20 items for behavioral indicators and communication patterns to help with context windows.
      - Current Engagement Score: ${data.engagementScore} (-50 to 50 scale)
      - Recent Engagement Score History: ${JSON.stringify(data.scoreHistory.slice(-15), null, 2) || 'Not data available'}
      - Recent Responsiveness over time: ${JSON.stringify(data?.responsiveness.slice(-10), null, 2) || 'Not data available'}
      - Role(s): ${data.roleAssignments.map((r: any) => `${r.role} (since ${r.assignedAt ? format(r.assignedAt, 'MMM yyyy') : 'unknown'})`).join(', ') || 'Not assigned'}
      - Recent Engagement Score History:
        ${data.scoreHistory.slice(-15).map((h: any) => `  - ${h.score} on ${h.date ? format(h.date, 'yyyy-MM-dd') : 'unknown'}: ${h.reasoning || 'Score update'}`).join('\n')}
      - Recent Behavioral Signals:
        ${data.behavioralIndicators.slice(-20).map((b: any) => `  - ${b.indicator} (on ${b.date ? format(b.date, 'yyyy-MM-dd') : 'unknown'})`).join('\n')}
      - Recent Communication Patterns:
        ${data.communicationPatterns.slice(-20).map((p: any) => `  - Tone: ${p.tone || 'N/A'}, Depth: ${p.messageDepth || 'N/A'} (Analyzed on ${p.analyzedAt ? format(p.analyzedAt, 'yyyy-MM-dd') : 'unknown'})`).join('\n')}

      Synthesize these points into a narrative. Focus on the "why" behind the engagement and how they can influence a deal.
      What is the trajectory? Are they becoming a champion, are they a blocker or disengaging? What are the key moments that defined this relationship?
      What is the most important thing for a sales person to know about ${contactName}'s involvement in this deal? 
      What do they care about or not care about?
      Do NOT ever provide next steps or action steps for tge junior sales agent to follow.
      

      You must return a JSON object with a single key: "story".
    `;
  }
} 