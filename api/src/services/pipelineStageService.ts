import mongoose from 'mongoose';
import PipelineStage from '../models/PipelineStage';
import Pipeline, { IPipeline } from '../models/Pipeline';
import { OpportunityStage } from '../models/Opportunity';

interface DefaultStage {
  name: string;
  order: number;
  description: string;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
}

const defaultStages: DefaultStage[] = [
  {
    name: 'Lead',
    order: 1,
    description: 'Initial contact made, qualifying the opportunity',
  },
  {
    name: 'Demo',
    order: 2,
    description: 'Product demonstration scheduled or completed',
  },
  {
    name: 'Decision Maker',
    order: 3,
    description: 'Engaged with decision makers in the organization',
  },
  {
    name: 'Proposal',
    order: 4,
    description: 'Proposal submitted and under review',
  },
  {
    name: 'Negotiation',
    order: 5,
    description: 'Negotiating terms and pricing',
  },
  {
    name: 'Closed Won',
    order: 6,
    description: 'Deal successfully closed',
    isClosedWon: true,
  },
  {
    name: 'Closed Lost',
    order: 7,
    description: 'Deal lost or abandoned',
    isClosedLost: true,
  },
];

/**
 * Creates a default pipeline with default stages for a new organization
 * @param organizationId - The ID of the organization
 * @param session - Optional MongoDB session for transactions
 * @returns Object containing the pipeline and a map of stage names to their IDs
 */
export async function createDefaultPipelineStages(
  organizationId: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<{ pipeline: IPipeline; stageMap: Map<string, mongoose.Types.ObjectId> }> {
  // First, create the default pipeline
  const pipeline = new Pipeline({
    name: 'Sales Pipeline',
    description: 'Default sales pipeline',
    organization: organizationId,
    isDefault: true,
  });

  if (session) {
    await pipeline.save({ session });
  } else {
    await pipeline.save();
  }

  console.log(`Created default pipeline: ${pipeline.name} for organization: ${organizationId}`);

  const stageMap = new Map<string, mongoose.Types.ObjectId>();

  for (const defaultStage of defaultStages) {
    const stage = new PipelineStage({
      name: defaultStage.name,
      order: defaultStage.order,
      description: defaultStage.description,
      organization: organizationId,
      pipeline: pipeline._id,
      isClosedWon: defaultStage.isClosedWon || false,
      isClosedLost: defaultStage.isClosedLost || false,
    });

    if (session) {
      await stage.save({ session });
    } else {
      await stage.save();
    }

    stageMap.set(defaultStage.name, stage._id);
    console.log(`Created pipeline stage: ${stage.name} (order: ${stage.order}) for pipeline: ${pipeline.name}`);
  }

  return { pipeline, stageMap };
}

/**
 * Creates stages for an existing pipeline
 * @param pipelineId - The ID of the pipeline
 * @param organizationId - The ID of the organization
 * @param stages - Array of stages to create
 * @param session - Optional MongoDB session for transactions
 * @returns Map of stage names to their IDs
 */
export async function createStagesForPipeline(
  pipelineId: mongoose.Types.ObjectId,
  organizationId: mongoose.Types.ObjectId,
  stages: DefaultStage[] = defaultStages,
  session?: mongoose.ClientSession
): Promise<Map<string, mongoose.Types.ObjectId>> {
  const stageMap = new Map<string, mongoose.Types.ObjectId>();

  for (const stageData of stages) {
    const stage = new PipelineStage({
      name: stageData.name,
      order: stageData.order,
      description: stageData.description,
      organization: organizationId,
      pipeline: pipelineId,
      isClosedWon: stageData.isClosedWon || false,
      isClosedLost: stageData.isClosedLost || false,
    });

    if (session) {
      await stage.save({ session });
    } else {
      await stage.save();
    }

    stageMap.set(stageData.name, stage._id);
    console.log(`Created pipeline stage: ${stage.name} (order: ${stage.order}) for pipeline: ${pipelineId}`);
  }

  return stageMap;
}

/**
 * Gets the default "Lead" stage (order 1) for a pipeline
 * @param pipelineId - The ID of the pipeline
 * @returns The Lead stage document or null
 */
export async function getDefaultLeadStageForPipeline(pipelineId: mongoose.Types.ObjectId) {
  return await PipelineStage.findOne({
    pipeline: pipelineId,
    order: 1
  });
}

/**
 * Gets the default "Lead" stage for an organization's default pipeline
 * @param organizationId - The ID of the organization
 * @returns The Lead stage document or null
 */
export async function getDefaultLeadStage(organizationId: mongoose.Types.ObjectId) {
  // Find the default pipeline for this organization
  const pipeline = await Pipeline.findOne({
    organization: organizationId,
    isDefault: true
  });

  if (!pipeline) {
    // Fallback: find any pipeline for this org
    const anyPipeline = await Pipeline.findOne({ organization: organizationId });
    if (!anyPipeline) {
      return null;
    }
    return await PipelineStage.findOne({
      pipeline: anyPipeline._id,
      order: 1
    });
  }

  return await PipelineStage.findOne({
    pipeline: pipeline._id,
    order: 1
  });
}

export { defaultStages };

