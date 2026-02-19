import mongoose from 'mongoose';
import chalk from 'chalk';
import { ProposedAction, IProposedAction } from '../../../models/ProposedAction';
import Opportunity, { IOpportunity } from '../../../models/Opportunity';
import Contact, { IContact } from '../../../models/Contact';
import Activity, { IActivity } from '../../../models/Activity';
import EmailActivity, { IEmailActivity } from '../../../models/EmailActivity';
import CalendarActivity, { ICalendarActivity } from '../../../models/CalendarActivity';
import { ActionEvaluationAgent, ActionEvaluationContext, ActionEvaluationResponse } from './ActionEvaluationAgent';
import { NextBestActionAgent } from './NextBestActionAgent';
import { cleanupProposedActionAttachments } from '../../emailAttachmentService';

export interface ActionPipelineContext {
  opportunity: IOpportunity;
  contacts: Array<{
    contact: IContact;
    intelligence: any; // Intelligence data from the contact
  }>;
  recentActivities: Array<IActivity | IEmailActivity | ICalendarActivity>;
  futureEvents: ICalendarActivity[];
  dealIntelligence: any; // Deal-level intelligence context
  existingActions: IProposedAction[];
}

export class ActionPipelineService {
  /**
   * Determines the actual activity model name for a given activity ID by checking
   * which collection contains the activity.
   * 
   * @param activityId The ID of the activity to check
   * @returns Promise resolving to the activity model name
   */
  private static async getActivityModelName(activityId: mongoose.Types.ObjectId): Promise<string> {
    // Check EmailActivity first (most specific)
    const emailActivity = await EmailActivity.findById(activityId).select('_id').lean();
    if (emailActivity) {
      return 'EmailActivity';
    }

    // Check CalendarActivity next
    const calendarActivity = await CalendarActivity.findById(activityId).select('_id').lean();
    if (calendarActivity) {
      return 'CalendarActivity';
    }

    // Check base Activity last (fallback)
    const activity = await Activity.findById(activityId).select('_id').lean();
    if (activity) {
      return 'Activity';
    }

    // If not found in any collection, default to Activity
    console.log(chalk.yellow(`    -> Warning: Activity ${activityId} not found in any collection, defaulting to Activity model`));
    return 'Activity';
  }

  /**
   * Triggers the decision phase of the action pipeline for a specific opportunity.
   * This method gathers comprehensive context about the opportunity and its contacts,
   * then calls the AI to decide on next best actions.
   * 
   * @param opportunityId The ID of the opportunity to process
   * @returns Promise resolving to the pipeline context that will be passed to the AI
   */
  public static async triggerDecisionPhase(opportunityId: mongoose.Types.ObjectId): Promise<ActionPipelineContext> {
    console.log(chalk.blue.bold(`[ACTION PIPELINE] Triggering decision phase for opportunity ${opportunityId}...`));

    try {
      // 1. Fetch the opportunity and validate it exists
      console.log(chalk.cyan(`  -> Fetching opportunity ${opportunityId}...`));
      const opportunity = await Opportunity.findById(opportunityId).populate('stage');
      if (!opportunity) {
        throw new Error(`Opportunity with ID ${opportunityId} not found`);
      }

      // 2. Fetch all contacts associated with the opportunity
      console.log(chalk.cyan(`  -> Fetching contacts for opportunity...`));
      const contacts = await Contact.find({ _id: { $in: opportunity.contacts } });
      
      // 3. Gather intelligence for each contact
      console.log(chalk.cyan(`  -> Gathering contact intelligence...`));
      const contactsWithIntelligence = await Promise.all(
        contacts.map(async (contact) => {
          const intelligence = await contact.getOrCreateOpportunityIntelligence(opportunityId);
          return {
            contact,
            intelligence
          };
        })
      );


      // 5. Find future calendar events that might be relevant
      console.log(chalk.cyan(`  -> Finding future calendar events...`));
      const futureEvents = await this.findFutureEvents(opportunity.contacts);

      // 5. Find recent activities that might be relevant
      console.log(chalk.cyan(`  -> Finding recent activities...`));
      const recentActivities = await this.findRecentActivities(opportunity.contacts, opportunity.prospect);

      // 6. Get deal-level intelligence context
      console.log(chalk.cyan(`  -> Generating deal intelligence context...`));
      const dealIntelligence = await this.getOpportunityContext(opportunity, contactsWithIntelligence);

      // 7. Fetch existing proposed actions for this opportunity
      console.log(chalk.cyan(`  -> Fetching existing proposed actions...`));
      const proposedOrApprovedActions = await ProposedAction.find({
        opportunity: opportunityId,
        status: { $in: ['PROPOSED', 'APPROVED'] }
      }).sort({ createdAt: -1 });

      const actionsWithScheduledActivities = await this.findActionsWithPendingScheduledActivities(opportunityId);

      const existingActionsMap = new Map<string, IProposedAction>();
      for (const action of [...proposedOrApprovedActions, ...actionsWithScheduledActivities]) {
        existingActionsMap.set((action._id as mongoose.Types.ObjectId).toString(), action);
      }

      const existingActions = Array.from(existingActionsMap.values());

      const context: ActionPipelineContext = {
        opportunity,
        contacts: contactsWithIntelligence,
        recentActivities,
        futureEvents,
        dealIntelligence,
        existingActions
      };

      console.log(chalk.green.bold(`[ACTION PIPELINE] Successfully gathered context for opportunity ${opportunityId}`));
      console.log(chalk.gray(`  Context summary:`));
      console.log(chalk.gray(`    - Contacts: ${contactsWithIntelligence.length}`));
      console.log(chalk.gray(`    - Recent activities: ${recentActivities.length}`));
      console.log(chalk.gray(`    - Future events: ${futureEvents.length}`));
      console.log(chalk.gray(`    - Existing actions: ${existingActions.length}`));

      return context;

    } catch (error) {
      console.error(chalk.red(`[ACTION PIPELINE] Error in triggerDecisionPhase for opportunity ${opportunityId}:`), error);
      throw error;
    }
  }

  /**
   * Finds actions that have pending scheduled activities (e.g. scheduled emails).
   * This ensures executed actions with scheduled work are included in re-evaluation.
   * 
   * @param opportunityId The ID of the opportunity to check
   * @returns Promise resolving to array of proposed actions with pending scheduled activities
   */
  private static async findActionsWithPendingScheduledActivities(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<IProposedAction[]> {
    const opportunity = await Opportunity.findById(opportunityId).select('contacts prospect').lean();
    if (!opportunity) {
      return [];
    }

    const orConditions: Record<string, any>[] = [];
    if (Array.isArray(opportunity.contacts) && opportunity.contacts.length > 0) {
      orConditions.push({ contacts: { $in: opportunity.contacts } });
    }
    if (opportunity.prospect) {
      orConditions.push({ prospect: opportunity.prospect });
    }

    if (orConditions.length === 0) {
      return [];
    }

    const scheduledEmails = await EmailActivity.find({
      status: 'scheduled',
      isDraft: false,
      isSent: false,
      'metadata.sourceAction': { $exists: true },
      $or: orConditions
    }).select('metadata.sourceAction').lean();

    const actionIds = Array.from(new Set(
      scheduledEmails
        .map(email => email?.metadata?.sourceAction)
        .filter(Boolean)
        .map(id => id.toString())
    ));

    if (actionIds.length === 0) {
      return [];
    }

    const objectIds = actionIds.map(id => new mongoose.Types.ObjectId(id));
    return ProposedAction.find({
      _id: { $in: objectIds },
      opportunity: opportunityId
    }).sort({ createdAt: -1 });
  }

  /**
   * Triggers the complete decision phase and generates proposed actions using AI.
   * This method combines context gathering with AI decision-making to create actionable recommendations.
   * 
   * @param opportunityId The ID of the opportunity to process
   * @returns Promise resolving to array of proposed actions created
   */
  public static async generateProposedActions(opportunityId: mongoose.Types.ObjectId): Promise<IProposedAction[]> {
    console.log(chalk.blue.bold(`[ACTION PIPELINE] Generating proposed actions for opportunity ${opportunityId}...`));

    try {
      // 1. Gather complete context
      const context = await this.triggerDecisionPhase(opportunityId);

      // 2. Get AI recommendations (with retry mechanism)
      console.log(chalk.cyan(`  -> Calling AI agent for action recommendations...`));
      const aiRecommendations = await NextBestActionAgent.decideNextActions(context);

      // 3. Create ProposedAction documents
      console.log(chalk.cyan(`  -> Creating ${aiRecommendations.actions.length} proposed actions...`));
      const proposedActions: IProposedAction[] = [];

      for (const action of aiRecommendations.actions) {
        // Get the actual activity model names for source activities
        const sourceActivities = await Promise.all(
          action.sourceActivityIds.map(async (id) => ({
            activityId: new mongoose.Types.ObjectId(id),
            activityModel: await this.getActivityModelName(new mongoose.Types.ObjectId(id))
          }))
        );

        const proposedAction = new ProposedAction({
          organization: context.opportunity.organization,
          opportunity: opportunityId,
          sourceActivities,
          type: action.type,
          status: 'PROPOSED',
          details: action.details,
          reasoning: action.reasoning,
          createdBy: {
            type: 'AI_AGENT',
          }
        });

        await proposedAction.save();
        proposedActions.push(proposedAction);
      }

      console.log(chalk.green.bold(`[ACTION PIPELINE] Successfully created ${proposedActions.length} proposed actions`));
      return proposedActions;

    } catch (error) {
      console.error(chalk.red(`[ACTION PIPELINE] Error in generateProposedActions for opportunity ${opportunityId}:`), error);
      throw error;
    }
  }

  /**
   * Cancels all 'PROPOSED' actions for a given opportunity.
   * This is used when an opportunity is being reprocessed to avoid acting on stale recommendations.
   * 
   * @param opportunityId The ID of the opportunity
   * @returns Promise resolving to the number of actions cancelled
   */
  public static async cancelAllProposedActionsForOpportunity(opportunityId: string): Promise<number> {
    console.log(chalk.yellow.bold(`[ACTION PIPELINE] Cancelling all proposed actions for opportunity ${opportunityId}...`));

    try {
      const objectId = new mongoose.Types.ObjectId(opportunityId);

      const result = await ProposedAction.updateMany(
        { 
          opportunity: objectId,
          status: 'PROPOSED' 
        },
        { 
          $set: { status: 'CANCELLED' } 
        }
      );

      console.log(chalk.green(`[ACTION PIPELINE] Successfully cancelled ${result.modifiedCount} proposed actions for opportunity ${opportunityId}`));
      return result.modifiedCount;

    } catch (error) {
      console.error(chalk.red(`[ACTION PIPELINE] Error cancelling proposed actions for opportunity ${opportunityId}:`), error);
      throw error;
    }
  }

  /**
   * Gets all proposed actions for an opportunity
   * 
   * @param opportunityId The ID of the opportunity
   * @returns Promise resolving to array of proposed actions
   */
  public static async getActions(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<IProposedAction[]> {
    const actions = await ProposedAction.find({ 
      opportunity: opportunityId 
    }).sort({ createdAt: -1 });

    return actions;
  }

  /**
   * Gets a specific action by ID
   * 
   * @param actionId The ID of the action
   * @returns Promise resolving to the action or null if not found
   */
  public static async getAction(actionId: mongoose.Types.ObjectId): Promise<IProposedAction | null> {
    return await ProposedAction.findById(actionId);
  }

  /**
   * Re-evaluates existing actions for an opportunity, typically called after new intelligence
   * is processed. This method uses AI to intelligently evaluate existing proposed actions
   * and scheduled events, deciding which to keep, cancel, modify, and what new actions are needed.
   * 
   * @param opportunityId The ID of the opportunity to re-evaluate
   * @param evaluationTrigger Optional reason why this evaluation was triggered
   * @returns Promise resolving to the updated pipeline context
   */
  public static async reEvaluateActions(
    opportunityId: mongoose.Types.ObjectId, 
    evaluationTrigger?: string
  ): Promise<ActionPipelineContext> {
    console.log(chalk.blue.bold(`[ACTION PIPELINE] Re-evaluating actions for opportunity ${opportunityId}...`));

    try {
      // 1. Gather comprehensive context about the opportunity
      console.log(chalk.cyan(`  -> Gathering current context...`));
      const context = await this.triggerDecisionPhase(opportunityId);

      // 2. If no existing actions or future events, just generate new actions
      if (context.existingActions.length === 0 && context.futureEvents.length === 0) {
        console.log(chalk.cyan(`  -> No existing actions or events to evaluate, generating new actions...`));
        const newActions = await this.generateProposedActions(opportunityId);
        context.existingActions = newActions;
        return context;
      }

      // 3. Use AI to evaluate existing actions and events in light of new activities
      console.log(chalk.cyan(`  -> Using AI to evaluate existing actions and events...`));
      const evaluationContext: ActionEvaluationContext = {
        ...context,
        evaluationTrigger
      };

      const evaluationResponse = await ActionEvaluationAgent.evaluateActions(evaluationContext);
      const evaluation = evaluationResponse.evaluation;

      console.log(chalk.green(`  -> AI evaluation completed:`));
      console.log(chalk.gray(`    - Actions to keep: ${evaluation.existingActionDecisions.filter(d => d.decision === 'KEEP').length}`));
      console.log(chalk.gray(`    - Actions to cancel: ${evaluation.existingActionDecisions.filter(d => d.decision === 'CANCEL').length}`));
      console.log(chalk.gray(`    - Actions to modify: ${evaluation.existingActionDecisions.filter(d => d.decision === 'MODIFY').length}`));
      console.log(chalk.gray(`    - Events to keep: ${evaluation.calendarEventDecisions.filter(d => d.decision === 'KEEP').length}`));
      console.log(chalk.gray(`    - Events to cancel/reschedule: ${evaluation.calendarEventDecisions.filter(d => d.decision !== 'KEEP').length}`));
      console.log(chalk.gray(`    - New actions needed: ${evaluation.needsNewActions}`));
      if (evaluationResponse.newActions) {
        console.log(chalk.gray(`    - New actions generated: ${evaluationResponse.newActions.actions.length}`));
      }

      // 4. Apply the evaluation decisions in a transaction
      const session = await mongoose.startSession();
      let updatedActions: IProposedAction[] = [];

      try {
        await session.withTransaction(async () => {
          // 4a. Defensive dedupe before applying (should already be deduped, but safety check)
          const seenActionIds = new Set<string>();
          const dedupedDecisions = evaluation.existingActionDecisions.filter(decision => {
            if (seenActionIds.has(decision.actionId)) {
              console.log(chalk.yellow(`    -> Warning: Duplicate decision for action ${decision.actionId} detected in pipeline, skipping`));
              return false;
            }
            seenActionIds.add(decision.actionId);
            return true;
          });

          // 4b. Apply existing action decisions
          console.log(chalk.cyan(`  -> Applying decisions for existing actions...`));
          for (const decision of dedupedDecisions) {
            const action = await ProposedAction.findById(decision.actionId).session(session);
            if (!action) {
              console.log(chalk.yellow(`    -> Warning: Action ${decision.actionId} not found, skipping`));
              continue;
            }

            switch (decision.decision) {
              case 'CANCEL':
                console.log(chalk.yellow(`    -> Cancelling action ${decision.actionId}: ${decision.reasoning}`));
                
                // Clean up any resulting activities (e.g., scheduled emails that haven't been sent)
                if (action.resultingActivities && action.resultingActivities.length > 0) {
                  console.log(chalk.cyan(`    -> Cleaning up ${action.resultingActivities.length} resulting activities...`));
                  
                  for (const resultingActivity of action.resultingActivities) {
                    try {
                      await this.cleanupResultingActivity(resultingActivity, session);
                    } catch (cleanupError) {
                      console.error(chalk.red(`      -> Failed to cleanup activity ${resultingActivity.activityId}:`), cleanupError);
                      // Continue with other activities even if one fails
                    }
                  }
                }
                
                // Clean up any attachments before cancelling
                try {
                  await cleanupProposedActionAttachments(action, context.opportunity.organization.toString());
                } catch (cleanupError) {
                  console.error('Error cleaning up attachments during action cancellation:', cleanupError);
                  // Continue with cancellation even if cleanup fails
                }
                
                action.status = 'CANCELLED';
                await action.save({ session });
                break;

              case 'MODIFY':
                console.log(chalk.cyan(`    -> Modifying action ${decision.actionId}: ${decision.reasoning}`));
                if (decision.modifiedDetails && typeof decision.modifiedDetails === 'object') {
                  // If action already produced scheduled activities, cancel them and reset to PROPOSED
                  if (action.resultingActivities && action.resultingActivities.length > 0) {
                    console.log(chalk.cyan(`    -> Cleaning up ${action.resultingActivities.length} resulting activities before modification...`));

                    for (const resultingActivity of action.resultingActivities) {
                      try {
                        await this.cleanupResultingActivity(resultingActivity, session);
                      } catch (cleanupError) {
                        console.error(chalk.red(`      -> Failed to cleanup activity ${resultingActivity.activityId}:`), cleanupError);
                      }
                    }

                    action.resultingActivities = [];
                    action.status = 'PROPOSED';
                    action.executedAt = undefined;
                    console.log(chalk.yellow(`    -> Action reset to PROPOSED status for re-approval`));
                  }

                  action.details = { ...action.details, ...decision.modifiedDetails };
                  // Update reasoning cleanly without appending
                  action.reasoning = decision.reasoning;
                  action.lastEditedBy = {
                    type: 'AI_AGENT',
                    at: new Date()
                  };
                  // TODO: Consider adding modification history tracking
                  // action.modificationHistory = [...(action.modificationHistory || []), { 
                  //   modifiedAt: new Date(), 
                  //   modifiedBy: 'AI_AGENT',
                  //   previousReasoning: action.reasoning,
                  //   modificationReason: decision.reasoning 
                  // }];
                  await action.save({ session });
                  updatedActions.push(action);
                }
                break;

              case 'KEEP':
                console.log(chalk.green(`    -> Keeping action ${decision.actionId}: ${decision.reasoning}`));
                updatedActions.push(action);
                break;
            }
          }

          // 4c. Apply calendar event decisions (for now, just log - actual rescheduling would use nylas API integration)
          // Unlikely to ever need to cancel or reschedule events from sellers end
          console.log(chalk.cyan(`  -> Processing calendar event decisions...`));
          for (const decision of evaluation.calendarEventDecisions) {
            switch (decision.decision) {
              case 'CANCEL':
                console.log(chalk.yellow(`    -> Calendar event ${decision.eventId} recommended for cancellation: ${decision.reasoning}`));
                break;
              case 'RESCHEDULE':
                console.log(chalk.cyan(`    -> Calendar event ${decision.eventId} recommended for rescheduling: ${decision.reasoning}`));
                if (decision.newScheduledTime) {
                  console.log(chalk.gray(`      -> Suggested new time: ${decision.newScheduledTime}`));
                }
                break;
              case 'KEEP':
                console.log(chalk.green(`    -> Calendar event ${decision.eventId} should proceed as planned: ${decision.reasoning}`));
                break;
            }
          }

          // 4d. Create new actions if needed and generated
          if (evaluationResponse.newActions && evaluationResponse.newActions.actions.length > 0) {
            console.log(chalk.cyan(`  -> Creating ${evaluationResponse.newActions.actions.length} new actions...`));
            
            // Create ProposedAction documents from the generated actions (already have content composed)
            for (const action of evaluationResponse.newActions.actions) {
              // Get the actual activity model names for source activities
              const sourceActivities = await Promise.all(
                action.sourceActivityIds.map(async (id: string) => ({
                  activityId: new mongoose.Types.ObjectId(id),
                  activityModel: await this.getActivityModelName(new mongoose.Types.ObjectId(id))
                }))
              );

              const newAction = new ProposedAction({
                organization: context.opportunity.organization,
                opportunity: opportunityId,
                sourceActivities,
                type: action.type,
                status: 'PROPOSED',
                details: action.details,
                reasoning: action.reasoning,
                createdBy: {
                  type: 'AI_AGENT'
                }
              });

              await newAction.save({ session });
              updatedActions.push(newAction);
              console.log(chalk.green(`    -> Created ${action.type} action (Priority: ${action.priority}) with composed content`));
            }
          }
        });

        console.log(chalk.green.bold(`[ACTION PIPELINE] Successfully applied evaluation decisions`));

      } finally {
        await session.endSession();
      }

      // 5. Update context with the new action state
      context.existingActions = updatedActions;

      console.log(chalk.green.bold(`[ACTION PIPELINE] Re-evaluation complete for opportunity ${opportunityId}`));
      console.log(chalk.gray(`  Final state: ${updatedActions.length} active/proposed actions`));
      console.log(chalk.blue(`  Overall Assessment: ${evaluation.overallAssessment}`));

      return context;

    } catch (error) {
      console.error(chalk.red(`[ACTION PIPELINE] Error in reEvaluateActions for opportunity ${opportunityId}:`), error);
      throw error;
    }
  }

  /**
   * Finds all activities that are relevant to the opportunity.
   * 
   * @param contactIds Array of contact IDs to search activities for
   * @returns Promise resolving to array of unhandled activities
   */
  private static async findRecentActivities(
    contactIds: mongoose.Types.ObjectId[],
    prospectId: mongoose.Types.ObjectId
  ): Promise<Array<IActivity | IEmailActivity | ICalendarActivity>> {
    console.log(chalk.blue(`    -> Searching for recent activities across ${contactIds.length} contacts...`));

    const [activities, emailActivities, calendarActivities] = await Promise.all([
      // Activities don't have contacts, so we use the prospect
      Activity.find({
        prospect: prospectId,
      }).sort({ date: -1 }).limit(15),

      EmailActivity.find({
        contacts: { $in: contactIds },
      }).sort({ date: -1 }).limit(15),

      CalendarActivity.find({
        contacts: { $in: contactIds },
      }).sort({ date: -1 }).limit(15)
    ]);

    const recentActivities = [...activities, ...emailActivities, ...calendarActivities];
    
    // Sort by date descending to prioritize recent activities
    recentActivities.sort((a, b) => b.date.getTime() - a.date.getTime());

    console.log(chalk.blue(`    -> Found ${recentActivities.length} recent activities`));
    return recentActivities;
  }


  /**
   * Finds future calendar events that might be relevant for action planning.
   * This includes scheduled meetings, calls, and other calendar events.
   * 
   * @param contactIds Array of contact IDs to search events for
   * @returns Promise resolving to array of future calendar events
   */
  private static async findFutureEvents(
    contactIds: mongoose.Types.ObjectId[]
  ): Promise<ICalendarActivity[]> {
    console.log(chalk.blue(`    -> Searching for future events across ${contactIds.length} contacts...`));

    const futureEvents = await CalendarActivity.find({
      contacts: { $in: contactIds },
      startTime: { $gt: new Date() }, // Future events only
      status: { $in: ['scheduled', 'to_do'] }
    }).sort({ startTime: 1 }).limit(20); // Limit to next 20 events

    console.log(chalk.blue(`    -> Found ${futureEvents.length} future events`));
    return futureEvents;
  }

  /**
   * Validates that an opportunity is eligible for action pipeline processing.
   * This checks for active opportunity status and other business rules.
   * 
   * @param opportunity The opportunity to validate
   * @returns Boolean indicating if the opportunity is eligible
   */
  private static isOpportunityEligible(opportunity: IOpportunity): boolean {
    // Check if opportunity is in an active stage (not closed-lost or closed-won)
    const stage = opportunity.stage as any;
    if (stage?.isClosedLost) {
      console.log(chalk.yellow(`    -> Opportunity ${opportunity._id} is in a closed-lost stage (${stage.name})`));
      return false;
    }

    if (stage?.isClosedWon) {
      console.log(chalk.yellow(`    -> Opportunity ${opportunity._id} is in a closed-won stage (${stage.name})`));
      return false;
    }

    // Check if opportunity has contacts
    if (!opportunity.contacts || opportunity.contacts.length === 0) {
      console.log(chalk.yellow(`    -> Opportunity ${opportunity._id} has no contacts`));
      return false;
    }

    return true;
  }

  /**
   * Generates deal-level intelligence context from opportunity and contact data.
   * 
   * @param opportunity The opportunity document
   * @param contactsWithIntelligence Array of contacts with their intelligence data
   * @returns Deal intelligence context object
   */
  private static async getOpportunityContext(
    opportunity: IOpportunity,
    contactsWithIntelligence: Array<{ contact: IContact; intelligence: any }>
  ): Promise<any> {
    console.log(chalk.blue(`    -> Gathering deal intelligence context...`));

    // Build deal summary
    const dealSummary = {
      opportunity: {
        name: opportunity.name,
        stage: opportunity.stage,
        amount: opportunity.amount,
        probability: opportunity.probability,
        expectedCloseDate: opportunity.expectedCloseDate,
        summary: opportunity.opportunitySummary?.summary || 'No summary available'
      },
      meddpicc: {
        metrics: opportunity.meddpicc?.metrics || [],
        economicBuyer: opportunity.meddpicc?.economicBuyer || [],
        decisionCriteria: opportunity.meddpicc?.decisionCriteria || [],
        decisionProcess: opportunity.meddpicc?.decisionProcess || [],
        paperProcess: opportunity.meddpicc?.paperProcess || [],
        identifiedPain: opportunity.meddpicc?.identifiedPain || [],
        champion: opportunity.meddpicc?.champion || [],
        competition: opportunity.meddpicc?.competition || []
      },
      dealHealth: {
        trend: opportunity.dealHealthTrend || 'Unknown',
        momentum: opportunity.momentumDirection || 'Unknown',
        narrative: opportunity.latestDealNarrative || 'No narrative available'
      },
      riskFactors: opportunity.riskFactors || [],
      keyMilestones: opportunity.keyMilestones || [],
      nextSteps: opportunity.nextSteps || 'No next steps defined'
    };

    console.log(chalk.blue(`    -> Generated deal intelligence context`));
    return dealSummary;
  }

  /**
   * Cleans up a resulting activity by deleting it from the database.
   * This is used when cancelling actions that created scheduled activities.
   * Only deletes activities that are scheduled and not yet sent/completed.
   * 
   * @param resultingActivity The activity reference to cleanup
   * @param session MongoDB session for transaction
   */
  private static async cleanupResultingActivity(
    resultingActivity: { activityId: any; activityModel: string },
    session: mongoose.ClientSession
  ): Promise<void> {
    const { activityId, activityModel } = resultingActivity;
    
    console.log(chalk.gray(`      -> Cleaning up ${activityModel} ${activityId}...`));

    // Get the appropriate model based on activityModel
    let Model;
    switch (activityModel) {
      case 'EmailActivity':
        Model = EmailActivity;
        break;
      case 'CalendarActivity':
        Model = CalendarActivity;
        break;
      case 'Activity':
      default:
        Model = Activity;
        break;
    }

    // For EmailActivity, only delete if it's scheduled and not sent
    if (activityModel === 'EmailActivity') {
      const emailActivity = await EmailActivity.findById(activityId).session(session);
      
      if (!emailActivity) {
        console.log(chalk.yellow(`      -> EmailActivity ${activityId} not found, may have been already deleted`));
        return;
      }

      // Only delete if it's scheduled and not sent
      if (emailActivity.status === 'scheduled') {
        await EmailActivity.findByIdAndDelete(activityId).session(session);
        console.log(chalk.green(`      -> Deleted scheduled EmailActivity ${activityId}`));
        
        // TODO: Also remove from contacts' emailActivities arrays if needed
        // This would require updating Contact documents but might be handled by refs
      } else {
        console.log(chalk.yellow(`      -> EmailActivity ${activityId} cannot be deleted (status: ${emailActivity.status}, isSent: ${emailActivity.isSent})`));
      }
    } else {
      // For other activity types, delete if they are scheduled/to_do and not completed
      const activity = await (Model as any).findById(activityId).session(session);
      
      if (!activity) {
        console.log(chalk.yellow(`      -> ${activityModel} ${activityId} not found, may have been already deleted`));
        return;
      }

      if (activity.status && ['scheduled', 'to_do'].includes(activity.status)) {
        await (Model as any).findByIdAndDelete(activityId).session(session);
        console.log(chalk.green(`      -> Deleted ${activityModel} ${activityId} (status: ${activity.status})`));
      } else {
        console.log(chalk.yellow(`      -> ${activityModel} ${activityId} cannot be deleted (status: ${activity.status})`));
      }
    }
  }
} 