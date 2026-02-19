import { z } from 'zod';
import { ActionPipelineContext } from '../ActionPipelineService';
import { MainAction } from '../NextBestActionAgent';
import mongoose from 'mongoose';
import { IProposedAction } from '../../../../models/ProposedAction';

/**
 * Defines the standard interface for an action handler. Each action type
 * (EMAIL, TASK, etc.) will have an implementation of this interface.
 */
export interface ActionHandler {
  /**
   * The name of the action type (e.g., 'EMAIL', 'TASK').
   */
  name: string;

  /**
   * The description of the action type.
   */
  description: string;

  /**
   * The Zod schema for validating the structural details of this action type.
   * This schema defines the expected 'details' object for an action, excluding
   * fields that are composed later (like email body or task description).
   */
  detailsSchema: z.ZodObject<any, any, any>;

  /**
   * Validates the action's details against the current context, ensuring that
   * referenced data (like contact emails or activity IDs) is valid.
   * @param action The action to validate.
   * @param context The full context of the action pipeline.
   * @returns The validated and sanitized details object, or null if validation fails.
   */
  validateDetails: (
    action: MainAction,
    context: ActionPipelineContext,
    // TODO: We can probably make these more generic
    validContactEmails: Set<string>,
    validEmailActivityIds: Set<string>
  ) => Promise<any | null>;

  /**
   * Composes the dynamic content for an action (e.g., email body, task description).
   * @param action The action requiring content composition.
   * @param context The full context of the action pipeline.
   * @returns An object containing the composed content, or null if failed.
   */
  composeContent: (
    action: MainAction,
    context: ActionPipelineContext
  ) => Promise<any | null>;

  /**
   * Executes the action once it has been approved.
   * @param action The proposed action document from the database.
   * @param executingUserId The ID of the user executing the action.
   * @param session A Mongoose client session for transaction support.
   * @returns A promise that resolves with the execution result.
   */
  execute: (
    action: IProposedAction,
    executingUserId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ) => Promise<any>;
}

