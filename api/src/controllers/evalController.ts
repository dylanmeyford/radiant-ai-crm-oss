import { Request, Response } from 'express';
import mongoose from 'mongoose';
import EvalRun from '../models/EvalRun';
import EvalDataset from '../models/EvalDataset';
import EvalExperiment from '../models/EvalExperiment';
import PromptTemplate from '../models/PromptTemplate';
import { EvalRunnerService } from '../services/AI/evals/EvalRunnerService';
import type { EvalScorerResult } from '../services/AI/evals/scorers';

export class EvalController {
  public static async getRuns(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { agentName, status, limit, skip } = req.query;
      const filters: any = { organization: user.organization };
      if (agentName) {
        filters.agentName = agentName;
      }
      if (status) {
        filters.status = status;
      }

      const limitValue = Math.min(parseInt(limit as string || '100', 10), 500);
      const skipValue = Math.max(parseInt(skip as string || '0', 10), 0);

      const [runs, total] = await Promise.all([
        EvalRun.find(filters)
          .sort({ createdAt: -1 })
          .skip(skipValue)
          .limit(limitValue),
        EvalRun.countDocuments(filters),
      ]);

      res.status(200).json({ success: true, data: { runs, total } });
    } catch (error) {
      console.error('Get eval runs error:', error);
      res.status(500).json({ success: false, message: 'Error fetching eval runs' });
    }
  }

  public static async getRunById(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { runId } = req.params;
      const run = await EvalRun.findOne({ _id: runId, organization: user.organization });

      if (!run) {
        res.status(404).json({ success: false, message: 'Eval run not found' });
        return;
      }

      res.status(200).json({ success: true, data: run });
    } catch (error) {
      console.error('Get eval run by id error:', error);
      res.status(500).json({ success: false, message: 'Error fetching eval run' });
    }
  }

  public static async deleteRun(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { runId } = req.params;

      // Check if the run is part of any dataset
      const datasetWithRun = await EvalDataset.findOne({
        organization: user.organization,
        runIds: runId,
      });

      if (datasetWithRun) {
        res.status(400).json({
          success: false,
          message: `Cannot delete run: it is part of dataset "${datasetWithRun.name}"`,
        });
        return;
      }

      const deleted = await EvalRun.findOneAndDelete({
        _id: runId,
        organization: user.organization,
      });

      if (!deleted) {
        res.status(404).json({ success: false, message: 'Eval run not found' });
        return;
      }

      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (error) {
      console.error('Delete eval run error:', error);
      res.status(500).json({ success: false, message: 'Error deleting eval run' });
    }
  }

  public static async getDatasets(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { agentName, limit, skip } = req.query;
      const filters: any = { organization: user.organization };
      if (agentName) {
        filters.agentName = agentName;
      }

      const limitValue = Math.min(parseInt((limit as string) || '50', 10), 200);
      const skipValue = Math.max(parseInt((skip as string) || '0', 10), 0);

      const [datasets, total] = await Promise.all([
        EvalDataset.find(filters)
          .sort({ createdAt: -1 })
          .skip(skipValue)
          .limit(limitValue),
        EvalDataset.countDocuments(filters),
      ]);

      res.status(200).json({ success: true, data: { datasets, total } });
    } catch (error) {
      console.error('Get eval datasets error:', error);
      res.status(500).json({ success: false, message: 'Error fetching eval datasets' });
    }
  }

  public static async getDatasetById(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { datasetId } = req.params;
      const dataset = await EvalDataset.findOne({
        _id: datasetId,
        organization: user.organization,
      }).populate('runIds');

      if (!dataset) {
        res.status(404).json({ success: false, message: 'Eval dataset not found' });
        return;
      }

      res.status(200).json({ success: true, data: dataset });
    } catch (error) {
      console.error('Get eval dataset by id error:', error);
      res.status(500).json({ success: false, message: 'Error fetching eval dataset' });
    }
  }

  public static async createDataset(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { name, description, agentName, runIds } = req.body;
      if (!name || !agentName || !Array.isArray(runIds)) {
        res.status(400).json({ success: false, message: 'name, agentName, and runIds are required' });
        return;
      }

      const eligibleRuns = await EvalRun.find({
        _id: { $in: runIds },
        organization: user.organization,
        expectedOutput: { $exists: true, $ne: null },
      }).select('_id');

      const eligibleIds = new Set(
        eligibleRuns.map((run) => (run as { _id: mongoose.Types.ObjectId })._id.toString())
      );
      const missingIds = runIds.filter((id: string) => !eligibleIds.has(id.toString()));

      if (missingIds.length > 0) {
        res.status(400).json({
          success: false,
          message: 'All runs in a dataset must have expected output set',
          data: { missingRunIds: missingIds },
        });
        return;
      }

      const dataset = await EvalDataset.create({
        organization: user.organization,
        name,
        description,
        agentName,
        runIds,
      });

      res.status(201).json({ success: true, data: dataset });
    } catch (error) {
      console.error('Create eval dataset error:', error);
      res.status(500).json({ success: false, message: 'Error creating eval dataset' });
    }
  }

  public static async updateDataset(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { datasetId } = req.params;
      const { name, description, runIds } = req.body;

      if (name === undefined && description === undefined && runIds === undefined) {
        res.status(400).json({
          success: false,
          message: 'At least one field (name, description, or runIds) is required',
        });
        return;
      }

      if (runIds !== undefined && !Array.isArray(runIds)) {
        res.status(400).json({ success: false, message: 'runIds must be an array' });
        return;
      }

      const existing = await EvalDataset.findOne({
        _id: datasetId,
        organization: user.organization,
      });

      if (!existing) {
        res.status(404).json({ success: false, message: 'Eval dataset not found' });
        return;
      }

      if (Array.isArray(runIds)) {
        const eligibleRuns = await EvalRun.find({
          _id: { $in: runIds },
          organization: user.organization,
          expectedOutput: { $exists: true, $ne: null },
        }).select('_id');

        const eligibleIds = new Set(
          eligibleRuns.map((run) => (run as { _id: mongoose.Types.ObjectId })._id.toString())
        );
        const missingIds = runIds.filter((id: string) => !eligibleIds.has(id.toString()));

        if (missingIds.length > 0) {
          res.status(400).json({
            success: false,
            message: 'All runs in a dataset must have expected output set',
            data: { missingRunIds: missingIds },
          });
          return;
        }
      }

      const updateFields: { name?: string; description?: string; runIds?: string[] } = {};
      if (name !== undefined) updateFields.name = name;
      if (description !== undefined) updateFields.description = description;
      if (runIds !== undefined) updateFields.runIds = runIds;

      const updated = await EvalDataset.findOneAndUpdate(
        { _id: datasetId, organization: user.organization },
        { $set: updateFields },
        { new: true }
      );

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Update eval dataset error:', error);
      res.status(500).json({ success: false, message: 'Error updating eval dataset' });
    }
  }

  public static async listTemplates(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { agentName } = req.query;
      const filters: any = { organization: user.organization };
      if (agentName) {
        filters.agentName = agentName;
      }

      const templates = await PromptTemplate.find(filters).sort({ createdAt: -1 });
      res.status(200).json({ success: true, data: templates });
    } catch (error) {
      console.error('List templates error:', error);
      res.status(500).json({ success: false, message: 'Error fetching templates' });
    }
  }

  public static async listScorers(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { agentName, activityType } = req.query;
      // Use require here to avoid ESM extension resolution issues under ts-node
      const { getScorerList } = require('../services/AI/evals/scorers');
      const scorers = getScorerList(
        typeof agentName === 'string' ? agentName : undefined,
        typeof activityType === 'string' ? activityType : undefined
      );

      res.status(200).json({ success: true, data: scorers });
    } catch (error) {
      console.error('List scorers error:', error);
      res.status(500).json({ success: false, message: 'Error fetching scorers' });
    }
  }

  public static async getExperiment(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { experimentId } = req.params;
      const experiment = await EvalExperiment.findOne({
        _id: experimentId,
        organization: user.organization,
      });

      if (!experiment) {
        res.status(404).json({ success: false, message: 'Eval experiment not found' });
        return;
      }

      res.status(200).json({ success: true, data: experiment });
    } catch (error) {
      console.error('Get eval experiment error:', error);
      res.status(500).json({ success: false, message: 'Error fetching eval experiment' });
    }
  }

  public static async getTemplateById(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { templateId } = req.params;
      const template = await PromptTemplate.findOne({
        _id: templateId,
        organization: user.organization,
      });

      if (!template) {
        res.status(404).json({ success: false, message: 'Prompt template not found' });
        return;
      }

      res.status(200).json({ success: true, data: template });
    } catch (error) {
      console.error('Get template by id error:', error);
      res.status(500).json({ success: false, message: 'Error fetching template' });
    }
  }

  public static async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { agentName, version, template, description } = req.body;
      if (!agentName || !version || !template) {
        res.status(400).json({ success: false, message: 'agentName, version, and template are required' });
        return;
      }

      const record = await PromptTemplate.create({
        organization: user.organization,
        agentName,
        version,
        template,
        description,
      });

      res.status(201).json({ success: true, data: record });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({ success: false, message: 'Error creating template' });
    }
  }

  public static async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { templateId } = req.params;
      const { version, template, description } = req.body;

      // Check at least one field is provided
      if (version === undefined && template === undefined && description === undefined) {
        res.status(400).json({
          success: false,
          message: 'At least one field (version, template, or description) is required',
        });
        return;
      }

      const existing = await PromptTemplate.findOne({
        _id: templateId,
        organization: user.organization,
      });

      if (!existing) {
        res.status(404).json({ success: false, message: 'Prompt template not found' });
        return;
      }

      // Build update object with only provided fields
      const updateFields: { version?: string; template?: string; description?: string } = {};
      if (version !== undefined) updateFields.version = version;
      if (template !== undefined) updateFields.template = template;
      if (description !== undefined) updateFields.description = description;

      const updated = await PromptTemplate.findOneAndUpdate(
        { _id: templateId, organization: user.organization },
        { $set: updateFields },
        { new: true }
      );

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({ success: false, message: 'Error updating template' });
    }
  }

  public static async activateTemplate(req: Request, res: Response): Promise<void> {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const user = (req as any).user;
        if (!user) {
          throw new Error('User not authenticated');
        }

        const { templateId } = req.params;
        const template = await PromptTemplate.findOne({
          _id: templateId,
          organization: user.organization,
        }).session(session);

        if (!template) {
          throw new Error('Template not found');
        }

        await PromptTemplate.updateMany(
          { organization: user.organization, agentName: template.agentName },
          { $set: { isActive: false } },
          { session }
        );

        template.isActive = true;
        await template.save({ session });
      });

      res.status(200).json({ success: true, data: { activated: true } });
    } catch (error) {
      console.error('Activate template error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Error activating template',
      });
    } finally {
      await session.endSession();
    }
  }

  public static async markGoldenRun(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { runId } = req.params;
      const { expectedOutput, expectedNotes } = req.body;

      const existing = await EvalRun.findOne({ _id: runId, organization: user.organization });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Eval run not found' });
        return;
      }
      if (existing.expectedOutput) {
        res.status(409).json({ success: false, message: 'Expected output is already set and cannot be modified' });
        return;
      }

      const updated = await EvalRun.findOneAndUpdate(
        { _id: runId, organization: user.organization },
        { expectedOutput, expectedNotes },
        { new: true }
      );

      if (!updated) {
        res.status(404).json({ success: false, message: 'Eval run not found' });
        return;
      }

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Mark golden run error:', error);
      res.status(500).json({ success: false, message: 'Error updating eval run' });
    }
  }

  public static async runExperiment(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { datasetId, variants, scorers, concurrency, name } = req.body;
      if (!datasetId || !Array.isArray(variants) || variants.length === 0) {
        res.status(400).json({ success: false, message: 'datasetId and variants are required' });
        return;
      }

      const dataset = await EvalDataset.findOne({
        _id: datasetId,
        organization: user.organization,
      }).populate('runIds');

      if (!dataset) {
        res.status(404).json({ success: false, message: 'Eval dataset not found' });
        return;
      }

      const runs = dataset.runIds as any[];
      if (runs.length === 0) {
        res.status(400).json({ success: false, message: 'Dataset has no runs to evaluate' });
        return;
      }

      const templatesById = new Map<string, any>();
      for (const variant of variants) {
        const { name: variantName, templateId } = variant || {};
        if (!variantName || !templateId) {
          res.status(400).json({ success: false, message: 'Each variant requires name and templateId' });
          return;
        }

        const template = await PromptTemplate.findOne({
          _id: templateId,
          organization: user.organization,
        });

        if (!template) {
          res.status(404).json({ success: false, message: `Template not found: ${templateId}` });
          return;
        }

        if (template.agentName !== dataset.agentName) {
          res.status(400).json({
            success: false,
            message: `Template agent (${template.agentName}) does not match dataset agent (${dataset.agentName})`,
          });
          return;
        }

        templatesById.set(templateId.toString(), template);
      }

      const total = runs.length * variants.length;
      const experiment = await EvalExperiment.create({
        organization: user.organization,
        name: name || 'Experiment',
        datasetId,
        variants: variants.map((variant: any) => ({
          name: variant.name,
          templateId: variant.templateId,
          modelName: variant.modelName,
        })),
        scorers: Array.isArray(scorers) ? scorers : [],
        status: 'pending',
        progress: { current: 0, total, currentVariant: variants[0]?.name },
      });

      const experimentId = (experiment._id as mongoose.Types.ObjectId).toString();

      res.status(202).json({
        success: true,
        data: { experimentId },
      });

      setImmediate(async () => {
        try {
          await EvalExperiment.findByIdAndUpdate(experimentId, {
            status: 'running',
            progress: { current: 0, total, currentVariant: variants[0]?.name },
          });

          // Use require here to avoid ESM extension resolution issues under ts-node
          const { scorerRegistry } = require('../services/AI/evals/scorers');
          const scorerNames = Array.isArray(scorers) && scorers.length > 0
            ? scorers.filter((scorerName: string) => scorerRegistry[scorerName])
            : [];

          const variantResults: Record<string, any> = {};
          const variantScores: Record<string, number> = {};
          let progressCurrent = 0;

          for (const variant of variants) {
            const { name: variantName, templateId, modelName } = variant || {};
            const template = templatesById.get(templateId.toString());

            const results = await EvalRunnerService.runDatasetVariant({
              runs,
              template,
              organizationId: user.organization,
              modelName,
              concurrency,
            });

            const scoresByScorer: Record<string, number[]> = {};
            const perRun: Array<{
              runId: string;
              expectedOutput: any;
              output: any;
              scores: Record<string, EvalScorerResult>;
            }> = [];

            for (const result of results) {
              const run = runs.find((r: any) => r._id.toString() === result.runId);
              const expectedOutput = run?.expectedOutput;
              const output = result.parsedOutput;
              const runScores: Record<string, EvalScorerResult> = {};

              for (const scorerName of scorerNames) {
                const scorerEntry = scorerRegistry[scorerName];
                const orgId = typeof user.organization === 'string' ? user.organization : user.organization?.toString();
                const scorerResult = await scorerEntry.scorer({ expected: expectedOutput, output, orgId });
                const scoreValue = typeof scorerResult.score === 'number' ? scorerResult.score : 0;
                runScores[scorerName] = scorerResult;
                if (!scoresByScorer[scorerName]) {
                  scoresByScorer[scorerName] = [];
                }
                scoresByScorer[scorerName].push(scoreValue);
              }

              perRun.push({
                runId: result.runId,
                expectedOutput,
                output,
                scores: runScores,
              });

              progressCurrent += 1;
              await EvalExperiment.findByIdAndUpdate(experimentId, {
                progress: { current: progressCurrent, total, currentVariant: variantName },
              });
            }

            const avgScores: Record<string, number> = {};
            for (const scorerName of scorerNames) {
              const values = scoresByScorer[scorerName] || [];
              avgScores[scorerName] = values.length
                ? values.reduce((a, b) => a + b, 0) / values.length
                : 0;
            }

            const avgLatency = results.length
              ? results.reduce((a, b) => a + b.latencyMs, 0) / results.length
              : 0;

            const avgTokens = results.length
              ? results.reduce((a, b) => a + (b.usage?.totalTokens || 0), 0) / results.length
              : 0;

            const overallScore = Object.values(avgScores).length
              ? Object.values(avgScores).reduce((a, b) => a + b, 0) / Object.values(avgScores).length
              : 0;

            variantScores[variantName] = overallScore;

            variantResults[variantName] = {
              avgScores,
              avgLatency,
              avgTokens,
              perRun,
              modelName: modelName || undefined,
              templateId: templateId,
            };
          }

          const winner = Object.keys(variantScores).sort((a, b) => variantScores[b] - variantScores[a])[0] || null;

          await EvalExperiment.findByIdAndUpdate(experimentId, {
            status: 'completed',
            results: variantResults,
            comparison: { winner },
            progress: { current: total, total },
            error: undefined,
          });
        } catch (error) {
          await EvalExperiment.findByIdAndUpdate(experimentId, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Experiment failed',
          });
        }
      });
    } catch (error) {
      console.error('Run experiment error:', error);
      res.status(500).json({ success: false, message: 'Error running experiment' });
    }
  }
}
