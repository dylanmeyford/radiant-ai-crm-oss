import { Request, Response } from 'express';
import mongoose from 'mongoose';
import MinedDeal from '../models/MinedDeal';
import Prospect from '../models/Prospect';
import Opportunity from '../models/Opportunity';
import PipelineStage from '../models/PipelineStage';
import { DealMiningService } from '../services/dealMining/DealMiningService';
import { searchAndPopulateContacts } from '../services/contactAutoPopulationService';
import { opportunityBatchProcessingService } from '../services/activityProcessingService/opportunityBatchProcessingService';
import { getDefaultPipeline } from '../services/pipelineService';

/**
 * Get all pending/snoozed mined deals for the user's organization
 */
export const getMinedDeals = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }
    
    // Check for snoozed deals that have passed their snooze date and reactivate them
    await MinedDeal.updateMany(
      {
        organization: user.organization,
        status: 'SNOOZED',
        snoozeUntil: { $lte: new Date() },
      },
      {
        $set: { status: 'PENDING' },
        $unset: { snoozeUntil: 1 },
      }
    );
    
    // Get all pending and snoozed deals
    const minedDeals = await MinedDeal.find({
      organization: user.organization,
      status: { $in: ['PENDING', 'SNOOZED'] },
    })
      .populate('suggestedBy', 'firstName lastName email')
      .sort({ lastActivityDate: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      data: minedDeals,
    });
  } catch (error) {
    console.error('Get mined deals error:', error);
    res.status(500).json({ success: false, message: 'Error fetching mined deals' });
  }
};

/**
 * Get count of pending mined deals (for notification badge)
 */
export const getPendingCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }
    
    const count = await MinedDeal.countDocuments({
      organization: user.organization,
      status: 'PENDING',
    });
    
    res.status(200).json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Get pending count error:', error);
    res.status(500).json({ success: false, message: 'Error fetching pending count' });
  }
};

/**
 * Accept a mined deal - creates prospect and opportunity
 */
export const acceptMinedDeal = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  let createdProspectId: mongoose.Types.ObjectId | null = null;
  let createdOpportunityId: mongoose.Types.ObjectId | null = null;
  
  try {
    const { id } = req.params;
    const { stageId, prospectName, opportunityName, amount, pipelineId } = req.body;
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }
    
    if (!stageId) {
      res.status(400).json({ success: false, message: 'Pipeline stage is required' });
      return;
    }
    
    await session.withTransaction(async () => {
      // Find and validate the mined deal
      const minedDeal = await MinedDeal.findById(id).session(session);
      
      if (!minedDeal) {
        throw new Error('Mined deal not found');
      }
      
      if (minedDeal.organization.toString() !== user.organization.toString()) {
        throw new Error('Mined deal not found');
      }
      
      if (minedDeal.status !== 'PENDING' && minedDeal.status !== 'SNOOZED') {
        throw new Error('Deal has already been processed');
      }
      
      // Get the specified pipeline or fall back to default
      let pipeline;
      if (pipelineId) {
        const Pipeline = mongoose.model('Pipeline');
        pipeline = await Pipeline.findOne({
          _id: pipelineId,
          organization: user.organization,
        }).session(session);
        if (!pipeline) {
          throw new Error('Pipeline not found');
        }
      } else {
        pipeline = await getDefaultPipeline(user.organization);
        if (!pipeline) {
          throw new Error('No pipeline found for organization');
        }
      }
      
      // Validate pipeline stage belongs to the pipeline
      const stage = await PipelineStage.findOne({
        _id: stageId,
        pipeline: pipeline._id,
      }).session(session);
      
      if (!stage) {
        throw new Error('Pipeline stage not found in the selected pipeline');
      }
      
      // Check if prospect with this domain already exists
      const existingProspect = await Prospect.findOne({
        organization: user.organization,
        domains: { $in: minedDeal.domains },
      }).session(session);
      
      if (existingProspect) {
        throw new Error('A prospect with this domain already exists');
      }
      
      // Create the prospect - use user-provided name or fall back to mined name
      const finalProspectName = prospectName?.trim() || minedDeal.companyName;
      const prospect = new Prospect({
        name: finalProspectName,
        domains: minedDeal.domains,
        status: 'lead',
        organization: user.organization,
        owner: user._id,
      });
      await prospect.save({ session });
      createdProspectId = prospect._id;
      
      // Create the opportunity - use user-provided name or default to prospect name
      const opportunity = new Opportunity({
        name: opportunityName?.trim() || `${finalProspectName} - Opportunity`,
        amount: amount || 0,
        stage: stageId,
        pipeline: pipeline._id,
        probability: 50, // Default probability
        prospect: prospect._id,
        contacts: [], // Contacts will be populated by searchAndPopulateContacts
        organization: user.organization,
        createdBy: user._id,
        owner: user._id,
        opportunityStartDate: minedDeal.firstActivityDate,
      });
      await opportunity.save({ session });
      createdOpportunityId = opportunity._id;
      
      // Link opportunity to prospect
      prospect.opportunities = [opportunity._id];
      await prospect.save({ session });
      
      // Update the mined deal status
      minedDeal.status = 'ACCEPTED';
      minedDeal.createdProspect = prospect._id;
      minedDeal.createdOpportunity = opportunity._id;
      minedDeal.acceptedBy = user._id as mongoose.Types.ObjectId;
      minedDeal.acceptedAt = new Date();
      minedDeal.selectedStage = stage._id as mongoose.Types.ObjectId;
      await minedDeal.save({ session });
      
      res.status(201).json({
        success: true,
        data: {
          minedDeal,
          prospect,
          opportunity,
        },
      });
    });
    
    // After transaction: trigger async processes
    if (createdProspectId && createdOpportunityId) {
      // Trigger contact discovery (will find contacts from emails)
      setImmediate(async () => {
        try {
          await searchAndPopulateContacts(createdProspectId!.toString());
        } catch (error) {
          console.error('[MINED-DEAL] Error populating contacts:', error);
        }
      });
      
      // Schedule opportunity intelligence processing
      setImmediate(async () => {
        try {
          await opportunityBatchProcessingService.scheduleOpportunityReprocessing(
            createdOpportunityId!.toString()
          );
        } catch (error) {
          console.error('[MINED-DEAL] Error scheduling opportunity processing:', error);
        }
      });
    }
    
  } catch (error) {
    console.error('Accept mined deal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error accepting mined deal';
    
    let statusCode = 500;
    if (errorMessage === 'Mined deal not found') statusCode = 404;
    if (errorMessage === 'Pipeline stage not found') statusCode = 404;
    if (errorMessage === 'Deal has already been processed') statusCode = 400;
    if (errorMessage === 'A prospect with this domain already exists') statusCode = 409;
    
    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

/**
 * Dismiss a mined deal permanently
 */
export const dismissMinedDeal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }
    
    const minedDeal = await MinedDeal.findById(id);
    
    if (!minedDeal) {
      res.status(404).json({ success: false, message: 'Mined deal not found' });
      return;
    }
    
    if (minedDeal.organization.toString() !== user.organization.toString()) {
      res.status(404).json({ success: false, message: 'Mined deal not found' });
      return;
    }
    
    if (minedDeal.status !== 'PENDING' && minedDeal.status !== 'SNOOZED') {
      res.status(400).json({ success: false, message: 'Deal has already been processed' });
      return;
    }
    
    minedDeal.status = 'DISMISSED';
    minedDeal.dismissedReason = reason;
    await minedDeal.save();
    
    res.status(200).json({
      success: true,
      data: minedDeal,
    });
  } catch (error) {
    console.error('Dismiss mined deal error:', error);
    res.status(500).json({ success: false, message: 'Error dismissing mined deal' });
  }
};

/**
 * Snooze a mined deal (check again later)
 */
export const snoozeMinedDeal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.body; // Default 30 days snooze
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }
    
    const minedDeal = await MinedDeal.findById(id);
    
    if (!minedDeal) {
      res.status(404).json({ success: false, message: 'Mined deal not found' });
      return;
    }
    
    if (minedDeal.organization.toString() !== user.organization.toString()) {
      res.status(404).json({ success: false, message: 'Mined deal not found' });
      return;
    }
    
    if (minedDeal.status !== 'PENDING' && minedDeal.status !== 'SNOOZED') {
      res.status(400).json({ success: false, message: 'Deal has already been processed' });
      return;
    }
    
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);
    
    minedDeal.status = 'SNOOZED';
    minedDeal.snoozeUntil = snoozeUntil;
    await minedDeal.save();
    
    res.status(200).json({
      success: true,
      data: minedDeal,
    });
  } catch (error) {
    console.error('Snooze mined deal error:', error);
    res.status(500).json({ success: false, message: 'Error snoozing mined deal' });
  }
};

/**
 * Manually trigger deal mining for the current user
 */
export const triggerMining = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }
    
    // Run mining in the background
    setImmediate(async () => {
      try {
        await DealMiningService.mineDealsForUser((user._id as any).toString(), {
          isNewConnection: false,
        });
      } catch (error) {
        console.error('[MINED-DEAL] Error during manual mining trigger:', error);
      }
    });
    
    res.status(202).json({
      success: true,
      message: 'Deal mining started. Check back shortly for results.',
    });
  } catch (error) {
    console.error('Trigger mining error:', error);
    res.status(500).json({ success: false, message: 'Error triggering mining' });
  }
};
