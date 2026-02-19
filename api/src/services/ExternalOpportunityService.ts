import mongoose from 'mongoose';
import Prospect from '../models/Prospect';
import Opportunity from '../models/Opportunity';
import PipelineStage from '../models/PipelineStage';
import Pipeline from '../models/Pipeline';
import User from '../models/User';
import Contact from '../models/Contact';
import { normalizeDomains, isValidDomain } from '../utils/domain';
import { getDefaultPipeline } from './pipelineService';

interface CreatePayload {
  organizationId: string;
  pipelineId?: string; // Optional: specify a pipeline, defaults to org's default pipeline
  prospect: {
    name: string;
    domains: string[];
  };
  opportunity: {
    name: string;
    description?: string;
    amount: number;
    stageId?: string;
    stageName?: string;
    ownerId?: string;
    createdDate: string; // ISO date string
  };
}

export async function createProspectAndOpportunity(payload: CreatePayload) {
  const session = await mongoose.startSession();
  try {
    const organization = new mongoose.Types.ObjectId(payload.organizationId);
    const normalizedDomains = normalizeDomains(payload.prospect.domains).filter(isValidDomain);
    if (normalizedDomains.length === 0) {
      throw new Error('At least one valid domain is required');
    }

    const createdDate = new Date(payload.opportunity.createdDate);
    if (Number.isNaN(createdDate.getTime())) {
      throw new Error('Invalid createdDate');
    }

    // Resolve pipeline (use specified or default)
    let pipeline;
    if (payload.pipelineId) {
      pipeline = await Pipeline.findOne({
        _id: payload.pipelineId,
        organization,
      });
      if (!pipeline) {
        throw new Error('Specified pipeline not found or does not belong to organization');
      }
    } else {
      pipeline = await getDefaultPipeline(organization);
      if (!pipeline) {
        throw new Error('No pipeline found for organization');
      }
    }

    // Resolve stage within the pipeline
    let stageId: mongoose.Types.ObjectId | null = null;
    if (payload.opportunity.stageId) {
      const stage = await PipelineStage.findOne({
        _id: payload.opportunity.stageId,
        pipeline: pipeline._id,
      });
      if (!stage) throw new Error('Pipeline stage not found in the default pipeline');
      stageId = stage._id;
    } else if (payload.opportunity.stageName) {
      const stage = await PipelineStage.findOne({
        pipeline: pipeline._id,
        name: { $regex: new RegExp(`^${payload.opportunity.stageName}$`, 'i') },
      });
      if (!stage) throw new Error('Pipeline stage not found in the default pipeline');
      stageId = stage._id;
    } else {
      // Get the first stage (Lead) from the pipeline
      const stage = await PipelineStage.findOne({
        pipeline: pipeline._id,
        order: 1,
      });
      if (!stage) throw new Error('No stages found in pipeline');
      stageId = stage._id;
    }

    // Resolve owner
    let ownerId: mongoose.Types.ObjectId | null = null;
    if (payload.opportunity.ownerId) {
      const owner = await User.findOne({ _id: payload.opportunity.ownerId, organization });
      if (!owner) throw new Error('Owner not found');
      ownerId = owner._id as unknown as mongoose.Types.ObjectId;
    }

    let prospectDoc: any;
    let opportunityDoc: any;

    await session.withTransaction(async () => {
      // Find existing prospect by any domain
      prospectDoc = await Prospect.findOne({
        organization,
        domains: { $in: normalizedDomains },
      }).session(session);

      if (!prospectDoc) {
        prospectDoc = new Prospect({
          name: payload.prospect.name,
          domains: normalizedDomains,
          status: 'lead',
          organization,
          owner: ownerId || undefined,
        });
        await prospectDoc.save({ session });
      }

      // Load prospect contacts
      const contacts = await Contact.find({ prospect: prospectDoc._id, organization }).session(session);

      opportunityDoc = new Opportunity({
        name: payload.opportunity.name,
        description: payload.opportunity.description,
        amount: payload.opportunity.amount,
        stage: stageId!,
        pipeline: pipeline._id,
        probability: 50,
        expectedCloseDate: new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        prospect: prospectDoc._id,
        contacts: contacts.map((c) => c._id),
        organization,
        createdBy: ownerId || undefined,
        owner: ownerId || undefined,
        opportunityStartDate: createdDate,
      });
      await opportunityDoc.save({ session });

      // Link prospect and contacts to opportunity
      if (contacts && contacts.length > 0) {
        await Contact.updateMany(
          { _id: { $in: contacts.map((c) => c._id) }, organization },
          { $addToSet: { opportunities: opportunityDoc._id } },
          { session }
        );
      }

      await Prospect.findByIdAndUpdate(
        prospectDoc._id,
        { $addToSet: { opportunities: opportunityDoc._id } },
        { session }
      );
    });

    return { prospect: prospectDoc, opportunity: opportunityDoc };
  } finally {
    await session.endSession();
  }
}


