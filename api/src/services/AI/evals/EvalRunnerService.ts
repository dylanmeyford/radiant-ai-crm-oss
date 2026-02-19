import mongoose from 'mongoose';
import EvalDataset from '../../../models/EvalDataset';
import PromptTemplate, { IPromptTemplate } from '../../../models/PromptTemplate';
import { renderTemplate } from './TemplateRenderer';
import { mastra } from '../../../mastra';
import { NextBestActionsSchema, getSummariseActivityOutputSchema } from '../schemas';

export interface RunDatasetParams {
  organizationId: mongoose.Types.ObjectId | string;
  datasetId: string;
  agentName: string;
  templateVersion: string;
  outputSchema?: any;
  providerOptions?: Record<string, any>;
}

export interface RunDatasetResult {
  runId: string;
  prompt: string;
  outputText?: string;
  parsedOutput?: any;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  modelName?: string;
}

export interface RunDatasetVariantParams {
  runs: Array<{ _id: mongoose.Types.ObjectId | string; inputVariables?: Record<string, any> }>;
  template: IPromptTemplate;
  organizationId?: mongoose.Types.ObjectId | string;
  modelName?: string;
  outputSchema?: any;
  providerOptions?: Record<string, any>;
  concurrency?: number;
}

export class EvalRunnerService {
  private static async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    iterator: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    const worker = async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        results[current] = await iterator(items[current]);
      }
    };

    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  private static getOutputSchemaForAgent(agentName: string, run?: { inputVariables?: Record<string, any> }) {
    if (agentName === 'nextActionAgent') {
      return NextBestActionsSchema;
    }
    if (agentName === 'summariseActivityAgent') {
      return getSummariseActivityOutputSchema(run?.inputVariables?.activityType);
    }
    return undefined;
  }

  public static async runDatasetWithTemplate(params: RunDatasetParams): Promise<RunDatasetResult[]> {
    const orgId = typeof params.organizationId === 'string'
      ? new mongoose.Types.ObjectId(params.organizationId)
      : params.organizationId;

    const dataset = await EvalDataset.findOne({
      _id: params.datasetId,
      organization: orgId,
    }).populate('runIds');

    if (!dataset) {
      throw new Error('Eval dataset not found');
    }

    const template = await PromptTemplate.findOne({
      organization: orgId,
      agentName: params.agentName,
      version: params.templateVersion,
    });

    if (!template) {
      throw new Error('Prompt template not found');
    }

    const agent = mastra.getAgent(params.agentName as any);
    if (!agent) {
      throw new Error(`Agent ${params.agentName} not found`);
    }

    const results: RunDatasetResult[] = [];

    for (const run of dataset.runIds as any[]) {
      const prompt = renderTemplate(template.template, run.inputVariables || {});
      const startTime = Date.now();
      const response = await agent.generateLegacy(
        [{ role: 'user', content: prompt }],
        {
          ...(params.outputSchema ? { output: params.outputSchema } : {}),
          providerOptions: params.providerOptions,
        }
      );
      const latencyMs = Date.now() - startTime;

      results.push({
        runId: run._id.toString(),
        prompt,
        outputText: response?.text,
        parsedOutput: response?.object,
        usage: response?.usage ? {
          inputTokens: response.usage.promptTokens || 0,
          outputTokens: response.usage.completionTokens || 0,
          totalTokens: (response.usage.promptTokens || 0) + (response.usage.completionTokens || 0),
        } : undefined,
        latencyMs,
      });
    }

    return results;
  }

  public static async runDatasetVariant(params: RunDatasetVariantParams): Promise<RunDatasetResult[]> {
    const agentName = params.template.agentName;
    const agent = mastra.getAgent(agentName as any);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }

    const modelName = params.modelName;
    const orgId = params.organizationId
      ? (typeof params.organizationId === 'string' ? params.organizationId : params.organizationId.toString())
      : undefined;
    const providerOptions = {
      ...(params.providerOptions || {}),
      openai: {
        ...(params.providerOptions?.openai || {}),
        ...(modelName ? { model: modelName } : {}),
        metadata: {
          ...(params.providerOptions?.openai?.metadata || {}),
          ...(orgId ? { orgId } : {}),
        },
      },
    };

    const concurrency = params.concurrency && params.concurrency > 0 ? params.concurrency : 1;

    return this.mapWithConcurrency(params.runs, concurrency, async (run) => {
      const outputSchema = params.outputSchema ?? this.getOutputSchemaForAgent(agentName, run);
      const prompt = renderTemplate(params.template.template, (run as any).inputVariables || {});
      const startTime = Date.now();
      const response = await agent.generateLegacy(
        [{ role: 'user', content: prompt }],
        {
          ...(outputSchema ? { output: outputSchema } : {}),
          providerOptions,
        }
      );
      const latencyMs = Date.now() - startTime;

      return {
        runId: (run as any)._id.toString(),
        prompt,
        outputText: response?.text,
        parsedOutput: response?.object,
        usage: response?.usage ? {
          inputTokens: response.usage.promptTokens || 0,
          outputTokens: response.usage.completionTokens || 0,
          totalTokens: (response.usage.promptTokens || 0) + (response.usage.completionTokens || 0),
        } : undefined,
        latencyMs,
        modelName,
      };
    });
  }
}
