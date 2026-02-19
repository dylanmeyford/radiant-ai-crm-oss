import { Agent } from '@mastra/core/agent';
import { AIUsageTrackingService } from './aiUsageTrackingService';
import { EvalCaptureService } from './AI/evals/EvalCaptureService';
import mongoose from 'mongoose';
import chalk from 'chalk';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { getOrganizationOpenAIKey } from './openaiKeyService';

export interface GenerateOptions {
  organizationId?: mongoose.Types.ObjectId | string;
  [key: string]: any;
}

/**
 * Wraps a Mastra agent to track token usage
 * The wrapper intercepts generate() calls, tracks usage, and returns the original response
 */
export function wrapAgentWithTracking(agent: Agent, agentName: string): Agent {
  // update this to use the standard generate/generateLegacy methods too
  const originalGenerate = agent.generateLegacy.bind(agent);

  const shouldFallbackToDefaultKey = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const status = (error as any)?.status;
    return (
      status === 401 ||
      status === 403 ||
      status === 429 ||
      message.includes('invalid api key') ||
      message.includes('incorrect api key') ||
      message.includes('insufficient_quota') ||
      message.includes('quota') ||
      message.includes('authentication')
    );
  };

  const buildOptionsWithRuntimeContext = async (options: any) => {
    const providerOptions = options?.providerOptions || {};
    const openaiOptions = providerOptions.openai || {};
    const metadata = openaiOptions.metadata || {};
    const runtimeContext = options?.runtimeContext || new RuntimeContext();

    let useCustomKey = false;
    if (metadata?.orgId) {
      const customKey = await getOrganizationOpenAIKey(metadata.orgId);
      if (customKey) {
        runtimeContext.set('openaiApiKey', customKey);
        useCustomKey = true;
      }
    }

    return {
      ...options,
      runtimeContext,
      providerOptions: {
        ...providerOptions,
        openai: {
          ...openaiOptions,
          metadata: {
            ...metadata,
            useCustomKey: useCustomKey ? 'true' : 'false',
          },
        },
      },
    };
  };

  // Create a new generate function that tracks usage
  agent.generateLegacy = async function (messages: any, options?: any): Promise<any> {
    const startTime = Date.now();
    const hydratedOptions = await buildOptionsWithRuntimeContext(options);
    const metadata = hydratedOptions?.providerOptions?.openai?.metadata || {};
    const evalCaptureId = metadata?.evalCaptureId;

    try {
      // Call the original generate function
      const response = await originalGenerate(messages, hydratedOptions);
      const latencyMs = Date.now() - startTime;

      // Extract organization ID from provider options metadata if available
      let organizationId: string | undefined;
      if (metadata?.orgId) {
        organizationId = metadata.orgId;
      }

      // Extract token usage from response
      const usage = response?.usage;
    
      if (usage && organizationId && metadata?.useCustomKey !== 'true') {
        const inputTokens = usage.promptTokens || 0;
        const outputTokens = usage.completionTokens || 0;

        // Record usage asynchronously (non-blocking)
        AIUsageTrackingService.recordUsage(
          organizationId,
          agentName,
          inputTokens,
          outputTokens
        ).catch((error) => {
          console.error(chalk.red(`[Mastra Wrapper] Failed to record usage for ${agentName}:`), error);
        });
      } else {
        if (!usage) {
          console.warn(chalk.yellow(`[Mastra Wrapper] No usage data in response for ${agentName}`));
        }
        if (!organizationId) {
          console.warn(chalk.yellow(`[Mastra Wrapper] No organization ID provided for ${agentName} call`));
        }
        if (metadata?.useCustomKey === 'true') {
          console.log(chalk.gray(`[Mastra Wrapper] Skipped usage tracking for ${agentName} (custom key)`));
        }
      }

      if (evalCaptureId) {
        const inputMessages = Array.isArray(messages)
          ? messages.map((message: any) => ({ role: message.role, content: message.content }))
          : [];
        const fullPrompt = inputMessages.map((message) => message.content).join('\n\n');

        await EvalCaptureService.recordExecution({
          captureId: evalCaptureId,
          fullPrompt,
          inputMessages,
          outputText: response?.text,
          parsedOutput: response?.object,
          usage: usage ? {
            inputTokens: usage.promptTokens || 0,
            outputTokens: usage.completionTokens || 0,
            totalTokens: (usage.promptTokens || 0) + (usage.completionTokens || 0),
          } : undefined,
          latencyMs,
          modelName: options?.model || metadata?.model,
        });
      }

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (metadata?.useCustomKey === 'true' && shouldFallbackToDefaultKey(error)) {
        console.warn(chalk.yellow(`[Mastra Wrapper] Custom key failed for ${agentName}, falling back to default key`));
        const fallbackOptions = {
          ...hydratedOptions,
          runtimeContext: (() => {
            const context = hydratedOptions.runtimeContext || new RuntimeContext();
            context.delete('openaiApiKey');
            return context;
          })(),
          providerOptions: {
            ...hydratedOptions.providerOptions,
            openai: {
              ...hydratedOptions.providerOptions?.openai,
              metadata: {
                ...metadata,
                useCustomKey: 'false',
              },
            },
          },
        };
        const fallbackResponse = await originalGenerate(messages, fallbackOptions);
        const fallbackUsage = fallbackResponse?.usage;
        const fallbackMetadata = fallbackOptions?.providerOptions?.openai?.metadata || {};
        const fallbackOrgId = fallbackMetadata?.orgId;

        if (fallbackUsage && fallbackOrgId) {
          const inputTokens = fallbackUsage.promptTokens || 0;
          const outputTokens = fallbackUsage.completionTokens || 0;
          AIUsageTrackingService.recordUsage(
            fallbackOrgId,
            agentName,
            inputTokens,
            outputTokens
          ).catch((trackingError) => {
            console.error(chalk.red(`[Mastra Wrapper] Failed to record usage for ${agentName}:`), trackingError);
          });
        }

        if (evalCaptureId) {
          const inputMessages = Array.isArray(messages)
            ? messages.map((message: any) => ({ role: message.role, content: message.content }))
            : [];
          const fullPrompt = inputMessages.map((message) => message.content).join('\n\n');

          await EvalCaptureService.recordExecution({
            captureId: evalCaptureId,
            fullPrompt,
            inputMessages,
            outputText: fallbackResponse?.text,
            parsedOutput: fallbackResponse?.object,
            usage: fallbackUsage ? {
              inputTokens: fallbackUsage.promptTokens || 0,
              outputTokens: fallbackUsage.completionTokens || 0,
              totalTokens: (fallbackUsage.promptTokens || 0) + (fallbackUsage.completionTokens || 0),
            } : undefined,
            latencyMs,
            modelName: fallbackOptions?.model || fallbackMetadata?.model,
          });
        }

        return fallbackResponse;
      }

      if (evalCaptureId) {
        const inputMessages = Array.isArray(messages)
          ? messages.map((message: any) => ({ role: message.role, content: message.content }))
          : [];
        const fullPrompt = inputMessages.map((message) => message.content).join('\n\n');

        await EvalCaptureService.recordExecution({
          captureId: evalCaptureId,
          fullPrompt,
          inputMessages,
          latencyMs,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      throw error;
    }
  };

  return agent;
}

/**
 * Wraps multiple agents with tracking
 */
export function wrapAgents(agents: Record<string, Agent>): Record<string, Agent> {
  const wrappedAgents: Record<string, Agent> = {};

  for (const [agentName, agent] of Object.entries(agents)) {
    wrappedAgents[agentName] = wrapAgentWithTracking(agent, agentName);
  }

  return wrappedAgents;
}

