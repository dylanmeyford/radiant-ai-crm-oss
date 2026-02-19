import { ActionHandler } from './types';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Re-export types needed by handlers
export type { ActionPipelineContext } from '../ActionPipelineService.js';
export type { MainAction } from '../NextBestActionAgent.js';

class ActionRegistry {
  private handlers: Map<string, ActionHandler> = new Map();

  constructor() {
    this.loadHandlers();
  }

  private loadHandlers() {
    console.log(chalk.blue('[ActionRegistry] Initializing and loading action handlers...'));
    const actionsDir = __dirname;

    try {
      const actionTypes = fs.readdirSync(actionsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const type of actionTypes) {
        // Try .js first (production), then .ts (development)
        const handlerJsPath = path.join(actionsDir, type, 'handler.js');
        const handlerTsPath = path.join(actionsDir, type, 'handler.ts');
        
        let handlerPath: string | null = null;
        if (fs.existsSync(handlerJsPath)) {
          handlerPath = handlerJsPath;
        } else if (fs.existsSync(handlerTsPath)) {
          handlerPath = handlerTsPath;
        }

        if (handlerPath) {
          try {
            const handlerModule = require(handlerPath);
            if (handlerModule.default && typeof handlerModule.default.name === 'string') {
              this.handlers.set(handlerModule.default.name, handlerModule.default);
              console.log(chalk.green(`  -> Successfully loaded handler for action type: ${handlerModule.default.name}`));
            } else {
               console.log(chalk.yellow(`  -> Warning: No default export or name found in handler: ${handlerPath}`));
            }
          } catch (error) {
            console.error(chalk.red(`  -> Error loading handler from ${handlerPath}:`), error);
          }
        } else {
          console.log(chalk.yellow(`  -> Warning: No handler file found for action type: ${type}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('[ActionRegistry] Failed to read action directories:'), error);
    }
    
    console.log(chalk.blue(`[ActionRegistry] Initialization complete. ${this.handlers.size} handlers loaded.`));
  }

  /**
   * Retrieves the handler for a specific action type.
   * @param type The action type (e.g., 'EMAIL', 'TASK').
   * @returns The corresponding ActionHandler, or undefined if not found.
   */
  getHandler(type: string): ActionHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Returns a list of all registered action handlers.
   * @returns An array of all ActionHandler instances.
   */
  getAllHandlers(): ActionHandler[] {
    const excludedHandlers = ['TASK', 'LOOKUP']; // This is where we remove actions from system.
    return Array.from(this.handlers.values()).filter(
      handler => !excludedHandlers.includes(handler.name)
    );
  }

  /**
   * Returns the names of all registered action types.
   * @returns An array of action type names.
   */
  getAllActionTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Singleton instance of the registry
export const actionRegistry = new ActionRegistry();

