import { Agent } from '@mastra/core/agent';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { getOrganizationOpenAIKey } from './openaiKeyService';

export const shouldFallbackToDefaultKey = (error: unknown): boolean => {
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

export async function applyOrgKeyToOptions(options: any) {
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
    options: {
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
    },
    useCustomKey,
  };
}

export async function executeWithOrgKeyFallback(
  agent: Agent,
  messages: any,
  options?: any
): Promise<any> {
  const { options: hydratedOptions, useCustomKey } = await applyOrgKeyToOptions(options);

  try {
    return await agent.generateLegacy(messages, hydratedOptions);
  } catch (error) {
    if (!useCustomKey || !shouldFallbackToDefaultKey(error)) {
      throw error;
    }

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
            ...hydratedOptions.providerOptions?.openai?.metadata,
            useCustomKey: 'false',
          },
        },
      },
    };

    return agent.generateLegacy(messages, fallbackOptions);
  }
}
