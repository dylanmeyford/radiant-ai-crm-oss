import { z } from 'zod';
import { mastra } from '../../../mastra';
import { ActionPipelineContext } from './ActionPipelineService';
import { NextBestActionAgent, NextBestActionsResult } from './NextBestActionAgent';
import SalesPlaybook, { ContentType } from '../../../models/SalesPlaybook';
import chalk from 'chalk';
import mongoose from 'mongoose';
import { actionRegistry } from './possibleActions/index';
import { ContentCompositionAgent } from './ContentCompositionAgent';
import PipelineStage from '../../../models/PipelineStage';
import { CallActionDetailsSchema } from './possibleActions/CALL/schema';
import { EmailActionDetailsSchema } from './possibleActions/EMAIL/schema';
import { LinkedInMessageActionDetailsSchema } from './possibleActions/LINKEDIN MESSAGE/schema';
import { LookupActionDetailsSchema } from './possibleActions/LOOKUP/schema';
import { MeetingActionDetailsSchema } from './possibleActions/MEETING/schema';
import { NoActionDetailsSchema } from './possibleActions/NO_ACTION/schema';
import { TaskActionDetailsSchema } from './possibleActions/TASK/schema';
import { UpdatePipelineStageDetailsSchema } from './possibleActions/UPDATE_PIPELINE_STAGE/schema';

// Safely merge update objects into a base object while preserving existing values
// when the incoming update has undefined or null. Only defined, non-null values
// in updates will overwrite base.
function mergePreservingDefined<T extends Record<string, any>>(base: T, updates: Partial<T>): T {
  const filteredEntries = Object.entries(updates ?? {}).filter(([, value]) => value !== undefined && value !== null);
  const filteredUpdates = Object.fromEntries(filteredEntries) as Partial<T>;
  return { ...(base as object), ...(filteredUpdates as object) } as T;
}


// Schema for action evaluation decision
const ModifiedDetailsSchema = z
  .union([
    EmailActionDetailsSchema,
    CallActionDetailsSchema,
    MeetingActionDetailsSchema,
    LinkedInMessageActionDetailsSchema,
    TaskActionDetailsSchema,
    LookupActionDetailsSchema,
    UpdatePipelineStageDetailsSchema,
    NoActionDetailsSchema,
    z.string().min(2),
  ])
  .describe(
    'Modified details if decision is MODIFY. Provide a draft object that matches the action type schema or a JSON string that parses to a non-empty object.'
  );

const ActionEvaluationDecisionSchema = z.object({
  actionId: z.string().describe('ID of the existing action being evaluated'),
  decision: z.enum(['KEEP', 'CANCEL', 'MODIFY']).describe('Decision for this action'),
  reasoning: z.string().min(10).max(300).describe('Reasoning for the decision'),
  modifiedDetails: ModifiedDetailsSchema.describe(
    'Modified details if decision is MODIFY. Structure must match the action type. Must not be empty.'
  ),
  actionStrategy: z.string().nullable().describe('Content guidance for modifications. Use "NO_MATERIAL_NEEDED: [guidance]" if no assets are required, or describe primary/secondary/fallback content plan. Null for KEEP/CANCEL decisions.')
});

// Schema for calendar event evaluation decision
const CalendarEventEvaluationSchema = z.object({
  eventId: z.string().describe('ID of the calendar event being evaluated'),
  decision: z.enum(['KEEP', 'CANCEL', 'RESCHEDULE']).describe('Decision for this event'),
  reasoning: z.string().min(10).max(300).describe('Reasoning for the decision'),
  newScheduledTime: z.string().nullable().describe('New time if rescheduling (ISO format)')
});

// Main evaluation result schema
const ActionEvaluationResultSchema = z.object({
  existingActionDecisions: z.array(ActionEvaluationDecisionSchema)
    .describe('Decisions for existing proposed actions'),
  calendarEventDecisions: z.array(CalendarEventEvaluationSchema)
    .describe('Decisions for future calendar events'),
  needsNewActions: z.boolean()
    .describe('Whether new actions are needed based on the evaluation'),
  newActionJustification: z.string().nullable()
    .describe('If needsNewActions is true, explain what type of new actions are needed and why'),
  overallAssessment: z.string().min(50).max(500)
    .describe('Overall assessment of the situation and strategy')
});

export type ActionEvaluationResult = z.infer<typeof ActionEvaluationResultSchema>;

export interface ActionEvaluationResponse {
  evaluation: ActionEvaluationResult;
  newActions?: NextBestActionsResult;
}

export interface ActionEvaluationContext extends ActionPipelineContext {
  evaluationTrigger?: string; // Why this evaluation was triggered
}

export class ActionEvaluationAgent {
  /**
   * Computes a richness score for a decision based on its modifiedDetails content.
   * Higher scores indicate more complete/detailed modifications.
   * 
   * @param decision The action evaluation decision
   * @returns Numeric richness score
   */
  private static computeDecisionRichness(decision: ActionEvaluationResult['existingActionDecisions'][0]): number {
    // MODIFY with object modifiedDetails gets priority
    if (decision.decision !== 'MODIFY' || !decision.modifiedDetails || typeof decision.modifiedDetails !== 'object') {
      return 0;
    }

    const details = decision.modifiedDetails as any;
    let score = 0;

    // Count defined top-level keys
    score += Object.keys(details).filter(key => details[key] !== undefined && details[key] !== null).length;

    // Add length-based scoring for key fields
    if (details.subject && typeof details.subject === 'string') {
      score += details.subject.length;
    }
    if (details.body && typeof details.body === 'string') {
      score += details.body.length;
    }
    if (Array.isArray(details.to)) {
      score += details.to.length;
    }
    if (Array.isArray(details.cc)) {
      score += details.cc.length;
    }
    if (Array.isArray(details.attachments)) {
      score += details.attachments.length;
    }

    return score;
  }

  /**
   * Deduplicates decisions by actionId, keeping the richest decision per action.
   * When multiple decisions target the same action, selects based on:
   * 1. Prefer MODIFY with object modifiedDetails
   * 2. Higher richness score (keys + content length)
   * 3. Last in input order (tie-breaker)
   * 
   * @param decisions Array of action evaluation decisions
   * @returns Deduplicated array with one decision per actionId
   */
  private static deduplicateDecisions(
    decisions: ActionEvaluationResult['existingActionDecisions']
  ): ActionEvaluationResult['existingActionDecisions'] {
    const decisionsByActionId = new Map<string, typeof decisions>();

    // Group decisions by actionId
    for (const decision of decisions) {
      const existing = decisionsByActionId.get(decision.actionId) || [];
      existing.push(decision);
      decisionsByActionId.set(decision.actionId, existing);
    }

    const deduplicated: typeof decisions = [];
    let dedupeCount = 0;

    // Select richest decision per actionId
    const entries = Array.from(decisionsByActionId.entries());
    for (const [actionId, actionDecisions] of entries) {
      if (actionDecisions.length === 1) {
        deduplicated.push(actionDecisions[0]);
        continue;
      }

      // Multiple decisions for same action - select richest
      dedupeCount += actionDecisions.length - 1;
      
      const richest = actionDecisions.reduce((best, current, index) => {
        const bestScore = this.computeDecisionRichness(best);
        const currentScore = this.computeDecisionRichness(current);
        
        // Higher score wins; tie goes to later decision (higher index)
        if (currentScore > bestScore || (currentScore === bestScore && index > actionDecisions.indexOf(best))) {
          return current;
        }
        return best;
      });

      console.log(chalk.cyan(`      -> Deduped ${actionDecisions.length} decisions for action ${actionId}, kept ${richest.decision} (score: ${this.computeDecisionRichness(richest)})`));
      deduplicated.push(richest);
    }

    if (dedupeCount > 0) {
      console.log(chalk.yellow(`    -> Deduplicated ${dedupeCount} duplicate decision(s) across ${decisionsByActionId.size} action(s)`));
    }

    return deduplicated;
  }

  /**
   * Evaluates existing actions and calendar events in light of new activities,
   * deciding which to keep, cancel, modify. If new actions are needed,
   * calls the NextBestActionAgent to generate them.
   * 
   * @param context The comprehensive action pipeline context
   * @param maxAttempts Maximum number of attempts before falling back
   * @returns Promise resolving to evaluation decisions and optional new actions
   */
  public static async evaluateActions(
    context: ActionEvaluationContext, 
    maxAttempts: number = 3
  ): Promise<ActionEvaluationResponse> {
    console.log(chalk.blue.bold(`[ACTION EVALUATION AGENT] Evaluating actions for opportunity ${context.opportunity._id}...`));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(chalk.cyan(`  -> Attempt ${attempt}/${maxAttempts}: Generating evaluation decisions...`));

        const evaluationAgent = mastra.getAgent('actionEvaluationAgent');
        if (!evaluationAgent) {
          throw new Error('ActionEvaluationAgent not found in mastra configuration');
        }

        const contextPrompt = await this.buildEvaluationPrompt(context, attempt, maxAttempts);
        console.log(chalk.cyan(`    -> Generated evaluation prompt (${contextPrompt.length} characters)`));

        const result = await evaluationAgent.generateLegacy(
          [{ content: contextPrompt, role: 'user' }],
          { 
            output: ActionEvaluationResultSchema,
            providerOptions: {
              openai: {
                metadata: {
                  opportunityId: (context.opportunity as any)?._id?.toString() || '',
                  file: 'action-evaluation-agent',
                  agent: 'actionEvaluationAgent',
                  orgId: (context.opportunity.organization as any)?._id?.toString() || '',
                }
              }
            }
          }
        );

        const evaluation = result.object;
        console.log(chalk.green(`    -> AI evaluation completed:`));
        console.log(chalk.gray(`      - Existing actions evaluated: ${evaluation.existingActionDecisions.length}`));
        console.log(chalk.gray(`      - Calendar events evaluated: ${evaluation.calendarEventDecisions.length}`));
        console.log(chalk.gray(`      - Needs new actions: ${evaluation.needsNewActions}`));

        console.log(chalk.cyan(`    -> Validating evaluation decisions...`));
        const validatedEvaluation = await this.validateEvaluationDecisions(evaluation, context);

        if (validatedEvaluation) {
          console.log(chalk.green.bold(`[ACTION EVALUATION AGENT] Successfully validated evaluation on attempt ${attempt}`));
          
          // Compose content for modified actions
          console.log(chalk.cyan(`    -> Composing content for modified actions...`));
          const evaluationWithContent = await this.composeContentForModifiedActions(validatedEvaluation, context);
          
          let newActions: NextBestActionsResult | undefined;
          if (evaluationWithContent.needsNewActions) {
            console.log(chalk.cyan(`    -> New actions needed, calling NextBestActionAgent...`));
            try {
              newActions = await NextBestActionAgent.decideNextActions(context);
              console.log(chalk.green(`    -> NextBestActionAgent generated ${newActions.actions.length} new action(s)`));
            } catch (error) {
              console.error(chalk.red(`    -> Error generating new actions:`), error);
              console.log(chalk.yellow(`    -> Continuing with evaluation only...`));
            }
          }
          
          return {
            evaluation: evaluationWithContent,
            newActions
          };
        } else {
          console.log(chalk.yellow(`    -> Validation failed on attempt ${attempt}, retrying...`));
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }

      } catch (error) {
        console.error(chalk.red(`    -> Error on attempt ${attempt}:`), error);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }
    }

    console.log(chalk.yellow(`[ACTION EVALUATION AGENT] All attempts failed, generating fallback evaluation...`));
    const fallbackEvaluation = this.generateFallbackEvaluation(context);
    return {
      evaluation: fallbackEvaluation,
      newActions: undefined
    };
  }

  /**
   * Validates evaluation decisions against the actual context data.
   * 
   * @param evaluation Raw AI evaluation
   * @param context The action pipeline context
   * @returns Validated evaluation or null if invalid
   */
  private static async validateEvaluationDecisions(
    evaluation: ActionEvaluationResult,
    context: ActionEvaluationContext
  ): Promise<ActionEvaluationResult | null> {
    console.log(chalk.blue(`    -> Validating evaluation decisions...`));

    const validActionIds = new Set(context.existingActions.map(action => (action._id as mongoose.Types.ObjectId).toString()));
    const validEventIds = new Set(context.futureEvents.map(event => (event._id as mongoose.Types.ObjectId).toString()));
    
    const validContactEmails = new Set(
      context.contacts.flatMap(({ contact }) => contact.emails?.map(email => email.address) || [])
    );
    const validEmailActivityIds = new Set(
      context.recentActivities
        .filter(activity => 'threadId' in activity)
        .map(activity => (activity._id as mongoose.Types.ObjectId).toString())
    );

    const validActionDecisions = (await Promise.all(evaluation.existingActionDecisions.map(async decision => {
      if (!validActionIds.has(decision.actionId)) {
        console.log(chalk.yellow(`      -> Invalid action ID: ${decision.actionId}`));
        return null;
      }

      // CANCEL and KEEP decisions don't need complex validation
      if (decision.decision === 'CANCEL' || decision.decision === 'KEEP') {
        console.log(chalk.green(`      -> ${decision.decision} decision for action ${decision.actionId} is valid`));
        return decision;
      }

      // Only MODIFY decisions need detailed validation
      if (decision.decision === 'MODIFY' && decision.modifiedDetails) {
        const action = context.existingActions.find(a => (a._id as mongoose.Types.ObjectId).toString() === decision.actionId);
        if (action) {
          const handler = actionRegistry.getHandler(action.type);
          if (handler) {
            // Handle case where modifiedDetails might be a string that needs parsing
            let parsedDetails = decision.modifiedDetails;
            if (typeof decision.modifiedDetails === 'string') {
              try {
                parsedDetails = JSON.parse(decision.modifiedDetails);
                console.log(chalk.cyan(`      -> Parsed string modifiedDetails for action ${decision.actionId}`));
              } catch (error) {
                console.log(chalk.yellow(`      -> Failed to parse modifiedDetails string for action ID: ${decision.actionId}`));
                return null;
              }
            }

            // Reject empty or non-actionable modification objects to avoid silent no-op MODIFY decisions
            const isNonEmptyObject = (value: any) =>
              value &&
              typeof value === 'object' &&
              Object.keys(value).length > 0;

            const nonActionKeys = new Set(['actionId', 'decision', 'reasoning', 'actionStrategy']);
            const hasActionableFields =
              isNonEmptyObject(parsedDetails) &&
              Object.keys(parsedDetails).some((key) => !nonActionKeys.has(key));

            if (!hasActionableFields) {
              const keys = isNonEmptyObject(parsedDetails) ? Object.keys(parsedDetails).join(', ') : 'none';
              console.log(
                chalk.yellow(
                  `      -> MODIFY decision for action ${decision.actionId} missing actionable fields (keys: ${keys}), rejecting`
                )
              );
              return null;
            }
            
            const mergedDetails = mergePreservingDefined(action.details as any, parsedDetails as any);
            const mockAction = { type: action.type, details: mergedDetails };
            const validatedDetails = await handler.validateDetails(mockAction as any, context, validContactEmails, validEmailActivityIds);
            if (!validatedDetails) {
              console.log(chalk.yellow(`      -> Invalid modified details for action ID: ${decision.actionId}`));
              return null; // Discard modification if details are invalid
            }
            decision.modifiedDetails = validatedDetails;
          }
        }
      } else if (decision.decision === 'MODIFY' && !decision.modifiedDetails) {
        console.log(chalk.yellow(`      -> MODIFY decision for action ${decision.actionId} missing modifiedDetails`));
        return null;
      }
      
      return decision;
    }))).filter(d => d !== null) as ActionEvaluationResult['existingActionDecisions'];


    const validEventDecisions = evaluation.calendarEventDecisions.filter(decision => {
      const isValid = validEventIds.has(decision.eventId);
      if (!isValid) {
        console.log(chalk.yellow(`      -> Invalid event ID: ${decision.eventId}`));
      }
      return isValid;
    });

    // Deduplicate decisions by actionId, keeping the richest one
    console.log(chalk.cyan(`    -> Deduplicating decisions by actionId...`));
    const dedupedActionDecisions = this.deduplicateDecisions(validActionDecisions);

    console.log(chalk.green(`    -> Validation complete:`));
    console.log(chalk.gray(`      - Valid action decisions: ${validActionDecisions.length}/${evaluation.existingActionDecisions.length}`));
    console.log(chalk.gray(`      - Deduplicated action decisions: ${dedupedActionDecisions.length}`));
    console.log(chalk.gray(`      - Valid event decisions: ${validEventDecisions.length}/${evaluation.calendarEventDecisions.length}`));

    return {
      ...evaluation,
      existingActionDecisions: dedupedActionDecisions,
      calendarEventDecisions: validEventDecisions,
    };
  }

  /**
   * Composes content for all modified actions using ContentCompositionAgent.
   * 
   * @param evaluation Validated evaluation result
   * @param context Action pipeline context
   * @returns Evaluation with composed content in modified actions
   */
  private static async composeContentForModifiedActions(
    evaluation: ActionEvaluationResult,
    context: ActionEvaluationContext
  ): Promise<ActionEvaluationResult> {
    console.log(chalk.blue(`    -> Composing content for ${evaluation.existingActionDecisions.filter(d => d.decision === 'MODIFY').length} modified actions...`));

    const updatedDecisions = await Promise.all(
      evaluation.existingActionDecisions.map(async (decision) => {
        if (decision.decision !== 'MODIFY' || !decision.modifiedDetails) {
          return decision;
        }

        try {
          const action = context.existingActions.find(a => (a._id as mongoose.Types.ObjectId).toString() === decision.actionId);
          if (!action) {
            console.log(chalk.yellow(`      -> Action ${decision.actionId} not found, skipping content composition`));
            return decision;
          }

          // Merge modified details with existing action details
          const mergedDetails = mergePreservingDefined(action.details as any, decision.modifiedDetails as any);
          console.log(
            chalk.gray(
              `      -> Draft fields for ${action.type}: ${Object.keys(decision.modifiedDetails as any).join(', ') || 'none'}`
            )
          );
          
          // Create a mock action with merged details for content composition
          const mockAction: any = {
            id: decision.actionId,
            type: action.type as any,
            details: mergedDetails,
            reasoning: decision.reasoning,
            sourceActivityIds: (action as any).sourceActivityIds || [],
            priority: (action as any).priority || 1,
            actionStrategy: (decision as any).actionStrategy || (action as any).actionStrategy || ''
          };

          console.log(chalk.cyan(`      -> Composing content for modified ${action.type} action...`));
          const composedContent = await (ContentCompositionAgent as any).composeContentForAction(mockAction, context);
          
          if (composedContent) {
            const contentToMerge = (ContentCompositionAgent as any).extractSchemaResult(composedContent);
            decision.modifiedDetails = { ...mergedDetails, ...(contentToMerge || {}) };
            console.log(chalk.green(`      -> ✓ Content composed for modified ${action.type}`));
          }

          return decision;
        } catch (error) {
          console.error(chalk.red(`      -> Error composing content for modified action ${decision.actionId}:`), error);
          return decision;
        }
      })
    );

    return {
      ...evaluation,
      existingActionDecisions: updatedDecisions
    };
  }

  /**
   * Generates a fallback evaluation when AI attempts fail.
   * 
   * @param context The action pipeline context
   * @returns Fallback evaluation
   */
  private static generateFallbackEvaluation(context: ActionEvaluationContext): ActionEvaluationResult {
    console.log(chalk.yellow(`    -> Generating conservative fallback evaluation...`));

    const actionDecisions = context.existingActions.map(action => ({
      actionId: (action._id as mongoose.Types.ObjectId).toString(),
      decision: 'KEEP' as const,
      reasoning: 'Fallback: keeping existing action for manual review',
      modifiedDetails: '{}',
      actionStrategy: null
    }));

    const eventDecisions = context.futureEvents.map(event => ({
      eventId: (event._id as mongoose.Types.ObjectId).toString(),
      decision: 'KEEP' as const,
      reasoning: 'Fallback: keeping scheduled event for manual review',
      newScheduledTime: null
    }));

    return {
      existingActionDecisions: actionDecisions,
      calendarEventDecisions: eventDecisions,
      needsNewActions: context.recentActivities.length > 0,
      newActionJustification: context.recentActivities.length > 0 
        ? 'AI evaluation failed. Manual review needed to determine appropriate new actions based on recent activities.'
        : null,
      overallAssessment: 'AI evaluation failed. Manual review recommended to assess current actions and plan next steps based on recent activities.'
    };
  }

  /**
   * Builds the evaluation prompt for the AI agent.
   * 
   * @param context The action pipeline context
   * @param attempt Current attempt number
   * @param maxAttempts Maximum attempts
   * @returns Formatted prompt string
   */
  private static async buildEvaluationPrompt(
    context: ActionEvaluationContext, 
    attempt: number = 1, 
    maxAttempts: number = 3
  ): Promise<string> {
    const { opportunity, contacts, recentActivities, futureEvents, dealIntelligence, existingActions } = context;

    const businessInformation = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.BUSINESS_INFORMATION });
    const productInformation = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.PRODUCT_INFO });
    const productOverview = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.PRODUCT_OVERVIEW });
    const salesProcess = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.SALES_PROCESS });

    // Fetch all pipeline stages for the opportunity's pipeline to help AI understand stage progression
    const pipelineStages = await PipelineStage.find({ pipeline: opportunity.pipeline }).sort({ order: 1 });
    const currentStageName = (opportunity.stage as any)?.name || 'Unknown';
    const pipelineStagesSummary = pipelineStages.map((stage) => {
      const isCurrent = stage._id.toString() === ((opportunity.stage as any)?._id?.toString() || opportunity.stage.toString());
      return `${isCurrent ? '**[CURRENT STAGE]** ' : ''}Stage: ${stage.name} (ID: ${stage._id})
        Order: ${stage.order}
        Description: ${stage.description || 'No description'}
        ${stage.isClosedWon ? 'This is a CLOSED WON stage - deal is won. Opportunity cannot be moved from this stage.' : ''}
        ${stage.isClosedLost ? 'This is a CLOSED LOST stage - deal is lost. Opportunity cannot be moved from this stage' : ''}`;
    }).join('\n\n');

    const contactsSummary = contacts.map(({ contact, intelligence }) => {
      const latestRole = intelligence.roleAssignments?.length > 0
        ? intelligence.roleAssignments[intelligence.roleAssignments.length - 1].role
        : 'Unknown';

      return `- ${contact.firstName} ${contact.lastName} (${contact.emails?.[0]?.address || 'No email'})
        Role: ${contact.contactResearch?.roleAtCompany}
        Deal Role: ${latestRole}
        Engagement Score: ${intelligence.engagementScore || 'Not specified'}
        Responsiveness: ${intelligence.responsiveness?.[intelligence.responsiveness.length - 1]?.status || 'Unknown'}
        Relationship Story: ${intelligence.relationshipStory || 'No story available'}
        Contact Research: ${contact.contactResearch ? JSON.stringify(contact.contactResearch.personalSummary) : 'No contact research available.'}`;
    }).join('\n');

    const newActivitiesSummary = recentActivities.slice(0, 10).reverse().map((activity) => {
      const id = (activity._id as mongoose.Types.ObjectId).toString();
      let activityType: string;
      if ('threadId' in activity) {
        activityType = 'EMAIL';
      } else if ('startTime' in activity) {
        const hasTranscript = 'transcriptionText' in activity && !!(activity as any).transcriptionText;
        activityType = hasTranscript ? 'MEETING - COMPLETED WITH TRANSCRIPT' : 'CALENDAR';
      } else {
        activityType = 'ACTIVITY';
      }
      const threadId = 'threadId' in activity ? activity.threadId : null;
      const replyToMessageId = 'messageId' in activity ? activity.messageId : null;
      const summary = activity.aiSummary?.summary || activity.title || 'No summary available';
      return `ID: ${id} - [${activityType}] ${activity.date.toISOString()}
        ${threadId ? `ThreadID: ${threadId}` : ''}
        ${replyToMessageId ? `messageId: ${replyToMessageId}` : ''}
        Summary: ${summary}`
    }).join('\n');

    const existingActionsSummary = existingActions.map((action) => {
      const details = action.details as any;
      const scheduledTime = details?.scheduledFor || details?.dueDate || 'Not scheduled';
      const priority = (action as any).priority || 'Not specified';
      const { workflowMetadata, ...detailsWithoutWorkflowMetadata } = action.details as any;
      const lastEditInfo = (action as any).lastEditedBy
        ? `Last edited by: ${(action as any).lastEditedBy.type} at ${(action as any).lastEditedBy.at?.toISOString() || 'unknown'}`
        : 'No edit history';
      return `ID: ${(action._id as mongoose.Types.ObjectId).toString()} - [${action.type}] 
        Status: ${action.status} | Priority: ${priority}
        Scheduled: ${scheduledTime}
        Reasoning: ${action.reasoning}
        ActionStrategy: ${(action as any).actionStrategy || 'Not specified'}
        ${lastEditInfo}
        Details: ${JSON.stringify(detailsWithoutWorkflowMetadata)}`;
    }).join('\n');

    const futureEventsSummary = futureEvents.map((event) => {
      return `ID: ${event._id} - ${event.title}
        Start: ${event.startTime.toISOString()} | Duration: ${event.duration || 'Unknown'} mins
        Attendees: ${event.attendees.map(a => a.email).join(', ')}
        Status: ${event.status}`;
    }).join('\n');

    const attemptInfo = attempt > 1 ?
      `\n## RETRY ATTEMPT ${attempt}/${maxAttempts}
This is retry attempt ${attempt} of ${maxAttempts}. Previous attempts failed validation. Please be extra careful to:
- Use only the exact action IDs, event IDs, and activity IDs provided.
- Use only the exact email addresses listed in the STAKEHOLDERS section.
- Ensure any modifiedDetails have the correct structure for that action type.
- For EMAIL modifications, verify threadId and replyToMessageId match actual EMAIL activities.
- Apply the strategic evaluation framework systematically.\n` : '';

    return `
<role>
  You are an elite B2B sales strategist conducting a focused evaluation of existing sales actions and calendar events in light of new developments.
</role>
<todays_date>
  Today's Date: ${new Date().toISOString().split('T')[0]}. Time is ${new Date().toISOString().split('T')[1]}.
</todays_date>
${attemptInfo ? `<attempt_info>${attemptInfo}</attempt_info>` : ''}
<business_and_products_context>
  <our_business>
    Information about our business.
    ${businessInformation.map((info) => info.content).join('\n')}
  </our_business>
  <our_products>
    Information about our products.
    ${productOverview.map((info) => info.content).join('\n')}
    ${productInformation.map((info) => info.content).join('\n')}
  </our_products>
  <our_sales_process>
    Information about our sales process.
    ${salesProcess.map((info) => info.content).join('\n')}
  </our_sales_process>
</business_and_products_context>
<this_opportunity>
  <name>${opportunity.name || 'Unnamed Opportunity'}</name>
  <current_stage>${currentStageName}</current_stage>
  <value>$${opportunity.amount || 'Not specified'}</value>
  <meddpicc_status>${opportunity.meddpicc}</meddpicc_status>
  <description>${opportunity.description || 'No description available'}</description>
  <opportunity_stakeholders>
    ${contactsSummary}
  </opportunity_stakeholders>
  <new_activities>
    What just happened - requiring evaluation response
    ${newActivitiesSummary || 'No new activities'}
  </new_activities>
  <existing_proposed_actions>
    Currently planned actions - need evaluation
    ${existingActionsSummary || 'No existing actions'}
  </existing_proposed_actions>
  <future_calendar_events>
    Currently scheduled events - need evaluation
    ${futureEventsSummary || 'No future events'}
  </future_calendar_events>
  <deal_intelligence>
    ${dealIntelligence ? JSON.stringify(dealIntelligence, null, 2) : 'No deal intelligence available'}
  </deal_intelligence>
</this_opportunity>
<instructions>
  Your mission is to evaluate existing actions and calendar events in light of new activities, deciding which to keep, cancel, or modify.
</instructions>
<available_action_types>
  Here are the types of actions we can take:
  ${actionRegistry.getAllHandlers().map((handler) => `- ${handler.name}: ${handler.description}`).join('\n')}
</available_action_types>
<strategic_evaluation_framework>
  <step_0_user_edit_protection>
    BEFORE evaluating any action, check for recent user edits:
    1. If an action shows "Last edited by: USER" in its metadata:
       - Compare the edit timestamp against the dates of activities in <new_activities>
       - Identify INBOUND activities (emails/messages FROM the prospect, not from us)
    2. If the user edit is MORE RECENT than any inbound activity (or no inbound activity exists):
       - The user has made deliberate, intentional changes
       - Decision MUST be KEEP - do not modify the user's work
       - Reasoning should note: "Respecting recent user edit - no new inbound activity since edit"
    3. If there IS inbound activity AFTER the user's edit:
       - The situation has changed since the user made their edit
       - Normal evaluation proceeds - MODIFY is acceptable if warranted
    This protects users who manually schedule emails (e.g., choosing specific times
    because they'll be away) from having the AI override their intentional choices.
  </step_0_user_edit_protection>
  <step_1_situational_impact_analysis>
    Analyze what has fundamentally changed since our existing actions were planned:
    - First, check if any scheduled events have already occurred.
    - Do the new activities represent positive momentum, obstacles, or neutral updates?
    - Are there urgent signals requiring immediate attention or strategy pivots?
    - Has the prospect responded to our last communication?
    - Are there new stakeholders or information to consider?
  </step_1_situational_impact_analysis>
  <step_2_action_relevance_evaluation>
    For each existing action, determine:
    <keep_criteria>
      - Action remains strategically relevant and timing is still appropriate
      - No new developments invalidate or supersede this action
      - Action aligns with current deal strategy and stage
      - **User recently edited this action** and no inbound prospect activity has occurred since their edit
    </keep_criteria>
    <cancel_criteria>
      - New activities have already addressed this action's objective
      - Action is no longer relevant or appropriate given new context
      - Action would be redundant or counterproductive
      - Our last activity was recent enough that this would be too much communication
      - **The event this action is preparing for has already occurred** (e.g., pre-demo email when demo is complete)
      - **Action references a past event as if it's future** (check dates in new_activities)
      - Action has significant overlap with another existing action and can be consolidated
      - Multiple actions are addressing the same deliverable/objective - keep the most comprehensive one
    </cancel_criteria>
    <consolidation_priority>
    When multiple actions of the same type address overlapping deliverables:
    - CANCEL the less comprehensive tasks
    - MODIFY the most comprehensive task to include all requirements
    - Prefer a single consolidated task over multiple granular tasks
    Example: If Task A = "Prepare video" and Task B = "Prepare video + webinar + onboarding", 
    CANCEL Task A and MODIFY Task B to be complete
  </consolidation_priority>
    <modify_criteria>
      - Core action is still needed but details require adjustments
      - Timing needs to change based on new developments
      - Recipients or content approach should be updated
      - Action needs to incorporate new information or context
    </modify_criteria>
    <before_deciding>
    Before evaluating each action:
    1. Review ALL existing actions of the same type
    2. Identify any overlapping objectives or deliverables
    3. If consolidation is possible, CANCEL redundant actions and MODIFY one comprehensive action
    4. Only after consolidation, evaluate what remains for KEEP/CANCEL/MODIFY
  </before_deciding>
  </step_2_action_relevance_evaluation>
  <step_3_email_threading_policy>
    When modifying EMAIL actions, follow these threading rules:
    <default_behavior>
      - Default: reply in the existing thread
      - Always select the latest EMAIL as the reply target (the most recent EMAIL item in <new_activities>)
    </default_behavior>
    <when_replying>
      - Set details.replyToMessageId to that EMAIL's "messageId" value as shown in <new_activities>
      - Set details.threadId to that EMAIL's "threadId" value as shown in <new_activities>
    </when_replying>
    <when_to_reboot_new_thread>
      Only start a new thread ("reboot") if:
      - The prospect is ghosting (no prospect response in ≥20 days AND at least 3 follow-ups from us in that same thread after their last reply)
      - We are emailing a new, separate contact
      - The topic must clearly change
      - If rebooting: omit details.replyToMessageId & threadId
    </when_to_reboot_new_thread>
  </step_3_email_threading_policy>
  <step_4_modification_vs_new_action_rules>
    <critical_decision_point>
      ALWAYS MODIFY when:
      - An existing action of the same type can be updated to address new needs
      - The core purpose remains the same, only details need adjustment
      - An existing EMAIL action can be updated with new content/timing/recipients
      - An existing TASK can be updated with new details or dates
    </critical_decision_point>
    <only_create_new_when>
      - You need a completely different action type (e.g., EMAIL exists but now need TASK)
      - You need to target different stakeholders not covered by existing actions
      - The objective is fundamentally different from any existing action
      - You want to change a TASK into an EMAIL (or vice versa) - this requires CANCEL + needsNewActions=true
    </only_create_new_when>
    <forbidden_modifications>
      - NEVER try to MODIFY an action to change its type (e.g. changing a TASK to an EMAIL).
      - Instead: CANCEL the original action and set needsNewActions=true to generate the new action type.
    </forbidden_modifications>
    <examples_of_modify_not_new>
      - Existing: Email to Sebastian about meeting → MODIFY to add security brief attachment
      - Existing: Follow-up email scheduled → MODIFY to adjust timing or incorporate prospect's response
      - Existing: Task to prepare demo → MODIFY to update preparation details based on new requirements
      - Existing: Email asking for meeting → MODIFY to respond to their meeting time suggestion
    </examples_of_modify_not_new>
    <examples_requiring_new>
      - Existing: Email to CEO → NEW: Separate email to procurement team
      - Existing: Email action → NEW: Task to prepare custom ROI calculator
      - Existing: Email about feature X → NEW: Email about completely different topic Y
      - Existing: No Action wait until next week → NEW: Client responded with a request to connect next quarter = Email to confirm waiting & propose times.
      - Existing: Pre-Demo email → NEW: Demo has occurred = Email to follow up post demo and schedule email for a discussed time in the future..
      - Existing: Task to send email → NEW: Cancel Task, set needsNewActions=true to create Email.
    </examples_requiring_new>
  </step_4_modification_vs_new_action_rules>
  <step_5_pipeline_stage_awareness>
    <description>
      Below are all the pipeline stages available for this opportunity's organization.
      Consider whether any stage changes would be warranted by new developments.
      Pipeline stage changes should typically be handled via UPDATE_PIPELINE_STAGE action.
    </description>
    <stages>
      ${pipelineStagesSummary}
    </stages>
  </step_5_pipeline_stage_awareness>
  <step_6_calendar_event_review>
    For each future calendar event:
    <keep_criteria>
      - Event objectives remain aligned with current deal strategy
      - Timing and attendees are still appropriate
    </keep_criteria>
    <cancel_criteria>
      - Event purpose has been fulfilled or is no longer relevant
      - New developments make this meeting inappropriate
    </cancel_criteria>
    <reschedule_criteria>
      - Event is still valuable but timing needs adjustment
      - Need to accommodate new information or attendees
    </reschedule_criteria>
  </step_6_calendar_event_review>
  <step_7_new_action_gap_assessment>
    <mandatory_duplicate_check>
      Before setting needsNewActions to true, verify:
      1. List all existing actions (including your MODIFY decisions)
      2. For each potential new need, check if ANY existing/modified action addresses it
      3. Only set needsNewActions=true if there's a gap NO existing action can fill

      EXCEPTION - Always set needsNewActions=true when:
      - A prospect has sent a new email/message that requires acknowledgment
      - No existing EMAIL/LINKEDIN_MESSAGE action already drafts a reply to that message, or can be adjusted to draft a reply to that message
      - Professional courtesy requires acknowledging their communication
      - You have CANCELLED an action because it was the wrong type (e.g. Task) and you need to replace it with a different type (e.g. Email)
    </mandatory_duplicate_check>
    <prospect_response_principle>
    When a champion, economic buyer, or key stakeholder responds to your outreach:
    - You MUST acknowledge their response (even if they're pausing/declining)
    - A NO_ACTION or TASK cannot substitute for a reply EMAIL
    - Failing to acknowledge damages the relationship and appears unprofessional
  </prospect_response_principle>
    <gap_identification_process>
      - Review all existing actions and their modifications
      - Identify what outcomes/stakeholders/objectives are NOT covered
      - Only recommend new actions for true gaps in coverage
      - After evaluating, would the current actions (including any modifications) adequately address all new developments?
      - Set needsNewActions to true ONLY if new actions are required that are not covered by the modified actions/plan
    </gap_identification_process>
    <important>
      A modified EMAIL action that updates content/timing/recipients is NOT a gap requiring a new EMAIL action.
    </important>
  </step_7_new_action_gap_assessment>
  <step_8_action_strategy_for_modifications>
    For MODIFY decisions, define "actionStrategy" as a content-availability fallback plan:
    <requirement>
      What content/assets does the modified action need?
    </requirement>
    <primary>
      The ideal internal asset/source to use if available
    </primary>
    <secondary>
      The closest internal substitute or alternative source if primary is unavailable
    </secondary>
    <fallback>
      What to do if neither is available (e.g., omit, add placeholders, or reframe)
    </fallback>
    <rules_for_action_strategy>
      - Do NOT include email composition, tone, scheduling, sequencing, or follow-up plans
      - Keep each text field concise (≤ 35 words)
      - If the action needs no assets, use "NO_MATERIAL_NEEDED: [brief guidance]"
      - Focus only on content requirements and fallback plans
    </rules_for_action_strategy>
  </step_8_action_strategy_for_modifications>
</strategic_evaluation_framework>
<output_format>
  <for_each_existing_action>
    Provide actionId, decision (KEEP/CANCEL/MODIFY), reasoning, and if MODIFY:
    - modifiedDetails: draft details object matching the action type structure. Include any fields you are changing plus draft content (e.g. subject/body for EMAIL) so content composition can refine it
    - actionStrategy: content fallback plan as described above
    - IMPORTANT: All modifiedDetails fields are required. Use null for fields you are NOT changing; do NOT omit keys.
    - For KEEP/CANCEL decisions, set actionStrategy to null.
  </for_each_existing_action>
  <example_modify_email>
    Example MODIFY draft for EMAIL:
    {
      "actionId": "action-id-123",
      "decision": "MODIFY",
      "reasoning": "Prospect requested reschedule; acknowledge and propose new times",
      "modifiedDetails": {
        "replyToMessageId": "AAkALgAAAA...",
        "threadId": "AAQkAGNhZGU...",
        "scheduledFor": "2026-01-26T11:00:00Z",
        "subject": "Re: Demo reschedule",
        "body": "<p>Hi Yasmin,</p><p>No problem at all — can we move to Tue 18 Feb at 9:00am?</p>"
      },
      "actionStrategy": "Primary: UK Executive one-pager. Secondary: General Exec Summary. Fallback: eWebinar link."
    }
  </example_modify_email>
  <for_each_calendar_event>
    Provide eventId, decision (KEEP/CANCEL/RESCHEDULE), reasoning, and if RESCHEDULE:
    - newScheduledTime: ISO format datetime
    - For KEEP/CANCEL, set newScheduledTime to null.
  </for_each_calendar_event>
  <needs_new_actions>
    Boolean - only true if there are genuine gaps not covered by existing/modified actions
  </needs_new_actions>
  <new_action_justification>
    If needsNewActions is true, explain what type of new actions are needed and why existing actions cannot be modified to cover this
  </new_action_justification>
  <overall_assessment>
    Strategic summary of the evaluation and plan
  </overall_assessment>
</output_format>
<pre_finish_checklist>
  Double check the following before finishing your task:
  - [ ] For each MODIFY decision on an EMAIL action where we are replying:
    - replyToMessageId equals the "messageId" of the latest EMAIL in <new_activities>
    - threadId equals that EMAIL's "threadId"
  - [ ] If starting a new thread (reboot): replyToMessageId and threadId are null
  - [ ] For any action with "Last edited by: USER", have I verified there's inbound activity AFTER the edit before deciding MODIFY?
  - [ ] For each MODIFY decision, have I included actionStrategy?
  - [ ] Have I verified that all action IDs reference actual existing actions?
  - [ ] Have I verified that all event IDs reference actual future events?
  - [ ] Have I confirmed needsNewActions is false if existing/modified actions cover all needs?
  - [ ] Have I used only email addresses that appear in <opportunity_stakeholders>?
</pre_finish_checklist>
<important>
  NEVER INVENT INFORMATION ABOUT CLIENTS OR THE BUSINESS
  Remember: You're evaluating an ongoing sales campaign. The actual creation of new actions will be handled by a separate agent if needed.
</important>
`;
  }
}
