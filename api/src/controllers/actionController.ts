import { Request, Response } from 'express';
import mongoose, { Schema } from 'mongoose';
import { ProposedAction } from '../models/ProposedAction';
import Opportunity from '../models/Opportunity';
import Activity from '../models/Activity';
import EmailActivity from '../models/EmailActivity';
import CalendarActivity from '../models/CalendarActivity';
import { ActionExecutionService } from '../services/AI/actionPipeline/ActionExecutionService';
import { ActionPipelineService } from '../services/AI/actionPipeline/ActionPipelineService';
import { ContentCompositionAgent } from '../services/AI/actionPipeline/ContentCompositionAgent';
import { cleanupProposedActionAttachments } from '../services/emailAttachmentService';

// Helper function to populate sourceActivities manually
const populateSourceActivities = async (actions: any[]) => {
  const populatedActions = [];
  
  for (const action of actions) {
    // Convert to plain object to allow modifications
    const actionObj = action.toObject ? action.toObject() : action;
    
    if (actionObj.sourceActivities && actionObj.sourceActivities.length > 0) {
      for (let i = 0; i < actionObj.sourceActivities.length; i++) {
        const sourceActivity = actionObj.sourceActivities[i];
        const { activityId, activityModel } = sourceActivity;
        
        let populatedActivity = null;
        
        try {
          switch (activityModel) {
            case 'EmailActivity':
              populatedActivity = await EmailActivity.findById(activityId)
                .select('aiSummary.summary');
              break;
            case 'CalendarActivity':
              populatedActivity = await CalendarActivity.findById(activityId)
                .select('aiSummary.summary');
              break;
            case 'Activity':
              populatedActivity = await Activity.findById(activityId)
                .select('aiSummary.summary');
              break;
          }
          
          if (populatedActivity) {
            // Add the populated activity details to the source activity
            actionObj.sourceActivities[i] = {
              ...sourceActivity,
              activityDetails: populatedActivity.toObject()
            };
            console.log(`Successfully populated ${activityModel} for activity ${activityId}`);
          } else {
            console.log(`No activity found for ${activityModel} with ID ${activityId}`);
          }
        } catch (error) {
          console.error(`Error populating ${activityModel} with ID ${activityId}:`, error);
          // Continue with other activities even if one fails
        }
      }
    }
    
    populatedActions.push(actionObj);
  }
  
  return populatedActions;
};

// Get all actions for a specific opportunity
export const getOpportunityActions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { opportunityId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Verify opportunity exists and belongs to organization
    const opportunity = await Opportunity.findOne({
      _id: opportunityId,
      organization: user.organization
  }).populate('contacts').populate('prospect');

    if (!opportunity) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    // Get actions for the opportunity, sorted by creation date (newest first)
    const actions = await ProposedAction.find({
      opportunity: opportunityId,
      organization: user.organization
    }).sort({ createdAt: -1 });

    // Manually populate sourceActivities with details from different activity models
    const populatedActions = await populateSourceActivities(actions);

    // Remove workflowMetadata from details before sending response
    const sanitizedActions = populatedActions.map(action => {
      if (action.details && action.details.workflowMetadata) {
        const { workflowMetadata, ...detailsWithoutMetadata } = action.details;
        return { ...action, details: detailsWithoutMetadata };
      }
      return action;
    });

    res.status(200).json({
      success: true,
      data: sanitizedActions,
      opportunity: opportunity,
      contacts: opportunity.contacts,
      count: sanitizedActions.length
    });

  } catch (error) {
    console.error('Error fetching opportunity actions:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get actions across all opportunities for the organization (with filters)
export const getActions = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { status, type, limit = 50, skip = 0, owner } = req.query as any;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Build filter query
    const filterQuery: any = {};
    
    // Get all opportunities for the organization first (optionally filter by owner)
    const opportunityFilter: any = { organization: user.organization };
    if (owner === 'me') {
      opportunityFilter.owner = user._id;
    }
    const opportunities = await Opportunity.find(opportunityFilter).select('_id');
    
    const opportunityIds = opportunities.map((opp: any) => opp._id);
    filterQuery.opportunity = { $in: opportunityIds };
    filterQuery.organization = user.organization;

    if (status) {
      // Handle both single status and array of statuses
      if (Array.isArray(status)) {
        filterQuery.status = { $in: status };
      } else {
        filterQuery.status = status;
      }
    } else {
      // Default to only actionable statuses if no status filter is provided
      // This keeps the Today sidebar clean by only showing actions that need user attention
      filterQuery.status = { $in: ['PROPOSED', 'PROCESSING UPDATES'] };
    }
    
    if (type) {
      filterQuery.type = type;
    }

    // Get actions with pagination
    const actions = await ProposedAction.find(filterQuery)
      .populate({
        path: 'opportunity',
        select: 'name stage amount prospect owner',
        populate: {
          path: 'prospect',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    // Manually populate sourceActivities with details from different activity models
    const populatedActions = await populateSourceActivities(actions);

    const totalCount = await ProposedAction.countDocuments(filterQuery);

    // Remove workflowMetadata from details before sending response
    const sanitizedActions = populatedActions.map(action => {
      if (action.details && action.details.workflowMetadata) {
        const { workflowMetadata, ...detailsWithoutMetadata } = action.details;
        return { ...action, details: detailsWithoutMetadata };
      }
      return action;
    });

    res.status(200).json({
      success: true,
      data: sanitizedActions,
      pagination: {
        count: sanitizedActions.length,
        total: totalCount,
        limit: Number(limit),
        skip: Number(skip)
      }
    });

  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get a specific action by ID
export const getAction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { actionId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Find the action and populate related data
    const action = await ProposedAction.findById(actionId)
      .populate('opportunity', 'name stage amount organization')
      .populate('approvedBy', 'firstName lastName email');

    if (!action) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }

    // Verify the action's opportunity belongs to the user's organization
    const opportunity = action.opportunity as any;
    if (opportunity.organization.toString() !== user.organization.toString()) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Manually populate sourceActivities with details from different activity models
    const populatedActions = await populateSourceActivities([action]);

    // Remove workflowMetadata from details before sending response
    const sanitizedAction = populatedActions[0];
    if (sanitizedAction.details && sanitizedAction.details.workflowMetadata) {
      const { workflowMetadata, ...detailsWithoutMetadata } = sanitizedAction.details;
      sanitizedAction.details = detailsWithoutMetadata;
    }

    res.status(200).json({
      success: true,
      data: sanitizedAction
    });

  } catch (error) {
    console.error('Error fetching action:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Approve an action
export const approveAction = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  
  try {
    let result: any = null;
    let shouldExecute = false;
    let actionIdToExecute: mongoose.Types.ObjectId | null = null;
    let userIdToExecute: any = null;

    await session.withTransaction(async () => {
      const { actionId } = req.params;
      const { executeImmediately = false } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Find and validate the action
      const action = await ProposedAction.findById(actionId)
        .populate('opportunity', 'organization')
        .session(session);

      if (!action) {
        throw new Error('Action not found');
      }

      // Verify the action's opportunity belongs to the user's organization
      const opportunity = action.opportunity as any;
      if (opportunity.organization.toString() !== user.organization.toString()) {
        throw new Error('Access denied');
      }

      if (action.status !== 'PROPOSED') {
        throw new Error(`Action cannot be approved. Current status: ${action.status}`);
      }

      // Update action status to approved
      action.status = 'APPROVED';
      action.approvedBy = user._id as any;
      await action.save({ session });

      // Set flags for execution after transaction commits
      if (executeImmediately) {
        shouldExecute = true;
        actionIdToExecute = action._id as mongoose.Types.ObjectId;
        userIdToExecute = user._id as any;
      } else {
        result = {
          success: true,
          status: 'approved',
          message: 'Action approved successfully'
        };
      }
    });

    // If executeImmediately is true, execute the action AFTER the transaction commits
    if (shouldExecute && actionIdToExecute && userIdToExecute) {
      result = await ActionExecutionService.execute(
        actionIdToExecute,
        userIdToExecute
      );
    }

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error approving action:', error);
    res.status(400).json({ 
      error: 'Failed to approve action',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await session.endSession();
  }
};

// Reject an action
export const rejectAction = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { actionId } = req.params;
      const { reason } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Find and validate the action
      const action = await ProposedAction.findById(actionId)
        .populate('opportunity', 'organization')
        .session(session);

      if (!action) {
        throw new Error('Action not found');
      }

      // Verify the action's opportunity belongs to the user's organization
      const opportunity = action.opportunity as any;
      if (opportunity.organization.toString() !== user.organization.toString()) {
        throw new Error('Access denied');
      }

      if (action.status !== 'PROPOSED') {
        throw new Error(`Action cannot be rejected. Current status: ${action.status}`);
      }

      // Clean up any attachments before rejecting
      try {
        await cleanupProposedActionAttachments(action, opportunity.organization.toString());
      } catch (cleanupError) {
        console.error('Error cleaning up attachments during action rejection:', cleanupError);
        // Continue with rejection even if cleanup fails
      }

      // Update action status to rejected
      action.status = 'REJECTED';
      action.approvedBy = user._id as any; // Track who rejected it
      
      // Store rejection reason in metadata if provided
      if (reason) {
        action.details = {
          ...action.details,
          rejectionReason: reason,
          rejectedAt: new Date()
        };
      }

      await action.save({ session });
    });

    res.status(200).json({
      success: true,
      message: 'Action rejected successfully'
    });

  } catch (error) {
    console.error('Error rejecting action:', error);
    res.status(400).json({ 
      error: 'Failed to reject action',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Update action details (for approved but not yet executed actions)
 * 
 * Pass `details` and/or `scheduledFor` in request body
 * 
 * @route PUT /api/actions/:actionId
 */
export const updateAction = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { actionId: actionIdParam } = req.params;
      const actionId = new mongoose.Types.ObjectId(actionIdParam);
      const { details, scheduledFor } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Find and validate the action
      const action = await ProposedAction.findById(actionId)
        .populate('opportunity', 'organization')
        .session(session);

      if (!action) {
        throw new Error('Action not found');
      }

      // Verify the action's opportunity belongs to the user's organization
      const opportunity = action.opportunity as any;
      if (opportunity.organization.toString() !== user.organization.toString()) {
        throw new Error('Access denied');
      }

      if (action.status === 'EXECUTED') {
        throw new Error('Cannot update an already executed action');
      }

      if (action.status === 'REJECTED') {
        throw new Error('Cannot update a rejected action');
      }

      // Update action details
      if (details) {
        action.details = { ...action.details, ...details };
      }

      if (scheduledFor) {
        action.scheduledFor = new Date(scheduledFor);
      }

      action.lastEditedBy = {
        type: 'USER',
        id: user._id as Schema.Types.ObjectId,
        at: new Date()
      };

      await action.save({ session });
    });

    res.status(200).json({
      success: true,
      message: 'Action updated successfully'
    });

  } catch (error) {
    console.error('Error updating action:', error);
    res.status(400).json({ 
      error: 'Failed to update action',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await session.endSession();
  }
};

// Execute an approved action
export const executeAction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { actionId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Find and validate the action
    const action = await ProposedAction.findById(actionId)
      .populate('opportunity', 'organization');

    if (!action) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }

    // Verify the action's opportunity belongs to the user's organization
    const opportunity = action.opportunity as any;
    if (opportunity.organization.toString() !== user.organization.toString()) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (action.status !== 'APPROVED') {
      res.status(400).json({ 
        error: 'Action is not approved for execution',
        currentStatus: action.status
      });
      return;
    }

    // Execute the action
    const result = await ActionExecutionService.execute(
      action._id as mongoose.Types.ObjectId,
      user._id as mongoose.Types.ObjectId
    );

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ 
      error: 'Failed to execute action',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Generate new proposed actions for an opportunity
export const generateActions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { opportunityId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Verify opportunity exists and belongs to organization
    const opportunity = await Opportunity.findOne({
      _id: opportunityId,
      organization: user.organization
    });

    if (!opportunity) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    // Generate new proposed actions
    const proposedActions = await ActionPipelineService.generateProposedActions(
      new mongoose.Types.ObjectId(opportunityId)
    );

    res.status(201).json({
      success: true,
      data: proposedActions,
      message: `Generated ${proposedActions.length} new proposed actions`
    });

  } catch (error) {
    console.error('Error generating actions:', error);
    res.status(500).json({ 
      error: 'Failed to generate actions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const reGenerateActions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { opportunityId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Verify opportunity exists and belongs to organization
    const opportunity = await Opportunity.findOne({
      _id: opportunityId,
      organization: user.organization
    });

    if (!opportunity) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    // Re-evaluate existing actions
    const context = await ActionPipelineService.reEvaluateActions(
      new mongoose.Types.ObjectId(opportunityId)
    );

    res.status(201).json({
      success: true,
      data: context,
      message: `Re-evaluated actions for opportunity ${opportunityId}`
    });

  } catch (error) {
    console.error('Error generating actions:', error);
    res.status(500).json({ 
      error: 'Failed to generate actions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};