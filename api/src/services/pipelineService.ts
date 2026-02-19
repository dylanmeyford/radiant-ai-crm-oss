import mongoose from 'mongoose';
import Pipeline, { IPipeline } from '../models/Pipeline';

/**
 * Creates a new pipeline for an organization
 * @param organizationId - The ID of the organization
 * @param name - The name of the pipeline
 * @param description - Optional description
 * @param isDefault - Whether this is the default pipeline
 * @param session - Optional MongoDB session for transactions
 * @returns The created pipeline
 */
export async function createPipeline(
  organizationId: mongoose.Types.ObjectId,
  name: string,
  description?: string,
  isDefault: boolean = false,
  session?: mongoose.ClientSession
): Promise<IPipeline> {
  // If this is being set as default, unset any existing default
  if (isDefault) {
    await Pipeline.updateMany(
      { organization: organizationId, isDefault: true },
      { $set: { isDefault: false } },
      session ? { session } : {}
    );
  }

  const pipeline = new Pipeline({
    name,
    description: description || '',
    organization: organizationId,
    isDefault,
  });

  if (session) {
    await pipeline.save({ session });
  } else {
    await pipeline.save();
  }

  console.log(`Created pipeline: ${pipeline.name} for organization: ${organizationId}`);
  return pipeline;
}

/**
 * Gets all pipelines for an organization
 * @param organizationId - The ID of the organization
 * @returns Array of pipelines
 */
export async function getPipelinesForOrganization(
  organizationId: mongoose.Types.ObjectId
): Promise<IPipeline[]> {
  return await Pipeline.find({ organization: organizationId }).sort({ createdAt: 1 });
}

/**
 * Gets the default pipeline for an organization
 * @param organizationId - The ID of the organization
 * @returns The default pipeline or null
 */
export async function getDefaultPipeline(
  organizationId: mongoose.Types.ObjectId
): Promise<IPipeline | null> {
  // First try to find explicitly default pipeline
  let pipeline = await Pipeline.findOne({
    organization: organizationId,
    isDefault: true
  });

  // If no default, return the first pipeline (by creation date)
  if (!pipeline) {
    pipeline = await Pipeline.findOne({ organization: organizationId }).sort({ createdAt: 1 });
  }

  return pipeline;
}

/**
 * Sets a pipeline as the default for an organization
 * @param pipelineId - The ID of the pipeline to set as default
 * @param organizationId - The ID of the organization
 * @param session - Optional MongoDB session for transactions
 * @returns The updated pipeline
 */
export async function setDefaultPipeline(
  pipelineId: mongoose.Types.ObjectId,
  organizationId: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<IPipeline | null> {
  const options = session ? { session } : {};

  // Unset any existing default
  await Pipeline.updateMany(
    { organization: organizationId, isDefault: true },
    { $set: { isDefault: false } },
    options
  );

  // Set the new default
  const pipeline = await Pipeline.findOneAndUpdate(
    { _id: pipelineId, organization: organizationId },
    { $set: { isDefault: true } },
    { ...options, new: true }
  );

  if (pipeline) {
    console.log(`Set pipeline ${pipeline.name} as default for organization: ${organizationId}`);
  }

  return pipeline;
}

/**
 * Updates a pipeline
 * @param pipelineId - The ID of the pipeline
 * @param organizationId - The ID of the organization
 * @param updates - The updates to apply
 * @param session - Optional MongoDB session for transactions
 * @returns The updated pipeline
 */
export async function updatePipeline(
  pipelineId: mongoose.Types.ObjectId,
  organizationId: mongoose.Types.ObjectId,
  updates: { name?: string; description?: string },
  session?: mongoose.ClientSession
): Promise<IPipeline | null> {
  const options = session ? { session, new: true } : { new: true };

  return await Pipeline.findOneAndUpdate(
    { _id: pipelineId, organization: organizationId },
    { $set: updates },
    options
  );
}

/**
 * Deletes a pipeline (only if it has no stages or opportunities)
 * @param pipelineId - The ID of the pipeline
 * @param organizationId - The ID of the organization
 * @returns True if deleted, false if not found
 */
export async function deletePipeline(
  pipelineId: mongoose.Types.ObjectId,
  organizationId: mongoose.Types.ObjectId
): Promise<boolean> {
  const result = await Pipeline.deleteOne({
    _id: pipelineId,
    organization: organizationId
  });

  return result.deletedCount > 0;
}

/**
 * Gets a pipeline by ID
 * @param pipelineId - The ID of the pipeline
 * @param organizationId - The ID of the organization
 * @returns The pipeline or null
 */
export async function getPipelineById(
  pipelineId: mongoose.Types.ObjectId,
  organizationId: mongoose.Types.ObjectId
): Promise<IPipeline | null> {
  return await Pipeline.findOne({
    _id: pipelineId,
    organization: organizationId
  });
}
