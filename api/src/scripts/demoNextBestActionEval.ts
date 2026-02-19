/**
 * Demo script to run NextBestActionAgent and verify eval capture.
 *
 * Run with:
 *   npx ts-node src/scripts/demoNextBestActionEval.ts <opportunityId?>
 *
 * Optionally set OPPORTUNITY_ID in the environment.
 */

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import connectDB from '../config/database';
import Opportunity from '../models/Opportunity';
import EvalRun from '../models/EvalRun';
import { ActionPipelineService } from '../services/AI/actionPipeline/ActionPipelineService';
import { NextBestActionAgent } from '../services/AI/actionPipeline/NextBestActionAgent';
dotenv.config({ path: path.resolve(__dirname, '../../.devcontainer/dev.env') });

async function run(): Promise<void> {
  try {
    await connectDB();

    const argOpportunityId = process.argv[2] || process.env.OPPORTUNITY_ID;
    let opportunity = null;

    if (argOpportunityId) {
      opportunity = await Opportunity.findById(argOpportunityId).populate('stage');
    }

    if (!opportunity) {
      opportunity = await Opportunity.findOne({})
        .sort({ updatedAt: -1 })
        .populate('stage');
    }

    if (!opportunity) {
      console.error('No opportunities found to run the demo.');
      process.exitCode = 1;
      return;
    }

    console.log(`[DEMO] Using opportunity ${opportunity._id.toString()}`);

    const context = await ActionPipelineService.triggerDecisionPhase(
      opportunity._id as mongoose.Types.ObjectId
    );

    const actions = await NextBestActionAgent.decideNextActions(context);

    console.log(`[DEMO] NextBestActionAgent returned ${actions.actions.length} action(s).`);

    const latestRun = await EvalRun.findOne({
      organization: context.opportunity.organization,
      agentName: 'nextActionAgent',
    }).sort({ createdAt: -1 });

    if (!latestRun) {
      console.warn('[DEMO] No eval run captured for nextActionAgent.');
      return;
    }

    const latestRunId = latestRun._id as mongoose.Types.ObjectId;
    console.log('[DEMO] Latest eval run captured:');
    console.log({
      id: latestRunId.toString(),
      status: latestRun.status,
      createdAt: latestRun.createdAt,
      modelName: latestRun.modelName,
      latencyMs: latestRun.latencyMs,
      usage: latestRun.usage,
    });
  } catch (error) {
    console.error('[DEMO] Demo run failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
