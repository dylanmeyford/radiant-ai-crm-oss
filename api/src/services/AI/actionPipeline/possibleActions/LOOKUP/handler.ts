import { ActionHandler } from '../types';
import { LookupActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const LookupActionHandler: ActionHandler = {
  name: 'LOOKUP',
  description: 'A lookup action reserach/requests specific information to be researched from our database and returns an answer on the subtask. In our database we have records of emails, meetings and calls with our clients, as well all forms of business information, documents and collateral',
  detailsSchema: LookupActionDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default LookupActionHandler;


