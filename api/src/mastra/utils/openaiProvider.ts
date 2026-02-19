import { createOpenAI, openai as defaultOpenAI } from '@ai-sdk/openai';
import type { RuntimeContext } from '@mastra/core/runtime-context';

function resolveOpenAI(runtimeContext?: RuntimeContext): { provider: typeof defaultOpenAI; useCustomKey: boolean } {
  const apiKey = runtimeContext?.get?.('openaiApiKey');

  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    return {
      provider: createOpenAI({ apiKey }),
      useCustomKey: true,
    };
  }

  return {
    provider: defaultOpenAI,
    useCustomKey: false,
  };
}

export function getOpenAIResponsesModel(modelName: string) {
  return ({ runtimeContext }: { runtimeContext: RuntimeContext }) => {
    const { provider } = resolveOpenAI(runtimeContext);
    return provider.responses(modelName);
  };
}

export function getOpenAIChatModel(modelName: string) {
  return ({ runtimeContext }: { runtimeContext: RuntimeContext }) => {
    const { provider } = resolveOpenAI(runtimeContext);
    return provider(modelName);
  };
}

export function getOpenAIWebSearchTools(options: Record<string, any> = {}) {
  return ({ runtimeContext }: { runtimeContext: RuntimeContext }) => {
    const { provider } = resolveOpenAI(runtimeContext);
    return {
      web_search_preview: provider.tools.webSearchPreview(options) as any,
    };
  };
}
