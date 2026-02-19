import mongoose, { ClientSession } from 'mongoose';
import SalesPlaybook from '../models/SalesPlaybook';
import { defaultSalesPlaybooks } from '../config/defaultSalesPlaybooks';

interface SeedDefaultSalesPlaybooksParams {
  organizationId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  session?: ClientSession;
}

/**
 * Seed default sales playbooks for a newly created organization.
 * This function is idempotent: it only inserts playbooks that don't already exist
 * for the given organization (matched by type + title).
 */
export async function seedDefaultSalesPlaybooks({
  organizationId,
  createdBy,
  session,
}: SeedDefaultSalesPlaybooksParams): Promise<void> {
  if (defaultSalesPlaybooks.length === 0) {
    return;
  }

  // Build a list of (type, title) pairs to check for existing playbooks
  const typeAndTitlePairs = defaultSalesPlaybooks.map((p) => ({
    type: p.type,
    title: p.title,
  }));

  // Query existing playbooks for this org that match any of the default type+title combos
  const existingPlaybooks = await SalesPlaybook.find({
    organization: organizationId,
    $or: typeAndTitlePairs,
  })
    .select('type title')
    .session(session ?? null)
    .lean();

  // Build a Set of existing "type|title" for quick lookup
  const existingKeys = new Set(
    existingPlaybooks.map((p) => `${p.type}|${p.title}`)
  );

  // Filter to only playbooks that don't already exist
  const playbooksToInsert = defaultSalesPlaybooks.filter(
    (p) => !existingKeys.has(`${p.type}|${p.title}`)
  );

  if (playbooksToInsert.length === 0) {
    console.log(
      `No new default playbooks to seed for organization ${organizationId} (all already exist)`
    );
    return;
  }

  // Prepare documents for insertion
  const documents = playbooksToInsert.map((p) => ({
    type: p.type,
    title: p.title,
    content: p.content,
    contentSummary: p.contentSummary,
    tags: p.tags ?? [],
    keywords: p.keywords ?? [],
    useCase: p.useCase ?? '',
    usageCount: 0,
    files: [],
    organization: organizationId,
    createdBy,
  }));

  // Insert using session if provided (for transactional consistency)
  await SalesPlaybook.insertMany(documents, { session: session ?? undefined });

  console.log(
    `Seeded ${documents.length} default playbook(s) for organization ${organizationId}`
  );
}
