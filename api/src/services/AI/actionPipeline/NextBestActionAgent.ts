import { z } from 'zod';
import { mastra } from '../../../mastra';
import { ActionPipelineContext } from './ActionPipelineService';
import { ContentCompositionAgent } from './ContentCompositionAgent';
import chalk from 'chalk';
import mongoose from 'mongoose';
import SalesPlaybook from '../../../models/SalesPlaybook';
import { ContentType } from '../../../models/SalesPlaybook';
import { actionRegistry } from './possibleActions/index';
import PipelineStage from '../../../models/PipelineStage';
import { EvalCaptureService } from '../evals/EvalCaptureService';

// Dynamically create the union schema from all registered action handlers
const allActionDetailsSchemas = actionRegistry.getAllHandlers().map(h => h.detailsSchema);
const ActionDetailsSchema = z.union(allActionDetailsSchemas as [z.ZodObject<any, any, any>, z.ZodObject<any, any, any>, ...z.ZodObject<any, any, any>[]]);

// Dynamically get all action types from the registry
const allActionTypes = actionRegistry.getAllActionTypes();

// Define the schema for a main action
const MainActionSchema = z.object({
  id: z.string().describe('Unique identifier for the main action (e.g., "main-1", "main-2")'),
  type: z.enum(allActionTypes as [string, ...string[]])
    .describe('The type of main action to be taken'),
  details: ActionDetailsSchema
    .describe('Action-specific details with proper validation'),
  reasoning: z.string().min(10).max(500)
    .describe('The AI\'s rationale for suggesting this main action, including the activity ids that this action is referencing'),
  sourceActivityIds: z.array(z.string())
    .min(1)
    .describe('Array of activity IDs that this action is responding to'),
  priority: z.number().min(1).max(10)
    .describe('Overall priority of this action (1=highest priority)'),
  actionStrategy: z.string()
    .describe('Content guidance for this action. If no material from available_information is needed, state "NO_MATERIAL_NEEDED" followed by brief instructions for a direct response. If material IS needed, describe the primary asset, a secondary alternative, and a fallback if neither is available. Max 60-80 words.'),
  debug: z.string()
  .describe('Your step by step reasoning for the decision you made, at each step, that led to our final next action.'),
});

// Define the schema for the complete response
export const NextBestActionsSchema = z.object({
  actions: z.array(MainActionSchema)
    .min(1)
    .max(5)
    .describe('Array of main actions with priorities. Only include multiple actions if they are truly independent and needed simultaneously.')
});

export type NextBestActionsResult = z.infer<typeof NextBestActionsSchema>;
export type MainAction = z.infer<typeof MainActionSchema>;

export class NextBestActionAgent {
  /**
   * Analyzes the provided action pipeline context and decides on the next best actions.
   * Uses strategic decision-making to identify the most logical steps to advance the deal.
   * Only generates multiple actions when they are truly independent and needed simultaneously.
   * Includes retry logic to give the AI multiple chances to generate valid actions.
   * 
   * @param context The comprehensive action pipeline context
   * @param maxAttempts Maximum number of attempts before falling back (default: 5)
   * @returns Promise resolving to strategic actions with priorities
   */
  public static async decideNextActions(context: ActionPipelineContext, maxAttempts: number = 5): Promise<NextBestActionsResult> {
    console.log(chalk.blue.bold(`[NEXT BEST ACTION AGENT] Analyzing context for opportunity ${context.opportunity._id}...`));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(chalk.cyan(`  -> Attempt ${attempt}/${maxAttempts}: Generating strategic action recommendation...`));

        // Get the nextActionAgent from mastra
        const nextActionAgent = mastra.getAgent('nextActionAgent');

        if (!nextActionAgent) {
          throw new Error('NextActionAgent not found in mastra configuration');
        }

        // Build comprehensive context prompt (include attempt info for better AI context)
        const promptData = await this.buildContextPrompt(context, attempt, maxAttempts);
        const contextPrompt = promptData.prompt;

        const organizationId = (context.opportunity.organization as any)?._id?.toString() || '';
        const opportunityId = (context.opportunity as any)?._id?.toString() || '';
        const captureId = await EvalCaptureService.startCapture({
          organizationId,
          agentName: 'nextActionAgent',
          inputVariables: promptData.inputVariables,
          metadata: {
            file: 'next-best-action-agent',
            agent: 'nextActionAgent',
            opportunityId,
            attempt,
            maxAttempts,
          },
        });

        console.log(chalk.cyan(`    -> Generated context prompt (${contextPrompt.length} characters)`));

        // Call the AI agent with structured output
        const result = await nextActionAgent.generateLegacy(
          [{
            content: contextPrompt,
            role: 'user'
          }],
          {
            output: NextBestActionsSchema,
            providerOptions: {
              openai: {
                metadata: {
                  file: 'next-best-action-agent',
                  agent: 'nextActionAgent',
                  orgId: organizationId,
                  opportunityId,
                  ...(captureId ? { evalCaptureId: captureId } : {}),
                }
              }
            }
          }
        );

        const actions = result.object;
        console.log(result.object);

        console.log(chalk.green(`    -> AI recommended: ${actions.actions.length} action(s)`));
        actions.actions.forEach((action, i) => {
          console.log(chalk.gray(`       Action ${i + 1}: ${action.type} (Priority: ${action.priority})`));
        });

        // Validate and sanitize the AI's response
        console.log(chalk.cyan(`    -> Validating action recommendations against actual data...`));
        const validatedActions = await this.validateAndSanitizeActions(actions, context, attempt);

        // Check if we have valid actions
        if (validatedActions.actions.length > 0) {
          console.log(chalk.green.bold(`[NEXT BEST ACTION AGENT] Successfully validated ${validatedActions.actions.length} action(s) on attempt ${attempt}`));

          // Log summary of validated actions
          validatedActions.actions.forEach((action, i) => {
            console.log(chalk.gray(`  Action ${i + 1}: ${action.type} (Priority: ${action.priority}) - ${action.reasoning.substring(0, 100)}...`));
          });

          // Compose content for the validated actions
          console.log(chalk.cyan(`    -> Composing content for validated actions...`));
          const actionsWithContent = await ContentCompositionAgent.composeActionContent(validatedActions, context);

          console.log(chalk.green.bold(`[NEXT BEST ACTION AGENT] Successfully composed content for all actions`));
          return actionsWithContent;
        } else {
          console.log(chalk.yellow(`    -> No valid actions on attempt ${attempt}, retrying...`));

          // If this is not the last attempt, continue to  retry
          if (attempt < maxAttempts) {
            console.log(chalk.cyan(`    -> Retrying in 1 second...`));
            await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between attempts
            continue;
          }
        }

      } catch (error) {
        console.error(chalk.red(`    -> Error on attempt ${attempt}:`), error);

        // If this is not the last attempt, continue to retry
        if (attempt < maxAttempts) {
          console.log(chalk.cyan(`    -> Retrying after error...`));
          await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between attempts
          continue;
        }
      }
    }

    // All attempts failed, generate fallback action
    console.log(chalk.yellow(`[NEXT BEST ACTION AGENT] All ${maxAttempts} attempts failed, generating fallback action...`));
    return this.generateFallbackAction(context);
  }

  /**
   * Validates and sanitizes AI-generated actions against the actual context data.
   * This prevents AI hallucinations by ensuring referenced IDs and emails exist.
   * 
   * @param actions Raw AI-generated actions
   * @param context The action pipeline context
   * @param attempt Current attempt number (for logging)
   * @returns Validated and sanitized actions or empty array if invalid
   */
  private static async validateAndSanitizeActions(
    actions: NextBestActionsResult,
    context: ActionPipelineContext,
    attempt: number = 1
  ): Promise<NextBestActionsResult> {
    console.log(chalk.blue(`    -> Validating ${actions.actions.length} recommended action(s) against context...`));

    // Create lookup maps for quick validation
    const validContactEmails = new Set(
      context.contacts.flatMap(({ contact }) =>
        contact.emails?.map(email => email.address) || []
      )
    );

    const validActivityIds = new Set(
      context.recentActivities.map(activity => (activity._id as mongoose.Types.ObjectId).toString())
    );

    const validEmailActivityIds = new Set(
      context.recentActivities
        .filter(activity => 'threadId' in activity)
        .map(activity => (activity._id as mongoose.Types.ObjectId).toString())
    );

    const validatedActions: MainAction[] = [];

    for (const action of actions.actions) {
    try {
        console.log(chalk.cyan(`      -> Validating main action: ${action.type} (Priority: ${action.priority})...`));

      // Validate source activity IDs
      const validSourceActivityIds = action.sourceActivityIds.filter(id => {
        const isValid = validActivityIds.has(id);
        if (!isValid) {
          console.log(chalk.yellow(`        -> Warning: Invalid source activity ID ${id}, removing from action`));
        }
        return isValid;
      });

      if (validSourceActivityIds.length === 0) {
          console.log(chalk.yellow(`        -> Critical: No valid source activities for ${action.type} action - skipping`));
          continue;
        }

        // Validate main action details
        const validatedMainDetails = await this.validateActionDetails(action, context, validContactEmails, validEmailActivityIds);

        if (!validatedMainDetails) {
          console.log(chalk.yellow(`        -> Critical: Invalid main action details for ${action.type} action - skipping`));
          continue;
        }

        // Create validated main action
        const validatedAction: MainAction = {
          ...action,
          sourceActivityIds: validSourceActivityIds,
          details: validatedMainDetails
        };

        validatedActions.push(validatedAction);
        console.log(chalk.green(`        -> ✓ Main action ${action.type} validated successfully`));

    } catch (error) {
      console.log(chalk.red(`        -> ✗ Error validating ${action.type} action:`, error));
        continue;
      }
    }

    console.log(chalk.green(`    -> Action validation complete: ${validatedActions.length} valid action(s) ready for content composition`));
    return { actions: validatedActions };
  }

  /**
   * Generates a fallback action when all AI attempts fail validation.
   * This provides a safe default action that requires manual review.
   * 
   * @param context The action pipeline context
   * @returns Single fallback action result
   */
  private static generateFallbackAction(context: ActionPipelineContext): NextBestActionsResult {
    console.log(chalk.yellow(`    -> Generating fallback action for manual review...`));

    const fallbackAction: MainAction = {
      id: 'fallback-1',
      type: 'TASK' as const,
      details: {
        description: 'Review recent activities and determine the next strategic action for this opportunity. AI validation failed - manual analysis required.',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Tomorrow
      },
      reasoning: 'AI-generated action failed validation after multiple attempts. Manual strategic review needed to determine the best next step.',
      sourceActivityIds: context.recentActivities.slice(0, 1).map(a => (a._id as mongoose.Types.ObjectId).toString()),
      priority: 1,
      actionStrategy: 'AI validation failed - manual analysis required.',
      debug: 'AI-generated action failed validation after multiple attempts. Manual strategic review needed to determine the best next step.'
    };

    console.log(chalk.green(`    -> Fallback action generated: TASK for manual review`));
    return { actions: [fallbackAction as any] }; // Casting as any to satisfy the dynamic schema
  }

  /**
   * Validates action-specific details by delegating to the appropriate handler from the registry.
   * 
   * @param action The action to validate
   * @param context The action pipeline context
   * @param validContactEmails Set of valid contact email addresses
   * @param validEmailActivityIds Set of valid email activity IDs
   * @returns Validated action details or null if invalid
   */
  private static async validateActionDetails(
    action: MainAction,
    context: ActionPipelineContext,
    validContactEmails: Set<string>,
    validEmailActivityIds: Set<string>
  ): Promise<any | null> {
    const handler = actionRegistry.getHandler(action.type);

    if (!handler) {
      console.log(chalk.red(`          -> Critical: No handler found for action type ${action.type}`));
      return null;
    }

    try {
      return await handler.validateDetails(action, context, validContactEmails, validEmailActivityIds);
    } catch (error) {
      console.error(chalk.red(`          -> Error validating details for ${action.type} via handler:`), error);
      return null;
    }
  }

  /**
   * Builds a comprehensive context prompt for the AI agent from the pipeline context.
   * Updated to support multiple actions with priorities and sub-actions.
   * 
   * @param context The action pipeline context
   * @param attempt Current attempt number (for AI context)
   * @param maxAttempts Maximum number of attempts (for AI context)
   * @returns Formatted prompt string
   */
  private static async buildContextPrompt(
    context: ActionPipelineContext,
    attempt: number = 1,
    maxAttempts: number = 5
  ): Promise<{ prompt: string; inputVariables: Record<string, any> }> {
    const { opportunity, contacts, recentActivities, futureEvents, dealIntelligence, existingActions } = context;
    const todaysDate = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toISOString().split('T')[1];

    // Build contacts summary
    const contactsSummary = contacts.map(({ contact, intelligence }) => {
      const latestRole = intelligence.roleAssignments?.length > 0
        ? intelligence.roleAssignments[intelligence.roleAssignments.length - 1].role
        : 'Unknown';

      return `- ${contact.firstName} ${contact.lastName} (${contact.emails?.[0]?.address || 'No email'})
        Role: ${contact.contactResearch?.roleAtCompany}
        Deal Role: ${latestRole}
        Engagement Score: ${intelligence.engagementScore || 'Not specified'}
        Responsiveness: ${intelligence.responsiveness[intelligence.responsiveness.length - 1] || 'Unknown'}
        Relationship Story: ${intelligence.relationshipStory || 'No story available'}
        Contact Research: ${contact.contactResearch ? JSON.stringify(contact.contactResearch.personalSummary) : 'No contact research available.'}`;
    }).join('\n');

    // Build recent activities summary (reverse order so most recent is last)
    // Used to give context on what has happened recently, regardless of whether there was a unhandled activity or not.
    const recentActivitiesSummary = recentActivities.slice(0, 10).reverse().map((activity, index) => {
      const id = (activity._id as mongoose.Types.ObjectId).toString();
      const activityType = 'threadId' in activity ? 'EMAIL' : 'startTime' in activity ? 'CALENDAR' : 'ACTIVITY';
      const threadId = 'threadId' in activity ? activity.threadId : null;
      const replyToMessageId = 'messageId' in activity ? activity.messageId : null;
      const summary = activity.aiSummary?.summary || 'No summary available';
      return `
      ID: ${id} - [${activityType}] ${activity.date.toISOString()} 
      ${threadId ? `ThreadID: ${threadId}` : ''}
      ${replyToMessageId ? `messageId: ${replyToMessageId}` : ''}
      Summary: ${summary}
      `;
    }).join('\n');

    // Build future events summary
    const eventsSummary = futureEvents.slice(0, 5).map((event, index) => {
      return `ID: ${event._id} - ${event.title} - ${event.startTime.toISOString()}`;
    }).join('\n');

    // Build existing actions summary
    const existingActionsSummary = existingActions.slice(0, 5).map((action, index) => {
      return `ID: ${action._id} - [${action.type}] ${action.status} - ${action.reasoning}`;
    }).join('\n');

    // Process playbooks
    const businessInformation = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.BUSINESS_INFORMATION });
    const productInformation = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.PRODUCT_INFO });
    const productOverview = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.PRODUCT_OVERVIEW });
    const salesProcess = await SalesPlaybook.find({ organization: opportunity.organization._id, type: ContentType.SALES_PROCESS });

    const collateral = await SalesPlaybook.find({ organization: opportunity.organization._id, type: { $not: { $in: [ContentType.BUSINESS_INFORMATION, ContentType.PRODUCT_INFO, ContentType.PRODUCT_OVERVIEW, ContentType.SALES_PROCESS] } } });
    const collateralSummary = collateral.map((collateral) => {
      return `ID: ${collateral._id} - [${collateral.type}] ${collateral.title} - ${collateral.contentSummary || collateral.content}`;
    }).join('\n');

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

    const attemptInfo = attempt > 1 ?
      `\n## RETRY ATTEMPT ${attempt}/${maxAttempts}
      This is retry attempt ${attempt} of ${maxAttempts}. Previous attempts failed validation. Please be extra careful to:
      - Use only the exact activity IDs listed in the RECENT ACTIVITIES section
      - Use only the exact email addresses listed in the CONTACTS section
      - Ensure all dates are in the future
      - Double-check that replyToMessageId references the correct actual EMAIL messageId.
      - Only create multiple actions if they are truly independent and needed simultaneously\n` : '';


        const prompt = `
          <role>
            You are an elite B2B sales strategist analyzing this opportunity to determine the next best actions to advance the deal.
          </role>
          <todays_date>
            Today's Date: ${todaysDate}. Time is ${currentTime}.
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
            <recent_activities>
              What has happened recently
              ${recentActivitiesSummary || 'No recent activities'}
            </recent_activities>
            <upcoming_commitments>
              ${eventsSummary || 'No upcoming events'}
            </upcoming_commitments>
            <recent_actions_taken>
              ${existingActionsSummary || 'No existing actions'}
            </recent_actions_taken>
            <deal_intelligence>
              ${dealIntelligence ? JSON.stringify(dealIntelligence, null, 2) : 'No deal intelligence available'}
            </deal_intelligence>
          </this_opportunity>
          <instructions>
            With the above opportunity context, you need to analyse the opportunity following the exact steps below.
            Take notes as you go with the decision you make at each step and why; and put this inside the debug field.
          </instructions>
          <strategic_analysis_framework>
            <step_1>
              Look at <recent_activities> and determine any clear next steps. Prioritise the most recent activities if multiple are present.
              - If there are multiple activities, make sure to determine if any next steps were handled by other activities. For example, if a client asked for a pricing sheet, and in another <recent_activities> we sent it to them, then this would not need to be handled again.
              - If the most recent activity is FROM our business (e.g. we sent an email, made a call, uploaded a document, or have an email scheduled), then you must strongly bias towards 'NO_ACTION'. It is bad practice to send multiple communications close together.
                <list_of_exceptions>
                  - An exception is if our last COMPLETED activity was more than 5 business days ago and we are waiting for a reply (we could follow up).
                  - Tie-breaker: If our last outbound was ≥5 business days ago and we’re awaiting a reply, we could send a follow-up now in the same channel as the last touch.
                </list_of_exceptions>
                In all other cases where our business was the last to act, especially with a scheduled action, select 'NO_ACTION'.
              <examples_of_clear_next_steps>
                - Contact has asked direct questions that need a response
                - Contact has requested a suitable time to book a call
                - Contact has asked for collateral or files
                - Contact has done an intro to another internal stakeholder
                - Contact has confirmed calander availability for a meeting
                - Contact has made a specific request
                - Contact requires acknowledgement/confirmation.
                - Contact explicitly asked us to follow up at a specific time.
                - Meeting just finished, send a post meeting follow up email to the contact to confirm the details of the meeting and the next steps.
              </examples_of_clear_next_steps>
              <already_handled_requests>
                Before treating any request as a current next step, FIRST check if a earlier
                activity from us already fully answered or fulfilled it (e.g. we already
                confirmed a feature like the post-death verification workflow, clarified
                pricing, or sent the requested document/reference).
                If it has clearly been handled and the prospect has not raised it again,
                DO NOT bring it up a second time or offer to re-explain it. Treat it as
                closed and focus only on unresolved items from the latest prospect-originated
                email.
              </already_handled_requests>
              <process_lock_override>
                If the prospect explicitly indicates the next step is to cover items in a scheduled meeting or that no more information is needed
                (e.g., "we'll cover this in the meeting", "let's meet first then decide what else is needed",
                "no further info needed now"), then treat any prior unanswered questions or offers from us
                as CLOSED for now, unless:
                - The prospect explicitly re-opens the request in a later message, OR
                - The unanswered item is blocking the meeting itself (e.g., they need dial-in details), OR
                - They explicitly ask for pre-read materials to circulate ahead of the meeting.

                In these cases, do NOT select an EMAIL next step purely to "nudge" on an earlier offer.
                Prefer NO_ACTION until the meeting occurs or the prospect re-opens the item.
              </process_lock_override>
              <important_clarification>
                If a contact makes a specific request (e.g., customer reference, document, 
                introduction) but suggests flexible timing (e.g., "December works" or "no rush"), 
                this is STILL a clear next step requiring immediate acknowledgement/confirmation, 
                even if the actual fulfillment can be scheduled later.
                </important_clarification>
              <if_we_have_clear_next_steps>
                If the clear next step is an email, follow the email_threading_policy below.
                <email_threading_policy>
                  - Default: reply in the existing thread.
                  - Always select the latest EMAIL in that thread as the reply target (the most recent EMAIL in that thread in <recent_activities>).
                - When replying:
                  - Set details.replyToMessageId to that EMAIL’s "messageId" value as shown in <recent_activities>.
                  - Set details.threadId to that EMAIL’s "threadId" value as shown in <recent_activities>.
                - Only start a new thread ("reboot") if the prospect is ghosting, we are emailing a new, seperate contact, or the topic must clearly change:
                  - Ghosting heuristic: no prospect response in ≥20 days AND at least 3 follow-ups from us in that same thread after their last reply.
                  - If rebooting: omit details.replyToMessageId & threadId.
              </email_threading_policy>
                PROCEED to <step_3>.
              <else_if_we_have_no_clear_next_steps>
                PROCEED to <step_2>.
              </else_if_we_have_no_clear_next_steps>
            </step_1>
            <step_2>
              IF THERE ARE NO CLEAR NEXT STEPS, take a note of:
              a) Upcoming meeting? When?
              b) Last contact within 7 days?
              c) What is their communication patterns like? Their responsiveness?
              
              Remember:Our default position is a bias towards activity, while matching the prospects energy and intent. The only times we might not want to do activity towards a contact, is if we have recently done an activity (within 5 business days), or they have asked us not to.
              <choose_next_action_guidelines>
              Using best sales practice, make your decision on what our next action should be. Here are some guidelines:
              - If this opportunity currently has no active deal (i.e. they are status close-lost), at most we want to reach out once per quarter. This would be with timely nurture material that is relevant to things they care about, new product updates or industry news, with a gentle ask to re-engage. In this case, check Todays Date against the last time we reached out to them. If it has been more than 3 months, we can reach out.
              - If we have an upcoming meeting within the next 5 days, communication probably isn't necessary as we have next steps already (unless of course they have asked for something, or there is a high impact action we could take).
              - If we have an upcoming meeting but it's further out than 7 days, we want to provide them with light nurture material to keep them engaged. We might also perform other actions to stay on their radar.
              - If it is an active deal, but there is no upcoming meeting, we want to push for a next step while delivering value to the chosen contact, keeping awareness around our current relationship story with them. We want to use personally relevant case studies, collateral, relevant online material, news etc they might enjoy, and other material that is relevant to the opportunity to deliver value while also inserting an ask - either for a next meeting, step, or as we follow up.
              - We want to use the communication channel where the contact/s are typically most responsive. If we are using emails, generally we want to keep our communications in one email thread, unless the prospect has become unresponsive (so we want to re-engage them with a new thread), or we are dealing with multiple seperate contacts about seperate topics. In this case, when replying to a message, include the replyToMessageId of the message we are replying to and the threadId of the thread we are replying to in your response.
              - If the next step we decide on is an email, follow the email_threading_policy below
                <email_threading_policy>
                    - Default: reply in the existing thread.
                    - Always select the latest EMAIL as the reply target (the most recent EMAIL item in <recent_activities>).
                  - When replying:
                    - Set details.replyToMessageId to that EMAIL’s "messageId" value as shown in <recent_activities>.
                    - Set details.threadId to that EMAIL’s "threadId" value as shown in <recent_activities>.
                  - Only start a new thread ("reboot") if the prospect is ghosting, we are emailing a new, seperate contact, or the topic must clearly change:
                    - Ghosting heuristic: no prospect response in ≥20 days AND at least 3 follow-ups from us in that same thread after their last reply.
                    - If rebooting: omit details.replyToMessageId & threadId.
                </email_threading_policy>
              <backoff_policy>
                <purpose>
                  When prospects don't respond, we use a graduated backoff approach that balances 
                  persistence with respect for their time. This prevents us from being overly 
                  aggressive while maintaining deal momentum.
                </purpose>
                <backoff_schedule>
                  Calculate the "touch count" = number of outbound emails/calls from us since their 
                  last substantive response (auto-replies and OOO don't count).
                  Touch 1 (Initial outreach): Send immediately when appropriate
                  Touch 2 (First follow-up): Wait 3-5 business days after Touch 1
                  Touch 3 (Second follow-up): Wait 7 business days after Touch 2
                  Touch 4 (Third follow-up): Wait 14 business days after Touch 3
                  Touch 5 (Final attempt): Wait 21-30 business days after Touch 4
                  After Touch 5 with no response: Consider GHOSTBUSTER email or close-lost
                </backoff_schedule>
                <responsiveness_adjustment>
                  Adjust timing based on the contact's intelligence.responsiveness score:
                  - If they are generally responsive, use standard schedule above
                  - If they are a slow responder, add 3 business days to each interval
                  - If they are unresponsive and slow, add 5 business days to each interval, 
                    max 3 total touches before ghostbuster
                </responsiveness_adjustment>
                <override_conditions>
                  Ignore backoff timing and reach out sooner if:
                  - They explicitly asked us to follow up at a specific time (honor their request)
                  - Major triggering event (company news, funding, leadership change, industry event)
                  - New compelling asset/case study highly relevant to their stated needs
                  - Mutual connection makes a warm introduction
                  - We have an upcoming scheduled meeting within 48 hours (meeting prep/confirmation)
                </override_conditions>
                <multi_threading_backoff>
                  When a primary contact/champion is unresponsive:
                  - After Touch 3 with no response: Consider reaching out to a different stakeholder
                  - Document the switch in reasoning: "Primary contact (X) unresponsive after 3 touches 
                    over Y days, pivoting to secondary stakeholder (Y)"
                  - Start fresh backoff schedule with new contact
                  - Keep original contact on longer backoff (continue with their Touch 4+ schedule)
                </multi_threading_backoff>
                <content_strategy_by_touch>
                  Vary your approach with each touch to avoid repetition.
                  We never want to send follow ups that are just repeating information in previous emails.
                  Touch 1: Direct value proposition or answer to their needs
                  Touch 2: Add new value (case study, insight, news relevant to them)
                  Touch 3: Different angle - reference a mutual connection, event, or their business trigger
                  Touch 4: Executive-level value or strategic insight
                  Touch 5: Break-up email with genuine offer to circle back later
                </content_strategy_by_touch>
                <cta_and_commitment_rules>
                  - Each action we take MUST have exactly ONE call-to-action. Good: "Worth me sending the 2-pager?". Bad: "Worth me sending the 2-pager? Or if you prefer, we can book a 20 minute call next week. I also have an ROI sheet if you're interested".
                  - When prospect is in passive/waiting mode: prefer micro-commitments over meeting asks
                    - Good: "Worth me sending the 2-pager?" / "Who owns this internally?"
                    - Bad: "Let's schedule a 20-min call" (too big an ask for passive state)
                  - When re-engaging Closed Lost deals: lead with permission + value, not meeting request
                    - Good: "We parked this in [month] due to [reason[— however thought I'd this recent industry update on [topic]."
                  - Match CTA friction to prospect engagement level:
                    - High engagement → meeting ask is fine
                    - Low/passive engagement → micro-yes first (doc, question, intro)
                </cta_and_commitment_rules>
                <implementation_rules>
                  When determining if we should send another email/call/linkedin message tc:
                  1. Count touches since last prospect response (check <recent_activities>)
                  2. Calculate days since last touch from us
                  3. Check contact's responsiveness score from intelligence
                  4. Verify we haven't exceeded Touch 5 threshold
                  5. Check for override conditions
                  6. If backoff period hasn't elapsed AND no override: recommend NO_ACTION or 
                    alternative action (research, internal task, multi-thread)
                </implementation_rules>
                <timing_rules>
                  When determining WHEN we should send another email/call/linkedin message etc:
                  1. Analyse their responsiveness and previous communications with us.
                  2. Determine if their is a pattern to when they are most responsive to our communications. (e.g. they are most responsive on Tuesday mornings around 10am, or they are most responsive on Friday afternoons around 3pm)
                  3. Determine if they have asked us to follow up at a specific time.
                  4. Choose a time/schedule time that makes it most likely for them to respond to our communication.
                </timing_rules>
              - Wherever possible, we want to keep our deals 'multi-threaded' (meaning multiple stakeholders in the deal). Keep important parties engaged, and maintain communication with everyone in the deal. For instance, if we had a meeting where one person couldn't attend, we would want to update involved parties after the meeting on how the meeting went and what next steps were agreed on.
              - If we are yet to meet with someone but they have engaged a bit, we want to nurture them using case studies, material, collateral etc. to get them to engage more.
              - If people are ghosting us after numerous attempts over months to get in touch (automated responses such as autoreply and OOO replies do not count as a response), we want to use ghostbusters to know if we should close off the deal or not.
              - If an opportunity is active but empty (no activities/emails/anything, no events, no actions, no intelligence etc), we take no action and say more information is needed.
              In light of this, think about what the MOST IMPACTFUL next steps would be to keep moving the prospect down the pipeline.
              </choose_next_action_guidelines>
            </step_2>
            <step_3_multi_action_assessment>
              Here are the types of actions we can take:
              ${actionRegistry.getAllHandlers().map((handler) => `- ${handler.name}: ${handler.description}`).join('\n')}
              <meeting_action_guidance>
                When proposing a MEETING action, you must set the correct mode:
                - mode: "create" - Use when scheduling a NEW meeting (contact confirmed a time, or we need to book a new call). Fill in title, attendees, duration, scheduledFor.
                - mode: "update" - Use when an EXISTING meeting needs changes (reschedule, add/remove attendees, change title). Set existingCalendarActivityId to the ID from <upcoming_commitments>, plus the updated fields.
                - mode: "cancel" - Use when an EXISTING meeting should be cancelled. Set existingCalendarActivityId to the ID from <upcoming_commitments>. No other fields are needed.
                For update/cancel, existingCalendarActivityId must be one of the IDs listed in <upcoming_commitments>.
              </meeting_action_guidance>
              <add_contact_action_guidance>
                Use the ADD_CONTACT action when deal progress is blocked by stakeholder coverage and we need to add someone new to the opportunity.
                Prefer ADD_CONTACT when:
                - We are speaking to someone without enough authority and a different owner/approver is needed
                - The contact references another internal person we should involve ("loop in", "include", "speak with")
                - MEDDPICC signals missing coverage (Economic Buyer, Champion, Decision Maker, Influencer)
                - Multi-threading is strategically needed after repeated non-response from the current primary contact

                Do NOT use ADD_CONTACT when:
                - The person already exists in current stakeholders/opportunity contacts
                - A normal EMAIL follow-up to existing contacts is the better immediate next step

                When selecting ADD_CONTACT details:
                - suggestedRole must be one of: Economic Buyer, Champion, Influencer, User, Blocker, Decision Maker, Other, Uninvolved
                - Provide best-known name and role hypothesis; include email/title only if known or likely
                - Reasoning must explain why adding this person advances the deal now
              </add_contact_action_guidance>
              Now we know our best next steps, we have to decide if it's a single action, or if we need multiple actions:
              <critical_decision_point>Single Action vs Multiple Actions</critical_decision_point>
              <generate_multiple_actions_conditions>
                ✅ Actions are completely independent (can be executed simultaneously)
                ✅ Each action addresses a different urgent need or stakeholder
                ✅ Timing is critical for all actions (waiting would harm the deal)
                ✅ Actions don't depend on responses from each other
              </generate_multiple_actions_conditions>
              <bias_towards_simplicity>
              We strongly prefer single, complete actions. Each action should be self-contained and complete.
              We keep our actions simple, targeted and easy to understand. We don't jam multiple thought processes for the contact into a single action (e.g. Email the contact asking for a meeting, and also an introduction to another stakeholder, and also attach a document to the email). We want our contacts to not feel overwhelmed and view our actions as a single, focused effort which is easy for them to action/respond to.
              </bias_towards_simplicity>
              <examples_valid_multiple_actions>
                - Responding to CEO's urgent question + Following up with procurement on contract
                - Sending proposal to decision maker + Scheduling technical demo with evaluator
                - Multi-threading: Engaging champion + Reaching out to economic buyer
                - Sending a ghostbuster email + Updating the pipeline stage
                - Booking Meeting: Once contact confirms a time, we can respond saying we've sent an invite + send the actual calendar invite (if a contact confirms a time is good for them, we can send the invite as well as respond via email telling them the same. If they confirm multiple times should work, default to the earliest time. If they say it should work and they'll let us know, we should send a calendar hold invite/pencil it in until confirmed.)
                - Send post meeting follow up email + scheduling another follow up email for a discussed time in the future.
              </examples_valid_multiple_actions>
              <examples_invalid_multiple_actions>
                - Requesting meeting + Scheduling the meeting (create one action: 'Email the client to ask if they'd like a meeting, what time works best and confirm attendees')
                - Sending information + Following up on it (create one action: send the information. We will follow up later)
                - Researching content + Sending email with that content (create one action: send the email with the research integrated)
              </examples_invalid_multiple_actions>
            </step_3_multi_action_assessment>
            <step_4_pipeline_stage_selection>
            <description>
              Below are all the pipeline stages available for this opportunity's organization.
              Each stage represents a phase in the sales process with specific criteria.
              Consider whether the opportunity has progressed (or regressed) enough to warrant a stage change.
              If the opportunity is in a CLOSED WON or CLOSED LOST stage, NEVER propose a stage change.
              Pipeline stage changes are independent of other actions and can be executed simultaneously. They do not need to follow rules regarding action timing and sequencing because they are internal only (e.g. we don't need to worry about our last action being only yesterday, to move their stage in a pipeline.)
            </description>
              <stages>
              ${pipelineStagesSummary}
              </stages>
                <guidance>
                  Use the UPDATE_PIPELINE_STAGE action when:
                  - The opportunity's progress, activities, and MEDDPICC status clearly align with a different stage's description
                  - The current stage no longer accurately reflects the deal's actual status
                  - There has been significant progress or regression in the deal
                  
                  When proposing a stage change:
                  - Specify the targetStageId from the stages listed above
                  - Specify the targetStageName for clarity
                  - Provide clear reasoning based on the stage descriptions and opportunity progress
                  
                  Do NOT propose stage changes:
                  - Without clear evidence that stage criteria have been met
                  - If the current stage still accurately represents the deal status
                </guidance>
            </step_4_pipeline_stage_selection>
            <step_5_required_information>
            When creating content for actions, we sometimes need to include specific information - such as product answers, information on competitors, pricing etc. In these cases, we have access to our database. This is where we store our collateral, case studies, product info, business information, sales process, etc.
            <available_information>
            Beyond information found readily online, this is an overview of the information we have available to us:
              ${collateralSummary}
            </available_information>
            <action_strategy_guidelines>
              - Many actions require no material at all. Do NOT force assets into simple replies.
              - Our 'actionStrategy' field is one concise paragraph (max 60-80 words).
              - If no information from <available_information> is required, write: "NO_MATERIAL_NEEDED: [brief guidance for a direct response]".
              - If material IS needed, describe the primary asset, a secondary alternative, and a fallback if neither is available.
              - Define "actionStrategy" STRICTLY as a content-availability fallback plan for any material this action depends on.
            </action_strategy_guidelines>
            <action_strategy_process>
            1. First decide if material is needed at all. Use the checklist below and record it in debug.
            <material_reasoning_template>
              In your debug field, explicitly answer:
              1. "Has the contact asked for or hinted at needing specific information?" [Y/N + evidence]
              2. "Have we already provided similar material?" [Y/N + when]
              3. "What mode is the contact in?" [Learning / Evaluating / Deciding / Waiting]
              4. "Would adding material help them or overwhelm them right now?" [Help/Overwhelm + why]
              5. Is the prospect driving the deal forward? [Y/N + why]
              6. Is a given piece of material going to have a meaningful impact on the deal at this current moment, stage and momentum? [Y/N + why]
              
              Only proceed with material inclusion if answers support it.
            </material_reasoning_template>
            <anti_patterns_for_material_inclusion>
              - "Feature dumping": Sending product info unprompted after they're already sold
              - "Panic collateral": Attaching materials when anxious about deal momentum  
              - "Repetition": Re-sending case studies they've already received
              - "Kitchen sink": Multiple attachments when they asked a simple question
              - "Tone-deaf timing": Heavy materials when they said "I'll let you know"
              - "Over-educating": Teaching mode when they're in decision mode
            </anti_patterns_for_material_inclusion>
            <if_no_material_needed>
            If the checklist indicates no material is required, output:
              "NO_MATERIAL_NEEDED: [brief guidance for a direct response]"
            Then STOP. Do NOT list assets or fallback plans.
            </if_no_material_needed>
            2. If material IS needed, consider what information would be required to action the main action, beyond simply writing a response (e.g. figures, testimonials, ROI statements, case studies, collateral, product info, business information, sales process). Consider both an ideal primary outcome, a secondary outcome, and a fallback.
            3. Consider who we are contacting/targeting this action towards, and our current relationship story with them.
            4. Look at what we've already discussed with the contact in previous communications/offered before. Don't include information already known to the contact (unless they ask for it), or that which we have already offered and they declined (unless they ask for it).
            5. Have situational awareness around the contact's current state in the opportunity context. If they are a new contact or waiting on internal alignment, avoid over-sharing; clarify their role instead of dumping materials.
            <for_each_required_item>
            For each required item, provide a string that includes all the information needed to action the main action:
              <requirement>
                - requirement: the asset/info needed (e.g., "ROI Sheet", "Security FAQ", "UK case study")
              </requirement>
              <primary>
                - primary: the ideal internal asset/source to use if available
              </primary>
              <secondary>
                - secondary: the closest internal substitute or alternative source if primary is unavailable
              </secondary>
              <fallback>
                - fallback: what to do if neither is available (e.g., omit, add placeholders, or reframe)
              </fallback>
            </for_each_required_item>
            <rules_for_action_strategy>
              - Do NOT include email composition, tone, scheduling, sequencing, multi-threading, pipeline/MEDD(P)ICC commentary, or follow-up plans.
              - Keep each text field concise.
              - If the action needs no assets, use "NO_MATERIAL_NEEDED: [brief guidance]".
            </rules_for_action_strategy>
            For example:
            - Requirement: We need to send the client an ROI Sheet
              - Primary: We have an ROI Sheet in our database which we can use.
              - Secondary: We don't have an ROI sheet in our database, but other material references ROI's. Therefore, we can reference that instead, and also add placeholders for a user to fill in actual ROI if desired.
              - Fall back: We don't have an ROI sheet in our database, and other material doesn't reference ROI's. Therefore, we will adjust our strategy to not include an ROI sheet.
            - Requirement: We need to send the client a breakup email
              - Primary: We have a breakup email template in our database which we can use.
              - Secondary: We don't have a breakup email in our database, but other email formatting templates and instructions exist. Therefore, we can reference that instead, along with general knowledge about how to structure a breakup email.
              - Fall back: We don't have a breakup email in our database, and other material doesn't reference breakups. Therefore, we will adjust our strategy to simply follow best practice and structure a breakup email, and look it up online for latest breakup email advise.
              We then include this information our main action's actionStrategy field.
              In general, we want to use our database and playbooks as much as possible, but if we don't have the information, we want to look it up online and/or then use best practice. Always have a fall back in case we don't have the information, which allows us to keep the spirit of the main action but action it without that information.
            </action_strategy_process>
            </step_5_required_information>
            <step_6_validation_checklist>
              <before_recommending_multiple_actions>
                - [ ] Can all actions be started today without waiting for responses?
                - [ ] Do the actions address different stakeholders or completely separate needs?
                - [ ] Would delaying any action harm the deal?
                - [ ] Are the actions truly independent (no dependencies)?
                - [ ] Is the timing critical for all actions?
              </before_recommending_multiple_actions>
              If you answered NO to any question above, recommend a single action instead.
            </step_6_validation_checklist>
          </strategic_analysis_framework>
          <output_format>
            <for_single_action_most_common>
    \`\`\`json
    {
      "actions": [
        {
          "id": "main-1",
          "type": "EMAIL",
          "details": { /* action details */ },
          "reasoning": "Contact confirmed availability for a meeting, we should acknowledge and send a calendar invite.",
          "sourceActivityIds": ["activity_id_1"],
          "priority": 1,
          "actionStrategy": "NO_MATERIAL_NEEDED: Write a short, friendly reply confirming the meeting time and letting them know a calendar invite is on its way. No attachments or collateral required.",
          "debug": "In step 1, I decided... In step 2, I decided... In step 3, I decided..."
        }
      ]
    }
    \`\`\`
            </for_single_action_most_common>
            <for_single_action_with_material_only_if_needed>
    \`\`\`json
    {
      "actions": [
        {
          "id": "main-1",
          "type": "EMAIL",
          "details": { /* action details */ },
          "reasoning": "Prospect asked for an ROI breakdown to share internally.",
          "sourceActivityIds": ["activity_id_1"],
          "priority": 1,
          "actionStrategy": "Primary: ROI sheet in our database. Secondary: Exec summary sections that quantify retention/time savings. Fallback: concise ROI summary in the email without attachments.",
          "debug": "In step 1, I decided... In step 2, I decided... In step 3, I decided..."
        }
      ]
    }
    \`\`\`
            </for_single_action_with_material_only_if_needed>
            <for_multiple_actions_only_when_truly_needed>
    \`\`\`json
    {
      "actions": [
        {
          "id": "main-1",
          "type": "EMAIL",
          "details": { /* action details */ },
          "reasoning": "Urgent response to CEO's question about...",
          "sourceActivityIds": ["activity_id_1"],
          "priority": 1,
          "actionStrategy": "Use our canned FAQ responses to answer the CEO's question. If that is unavailable, use our executive summary or a website search.",
          "debug": "according the the rule 'clear next steps - prospect requires a response', I decided we need to send an email back to the CEO to answer his question. We skipped step 2 as there was a clear next step. In step 3, I decided we didn't need multiple actions as it was only the CEO asking a question. In step 4, I decided that pipeline stage didn't need an adjustment at this time as the email did not meet any of the stage criteria."
        },
        {
          "id": "main-2", 
          "type": "CALL",
          "details": { /* action details */ },
          "reasoning": "Separate urgent issue with procurement...",
          "sourceActivityIds": ["activity_id_2"],
          "priority": 2,
          "actionStrategy": "find a UK case study that highlights time savings if it exists. If this cannot be found, use another case study that highlights time savings. If neither of these exist, reinforce the timesavings as discussed in our meetings and give an additional case study in the UK.",
          "debug": "debug": "In step 1, I decided... In step 2, I decided... In step 3, I decided..."
          

        }
      ]
    }
    \`\`\`
            </for_multiple_actions_only_when_truly_needed>
            <key_guidelines>
              - **Default to the single most impactful action** unless multiple actions are truly necessary
              - **Default to NO_MATERIAL_NEEDED** unless the material reasoning template clearly supports inclusion
              - **Assign realistic priorities** based on deal impact and urgency
              - **Set actionStrategy** for the action
              - **Reference specific activity IDs** and quote actual communications
              - **Be strategic** - think like a top sales professional who advances deals systematically
              - **Keep actions self-contained** - each action should be complete on its own
            </key_guidelines>
            Remember: Multiple actions should be the exception, not the rule. Most sales situations require focused, sequential action-taking rather than parallel execution.
            <important>NEVER INVENT INFORMATION ABOUT CLIENTS OR THE BUSINESS</important>
          </output_format>
          <pre_finish_checklist>
          Double check the following before finishing your task:
             [ ] If action.type = "EMAIL" and you are replying:
                  - replyToMessageId equals the "messageId" of the latest EMAIL in <recent_activities>
                  - threadId equals that EMAIL’s "threadId"
            - [ ] If starting a new thread (reboot): replyToMessageId and threadId are omitted
            - [ ] If the clear next step is an email, have we followed the email_threading_policy above?
            - [ ] Have I included the correct actionStrategy for the main action?
            - [ ] Have I included the correct actionType for the main action?
            - [ ] Have I included the correct reasoning for the main action?
            - [ ] Have I included the correct sourceActivityIds for the main action?
            - [ ] Have I included the correct details for the main action?
            - [ ] Have I determined if the pipeline stage needs to be updated?
            - [ ] Have I not restated any information already contained in previous messages unless 
            explicitly asked to do so in the most recent message?
            - [ ] I've made sure that my content is appropriate given the contact's current state and energy level.
          </pre_finish_checklist>
          `;

        const inputVariables = {
          opportunity,
          contacts,
          recentActivities,
          futureEvents,
          dealIntelligence,
          existingActions,
          businessInformation,
          productInformation,
          productOverview,
          salesProcess,
          collateral,
          contactsSummary,
          recentActivitiesSummary,
          eventsSummary,
          existingActionsSummary,
          pipelineStagesSummary,
          currentStageName,
          attemptInfo,
          attempt,
          maxAttempts,
          todaysDate,
          currentTime,
        };

        return { prompt, inputVariables };
      }
    }
