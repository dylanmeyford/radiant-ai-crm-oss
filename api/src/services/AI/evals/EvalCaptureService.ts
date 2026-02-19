import mongoose from 'mongoose';
import EvalRun, { EvalRunStatus } from '../../../models/EvalRun';

export interface StartCaptureParams {
  organizationId: mongoose.Types.ObjectId | string;
  agentName: string;
  inputVariables: Record<string, any>;
  promptTemplateId?: mongoose.Types.ObjectId | string;
  promptTemplateVersion?: string;
  metadata?: Record<string, any>;
  samplingRate?: number;
}

export interface RecordExecutionParams {
  captureId: string;
  fullPrompt: string;
  inputMessages: Array<{ role: string; content: string }>;
  outputText?: string;
  parsedOutput?: any;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  modelName?: string;
  error?: string;
}

export class EvalCaptureService {
  private static shouldSample(samplingRate?: number): boolean {
    const envRateRaw = Number(process.env.EVAL_CAPTURE_SAMPLE_RATE ?? '1');
    const envRate = Number.isFinite(envRateRaw) ? envRateRaw : 1;
    const rate = typeof samplingRate === 'number' && Number.isFinite(samplingRate)
      ? samplingRate
      : envRate;
    if (rate >= 1) {
      return true;
    }
    if (rate <= 0) {
      return false;
    }
    return Math.random() < rate;
  }

  public static async startCapture(params: StartCaptureParams): Promise<string | null> {
    if (!this.shouldSample(params.samplingRate)) {
      return null;
    }

    const orgId = typeof params.organizationId === 'string'
      ? new mongoose.Types.ObjectId(params.organizationId)
      : params.organizationId;

    const promptTemplateId = params.promptTemplateId
      ? (typeof params.promptTemplateId === 'string'
        ? new mongoose.Types.ObjectId(params.promptTemplateId)
        : params.promptTemplateId)
      : undefined;

    const run = await EvalRun.create({
      organization: orgId,
      agentName: params.agentName,
      status: 'pending' as EvalRunStatus,
      inputVariables: params.inputVariables,
      promptTemplate: promptTemplateId,
      promptTemplateVersion: params.promptTemplateVersion,
      metadata: params.metadata,
    });

    return run.id;
  }

  public static async recordExecution(params: RecordExecutionParams): Promise<void> {
    if (!params.captureId) {
      return;
    }

    const status: EvalRunStatus = params.error ? 'failed' : 'completed';

    await EvalRun.findByIdAndUpdate(
      params.captureId,
      {
        status,
        fullPrompt: params.fullPrompt,
        inputMessages: params.inputMessages,
        outputText: params.outputText,
        parsedOutput: params.parsedOutput,
        usage: params.usage,
        latencyMs: params.latencyMs,
        modelName: params.modelName,
        error: params.error,
      },
      { new: true }
    );
  }

  public static async markExpectedOutput(
    runId: string,
    expectedOutput: any,
    expectedNotes?: string
  ): Promise<void> {
    await EvalRun.findByIdAndUpdate(runId, {
      expectedOutput,
      expectedNotes,
    });
  }
}
