import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Pipeline from '../models/Pipeline';
import PipelineStage from '../models/PipelineStage';
import Opportunity from '../models/Opportunity';
import {
  createPipeline,
  getPipelinesForOrganization,
  getDefaultPipeline,
  setDefaultPipeline,
  updatePipeline,
  deletePipeline,
  getPipelineById
} from '../services/pipelineService';
import { createStagesForPipeline, defaultStages } from '../services/pipelineStageService';

// Get all pipelines for the user's organization
export const getPipelines = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const pipelines = await getPipelinesForOrganization(user.organization);

    res.status(200).json({
      success: true,
      data: pipelines
    });
  } catch (error) {
    console.error('Get pipelines error:', error);
    res.status(500).json({ success: false, message: 'Error fetching pipelines' });
  }
};

// Get a single pipeline by ID
export const getPipeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const pipeline = await getPipelineById(
      new mongoose.Types.ObjectId(id),
      user.organization
    );

    if (!pipeline) {
      res.status(404).json({ success: false, message: 'Pipeline not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    console.error('Get pipeline error:', error);
    res.status(500).json({ success: false, message: 'Error fetching pipeline' });
  }
};

// Get the default pipeline for the user's organization
export const getDefaultPipelineForOrg = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const pipeline = await getDefaultPipeline(user.organization);

    if (!pipeline) {
      res.status(404).json({ success: false, message: 'No default pipeline found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    console.error('Get default pipeline error:', error);
    res.status(500).json({ success: false, message: 'Error fetching default pipeline' });
  }
};

// Create a new pipeline
export const createNewPipeline = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const user = req.user;
      const { name, description, isDefault, createDefaultStages } = req.body;

      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!name) {
        throw new Error('Pipeline name is required');
      }

      // Check if a pipeline with this name already exists
      const existingPipeline = await Pipeline.findOne({
        organization: user.organization,
        name: { $regex: new RegExp(`^${name}$`, 'i') }
      }).session(session);

      if (existingPipeline) {
        throw new Error(`A pipeline with name "${name}" already exists`);
      }

      // Create the pipeline
      const pipeline = await createPipeline(
        user.organization,
        name,
        description,
        isDefault || false,
        session
      );

      // Optionally create default stages
      if (createDefaultStages !== false) {
        await createStagesForPipeline(
          pipeline._id,
          user.organization,
          defaultStages,
          session
        );
      }

      console.log(`Pipeline created: ${pipeline.name} for organization: ${user.organization}`);

      res.status(201).json({
        success: true,
        data: pipeline
      });
    });
  } catch (error: any) {
    console.error('Create pipeline error:', error);

    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'A pipeline with this name already exists'
      });
      return;
    }

    res.status(error.message.includes('required') ? 400 : 500).json({
      success: false,
      message: error.message || 'Error creating pipeline'
    });
  } finally {
    await session.endSession();
  }
};

// Update a pipeline
export const updateExistingPipeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { name, description } = req.body;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Check for name conflicts if name is being changed
    if (name) {
      const conflictingPipeline = await Pipeline.findOne({
        organization: user.organization,
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id }
      });

      if (conflictingPipeline) {
        res.status(400).json({
          success: false,
          message: `A pipeline with name "${name}" already exists`
        });
        return;
      }
    }

    const pipeline = await updatePipeline(
      new mongoose.Types.ObjectId(id),
      user.organization,
      { name, description }
    );

    if (!pipeline) {
      res.status(404).json({ success: false, message: 'Pipeline not found' });
      return;
    }

    console.log(`Pipeline updated: ${pipeline.name} for organization: ${user.organization}`);

    res.status(200).json({
      success: true,
      data: pipeline
    });
  } catch (error: any) {
    console.error('Update pipeline error:', error);

    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'A pipeline with this name already exists'
      });
      return;
    }

    res.status(500).json({ success: false, message: 'Error updating pipeline' });
  }
};

// Set a pipeline as default
export const setDefault = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const pipeline = await setDefaultPipeline(
      new mongoose.Types.ObjectId(id),
      user.organization
    );

    if (!pipeline) {
      res.status(404).json({ success: false, message: 'Pipeline not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    console.error('Set default pipeline error:', error);
    res.status(500).json({ success: false, message: 'Error setting default pipeline' });
  }
};

// Delete a pipeline
export const deleteExistingPipeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const pipelineId = new mongoose.Types.ObjectId(id);

    // Check if pipeline exists
    const pipeline = await getPipelineById(pipelineId, user.organization);
    if (!pipeline) {
      res.status(404).json({ success: false, message: 'Pipeline not found' });
      return;
    }

    // Prevent deleting the only pipeline
    const pipelineCount = await Pipeline.countDocuments({ organization: user.organization });
    if (pipelineCount <= 1) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete the only pipeline. Create another pipeline first.'
      });
      return;
    }

    // Check if any opportunities are using this pipeline
    const opportunityCount = await Opportunity.countDocuments({
      pipeline: pipelineId,
      organization: user.organization
    });

    if (opportunityCount > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete pipeline. ${opportunityCount} opportunity/opportunities are in this pipeline. Please move them to another pipeline first.`
      });
      return;
    }

    // Delete all stages in this pipeline first
    await PipelineStage.deleteMany({
      pipeline: pipelineId,
      organization: user.organization
    });

    // Delete the pipeline
    const deleted = await deletePipeline(pipelineId, user.organization);

    if (!deleted) {
      res.status(404).json({ success: false, message: 'Pipeline not found' });
      return;
    }

    // If this was the default pipeline, set another one as default
    if (pipeline.isDefault) {
      const newDefault = await Pipeline.findOne({ organization: user.organization });
      if (newDefault) {
        await setDefaultPipeline(newDefault._id, user.organization);
      }
    }

    console.log(`Pipeline deleted: ${pipeline.name} for organization: ${user.organization}`);

    res.status(200).json({
      success: true,
      message: 'Pipeline deleted successfully'
    });
  } catch (error) {
    console.error('Delete pipeline error:', error);
    res.status(500).json({ success: false, message: 'Error deleting pipeline' });
  }
};
