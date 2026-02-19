import { ActionHandler } from '../types';
import { EmailActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const EmailActionHandler: ActionHandler = {
  name: 'EMAIL',
  description: 'An email is an action that is used when an email needs to be sent to a contact. This is used to send a new email, schedule a new email etc..',
  detailsSchema: EmailActionDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default EmailActionHandler;

