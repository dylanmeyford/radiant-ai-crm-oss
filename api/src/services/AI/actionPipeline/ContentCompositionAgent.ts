import { ActionPipelineContext } from './ActionPipelineService';
import { NextBestActionsResult, MainAction } from './NextBestActionAgent';
import chalk from 'chalk';
import mongoose from 'mongoose';
import { actionRegistry } from './possibleActions/index';
import { ProposedAction } from '../../../models/ProposedAction';
import { ActionPipelineService } from './ActionPipelineService';

export class ContentCompositionAgent {
  /**
   * Normalizes different workflow/handler response shapes and extracts schemaResult.
   * Handles shapes like:
   * - { status, result: { result: { schemaResult } } }
   * - { result: { schemaResult } }
   * - { schemaResult }
   * - raw object being the schema
   *
   * Why inconsistent in the first place:
   * - Mastra runs return { status, result }, while our workflow returns { result: { schemaResult } }, leading to result.result.schemaResult.
   * - Some handler branches (e.g. LOOKUP → TASK fallback) return minimally-shaped objects or raw results.
   * - Certain handlers inject metadata at different nesting levels (e.g. EMAIL/LINKEDIN), drifting the shape.
   */
  private static extractSchemaResult(composed: any): any {
    if (!composed) return null;
    const level1 = composed?.result ?? composed;
    const level2 = level1?.result ?? level1;
    const schema = level2?.schemaResult ?? level1?.schemaResult ?? composed?.schemaResult;
    if (schema && typeof schema === 'object') return schema;
    return typeof composed === 'object' ? composed : null;
  }
  /**
   * Composes detailed content for validated actions by delegating to the appropriate handlers.
   * Makes individual AI calls for each action that needs content composition.
   * 
   * @param actions Validated actions from NextBestActionAgent
   * @param context The comprehensive action pipeline context
   * @returns Actions with composed content
   */
  public static async composeActionContent(
    actions: NextBestActionsResult,
    context: ActionPipelineContext
  ): Promise<NextBestActionsResult> {
    console.log(chalk.blue.bold(`[CONTENT COMPOSITION AGENT] Composing content for ${actions.actions.length} actions...`));

    // Process actions in parallel
    const composedActions = await Promise.all(
      actions.actions.map(async (action, index) => {
        try {
          console.log(chalk.cyan(`  -> Composing content for action ${index + 1}: ${action.type} (Priority: ${action.priority})...`));

          let updatedAction: MainAction = { ...(action as MainAction) };

          const composedContent = await this.composeContentForAction(updatedAction, context);
          if (composedContent) {
            // Check if this was a LOOKUP converted to TASK
            if (composedContent._convertedFromLookup) {
              updatedAction.type = 'TASK' as any;
              console.log(chalk.cyan(`    -> Action type changed from LOOKUP to TASK due to no useful content found`));
            }
            const mainSchema = this.extractSchemaResult(composedContent);
            const { replyToMessageId: _mainReplyTo, threadId: _mainThreadId, ...mainSchemaFiltered } = (mainSchema || {}) as any;
            updatedAction.details = composedContent._convertedFromLookup 
              ? mainSchemaFiltered 
              : { ...updatedAction.details, ...mainSchemaFiltered } as any;
            console.log(chalk.green(`    -> ✓ Content composed successfully for action ${updatedAction.type}`));
          } else {
            console.log(chalk.yellow(`    -> Warning: Failed to compose content for action ${action.type}, keeping original`));
          }

          return updatedAction as any;
        } catch (error) {
          console.error(chalk.red(`    -> Error composing content for action ${action.type}:`), error);
          return action as any;
        }
      })
    );

    console.log(chalk.green.bold(`[CONTENT COMPOSITION AGENT] Content composition complete for all actions`));
    return { actions: composedActions };
  }

  /**
   * Composes content for a single action by delegating to its registered handler.
   * For LOOKUP actions, automatically converts to TASK if no useful content is found.
   * 
   * @param action The action to compose content for
   * @param context The action pipeline context
   * @returns Composed content object or null if failed
   */
  private static async composeContentForAction(
    action: any,
    context: ActionPipelineContext
  ): Promise<any | null> {
    const handler = actionRegistry.getHandler(action.type);

    if (!handler) {
      console.log(chalk.red(`      -> Critical: No content composition handler found for action type ${action.type}`));
      return null;
    }

    if (action.type === 'NO_ACTION') {
      console.log(chalk.cyan(`    -> NO_ACTION requires no content composition, skipping.`));
      return null;
    }

    try {
      const result = await handler.composeContent(action, context);
      
      // Check if LOOKUP action found useful content
      if (action.type === 'LOOKUP' && result) {
        const lookupResult = result.result?.schemaResult || result;
        const hasUsefulContent = this.isLookupContentUseful(lookupResult);
        
        if (!hasUsefulContent) {
          console.log(chalk.yellow(`      -> LOOKUP action found no useful content, converting to TASK...`));
          
          // Transform the action to a TASK
          const transformedAction = {
            ...action,
            type: 'TASK',
            details: {
              title: `Research: ${action.details.query || 'Information needed'}`,
              description: action.details.query || 'Manual research required - automated lookup found no useful information',
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Tomorrow
            }
          };
          
          // Get TASK handler and compose content
          const taskHandler = actionRegistry.getHandler('TASK');
          if (taskHandler) {
            console.log(chalk.cyan(`        -> Composing TASK content for converted action...`));
            const taskResult = await taskHandler.composeContent(transformedAction, context);
            
            if (taskResult && taskResult.result?.schemaResult) {
              // Ensure we preserve the basic TASK structure and merge with composed content
              const baseTaskDetails = {
                title: transformedAction.details.title,
                dueDate: transformedAction.details.dueDate,
                description: transformedAction.details.description
              };
              
              // Return the task result but mark it as a converted LOOKUP
              return {
                ...taskResult,
                result: {
                  ...taskResult.result,
                  schemaResult: {
                    ...baseTaskDetails,
                    ...taskResult.result.schemaResult
                  }
                },
                _convertedFromLookup: true,
                _originalQuery: action.details.query
              };
            } else {
              // If task composition fails, return the basic task structure
              console.log(chalk.yellow(`        -> Task composition failed, using basic task structure`));
              return {
                result: {
                  schemaResult: transformedAction.details
                },
                _convertedFromLookup: true,
                _originalQuery: action.details.query
              };
            }
          }
          
          // If task conversion fails, return original result
          console.log(chalk.yellow(`        -> Failed to convert to TASK, keeping original LOOKUP result`));
          return result;
        }
      }
      
      return result;
    } catch (error) {
      console.error(chalk.red(`      -> Error composing content for ${action.type} via handler:`), error);
      return null;
    }
  }

  /**
   * Determines if LOOKUP content is useful based on confidence and answer quality.
   * 
   * @param lookupResult The result from LOOKUP content composition
   * @returns True if content is useful, false if it should be converted to TASK
   */
  private static isLookupContentUseful(lookupResult: any): boolean {
    // Check if we have an answer
    if (!lookupResult.answer || lookupResult.answer.trim().length === 0) {
      return false;
    }
    
    // Check confidence score (if below 0.3, consider not useful)
    if (typeof lookupResult.confidence === 'number' && lookupResult.confidence < 0.3) {
      return false;
    }
    
    // Check for common "not found" patterns
    const lowerAnswer = lookupResult.answer.toLowerCase();
    const notFoundPatterns = [
      'no information found',
      'could not find',
      'unable to locate',
      'no data available',
      'not found',
      'no results',
      'not accessible',
    ];
    
    if (notFoundPatterns.some(pattern => lowerAnswer.includes(pattern))) {
      return false;
    }
    
    // If we have sources, it's likely useful
    if (Array.isArray(lookupResult.sources) && lookupResult.sources.length > 0) {
      return true;
    }
    
    // Default to useful if answer exists and no negative indicators
    return true;
  }

  /**
   * Recomposes content for a single action after sub-action details have been updated.
   * This is used when sub-actions are modified to ensure the main action content reflects changes.
   * 
   * @param actionId The ID of the action to recompose content for
   * @returns Promise resolving to success status
   */
  public static async recomposeActionContent(actionId: mongoose.Types.ObjectId): Promise<boolean> {
    try {
      console.log(chalk.blue.bold(`[CONTENT COMPOSITION AGENT] Recomposing content for action ${actionId}...`));

      // Load the action with populated opportunity
      const action = await ProposedAction.findById(actionId)
        .populate('opportunity')
        .lean();

      
      if (!action) {
        console.log(chalk.red(`    -> Action ${actionId} not found`));
        return false;
      }

      // Build full context for content generation
      const opportunityId = new mongoose.Types.ObjectId((action as any).opportunity?._id ?? (action as any).opportunity);
      const context = await ActionPipelineService.triggerDecisionPhase(opportunityId);

      // Recompose content for the main action
      const composedContent = await this.composeContentForAction(action, context);
      
      if (composedContent) {
        // Extract the schema result from the workflow response
        const contentToMerge = this.extractSchemaResult(composedContent);
        
        // Update the action with new content
        await ProposedAction.findByIdAndUpdate(
          actionId,
          { 
            $set: { 
              'details': { ...action.details, ...(contentToMerge || {}) },
              'status': 'PROPOSED' // Reset to PROPOSED since content changed
            }
          }
        );
        console.log(chalk.green(`    -> Successfully recomposed content for ${action.type}`));
        return true;
      } else {
        console.log(chalk.yellow(`    -> No content composition needed for ${action.type}`));
        return false;
      }

    } catch (error) {
      console.error(chalk.red(`    -> Error recomposing content for action ${actionId}:`), error);
      return false;
    }
  }

}
