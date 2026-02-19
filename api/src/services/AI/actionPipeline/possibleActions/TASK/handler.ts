import { ActionHandler } from '../types';
import { TaskActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const TaskActionHandler: ActionHandler = {
  name: 'TASK',
  description: 'A task is a single, standalone action that needs to be completed by the user, and is unable to be performed by a LLM. For example, this could be preparing a word document, or google sheet. Calling someone to confirm details.',
  detailsSchema: TaskActionDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default TaskActionHandler;

