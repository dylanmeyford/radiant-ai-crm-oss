import chalk from 'chalk';
import { ActionPipelineContext, MainAction } from '../index';
import { AddContactActionDetailsSchema } from './schema';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext,
  _validContactEmails: Set<string>,
  _validEmailActivityIds: Set<string>
): Promise<any | null> {
  const validationResult = AddContactActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid add-contact details structure: ${validationResult.error.message}`));
    return null;
  }

  const details = validationResult.data;
  const firstName = details.contactFirstName.trim();
  const lastName = details.contactLastName.trim();
  const normalizedEmail = details.contactEmail ? details.contactEmail.trim().toLowerCase() : null;

  if (!firstName || !lastName) {
    console.log(chalk.yellow(`          -> Contact first and last name are required`));
    return null;
  }

  const contactExistsOnOpportunity = context.contacts.some(({ contact }) => {
    const primaryEmailMatch = normalizedEmail
      ? (contact.emails || []).some((email) => email.address?.toLowerCase() === normalizedEmail)
      : false;

    const sameName =
      (contact.firstName || '').trim().toLowerCase() === firstName.toLowerCase() &&
      (contact.lastName || '').trim().toLowerCase() === lastName.toLowerCase();

    return primaryEmailMatch || sameName;
  });

  if (contactExistsOnOpportunity) {
    console.log(chalk.yellow(`          -> Contact already exists on this opportunity, skipping ADD_CONTACT action`));
    return null;
  }

  return {
    ...details,
    contactFirstName: firstName,
    contactLastName: lastName,
    contactEmail: normalizedEmail,
    contactTitle: details.contactTitle?.trim() || null,
    rationale: details.rationale?.trim() || null,
    linkedInProfile: details.linkedInProfile?.trim() || null,
    backgroundInfo: details.backgroundInfo?.trim() || null,
    sourceUrls: details.sourceUrls || null,
  };
}
