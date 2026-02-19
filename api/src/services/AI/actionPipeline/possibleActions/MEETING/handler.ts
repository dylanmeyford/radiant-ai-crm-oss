import { ActionHandler } from '../types';
import { MeetingActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const MeetingActionHandler: ActionHandler = {
  name: 'MEETING',
  description: 'A meeting action creates, updates, or cancels a calendar invite. Use this when we need to schedule a new meeting, modify an existing one, or cancel a no-longer-needed meeting.',
  detailsSchema: MeetingActionDetailsSchema as any,
  validateDetails,
  composeContent,
  execute,
};

export default MeetingActionHandler;

