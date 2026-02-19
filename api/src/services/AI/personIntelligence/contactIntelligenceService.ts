import mongoose from 'mongoose';
import pLimit from 'p-limit';
import Contact, { IContact } from '../../../models/Contact';
import Activity, { IActivity } from '../../../models/Activity';
import Opportunity, { IOpportunity } from '../../../models/Opportunity';
import { summariseActivity } from './summariseActivity';
import { mastra } from '../../../mastra';
import { BehavioralSignalProcessor, BehavioralSignalResult } from './behavioralSignalProcessor';
import { RelationshipStoryService, RelationshipStoryResult } from './relationshipStoryService';
import { DealSummaryService, DealSummaryResult } from './dealSummaryService';
import { DealAggregationService, DealHealthResult } from './dealAggregationService';
import EmailActivity, { IEmailActivity } from '../../../models/EmailActivity';
import CalendarActivity, { ICalendarActivity } from '../../../models/CalendarActivity';
import { CommunicationPatternService, CommunicationPatternResult } from './CommunicationPatternService';
import { MeddpiccAgentOutputSchema } from '../../../mastra/agents/meddpicc.schema';
import { z } from 'zod';
import { MEDDPICC } from '../../../models/Opportunity';
import ResponsivenessService, { ResponsivenessResult } from './ResponsivenessService';
import Prospect from '../../../models/Prospect';
import chalk from 'chalk';
import { RoleAssignmentService, RoleAssignmentResult } from './roleAssignmentService';
import { IOpportunityIntelligence } from '../../../types/contactIntelligence.types';

// Define the structure for Phase 1 intelligence collection
interface Phase1IntelligenceData {
  contactId: mongoose.Types.ObjectId;
  opportunityId: mongoose.Types.ObjectId;
  activityImpact: {
    score: number;
    reasoning: string;
  };
  behavioralSignals: BehavioralSignalResult;
  communicationPatterns: CommunicationPatternResult;
  responsivenessData: ResponsivenessResult;
  roleAssignment: RoleAssignmentResult;
}

// Define the structure for Phase 2 document fetching
interface Phase2DocumentData {
  contact: IContact;
  opportunity: IOpportunity;
  intelligenceData: Phase1IntelligenceData;
}

export class ContactIntelligenceService {
  // Concurrency limit for contact-specific processing tasks
  private static readonly contactProcessingLimit = pLimit(parseInt(process.env.CONTACT_PROCESSING_CONCURRENCY || '3'));
  
  // Concurrency limit for external AI agent calls
  private static readonly aiAgentLimit = pLimit(parseInt(process.env.AI_AGENT_CONCURRENCY || '2'));

  /**
   * Phase 1: Execute all contact-specific intelligence services in parallel and collect results.
   * This method orchestrates the parallel execution of all contact-specific intelligence services
   * that were refactored in Task 1.0 to return data instead of saving to the database.
   * It also includes activity impact scoring for comprehensive data collection.
   * 
   * @param contact The contact to process intelligence for
   * @param opportunity The opportunity context
   * @param activity The activity being processed
   * @param activitySummary The AI-generated summary of the activity
   * @param activityDate The date of the activity
   * @returns Promise resolving to collected intelligence data from all services
   */
  private static async executePhase1IntelligenceGeneration(
    contact: IContact,
    opportunity: IOpportunity,
    activity: IActivity,
    activitySummary: string,
    activityDate: Date
  ): Promise<Phase1IntelligenceData> {
    const contactId = contact._id as mongoose.Types.ObjectId;
    const opportunityId = opportunity._id as mongoose.Types.ObjectId;
    const activityImpactAgent = mastra.getAgent('activityImpactAgent');

    console.log(chalk.blue.bold(`  [Phase 1] Executing parallel intelligence generation for contact ${contactId}...`));

    // Execute all contact-specific intelligence services in parallel, including activity impact scoring
    const [
      activityImpact,
      behavioralSignals,
      communicationPatterns,
      responsivenessData,
      roleAssignment
    ] = await Promise.all([
      // Activity impact scoring
      (async () => {
        console.log(chalk.cyan(`    -> Scoring activity impact...`));
        const impactPrompt = `
        Name of the person we are evaluating (referred to as "the contact"): ${contact.firstName} ${contact.lastName}\n
        Activity Summary: ${activitySummary}\n\n
        Analyze the provided activity summary and return a single numerical score reflecting its impact. You must return a JSON object with two keys: "score" (a number) and "reasoning" (a string).`;
        
        const impactResult = await this.aiAgentLimit(() => 
          activityImpactAgent.generateLegacy([{ content: impactPrompt, role: 'user' }], {
            output: z.object({
              score: z.number(),
              reasoning: z.string(),
            }),
            providerOptions: {
              openai: {
                metadata: {
                  contactId: (contact as any)?._id?.toString() || '',
                  opportunityId: (opportunity as any)?._id?.toString() || '',
                  file: 'contact-intelligence-service',
                  agent: 'activityImpactAgent',
                  orgId: (contact?.organization as any)?._id?.toString() || '',
                }
              }
            }
          })
        );
        
        console.log(chalk.cyan(`    -> Activity Impact: Score=${impactResult.object.score}, Reasoning=${impactResult.object.reasoning}`));
        return impactResult.object;
      })(),

      // Behavioral signal processing
      (async () => {
        console.log(chalk.cyan(`    -> Processing behavioral signals...`));
        const processor = new BehavioralSignalProcessor(contact, opportunityId);
        return await this.aiAgentLimit(() => processor.processActivity(activity, activityDate));
      })(),

      // Communication pattern analysis
      (async () => {
        console.log(chalk.cyan(`    -> Analyzing communication patterns...`));
        const patternService = new CommunicationPatternService(contact, opportunityId);
        return await this.aiAgentLimit(() => patternService.analyzeCommunicationPatterns(activityDate));
      })(),

      // Responsiveness analysis
      (async () => {
        console.log(chalk.cyan(`    -> Analyzing responsiveness...`));
        return await this.aiAgentLimit(() => ResponsivenessService.analyzeContactResponsiveness(
          contactId,
          opportunityId,
          activityDate
        ));
      })(),

      // Role assignment
      (async () => {
        console.log(chalk.cyan(`    -> Extracting and assigning role...`));
        return await this.aiAgentLimit(() => RoleAssignmentService.extractAndAssignContactRole(
          contactId,
          opportunityId,
          activitySummary,
          contact
        ));
      })()
    ]);

    console.log(chalk.green.bold(`  [Phase 1] Successfully completed parallel intelligence generation for contact ${contactId}`));
    console.log(chalk.gray(`  [Phase 1] Collected data summary:`));
    console.log(chalk.gray(`    - Activity Impact: Score=${activityImpact.score}`));
    console.log(chalk.gray(`    - Behavioral Signals: ${behavioralSignals.proposedIndicators.length} indicators`));
    console.log(chalk.gray(`    - Communication Patterns: ${communicationPatterns.proposedPatterns ? 'Available' : 'None'}`));
    console.log(chalk.gray(`    - Responsiveness: ${responsivenessData.proposedResponsiveness ? responsivenessData.proposedResponsiveness.status : 'None'}`));
    console.log(chalk.gray(`    - Role Assignment: ${roleAssignment.proposedRoleAssignment ? roleAssignment.proposedRoleAssignment.role : 'None'}`));

    // Return comprehensively collected intelligence data
    return {
      contactId,
      opportunityId,
      activityImpact,
      behavioralSignals,
      communicationPatterns,
      responsivenessData,
      roleAssignment
    };
  }

  /**
   * Phase 2: Fetch the required Contact and Opportunity documents from the database.
   * This method retrieves fresh copies of the Contact and Opportunity documents that will be
   * modified in-memory with the intelligence data collected in Phase 1. Documents are fetched
   * within the transaction session to ensure consistency.
   * 
   * @param intelligenceData The intelligence data collected from Phase 1
   * @param session The MongoDB session for transaction consistency
   * @returns Promise resolving to the fetched documents combined with intelligence data
   */
  private static async executePhase2DocumentFetching(
    intelligenceData: Phase1IntelligenceData,
    session: mongoose.ClientSession
  ): Promise<Phase2DocumentData> {
    const { contactId, opportunityId } = intelligenceData;

    console.log(chalk.blue.bold(`  [Phase 2] Fetching documents for contact ${contactId} and opportunity ${opportunityId}...`));

    // Fetch fresh copies of Contact and Opportunity documents within the transaction
    const [contact, opportunity] = await Promise.all([
      (async () => {
        console.log(chalk.cyan(`    -> Fetching Contact document ${contactId}...`));
        const fetchedContact = await Contact.findById(contactId).session(session);
        if (!fetchedContact) {
          throw new Error(`Contact with ID ${contactId} not found`);
        }
        console.log(chalk.cyan(`    -> Successfully fetched Contact: ${fetchedContact.firstName} ${fetchedContact.lastName}`));
        return fetchedContact;
      })(),

      (async () => {
        console.log(chalk.cyan(`    -> Fetching Opportunity document ${opportunityId}...`));
        const fetchedOpportunity = await Opportunity.findById(opportunityId).session(session);
        if (!fetchedOpportunity) {
          throw new Error(`Opportunity with ID ${opportunityId} not found`);
        }
        console.log(chalk.cyan(`    -> Successfully fetched Opportunity: ${fetchedOpportunity.name || 'Unnamed'}`));
        return fetchedOpportunity;
      })()
    ]);

    console.log(chalk.green.bold(`  [Phase 2] Successfully fetched all required documents for contact ${contactId}`));

    return {
      contact,
      opportunity,
      intelligenceData
    };
  }

  /**
   * Phase 3: Apply the collected intelligence data to the in-memory Mongoose documents.
   * This method takes the intelligence data from Phase 1 and applies it to the Contact and
   * Opportunity documents fetched in Phase 2, using in-memory modifications only.
   * Documents are modified in-memory but not saved to the database yet.
   * 
   * @param phase2Data The documents and intelligence data from Phase 2
   * @param activityId The ID of the activity being processed 
   * @param activityDate The date of the activity being processed
   * @returns Promise resolving to the modified documents
   */
  private static async executePhase3IntelligenceApplication(
    phase2Data: Phase2DocumentData,
    activityId: mongoose.Types.ObjectId,
    activityDate: Date
  ): Promise<Phase2DocumentData> {
    const { contact, opportunity, intelligenceData } = phase2Data;
    const { opportunityId, activityImpact, behavioralSignals, communicationPatterns, responsivenessData, roleAssignment } = intelligenceData;

    console.log(chalk.blue.bold(`  [Phase 3] Applying intelligence data to in-memory documents for contact ${contact._id}...`));

    // Get or create opportunity intelligence (without saving)
    const intel = await contact.getOrCreateOpportunityIntelligence(opportunityId);

    // Apply activity impact to contact's engagement score (in-memory only)
    if (activityImpact.score !== undefined) {
      console.log(chalk.cyan(`    -> Applying activity impact score: ${activityImpact.score}`));
      
      const oldScore = intel.engagementScore || 0;
      const newScore = Math.max(-50, Math.min(50, oldScore + activityImpact.score));
      
      // Update engagement score in-memory
      intel.engagementScore = newScore;
      intel.scoreHistory.push({
        score: newScore,
        date: activityDate,
        sourceActivity: activityId,
        reasoning: activityImpact.reasoning,
      });
      
      console.log(chalk.cyan(`    -> Updated engagement score from ${oldScore} to ${newScore} (in-memory)`));
    }

    // Apply behavioral indicators (in-memory only)
    if (behavioralSignals.proposedIndicators.length > 0) {
      console.log(chalk.cyan(`    -> Applying ${behavioralSignals.proposedIndicators.length} behavioral indicators...`));
      
      if (!intel.behavioralIndicators) {
        intel.behavioralIndicators = [];
      }
      
      for (const indicator of behavioralSignals.proposedIndicators) {
        intel.behavioralIndicators.push({
          indicator: indicator.indicator,
          date: activityDate,
          sourceActivity: activityId,
          confidence: indicator.confidence as 'High' | 'Medium' | 'Low',
          relevance: indicator.relevance as 'High' | 'Medium' | 'Low'
        });
      }
      
      console.log(chalk.cyan(`    -> Successfully applied ${behavioralSignals.proposedIndicators.length} High/Medium relevance behavioral indicators (in-memory)`));
    }

    // Apply communication patterns (in-memory only)
    if (communicationPatterns.proposedPatterns) {
      console.log(chalk.cyan(`    -> Applying communication patterns...`));
      
      if (!intel.communicationPatterns) {
        intel.communicationPatterns = [];
      }
      
      const patterns = communicationPatterns.proposedPatterns;
      intel.communicationPatterns.push({
        responseSpeed: patterns.responseSpeed,
        initiationRatio: patterns.initiationRatio,
        messageDepth: patterns.messageDepth,
        tone: patterns.tone,
        analyzedAt: new Date()
      });
      
      console.log(chalk.cyan(`    -> Successfully applied communication patterns (in-memory)`));
    }

    // Apply responsiveness data (in-memory only)
    if (responsivenessData.proposedResponsiveness) {
      console.log(chalk.cyan(`    -> Applying responsiveness data...`));
      
      if (!intel.responsiveness) {
        intel.responsiveness = [];
      }
      
      const responsiveness = responsivenessData.proposedResponsiveness;
      intel.responsiveness.push({
        analyzedAt: responsiveness.analyzedAt,
        status: responsiveness.status,
        summary: responsiveness.summary,
        isAwaitingResponse: responsiveness.isAwaitingResponse,
        activeRespondingContact: responsiveness.activeRespondingContact
      });
      
      console.log(chalk.cyan(`    -> Successfully applied responsiveness data: ${responsiveness.status} (in-memory)`));
    }

    // Apply role assignment (in-memory only)
    if (roleAssignment.proposedRoleAssignment) {
      console.log(chalk.cyan(`    -> Applying role assignment...`));
      
      if (!intel.roleAssignments) {
        intel.roleAssignments = [];
      }
      
      const role = roleAssignment.proposedRoleAssignment;
      
      // Check if this role is already the latest one assigned (prevent duplicates)
      const latestRole = intel.roleAssignments.sort(
        (a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()
      )[0];
      
      if (!latestRole || latestRole.role !== role.role) {
        intel.roleAssignments.push({
          role: role.role as any,
          assignedAt: role.assignedAt
        });
        console.log(chalk.cyan(`    -> Successfully applied role assignment: ${role.role} (in-memory)`));
      } else {
        console.log(chalk.yellow(`    -> Skipped duplicate role assignment: ${role.role}`));
      }
    }

    // Generate and apply relationship story (in-memory only)
    console.log(chalk.cyan(`    -> Generating and applying relationship story...`));
    try {
      const relationshipStoryResult = await this.aiAgentLimit(() => RelationshipStoryService.generateRelationshipStory(
        contact,
        opportunity,
        intel
      ));
      
      if (relationshipStoryResult.relationshipStory) {
        intel.relationshipStory = relationshipStoryResult.relationshipStory;
        console.log(chalk.cyan(`    -> Successfully applied relationship story (in-memory)`));
      } else {
        console.log(chalk.yellow(`    -> No relationship story generated`));
      }
    } catch (error) {
      console.error(chalk.red(`    -> Failed to generate relationship story:`, error));
      console.log(chalk.yellow(`    -> Continuing without relationship story`));
    }

    // Mark the contact document as modified since we've updated nested fields
    contact.markModified('opportunityIntelligence');

    console.log(chalk.green.bold(`  [Phase 3] Successfully applied all intelligence data to in-memory documents for contact ${contact._id}`));
    console.log(chalk.gray(`  [Phase 3] Applied data summary:`));
    console.log(chalk.gray(`    - Activity Impact: ${activityImpact.score !== undefined ? 'Applied' : 'Skipped'}`));
    console.log(chalk.gray(`    - Behavioral Signals: ${behavioralSignals.proposedIndicators.length} applied`));
    console.log(chalk.gray(`    - Communication Patterns: ${communicationPatterns.proposedPatterns ? 'Applied' : 'Skipped'}`));
    console.log(chalk.gray(`    - Responsiveness: ${responsivenessData.proposedResponsiveness ? 'Applied' : 'Skipped'}`));
    console.log(chalk.gray(`    - Role Assignment: ${roleAssignment.proposedRoleAssignment ? 'Applied' : 'Skipped'}`));
    console.log(chalk.gray(`    - Relationship Story: ${intel.relationshipStory ? 'Generated and Applied' : 'Not Generated'}`));

    // Return the modified documents (they haven't been saved to database yet)
    return phase2Data
  }

  /**
   * Phase 4 (Deal-Level): Process deal-level intelligence using in-memory data from all contacts.
   * This method takes the modified opportunity document and all contact intelligence data to:
   * 1. Update MEDDPICC data using the activity summary
   * 2. Calculate deal health indicators using aggregated contact data  
   * 3. Generate deal summary using all contact intelligence
   * All updates are applied in-memory without saving to database.
   * 
   * @param opportunity The opportunity document (in-memory)
   * @param allContactsData Array of all contact intelligence data for this opportunity
   * @param activitySummary The AI-generated summary of the activity
   * @param activityDate The date of the activity being processed
   * @returns Promise resolving to the modified opportunity document
   */
  private static async executePhase4DealLevelProcessing(
    opportunity: IOpportunity,
    allContactsData: Array<{ contact: IContact; intelligence: IOpportunityIntelligence }>,
    activitySummary: string,
    activityDate: Date
  ): Promise<IOpportunity> {
    const opportunityId = opportunity._id as mongoose.Types.ObjectId;
    const meddpiccAgent = mastra.getAgent('meddpiccAgent');

    console.log(chalk.blue.bold(`  [Phase 4] Processing deal-level intelligence for opportunity ${opportunityId}...`));

    // 1. Update Opportunity MEDDPICC (Deal-level processing)
    console.log(chalk.cyan(`    -> Updating MEDDPICC for opportunity ${opportunityId}...`));
    try {
      // Parse the activity summary to extract relevance-scored MEDDPICC data
      let activityMeddpicc = null;
      try {
        const summaryData = JSON.parse(activitySummary);
        activityMeddpicc = summaryData.MEDDPICC || null;
      } catch (error) {
        console.log(chalk.yellow(`    -> Could not parse activity summary as JSON, treating as plain text`));
      }

      const meddpiccPrompt = `
      ## ACTIVITY SUMMARY WITH RELEVANCE-SCORED MEDDPICC DATA:
      ${activitySummary}

      ## EXTRACTED MEDDPICC FROM ACTIVITY (with relevance scores):
      ${activityMeddpicc ? JSON.stringify(activityMeddpicc, null, 2) : 'No MEDDPICC data found in activity'}
      
      ## CURRENT OPPORTUNITY MEDDPICC STATE:
      ${JSON.stringify(opportunity.meddpicc, null, 2)}

      ## INSTRUCTIONS:
      Analyze the activity's MEDDPICC data and determine what actions to take with the current opportunity MEDDPICC state.
      
      CRITICAL REMINDERS:
      - Use 'priorValue' field for REMOVE actions and UPDATE actions that change key field text
      - If you see duplicates in the current state, your PRIMARY job is to consolidate them using REMOVE + UPDATE
      - Respect entry caps: max 1 economicBuyer, 1-2 champion/process/criteria, 1-3 competition/pain
      - Only include High/Medium relevance items
      - Every action MUST have the 'action' field ('add', 'update', or 'remove')
      - Distinguish between seller offers and prospect requirements (attribution matters)
      
      Your focus areas:
      1. Consolidating duplicates in the current state (if any exist)
      2. Adding new High/Medium relevance information
      3. Updating existing information with better details
      4. Removing outdated or contradictory information
      `;
      
      const meddpiccResult = await this.aiAgentLimit(() => 
        meddpiccAgent.generateLegacy(
          [{ content: meddpiccPrompt, role: 'user' }],
          { output: MeddpiccAgentOutputSchema,
            providerOptions: {
              openai: {
                metadata: {
                  opportunityId: opportunityId.toString() || '',
                  file: 'contact-intelligence-service',
                  agent: 'meddpiccAgent',
                  orgId: (opportunity?.organization as any)?._id?.toString() || '',
                }
              }
            }
           }
        )
      );
      
      console.log(chalk.gray(`    -> MEDDPICC Agent Response:`, JSON.stringify(meddpiccResult.object, null, 2)));
      console.log(chalk.gray(`    -> MEDDPICC Agent Reasoning: ${meddpiccResult.object?.reasoning || 'No reasoning provided'}`));
      
      if (meddpiccResult.object?.MEDDPICC) {
        const { MEDDPICC: meddpiccActions } = meddpiccResult.object;

        if (!opportunity.meddpicc) {
          opportunity.meddpicc = {} as MEDDPICC;
        }

        let totalActionsApplied = 0;
        
        // Normalize string for comparison (lowercase, trim, collapse whitespace, normalize dashes)
        const normalizeKey = (str: string | undefined | null): string => {
          if (!str) return '';
          return str
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')          // Collapse multiple spaces
            .replace(/[–—]/g, '-')         // Normalize em/en dashes to hyphen
            .replace(/['']/g, "'");        // Normalize smart quotes
        };

        // Simple Levenshtein distance for fuzzy matching debugging
        const levenshteinDistance = (a: string, b: string): number => {
          const matrix: number[][] = [];
          for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
          }
          for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
          }
          for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
              if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
              } else {
                matrix[i][j] = Math.min(
                  matrix[i - 1][j - 1] + 1, // substitution
                  matrix[i][j - 1] + 1,     // insertion
                  matrix[i - 1][j] + 1      // deletion
                );
              }
            }
          }
          return matrix[b.length][a.length];
        };
        
        // Process each MEDDPICC field with the new action-based approach
        const processFieldActions = <T extends keyof MEDDPICC>(
          field: T, 
          keyField: string,
          actions: any[]
        ) => {
          if (!actions || !Array.isArray(actions) || actions.length === 0) return;

          // Ensure current field exists as array
          if (!opportunity.meddpicc![field] || !Array.isArray(opportunity.meddpicc![field])) {
            (opportunity.meddpicc![field] as any) = [];
          }
          
          const currentArray = opportunity.meddpicc![field] as any[];
          const initialCount = currentArray.length;

          // Sort actions: remove → update → add
          const sortedActions = [...actions].sort((a, b) => {
            const order: Record<string, number> = { remove: 0, update: 1, add: 2 };
            return (order[a.action] || 999) - (order[b.action] || 999);
          });

          for (const actionItem of sortedActions) {
            const { action, relevance, priorValue, ...itemData } = actionItem;
            
            // Skip Low relevance items
            if (relevance === 'Low') {
              console.log(chalk.yellow(`      -> Skipped ${field} action (Low relevance): ${itemData[keyField] || priorValue}`));
              continue;
            }

            switch (action) {
              case 'remove': {
                // Use priorValue to find exact match
                const valueToRemove = priorValue || itemData[keyField];
                const normalizedRemove = normalizeKey(valueToRemove);
                
                const indexToRemove = currentArray.findIndex(existing => 
                  normalizeKey((existing as any)[keyField]) === normalizedRemove
                );
                
                if (indexToRemove >= 0) {
                  const removed = currentArray.splice(indexToRemove, 1)[0];
                  totalActionsApplied++;
                  console.log(chalk.red(`      -> Removed ${field}: ${(removed as any)[keyField]}`));
                } else {
                  console.log(chalk.yellow(`      -> Could not find ${field} to remove: ${valueToRemove}`));
                  // Log closest matches for debugging
                  if (currentArray.length > 0) {
                    const distances = currentArray.map(item => ({
                      item: (item as any)[keyField],
                      distance: levenshteinDistance(normalizedRemove, normalizeKey((item as any)[keyField]))
                    }));
                    const closest = distances.sort((a, b) => a.distance - b.distance).slice(0, 3);
                    console.log(chalk.gray(`         Closest matches: ${closest.map(c => `"${c.item}" (distance: ${c.distance})`).join(', ')}`));
                  }
                }
                break;
              }

              case 'update': {
                // Use priorValue if provided (changing key text), otherwise use current keyField (updating in place)
                const valueToFind = priorValue || itemData[keyField];
                const normalizedFind = normalizeKey(valueToFind);
                
                const itemToUpdate = currentArray.find(existing => 
                  normalizeKey((existing as any)[keyField]) === normalizedFind
                );
                
                if (itemToUpdate) {
                  // Update existing item with new data (excluding action and priorValue)
                  const { action: _, priorValue: __, ...cleanItemData } = actionItem;
                  Object.assign(itemToUpdate, cleanItemData);
                  totalActionsApplied++;
                  const displayText = priorValue ? `${valueToFind} → ${itemData[keyField]}` : itemData[keyField];
                  console.log(chalk.cyan(`      -> Updated ${field}: ${displayText} (${relevance} relevance)`));
                } else {
                  // Item doesn't exist, treat as add
                  const { action: _, priorValue: __, ...cleanItemData } = actionItem;
                  currentArray.push(cleanItemData);
                  totalActionsApplied++;
                  console.log(chalk.green(`      -> Added new ${field} (update→add): ${itemData[keyField]} (${relevance} relevance)`));
                }
                break;
              }

              case 'add': {
                const normalizedNew = normalizeKey(itemData[keyField]);
                
                // Check if item already exists
                const existingItem = currentArray.find(existing => 
                  normalizeKey((existing as any)[keyField]) === normalizedNew
                );
                
                if (!existingItem) {
                  const { action: _, priorValue: __, ...cleanItemData } = actionItem;
                  currentArray.push(cleanItemData);
                  totalActionsApplied++;
                  console.log(chalk.green(`      -> Added new ${field}: ${itemData[keyField]} (${relevance} relevance)`));
                } else {
                  console.log(chalk.yellow(`      -> Skipped duplicate ${field}: ${itemData[keyField]}`));
                }
                break;
              }

              default:
                console.log(chalk.yellow(`      -> Unknown action "${action}" for ${field}: ${itemData[keyField]}`));
            }
          }

          // Post-processing dedup: keep only unique entries by normalized key
          const seen = new Map<string, any>();
          const deduped = currentArray.filter(item => {
            const normalized = normalizeKey((item as any)[keyField]);
            if (seen.has(normalized)) {
              console.log(chalk.yellow(`      -> Post-deduped ${field}: ${(item as any)[keyField]}`));
              return false;
            }
            seen.set(normalized, item);
            return true;
          });
          
          (opportunity.meddpicc![field] as any) = deduped;
          
          // Log summary
          const finalCount = deduped.length;
          if (initialCount !== finalCount || totalActionsApplied > 0) {
            console.log(chalk.gray(`      -> ${field}: ${initialCount} → ${finalCount} entries (${totalActionsApplied} actions applied)`));
          }
        };

        // Process all MEDDPICC fields
        processFieldActions('metrics', 'metric', meddpiccActions.metrics || []);
        processFieldActions('economicBuyer', 'name', meddpiccActions.economicBuyer || []);
        processFieldActions('decisionCriteria', 'criteria', meddpiccActions.decisionCriteria || []);
        processFieldActions('decisionProcess', 'process', meddpiccActions.decisionProcess || []);
        processFieldActions('paperProcess', 'process', meddpiccActions.paperProcess || []);
        processFieldActions('identifiedPain', 'pain', meddpiccActions.identifiedPain || []);
        processFieldActions('champion', 'name', meddpiccActions.champion || []);
        processFieldActions('competition', 'competition', meddpiccActions.competition || []);

        if (totalActionsApplied > 0) {
          opportunity.markModified('meddpicc');
          console.log(chalk.green(`    -> Successfully applied ${totalActionsApplied} MEDDPICC actions for opportunity ${opportunityId} (in-memory)`));
        } else {
          console.log(chalk.yellow(`    -> No MEDDPICC actions applied for opportunity ${opportunityId}`));
        }
      } else {
        console.log(chalk.yellow(`    -> No MEDDPICC actions found for opportunity ${opportunityId}`));
      }
    } catch (error) {
      console.error(chalk.red(`    -> Failed to update MEDDPICC:`, error));
      console.log(chalk.yellow(`    -> Continuing without MEDDPICC updates`));
    }

    // 2. Calculate and apply deal health indicators
    console.log(chalk.cyan(`    -> Calculating deal health indicators...`));
    try {
      const healthResult = DealAggregationService.calculateDealHealthIndicators(
        opportunity,
        allContactsData,
        activityDate
      );

      if (healthResult.proposedHealthUpdate) {
        const healthUpdate = healthResult.proposedHealthUpdate;
        
        // Apply deal temperature history (in-memory)
        if (!opportunity.dealTemperatureHistory) {
          opportunity.dealTemperatureHistory = [];
        }
        opportunity.dealTemperatureHistory.push(healthUpdate.dealTemperatureEntry);
        
        // Apply health trend and momentum direction (in-memory)
        opportunity.dealHealthTrend = healthUpdate.dealHealthTrend;
        opportunity.momentumDirection = healthUpdate.momentumDirection;
        
        opportunity.markModified('dealTemperatureHistory');
        opportunity.markModified('dealHealthTrend');
        opportunity.markModified('momentumDirection');
        
        console.log(chalk.green(`    -> Applied deal health indicators: Trend=${healthUpdate.dealHealthTrend}, Momentum=${healthUpdate.momentumDirection}, Temperature=${healthUpdate.dealTemperatureEntry.temperature} (in-memory)`));
      }
    } catch (error) {
      console.error(chalk.red(`    -> Failed to calculate deal health indicators:`, error));
      console.log(chalk.yellow(`    -> Continuing without health indicator updates`));
    }

    // 3. Generate and apply deal summary
    console.log(chalk.cyan(`    -> Generating deal summary...`));
    try {
      const summaryResult = await this.aiAgentLimit(() => DealSummaryService.generateDealSummary(
        opportunity,
        allContactsData
      ));

      if (summaryResult.proposedDealSummary) {
        const dealSummary = summaryResult.proposedDealSummary;
        
        // Apply deal narrative (in-memory)
        opportunity.latestDealNarrative = dealSummary.summary;
        
        if (!opportunity.dealNarrativeHistory) {
          opportunity.dealNarrativeHistory = [];
        }
        opportunity.dealNarrativeHistory.push({
          narrative: dealSummary.summary,
          date: dealSummary.generatedAt
        });
        
        opportunity.markModified('latestDealNarrative');
        opportunity.markModified('dealNarrativeHistory');
        
        console.log(chalk.green(`    -> Applied deal summary (in-memory)`));
      } else {
        console.log(chalk.yellow(`    -> No deal summary generated`));
      }
    } catch (error) {
      console.error(chalk.red(`    -> Failed to generate deal summary:`, error));
      console.log(chalk.yellow(`    -> Continuing without deal summary`));
    }

    console.log(chalk.green.bold(`  [Phase 4] Successfully processed deal-level intelligence for opportunity ${opportunityId}`));
    console.log(chalk.gray(`  [Phase 4] Applied updates summary:`));
    console.log(chalk.gray(`    - MEDDPICC: ${opportunity.meddpicc && Object.keys(opportunity.meddpicc).length > 0 ? 'Updated' : 'No Updates'}`));
    console.log(chalk.gray(`    - Health Indicators: ${opportunity.dealHealthTrend ? 'Applied' : 'Not Applied'}`));
    console.log(chalk.gray(`    - Deal Summary: ${opportunity.latestDealNarrative ? 'Generated and Applied' : 'Not Generated'}`));

    return opportunity;
  }

  /**
   * Phase 5: Transactional Save - Save all modified documents atomically.
   * This method takes all the in-memory modified documents from Phases 1-3 and saves them
   * atomically within a single transaction. This ensures that either all changes are saved
   * or none are saved, maintaining data consistency.
   * 
   * @param modifiedDocuments Array of all contact documents that were modified
   * @param modifiedOpportunity The opportunity document that was modified
   * @param activity The original activity document
   * @param activityId The ID of the activity being processed
   * @param session The MongoDB session for transaction consistency
   * @returns Promise that resolves when all documents are saved successfully
   */
  private static async executePhase5TransactionalSave(
    modifiedDocuments: Array<{ contact: IContact; opportunity: IOpportunity }>,
    activity: IActivity | IEmailActivity | ICalendarActivity,
    activityId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ): Promise<void> {
    console.log(chalk.blue.bold(`  [Phase 5] Starting transactional save for ${modifiedDocuments.length} contact-opportunity pairs...`));

    // Extract unique contacts and opportunities from the modified documents
    const contactsToSave = new Map<string, IContact>();
    const opportunitiesToSave = new Map<string, IOpportunity>();

    for (const { contact, opportunity } of modifiedDocuments) {
      contactsToSave.set(contact._id!.toString(), contact);
      opportunitiesToSave.set(opportunity._id!.toString(), opportunity);
    }

    console.log(chalk.cyan(`    -> Saving ${contactsToSave.size} unique contacts...`));
    // Save all modified contacts within the transaction
    for (const [contactId, contact] of contactsToSave) {
      try {
        await contact.save({ session });
        console.log(chalk.gray(`      -> Saved contact ${contactId}: ${contact.firstName} ${contact.lastName}`));
      } catch (error) {
        console.error(chalk.red(`      -> Failed to save contact ${contactId}:`), error);
        throw error; // Re-throw to abort the transaction
      }
    }

    console.log(chalk.cyan(`    -> Saving ${opportunitiesToSave.size} unique opportunities...`));
    // Save all modified opportunities within the transaction
    for (const [opportunityId, opportunity] of opportunitiesToSave) {
      try {
        // Update the lastIntelligenceUpdateTimestamp to indicate intelligence was just processed
        const activityDate = (activity as ICalendarActivity).startTime || activity.date || new Date();
        const now = new Date();
        
        // For future activities, use receivedViaWebhookAt to prevent future dates from blocking intelligence processing
        let timestampToUse = activityDate;
        if (activityDate > now && 'receivedViaWebhookAt' in activity && activity.receivedViaWebhookAt) {
          timestampToUse = activity.receivedViaWebhookAt;
        }
        if (timestampToUse > now) timestampToUse = now;
        
        opportunity.lastIntelligenceUpdateTimestamp = opportunity.lastIntelligenceUpdateTimestamp ?
          new Date(Math.max(opportunity.lastIntelligenceUpdateTimestamp.getTime(), timestampToUse.getTime())) :
          timestampToUse;
        await opportunity.save({ session });
        console.log(chalk.gray(`      -> Saved opportunity ${opportunityId}: ${opportunity.name || 'Unnamed'}`));
      } catch (error) {
        console.error(chalk.red(`      -> Failed to save opportunity ${opportunityId}:`), error);
        throw error; // Re-throw to abort the transaction
      }
    }

    console.log(chalk.cyan(`    -> Adding processedFor receipts to activity ${activityId}...`));
    // Add processedFor receipts to the activity document
    const newReceipts = modifiedDocuments.map(({ contact, opportunity }) => ({
      contactId: contact._id as mongoose.Types.ObjectId,
      opportunityId: opportunity._id as mongoose.Types.ObjectId,
      processedAt: new Date()
    }));

    // Update the activity document with the new receipts within the transaction
    try {
      if ('threadId' in activity) { // EmailActivity
        await EmailActivity.findByIdAndUpdate(
          activityId,
          { $addToSet: { processedFor: { $each: newReceipts } } },
          { session }
        );
      } else if ('startTime' in activity) { // CalendarActivity
        await CalendarActivity.findByIdAndUpdate(
          activityId,
          { $addToSet: { processedFor: { $each: newReceipts } } },
          { session }
        );
      } else { // Regular Activity
        await Activity.findByIdAndUpdate(
          activityId,
          { $addToSet: { processedFor: { $each: newReceipts } } },
          { session }
        );
      }

      console.log(chalk.green(`    -> Successfully added ${newReceipts.length} processedFor receipts to activity ${activityId}`));
    } catch (error) {
      console.error(chalk.red(`    -> Failed to add processedFor receipts to activity ${activityId}:`), error);
      throw error; // Re-throw to abort the transaction
    }

    console.log(chalk.green.bold(`  [Phase 5] Successfully completed transactional save for all documents`));
    console.log(chalk.gray(`  [Phase 5] Transaction summary:`));
    console.log(chalk.gray(`    - Contacts saved: ${contactsToSave.size}`));
    console.log(chalk.gray(`    - Opportunities saved: ${opportunitiesToSave.size}`));
    console.log(chalk.gray(`    - ProcessedFor receipts added: ${newReceipts.length}`));
  }

  /**
   * New 5-Phase Bullet-Proof Intelligence Processing Pipeline
   * Processes a new activity using the bullet-proof 5-phase model for maximum reliability.
   * This method replaces the old processActivityForIntelligence with better error handling.
   * 
   * @param activity The activity document (Activity, EmailActivity, or CalendarActivity) to process
   * @returns Promise that resolves to success status or throws an error
   */
  public static async processActivityForIntelligenceV2(
    activity: IActivity | IEmailActivity | ICalendarActivity
  ): Promise<{ success: boolean; processed: number }> {
    const activityId = activity._id as mongoose.Types.ObjectId;

    console.log(chalk.blue.bold(`[+] Processing activity ${activityId} using 5-phase bullet-proof pipeline...`));
    
    // Start a MongoDB transaction to ensure data consistency
    const session = await mongoose.startSession();
    
    // No top-level try/catch - let errors bubble up for proper handling by caller
    
      console.log(chalk.cyan(`  -> Summarising activity ${activityId}...`));
      // 1. Summarise the activity.
      await summariseActivity(activityId.toString());
  
      // Refetch the activity to get the newly created aiSummary.
      let updatedActivity: IActivity | IEmailActivity | ICalendarActivity | null = null;
      if ('threadId' in activity) { // Unique to EmailActivity
        updatedActivity = await EmailActivity.findById(activityId).session(session);
      } else if ('startTime' in activity) { // Unique to CalendarActivity
        updatedActivity = await CalendarActivity.findById(activityId).session(session);
      } else {
        updatedActivity = await Activity.findById(activityId).session(session);
      }
  
      if (!updatedActivity?.aiSummary?.summary) {
        throw new Error(`Could not generate or find summary for activity ${activityId}`);
      }
      
      const summary = updatedActivity.aiSummary.summary;
      console.log(chalk.gray(`  -> Summary generated successfully`));
      
      // Determine the activity's date for accurate timestamping
      const activityDate = (updatedActivity as ICalendarActivity).startTime || updatedActivity.date || new Date();

      // Find contacts for processing
      let contacts: IContact[] = [];
      contacts = await Contact.find({ _id: { $in: activity.contacts } }).session(session);
      if (contacts.length === 0) {
        const prospect = await Prospect.findById(activity.prospect).populate('contacts').session(session);
        if (prospect) {
          contacts = prospect.contacts as unknown as IContact[];
        }
      }

      // Collect all contact-opportunity pairs that need processing by finding opportunities for each contact in parallel.
      const pairFindingPromises = contacts.map(async (contact) => {
        console.log(chalk.blue(`[+] Analyzing contact ${contact.firstName} ${contact.lastName} for processing...`));

        const allOpportunities = await Opportunity.find({ contacts: contact._id }).populate('stage').session(session);

        let opportunities: IOpportunity[] = [];
        if (allOpportunities.length <= 1) {
          opportunities = allOpportunities;
        } else {
          const activeOpportunities = allOpportunities.filter(
            (opp) => {
              const stage = opp.stage as any;
              return !stage?.isClosedWon && !stage?.isClosedLost;
            }
          );

          if (activeOpportunities.length === 1) {
            opportunities = activeOpportunities;
          } else if (activeOpportunities.length > 1) {
            activeOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            opportunities = [activeOpportunities[0]];
            console.warn(chalk.yellow(`  -> Contact ${contact._id} is on multiple active opportunities. Using most recent: ${opportunities[0]._id}`));
          } else {
            allOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            opportunities = [allOpportunities[0]];
            console.log(chalk.yellow(`  -> Contact ${contact._id} has no active opportunities. Using most recent closed: ${opportunities[0]._id}`));
          }
        }

        const pairsForContact: Array<{ contact: IContact; opportunity: IOpportunity }> = [];
        for (const opportunity of opportunities) {
          if (!opportunity?._id) continue;
          const opportunityId = opportunity._id as mongoose.Types.ObjectId;

          // Check if this activity has already been processed
          const existingReceipt = updatedActivity.processedFor?.find(receipt =>
            receipt.contactId.equals(contact._id as mongoose.Types.ObjectId) &&
            receipt.opportunityId.equals(opportunityId)
          );

          if (existingReceipt) {
            console.log(chalk.yellow(`  -> Skipping contact ${contact._id} on opportunity ${opportunityId} - already processed`));
            continue;
          }

          pairsForContact.push({ contact, opportunity });
        }
        return pairsForContact;
      });

      const allFoundPairs = await Promise.all(pairFindingPromises);
      const contactOpportunityPairs = allFoundPairs.flat();

      if (contactOpportunityPairs.length === 0) {
        console.log(chalk.yellow(`[!] No contact-opportunity pairs to process for activity ${activityId}`));
        return { success: true, processed: 0 };
      }

      console.log(chalk.blue.bold(`[+] Starting 5-phase processing for ${contactOpportunityPairs.length} contact-opportunity pairs...`));

      // Prepare collection of modified documents for Phase 5
      const modifiedDocuments: Array<{ contact: IContact; opportunity: IOpportunity }> = [];
      const allContactsData: Array<{ contact: IContact; intelligence: IOpportunityIntelligence }> = [];

      // Orchestrate the processing of each contact-opportunity pair through Phases 1-3 in parallel, with concurrency control
      const processingPromises = contactOpportunityPairs.map(({ contact, opportunity }) =>
        this.contactProcessingLimit(async () => {
          console.log(chalk.blue.bold(`\n[PROCESSING] Contact ${contact._id} on Opportunity ${opportunity._id}`));

          // Phase 1: Intelligence Generation
          const phase1Data = await this.executePhase1IntelligenceGeneration(
            contact,
            opportunity,
            { _id: activityId, aiSummary: { summary }, date: activityDate } as IActivity,
            summary,
            activityDate
          );

          // Phase 2: Document Fetching
          const phase2Data = await this.executePhase2DocumentFetching(phase1Data, session);

          // Phase 3: Intelligence Application
          const phase3Data = await this.executePhase3IntelligenceApplication(
            phase2Data,
            activityId,
            activityDate
          );

          // Prepare data for collection after parallel processing
          const modifiedDocument = {
            contact: phase3Data.contact,
            opportunity: phase3Data.opportunity,
          };

          const intel = await phase3Data.contact.getOrCreateOpportunityIntelligence(
            phase3Data.opportunity._id as mongoose.Types.ObjectId
          );
          const contactData = {
            contact: phase3Data.contact,
            intelligence: intel,
          };
          
          return { modifiedDocument, contactData };
        })
      );


      const processedResults = await Promise.all(processingPromises);

      // Collect results from parallel processing
      for (const result of processedResults) {
        if (result) {
          modifiedDocuments.push(result.modifiedDocument);
          allContactsData.push(result.contactData);
        }
      }

      
      const uniqueOpportunities = new Map<string, IOpportunity>();
      for (const { opportunity } of modifiedDocuments) {
        uniqueOpportunities.set(opportunity._id!.toString(), opportunity);
      }

      for (const opportunity of uniqueOpportunities.values()) {
        const opportunityContactsData = allContactsData.filter(
          ({ contact }) => modifiedDocuments.some(
            ({ contact: modContact, opportunity: modOpp }) => 
              modContact._id!.toString() === contact._id!.toString() && 
              modOpp._id!.toString() === opportunity._id!.toString()
          )
        );

        const modifiedOpportunity = await this.executePhase4DealLevelProcessing(
          opportunity,
          opportunityContactsData,
          summary,
          activityDate
        );

        // Update the opportunity in modifiedDocuments
        for (const doc of modifiedDocuments) {
          if (doc.opportunity._id!.toString() === modifiedOpportunity._id!.toString()) {
            doc.opportunity = modifiedOpportunity;
          }
        }
      }
      const result = await session.withTransaction(async () => {
      // Phase 5: Transactional Save
      await this.executePhase5TransactionalSave(
        modifiedDocuments,
        updatedActivity,
        activityId,
        session
      );

      console.log(chalk.green.bold(`[+] Successfully completed 5-phase processing for activity ${activityId}`));
      return { success: true, processed: contactOpportunityPairs.length };
    });

    await session.endSession();
    return result;
  }
}
