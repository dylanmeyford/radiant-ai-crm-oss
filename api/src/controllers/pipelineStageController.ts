import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PipelineStage from '../models/PipelineStage';
import Pipeline from '../models/Pipeline';
import Opportunity from '../models/Opportunity';
import { getDefaultPipeline } from '../services/pipelineService';

// Get all pipeline stages for a specific pipeline (or default pipeline if not specified)
export const getPipelineStages = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { pipelineId } = req.params;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    let targetPipelineId: mongoose.Types.ObjectId;

    if (pipelineId) {
      // Verify pipeline belongs to organization
      const pipeline = await Pipeline.findOne({
        _id: pipelineId,
        organization: user.organization
      });

      if (!pipeline) {
        res.status(404).json({ success: false, message: 'Pipeline not found' });
        return;
      }
      targetPipelineId = pipeline._id;
    } else {
      // Get default pipeline
      const defaultPipeline = await getDefaultPipeline(user.organization);
      if (!defaultPipeline) {
        res.status(404).json({ success: false, message: 'No pipeline found for organization' });
        return;
      }
      targetPipelineId = defaultPipeline._id;
    }

    const stages = await PipelineStage.find({ pipeline: targetPipelineId })
      .sort({ order: 1 });

    res.status(200).json({
      success: true,
      data: stages
    });
  } catch (error) {
    console.error('Get pipeline stages error:', error);
    res.status(500).json({ success: false, message: 'Error fetching pipeline stages' });
  }
};

// Create a new pipeline stage
export const createPipelineStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { pipelineId } = req.params;
    const { name, order, description } = req.body;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Validate required fields
    if (!name || order === undefined) {
      res.status(400).json({ success: false, message: 'Name and order are required' });
      return;
    }

    let targetPipelineId: mongoose.Types.ObjectId;

    if (pipelineId) {
      // Verify pipeline belongs to organization
      const pipeline = await Pipeline.findOne({
        _id: pipelineId,
        organization: user.organization
      });

      if (!pipeline) {
        res.status(404).json({ success: false, message: 'Pipeline not found' });
        return;
      }
      targetPipelineId = pipeline._id;
    } else {
      // Get default pipeline
      const defaultPipeline = await getDefaultPipeline(user.organization);
      if (!defaultPipeline) {
        res.status(404).json({ success: false, message: 'No pipeline found for organization' });
        return;
      }
      targetPipelineId = defaultPipeline._id;
    }

    // Check if a stage with this order already exists in this pipeline
    const existingOrderStage = await PipelineStage.findOne({
      pipeline: targetPipelineId,
      order
    });

    if (existingOrderStage) {
      res.status(400).json({ 
        success: false, 
        message: `A stage with order ${order} already exists. Please use a different order or reorder stages.` 
      });
      return;
    }

    // Check if a stage with this name already exists in this pipeline
    const existingNameStage = await PipelineStage.findOne({
      pipeline: targetPipelineId,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingNameStage) {
      res.status(400).json({ 
        success: false, 
        message: `A stage with name "${name}" already exists` 
      });
      return;
    }

    const stage = new PipelineStage({
      name,
      order,
      description: description || '',
      organization: user.organization,
      pipeline: targetPipelineId,
      isClosedWon: false,
      isClosedLost: false,
    });

    await stage.save();

    console.log(`Pipeline stage created: ${stage.name} for pipeline: ${targetPipelineId}`);

    res.status(201).json({
      success: true,
      data: stage
    });
  } catch (error: any) {
    console.error('Create pipeline stage error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      res.status(400).json({ 
        success: false, 
        message: 'A stage with this name or order already exists' 
      });
      return;
    }
    
    res.status(500).json({ success: false, message: 'Error creating pipeline stage' });
  }
};

// Update a pipeline stage
export const updatePipelineStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id, pipelineId } = req.params;
    const { name, order, description } = req.body;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Build query based on whether pipelineId is provided
    const query: any = {
      _id: id,
      organization: user.organization
    };

    if (pipelineId) {
      query.pipeline = pipelineId;
    }

    // Find the stage
    const stage = await PipelineStage.findOne(query);

    if (!stage) {
      res.status(404).json({ success: false, message: 'Pipeline stage not found' });
      return;
    }

    // Prevent modifying static stage flags
    if (stage.isClosedWon || stage.isClosedLost) {
      // Allow updating name and description, but not order for closed stages
      if (order !== undefined && order !== stage.order) {
        res.status(400).json({ 
          success: false, 
          message: 'Cannot change the order of Closed Won or Closed Lost stages' 
        });
        return;
      }
    }

    // Check for order conflicts if order is being changed
    if (order !== undefined && order !== stage.order) {
      const conflictingStage = await PipelineStage.findOne({
        pipeline: stage.pipeline,
        order,
        _id: { $ne: id }
      });

      if (conflictingStage) {
        res.status(400).json({ 
          success: false, 
          message: `A stage with order ${order} already exists` 
        });
        return;
      }
    }

    // Check for name conflicts if name is being changed
    if (name && name !== stage.name) {
      const conflictingStage = await PipelineStage.findOne({
        pipeline: stage.pipeline,
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id }
      });

      if (conflictingStage) {
        res.status(400).json({ 
          success: false, 
          message: `A stage with name "${name}" already exists` 
        });
        return;
      }
    }

    // Update fields
    if (name !== undefined) stage.name = name;
    if (order !== undefined) stage.order = order;
    if (description !== undefined) stage.description = description;

    await stage.save();

    console.log(`Pipeline stage updated: ${stage.name} for pipeline: ${stage.pipeline}`);

    res.status(200).json({
      success: true,
      data: stage
    });
  } catch (error: any) {
    console.error('Update pipeline stage error:', error);
    
    if (error.code === 11000) {
      res.status(400).json({ 
        success: false, 
        message: 'A stage with this name or order already exists' 
      });
      return;
    }
    
    res.status(500).json({ success: false, message: 'Error updating pipeline stage' });
  }
};

// Delete a pipeline stage
export const deletePipelineStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id, pipelineId } = req.params;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Build query based on whether pipelineId is provided
    const query: any = {
      _id: id,
      organization: user.organization
    };

    if (pipelineId) {
      query.pipeline = pipelineId;
    }

    // Find the stage
    const stage = await PipelineStage.findOne(query);

    if (!stage) {
      res.status(404).json({ success: false, message: 'Pipeline stage not found' });
      return;
    }

    // Prevent deleting static stages
    if (stage.isClosedWon || stage.isClosedLost) {
      res.status(400).json({ 
        success: false, 
        message: 'Cannot delete Closed Won or Closed Lost stages' 
      });
      return;
    }

    // Check if any opportunities are using this stage
    const opportunityCount = await Opportunity.countDocuments({
      stage: stage._id,
      organization: user.organization
    });

    if (opportunityCount > 0) {
      res.status(400).json({ 
        success: false, 
        message: `Cannot delete stage. ${opportunityCount} opportunity/opportunities are currently in this stage. Please move them to another stage first.` 
      });
      return;
    }

    await PipelineStage.deleteOne({ _id: stage._id });

    console.log(`Pipeline stage deleted: ${stage.name} for pipeline: ${stage.pipeline}`);

    res.status(200).json({
      success: true,
      message: 'Pipeline stage deleted successfully'
    });
  } catch (error) {
    console.error('Delete pipeline stage error:', error);
    res.status(500).json({ success: false, message: 'Error deleting pipeline stage' });
  }
};

// Reorder pipeline stages
export const reorderPipelineStages = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  
  try {
    const user = req.user;
    const { pipelineId } = req.params;
    const { stages } = req.body; // Array of { id, order }

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      await session.endSession();
      return;
    }

    if (!Array.isArray(stages) || stages.length === 0) {
      res.status(400).json({ success: false, message: 'Stages array is required' });
      await session.endSession();
      return;
    }

    let targetPipelineId: mongoose.Types.ObjectId;

    if (pipelineId) {
      // Verify pipeline belongs to organization
      const pipeline = await Pipeline.findOne({
        _id: pipelineId,
        organization: user.organization
      });

      if (!pipeline) {
        res.status(404).json({ success: false, message: 'Pipeline not found' });
        await session.endSession();
        return;
      }
      targetPipelineId = pipeline._id;
    } else {
      // Get default pipeline
      const defaultPipeline = await getDefaultPipeline(user.organization);
      if (!defaultPipeline) {
        res.status(404).json({ success: false, message: 'No pipeline found for organization' });
        await session.endSession();
        return;
      }
      targetPipelineId = defaultPipeline._id;
    }

    await session.withTransaction(async () => {
      // Validate that all stages belong to this pipeline
      const stageIds = stages.map((s: any) => s.id);
      const dbStages = await PipelineStage.find({
        _id: { $in: stageIds },
        pipeline: targetPipelineId
      }).session(session);

      if (dbStages.length !== stages.length) {
        throw new Error('Some stages not found or do not belong to this pipeline');
      }

      // Two-phase update to avoid duplicate key errors:
      // Phase 1: Set all stages to temporary negative orders to clear the constraint
      for (let i = 0; i < stages.length; i++) {
        const stageUpdate = stages[i];
        await PipelineStage.updateOne(
          { _id: stageUpdate.id, pipeline: targetPipelineId },
          { $set: { order: -(i + 1) } },
          { session }
        );
      }

      // Phase 2: Update to final order values
      for (const stageUpdate of stages) {
        await PipelineStage.updateOne(
          { _id: stageUpdate.id, pipeline: targetPipelineId },
          { $set: { order: stageUpdate.order } },
          { session }
        );
      }

      console.log(`Pipeline stages reordered for pipeline: ${targetPipelineId}`);
    });

    // Fetch updated stages
    const updatedStages = await PipelineStage.find({ 
      pipeline: targetPipelineId 
    }).sort({ order: 1 });

    res.status(200).json({
      success: true,
      data: updatedStages
    });
  } catch (error: any) {
    console.error('Reorder pipeline stages error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error reordering pipeline stages' 
    });
  } finally {
    await session.endSession();
  }
};
