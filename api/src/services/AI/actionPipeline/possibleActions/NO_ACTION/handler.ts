import { ActionHandler } from '../types';
import { NoActionDetailsSchema } from './schema';
import { validateDetails } from './validation';

const NoActionHandler: ActionHandler = {
  name: 'NO_ACTION',
  description: 'A no action, is an action that is not needed to be taken at this time. This is a placeholder action that is used when we have no actions to take.',
  detailsSchema: NoActionDetailsSchema,
  validateDetails,
  composeContent: async () => {
    // No content to compose for NO_ACTION
    return null;
  },
  execute: async () => {
    // No execution logic for NO_ACTION
    return { type: 'no_action_logged', success: true };
  },
};

export default NoActionHandler;

