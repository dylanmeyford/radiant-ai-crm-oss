import { ActionHandler } from '../types';
import { LinkedInMessageActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const LinkedInMessageActionHandler: ActionHandler = {
  name: 'LINKEDIN MESSAGE',
  description: 'A LinkedIn message is an action that is used when a Linkedin message needs to be sent to a contact. This is used to send a new message.',
  detailsSchema: LinkedInMessageActionDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default LinkedInMessageActionHandler;

