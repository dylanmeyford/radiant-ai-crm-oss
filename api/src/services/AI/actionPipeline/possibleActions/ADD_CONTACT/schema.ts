import { z } from 'zod';
import { personRoleEnum } from '../../../../../types/contactIntelligence.types';

export const AddContactActionDetailsSchema = z.object({
  contactFirstName: z.string().min(1).max(100).describe('First name of the person to add to the opportunity'),
  contactLastName: z.string().min(1).max(100).describe('Last name of the person to add to the opportunity'),
  contactEmail: z.string().email().nullable().describe('Email of the person to add, if known'),
  contactTitle: z.string().min(1).max(200).nullable().describe('Job title of the person to add, if known'),
  suggestedRole: z.enum(personRoleEnum).describe('Suggested role for this person in the deal'),
  rationale: z.string().nullable().describe('Composed rationale explaining why this contact should be added'),
  linkedInProfile: z.string().nullable().describe('LinkedIn profile URL or identifier if found'),
  backgroundInfo: z.string().nullable().describe('Short professional background summary from online research'),
  sourceUrls: z.array(z.string()).nullable().describe('Source URLs used during online lookup')
});

export const ComposedAddContactContentSchema = z.object({
  rationale: z.string().min(20).max(3000).describe('Detailed rationale for adding this contact to the opportunity'),
  contactEmail: z.string().email().nullable().describe('Discovered or confirmed email address'),
  contactTitle: z.string().min(1).max(200).nullable().describe('Discovered or confirmed job title'),
  linkedInProfile: z.string().nullable().describe('LinkedIn profile URL or identifier if found'),
  backgroundInfo: z.string().min(1).max(2000).nullable().describe('Professional background summary'),
  sourceUrls: z.array(z.string()).nullable().describe('Source URLs used during online lookup')
});
