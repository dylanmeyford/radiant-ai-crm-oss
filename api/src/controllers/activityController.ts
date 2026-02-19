import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Activity from '../models/Activity';
import Prospect from '../models/Prospect';
import { IntelligenceProcessor } from '../services/AI/personIntelligence/intelligenceProcessor';
import Opportunity from '../models/Opportunity';

// Get all activities for an opportunity
export const getOpportunityActivities = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const user = req.user;
  
  if (!user) {
    res.status(401).json({ success: false, message: 'User not authenticated' });
    return;
  }

  const opportunity = await Opportunity.findOne({_id: id, organization: user.organization});

  if (!opportunity) {
    res.status(404).json({ success: false, message: 'Opportunity not found' });
    return;
  }
    // Fetch all activity types
    // Not all activities have contacts, so we need to use the prospect instead.
    const activities = await Activity.find({
      prospect: opportunity.prospect,
      $or: [
        { date: { $gte: opportunity.opportunityStartDate } },
        { date: { $exists: false } }
      ],
    });

  if (!activities) {
    res.status(404).json({ success: false, message: 'Activities not found' });
    return;
  }

  res.status(200).json(activities);
};

// Create a new activity
export const createActivity = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    let createdActivity: any = null; // To hold the activity created inside the transaction

    await session.withTransaction(async () => {
      const {
        type,
        title,
        description,
        date,
        duration,
        status,
        prospect,
        contacts,
        attachments,
        tags,
        metadata
      } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Verify prospect exists and belongs to the organization
      if (prospect) {
        const prospectDoc = await Prospect.findOne({
          _id: prospect,
          organization: user.organization
        }).session(session);
        if (!prospectDoc) {
          throw new Error('Prospect not found or does not belong to the organization');
        }
      }

      // Set default status to 'to_do' for tasks if not explicitly provided
      const taskStatus = type === 'task' && !status ? 'to_do' : status;

      const activity = new Activity({
        type,
        title,
        description,
        date,
        duration,
        status: taskStatus,
        prospect,
        contacts,
        attachments,
        tags,
        metadata,
        organization: user.organization,
        createdBy: user._id
      });
      await activity.save({ session });

      createdActivity = activity; // Store the activity

      // Update the prospect's activities field with this activity
      if (prospect) { // Ensure prospect exists before trying to update
        await Prospect.findByIdAndUpdate(
          prospect,
          { $addToSet: { activities: activity._id } },
          { session }
        );
      }
    });
    
    // If the transaction was successful, createdActivity will be populated.
    if (createdActivity) {
      res.status(201).json({
        success: true,
        data: createdActivity
      });

      // Call intelligence processor after the transaction has been committed and response sent.
      if (createdActivity.prospect) {
        IntelligenceProcessor.processActivity(createdActivity);
      }
    } else {
      // This case should not be hit if transaction logic is correct, but it's a safeguard.
      throw new Error('Activity creation failed within transaction.');
    }

  } catch (error) {
    console.error('Create activity error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error creating activity';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Prospect not found or does not belong to the organization') statusCode = 404;
    
    if (!res.headersSent) {
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
  } finally {
    await session.endSession();
  }
};

// Get all activities for the organization
export const getActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { type, status, prospect } = req.query;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Build filter object
    const filter: any = { organization: user.organization };
    
    if (type) {
      filter.type = type;
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (prospect) {
      filter.prospect = prospect;
    }

    const activities = await Activity.find(filter)
      .populate('prospect')
      .populate('contacts')
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching activities' });
  }
};

// Get a single activity
export const getActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const activity = await Activity.findOne({
      _id: id,
      organization: user.organization
    })
      .populate('prospect')
      .populate('contacts')
      .populate('createdBy', 'name email');

    if (!activity) {
      res.status(404).json({ success: false, message: 'Activity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ success: false, message: 'Error fetching activity' });
  }
};

// Update an activity
export const updateActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const activity = await Activity.findOneAndUpdate(
      { _id: id, organization: user.organization },
      updates,
      { new: true, runValidators: true }
    );

    if (!activity) {
      res.status(404).json({ success: false, message: 'Activity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: activity
    });

    // Generate AI summary when activity is updated
    IntelligenceProcessor.processActivity(activity);
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ success: false, message: 'Error updating activity' });
  }
};

// Delete an activity
export const deleteActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const activity = await Activity.findOneAndDelete({
      _id: id,
      organization: user.organization
    });

    if (!activity) {
      res.status(404).json({ success: false, message: 'Activity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ success: false, message: 'Error deleting activity' });
  }
};

// Update an activity's status
export const updateActivityStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const activity = await Activity.findOneAndUpdate(
      { 
        _id: id, 
        organization: user.organization 
      },
      { status },
      { new: true }
    );

    if (!activity) {
      res.status(404).json({ success: false, message: 'Activity not found' });
      return;
    }

    IntelligenceProcessor.processActivity(activity);

    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('Update activity status error:', error);
    res.status(500).json({ success: false, message: 'Error updating activity status' });
  }
};

// Get tasks for a prospect
export const getProspectTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prospectId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const tasks = await Activity.find({
      type: 'task',
      prospect: prospectId,
      organization: user.organization
    })
      .populate('createdBy', 'name email')
      .sort({ date: 1 });

    res.status(200).json({
      success: true,
      data: tasks
    });
  } catch (error) {
    console.error('Get prospect tasks error:', error);
    res.status(500).json({ success: false, message: 'Error fetching prospect tasks' });
  }
};

// Mark a task as completed
export const completeTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const task = await Activity.findOneAndUpdate(
      { 
        _id: id,
        type: 'task',
        organization: user.organization 
      },
      { status: 'completed' },
      { new: true }
    );

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    IntelligenceProcessor.processActivity(task);

    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ success: false, message: 'Error completing task' });
  }
}; 