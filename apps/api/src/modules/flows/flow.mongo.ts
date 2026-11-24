import type { CreateFlowInput, Flow, Step, UpdateFlowInput } from "@flowlet/shared";
import { ObjectId, type Collection, type Db } from "mongodb";
import { generateWebhookSecret, type FlowListItem, type FlowRepository } from "./flow.repository";

/** The shape of a document in the `flows` collection. */
export interface FlowDocument {
  _id: ObjectId;
  name: string;
  description: string | null;
  enabled: boolean;
  steps: Step[];
  webhookSecret: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What the list projection returns: no steps, no secret, a computed step count. */
interface FlowListRow {
  _id: ObjectId;
  name: string;
  description: string | null;
  enabled: boolean;
  stepCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type EditableField = "name" | "description" | "enabled" | "steps";

export const FLOWS_COLLECTION = "flows";

/**
 * Index for the flow list: find({}).sort({ createdAt: -1, _id: -1 }).limit(n).
 * The sort walks this index, so MongoDB never sorts in memory and stops after n entries.
 * _id breaks ties between flows created in the same millisecond.
 */
export async function ensureFlowIndexes(db: Db): Promise<string[]> {
  const name = await db
    .collection<FlowDocument>(FLOWS_COLLECTION)
    .createIndex({ createdAt: -1, _id: -1 }, { name: "flows_created_desc" });
  return [name];
}

/** A 24-character hex string is the only id form we accept. */
function toObjectId(id: string): ObjectId | null {
  return /^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : null;
}

function toFlow(doc: FlowDocument): Flow {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    description: doc.description,
    enabled: doc.enabled,
    steps: doc.steps,
    webhookSecret: doc.webhookSecret,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class MongoFlowRepository implements FlowRepository {
  private readonly flows: Collection<FlowDocument>;

  constructor(db: Db) {
    this.flows = db.collection<FlowDocument>(FLOWS_COLLECTION);
  }

  async create(input: CreateFlowInput): Promise<Flow> {
    const now = new Date();
    const doc: FlowDocument = {
      _id: new ObjectId(),
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled,
      steps: input.steps,
      webhookSecret: generateWebhookSecret(),
      createdAt: now,
      updatedAt: now,
    };
    await this.flows.insertOne(doc);
    return toFlow(doc);
  }

  async list(limit: number): Promise<FlowListItem[]> {
    const rows = await this.flows
      .find<FlowListRow>(
        {},
        {
          // Projection: steps and webhookSecret never leave the database for the list.
          projection: {
            name: 1,
            description: 1,
            enabled: 1,
            createdAt: 1,
            updatedAt: 1,
            stepCount: { $size: "$steps" },
          },
        },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    return rows.map((row) => ({
      id: row._id.toHexString(),
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      stepCount: row.stepCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async findById(id: string): Promise<Flow | null> {
    const _id = toObjectId(id);
    if (!_id) return null;
    const doc = await this.flows.findOne({ _id });
    return doc ? toFlow(doc) : null;
  }

  async update(id: string, patch: UpdateFlowInput): Promise<Flow | null> {
    const _id = toObjectId(id);
    if (!_id) return null;

    // Only the fields that were sent are changed. The type leaves out _id,
    // webhookSecret and createdAt, so an update can never touch them.
    const set: Partial<Pick<FlowDocument, EditableField>> & { updatedAt: Date } = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.enabled !== undefined) set.enabled = patch.enabled;
    if (patch.steps !== undefined) set.steps = patch.steps;

    const doc = await this.flows.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" });
    return doc ? toFlow(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const _id = toObjectId(id);
    if (!_id) return false;
    const result = await this.flows.deleteOne({ _id });
    return result.deletedCount === 1;
  }
}
