import { ActionHandler } from '../types';
import { UpdatePipelineStageDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const UpdatePipelineStageHandler: ActionHandler = {
  name: 'UPDATE_PIPELINE_STAGE',
  description: 'Updates the pipeline stage of an opportunity when the deal has progressed (or regressed) to meet the criteria of a different stage. Use this action when analyzing the opportunity against all available pipeline stages reveals that the current stage no longer accurately reflects the deal\'s actual status. The AI should compare the opportunity\'s progress, activities, and MEDDPICC status against each stage\'s description to determine the most appropriate stage.',
  detailsSchema: UpdatePipelineStageDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default UpdatePipelineStageHandler;

