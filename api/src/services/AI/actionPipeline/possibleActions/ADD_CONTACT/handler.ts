import { ActionHandler } from '../types';
import { AddContactActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const AddContactHandler: ActionHandler = {
  name: 'ADD_CONTACT',
  description:
    'Adds a new stakeholder to the opportunity when we are strategically speaking to the wrong person or missing key people (e.g., economic buyer, decision maker, champion). Uses online lookup to enrich details and then links the contact to the deal on execution.',
  detailsSchema: AddContactActionDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default AddContactHandler;
