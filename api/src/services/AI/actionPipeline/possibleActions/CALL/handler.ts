import { ActionHandler } from '../types';
import { CallActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const CallActionHandler: ActionHandler = {
  name: 'CALL',
  description: 'A call is an action that needs to be made by the user. This is used to make a new phone call.',
  detailsSchema: CallActionDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default CallActionHandler;

